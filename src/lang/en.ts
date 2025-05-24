// English language strings consolidated from lang/lang.en-US.json and lang/lang.common.json
// This replaces the Linguini internationalization system with a simple English-only approach

export const enStrings = {
  // Common data from lang.common.json
  bot: {
    name: "My Bot",
    author: "My Name"
  },
  emojis: {
    yes: "✅",
    no: "❌",
    enabled: "🟢",
    disabled: "🔴",
    info: "ℹ️",
    warning: "⚠️",
    previous: "◀️",
    next: "▶️",
    first: "⏪",
    last: "⏩",
    refresh: "🔄"
  },
  colors: {
    default: "#0099ff",
    success: "#00ff83",
    warning: "#ffcc66",
    error: "#ff4a4a"
  },
  links: {
    author: "https://github.com/",
    docs: "https://top.gg/",
    donate: "https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=EW389DYYSS4FC",
    invite: "https://discord.com/",
    source: "https://github.com/",
    stream: "https://www.twitch.tv/novakevin",
    support: "https://support.discord.com/",
    template: "https://github.com/KevinNovak/Discord-Bot-TypeScript-Template",
    terms: "https://github.com/KevinNovak/Discord-Bot-TypeScript-Template/blob/master/LEGAL.md#terms-of-service",
    vote: "https://top.gg/"
  },

  // Display embeds from lang.en-US.json data section
  displayEmbeds: {
    welcome: {
      title: "Thank you for using My Bot!",
      description: "Discord Bot TypeScript Template helps give developers a starting point for new Discord bots, so that much of the initial setup can be avoided and developers can instead focus on meaningful bot features.",
      fields: [
        {
          name: "Important Commands",
          value: "/help - Find help or contact support."
        },
        {
          name: "Links",
          value: "[View Documentation](https://top.gg/)\n[Join Support Server](https://support.discord.com/)"
        }
      ]
    },
    helpContactSupport: {
      title: "Help - Contact Support",
      description: "Have a question or feedback? Join our support server at the link below!",
      fields: [
        {
          name: "Links",
          value: "[Join Support Server](https://support.discord.com/)"
        }
      ]
    },
    helpCommands: {
      title: "Help - Commands",
      fields: [
        {
          name: "Commands",
          value: "To see the available commands, just type `/` and select the bot from the left side. You can then scroll through all available commands. Some commands may be hidden if you don't have permission to view them.\n\n/test - Run the test command.\n/info - View bot info."
        },
        {
          name: "Command Permissions",
          value: "Want to restrict commands to certain roles, users, or channels? Set up permissions in the bot's integration page by going to **Server Settings** > **Integrations**, and then **Manage** for this bot."
        },
        {
          name: "Links",
          value: "[View Documentation](https://top.gg/)\n[Join Support Server](https://support.discord.com/)"
        }
      ]
    },
    test: {
      description: "Test command works!"
    },
    viewDateJoined: {
      description: "{{TARGET}} joined on {{DATE}}!"
    },
    viewDateSent: {
      description: "This message was sent on {{DATE}}!"
    },
    about: {
      title: "My Bot - About",
      description: "Discord Bot TypeScript Template helps give developers a starting point for new Discord bots, so that much of the initial setup can be avoided and developers can instead focus on meaningful bot features.",
      fields: [
        {
          name: "Author",
          value: "[My Name](https://github.com/)"
        },
        {
          name: "Links",
          value: "[View Source Code](https://github.com/)\n[View Documentation](https://top.gg/)\n[View Terms of Service](https://github.com/KevinNovak/Discord-Bot-TypeScript-Template/blob/master/LEGAL.md#terms-of-service)\n[Vote for My Bot!](https://top.gg/)\n[Donate via PayPal](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=EW389DYYSS4FC)\n[Join Support Server](https://support.discord.com/)\n[Invite My Bot to a Server!](https://discord.com/)"
        },
        {
          name: "Created With",
          value: "[Discord Bot TypeScript Template](https://github.com/KevinNovak/Discord-Bot-TypeScript-Template)"
        }
      ]
    },
    translate: {
      title: "My Bot - Translations",
      description: "Thank you to our translators who have made it possible for My Bot to be used in the following languages. If you are interested in providing a translation, please contact the staff in our [support server](https://support.discord.com/)."
    },
    devInfo: {
      title: "My Bot - Developer Info",
      fields: [
        {
          name: "Versions",
          value: "**Node.js**: {{NODE_VERSION}}\n**TypeScript**: {{TS_VERSION}}\n**ECMAScript**: {{ES_VERSION}}\n**discord.js**: {{DJS_VERSION}}"
        },
        {
          name: "Stats",
          value: "**Shards**: {{SHARD_COUNT}}\n**Servers**: {{SERVER_COUNT}} ({{SERVER_COUNT_PER_SHARD}}/Shard)"
        },
        {
          name: "Memory",
          value: "**RSS**: {{RSS_SIZE}} ({{RSS_SIZE_PER_SERVER}}/Server)\n**Heap**: {{HEAP_TOTAL_SIZE}} ({{HEAP_TOTAL_SIZE_PER_SERVER}}/Server)\n**Used**: {{HEAP_USED_SIZE}} ({{HEAP_USED_SIZE_PER_SERVER}}/Server)"
        },
        {
          name: "IDs",
          value: "**Hostname**: {{HOSTNAME}}\n**Shard ID**: {{SHARD_ID}}\n**Server ID**: {{SERVER_ID}}\n**Bot ID**: {{BOT_ID}}\n**User ID**: {{USER_ID}}"
        }
      ]
    },
    admin: {
      listSeasonsSuccess: {
        title: "Seasons List{{#if statusFilter}} ({{statusFilter}}){{/if}}",
        description: "Found **{{totalCount}}** season{{#unless (eq totalCount 1)}}s{{/unless}}{{#if statusFilter}} with status **{{statusFilter}}**{{/if}}",
        fields: [
          {
            name: "Seasons",
            value: "{{#if seasons}}{{#each seasons}}**{{id}}** ({{status}})\n• Creator: {{creatorName}}\n• Players: {{playerCount}}/{{maxPlayers}} (min: {{minPlayers}})\n• Games: {{gameCount}}\n• Created: {{createdAt}}\n\n{{/each}}{{else}}No seasons found.{{/if}}"
          }
        ]
      },
      listPlayersSuccess: {
        title: "Players List{{#if seasonFilter}} (Season: {{seasonFilter}}){{/if}}{{#if bannedFilter}} (Banned Only){{/if}}",
        description: "Found **{{totalCount}}** player{{#unless (eq totalCount 1)}}s{{/unless}}{{#if seasonFilter}} in season **{{seasonFilter}}**{{/if}}{{#if bannedFilter}} that are banned{{/if}}",
        fields: [
          {
            name: "Players",
            value: "{{#if players}}{{#each players}}**{{name}}** ({{discordUserId}}){{#if isBanned}} 🚫{{/if}}\n• ID: {{id}}\n• Seasons: {{seasonCount}}, Turns: {{turnCount}}\n{{#if recentSeasons}}• Recent: {{#each recentSeasons}}{{id}} ({{status}}){{#unless @last}}, {{/unless}}{{/each}}\n{{/if}}• Created: {{createdAt}}\n\n{{/each}}{{else}}No players found.{{/if}}"
          }
        ]
      }
    },
    config: {
      viewSuccess: {
        title: "Season Configuration for Guild {{GUILD_ID}}",
        description: "Current default season configuration settings:",
        fields: [
          {
            name: "Turn Settings",
            value: "**Pattern:** {{TURN_PATTERN}}\n**Claim Timeout:** {{CLAIM_TIMEOUT}}"
          },
          {
            name: "Writing Settings",
            value: "**Timeout:** {{WRITING_TIMEOUT}}\n**Warning:** {{WRITING_WARNING}}"
          },
          {
            name: "Drawing Settings",
            value: "**Timeout:** {{DRAWING_TIMEOUT}}\n**Warning:** {{DRAWING_WARNING}}"
          },
          {
            name: "Season Settings",
            value: "**Open Duration:** {{OPEN_DURATION}}\n**Min Players:** {{MIN_PLAYERS}}\n**Max Players:** {{MAX_PLAYERS}}"
          },
          {
            name: "Info",
            value: "**Guild Default:** {{IS_GUILD_DEFAULT}}\n**Last Updated:** {{LAST_UPDATED}}"
          }
        ]
      }
    },
    seasonStatus: {
      title: "Season Status: {{seasonId}}",
      description: "**Status:** {{seasonStatus}}\n**Players:** {{playerCount}}/{{maxPlayers}} (min: {{minPlayers}})\n**Games:** {{gameCount}}",
      fields: [
        {
          name: "Game Details",
          value: "{{#each games}}**Game {{gameId}}** ({{gameStatus}})\n• Turns: {{completedTurns}}/{{totalTurns}} completed\n• Pending: {{pendingTurns}}, Offered: {{offeredTurns}}\n{{#if currentTurn}}• Current: Turn {{currentTurn.turnNumber}} ({{currentTurn.type}}) - {{currentTurn.status}} to {{currentTurn.playerName}}\n{{/if}}\n{{/each}}"
        }
      ]
    },
    seasonCompletion: {
      title: "**{{seasonId}}** COMPLETED 🎉",
      description: "Day {{daysElapsed}} {{progressBar}} {{completionPercentage}}%",
      fields: [
        {
          name: "Season Summary",
          value: "**Games:** {{totalGames}}\n**Players:** {{totalPlayers}}\n**Turns:** {{completedTurns}}/{{totalTurns}} completed"
        },
        {
          name: "Game Results",
          value: "{{gameResults}}"
        }
      ],
      footer: {
        text: "Season created by {{creatorName}}"
      }
    }
  },

  // Validation embeds
  validationEmbeds: {
    cooldownHit: {
      description: "You can only run this command {{AMOUNT}} time(s) every {{INTERVAL}}. Please wait before attempting this command again.",
      color: "#ffcc66"
    },
    devOnly: {
      description: "This action can only be done by developers.",
      color: "#ffcc66"
    },
    adminOnly: {
      description: "This action can only be done by administrators.",
      color: "#ffcc66"
    },
    missingClientPerms: {
      description: "I don't have all permissions required to run that command here! Please check the server and channel permissions to make sure I have the following permissions.\n\nRequired permissions: {{PERMISSIONS}}",
      color: "#ffcc66"
    }
  },

  // Error embeds
  errorEmbeds: {
    command: {
      description: "Something went wrong!",
      fields: [
        {
          name: "Error code",
          value: "{{ERROR_CODE}}"
        },
        {
          name: "Server ID",
          value: "{{GUILD_ID}}"
        },
        {
          name: "Shard ID",
          value: "{{SHARD_ID}}"
        },
        {
          name: "Contact support",
          value: "https://support.discord.com/"
        }
      ],
      color: "#ff4a4a"
    },
    startupInProcess: {
      description: "My Bot is still starting up. Try again later.",
      color: "#ffcc66"
    },
    notImplemented: {
      description: "This feature has not been implemented yet!",
      color: "#ffcc66"
    },
    guildOnly: {
      description: "This command can only be used in a server.",
      color: "#ffcc66"
    }
  },

  // Channel regexes
  channelRegexes: {
    bot: "/bot|command|cmd/i"
  },

  // References section
  meta: {
    translators: "[TranslatorName#1234](https://github.com/)"
  },
  
  chatCommands: {
    dev: "dev",
    help: "help",
    info: "info",
    test: "test",
    status: "status",
    admin: "admin",
    config: "config"
  },

  userCommands: {
    viewDateJoined: "View Date Joined"
  },

  messageCommands: {
    viewDateSent: "View Date Sent"
  },

  arguments: {
    command: "command",
    option: "option",
    season: "season"
  },

  commandDescs: {
    dev: "Developer use only.",
    help: "Find help or contact support.",
    info: "View bot info.",
    test: "Run the test command.",
    new: "Create a new season. Use this command to start a new game flow.",
    status: "Get status information for a season.",
    admin: "Administrative commands for managing the bot.",
    config: "Configuration commands for managing bot settings."
  },

  argDescs: {
    devCommand: "Command.",
    helpOption: "Option.",
    infoOption: "Option.",
    season: "The ID of the season to check status for."
  },

  fields: {
    commands: "Commands",
    links: "Links"
  },

  permissions: {
    AddReactions: "Add Reactions",
    Administrator: "Administrator",
    AttachFiles: "Attach Files",
    BanMembers: "Ban Members",
    ChangeNickname: "Change Nickname",
    Connect: "Connect",
    CreateEvents: "Create Events",
    CreateGuildExpressions: "Create Expressions",
    CreateInstantInvite: "Create Invite",
    CreatePrivateThreads: "Create Private Threads",
    CreatePublicThreads: "Create Public Threads",
    DeafenMembers: "Deafen Members",
    EmbedLinks: "Embed Links",
    KickMembers: "Kick Members",
    ManageChannels: "Manage Channel(s)",
    ManageEmojisAndStickers: "Manage Emoji and Stickers",
    ManageEvents: "Manage Events",
    ManageGuild: "Manage Server",
    ManageGuildExpressions: "Manage Expressions",
    ManageMessages: "Manage Messages",
    ManageNicknames: "Manage Nicknames",
    ManageRoles: "Manage Roles / Permissions",
    ManageThreads: "Manage Threads / Posts",
    ManageWebhooks: "Manage Webhooks",
    MentionEveryone: "Mention Everyone, Here, and All Roles",
    ModerateMembers: "Timeout Members",
    MoveMembers: "Move Members",
    MuteMembers: "Mute Members",
    PrioritySpeaker: "Priority Speaker",
    ReadMessageHistory: "Read Message History",
    RequestToSpeak: "Request to Speak",
    SendMessages: "Send Messages / Create Posts",
    SendMessagesInThreads: "Send Messages in Threads / Posts",
    SendPolls: "Create Polls",
    SendTTSMessages: "Send Text-to-Speech Messages",
    SendVoiceMessages: "Send Voice Messages",
    Speak: "Speak",
    Stream: "Video",
    UseApplicationCommands: "Use Application Commands",
    UseEmbeddedActivities: "Use Activities",
    UseExternalApps: "Use External Apps",
    UseExternalEmojis: "Use External Emoji",
    UseExternalSounds: "Use External Sounds",
    UseExternalStickers: "Use External Stickers",
    UseSoundboard: "Use Soundboard",
    UseVAD: "Use Voice Activity",
    ViewAuditLog: "View Audit Log",
    ViewChannel: "View Channel(s)",
    ViewCreatorMonetizationAnalytics: "View Server Subscription Insights",
    ViewGuildInsights: "View Server Insights"
  },

  devCommandNames: {
    info: "info"
  },

  helpOptions: {
    contactSupport: "Contact Support",
    commands: "Commands"
  },

  helpOptionDescs: {
    contactSupport: "❓ Contact Support ❓",
    commands: "Commands -- What commands are there? How do I restrict who is allowed to use commands?"
  },

  infoOptions: {
    about: "About",
    translate: "Translate"
  },

  yesNo: {
    yes: "Yes",
    no: "No"
  },

  boolean: {
    true: "True",
    false: "False"
  },

  other: {
    na: "N/A"
  },

  // Messages section
  messages: {
    joinSeason: {
      success: "You have successfully joined season with ID: **{{seasonId}}**!\nThe season will start in {{timeRemaining}}, or once {{playersNeeded}} more players join!",
      seasonNotFound: "Season '{{seasonId}}' not found.",
      notOpen: "Season with ID '{{seasonId}}' is not currently open for joining.",
      alreadyJoined: "You have already joined season with ID '{{seasonId}}'.",
      full: "Season with ID '{{seasonId}}' is full.",
      playerNotFound: "Your player profile could not be found. Please try again later or contact support.",
      genericError: "An unknown error occurred while trying to join season '{{seasonId}}'. Error: {{errorMessage}}"
    },
    status: {
      seasonNotFound: "Season '{{seasonId}}' not found.",
      genericError: "An error occurred while retrieving status for season '{{seasonId}}'. Error: {{errorMessage}}"
    },
    newSeason: {
      createSuccessChannel: "{{mentionUser}} has started a new season with ID: **{{seasonId}}**\nSeason will remain open for joining for {{openDuration}}.\nUse `/join season:{{seasonId}}` to join!",
      seasonActivateSuccess: "🎉 **Season {{seasonId}} has been activated!** 🎉\n\n**Status:** {{status}}\n**Games Created:** {{gamesCreated}}\n**Players:** {{playersInSeason}}\n\nThe games have begun! Players will receive their first turn offers shortly.",
      errorMinMaxPlayers: "Minimum players ({{minPlayers}}) cannot be greater than maximum players ({{maxPlayers}}).",
      errorCreatorNotFound: "Your player profile could not be found (Discord ID: {{discordUserId}}). Please try again later or contact support.",
      errorPlayerCreateFailed: "Failed to create your player profile (Discord ID: {{discordId}}). Please try again later or contact support.",
      errorDatabase: "A database error occurred. Please try again later or contact support. (Details: {{details}})",
      errorUnknownService: "An unknown error occurred while processing your request. Please try again later or contact support. (Details: {{details}})",
      errorGenericService: "A generic error occurred in the service. Please try again later or contact support. (Details: {{details}})",
      errorUnknown: "An unknown error occurred while creating the season. Message: {{message}}"
    },
    newCommand: {
      errorUnknownSubcommand: "That subcommand for 'new' isn't recognized. Please check the command and try again."
    },
    common: {
      errorCriticalCommand: "A critical unexpected error occurred. Please contact support."
    },
    admin: {
      terminateSeasonSuccess: "Season **{{seasonId}}** has been successfully terminated.\n**Previous Status:** {{previousStatus}}\n**Players:** {{playerCount}}\n**Games:** {{gameCount}}",
      terminateSeasonErrorNotFound: "Season '{{seasonId}}' not found.",
      terminateSeasonErrorAlreadyTerminated: "Season '{{seasonId}}' is already terminated.",
      terminateSeasonErrorDatabase: "A database error occurred while terminating season '{{seasonId}}'. Error code: {{errorCode}}",
      terminateSeasonErrorUnknown: "An unknown error occurred while terminating season '{{seasonId}}'. {{message}}",
      listSeasonsError: "An error occurred while retrieving seasons. Error: {{error}}",
      listPlayersError: "An error occurred while retrieving players. Error: {{error}}",
      playerBanSuccess: "Player {{playerName}} has been successfully banned.",
      playerBanError: "An error occurred while banning the player. Please try again.",
      playerBanNotFound: "Player not found.",
      playerBanAlreadyBanned: "Player {{playerName}} is already banned.",
      playerUnbanSuccess: "Player {{playerName}} has been successfully unbanned.",
      playerUnbanError: "An error occurred while unbanning the player. Please try again.",
      playerUnbanNotFound: "Player not found.",
      playerUnbanNotBanned: "Player {{playerName}} is not currently banned."
    },
    config: {
      updateSuccess: "Configuration updated successfully for guild {{guildId}}!\n**Updated fields:** {{updatedFields}}",
      validationError: "Invalid configuration value for **{{field}}**: {{error}}",
      databaseError: "Database error occurred while updating configuration. Error code: {{errorCode}}",
      unknownError: "An unknown error occurred while updating configuration: {{message}}",
      noUpdatesProvided: "No configuration updates were provided. Please specify at least one setting to update."
    },
    turnOffer: {
      newTurnAvailable: "🎨 **New Turn Available!** 🎨\n\n**Game:** {{gameId}}\n**Season:** {{seasonId}}\n**Turn:** {{turnNumber}} ({{turnType}})\n\nYou have **{{claimTimeoutMinutes}} minutes** to claim this turn. React with ✅ to claim it!"
    },
    game: {
      seasonId: "Season ID: {{seasonId}}"
    },
    turnTimeout: {
      submissionTimeoutSkipped: "Turn submission timed out and was automatically skipped."
    },
    ready: {
      playerNotFound: "Player profile not found. Please try again later or contact support.",
      noOfferedTurns: "You have no offered turns available to claim.",
      alreadyHasPendingTurn: "You already have a pending turn to complete.",
      claimFailed: "Failed to claim the turn. Please try again.",
      claimSuccess: "Turn claimed successfully! You can now submit your response."
    },
    submission: {
      playerNotFound: "Player profile not found. Please try again later or contact support.",
      noPendingTurns: "You have no pending turns to submit.",
      noAttachmentFound: "No attachment found. Please attach a file with your submission.",
      invalidFileType: "Invalid file type. Please submit a valid image file or text document.",
      noContentFound: "No content found in the submission. Please provide text or attach a file.",
      wrongContentType: "Incorrect content type for this turn. Please check the turn requirements.",
      submitFailed: "Failed to submit your turn. Please try again.",
      submitSuccess: "Turn submitted successfully!"
    }
  }
} as const;

// Helper function to get nested values using dot notation
export function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Helper function to replace variables in strings
export function replaceVariables(template: string, variables: Record<string, string> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] || match);
} 