// Custom embed builder.
import {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

const MODAL_PREFIX = "embed_create_modal";

function buildTextInput(customId, label, style, required, placeholder, maxLength, value = "") {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(maxLength);

  if (placeholder) input.setPlaceholder(placeholder);
  if (value) input.setValue(value);

  return new ActionRowBuilder().addComponents(input);
}

function isValidHexColor(color) {
  return /^#?[0-9A-Fa-f]{6}$/.test(color);
}

function cleanOptional(value) {
  return value?.trim() || null;
}

export async function handleEmbedCommand(interaction) {
  const channel = interaction.options.getChannel("channel", true);

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}:${channel.id}`)
    .setTitle("Create Custom Embed");

  modal.addComponents(
    buildTextInput(
      "embed_title",
      "Embed Title",
      TextInputStyle.Short,
      true,
      "Example: JGraphix Studio Announcement",
      256
    ),
    buildTextInput(
      "embed_description",
      "Description",
      TextInputStyle.Paragraph,
      true,
      "Use line breaks for formatting.",
      4000
    ),
    buildTextInput(
      "embed_color",
      "Color Hex",
      TextInputStyle.Short,
      false,
      "#009688",
      7,
      "#009688"
    ),
    buildTextInput(
      "embed_footer",
      "Footer Text",
      TextInputStyle.Short,
      false,
      "JGraphix Studio",
      2048
    ),
    buildTextInput(
      "embed_image",
      "Image URL Optional",
      TextInputStyle.Short,
      false,
      "https://example.com/image.png",
      1000
    )
  );

  await interaction.showModal(modal);
}

export async function handleEmbedModalSubmit(interaction) {
  if (!interaction.customId.startsWith(`${MODAL_PREFIX}:`)) return false;

  const channelId = interaction.customId.split(":")[1];
  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    await interaction.reply({ content: "I could not find that text channel anymore.", ephemeral: true });
    return true;
  }

  const title = interaction.fields.getTextInputValue("embed_title").trim();
  const description = interaction.fields.getTextInputValue("embed_description").trim();
  const colorInput = cleanOptional(interaction.fields.getTextInputValue("embed_color")) || "#009688";
  const footer = cleanOptional(interaction.fields.getTextInputValue("embed_footer"));
  const image = cleanOptional(interaction.fields.getTextInputValue("embed_image"));

  if (!isValidHexColor(colorInput)) {
    await interaction.reply({ content: "Invalid color hex. Use a format like `#009688`.", ephemeral: true });
    return true;
  }

  const color = colorInput.startsWith("#") ? colorInput : `#${colorInput}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();

  if (footer) embed.setFooter({ text: footer });
  if (image) embed.setImage(image);

  try {
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: `Embed sent to ${channel}.`, ephemeral: true });
  } catch (error) {
    await interaction.reply({ content: `Could not send the embed: ${error.message}`, ephemeral: true });
  }

  return true;
}
