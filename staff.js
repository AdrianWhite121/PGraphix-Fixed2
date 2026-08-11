import { EmbedBuilder } from "discord.js";
import { ids } from "./config.js";
import { dataPath, readJson, writeJson } from "./jsonStore.js";

const WARN_FILE = dataPath("warnings.json");
const NOTE_FILE = dataPath("notes.json");

export const staffCommandNames = ["ban", "kick", "warn", "warnings", "timeout", "untimeout", "note", "notes"];

export function parseDuration(input) {
  if (!input) return null;
  const match = String(input).trim().match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000, m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000, h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000, d: 86400000, day: 86400000, days: 86400000 };
  return value * multipliers[unit];
}

export async function sendModLog(guild, embed) {
  if (!ids.modLogChannel) return;
  try {
    const channel = await guild.channels.fetch(ids.modLogChannel);
    if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
  } catch (error) {
    console.warn("Failed to send mod log:", error.message);
  }
}

export async function handleStaffCommand(interaction) {
  const command = interaction.commandName;
  const targetUser = interaction.options.getUser("user");
  const targetMember = targetUser ? await interaction.guild.members.fetch(targetUser.id).catch(() => null) : null;
  const reason = interaction.options.getString("reason") || "No reason provided";

  if (["kick", "timeout", "untimeout"].includes(command) && !targetMember) {
    return interaction.reply({ content: "That member could not be found in the server.", ephemeral: true });
  }

  if (command === "ban") {
    await interaction.guild.members.ban(targetUser.id, { reason });
    await interaction.reply({ content: `Banned ${targetUser.tag}.`, ephemeral: true });
  }

  if (command === "kick") {
    await targetMember.kick(reason);
    await interaction.reply({ content: `Kicked ${targetUser.tag}.`, ephemeral: true });
  }

  if (command === "timeout") {
    const ms = parseDuration(interaction.options.getString("duration", true));
    if (!ms || ms > 2419200000) return interaction.reply({ content: "Invalid duration. Use something like 10m, 2h, or 1d. Max is 28d.", ephemeral: true });
    await targetMember.timeout(ms, reason);
    await interaction.reply({ content: `Timed out ${targetUser.tag}.`, ephemeral: true });
  }

  if (command === "untimeout") {
    await targetMember.timeout(null, reason);
    await interaction.reply({ content: `Removed timeout from ${targetUser.tag}.`, ephemeral: true });
  }

  if (command === "warn") {
    const data = readJson(WARN_FILE);
    data[targetUser.id] ||= [];
    data[targetUser.id].push({ reason, moderatorId: interaction.user.id, at: new Date().toISOString() });
    writeJson(WARN_FILE, data);
    await interaction.reply({ content: `Warned ${targetUser.tag}.`, ephemeral: true });
  }

  if (command === "warnings") {
    const data = readJson(WARN_FILE)[targetUser.id] || [];
    const lines = data.length ? data.map((w, i) => `**${i + 1}.** ${w.reason} — <@${w.moderatorId}> — ${new Date(w.at).toLocaleString()}`).join("\n") : "No warnings found.";
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`Warnings for ${targetUser.tag}`).setDescription(lines).setColor(0xFEE75C)], ephemeral: true });
  }

  if (command === "note") {
    const text = interaction.options.getString("note", true);
    const data = readJson(NOTE_FILE);
    data[targetUser.id] ||= [];
    data[targetUser.id].push({ note: text, moderatorId: interaction.user.id, at: new Date().toISOString() });
    writeJson(NOTE_FILE, data);
    return interaction.reply({ content: `Note added for ${targetUser.tag}.`, ephemeral: true });
  }

  if (command === "notes") {
    const data = readJson(NOTE_FILE)[targetUser.id] || [];
    const lines = data.length ? data.map((n, i) => `**${i + 1}.** ${n.note} — <@${n.moderatorId}> — ${new Date(n.at).toLocaleString()}`).join("\n") : "No notes found.";
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`Notes for ${targetUser.tag}`).setDescription(lines).setColor(0x5865F2)], ephemeral: true });
  }

  if (["ban", "kick", "warn", "timeout", "untimeout"].includes(command)) {
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle(`Staff Action: ${command}`)
      .addFields({ name: "User", value: `${targetUser} (${targetUser.id})` }, { name: "Staff", value: `${interaction.user}` }, { name: "Reason", value: reason })
      .setTimestamp();
    await sendModLog(interaction.guild, embed);
  }
}
