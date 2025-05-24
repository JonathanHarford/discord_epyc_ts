import { APIApplicationCommandBasicOption, ApplicationCommandOptionType } from 'discord.js';

import { DevCommandName, HelpOption, InfoOption } from '../enums/index.js';
import { strings } from '../lang/strings.js';

export class Args {
    public static readonly DEV_COMMAND: APIApplicationCommandBasicOption = {
        name: strings.arguments.command,
        description: strings.argDescs.devCommand,
        type: ApplicationCommandOptionType.String,
        choices: [
            {
                name: strings.devCommandNames.info,
                value: DevCommandName.INFO,
            },
        ],
    };
    public static readonly HELP_OPTION: APIApplicationCommandBasicOption = {
        name: strings.arguments.option,
        description: strings.argDescs.helpOption,
        type: ApplicationCommandOptionType.String,
        choices: [
            {
                name: strings.helpOptionDescs.contactSupport,
                value: HelpOption.CONTACT_SUPPORT,
            },
            {
                name: strings.helpOptionDescs.commands,
                value: HelpOption.COMMANDS,
            },
        ],
    };
    public static readonly INFO_OPTION: APIApplicationCommandBasicOption = {
        name: strings.arguments.option,
        description: strings.argDescs.helpOption,
        type: ApplicationCommandOptionType.String,
        choices: [
            {
                name: strings.infoOptions.about,
                value: InfoOption.ABOUT,
            },
            {
                name: strings.infoOptions.translate,
                value: InfoOption.TRANSLATE,
            },
        ],
    };
    public static readonly SEASON: APIApplicationCommandBasicOption = {
        name: strings.arguments.season,
        description: strings.argDescs.season,
        type: ApplicationCommandOptionType.String,
    };
}
