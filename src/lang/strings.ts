// Simple strings - no more complex language layer
// Direct string access as god intended

export const strings = {
  // Game configuration
  game: {
    name: 'Eat Poop You Cat'
  },

  // Bot info
  bot: {
    name: 'My Bot',
    author: 'My Name'
  },

  // Common UI elements
  emojis: {
    yes: '✅',
    no: '❌',
    enabled: '✅',
    disabled: '❌',
    info: 'ℹ️',
    warning: '⚠️',
    previous: '◀️',
    next: '▶️',
    first: '⏪',
    last: '⏩',
    refresh: '🔄'
  },

  colors: {
    default: '#0099ff',
    success: '#00ff83',
    warning: '#ffcc66',
    error: '#ff4a4a'
  },

  // Command names
  commands: {
    dev: 'dev',
    help: 'help',
    info: 'info',
    admin: 'admin',
    season: 'season',
    game: 'game'
  },

  // Chat command names (for slash commands)
  chatCommands: {
    admin: 'admin',
    dev: 'dev',
    help: 'help',
    info: 'info',
    season: 'season',
    game: 'game'
  },

  // Command descriptions
  commandDescs: {
    dev: 'Developer commands.',
    help: 'Find help or contact support.',
    info: 'View bot info.',
    admin: 'Administrative commands for managing players and seasons.',
    season: 'Season management commands - create, join, view, and manage seasons.',
    game: 'On-demand game management and participation commands.'
  },

    // Simple messages
  messages: {
    na: 'N/A',
    
    // Join season messages
    joinSeason: {
      success: `You have joined **{seasonId}**!
It will start in {timeRemaining}, or once {playersNeeded} more players join!`,
      seasonNotFound: '**{seasonId}** not found.',
      notOpen: '**{seasonId}** is not currently open for joining.',
      alreadyJoined: 'You have already joined **{seasonId}**.',
      full: '**{seasonId}** is full.',
      playerNotFound: 'Your player profile could not be found. Please try again later or contact support.',
      genericError: 'An unknown error occurred while trying to join **{seasonId}**. Error: {errorMessage}'
    },

    // New season messages
    newSeason: {
      createSuccessChannel: `{mentionUser} has started a new {gameName} season: **{seasonId}**
Season will remain open for joining for {openDuration}.
Use \`/join season:{seasonId}\` to join!`,
      seasonActivateSuccess: `🎉 **{seasonId} has been activated!** 🎉

**Status:** {status}
**Games Created:** {gamesCreated}
**Players:** {playersInSeason}

The games have begun! Players will receive their first turn offers shortly.`,
      errorMinMaxPlayers: 'Minimum players ({minPlayers}) cannot be greater than maximum players ({maxPlayers}).',
      errorCreatorNotFound: 'Your player profile could not be found (Discord ID: {discordUserId}). Please try again later or contact support.',
      errorPlayerCreateFailed: 'Failed to create your player profile (Discord ID: {discordId}). Please try again later or contact support.',
      errorDatabase: 'A database error occurred. Please try again later or contact support. (Details: {details})',
      errorUnknownService: 'An unknown error occurred while processing your request. Please try again later or contact support. (Details: {details})',
      errorGenericService: 'A generic error occurred in the service. Please try again later or contact support. (Details: {details})',
      errorUnknown: 'An unknown error occurred while creating the season. Message: {message}'
    },

    // Status messages
    status: {
      seasonNotFound: '{seasonId} not found.',
      genericError: 'An error occurred while retrieving status for {seasonId}. Error: {errorMessage}'
    },

    // Common messages
    common: {
      errorCriticalCommand: 'A critical unexpected error occurred. Please contact support.'
    },

    // Admin messages
    admin: {
      notAdmin: 'You do not have permission to use admin commands.',
      terminateSeasonSuccess: `**{seasonId}** has been successfully terminated.
**Previous Status:** {previousStatus}
**Players:** {playerCount}
**Games:** {gameCount}`,
      terminateSeasonErrorNotFound: '{seasonId} not found.',
      terminateSeasonErrorAlreadyTerminated: '{seasonId} is already terminated.',
      terminateSeasonErrorDatabase: 'A database error occurred while terminating {seasonId}. Error code: {errorCode}',
      terminateSeasonErrorUnknown: 'An unknown error occurred while terminating {seasonId}. {message}',
      listSeasonsError: 'An error occurred while retrieving seasons. Error: {error}',
      listPlayersError: 'An error occurred while retrieving players. Error: {error}',
      listPlayersSuccess: 'Successfully retrieved {totalCount} players.',
      
      player: {
        ban: {
          success: 'Player {playerName} has been successfully banned.{reason}',
          error: 'An error occurred while banning the player. Please try again.',
          notFound: 'Player not found.',
          alreadyBanned: 'Player {playerName} is already banned.'
        },
        unban: {
          success: 'Player {playerName} has been successfully unbanned.',
          error: 'An error occurred while unbanning the player. Please try again.',
          notFound: 'Player not found.',
          notBanned: 'Player {playerName} is not currently banned.'
        }
      }
    },

    // Season specific messages
    season: {
      // Join season messages - mapping old LangKeys to specific keys
      joinSuccess: `You have successfully joined **{seasonId}**!
The season will start in {timeRemaining}, or once {playersNeeded} more players join!`,
      joinSeasonNotFound: '{seasonId} not found.',
      joinNotOpen: '{seasonId} is not currently open for joining.',
      joinAlreadyJoined: 'You have already joined **{seasonId}**.',
      joinFull: '{seasonId} is full.',
      joinPlayerNotFound: 'Your player profile could not be found. Please try again later or contact support.',
      joinSuccessButActivationFailed: `You have successfully joined **{seasonId}** (now {playerCount} players), but there was an issue automatically starting the season. An administrator has been notified and will investigate.`,
      
      // Season activation
      activateSuccess: `🎉 **{seasonId} has been activated!** 🎉

**Status:** {status}
**Games Created:** {gamesCreated}
**Players:** {playersInSeason}

The games have begun! Players will receive their first turn offers shortly.`,
      
      // Admin season actions
      adminTerminateSuccess: `**{seasonId}** has been successfully terminated.
**Previous Status:** {previousStatus}
**Players:** {playerCount}
**Games:** {gameCount}`,
      adminTerminateErrorNotFound: '{seasonId} not found.',
      adminTerminateErrorAlreadyTerminated: '{seasonId} is already terminated.',
      adminTerminateErrorDatabase: 'A database error occurred while terminating {seasonId}. Error code: {errorCode}',
      adminTerminateErrorUnknown: 'An unknown error occurred while terminating {seasonId}. {message}',
      adminListSeasonsError: 'An error occurred while retrieving seasons. Error: {error}',
      
      // Season completion
      completionAnnouncement: `🎊 **{seasonId} Complete!** 🎊

**Duration:** {daysElapsed} days
**Completion:** {completionPercentage}% ({completedTurns}/{totalTurns} turns)
**Games:** {totalGames}
**Players:** {totalPlayers}

Created by: {creatorName}

{gameResults}`,
      completionFallbackAnnouncement: `🎊 **{seasonId} Complete!** 🎊

Season completion details are available. Check the season status for more information.`,
      
      // Season activation notifications
      activationSuccessNotification: `🎉 **Your Season is Now Active!** 🎉

Hi {creatorName}! Your season **{seasonId}** has been successfully activated!

**Games Created:** {gamesCreated}
**Players:** {playersInSeason}

Players will start receiving their turn offers shortly. Good luck with your season!`,
      activationSuccessChannelNotification: `🎉 **{seasonId} Activated!** 🎉

The season has been automatically activated and is now ready for play!

**Games Created:** {gamesCreated}
**Players:** {playersInSeason}

Players will receive their first turn offers shortly.`,
      activationFailureAdminNotification: `⚠️ **Season Activation Failed** ⚠️

**Season ID:** {seasonId}
**Error:** {errorKey}
**Triggered By:** {triggeredBy}
**Creator:** {creatorName} ({creatorDiscordId})
**Player Count:** {playerCount}
**Timestamp:** {timestamp}

**Error Details:**
\`\`\`json
{errorData}
\`\`\`

Please investigate and take appropriate action.`,
      activationFailureCreatorNotification: `❌ **Season Activation Failed** ❌

Hi {creatorName}, unfortunately your season **{seasonId}** failed to activate automatically.

**Reason:** {errorType}
**Triggered By:** {triggeredBy}

An administrator has been notified and will investigate the issue. You may try creating a new season or contact support for assistance.`
    },

    // On-demand game messages
    ondemand: {
      gameCompleted: `🎊 **On-Demand Game Complete!** 🎊

**Game ID:** {gameId}
**Created by:** {creatorName}
**Turns:** {completedTurns}/{totalTurns}
**Players:** {playerCount}
**Reason:** {completionReason}

Great job everyone!`,
      turnFlagged: `⚠️ **Turn Flagged for Review** ⚠️

**Game ID:** {gameId}
**Turn ID:** {turnId}
**Turn:** #{turnNumber} ({turnType})
**Player:** {playerName}
**Flagged by:** {flaggerName}

**Content:**
\`\`\`
{turnContent}
\`\`\`

**Game Status:** PAUSED

Please review this content and take appropriate action. React with ✅ to approve or ❌ to reject.`
    },

    // Config messages
    config: {
      updateSuccess: `Configuration updated successfully for guild {guildId}!
**Updated fields:** {updatedFields}`,
      validationError: 'Invalid configuration value for **{field}**: {error}',
      databaseError: 'Database error occurred while updating configuration. Error code: {errorCode}',
      unknownError: 'An unknown error occurred while updating configuration: {message}',
      noUpdatesProvided: 'No configuration updates were provided. Please specify at least one setting to update.'
    },

    // Turn messages
    turnOffer: {
      newTurnAvailable: `🎨 **New Turn Available!** 🎨

**Game:** {gameId}
**Season:** {seasonId}
**Turn:** {turnNumber} ({turnType})

You have **{claimTimeoutMinutes} minutes** to claim this turn. React with ✅ to claim it!`,
      initialTurnOffer: `🎮 **Your First Turn!** 🎮

**Game:** {gameId}
**Season:** {seasonId}
**Turn Type:** {turnType}

It's your first turn in this game! Please type \`/ready\` in this DM to claim your turn.

⏰ You have **{claimTimeoutMinutes} minutes** to claim it before it's offered to another player.`
    },

    // Game messages (removed redundant seasonId message)
    game: {},

    // Turn timeout messages
    turnTimeout: {
      submissionTimeoutSkipped: 'Turn submission timed out and was automatically skipped.'
    },

    // Ready messages
    ready: {
      playerNotFound: 'Player profile not found. Please try again later or contact support.',
      noOfferedTurns: 'You have no offered turns available to claim.',
      alreadyHasPendingTurn: 'You already have a pending turn to complete.',
      claimFailed: 'Failed to claim the turn. Please try again.',
      claimSuccess: 'Turn claimed successfully! You can now submit your response.'
    },

    // Submission messages
    submission: {
      playerNotFound: 'Player profile not found. Please try again later or contact support.',
      noPendingTurns: 'You have no pending turns to submit.',
      noAttachmentFound: 'No attachment found. Please attach a file with your submission.',
      invalidFileType: 'Invalid file type. Please submit a valid image file or text document.',
      noContentFound: 'No content found in the submission. Please provide text or attach a file.',
      wrongContentType: 'Incorrect content type for this turn. Please check the turn requirements.',
      submitFailed: 'Failed to submit your turn. Please try again.',
      submitSuccess: 'Turn submitted successfully!'
    }
  },

  // Embed content
  embeds: {
    welcome: {
      title: 'Thank you for using My Bot!',
      description: 'Discord Bot TypeScript Template helps give developers a starting point for new Discord bots, so that much of the initial setup can be avoided and developers can instead focus on meaningful bot features.',
      fields: [
        {
          name: 'Important Commands',
          value: '/help - Find help or contact support.'
        },
        {
          name: 'Links',
          value: `[View Documentation](https://top.gg/)
[Join Support Server](https://support.discord.com/)`
        }
      ]
    },
    
    helpContactSupport: {
      title: 'Help - Contact Support',
      description: 'Have a question or feedback? Join our support server at the link below!',
      fields: [
        {
          name: 'Links',
          value: '[Join Support Server](https://support.discord.com/)'
        }
      ]
    },

    helpCommands: {
      title: 'Help - Commands',
      fields: [
        {
          name: 'Commands',
          value: `To see the available commands, just type \`/\` and select the bot from the left side. You can then scroll through all available commands. Some commands may be hidden if you don't have permission to view them.

**/season** - Create, join, view, and manage seasons
**/game** - On-demand game management and participation commands
**/admin** - Administrative commands for managing players and seasons
**/info** - View bot info
**/help** - Find help or contact support
**/dev** - Developer commands (admin only)

**Note:** Use \`/season join\` to join a season, and \`/ready\` in DM to claim offered turns.`
        },
        {
          name: 'Command Permissions',
          value: `Want to restrict commands to certain roles, users, or channels? Set up permissions in the bot's integration page by going to **Server Settings** > **Integrations**, and then **Manage** for this bot.`
        },
        {
          name: 'Links',
          value: `[View Documentation](https://top.gg/)
[Join Support Server](https://support.discord.com/)`
        }
            ]
    },

    about: {
      title: 'My Bot - About',
      description: 'Discord Bot TypeScript Template helps give developers a starting point for new Discord bots, so that much of the initial setup can be avoided and developers can instead focus on meaningful bot features.',
      fields: [
        {
          name: 'Author',
          value: '[My Name](https://github.com/)'
        },
        {
          name: 'Links',
          value: `[View Source Code](https://github.com/)
[View Documentation](https://top.gg/)
[View Terms of Service](https://github.com/KevinNovak/Discord-Bot-TypeScript-Template/blob/master/LEGAL.md#terms-of-service)
[Vote for My Bot!](https://top.gg/)
[Donate via PayPal](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=EW389DYYSS4FC)
[Join Support Server](https://support.discord.com/)
[Invite My Bot to a Server!](https://discord.com/)`
        },
        {
          name: 'Created With',
          value: '[Discord Bot TypeScript Template](https://github.com/KevinNovak/Discord-Bot-TypeScript-Template)'
        }
      ]
    },

    devInfo: {
      title: 'My Bot - Developer Info',
      fields: [
        {
          name: 'Versions',
          value: `**Node.js**: {NODE_VERSION}
**TypeScript**: {TS_VERSION}
**ECMAScript**: {ES_VERSION}
**discord.js**: {DJS_VERSION}`
        },
        {
          name: 'Stats',
          value: `**Shards**: {SHARD_COUNT}
**Servers**: {SERVER_COUNT} ({SERVER_COUNT_PER_SHARD}/Shard)`
        },
        {
          name: 'Memory',
          value: `**RSS**: {RSS_SIZE} ({RSS_SIZE_PER_SERVER}/Server)
**Heap**: {HEAP_TOTAL_SIZE} ({HEAP_TOTAL_SIZE_PER_SERVER}/Server)
**Used**: {HEAP_USED_SIZE} ({HEAP_USED_SIZE_PER_SERVER}/Server)`
        },
        {
          name: 'IDs',
          value: `**Hostname**: {HOSTNAME}
**Shard ID**: {SHARD_ID}
**Server ID**: {SERVER_ID}
**Bot ID**: {BOT_ID}
**User ID**: {USER_ID}`
        }
      ]
    },

    seasonStatus: {
      title: 'Status: {seasonId}',
      description: `**Status:** {seasonStatus}
**Players:** {playerCount}/{maxPlayers} (min: {minPlayers})
**Games:** {gameCount}`,
      fields: [
        {
          name: 'Game Details',
          value: '{gameDetails}'
        }
      ]
    },

    configView: {
      title: 'Season Configuration for Guild {GUILD_ID}',
      description: 'Current default season configuration settings:',
      fields: [
        {
          name: 'Turn Settings',
          value: `**Pattern:** {TURN_PATTERN}
**Claim Timeout:** {CLAIM_TIMEOUT}`
        },
        {
          name: 'Writing Settings', 
          value: `**Timeout:** {WRITING_TIMEOUT}
**Warning:** {WRITING_WARNING}`
        },
        {
          name: 'Drawing Settings',
          value: `**Timeout:** {DRAWING_TIMEOUT}
**Warning:** {DRAWING_WARNING}`
        },
        {
          name: 'Season Settings',
          value: `**Open Duration:** {OPEN_DURATION}
**Min Players:** {MIN_PLAYERS}
**Max Players:** {MAX_PLAYERS}`
        },
        {
          name: 'Info',
          value: `**Guild Default:** {IS_GUILD_DEFAULT}
**Last Updated:** {LAST_UPDATED}`
        }
      ]
    },

    // Admin embeds
    admin: {
      listSeasonsSuccess: {
        title: 'Seasons List ({totalCount} total)',
        description: '{statusFilter}',
        fields: [
          {
            name: 'Seasons',
            value: '{seasonsDetails}'
          }
        ]
      }
    },

    // Error embeds
    errorEmbeds: {
      notImplemented: {
        title: 'Not Implemented',
        description: 'This feature is not yet implemented.'
      },
      command: {
        title: 'Command Error',
        description: `An error occurred while executing the command.

**Error Code:** {ERROR_CODE}
**Guild ID:** {GUILD_ID}
**Shard ID:** {SHARD_ID}`
      }
    }
  },

  // Command arguments and descriptions
  arguments: {
    command: 'command',
    option: 'option', 
    season: 'season'
  },

  argDescs: {
    devCommand: 'Developer command to run',
    helpOption: 'Help option to view',
    season: 'The season ID to interact with'
  },

  devCommandNames: {
    info: 'info'
  },

  helpOptionDescs: {
    contactSupport: 'Contact support',
    commands: 'View available commands'
  },

  infoOptions: {
    about: 'About this bot',
    translate: 'Translation info'
  },

  // Permissions
  permissions: {
    AddReactions: 'Add Reactions',
    Administrator: 'Administrator',
    AttachFiles: 'Attach Files',
    BanMembers: 'Ban Members',
    ChangeNickname: 'Change Nickname',
    Connect: 'Connect',
    CreateEvents: 'Create Events',
    CreateGuildExpressions: 'Create Expressions',
    CreateInstantInvite: 'Create Invite',
    CreatePrivateThreads: 'Create Private Threads',
    CreatePublicThreads: 'Create Public Threads',
    DeafenMembers: 'Deafen Members',
    EmbedLinks: 'Embed Links',
    KickMembers: 'Kick Members',
    ManageChannels: 'Manage Channel(s)',
    ManageEmojisAndStickers: 'Manage Emoji and Stickers',
    ManageEvents: 'Manage Events',
    ManageGuild: 'Manage Server',
    ManageGuildExpressions: 'Manage Expressions',
    ManageMessages: 'Manage Messages',
    ManageNicknames: 'Manage Nicknames',
    ManageRoles: 'Manage Roles / Permissions',
    ManageThreads: 'Manage Threads / Posts',
    ManageWebhooks: 'Manage Webhooks',
    MentionEveryone: 'Mention Everyone, Here, and All Roles',
    ModerateMembers: 'Timeout Members',
    MoveMembers: 'Move Members',
    MuteMembers: 'Mute Members',
    PrioritySpeaker: 'Priority Speaker',
    ReadMessageHistory: 'Read Message History',
    RequestToSpeak: 'Request to Speak',
    SendMessages: 'Send Messages / Create Posts',
    SendMessagesInThreads: 'Send Messages in Threads / Posts',
    SendPolls: 'Create Polls',
    SendTTSMessages: 'Send Text-to-Speech Messages',
    SendVoiceMessages: 'Send Voice Messages',
    Speak: 'Speak',
    Stream: 'Video',
    UseApplicationCommands: 'Use Application Commands',
    UseEmbeddedActivities: 'Use Activities',
    UseExternalApps: 'Use External Apps',
    UseExternalEmojis: 'Use External Emoji',
    UseExternalSounds: 'Use External Sounds',
    UseExternalStickers: 'Use External Stickers',
    UseSoundboard: 'Use Soundboard',
    UseVAD: 'Use Voice Activity',
    ViewAuditLog: 'View Audit Log',
    ViewChannel: 'View Channel(s)',
    ViewCreatorMonetizationAnalytics: 'View Server Subscription Insights',
    ViewGuildInsights: 'View Server Insights'
  }
} as const;

// Simple string interpolation function
export function interpolate(template: string, variables: Record<string, unknown> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : match;
  });
}

// Helper to get nested properties  
export function getStringValue(path: string): string {
  const parts = path.split('.');
  let current: unknown = strings;
  
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