import {
    ApplicationCommandData,
    ApplicationCommandOptionType,
    ApplicationCommandType,
    PermissionsBitField,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
    RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from 'discord.js';

import { strings } from '../lang/strings.js';
import { adminCommandData } from './chat/admin-command-data.js';
import { gameCommandData } from './chat/game-command-data.js';
import { seasonCommandData } from './chat/season-command-data.js';

export const ChatCommandMetadata: {
    [command: string]: RESTPostAPIChatInputApplicationCommandsJSONBody;
} = {
    DEV: {
        type: ApplicationCommandType.ChatInput,
        name: strings.commands.dev,
        description: strings.commandDescs.dev,
        dm_permission: true,
        default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
        options: [
            {
                name: 'command',
                description: 'Command.',
                required: true,
                type: ApplicationCommandOptionType.String,
                choices: [
                    {
                        name: 'info',
                        value: 'info',
                    },
                ],
            },
        ],
    },
    HELP: {
        type: ApplicationCommandType.ChatInput,
        name: strings.commands.help,
        description: strings.commandDescs.help,
        dm_permission: true,
        default_member_permissions: undefined,
        options: [
            {
                name: 'option',
                description: 'Option.',
                required: true,
                type: ApplicationCommandOptionType.String,
                choices: [
                    {
                        name: 'Contact Support',
                        value: 'contact-support',
                    },
                    {
                        name: 'Commands',
                        value: 'commands',
                    },
                ],
            },
        ],
    },
    INFO: {
        type: ApplicationCommandType.ChatInput,
        name: strings.commands.info,
        description: strings.commandDescs.info,
        dm_permission: true,
        default_member_permissions: undefined,
        options: [
            {
                name: 'option',
                description: 'Option.',
                required: true,
                type: ApplicationCommandOptionType.String,
                choices: [
                    {
                        name: 'About',
                        value: 'about',
                    },
                    {
                        name: 'Translate',
                        value: 'translate',
                    },
                ],
            },
        ],
    },

    SEASON: seasonCommandData.toJSON(),
    ADMIN: adminCommandData.toJSON(),
    GAME: gameCommandData.toJSON(),
};

export const MessageCommandMetadata: {
    [command: string]: RESTPostAPIContextMenuApplicationCommandsJSONBody;
} = {
    VIEW_DATE_SENT: {
        type: ApplicationCommandType.Message,
        name: 'View Date Sent',
        dm_permission: true,
        default_member_permissions: undefined,
    },
};

export const UserCommandMetadata: {
    [command: string]: RESTPostAPIContextMenuApplicationCommandsJSONBody;
} = {
    VIEW_DATE_JOINED: {
        type: ApplicationCommandType.User,
        name: 'View Date Joined',
        dm_permission: false,
        default_member_permissions: undefined,
    },
};

export class CommandMetadata {
    public static async getMetaData(): Promise<ApplicationCommandData[]> {
        return [
            // Chat Commands
            {
                type: ApplicationCommandType.ChatInput,
                name: strings.commands.dev,
                description: strings.commandDescs.dev,
                dmPermission: true,
                defaultMemberPermissions: PermissionsBitField.Flags.Administrator,
                options: [
                    {
                        name: 'command',
                        description: 'Command.',
                        required: true,
                        type: ApplicationCommandOptionType.String,
                        choices: [
                            {
                                name: 'info',
                                value: 'info',
                            },
                        ],
                    },
                ],
            },
            {
                type: ApplicationCommandType.ChatInput,
                name: strings.commands.help,
                description: strings.commandDescs.help,
                dmPermission: true,
                defaultMemberPermissions: undefined,
                options: [
                    {
                        name: 'option',
                        description: 'Option.',
                        required: true,
                        type: ApplicationCommandOptionType.String,
                        choices: [
                            {
                                name: 'Contact Support',
                                value: 'contact-support',
                            },
                            {
                                name: 'Commands',
                                value: 'commands',
                            },
                        ],
                    },
                ],
            },
            {
                type: ApplicationCommandType.ChatInput,
                name: strings.commands.info,
                description: strings.commandDescs.info,
                dmPermission: true,
                defaultMemberPermissions: undefined,
                options: [
                    {
                        name: 'option',
                        description: 'Option.',
                        required: true,
                        type: ApplicationCommandOptionType.String,
                        choices: [
                            {
                                name: 'About',
                                value: 'about',
                            },
                            {
                                name: 'Translate',
                                value: 'translate',
                            },
                        ],
                    },
                ],
            },

            // Message Context Commands
            {
                type: ApplicationCommandType.Message,
                name: 'View Date Sent',
                dmPermission: true,
                defaultMemberPermissions: undefined,
            },
            // User Context Commands
            {
                type: ApplicationCommandType.User,
                name: 'View Date Joined',
                dmPermission: false,
                defaultMemberPermissions: undefined,
            },
        ];
    }
}
