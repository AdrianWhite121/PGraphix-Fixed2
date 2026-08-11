import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { ids } from "./config.js";

export async function postReactionRoles(interaction) {
  const channel = await interaction.guild.channels.fetch(ids.reactionRoleChannel);
  if (!channel?.isTextBased()) return interaction.reply({ content: "Reaction-role channel could not be found.", ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle("Reaction Roles")
    .setDescription("Click the button below to gain or remove the WIP Ping role.");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("wip_ping_toggle").setLabel("🏅 WIP Ping").setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: `Reaction role message posted in ${channel}.`, ephemeral: true });
}

export async function toggleWipPing(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (member.roles.cache.has(ids.wipPingRole)) {
    await member.roles.remove(ids.wipPingRole);
    return interaction.reply({ content: "Removed the WIP Ping role.", ephemeral: true });
  }

  await member.roles.add(ids.wipPingRole);
  return interaction.reply({ content: "Added the WIP Ping role.", ephemeral: true });
}
