import { ActivityType, ChannelType, EmbedBuilder, PermissionsBitField } from "discord.js";
import { ids, ticketTypes } from "./config.js";

const ticketPatterns = Object.fromEntries(Object.keys(ticketTypes).map(type => [type, new RegExp(`^${type}-(\\d+)(?:-.+)?$`, "i")]));
const ticketCategoryIds = new Set(Object.values(ticketTypes).map(type => type.categoryId));
let updateInFlight = null;
let queuedUpdate = false;
let debounceTimer = null;

function ordinal(n) {
  const suffixes = ["th", "st", "nd", "rd"];
  const value = n % 100;
  return n + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]);
}

function getTicketNumber(channelName, type) {
  const match = channelName.match(ticketPatterns[type]);
  return match ? parseInt(match[1], 10) : 999999;
}

function getOwnerIdFromTopic(channel) {
  return channel.topic?.match(/opened by .*? \((\d+)\)/i)?.[1] || null;
}

async function getTicketOwner(channel, guild, client) {
  const topicOwnerId = getOwnerIdFromTopic(channel);
  if (topicOwnerId) {
    const cached = guild.members.cache.get(topicOwnerId);
    if (cached && !cached.user.bot) return cached.user.username;

    try {
      const member = await guild.members.fetch(topicOwnerId);
      if (!member.user.bot) return member.user.username;
    } catch {}
  }

  const overwrites = channel.permissionOverwrites.cache.filter(overwrite =>
    overwrite.type === 1 &&
    overwrite.allow.has(PermissionsBitField.Flags.ViewChannel) &&
    overwrite.id !== client.user.id
  );

  for (const overwrite of overwrites.values()) {
    const cached = guild.members.cache.get(overwrite.id);
    if (cached && !cached.user.bot && !cached.roles.cache.has(ids.staffRole)) return cached.user.username;

    try {
      const member = await guild.members.fetch(overwrite.id);
      if (!member.user.bot && !member.roles.cache.has(ids.staffRole)) return member.user.username;
    } catch {
      continue;
    }
  }

  return "Unknown User";
}

async function buildQueueSection(type, channels, guild, client) {
  const label = ticketTypes[type].queueLabel;
  if (!channels.length) return `__**${label} Queue**__\nNo active tickets.`;

  const sortedChannels = channels.sort((a, b) => getTicketNumber(a.name, type) - getTicketNumber(b.name, type));
  const owners = await Promise.all(sortedChannels.map(channel => getTicketOwner(channel, guild, client)));
  const lines = sortedChannels.map((channel, i) => `**${ordinal(i + 1)}** **${owners[i]}** — ${channel.name}`);

  return `__**${label} Queue**__\n${lines.join("\n")}`;
}

async function performQueueUpdate(client) {
  if (!ids.guild || !ids.queueChannel || !client.user) return;

  try {
    const guild = client.guilds.cache.get(ids.guild) || await client.guilds.fetch(ids.guild);
    const channels = guild.channels.cache.size ? guild.channels.cache : await guild.channels.fetch();
    const grouped = Object.fromEntries(Object.keys(ticketTypes).map(type => [type, []]));

    channels.forEach(channel => {
      if (!channel || channel.type !== ChannelType.GuildText) return;
      for (const [type, pattern] of Object.entries(ticketPatterns)) {
        if (pattern.test(channel.name)) grouped[type].push(channel);
      }
    });

    const total = Object.values(grouped).reduce((sum, channelsForType) => sum + channelsForType.length, 0);
    client.user.setPresence({ status: "online", activities: [{ name: `${total} Active Tickets`, type: ActivityType.Watching }] });

    const descriptionHeader = Object.entries(ticketTypes)
      .map(([type, config]) => `**${config.emoji} ${config.queueLabel}:** ${grouped[type].length}`)
      .join("\n");

    const sections = await Promise.all(Object.keys(ticketTypes).map(type => buildQueueSection(type, grouped[type], guild, client)));

    const embed = new EmbedBuilder()
      .setTitle("📋 Commission Queue")
      .setDescription(`${descriptionHeader}\n\n**Total Active Tickets:** ${total}\n\n${sections.join("\n\n")}`)
      .setColor(0x00008B)
      .setTimestamp();

    const queueChannel = guild.channels.cache.get(ids.queueChannel) || await guild.channels.fetch(ids.queueChannel);
    if (!queueChannel?.isTextBased()) return;

    const messages = await queueChannel.messages.fetch({ limit: 20 });
    const existingMessage = messages.find(message => message.author.id === client.user.id);
    if (existingMessage) await existingMessage.edit({ embeds: [embed] });
    else await queueChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error updating queue:", error);
  }
}

export async function updateQueueList(client) {
  if (updateInFlight) {
    queuedUpdate = true;
    return updateInFlight;
  }

  updateInFlight = performQueueUpdate(client);
  try {
    await updateInFlight;
  } finally {
    updateInFlight = null;
  }

  if (queuedUpdate) {
    queuedUpdate = false;
    return updateQueueList(client);
  }
}

function scheduleQueueUpdate(client, delayMs = 1200) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    updateQueueList(client).catch(error => console.error("Queued queue update failed:", error));
  }, delayMs);
  debounceTimer.unref?.();
}

function touchesTicketCategory(channel) {
  return Boolean(channel && (ticketCategoryIds.has(channel.parentId) || ticketCategoryIds.has(channel.id)));
}

export function registerQueueEvents(client) {
  client.on("channelCreate", channel => {
    if (touchesTicketCategory(channel)) scheduleQueueUpdate(client);
  });
  client.on("channelDelete", channel => {
    if (touchesTicketCategory(channel)) scheduleQueueUpdate(client);
  });
  client.on("channelUpdate", (oldChannel, newChannel) => {
    if (touchesTicketCategory(oldChannel) || touchesTicketCategory(newChannel)) scheduleQueueUpdate(client);
  });
}
