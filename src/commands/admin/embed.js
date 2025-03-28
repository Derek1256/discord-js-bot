const {
  ApplicationCommandOptionType,
  ChannelType,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} = require("discord.js");
const { isValidColor, isHex } = require("@helpers/Utils");

const getDefaultJson = (member) => ({
  "content": "Example message content (optional)",
  "embeds": [
    {
      "title": "Example Embed",
      "description": "This is a sample embed. Replace this JSON with your own or paste JSON from Discohook.\n\nMake sure to copy the ENTIRE JSON when pasting!",
      "color": 0x0099ff,
      "fields": [
        {
          "name": "JSON Format",
          "value": "The JSON must include at least one of:\n- content\n- embeds\n- components",
          "inline": true
        }
      ],
      "footer": {
        "text": "Tip: Use Discohook to generate your embed JSON"
      },
      "timestamp": new Date().toISOString(),
      "author": {
        "name": member.user.tag
      }
    }
  ]
});

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "embed",
  description: "send or edit embed messages",
  category: "ADMIN",
  userPermissions: ["ManageMessages"],
  command: {
    enabled: true,
    minArgsCount: 1,
    aliases: ["say"],
    usage: "<#channel/messageid>",
  },
  slashCommand: {
    enabled: true,
    ephemeral: true,
    options: [
      {
        name: "mode",
        description: "Choose whether to create or edit an embed",
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          {
            name: "create",
            value: "create"
          },
          {
            name: "edit",
            value: "edit"
          }
        ]
      },
      {
        name: "target",
        description: "Channel (for create) or Message ID (for edit)",
        type: ApplicationCommandOptionType.String,
        required: true,
      }
    ],
  },

  async messageRun(message, args) {
    // Check if the first argument is a channel mention or ID
    const channelMention = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
    
    if (channelMention) {
      // Create mode
      if (channelMention.type !== ChannelType.GuildText) return message.reply("Please provide a valid text channel");
      if (!channelMention.canSendEmbeds()) {
        return message.reply("I don't have permission to send embeds in that channel");
      }
      await embedSetup(message.channel, channelMention, message.member);
    } else {
      // Edit mode
      const messageId = args[0];
      
      try {
        // Search for the message in all channels
        let targetMessage = null;
        for (const channel of message.guild.channels.cache.values()) {
          if (channel.type === ChannelType.GuildText) {
            try {
              targetMessage = await channel.messages.fetch(messageId);
              if (targetMessage) break;
            } catch (err) {
              // Continue searching if message not found in this channel
              continue;
            }
          }
        }

        if (!targetMessage) return message.reply("Message not found in any channel");
        if (targetMessage.author.id !== message.client.user.id) return message.reply("I can only edit my own messages");
        await editEmbed(message.channel, targetMessage, message.member);
      } catch (e) {
        return message.reply("Failed to fetch the message. Make sure the message ID is correct.");
      }
    }
  },

  async interactionRun(interaction) {
    const mode = interaction.options.getString("mode");
    const target = interaction.options.getString("target");

    if (mode === "create") {
      // Try to resolve the target as a channel
      const targetChannel = interaction.guild.channels.cache.get(target) || 
                          interaction.guild.channels.cache.find(c => c.name === target);
      
      if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
        return interaction.followUp("Please provide a valid text channel");
      }
      
      if (!targetChannel.canSendEmbeds()) {
        return interaction.followUp("I don't have permission to send embeds in that channel");
      }

      await interaction.followUp(`Starting embed setup (preview will be shown here, final embed will be sent to ${targetChannel})`);
      await embedSetup(interaction.channel, targetChannel, interaction.member);
    } else {
      // Edit mode
      try {
        // Search for the message in all channels
        let targetMessage = null;
        for (const channel of interaction.guild.channels.cache.values()) {
          if (channel.type === ChannelType.GuildText) {
            try {
              targetMessage = await channel.messages.fetch(target);
              if (targetMessage) break;
            } catch (err) {
              // Continue searching if message not found in this channel
              continue;
            }
          }
        }

        if (!targetMessage) return interaction.followUp("Message not found in any channel");
        if (targetMessage.author.id !== interaction.client.user.id) return interaction.followUp("I can only edit my own messages");
        await interaction.followUp("Starting embed editor...");
        await editEmbed(interaction.channel, targetMessage, interaction.member);
      } catch (e) {
        return interaction.followUp("Failed to fetch the message. Make sure the message ID is correct.");
      }
    }
  },
};

/**
 * @param {import('discord.js').GuildTextBasedChannel} commandChannel
 * @param {import('discord.js').GuildTextBasedChannel} targetChannel
 * @param {import('discord.js').GuildMember} member
 */
