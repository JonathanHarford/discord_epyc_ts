import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminCommand } from '../../../src/commands/chat/admin-command';
import { TestHarness } from '../../harness/harness';
import { SimpleMessage } from '../../../src/messaging/SimpleMessage';
import { PrismaClient } from '@prisma/client';

vi.mock('../../../src/messaging/SimpleMessage');
vi.mock('@prisma/client', () => ({
    PrismaClient: vi.fn(() => ({
        player: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        season: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        game: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        channelConfig: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
        guildConfig: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    })),
}));
vi.mock('../../../src/services/logger.ts', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));
vi.mock('../../../src/services/command-registration-service.ts', () => ({
    CommandRegistrationService: vi.fn(),
}));
vi.mock('../../../src/services/master-api-service.ts', () => ({
    MasterApiService: vi.fn(),
}));
vi.mock('../../../config/config.json', () => ({
    default: {
        developers: ['not-a-developer'],
    },
}));

describe('AdminCommand', () => {
    let harness: TestHarness;
    let command: AdminCommand;
    let prisma: PrismaClient;

    beforeEach(() => {
        prisma = new PrismaClient();
        command = new AdminCommand();
        harness = new TestHarness(command);
        vi.clearAllMocks();
    });

    it('should send a warning if the user is not a developer', async () => {
        harness.withChatInputCommand({
            options: {
                getSubcommandGroup: () => 'player',
                getSubcommand: () => 'list',
                getString: () => null,
                getBoolean: () => null,
            },
            user: {
                id: 'not-a-developer',
            },
        });

        await command.execute(harness.interaction, {}, []);

        expect(SimpleMessage.sendWarning).toHaveBeenCalled();
    });
});
