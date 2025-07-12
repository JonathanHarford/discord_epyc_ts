import { vi } from 'vitest';
import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    User,
    Guild,
    TextChannel,
} from 'discord.js';

// Mock Interaction Factories
export function createMockChatInputCommandInteraction(options: any): ChatInputCommandInteraction {
    const interaction = {
        ...options,
        isChatInputCommand: () => true,
        isAutocomplete: () => false,
        deferReply: vi.fn(),
        followUp: vi.fn(),
        reply: vi.fn(),
    };
    return interaction as unknown as ChatInputCommandInteraction;
}

export function createMockAutocompleteInteraction(options: any): AutocompleteInteraction {
    const interaction = {
        ...options,
        isAutocomplete: () => true,
        isChatInputCommand: () => false,
        respond: vi.fn(),
    };
    return interaction as unknown as AutocompleteInteraction;
}

// Test Harness
export class TestHarness {
    public command: any;
    public interaction: ChatInputCommandInteraction | AutocompleteInteraction;

    constructor(command: any) {
        this.command = command;
    }

    public withChatInputCommand(options: any) {
        this.interaction = createMockChatInputCommandInteraction(options);
        return this;
    }

    public withAutocomplete(options: any) {
        this.interaction = createMockAutocompleteInteraction(options);
        return this;
    }

    public async run() {
        if (this.interaction.isAutocomplete()) {
            return this.command.autocomplete(this.interaction, {
                name: 'option',
                value: 'value',
            });
        }
        if (this.interaction.isChatInputCommand()) {
            return this.command.execute(this.interaction, {});
        }
    }
}
