import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  escapeMarkdown,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { hasStaffRole } from "./permissions.js";

export const COMMISSION_MODAL_PREFIX = "commission_pay:";
const MAX_CENTS = 999_999_999;
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = cents => currency.format(cents / 100);

export const commissionCommand = {
  name: "commission",
  description: "Manage commission payment requests.",
  dm_permission: false,
  options: [{
    name: "pay",
    description: "Post an itemized commission payment request with a Stripe link (staff only).",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      { name: "payer", description: "Customer paying for the commission", type: ApplicationCommandOptionType.User, required: true },
      { name: "developer", description: "Developer working on the commission", type: ApplicationCommandOptionType.User, required: true }
    ]
  }]
};

function checkAmount(cents, label) {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS) {
    throw new Error(`${label} must be between $0.00 and ${money(MAX_CENTS)}.`);
  }
  return cents;
}

function parseAmount(value, label) {
  const input = value.trim();
  if (!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) {
    throw new Error(`${label}: enter a non-negative amount with at most two decimal places, such as 25.00.`);
  }
  const [dollars, fraction = ""] = input.replace(/[$,]/g, "").split(".");
  return checkAmount(Number(dollars) * 100 + Number(fraction.padEnd(2, "0")), label);
}

export function parseCommission(itemsText, ownershipFeeText, stripeLink) {
  if (!itemsText.trim() || itemsText.length > 4000) {
    throw new Error("Enter at least one item, with no more than 4,000 characters in the item list.");
  }

  const items = [];
  let subtotalCents = 0;
  for (const [index, rawLine] of itemsText.split(/\r?\n/).entries()) {
    if (!rawLine.trim()) continue;
    const divider = rawLine.lastIndexOf("|");
    const name = rawLine.slice(0, divider).trim();
    if (divider < 1 || !name || name.length > 200) {
      throw new Error(`Line ${index + 1}: use Item | Price, with an item name of 1–200 characters.`);
    }
    const cents = parseAmount(rawLine.slice(divider + 1), `Price on line ${index + 1}`);
    subtotalCents = checkAmount(subtotalCents + cents, "Subtotal");
    items.push({ name, cents });
  }

  const feeInput = ownershipFeeText.trim() || "0";
  let ownershipFeeCents;
  let feePercentage = null;
  if (feeInput.endsWith("%")) {
    const percentage = feeInput.slice(0, -1).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(percentage)) {
      throw new Error("Ownership fee: use an amount such as 10.00 or a percentage such as 10%.");
    }
    const basisPoints = parseAmount(percentage, "Ownership fee percentage");
    if (basisPoints > 10_000) throw new Error("Ownership fee percentage must be between 0% and 100%.");
    // All arithmetic is in integer cents; percentage fees round to the nearest cent.
    ownershipFeeCents = Math.round(subtotalCents * basisPoints / 10_000);
    feePercentage = `${basisPoints / 100}%`;
  } else {
    ownershipFeeCents = parseAmount(feeInput, "Ownership fee");
  }
  const totalCents = checkAmount(subtotalCents + ownershipFeeCents, "Total cost");
  if (totalCents === 0) throw new Error("Total cost must be greater than $0.00 for a payment request.");

  let url;
  try {
    url = new URL(stripeLink.trim());
  } catch {
    throw new Error("Enter a valid HTTPS Stripe payment link.");
  }
  // Stripe also supports custom payment domains, so do not restrict the hostname.
  if (url.protocol !== "https:" || url.username || url.password || url.href.length > 512 || /\s/.test(stripeLink.trim())) {
    throw new Error("Enter an HTTPS Stripe payment link of at most 512 characters, without embedded credentials.");
  }

  return { items, subtotalCents, ownershipFeeCents, feePercentage, totalCents, stripeLink: url.href };
}

