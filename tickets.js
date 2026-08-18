import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  MessageFlags
} from "discord.js";
import { ids, ticketTypes } from "./config.js";
import { hasStaffRole, replySafe } from "./permissions.js";
import { updateQueueList } from "./queue.js";


const CLAIM_MARKER_REGEX = /\s*\[CLAIMED_BY:(\d+)\]\s*$/i;
const NUMBERED_CHANNEL_REGEX = /^(.+?)-(\d+)(?:-(.+))?$/i;

function sanitizeChannelPart(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "") || "artist";
}

function getTicketTypeFromCategory(channel) {
  return Object.entries(ticketTypes).find(([, config]) => config.categoryId === channel?.parentId)?.[0] || null;
}

function getClaimSuffix(channelName) {
  return channelName?.match(NUMBERED_CHANNEL_REGEX)?.[3] || null;
}

function removeClaimSuffix(channelName) {
  const match = channelName?.match(NUMBERED_CHANNEL_REGEX);
  return match ? `${match[1]}-${match[2]}` : channelName;
}

function formatSequenceNumber(number, existingWidths = []) {
  const width = Math.max(2, ...existingWidths, String(number).length);
  return String(number).padStart(width, "0");
}

function getClaimedUserId(channel) {
  return channel?.topic?.match(CLAIM_MARKER_REGEX)?.[1] || null;
}

function canManageTickets(interaction) {
  return hasStaffRole(interaction.member) || interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
}

export async function claimTicket(interaction) {
  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    return replySafe(interaction, { content: "This command can only be used inside a ticket channel.", ephemeral: true });
  }

  if (!canManageTickets(interaction)) {
    return replySafe(interaction, { content: "Only staff or moderators can claim tickets.", ephemeral: true });
  }

  const claimedUserId = getClaimedUserId(channel);
  if (claimedUserId) {
    if (claimedUserId === interaction.user.id) {
      return replySafe(interaction, { content: "You have already claimed this ticket.", ephemeral: true });
    }

    return replySafe(interaction, {
      content: `This ticket has already been claimed by <@${claimedUserId}>.`,
      ephemeral: true
    });
  }

  await interaction.deferReply();

  const baseTopic = (channel.topic || "Ticket").replace(CLAIM_MARKER_REGEX, "").trim();
  const artistName = sanitizeChannelPart(interaction.user.username);
  const unclaimedName = removeClaimSuffix(channel.name);
  const claimedName = `${unclaimedName}-${artistName}`.slice(0, 100);

  await channel.setTopic(`${baseTopic} [CLAIMED_BY:${interaction.user.id}]`, `Ticket claimed by ${interaction.user.tag}`);
  if (channel.name !== claimedName) {
    await channel.setName(claimedName, `Ticket claimed by ${interaction.user.tag}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle("Ticket Claimed")
    .setDescription(`${interaction.user} has claimed this ticket and will assist you.`)
    .setTimestamp();

  return replySafe(interaction, { embeds: [embed] });
}

export async function unclaimTicket(interaction) {
  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    return replySafe(interaction, { content: "This command can only be used inside a ticket channel.", ephemeral: true });
  }

  if (!canManageTickets(interaction)) {
    return replySafe(interaction, { content: "Only staff or moderators can unclaim tickets.", ephemeral: true });
  }

  const claimedUserId = getClaimedUserId(channel);
  if (!claimedUserId) {
    return replySafe(interaction, { content: "This ticket is not currently claimed.", ephemeral: true });
  }

  await interaction.deferReply();

  const baseTopic = (channel.topic || "Ticket").replace(CLAIM_MARKER_REGEX, "").trim();
  await channel.setTopic(baseTopic || null, `Ticket unclaimed by ${interaction.user.tag}`);

  const unclaimedName = removeClaimSuffix(channel.name);
  if (channel.name !== unclaimedName) {
    await channel.setName(unclaimedName, `Ticket unclaimed by ${interaction.user.tag}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle("Ticket Unclaimed")
    .setDescription(`${interaction.user} released this ticket. It is available for another staff member.`)
    .setTimestamp();

  return replySafe(interaction, { embeds: [embed] });
}

export function ticketMenuRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_select")
      .setPlaceholder("Please select from the following")
      .addOptions(Object.entries(ticketTypes).map(([value, data]) => ({ label: data.label, value, emoji: data.emoji })))
  );
}

export function closeTicketRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Close Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
  );
}

