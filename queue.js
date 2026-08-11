import { ActivityType, ChannelType, EmbedBuilder, PermissionsBitField } from "discord.js";
import { ids, ticketTypes } from "./config.js";

const ticketPatterns = Object.fromEntries(Object.keys(ticketTypes).map(type => [type, new RegExp(`^${type}-(\\d+)(?:-.+)?$`, "i")]));

function ordinal(n) {
  const suffixes = ["th", "st", "nd", "rd"];
  const value = n % 100;
  return n + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]);
}

function getTicketNumber(channelName, type) {
  const match = channelName.match(ticketPatterns[type]);
  return match ? parseInt(match[1], 10) : 999999;
}

async function getTicketOwner(channel, guild, client) {
  const overwrites = channel.permissionOverwrites.cache.filter(overwrite =>
    overwrite.type === 1 &&
    overwrite.allow.has(PermissionsBitField.Flags.ViewChannel) &&
    overwrite.id !== client.user.id
  );

  for (const overwrite of overwrites.values()) {
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
  const lines = [];
  for (let i = 0; i < sortedChannels.length; i++) {
    const owner = await getTicketOwner(sortedChannels[i], guild, client);
    lines.push(`**${ordinal(i + 1)}** **${owner}** — ${sortedChannels[i].name}`);
  }

  return `__**${label} Queue**__\n${lines.join("\n")}`;
}

export async function updateQueueList(client) {
  if (!ids.guild || !ids.queueChannel) return;

  try {
    const guild = await client.guilds.fetch(ids.guild);
    const channels = await guild.channels.fetch();
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

    const sections = [];
    for (const type of Object.keys(ticketTypes)) sections.push(await buildQueueSection(type, grouped[type], guild, client));

    const embed = new EmbedBuilder()
      .setTitle("📋 Commission Queue")
      .setDescription(`${descriptionHeader}\n\n**Total Active Tickets:** ${total}\n\n${sections.join("\n\n")}`)
      .setColor(0x00008B)
      .setTimestamp();

    const queueChannel = await guild.channels.fetch(ids.queueChannel);
    if (!queueChannel?.isTextBased()) return;

    const messages = await queueChannel.messages.fetch({ limit: 20 });
    const existingMessage = messages.find(message => message.author.id === client.user.id);
    if (existingMessage) await existingMessage.edit({ embeds: [embed] });
    else await queueChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error updating queue:", error.message);
  }
}

export function registerQueueEvents(client) {
  client.on("channelCreate", () => updateQueueList(client));
  client.on("channelDelete", () => updateQueueList(client));
  client.on("channelUpdate", () => updateQueueList(client));
}
