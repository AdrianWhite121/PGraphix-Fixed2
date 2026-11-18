import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationCommandOptionType, ButtonStyle, MessageFlags } from "discord.js";
import {
  buildCommissionMessages,
  commissionCommand,
  handleCommissionCommand,
  handleCommissionModalSubmit,
  parseCommission
} from "./commission.js";
import { ids } from "./config.js";
import { registerInteractionHandler } from "./interactions.js";
import { commands, registerCommands } from "./registerCommands.js";

const payerId = "111111111111111111";
const developerId = "222222222222222222";
const stripeLink = "https://buy.stripe.com/test_example";

function makeInteraction({ modal = false, staff = true, guild = true, items = "Livery | 50.00\nEUP | 25.00", fee = "10%", link = stripeLink } = {}) {
  const calls = [];
  return {
    calls,
    commandName: "commission",
    customId: `commission_pay:${payerId}:${developerId}`,
    inGuild: () => guild,
    member: { roles: { cache: new Set(staff ? [ids.staffRole] : []) } },
    options: {
      getSubcommand: () => "pay",
      getUser: name => ({ id: name === "payer" ? payerId : developerId })
    },
    fields: { getTextInputValue: name => ({ commission_items: items, commission_fee: fee, commission_stripe: link })[name] },
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => modal,
    isChatInputCommand: () => !modal,
    async showModal(value) { calls.push({ action: "showModal", value: value.toJSON() }); },
    async reply(value) { this.replied = true; calls.push({ action: "reply", value }); },
    async deferReply() { this.deferred = true; calls.push({ action: "deferReply" }); },
    async editReply(value) { calls.push({ action: "editReply", value }); },
    async followUp(value) { calls.push({ action: "followUp", value }); }
  };
}

test("registers /commission pay with required payer and developer options", async () => {
  const definition = commands.find(command => command.name === "commission");
  assert.equal(definition, commissionCommand);
  assert.equal(definition.dm_permission, false);
  assert.equal(definition.options[0].type, ApplicationCommandOptionType.Subcommand);
  assert.equal(definition.options[0].name, "pay");
  assert.deepEqual(definition.options[0].options.map(option => [option.name, option.type, option.required]), [
    ["payer", ApplicationCommandOptionType.User, true],
    ["developer", ApplicationCommandOptionType.User, true]
  ]);
  const registrations = [];
  const guild = { name: "Test guild", id: "333333333333333333", commands: { set: async value => registrations.push(value) } };
  const client = {
    application: {},
    guilds: { fetch: async id => id ? guild : new Map([[guild.id, { fetch: async () => guild }]]) }
  };
  await registerCommands(client);
  assert.ok(registrations[0].includes(commissionCommand));
});

test("calculates line prices, a flat fee, subtotal, and total in integer cents", () => {
  const result = parseCommission("Livery | $1,250.10\r\n\r\nEUP | 0.20\nFree revision | 0", "$10.00", stripeLink);
  assert.equal(result.items.length, 3);
  assert.equal(result.subtotalCents, 125030);
  assert.equal(result.ownershipFeeCents, 1000);
  assert.equal(result.totalCents, 126030);
  assert.equal(result.feePercentage, null);
  assert.equal(parseCommission("A | 0.10\nB | 0.20", "", stripeLink).totalCents, 30);
});

test("percentage fees round to the nearest cent and support fractional percentages", () => {
  const result = parseCommission("Livery | 10.05", "10%", stripeLink);
  assert.equal(result.ownershipFeeCents, 101);
  assert.equal(result.totalCents, 1106);
  assert.equal(result.feePercentage, "10%");
  assert.equal(parseCommission("Livery | 100", "2.50%", stripeLink).ownershipFeeCents, 250);
  assert.equal(parseCommission("Livery | 0.05", "10%", stripeLink).ownershipFeeCents, 1);
  assert.equal(parseCommission("Livery | 1", "100%", stripeLink).totalCents, 200);
});

test("blank and zero fees both produce a visible zero ownership fee", () => {
  for (const fee of ["", "  ", "0", "0.00", "0%"] ) {
    const result = parseCommission("Livery | 25", fee, stripeLink);
    assert.equal(result.ownershipFeeCents, 0);
    assert.equal(result.totalCents, 2500);
    const embed = buildCommissionMessages(payerId, developerId, result)[0].embeds[0].toJSON();
    assert.match(embed.fields.find(field => field.name === "Ownership fee").value, /^\$0\.00/);
  }
});

