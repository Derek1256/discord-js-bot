const { unBanTarget } = require("@helpers/ModUtils");
const { ApplicationCommandOptionType } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "unban",
  description: "Unbans the specified member",
  category: "MODERATION",
  botPermissions: ["BanMembers"],
  userPermissions: ["BanMembers"],
  command: {
    enabled: true,
    usage: "<ID|@member> [reason]",
    minArgsCount: 1,
  },
  slashCommand: {
    enabled: true,
    ephemeral: true,
    options: [
      {
        name: "name",
        description: "Match the name of the member",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: "reason",
        description: "Reason for unban",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },

  async messageRun(message, args) {
    const match = args[0];
    const reason = message.content.split(args[0])[1].trim();

    const user = await getMatchingBans(message.guild, match);
    if (!user) {
      return message.safeReply("No user found matching that ID/Tag.");
    }

    const status = await unBanTarget(message.member, user, reason);
    if (status === true) {
      return message.safeReply(`Unbanned ${user.username}!`);
    } else {
      return message.safeReply(`Failed to unban ${user.username}.`);
    }
  },

  async interactionRun(interaction) {
    const match = interaction.options.getString("name");
    const reason = interaction.options.getString("reason");

    const user = await getMatchingBans(interaction.guild, match);
    if (!user) {
      return interaction.followUp("No user found matching that ID/Tag.");
    }

    const status = await unBanTarget(interaction.member, user, reason);
    if (status === true) {
      return interaction.followUp(`Unbanned ${user.username}!`);
    } else {
      return interaction.followUp(`Failed to unban ${user.username}.`);
    }
  },
};

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} match
 */
async function getMatchingBans(guild, match) {
  const bans = await guild.bans.fetch({ cache: false });

  for (const [, ban] of bans) {
    if (ban.user.partial) await ban.user.fetch();

    // Exact match
    if (ban.user.id === match || ban.user.tag === match) {
      return ban.user;
    }

    // Partial match
    if (ban.user.username.toLowerCase().includes(match.toLowerCase())) {
      return ban.user;
    }
  }

  return null;
}
