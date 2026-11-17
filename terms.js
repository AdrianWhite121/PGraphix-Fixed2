import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

const purchaseTerms = `**Purchases**
Any commission purchases of any kind are bounded by the terms laid in this page and on all platforms and servers that are owned by or managed by The Vinewood Project, LLC. Purchases are paid through our payment platform, Stripe (Stripe, LLC).

For all bank transfers, ACH transfer or wire transfer for payment, your commission order will not be released to you until the payment has cleared. This is for the security of our developers to ensure that payment is finalized. For all debit/credit cards, Klarna, Affirm, CashApp Afterpay, or any other available option, once the payment has been submitted and we confirm payment, your commission order will be released to you in full, unless bound by other terms listed on the platform from which you ordered from and/or any additional terms agreed upon before the commission.`;

export function postTerms(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x00008B)
    .setTitle("Terms of Service")
    .setDescription(purchaseTerms)
    .setFooter({ text: "PG Studios" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tos_agree")
      .setLabel("I Agree")
      .setStyle(ButtonStyle.Primary)
  );

  return interaction.reply({ embeds: [embed], components: [row] });
}

export function agreeToTerms(interaction) {
  return interaction.reply({
    content: `<@${interaction.user.id}> agreed to the [commission purchase terms](${interaction.message.url}).`,
    allowedMentions: { parse: [] }
  });
}
