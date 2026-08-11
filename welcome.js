import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { ids, paths } from "./config.js";

export function registerWelcome(client) {
  client.on("guildMemberAdd", async (member) => {
    try {
      await member.roles.add(ids.autoRole);
      console.log(`Auto role given to ${member.user.tag}`);
    } catch (error) {
      console.error("Auto role failed:", error.message);
    }

    if (!ids.welcomeChannel) return console.log("WELCOME_CHANNEL_ID is missing.");

    try {
      const welcomeChannel = await member.guild.channels.fetch(ids.welcomeChannel);
      if (!welcomeChannel?.isTextBased()) return console.log("Welcome channel not found.");

      const logo = new AttachmentBuilder(paths.logo, { name: "logo.png" });
      const embed = new EmbedBuilder()
        .setColor("#2B2D31")
        .setTitle("Welcome to JGraphix Studio")
        .setDescription(`Welcome ${member}.\n\nThank you for joining JGraphix Studio.\n\nPlease review the following channels to familiarize yourself with our services and community guidelines.\n\n**Rules & Guidelines**\n<#1420615530091515955>\n\n**Work In Progress**\n<#1473208743591415841>\n\n**TikTok Updates**\n<#1478873848450519213>\n\n**General Discussion**\n<#1473184613219176488>\n\nIf you have any questions regarding commissions or services, please contact a member of our team.`)
        .setThumbnail("attachment://logo.png")
        .setFooter({ text: "JGraphix Studio" })
        .setTimestamp();

      await welcomeChannel.send({ content: `${member}`, embeds: [embed], files: [logo] });
    } catch (error) {
      console.error("Failed to send welcome message:", error.message);
    }
  });
}