test("rejects malformed item lines and prices instead of silently posting a wrong total", () => {
  for (const input of ["", "   ", "Livery 25", "| 25", "Livery |", "Livery | -1", "Livery | 1.234", "Livery | 1e2", "Livery | NaN", "Livery | Infinity", "Livery | 1,00", "Livery | 20USD", `${"x".repeat(201)} | 1`, "x".repeat(4001)]) {
    assert.throws(() => parseCommission(input, "0", stripeLink), Error, input);
  }
  assert.throws(() => parseCommission("Valid | 10\nInvalid", "0", stripeLink), /Line 2/);
  assert.throws(() => parseCommission("Valid | 10\nInvalid | -5", "0", stripeLink), /line 2/);
});

test("rejects negative, invalid, and out-of-range ownership fees", () => {
  for (const fee of ["-1", "-10%", "101%", "10.555%", "NaN", "1e2", "$10%", "10%%", "%"]) {
    assert.throws(() => parseCommission("Livery | 25", fee, stripeLink), Error, fee);
  }
});

test("enforces amount bounds including combined subtotal and fees", () => {
  assert.equal(parseCommission("Livery | 9999999.99", "", stripeLink).totalCents, 999999999);
  for (const [items, fee] of [["Livery | 0", "0"], ["Livery | 10000000", "0"], ["A | 9999999.99\nB | 0.01", "0"], ["Livery | 9999999.99", "0.01"], ["Livery | 9999999.99", "100%"], ["Livery | 99999999999999999999999999", "0"]]) {
    assert.throws(() => parseCommission(items, fee, stripeLink));
  }
});

test("accepts Stripe hosted and custom domain HTTPS links without requesting them", () => {
  for (const link of [stripeLink, "https://checkout.stripe.com/c/pay/example", "https://invoice.stripe.com/i/example", "https://payments.example.com/example?reference=commission"]) {
    assert.equal(parseCommission("Livery | 25", "0", ` ${link} `).stripeLink, link);
  }
});

test("rejects invalid, non-HTTPS, credential-bearing, and oversized links", () => {
  for (const link of ["", "buy.stripe.com/test", "http://buy.stripe.com/test", "javascript:alert(1)", "https://user:password@buy.stripe.com/test", "https://buy.stripe.com/a\nb", `https://buy.stripe.com/${"a".repeat(512)}`, `https://buy.stripe.com/${"é".repeat(100)}`]) {
    assert.throws(() => parseCommission("Livery | 25", "0", link), /HTTPS Stripe payment link/);
  }
});

test("embed contains both members, each item, all totals, and the supplied Stripe button", () => {
  const commission = parseCommission("Livery | 50\nEUP | 25", "10%", stripeLink);
  const messages = buildCommissionMessages(payerId, developerId, commission);
  assert.equal(messages.length, 1);
  const embed = messages[0].embeds[0].toJSON();
  assert.equal(embed.title, "Commission Payment");
  assert.ok(embed.description.includes(`<@${payerId}>`));
  assert.ok(embed.description.includes(`<@${developerId}>`));
  assert.match(embed.description, /Livery — \*\*\$50\.00\*\*/);
  assert.match(embed.description, /EUP — \*\*\$25\.00\*\*/);
  assert.deepEqual(embed.fields.map(field => [field.name, field.value]), [
    ["Subtotal", "$75.00"], ["Ownership fee", "$7.50 (10%)"], ["Total cost", "**$82.50**"]
  ]);
  const button = messages[0].components[0].toJSON().components[0];
  assert.equal(button.style, ButtonStyle.Link);
  assert.equal(button.label, "Pay with Stripe");
  assert.equal(button.url, stripeLink);
  assert.deepEqual(messages[0].allowedMentions, { parse: [] });
});

test("long item lists preserve every row and stay inside Discord embed limits", () => {
  // 400 rows fit the input field but exceed a single embed once formatted.
  const commission = parseCommission(Array(400).fill("Item | 1").join("\n"), "0", stripeLink);
  const messages = buildCommissionMessages(payerId, developerId, commission);
  assert.ok(messages.length > 1);
  let renderedItems = 0;
  for (const [index, message] of messages.entries()) {
    const embed = message.embeds[0].toJSON();
    assert.ok(embed.description.length <= 4096);
    assert.ok(message.embeds[0].length <= 6000);
    renderedItems += (embed.description.match(/• Item —/g) || []).length;
    if (index < messages.length - 1) {
      assert.equal(message.components.length, 0);
      assert.equal(embed.fields, undefined);
    } else {
      assert.equal(message.components.length, 1);
      assert.equal(embed.fields.find(field => field.name === "Total cost").value, "**$400.00**");
    }
  }
  assert.equal(renderedItems, 400);
});

