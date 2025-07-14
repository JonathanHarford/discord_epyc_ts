import { vi } from 'vitest';

vi.mock('discord.js', async () => {
    const actual = await vi.importActual('discord.js');
    const mock = await vi.importActual('./__mocks__/discord.js');
    return {
        ...actual,
        ...mock,
    };
});

vi.mock('config/config.json', () => ({
    default: {
        developers: ['123'],
    },
}));
