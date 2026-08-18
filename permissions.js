import { ids } from "./config.js";

export function hasStaffRole(member) {
  return Boolean(member?.roles?.cache?.has(ids.staffRole));
}

export async function replySafe(interaction, options) {
  if (interaction.deferred) return interaction.editReply(options);
  if (interaction.replied) return interaction.followUp(options);
  return interaction.reply(options);
}
