import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SeasonCommand } from '../../../src/commands/chat/season-command';
import { TestHarness } from '../../harness/harness';
import { SimpleMessage } from '../../../src/messaging/SimpleMessage';
import { PrismaClient } from '@prisma/client';
import { SeasonService } from '../../../src/services/SeasonService';
import { PlayerTurnService } from '../../../src/services/PlayerTurnService';

vi.mock('../../../src/messaging/SimpleMessage');
vi.mock('../../../src/services/SeasonService');
vi.mock('../../../src/services/PlayerTurnService');
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
vi.mock('@prisma/client', () => ({
    PrismaClient: vi.fn(() => ({
        player: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
        season: {
            findMany: vi.fn(),
        },
    })),
}));
vi.mock('../../../src/services/ConfigService.ts', () => ({
    ConfigService: vi.fn(() => ({
        getGuildDefaultConfig: vi.fn().mockResolvedValue({}),
    })),
}));

describe('SeasonCommand', () => {
    let harness: TestHarness;
    let command: SeasonCommand;
    let prisma: PrismaClient;
    let seasonService: SeasonService;
    let playerTurnService: PlayerTurnService;

    beforeEach(() => {
        prisma = new PrismaClient();
        seasonService = new SeasonService({} as any, {} as any, {} as any, {} as any);
        playerTurnService = new PlayerTurnService(prisma);
        command = new SeasonCommand(prisma, seasonService, playerTurnService);
        harness = new TestHarness(command);
        vi.clearAllMocks();
    });

    describe('list subcommand', () => {
        it('should list seasons', async () => {
            harness.withChatInputCommand({
                options: {
                    getSubcommand: () => 'list',
                },
                user: {
                    id: '123',
                    tag: 'testuser',
                },
                deferReply: vi.fn(),
                editReply: vi.fn(),
            });

            (prisma.player.findUnique as any).mockResolvedValue({ id: '1' });
            (prisma.season.findMany as any).mockResolvedValue([]);

            await harness.run();

            expect(prisma.season.findMany).toHaveBeenCalled();
            expect(harness.interaction.editReply).toHaveBeenCalled();
        });
    });

    describe('show subcommand', () => {
        it('should show season details', async () => {
            harness.withChatInputCommand({
                options: {
                    getSubcommand: () => 'show',
                    getString: () => '1',
                },
                user: {
                    id: '123',
                    tag: 'testuser',
                },
                deferReply: vi.fn(),
                editReply: vi.fn(),
            });

            (seasonService.findSeasonById as any).mockResolvedValue({ id: '1', status: 'OPEN', _count: { players: 0 }, config: {} });

            await harness.run();

            expect(seasonService.findSeasonById).toHaveBeenCalledWith('1');
            expect(harness.interaction.editReply).toHaveBeenCalled();
        });
    });

    describe('join subcommand', () => {
        it('should join a season', async () => {
            harness.withChatInputCommand({
                options: {
                    getSubcommand: () => 'join',
                    getString: () => '1',
                },
                user: {
                    id: '123',
                    tag: 'testuser',
                },
                deferReply: vi.fn(),
            });

            (playerTurnService.checkPlayerPendingTurns as any).mockResolvedValue({ hasPendingTurn: false });
            (seasonService.findSeasonById as any).mockResolvedValue({ id: '1', status: 'OPEN' });
            (prisma.player.findUnique as any).mockResolvedValue({ id: '1' });
            (seasonService.addPlayerToSeason as any).mockResolvedValue({ type: 'success' });

            await harness.run();

            expect(seasonService.addPlayerToSeason).toHaveBeenCalled();
            expect(SimpleMessage.sendSuccess).toHaveBeenCalled();
        });
    });

    describe('new subcommand', () => {
        it('should show the new season modal', async () => {
            harness.withChatInputCommand({
                options: {
                    getSubcommand: () => 'new',
                },
                user: {
                    id: '123',
                    tag: 'testuser',
                },
                guildId: '456',
                showModal: vi.fn(),
            });

            await harness.run();

            expect(harness.interaction.showModal).toHaveBeenCalled();
        });
    });
});
