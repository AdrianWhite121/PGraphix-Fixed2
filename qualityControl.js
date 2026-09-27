import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, ModalBuilder, OverwriteType, PermissionFlagsBits, TextInputBuilder, TextInputStyle } from "discord.js";
import { ids } from "./config.js";
import { hasStaffRole, hasQualityRole, replySafe } from "./permissions.js";
import { closeTicket } from "./tickets.js";

const questions = ["What type of product", "What is product", "Any other notes"];
let creationQueue = Promise.resolve();
const decisionsInProgress = new Set();
const canOpen = member => hasStaffRole(member) || hasQualityRole(member);
const privateReply = (interaction, content) => replySafe(interaction, { content, flags: MessageFlags.Ephemeral });

export async function ensureQualityPanel(client) {
  const channel = await client.channels.fetch(ids.qualityPanelChannel);
  if (channel?.type !== ChannelType.GuildText) throw new Error("Quality control panel channel is not a text channel.");
  const payload = {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle("Quality Control Requests")
      .setDescription("Open a ticket to submit a quality control request. Do this before delivering the final product unless told otherwise.")],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("qc_open").setLabel("Open").setStyle(ButtonStyle.Primary))]
  };
  // Find the existing panel across channel history so restarts do not duplicate it.
  let before;
  while (true) {
    const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    const panel = messages.find(message => message.author.id === client.user.id && message.components.some(row => row.components.some(component => component.customId === "qc_open")));
    if (panel) { await panel.edit(payload); return; }
    if (messages.size < 100) break;
    before = messages.last().id;
  }
  await channel.send(payload);
}

function controls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("qc_approve").setLabel("APPROVE").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("qc_deny").setLabel("DENY").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("qc_close").setLabel("CLOSE").setStyle(ButtonStyle.Secondary)
  );
}

export async function handleQualityButton(interaction, client) {
  if (interaction.customId === "qc_open") {
    if (!canOpen(interaction.member)) return privateReply(interaction, "Only staff can open a quality control request.");
    if (interaction.channelId !== ids.qualityPanelChannel) return privateReply(interaction, "Please use the quality control panel.");
    return interaction.showModal(new ModalBuilder().setCustomId("qc_submit").setTitle("Quality Control Request")
      .addComponents(...questions.map((label, index) => new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId(`qc_answer_${index}`).setLabel(label).setStyle(index === 0 ? TextInputStyle.Short : TextInputStyle.Paragraph)
        .setRequired(index !== 2).setMaxLength(1024)))));
  }
  if (!hasQualityRole(interaction.member)) return privateReply(interaction, "Only Quality Control Management can use these buttons.");
  const channel = interaction.channel;
  if (channel?.parentId !== ids.qualityCategory || !channel.topic?.startsWith("[QC:")) return privateReply(interaction, "This is not a quality control ticket.");
  if (decisionsInProgress.has(channel.id)) return privateReply(interaction, "An action is already in progress for this ticket.");
  decisionsInProgress.add(channel.id);
  try {
    if (interaction.customId === "qc_close") return await closeTicket(interaction, client);
    if (!["qc_approve", "qc_deny"].includes(interaction.customId)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const current = await channel.fetch();
    const number = current.topic.match(/^\[QC:(\d+)\]/)?.[1];
    if (!number) return privateReply(interaction, "The ticket number could not be found.");
    if (/^(approved|denied)-/.test(current.name)) return privateReply(interaction, "This request has already been reviewed.");
    const approved = interaction.customId === "qc_approve";
    await current.setName(`${approved ? "approved" : "denied"}-${number}`, `Quality control review by ${interaction.user.tag}`);
    await current.send({ embeds: [new EmbedBuilder().setColor(approved ? 0x57F287 : 0xED4245)
      .setTitle(approved ? "Quality Control Approved" : "Quality Control Denied")
      .setDescription(`${interaction.user} ${approved ? "approved" : "denied"} this quality control request.`).setTimestamp()] });
    await privateReply(interaction, approved ? "Request approved." : "Request denied.");
  } finally { decisionsInProgress.delete(channel.id); }
}

export async function handleQualitySubmit(interaction, client) {
  if (!canOpen(interaction.member)) return privateReply(interaction, "Only staff can open a quality control request.");
  if (interaction.channelId !== ids.qualityPanelChannel) return privateReply(interaction, "Please use the quality control panel.");
  const answers = questions.map((name, index) => ({ name, value: interaction.fields.getTextInputValue(`qc_answer_${index}`).trim() || "None" }));
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const task = creationQueue.then(() => createQualityTicket(interaction, client, answers));
  creationQueue = task.catch(() => {});
  return task;
}

async function createQualityTicket(interaction, client, answers) {
  const guild = interaction.guild;
  const category = await guild.channels.fetch(ids.qualityCategory);
  if (category?.type !== ChannelType.GuildCategory) throw new Error("Quality control category was not found.");
  const role = await guild.roles.fetch(ids.qualityManagementRole);
  if (!role) throw new Error(`Quality Control Management role ${ids.qualityManagementRole} was not found.`);
  const channels = await guild.channels.fetch();
  const numbers = [...channels.values()].filter(channel => channel?.parentId === category.id)
    .map(channel => Number(channel.topic?.match(/^\[QC:(\d+)\]/)?.[1] || channel.name.match(/^(?:quality|approved|denied)-(\d+)$/)?.[1] || 0));
  const number = String(Math.max(0, ...numbers) + 1).padStart(2, "0");
  const access = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
  const channel = await guild.channels.create({
    name: `quality-${number}`, type: ChannelType.GuildText, parent: category.id,
    topic: `[QC:${number}] Quality control opened by ${interaction.user.tag} (${interaction.user.id})`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, type: OverwriteType.Member, allow: access },
      { id: role.id, type: OverwriteType.Role, allow: access },
      { id: client.user.id, type: OverwriteType.Member, allow: [...access, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MentionEveryone] }
    ]
  });
  const message = await channel.send({
    content: `${interaction.user} <@&${role.id}>`, allowedMentions: { users: [interaction.user.id], roles: [role.id] },
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`Quality Control Request #${number}`)
      .addFields({ name: "Submitted By", value: `${interaction.user}` }, ...answers).setTimestamp()], components: [controls()]
  });
  let pinNote = "";
  await message.pin().catch(error => { console.error("Quality control pin failed:", error); pinNote = " The opening message could not be pinned; check the bot's Manage Messages permission."; });
  await privateReply(interaction, `Created your quality control ticket: ${channel}.${pinNote}`);
}