test("markdown-heavy item names cannot break the description length limit", () => {
  const commission = parseCommission(Array(19).fill(`${"*".repeat(200)} | 1`).join("\n"), "0", stripeLink);
  const messages = buildCommissionMessages(payerId, developerId, commission);
  assert.ok(messages.length > 1);
  for (const message of messages) {
    assert.ok(message.embeds[0].toJSON().description.length <= 4096);
    assert.ok(message.embeds[0].toJSON().description.includes("\\*"));
  }
});

test("staff command opens a valid modal with the selected members and a multiline items field", async () => {
  const interaction = makeInteraction();
  await handleCommissionCommand(interaction);
  assert.equal(interaction.calls.length, 1);
  const modal = interaction.calls[0].value;
  assert.equal(modal.custom_id, `commission_pay:${payerId}:${developerId}`);
  assert.ok(modal.custom_id.length <= 100);
  assert.equal(modal.components[0].components[0].max_length, 4000);
  assert.equal(modal.components[0].components[0].style, 2);
  assert.equal(modal.components[1].components[0].required, false);
  assert.equal(modal.components[2].components[0].required, true);
});

test("permission checks cover command, modal submission, and DMs", async () => {
  for (const handler of [handleCommissionCommand, handleCommissionModalSubmit]) {
    for (const options of [{ staff: false }, { guild: false }]) {
      const interaction = makeInteraction(options);
      await handler(interaction);
      assert.equal(interaction.calls.length, 1);
      assert.equal(interaction.calls[0].action, "reply");
      assert.equal(interaction.calls[0].value.flags, MessageFlags.Ephemeral);
      assert.match(interaction.calls[0].value.content, /Only staff/);
    }
  }
});

test("invalid form submissions return private errors without posting an embed", async () => {
  for (const options of [{ items: "bad input" }, { fee: "-5" }, { link: "http://example.com" }]) {
    const interaction = makeInteraction({ modal: true, ...options });
    await handleCommissionModalSubmit(interaction);
    assert.equal(interaction.calls.length, 1);
    assert.equal(interaction.calls[0].action, "reply");
    assert.equal(interaction.calls[0].value.flags, MessageFlags.Ephemeral);
    assert.equal(interaction.calls[0].value.embeds, undefined);
  }
});

test("malformed modal IDs receive a private error", async () => {
  const interaction = makeInteraction({ modal: true });
  interaction.customId = "commission_pay:invalid";
  await handleCommissionModalSubmit(interaction);
  assert.match(interaction.calls[0].value.content, /form is invalid/);
  assert.equal(interaction.calls[0].value.flags, MessageFlags.Ephemeral);
});

test("interaction router opens the form and posts a public payment request on submit", async () => {
  let listener;
  registerInteractionHandler({ on(event, callback) { assert.equal(event, "interactionCreate"); listener = callback; } });
  const command = makeInteraction();
  await listener(command);
  assert.equal(command.calls[0].action, "showModal");
  const modal = makeInteraction({ modal: true });
  await listener(modal);
  assert.deepEqual(modal.calls.map(call => call.action), ["deferReply", "editReply"]);
  assert.equal(modal.calls[1].value.flags, undefined);
  assert.equal(modal.calls[1].value.embeds[0].toJSON().title, "Commission Payment");
});

test("long submissions post sequential follow-ups with the button only on the final message", async () => {
  const interaction = makeInteraction({ modal: true, items: Array(400).fill("Item | 1").join("\n"), fee: "0" });
  await handleCommissionModalSubmit(interaction);
  assert.equal(interaction.calls[0].action, "deferReply");
  assert.equal(interaction.calls[1].action, "editReply");
  assert.ok(interaction.calls.slice(2).every(call => call.action === "followUp"));
  assert.ok(interaction.calls.slice(1, -1).every(call => call.value.components.length === 0));
  assert.equal(interaction.calls.at(-1).value.components.length, 1);
});
