import { hasStaffRole, replySafe } from "./permissions.js";
import { addUserToTicket, changeTicketStatus, claimTicket, closeTicket, createTicket, handleTicketModal, postTicketMenu, renameChannel, unclaimTicket } from "./tickets.js";
import { postReactionRoles, toggleWipPing } from "./reactionRoles.js";
import { handleEmbedCommand, handleEmbedModalSubmit } from "./embedCreator.js";
import { handleStaffCommand, staffCommandNames } from "./staff.js";

export function registerInteractionHandler(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") return await createTicket(interaction, client);

      if (interaction.isButton() && interaction.customId === "ticket_close") return await closeTicket(interaction, client);

      if (interaction.isButton() && interaction.customId === "wip_ping_toggle") return await toggleWipPing(interaction);

      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith("ticket_questions:")) return await handleTicketModal(interaction, client);
        const handled = await handleEmbedModalSubmit(interaction);
        if (handled) return;
      }

      if (!interaction.isChatInputCommand()) return;

      if (staffCommandNames.includes(interaction.commandName) && !hasStaffRole(interaction.member)) {
        return await interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
      }

      if (interaction.commandName === "setup-tickets") return await postTicketMenu(interaction);
      if (interaction.commandName === "close") return await closeTicket(interaction, client);
      if (interaction.commandName === "claim") return await claimTicket(interaction);
      if (interaction.commandName === "unclaim") return await unclaimTicket(interaction);
      if (interaction.commandName === "complete" || interaction.commandName === "done") return await changeTicketStatus(interaction, "done");
      if (interaction.commandName === "hold") return await changeTicketStatus(interaction, "hold");
      if (interaction.commandName === "active") return await changeTicketStatus(interaction, "active");
      if (interaction.commandName === "rename") return await renameChannel(interaction);
      if (interaction.commandName === "add") return await addUserToTicket(interaction);
      if (interaction.commandName === "setup-reactionroles") return await postReactionRoles(interaction);
      if (interaction.commandName === "embed-create" || interaction.commandName === "embed") return await handleEmbedCommand(interaction);
      if (staffCommandNames.includes(interaction.commandName)) return await handleStaffCommand(interaction);
    } catch (error) {
      console.error("Interaction error:", error);
      await replySafe(interaction, { content: `Something went wrong: ${error.message}`, ephemeral: true }).catch(() => {});
    }
  });
}
