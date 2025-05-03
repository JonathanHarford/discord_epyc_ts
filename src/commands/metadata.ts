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
                ...Args.DEV_COMMAND,
                required: true,
            },
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
                        name: 'completed',
                        description: 'Channel for completed games',
                        required: false,
                        channel_types: [ChannelType.GuildText]
                    },
                    {
                        type: ApplicationCommandOptionType.Channel,
                        name: 'admin',
                        description: 'Channel for admin notifications',
                        required: false,
                        channel_types: [ChannelType.GuildText]
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
