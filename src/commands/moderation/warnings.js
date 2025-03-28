const { EmbedBuilder, ApplicationCommandOptionType } = require("discord.js");
const { getWarningLogs, clearWarningLogs } = require("@schemas/ModLog");
const { getMember } = require("@schemas/Member");

module.exports = {
  name: "warnings",
  description: "list, clear, or remove warnings from a user",
  category: "MODERATION",
  userPermissions: ["KickMembers"],
  command: {
    enabled: true,
    minArgsCount: 1,
    subcommands: [
      {
        trigger: "list [member]",
        description: "list all warnings for a user",
      },
      {
        trigger: "clear <member>",
        description: "clear all warnings for a user",
      },
      {
        trigger: "remove <member>",
        description: "remove 1 warning from a user",
      },
    ],
  },
  slashCommand: {
    enabled: true,
    options: [
      {
        name: "list",
        description: "list all warnings for a user",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "user",
            description: "the target member",
            type: ApplicationCommandOptionType.User,
            required: true,
          },
        ],
      },
      {
        name: "clear",
        description: "clear all warnings for a user",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "user",
            description: "the target member",
            type: ApplicationCommandOptionType.User,
            required: true,
          },
        ],
      },
      {
        name: "remove",
        description: "remove 1 warning from a user",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "user",
            description: "the target member",
            type: ApplicationCommandOptionType.User,
            required: true,
          },
        ],
      },
    ],
  },

  async messageRun(message, args) {
    const sub = args[0]?.toLowerCase();
    let response = "";

    // Resolve target (works for bots too)
    const target = await message.guild.resolveMember(args[1], true);
    if (!target && sub !== "list") return message.safeReply(`No user found matching ${args[1]}`);

    switch (sub) {
      case "list":
        response = await listWarnings(target || message.member, message);
        break;
      case "clear":
        response = await clearWarnings(target, message);
        break;
      case "remove":
        response = await removeWarning(target, message);
        break;
      default:
        response = `Invalid subcommand ${sub}`;
    }

    await message.safeReply(response);
  },

  async interactionRun(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user");
    let response = "";

    // Fetch target (works for bots too)
    const target = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!target && sub !== "list") return interaction.followUp(`No user found matching ${user.tag}`);

    switch (sub) {
      case "list":
        response = await listWarnings(target || interaction.member, interaction);
        break;
      case "clear":
        response = await clearWarnings(target, interaction);
        break;
      case "remove":
        response = await removeWarning(target, interaction);
        break;
      default:
        response = `Invalid subcommand ${sub}`;
    }

    await interaction.followUp(response);
  },
};

// Updated functions
async function listWarnings(target, { guildId }) {
  const warnings = await getWarningLogs(guildId, target.id);
  if (!warnings.length) return `${target.user.username} has no warnings`;

  const acc = warnings.map((warning, i) => `${i + 1}. ${warning.reason} [By ${warning.admin?.username || "System"}]`).join("\n");
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${target.user.username}'s warnings` })
    .setDescription(acc)
    .setColor("#FFA500");

  return { embeds: [embed] };
}

async function clearWarnings(target, { guildId }) {
  const memberDb = await getMember(guildId, target.id);
  memberDb.warnings = 0;
  await memberDb.save();
  await clearWarningLogs(guildId, target.id);
  return `**${target.user.username}'s warnings have been cleared**`;
}

// New function
async function removeWarning(target, { guildId }) {
  const memberDb = await getMember(guildId, target.id);
  if (memberDb.warnings <= 0) return `**${target.user.username} has no warnings to remove**`;
  
  memberDb.warnings -= 1;
  await memberDb.save();
  return `**Removed 1 warning from ${target.user.username} (${target.user.username} now has: ${memberDb.warnings} Warnings!**)`;
}