export function buildCommissionMessages(payerId, developerId, commission) {
  const heading = `**Who's paying:** <@${payerId}>\n**Developer:** <@${developerId}>\n\n**Items & prices**\n`;
  const pages = [];
  let description = heading;
  for (const item of commission.items) {
    const line = `• ${escapeMarkdown(item.name)} — **${money(item.cents)}**\n`;
    if (description.length + line.length > 4096) {
      pages.push(description.trimEnd());
      description = heading;
    }
    description += line;
  }
  pages.push(description.trimEnd());

  return pages.map((page, index) => {
    const lastPage = index === pages.length - 1;
    const embed = new EmbedBuilder()
      .setColor(0x00008B)
      .setTitle(pages.length === 1 ? "Commission Payment" : `Commission Payment (${index + 1}/${pages.length})`)
      .setDescription(page)
      .setFooter({ text: "PGraphix Studio • USD" })
      .setTimestamp();
    const components = [];
    if (lastPage) {
      embed.addFields(
        { name: "Subtotal", value: money(commission.subtotalCents), inline: true },
        { name: "Ownership fee", value: `${money(commission.ownershipFeeCents)}${commission.feePercentage ? ` (${commission.feePercentage})` : ""}`, inline: true },
        { name: "Total cost", value: `**${money(commission.totalCents)}**`, inline: true }
      );
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Pay with Stripe").setStyle(ButtonStyle.Link).setURL(commission.stripeLink)
      ));
    }
    return { embeds: [embed], components, allowedMentions: { parse: [] } };
  });
}

function canPostCommission(interaction) {
  return interaction.inGuild() && hasStaffRole(interaction.member);
}

function rejectPermission(interaction) {
  return interaction.reply({ content: "Only staff can create commission payment requests in a server.", flags: MessageFlags.Ephemeral });
}

export async function handleCommissionCommand(interaction) {
  if (!canPostCommission(interaction)) return rejectPermission(interaction);
  if (interaction.options.getSubcommand() !== "pay") {
    return interaction.reply({ content: "Use /commission pay to create a payment request.", flags: MessageFlags.Ephemeral });
  }
  const payer = interaction.options.getUser("payer", true);
  const developer = interaction.options.getUser("developer", true);
  const modal = new ModalBuilder()
    .setCustomId(`${COMMISSION_MODAL_PREFIX}${payer.id}:${developer.id}`)
    .setTitle("Commission Payment")
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("commission_items").setLabel("Items — one Item | Price per line")
        .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)
        .setPlaceholder("Livery design | 50.00\nEUP pack | 25.00")),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("commission_fee").setLabel("Ownership fee (USD or %, blank = none)")
        .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(30)
        .setPlaceholder("10.00 or 10%")),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("commission_stripe").setLabel("Stripe payment link for this total")
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(512)
        .setPlaceholder("https://buy.stripe.com/..."))
    );
  return interaction.showModal(modal);
}

export async function handleCommissionModalSubmit(interaction) {
  // Check again in case the staff role was removed while the form was open.
  if (!canPostCommission(interaction)) return rejectPermission(interaction);
  const match = interaction.customId.match(/^commission_pay:(\d{17,20}):(\d{17,20})$/);
  if (!match) {
    return interaction.reply({ content: "This payment form is invalid. Run /commission pay again.", flags: MessageFlags.Ephemeral });
  }

  let commission;
  try {
    commission = parseCommission(
      interaction.fields.getTextInputValue("commission_items"),
      interaction.fields.getTextInputValue("commission_fee"),
      interaction.fields.getTextInputValue("commission_stripe")
    );
  } catch (error) {
    return interaction.reply({ content: `${error.message}\nRun /commission pay again to correct the form.`, flags: MessageFlags.Ephemeral });
  }

  const messages = buildCommissionMessages(match[1], match[2], commission);
  await interaction.deferReply();
  await interaction.editReply(messages[0]);
  // Long item lists continue in additional embeds; the totals/button appear only at the end.
  for (const message of messages.slice(1)) await interaction.followUp(message);
}
