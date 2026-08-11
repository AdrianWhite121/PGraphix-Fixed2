import { PermissionFlagsBits } from "discord.js";
import { ids } from "./config.js";

export const commands = [
  { name: "setup-tickets", description: "Post the commission ticket menu.", default_member_permissions: PermissionFlagsBits.ManageGuild.toString() },
  { name: "setup-reactionroles", description: "Post the WIP Ping reaction role button.", default_member_permissions: PermissionFlagsBits.ManageGuild.toString() },
  { name: "close", description: "Close the current ticket and save its transcript." },
  { name: "claim", description: "Claim the current ticket as a staff member or moderator." },
  { name: "unclaim", description: "Release the current ticket for another staff member." },
  { name: "complete", description: "Mark the current ticket complete and move it into the done sequence." },
  { name: "done", description: "Mark the current ticket complete and move it into the done sequence." },
  { name: "hold", description: "Put the current ticket on hold." },
  { name: "active", description: "Return the current ticket to the active queue." },
  { name: "rename", description: "Rename the current channel.", options: [{ name: "name", description: "New channel name", type: 3, required: true, max_length: 100 }] },
  { name: "add", description: "Add a user to the current ticket.", options: [{ name: "user", description: "User to add", type: 6, required: true }] },
  { name: "embed-create", description: "Open a form to create a custom embed.", default_member_permissions: PermissionFlagsBits.ManageMessages.toString(), options: [
    { name: "channel", description: "Channel to send the embed to", type: 7, required: true, channel_types: [0] }
  ] },
  { name: "ban", description: "Ban a member.", options: [{ name: "user", description: "User to ban", type: 6, required: true }, { name: "reason", description: "Reason", type: 3, required: false }] },
  { name: "kick", description: "Kick a member.", options: [{ name: "user", description: "User to kick", type: 6, required: true }, { name: "reason", description: "Reason", type: 3, required: false }] },
  { name: "warn", description: "Warn a member.", options: [{ name: "user", description: "User to warn", type: 6, required: true }, { name: "reason", description: "Reason", type: 3, required: true }] },
  { name: "warnings", description: "View warnings for a member.", options: [{ name: "user", description: "User", type: 6, required: true }] },
  { name: "timeout", description: "Timeout a member. Example duration: 10m, 2h, 1d", options: [{ name: "user", description: "User to timeout", type: 6, required: true }, { name: "duration", description: "Duration", type: 3, required: true }, { name: "reason", description: "Reason", type: 3, required: false }] },
  { name: "untimeout", description: "Remove a member timeout.", options: [{ name: "user", description: "User", type: 6, required: true }, { name: "reason", description: "Reason", type: 3, required: false }] },
  { name: "note", description: "Add a staff note to a member.", options: [{ name: "user", description: "User", type: 6, required: true }, { name: "note", description: "Note", type: 3, required: true }] },
  { name: "notes", description: "View staff notes for a member.", options: [{ name: "user", description: "User", type: 6, required: true }] }
];

export async function registerCommands(client) {
  if (!client.application) await client.application.fetch();

  if (ids.guild) {
    const guild = await client.guilds.fetch(ids.guild);
    await guild.commands.set(commands);
    console.log(`Registered ${commands.length} slash commands in guild ${guild.name} (${guild.id}).`);
    return;
  }

  // No GUILD_ID set: register to every server the bot is in.
  // Guild commands show up immediately, unlike global commands which can take a while.
  const guilds = await client.guilds.fetch();
  if (!guilds.size) {
    console.warn("No guilds found to register commands in.");
    return;
  }

  for (const [guildId, partialGuild] of guilds) {
    const guild = await partialGuild.fetch();
    await guild.commands.set(commands);
    console.log(`Registered ${commands.length} slash commands in guild ${guild.name} (${guild.id}).`);
  }
}
