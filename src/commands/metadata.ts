import {
    ApplicationCommandType,
    PermissionFlagsBits,
    PermissionsBitField,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
    RESTPostAPIContextMenuApplicationCommandsJSONBody,
    ApplicationCommandOptionType,
    ChannelType,
} from 'discord.js';

import { Args } from './index.js';
import { Language } from '../models/enum-helpers/index.js';
import { Lang } from '../services/index.js';
import { DevCommandName } from '../enums/index.js';

export const ChatCommandMetadata: {
    [command: string]: RESTPostAPIChatInputApplicationCommandsJSONBody;
} = {
    DEV: {
        type: ApplicationCommandType.ChatInput,
        name: Lang.getRef('chatCommands.dev', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('chatCommands.dev'),
        description: Lang.getRef('commandDescs.dev', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('commandDescs.dev'),
        dm_permission: true,
        default_member_permissions: PermissionsBitField.resolve([
            PermissionFlagsBits.Administrator,
        ]).toString(),
        options: [
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: Lang.getRef('devCommandNames.info', Language.Default).toLowerCase(),
                name_localizations: Lang.getRefLocalizationMap('devCommandNames.info'),
                description: 'Get developer information about the bot'
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: Lang.getRef('devCommandNames.testmode', Language.Default).toLowerCase(),
                name_localizations: Lang.getRefLocalizationMap('devCommandNames.testmode'),
                description: 'Toggle test mode for a server',
                options: [
                    {
                        ...Args.DEV_SERVER_ID
                    }
                ]
            }
        ],
    },
    HELP: {
        type: ApplicationCommandType.ChatInput,
        name: Lang.getRef('chatCommands.help', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('chatCommands.help'),
        description: Lang.getRef('commandDescs.help', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('commandDescs.help'),
        dm_permission: true,
        default_member_permissions: undefined,
        options: [
            {
                ...Args.HELP_OPTION,
                required: true,
            },
        ],
    },
    INFO: {
        type: ApplicationCommandType.ChatInput,
        name: Lang.getRef('chatCommands.info', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('chatCommands.info'),
        description: Lang.getRef('commandDescs.info', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('commandDescs.info'),
        dm_permission: true,
        default_member_permissions: undefined,
        options: [
            {
                ...Args.INFO_OPTION,
                required: true,
            },
        ],
    },
    START: {
        type: ApplicationCommandType.ChatInput,
        name: Lang.getRef('chatCommands.start', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('chatCommands.start'),
        description: Lang.getRef('commandDescs.start', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('commandDescs.start'),
        dm_permission: false,
        default_member_permissions: undefined,
        options: [
            {
                type: ApplicationCommandOptionType.String,
                name: 'turn_pattern',
                description: 'Order of writing and drawing turns',
                required: false,
                choices: [
                    {
                        name: 'Drawing → Writing',
                        value: 'drawing,writing'
                    },
                    {
                        name: 'Writing → Drawing',
                        value: 'writing,drawing'
                    }
                ]
            },
            {
                type: ApplicationCommandOptionType.String,
                name: 'writing_timeout',
                description: 'Time allowed for writing turns (format: 1d, 12h, 30m)',
                required: false
            },
            {
                type: ApplicationCommandOptionType.String,
                name: 'drawing_timeout',
                description: 'Time allowed for drawing turns (format: 1d, 12h, 30m)',
                required: false
            },
            {
                type: ApplicationCommandOptionType.Integer,
                name: 'min_turns',
                description: 'Minimum number of turns required for a game',
                required: false,
                min_value: 4
            },
            {
                type: ApplicationCommandOptionType.Integer,
                name: 'max_turns',
                description: 'Maximum number of turns allowed for a game',
                required: false,
                min_value: 6
            },
            {
                type: ApplicationCommandOptionType.String,
                name: 'returns',
                description: 'Player returns policy (format: N/M or "none")',
                required: false
            }
        ],
    },
    TEST: {
        type: ApplicationCommandType.ChatInput,
        name: Lang.getRef('chatCommands.test', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('chatCommands.test'),
        description: Lang.getRef('commandDescs.test', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('commandDescs.test'),
        dm_permission: true,
        default_member_permissions: undefined,
    },
    CONFIG: {
        type: ApplicationCommandType.ChatInput,
        name: Lang.getRef('chatCommands.config', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('chatCommands.config'),
        description: Lang.getRef('commandDescs.config', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('commandDescs.config'),
        dm_permission: false,
        default_member_permissions: PermissionsBitField.resolve([
            PermissionFlagsBits.Administrator,
        ]).toString(),
        options: [
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'channels',
                description: 'Configure server channels for announcements and notifications',
                options: [
                    {
                        type: ApplicationCommandOptionType.Channel,
                        name: 'announcement',
                        description: 'Channel for game announcements',
                        required: false,
                        channel_types: [ChannelType.GuildText]
                    },
                    {
                        type: ApplicationCommandOptionType.Channel,
                        name: 'completed_channel',
                        description: 'Channel where completed games will be posted',
                        required: false,
                        channel_types: [ChannelType.GuildText]
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'completed',
                        description: 'Set to "None" to disable the completed games channel',
                        required: false,
                        choices: [
                            {
                                name: 'None (Disable)',
                                value: 'none'
                            }
                        ]
                    },
                    {
                        type: ApplicationCommandOptionType.Channel,
                        name: 'admin_channel',
                        description: 'Channel for admin notifications',
                        required: false,
                        channel_types: [ChannelType.GuildText]
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'admin',
                        description: 'Set to "None" to disable the admin notifications channel',
                        required: false,
                        choices: [
                            {
                                name: 'None (Disable)',
                                value: 'none'
                            }
                        ]
                    }
                ]
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'games',
                description: 'Configure default game settings for this server',
                options: [
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'turn_pattern',
                        description: 'Order of writing and drawing turns',
                        required: false,
                        choices: [
                            {
                                name: 'Drawing → Writing',
                                value: 'drawing,writing'
                            },
                            {
                                name: 'Writing → Drawing',
                                value: 'writing,drawing'
                            }
                        ]
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'writing_timeout',
                        description: 'Time allowed for writing turns (format: 1d, 12h, 30m)',
                        required: false
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'writing_warning',
                        description: 'Warning time before writing turn expires (format: 1d, 12h, 30m)',
                        required: false
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'drawing_timeout',
                        description: 'Time allowed for drawing turns (format: 1d, 12h, 30m)',
                        required: false
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'drawing_warning',
                        description: 'Warning time before drawing turn expires (format: 1d, 12h, 30m)',
                        required: false
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'stale_timeout',
                        description: 'Time before a game is considered stale (format: 7d, 14d, 30d)',
                        required: false
                    },
                    {
                        type: ApplicationCommandOptionType.Integer,
                        name: 'min_turns',
                        description: 'Minimum number of turns required for a game',
                        required: false,
                        min_value: 4
                    },
                    {
                        type: ApplicationCommandOptionType.Integer,
                        name: 'max_turns',
                        description: 'Maximum number of turns allowed for a game',
                        required: false,
                        min_value: 6
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'returns',
                        description: 'Player returns policy (format: N/M or "none")',
                        required: false
                    }
                ]
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'seasons',
                description: 'Configure default season settings for this server',
                options: [
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'open_duration',
                        description: 'Time a season stays open for registration (format: 1d, 12h, 30m)',
                        required: false
                    },
                    {
                        type: ApplicationCommandOptionType.Integer,
                        name: 'min_players',
                        description: 'Minimum number of players required for a season',
                        required: false,
                        min_value: 2
                    },
                    {
                        type: ApplicationCommandOptionType.Integer,
                        name: 'max_players',
                        description: 'Maximum number of players allowed for a season',
                        required: false,
                        min_value: 3
                    }
                ]
            }
        ],
    },
};

export const MessageCommandMetadata: {
    [command: string]: RESTPostAPIContextMenuApplicationCommandsJSONBody;
} = {
    VIEW_DATE_SENT: {
        type: ApplicationCommandType.Message,
        name: Lang.getRef('messageCommands.viewDateSent', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('messageCommands.viewDateSent'),
        default_member_permissions: undefined,
        dm_permission: true,
    },
};

export const UserCommandMetadata: {
    [command: string]: RESTPostAPIContextMenuApplicationCommandsJSONBody;
} = {
    VIEW_DATE_JOINED: {
        type: ApplicationCommandType.User,
        name: Lang.getRef('userCommands.viewDateJoined', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('userCommands.viewDateJoined'),
        default_member_permissions: undefined,
        dm_permission: true,
    },
};
