import { hasStaffRole, replySafe } from "./permissions.js";
import { addUserToTicket, changeTicketStatus, claimTicket, closeTicket, createTicket, postTicketMenu, renameChannel, unclaimTicket } from "./tickets.js";
import { postReactionRoles, toggleWipPing } from "./reactionRoles.js";
import { handleEmbedCommand, handleEmbedModalSubmit } from "./embedCreator.js";
import { handleStaffCommand, staffCommandNames } from "./staff.js";

export function registerInteractionHandler(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") return createTicket(interaction, client);

      if (interaction.isButton() && interaction.customId === "ticket_close") return closeTicket(interaction, client);

      if (interaction.isButton() && interaction.customId === "wip_ping_toggle") return toggleWipPing(interaction);

      if (interaction.isModalSubmit()) {
        const handled = await handleEmbedModalSubmit(interaction);
        if (handled) return;
      }

      if (!interaction.isChatInputCommand()) return;

      if (staffCommandNames.includes(interaction.commandName) && !hasStaffRole(interaction.member)) {
        return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
      }

      if (interaction.commandName === "setup-tickets") return postTicketMenu(interaction);
      if (interaction.commandName === "close") return closeTicket(interaction, client);
      if (interaction.commandName === "claim") return claimTicket(interaction);
      if (interaction.commandName === "unclaim") return unclaimTicket(interaction);
      if (interaction.commandName === "complete" || interaction.commandName === "done") return changeTicketStatus(interaction, "done");
      if (interaction.commandName === "hold") return changeTicketStatus(interaction, "hold");
      if (interaction.commandName === "active") return changeTicketStatus(interaction, "active");
      if (interaction.commandName === "rename") return renameChannel(interaction);
      if (interaction.commandName === "add") return addUserToTicket(interaction);
      if (interaction.commandName === "setup-reactionroles") return postReactionRoles(interaction);
      if (interaction.commandName === "embed-create" || interaction.commandName === "embed") return handleEmbedCommand(interaction);
      if (staffCommandNames.includes(interaction.commandName)) return handleStaffCommand(interaction);
    } catch (error) {
      console.error("Interaction error:", error);
      await replySafe(interaction, { content: `Something went wrong: ${error.message}`, ephemeral: true }).catch(() => {});
    }
  });
}
