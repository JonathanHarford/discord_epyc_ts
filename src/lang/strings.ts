// Simple strings - no more complex language layer
// Direct string access as god intended

export const strings = {
  // Bot info
  bot: {
    name: "My Bot",
    author: "My Name"
  },

  // Common UI elements
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

  // Command names
  commands: {
    dev: "dev",
    help: "help",
    info: "info",
    test: "test",
    new: "new",
    join: "join",
    status: "status",
    admin: "admin",
    config: "config"
  },

  // Chat command names (for slash commands)
  chatCommands: {
    admin: "admin",
    config: "config",
    dev: "dev",
    help: "help",
    info: "info",
    test: "test",
    new: "new",
    join: "join",
    status: "status"
  },

  // Command descriptions
  commandDescs: {
    dev: "Developer commands.",
    help: "Find help or contact support.",
    info: "View bot info.",
    test: "Run the test command.",
    new: "Create a new season. Use this command to start a new game flow.",
    join: "Join an existing season.",
    status: "Get status information for a season.",
    admin: "Administrative commands for managing the bot.",
    config: "Configuration commands for managing bot settings."
  },

  // Simple messages
  messages: {
    testWorks: "Test command works!",
    na: "N/A",
    
    // Join season messages
    joinSeason: {
      success: "You have successfully joined season with ID: **{seasonId}**!\nThe season will start in {timeRemaining}, or once {playersNeeded} more players join!",
      seasonNotFound: "Season '{seasonId}' not found.",
      notOpen: "Season with ID '{seasonId}' is not currently open for joining.",
      alreadyJoined: "You have already joined season with ID '{seasonId}'.",
      full: "Season with ID '{seasonId}' is full.",
      playerNotFound: "Your player profile could not be found. Please try again later or contact support.",
      genericError: "An unknown error occurred while trying to join season '{seasonId}'. Error: {errorMessage}"
    },

    // New season messages
    newSeason: {
      createSuccessChannel: "{mentionUser} has started a new season with ID: **{seasonId}**\nSeason will remain open for joining for {openDuration}.\nUse `/join season:{seasonId}` to join!",
      seasonActivateSuccess: "🎉 **Season {seasonId} has been activated!** 🎉\n\n**Status:** {status}\n**Games Created:** {gamesCreated}\n**Players:** {playersInSeason}\n\nThe games have begun! Players will receive their first turn offers shortly.",
      errorMinMaxPlayers: "Minimum players ({minPlayers}) cannot be greater than maximum players ({maxPlayers}).",
      errorCreatorNotFound: "Your player profile could not be found (Discord ID: {discordUserId}). Please try again later or contact support.",
      errorPlayerCreateFailed: "Failed to create your player profile (Discord ID: {discordId}). Please try again later or contact support.",
      errorDatabase: "A database error occurred. Please try again later or contact support. (Details: {details})",
      errorUnknownService: "An unknown error occurred while processing your request. Please try again later or contact support. (Details: {details})",
      errorGenericService: "A generic error occurred in the service. Please try again later or contact support. (Details: {details})",
      errorUnknown: "An unknown error occurred while creating the season. Message: {message}"
    },

    // Status messages
    status: {
      seasonNotFound: "Season '{seasonId}' not found.",
      genericError: "An error occurred while retrieving status for season '{seasonId}'. Error: {errorMessage}"
    },

    // Common messages
    common: {
      errorCriticalCommand: "A critical unexpected error occurred. Please contact support."
    },

    // Admin messages
    admin: {
      notAdmin: "You do not have permission to use admin commands.",
      terminateSeasonSuccess: "Season **{seasonId}** has been successfully terminated.\n**Previous Status:** {previousStatus}\n**Players:** {playerCount}\n**Games:** {gameCount}",
      terminateSeasonErrorNotFound: "Season '{seasonId}' not found.",
      terminateSeasonErrorAlreadyTerminated: "Season '{seasonId}' is already terminated.",
      terminateSeasonErrorDatabase: "A database error occurred while terminating season '{seasonId}'. Error code: {errorCode}",
      terminateSeasonErrorUnknown: "An unknown error occurred while terminating season '{seasonId}'. {message}",
      listSeasonsError: "An error occurred while retrieving seasons. Error: {error}",
      listPlayersError: "An error occurred while retrieving players. Error: {error}",
      listPlayersSuccess: "Successfully retrieved {totalCount} players.",
      
      player: {
        ban: {
          success: "Player {playerName} has been successfully banned.{reason}",
          error: "An error occurred while banning the player. Please try again.",
          notFound: "Player not found.",
          alreadyBanned: "Player {playerName} is already banned."
        },
        unban: {
          success: "Player {playerName} has been successfully unbanned.",
          error: "An error occurred while unbanning the player. Please try again.",
          notFound: "Player not found.",
          notBanned: "Player {playerName} is not currently banned."
        }
      }
    },

    // Season specific messages
    season: {
      // Join season messages - mapping old LangKeys to specific keys
      joinSuccess: "You have successfully joined season with ID: **{seasonId}**!\nThe season will start in {timeRemaining}, or once {playersNeeded} more players join!",
      joinSeasonNotFound: "Season '{seasonId}' not found.",
      joinNotOpen: "Season with ID '{seasonId}' is not currently open for joining.",
      joinAlreadyJoined: "You have already joined season with ID '{seasonId}'.",
      joinFull: "Season with ID '{seasonId}' is full.",
      joinPlayerNotFound: "Your player profile could not be found. Please try again later or contact support.",
      joinSuccessButActivationFailed: "You have successfully joined season **{seasonId}** (now {playerCount} players), but there was an issue automatically starting the season. An administrator has been notified and will investigate.",
      
      // Season activation
      activateSuccess: "🎉 **Season {seasonId} has been activated!** 🎉\n\n**Status:** {status}\n**Games Created:** {gamesCreated}\n**Players:** {playersInSeason}\n\nThe games have begun! Players will receive their first turn offers shortly.",
      
      // Admin season actions
      adminTerminateSuccess: "Season **{seasonId}** has been successfully terminated.\n**Previous Status:** {previousStatus}\n**Players:** {playerCount}\n**Games:** {gameCount}",
      adminTerminateErrorNotFound: "Season '{seasonId}' not found.",
      adminTerminateErrorAlreadyTerminated: "Season '{seasonId}' is already terminated.",
      adminTerminateErrorDatabase: "A database error occurred while terminating season '{seasonId}'. Error code: {errorCode}",
      adminTerminateErrorUnknown: "An unknown error occurred while terminating season '{seasonId}'. {message}",
      adminListSeasonsError: "An error occurred while retrieving seasons. Error: {error}",
      
      // Season completion
      completionAnnouncement: "🎊 **Season {seasonId} Complete!** 🎊\n\n**Duration:** {daysElapsed} days\n**Completion:** {completionPercentage}% ({completedTurns}/{totalTurns} turns)\n**Games:** {totalGames}\n**Players:** {totalPlayers}\n\nCreated by: {creatorName}\n\n{gameResults}",
      completionFallbackAnnouncement: "🎊 **Season {seasonId} Complete!** 🎊\n\nSeason completion details are available. Check the season status for more information.",
      
      // Season activation notifications
      activationSuccessNotification: "🎉 **Your Season is Now Active!** 🎉\n\nHi {creatorName}! Your season **{seasonId}** has been successfully activated!\n\n**Games Created:** {gamesCreated}\n**Players:** {playersInSeason}\n\nPlayers will start receiving their turn offers shortly. Good luck with your season!",
      activationSuccessChannelNotification: "🎉 **Season {seasonId} Activated!** 🎉\n\nThe season has been automatically activated and is now ready for play!\n\n**Games Created:** {gamesCreated}\n**Players:** {playersInSeason}\n\nPlayers will receive their first turn offers shortly.",
      activationFailureAdminNotification: "⚠️ **Season Activation Failed** ⚠️\n\n**Season ID:** {seasonId}\n**Error:** {errorKey}\n**Triggered By:** {triggeredBy}\n**Creator:** {creatorName} ({creatorDiscordId})\n**Player Count:** {playerCount}\n**Timestamp:** {timestamp}\n\n**Error Details:**\n```json\n{errorData}\n```\n\nPlease investigate and take appropriate action.",
      activationFailureCreatorNotification: "❌ **Season Activation Failed** ❌\n\nHi {creatorName}, unfortunately your season **{seasonId}** failed to activate automatically.\n\n**Reason:** {errorType}\n**Triggered By:** {triggeredBy}\n\nAn administrator has been notified and will investigate the issue. You may try creating a new season or contact support for assistance."
    },

    // Config messages
    config: {
      updateSuccess: "Configuration updated successfully for guild {guildId}!\n**Updated fields:** {updatedFields}",
      validationError: "Invalid configuration value for **{field}**: {error}",
      databaseError: "Database error occurred while updating configuration. Error code: {errorCode}",
      unknownError: "An unknown error occurred while updating configuration: {message}",
      noUpdatesProvided: "No configuration updates were provided. Please specify at least one setting to update."
    },

    // Turn messages
    turnOffer: {
      newTurnAvailable: "🎨 **New Turn Available!** 🎨\n\n**Game:** {gameId}\n**Season:** {seasonId}\n**Turn:** {turnNumber} ({turnType})\n\nYou have **{claimTimeoutMinutes} minutes** to claim this turn. React with ✅ to claim it!",
      initialTurnOffer: "🎮 **Your First Turn!** 🎮\n\n**Game:** {gameId}\n**Season:** {seasonId}\n**Turn Type:** {turnType}\n\nIt's your first turn in this game! Please type `/ready` in this DM to claim your turn.\n\n⏰ You have **{claimTimeoutMinutes} minutes** to claim it before it's offered to another player."
    },

    // Game messages
    game: {
      seasonId: "Season ID: {seasonId}"
    },

    // Turn timeout messages
    turnTimeout: {
      submissionTimeoutSkipped: "Turn submission timed out and was automatically skipped."
    },

    // Ready messages
    ready: {
      playerNotFound: "Player profile not found. Please try again later or contact support.",
      noOfferedTurns: "You have no offered turns available to claim.",
      alreadyHasPendingTurn: "You already have a pending turn to complete.",
      claimFailed: "Failed to claim the turn. Please try again.",
      claimSuccess: "Turn claimed successfully! You can now submit your response."
    },

    // Submission messages
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
  },

  // Embed content
  embeds: {
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

    devInfo: {
      title: "My Bot - Developer Info",
      fields: [
        {
          name: "Versions",
          value: "**Node.js**: {NODE_VERSION}\n**TypeScript**: {TS_VERSION}\n**ECMAScript**: {ES_VERSION}\n**discord.js**: {DJS_VERSION}"
        },
        {
          name: "Stats",
          value: "**Shards**: {SHARD_COUNT}\n**Servers**: {SERVER_COUNT} ({SERVER_COUNT_PER_SHARD}/Shard)"
        },
        {
          name: "Memory",
          value: "**RSS**: {RSS_SIZE} ({RSS_SIZE_PER_SERVER}/Server)\n**Heap**: {HEAP_TOTAL_SIZE} ({HEAP_TOTAL_SIZE_PER_SERVER}/Server)\n**Used**: {HEAP_USED_SIZE} ({HEAP_USED_SIZE_PER_SERVER}/Server)"
        },
        {
          name: "IDs",
          value: "**Hostname**: {HOSTNAME}\n**Shard ID**: {SHARD_ID}\n**Server ID**: {SERVER_ID}\n**Bot ID**: {BOT_ID}\n**User ID**: {USER_ID}"
        }
      ]
    },

    seasonStatus: {
      title: "Season Status: {seasonId}",
      description: "**Status:** {seasonStatus}\n**Players:** {playerCount}/{maxPlayers} (min: {minPlayers})\n**Games:** {gameCount}",
      fields: [
        {
          name: "Game Details",
          value: "{gameDetails}"
        }
      ]
    },

    configView: {
      title: "Season Configuration for Guild {GUILD_ID}",
      description: "Current default season configuration settings:",
      fields: [
        {
          name: "Turn Settings",
          value: "**Pattern:** {TURN_PATTERN}\n**Claim Timeout:** {CLAIM_TIMEOUT}"
        },
        {
          name: "Writing Settings", 
          value: "**Timeout:** {WRITING_TIMEOUT}\n**Warning:** {WRITING_WARNING}"
        },
        {
          name: "Drawing Settings",
          value: "**Timeout:** {DRAWING_TIMEOUT}\n**Warning:** {DRAWING_WARNING}"
        },
        {
          name: "Season Settings",
          value: "**Open Duration:** {OPEN_DURATION}\n**Min Players:** {MIN_PLAYERS}\n**Max Players:** {MAX_PLAYERS}"
        },
        {
          name: "Info",
          value: "**Guild Default:** {IS_GUILD_DEFAULT}\n**Last Updated:** {LAST_UPDATED}"
        }
      ]
    },

    // Admin embeds
    admin: {
      listSeasonsSuccess: {
        title: "Seasons List ({totalCount} total)",
        description: "{statusFilter}",
        fields: [
          {
            name: "Seasons",
            value: "{seasonsDetails}"
          }
        ]
      }
    },

    // Error embeds
    errorEmbeds: {
      notImplemented: {
        title: "Not Implemented",
        description: "This feature is not yet implemented."
      },
      command: {
        title: "Command Error",
        description: "An error occurred while executing the command.\n\n**Error Code:** {ERROR_CODE}\n**Guild ID:** {GUILD_ID}\n**Shard ID:** {SHARD_ID}"
      }
    }
  },

  // Command arguments and descriptions
  arguments: {
    command: "command",
    option: "option", 
    season: "season"
  },

  argDescs: {
    devCommand: "Developer command to run",
    helpOption: "Help option to view",
    season: "The season ID to interact with"
  },

  devCommandNames: {
    info: "info"
  },

  helpOptionDescs: {
    contactSupport: "Contact support",
    commands: "View available commands"
  },

  infoOptions: {
    about: "About this bot",
    translate: "Translation info"
  },

  // Permissions
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
  }
} as const;

// Simple string interpolation function
export function interpolate(template: string, variables: Record<string, any> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : match;
  });
}

// Helper to get nested properties  
export function getStringValue(path: string): string {
  const parts = path.split('.');
  let current: any = strings;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      console.warn(`String path not found: ${path}`);
      return path; // Return the path itself as fallback
    }
  }
  
  return typeof current === 'string' ? current : JSON.stringify(current);
} 