async function embedSetup(commandChannel, targetChannel, member) {
  const sentMsg = await commandChannel.send({
    content: `Choose how you want to create your embed (will be sent to ${targetChannel}):`,
    components: [
      new ActionRowBuilder().addComponents([
        new ButtonBuilder().setCustomId("EMBED_ADD").setLabel("Normal Editor").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("EMBED_JSON").setLabel("JSON Editor").setStyle(ButtonStyle.Success)
      ]),
    ],
  });

  const btnInteraction = await commandChannel
    .awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => (i.customId === "EMBED_ADD" || i.customId === "EMBED_JSON") && i.member.id === member.id && i.message.id === sentMsg.id,
      time: 20000,
    })
    .catch((ex) => {});

  if (!btnInteraction) return sentMsg.edit({ content: "No response received", components: [] });

  if (btnInteraction.customId === "EMBED_JSON") {
    await btnInteraction.showModal(
      new ModalBuilder({
        customId: "EMBED_JSON_MODAL",
        title: "Create Embed via JSON",
        components: [
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("json")
              .setLabel("Embed JSON")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setValue(JSON.stringify(getDefaultJson(member), null, 2))
              .setPlaceholder("Paste your JSON here. Make sure to copy the entire JSON!")
              .setMaxLength(4000)
          ),
        ],
      })
    );

    const modal = await btnInteraction
      .awaitModalSubmit({
        time: 5 * 60 * 1000,
        filter: (m) => m.customId === "EMBED_JSON_MODAL" && m.member.id === member.id,
      })
      .catch((ex) => {});

    if (!modal) return sentMsg.edit({ content: "No response received", components: [] });

    try {
      const jsonInput = modal.fields.getTextInputValue("json");
      if (!jsonInput || jsonInput.trim() === '') {
        throw new Error("Empty JSON input");
      }
      
      const jsonData = JSON.parse(jsonInput.trim());
      
      // Validate that we have at least some data
      if (!jsonData || ((!jsonData.content && !jsonData.embeds?.length && !jsonData.components?.length))) {
        throw new Error("Invalid message structure - must include content, embeds, or components");
      }

      await targetChannel.send(jsonData);
      await modal.reply({ content: `Message sent successfully to ${targetChannel}!`, ephemeral: true });
      await sentMsg.delete().catch(() => {});
    } catch (e) {
      console.error(e);
      let errorMessage = "Error occurred while sending the message. ";
      
      if (e.message === "Empty JSON input") {
        errorMessage += "The JSON input was empty. Please provide valid JSON data.";
      } else if (e.message.includes("Unexpected end of JSON")) {
        errorMessage += "The JSON appears to be incomplete. Please make sure you copied the entire JSON data.";
      } else if (e.message.includes("Invalid message structure")) {
        errorMessage += "The JSON must include at least content, embeds, or components.";
      } else {
        errorMessage += "Make sure your JSON is properly formatted and complete.";
      }
      
      await modal.reply({ 
        content: errorMessage,
        ephemeral: true 
      });
    }
    return;
  }

  // Normal embed editor
  await btnInteraction.showModal(
    new ModalBuilder({
      customId: "EMBED_MODAL",
      title: "Embed Generator",
      components: [
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("title")
            .setLabel("Embed Title")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("description")
            .setLabel("Embed Description")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("color")
            .setLabel("Embed Color")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("footer")
            .setLabel("Embed Footer")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
      ],
    })
  );

  const modal = await btnInteraction
    .awaitModalSubmit({
      time: 1 * 60 * 1000,
      filter: (m) => m.customId === "EMBED_MODAL" && m.member.id === member.id,
    })
    .catch((ex) => {});

  if (!modal) return sentMsg.edit({ content: "No response received", components: [] });

  const title = modal.fields.getTextInputValue("title");
  const description = modal.fields.getTextInputValue("description");
  const footer = modal.fields.getTextInputValue("footer");
  const color = modal.fields.getTextInputValue("color");

  const embed = new EmbedBuilder();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (footer) embed.setFooter({ text: footer });
  if ((color && isValidColor(color)) || (color && isHex(color))) embed.setColor(color);

  // Add timestamp and author
  embed.setTimestamp();
  embed.setAuthor({ name: member.user.tag });

  // If no fields were provided, add a default description
  if (!title && !description && !footer && !color) {
    embed.setDescription("\u200b");
  }

  const embedMessage = await commandChannel.send({
    content: `Preview of embed that will be sent to ${targetChannel}:`,
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents([
        new ButtonBuilder().setCustomId("EMBED_FIELD_ADD").setLabel("Add Field").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("EMBED_FIELD_REM").setLabel("Remove Field").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("EMBED_FIELD_DONE").setLabel("Send Embed").setStyle(ButtonStyle.Primary)
      ])
    ]
  });

  await modal.reply({ content: "Embed created! You can now add fields or click Send Embed when finished.", ephemeral: true });
  await sentMsg.delete().catch(() => {});

  const collector = commandChannel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.member.id === member.id && i.message.id === embedMessage.id,
    idle: 5 * 60 * 1000,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "EMBED_FIELD_ADD") {
      await interaction.showModal(
        new ModalBuilder({
          customId: "EMBED_ADD_FIELD_MODAL",
          title: "Add Field",
          components: [
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("name")
                .setLabel("Field Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("value")
                .setLabel("Field Value")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("inline")
                .setLabel("Inline? (true/false)")
                .setStyle(TextInputStyle.Short)
                .setValue("true")
                .setRequired(true)
            ),
          ],
        })
      );

      const fieldModal = await interaction
        .awaitModalSubmit({
          time: 5 * 60 * 1000,
          filter: (m) => m.customId === "EMBED_ADD_FIELD_MODAL" && m.member.id === member.id,
        })
        .catch((ex) => {});

      if (!fieldModal) return;

      await fieldModal.reply({ content: "Field added", ephemeral: true });

      const name = fieldModal.fields.getTextInputValue("name");
      const value = fieldModal.fields.getTextInputValue("value");
      let inline = fieldModal.fields.getTextInputValue("inline").toLowerCase();

      if (inline === "true") inline = true;
      else if (inline === "false") inline = false;
      else inline = true;

      const fields = embed.data.fields || [];
      fields.push({ name, value, inline });
      embed.setFields(fields);
      await embedMessage.edit({ embeds: [embed] });
    }

    if (interaction.customId === "EMBED_FIELD_REM") {
      const fields = embed.data.fields;
      if (fields && fields.length > 0) {
        fields.pop();
        embed.setFields(fields);
        await interaction.reply({ content: "Field removed", ephemeral: true });
        await embedMessage.edit({ embeds: [embed] });
      } else {
        await interaction.reply({ content: "There are no fields to remove", ephemeral: true });
      }
    }

    if (interaction.customId === "EMBED_FIELD_DONE") {
      collector.stop();
      await targetChannel.send({ embeds: [embed] });
      await interaction.reply({ content: `Embed sent to ${targetChannel}!`, ephemeral: true });
    }
  });

  collector.on("end", async () => {
    await embedMessage.edit({ components: [] });
  });
}