export function isTicketChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  return Object.values(ticketTypes).some(type => type.categoryId === channel.parentId);
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getNextNumberedChannel(guild, parentId, prefix, suffix = null, excludeChannelId = null) {
  // Force a fresh guild channel fetch so the sequence is based on the names
  // that currently exist in this exact ticket category.
  const channels = await guild.channels.fetch();
  const matches = [];
  const widths = [];
  const pattern = new RegExp(`^${escapeRegex(prefix)}-(\\d+)(?:-.+)?$`, "i");

  for (const channel of channels.values()) {
    if (!channel || channel.id === excludeChannelId || channel.parentId !== parentId) continue;

    const match = channel.name?.match(pattern);
    if (!match) continue;

    const number = Number.parseInt(match[1], 10);
    if (!Number.isSafeInteger(number)) continue;

    matches.push({ channel, number });
    widths.push(match[1].length);
  }

  const highest = matches.reduce(
    (currentHighest, entry) => (!currentHighest || entry.number > currentHighest.number ? entry : currentHighest),
    null
  );
  const next = (highest?.number ?? 0) + 1;
  const baseName = `${prefix}-${formatSequenceNumber(next, widths)}`;

  return {
    name: suffix ? `${baseName}-${suffix}`.slice(0, 100) : baseName,
    highestChannel: highest?.channel || null
  };
}

async function nextNumberedName(guild, parentId, prefix, suffix = null) {
  return (await getNextNumberedChannel(guild, parentId, prefix, suffix)).name;
}

async function nextTicketName(guild, type, parentId) {
  return nextNumberedName(guild, parentId, type);
}

export async function changeTicketStatus(interaction, status) {
  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    return replySafe(interaction, { content: "This command can only be used inside a ticket channel.", ephemeral: true });
  }

  if (!canManageTickets(interaction)) {
    return replySafe(interaction, { content: "Only staff or moderators can change ticket status.", ephemeral: true });
  }

  const ticketType = getTicketTypeFromCategory(channel);
  if (!ticketType) {
    return replySafe(interaction, { content: "I could not determine this ticket's active type.", ephemeral: true });
  }

  const prefix = status === "active" ? ticketType : status;
  const currentPrefix = channel.name.match(NUMBERED_CHANNEL_REGEX)?.[1]?.toLowerCase();
  if (currentPrefix === prefix.toLowerCase()) {
    return replySafe(interaction, { content: `This ticket is already marked ${status === "done" ? "complete" : status}.`, ephemeral: true });
  }

  await interaction.deferReply();

  const suffix = getClaimSuffix(channel.name);
  const destination = await getNextNumberedChannel(
    interaction.guild,
    channel.parentId,
    prefix,
    suffix,
    channel.id
  );

  await channel.setName(destination.name, `Ticket marked ${status} by ${interaction.user.tag}`);

  if (destination.highestChannel) {
    await channel.setPosition(destination.highestChannel.position + 1, {
      reason: `Ticket moved into ${status} sequence by ${interaction.user.tag}`
    });
  }

  const labels = { active: "Active", hold: "On Hold", done: "Complete" };
  const colors = { active: 0x5865F2, hold: 0xFEE75C, done: 0x57F287 };
  const embed = new EmbedBuilder()
    .setColor(colors[status])
    .setTitle(`Ticket Marked ${labels[status]}`)
    .setDescription(`${interaction.user} changed this ticket to **${labels[status]}**.`)
    .setTimestamp();

  return replySafe(interaction, { embeds: [embed] });
}

