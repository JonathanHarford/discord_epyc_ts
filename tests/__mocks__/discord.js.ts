import { vi } from 'vitest';

export const Client = vi.fn();
export const GatewayIntentBits = {
    Guilds: 1,
    GuildMessages: 512,
    MessageContent: 32768,
};
export const Partials = {
    Channel: 'Channel',
    Message: 'Message',
    Reaction: 'Reaction',
};
export const Options = {
    cacheWithLimits: vi.fn(),
    DefaultMakeCacheSettings: {},
};

export class CommandInteraction {
    constructor() {
        // an empty constructor
    }
}
export class AutocompleteInteraction {
    constructor() {
        // an empty constructor
    }
}
export class ButtonInteraction {
    constructor() {
        // an empty constructor
    }
}
export class ModalSubmitInteraction {
    constructor() {
        // an empty constructor
    }
}
export class SelectMenuInteraction {
    constructor() {
        // an empty constructor
    }
}
export class User {
    constructor() {
        // an empty constructor
    }
}
export class Guild {
    constructor() {
        // an empty constructor
    }
}
export class TextChannel {
    constructor() {
        // an empty constructor
    }
}
export class NewsChannel {
    constructor() {
        // an empty constructor
    }
}
export class ThreadChannel {
    constructor() {
        // an empty constructor
    }
}
export class Message {
    constructor() {
        // an empty constructor
    }
}
export const PermissionsString = '';