/**
 * @param {import('discord.js').GuildTextBasedChannel} commandChannel
 * @param {import('discord.js').Message} messageToEdit
 * @param {import('discord.js').GuildMember} member
 */
async function editEmbed(commandChannel, messageToEdit, member) {
  const currentData = {
    content: messageToEdit.content || "",
    embeds: messageToEdit.embeds.map(embed => embed.toJSON()) || [],
    components: messageToEdit.components.map(comp => comp.toJSON()) || []
  };

  const sentMsg = await commandChannel.send({
    content: "Edit your embed using JSON:",
    components: [
      new ActionRowBuilder().addComponents([
        new ButtonBuilder().setCustomId("EMBED_JSON").setLabel("JSON Editor").setStyle(ButtonStyle.Success)
      ]),
    ],
  });

  const btnInteraction = await commandChannel
    .awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.customId === "EMBED_JSON" && i.member.id === member.id && i.message.id === sentMsg.id,
      time: 20000,
    })
    .catch((ex) => {});

  if (!btnInteraction) return sentMsg.edit({ content: "No response received", components: [] });

  await btnInteraction.showModal(
    new ModalBuilder({
      customId: "EMBED_JSON_MODAL",
      title: "Edit Embed via JSON",
      components: [
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("json")
            .setLabel("Embed JSON")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setValue(JSON.stringify(currentData, null, 2))
            .setPlaceholder("Edit the JSON here. Make sure to maintain valid JSON format!")
            .setMaxLength(4000)
        ),
      ],
    })
  );

  const modal = await btnInteraction
    .awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (m) => m.customId === "EMBED_JSON_MODAL" && m.member.id === member.id,
    })
    .catch((ex) => {});

  if (!modal) return sentMsg.edit({ content: "No response received", components: [] });

  try {
    const jsonInput = modal.fields.getTextInputValue("json");
    if (!jsonInput || jsonInput.trim() === '') {
      throw new Error("Empty JSON input");
    }
    
    const jsonData = JSON.parse(jsonInput.trim());
    
    // Validate that we have at least some data
    if (!jsonData || ((!jsonData.content && !jsonData.embeds?.length && !jsonData.components?.length))) {
      throw new Error("Invalid message structure - must include content, embeds, or components");
    }

    await messageToEdit.edit(jsonData);
    await modal.reply({ content: "Message updated successfully!", ephemeral: true });
    await sentMsg.delete().catch(() => {});
  } catch (e) {
    console.error(e);
    let errorMessage = "Error occurred while updating the message. ";
    
    if (e.message === "Empty JSON input") {
      errorMessage += "The JSON input was empty. Please provide valid JSON data.";
    } else if (e.message.includes("Unexpected end of JSON")) {
      errorMessage += "The JSON appears to be incomplete. Please make sure you copied the entire JSON data.";
    } else if (e.message.includes("Invalid message structure")) {
      errorMessage += "The JSON must include at least content, embeds, or components.";
    } else {
      errorMessage += "Make sure your JSON is properly formatted and complete.";
    }
    
    await modal.reply({ 
      content: errorMessage,
      ephemeral: true 
    });
  }
}