export async function renameChannel(interaction) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    return replySafe(interaction, { content: "This channel cannot be renamed.", ephemeral: true });
  }

  if (!canManageTickets(interaction)) {
    return replySafe(interaction, { content: "Only staff or moderators can rename channels.", ephemeral: true });
  }

  const requestedName = interaction.options.getString("name", true);
  const newName = sanitizeChannelPart(requestedName).slice(0, 100);

  if (channel.name === newName) {
    return replySafe(interaction, { content: `This channel is already named **${newName}**.`, ephemeral: true });
  }

  await interaction.deferReply();

  const oldName = channel.name;
  await channel.setName(newName, `Channel renamed by ${interaction.user.tag}`);
  return replySafe(interaction, { content: `Renamed **#${oldName}** to **#${newName}**.` });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchAllMessages(channel) {
  const messages = [];
  let before;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function createTranscript(channel) {
  const messages = await fetchAllMessages(channel);
  const rows = messages.map(message => {
    const attachments = [...message.attachments.values()]
      .map(file => `<div class="attachment"><a href="${escapeHtml(file.url)}">${escapeHtml(file.name || "Attachment")}</a></div>`)
      .join("");
    const embeds = message.embeds.length
      ? `<pre>${escapeHtml(JSON.stringify(message.embeds.map(embed => embed.toJSON()), null, 2))}</pre>`
      : "";

    return `<article class="message">
      <img class="avatar" src="${escapeHtml(message.author.displayAvatarURL({ extension: "png", size: 64 }))}" alt="">
      <div class="body">
        <div><strong>${escapeHtml(message.member?.displayName || message.author.username)}</strong> <span class="tag">${escapeHtml(message.author.tag)}</span> <time>${escapeHtml(message.createdAt.toISOString())}</time></div>
        <div class="content">${escapeHtml(message.content).replaceAll("\n", "<br>") || "<em>No text content</em>"}</div>
        ${attachments}${embeds}
      </div>
    </article>`;
  }).join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(channel.name)} Transcript</title>
<style>
body{margin:0;background:#313338;color:#dbdee1;font-family:Arial,sans-serif}.header{padding:24px;background:#2b2d31;border-bottom:1px solid #1e1f22}.wrap{max-width:1000px;margin:auto}.message{display:flex;gap:14px;padding:16px 24px}.message:hover{background:#2e3035}.avatar{width:40px;height:40px;border-radius:50%}.body{min-width:0;flex:1}.tag,time{color:#949ba4;font-size:12px}.content{margin-top:6px;line-height:1.45;word-break:break-word}.attachment a{color:#00a8fc}pre{white-space:pre-wrap;background:#1e1f22;padding:10px;border-radius:6px;overflow-wrap:anywhere}
</style></head><body><div class="header"><div class="wrap"><h1>#${escapeHtml(channel.name)}</h1><div>${messages.length} messages • Generated ${escapeHtml(new Date().toISOString())}</div><div>${escapeHtml(channel.topic || "No ticket topic")}</div></div></div><main class="wrap">${rows || "<p>No messages found.</p>"}</main></body></html>`;

  return new AttachmentBuilder(Buffer.from(html, "utf8"), { name: `${channel.name}-transcript.html` });
}

export async function closeTicket(interaction, client) {
  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    return replySafe(interaction, { content: "This command can only be used inside a ticket channel.", ephemeral: true });
  }

  const isOwner = channel.topic?.includes(`(${interaction.user.id})`);
  if (!hasStaffRole(interaction.member) && !isOwner) {
    return replySafe(interaction, { content: "Only staff or the ticket opener can close this ticket.", ephemeral: true });
  }

  await replySafe(interaction, { content: "Creating the transcript and closing this ticket..." });

  const transcriptChannel = await interaction.guild.channels.fetch(ids.ticketTranscriptChannel).catch(() => null);
  if (!transcriptChannel?.isTextBased()) {
    await interaction.followUp({ content: "The transcript channel could not be found, so this ticket was not deleted.", ephemeral: true }).catch(() => {});
    return;
  }

  try {
    const transcript = await createTranscript(channel);
    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle(`Ticket Closed: ${channel.name}`)
      .addFields(
        { name: "Closed By", value: `${interaction.user} (${interaction.user.tag})`, inline: true },
        { name: "Channel", value: `#${channel.name}`, inline: true },
        { name: "Ticket Topic", value: channel.topic || "None" }
      )
      .setTimestamp();

    await transcriptChannel.send({ embeds: [embed], files: [transcript] });
    await channel.delete(`Ticket closed by ${interaction.user.tag}`);
    await updateQueueList(client).catch(() => {});
  } catch (error) {
    console.error("Failed to close ticket:", error);
    await interaction.followUp({ content: `Could not close the ticket: ${error.message}`, ephemeral: true }).catch(() => {});
  }
}

export async function addUserToTicket(interaction) {
  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    return interaction.reply({ content: "This command can only be used inside a ticket channel.", ephemeral: true });
  }

  if (!hasStaffRole(interaction.member)) {
    return interaction.reply({ content: "Only staff can add users to tickets.", ephemeral: true });
  }

  const user = interaction.options.getUser("user", true);
  await channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true
  }, { reason: `Added to ticket by ${interaction.user.tag}` });

  await interaction.reply({ content: `${user} has been added to this ticket.` });
}

export async function postTicketMenu(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x00008B )
    .setTitle("Commission Tickets")
    .setDescription("To create a ticket use the menu below.")
    .setFooter({ text: "PG Studios" });

  await interaction.channel.send({ embeds: [embed], components: [ticketMenuRow()] });
  await interaction.reply({ content: "Ticket menu posted.", ephemeral: true });
}

export async function createTicket(interaction, client) {
  const type = interaction.values[0];
  const config = ticketTypes[type];
  if (!config) return replySafe(interaction, { content: "Unknown ticket type.", ephemeral: true });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const category = await guild.channels.fetch(config.categoryId).catch(() => null);
  if (!category) return replySafe(interaction, { content: "That ticket category could not be found.", ephemeral: true });

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
  ];

  for (const roleId of config.accessRoleIds) {
    overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] });
  }

  const name = await nextTicketName(guild, type, config.categoryId);
  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: config.categoryId,
    permissionOverwrites: overwrites,
    topic: `${config.label} opened by ${interaction.user.tag} (${interaction.user.id})`
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${config.emoji} ${config.label}`)
    .setDescription(`${interaction.user}, thank you for opening a ticket. Please explain what you need and staff will assist you.`)
    .addFields({ name: "Opened By", value: `${interaction.user}`, inline: true }, { name: "Ticket Type", value: config.label, inline: true })
    .setTimestamp();

  await channel.send({ content: `${interaction.user}`, embeds: [embed], components: [closeTicketRow()] });
  await replySafe(interaction, { content: `Created your ticket: ${channel}`, ephemeral: true });
  await updateQueueList(client);
}
