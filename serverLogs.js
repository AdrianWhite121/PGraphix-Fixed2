import { AuditLogEvent, EmbedBuilder } from "discord.js";
import { ids } from "./config.js";

async function getLogChannel(guild) {
  const channelId = ids.serverLogChannel || "1473204678543278170";
  if (!channelId) return null;

  let channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) channel = await guild.client.channels.fetch(channelId).catch(() => null);

  if (!channel?.isTextBased?.()) {
    console.warn(`[serverLogs] Could not find text log channel ${channelId}. Check bot permissions and channel ID.`);
    return null;
  }

  return channel;
}

async function sendServerLog(guild, embed) {
  try {
    const channel = await getLogChannel(guild);
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.warn("[serverLogs] Failed to send server log:", error.message);
  }
}

async function getRecentAuditEntry(guild, type, targetId, maxAgeMs = 15000) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 10 });
    const now = Date.now();
    return logs.entries.find(entry => {
      const sameTarget = entry.target?.id === targetId;
      const recent = now - entry.createdTimestamp <= maxAgeMs;
      return sameTarget && recent;
    }) || null;
  } catch (error) {
    console.warn(`[serverLogs] Could not read audit logs. Give the bot View Audit Log permission. ${error.message}`);
    return null;
  }
}

function userLine(userOrMember) {
  const user = userOrMember?.user || userOrMember;
  if (!user) return "Unknown";
  return `${user} (${user.tag || user.username || "Unknown"} | ${user.id})`;
}

function roleNames(roles) {
  return roles.map(role => `${role} (${role.name})`).join("\n").slice(0, 1024) || "None";
}

function cleanContent(content) {
  if (!content) return "No content available";
  return content.slice(0, 1000);
}

export function registerServerLogs(client) {
  client.once("ready", async () => {
    const guild = await client.guilds.fetch(ids.guild).catch(() => client.guilds.cache.first());
    if (!guild) {
      console.warn("[serverLogs] No guild found. Check GUILD_ID.");
      return;
    }

    const channel = await getLogChannel(guild);
    if (channel) {
      console.log(`[serverLogs] Logging to #${channel.name} (${channel.id})`);
      await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle("Server Logs Online")
          .setDescription("Join, leave, kick, ban, unban, role, timeout, deleted message, and edited message logs are active.")
          .setTimestamp()]
      }).catch(error => console.warn("[serverLogs] Online test failed:", error.message));
    }
  });

  client.on("guildMemberAdd", async (member) => {
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle("Member Joined")
      .addFields(
        { name: "Member", value: userLine(member) },
        { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>` }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await sendServerLog(member.guild, embed);
  });

  client.on("guildMemberRemove", async (member) => {
    const kickEntry = await getRecentAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id);
    const embed = new EmbedBuilder()
      .setColor(kickEntry ? 0xED4245 : 0xFEE75C)
      .setTitle(kickEntry ? "Member Kicked" : "Member Left")
      .addFields({ name: "Member", value: userLine(member) })
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    if (kickEntry) {
      embed.addFields(
        { name: "Moderator", value: kickEntry.executor ? `${kickEntry.executor} (${kickEntry.executor.id})` : "Unknown" },
        { name: "Reason", value: kickEntry.reason || "No reason provided" }
      );
    }

    await sendServerLog(member.guild, embed);
  });

  client.on("guildBanAdd", async (ban) => {
    const banEntry = await getRecentAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle("Member Banned")
      .addFields(
        { name: "User", value: userLine(ban.user) },
        { name: "Moderator", value: banEntry?.executor ? `${banEntry.executor} (${banEntry.executor.id})` : "Unknown" },
        { name: "Reason", value: banEntry?.reason || ban.reason || "No reason provided" }
      )
      .setThumbnail(ban.user.displayAvatarURL())
      .setTimestamp();

    await sendServerLog(ban.guild, embed);
  });

  client.on("guildBanRemove", async (ban) => {
    const unbanEntry = await getRecentAuditEntry(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle("Member Unbanned")
      .addFields(
        { name: "User", value: userLine(ban.user) },
        { name: "Moderator", value: unbanEntry?.executor ? `${unbanEntry.executor} (${unbanEntry.executor.id})` : "Unknown" },
        { name: "Reason", value: unbanEntry?.reason || "No reason provided" }
      )
      .setThumbnail(ban.user.displayAvatarURL())
      .setTimestamp();

    await sendServerLog(ban.guild, embed);
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;
    const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
    const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

    if (addedRoles.size || removedRoles.size) {
      const roleEntry = await getRecentAuditEntry(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("Member Roles Changed")
        .addFields(
          { name: "Member", value: userLine(newMember) },
          { name: "Moderator", value: roleEntry?.executor ? `${roleEntry.executor} (${roleEntry.executor.id})` : "Unknown" }
        )
        .setThumbnail(newMember.user.displayAvatarURL())
        .setTimestamp();

      if (addedRoles.size) embed.addFields({ name: "Roles Added", value: roleNames([...addedRoles.values()]) });
      if (removedRoles.size) embed.addFields({ name: "Roles Removed", value: roleNames([...removedRoles.values()]) });
      await sendServerLog(newMember.guild, embed);
    }

    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;
    if (oldTimeout !== newTimeout) {
      const timeoutEntry = await getRecentAuditEntry(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
      const embed = new EmbedBuilder()
        .setColor(newTimeout ? 0xFEE75C : 0x57F287)
        .setTitle(newTimeout ? "Member Timed Out" : "Member Timeout Removed")
        .addFields(
          { name: "Member", value: userLine(newMember) },
          { name: "Moderator", value: timeoutEntry?.executor ? `${timeoutEntry.executor} (${timeoutEntry.executor.id})` : "Unknown" },
          { name: "Reason", value: timeoutEntry?.reason || "No reason provided" }
        )
        .setThumbnail(newMember.user.displayAvatarURL())
        .setTimestamp();

      if (newTimeout) embed.addFields({ name: "Timeout Ends", value: `<t:${Math.floor(newTimeout / 1000)}:F>` });
      await sendServerLog(newMember.guild, embed);
    }
  });

  client.on("messageDelete", async (message) => {
    if (!message.guild || message.author?.bot) return;
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle("Message Deleted")
      .addFields(
        { name: "Author", value: userLine(message.author) },
        { name: "Channel", value: `${message.channel}` },
        { name: "Content", value: cleanContent(message.content) }
      )
      .setTimestamp();

    await sendServerLog(message.guild, embed);
  });

  client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle("Message Edited")
      .addFields(
        { name: "Author", value: userLine(newMessage.author) },
        { name: "Channel", value: `${newMessage.channel}` },
        { name: "Before", value: cleanContent(oldMessage.content) },
        { name: "After", value: cleanContent(newMessage.content) }
      )
      .setTimestamp();

    await sendServerLog(newMessage.guild, embed);
  });
}
