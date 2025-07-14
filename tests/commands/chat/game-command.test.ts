import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameCommand } from '../../../src/commands/chat/game-command';
import { TestHarness } from '../../harness/harness';
import { SimpleMessage } from '../../../src/messaging/SimpleMessage';
import { PrismaClient } from '@prisma/client';
import { OnDemandGameService } from '../../../src/services/OnDemandGameService';
import { OnDemandTurnService } from '../../../src/services/OnDemandTurnService';
import { PlayerTurnService } from '../../../src/services/PlayerTurnService';

vi.mock('../../../src/messaging/SimpleMessage');
vi.mock('../../../src/services/OnDemandGameService');
vi.mock('../../../src/services/OnDemandTurnService');
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

describe('GameCommand', () => {
    let harness: TestHarness;
    let command: GameCommand;
    let prisma: PrismaClient;
    let onDemandGameService: OnDemandGameService;
    let onDemandTurnService: OnDemandTurnService;
    let playerTurnService: PlayerTurnService;

    beforeEach(() => {
        prisma = new PrismaClient();
        onDemandGameService = new OnDemandGameService(prisma, {} as any);
        onDemandTurnService = new OnDemandTurnService(prisma, {} as any, {} as any);
        playerTurnService = new PlayerTurnService(prisma);
        command = new GameCommand(prisma, onDemandGameService, onDemandTurnService, playerTurnService);
        harness = new TestHarness(command);
        vi.clearAllMocks();
    });

    describe('new subcommand', () => {
        it('should create a new game', async () => {
            harness.withChatInputCommand({
                options: {
                    getSubcommand: () => 'new',
                },
                user: {
                    id: '123',
                },
                guildId: '456',
            });

            (playerTurnService.checkPlayerPendingTurns as any).mockResolvedValue({ hasPendingTurn: false });
            (onDemandGameService.createGame as any).mockResolvedValue({ success: true });

            await harness.run();

            expect(onDemandGameService.createGame).toHaveBeenCalledWith('123', '456');
            expect(SimpleMessage.sendInfo).toHaveBeenCalled();
        });
    });

    describe('play subcommand', () => {
        it('should join a game', async () => {
            harness.withChatInputCommand({
                options: {
                    getSubcommand: () => 'play',
                },
                user: {
                    id: '123',
                },
                guildId: '456',
            });

            (playerTurnService.checkPlayerPendingTurns as any).mockResolvedValue({ hasPendingTurn: false });
            (onDemandGameService.joinGame as any).mockResolvedValue({ success: true });

            await harness.run();

            expect(onDemandGameService.joinGame).toHaveBeenCalledWith('123', '456');
            expect(SimpleMessage.sendInfo).toHaveBeenCalled();
        });
    });

    describe('list subcommand', () => {
        it('should list games', async () => {
            harness.withChatInputCommand({
                options: {
                    getSubcommand: () => 'list',
                },
                user: {
                    id: '123',
                },
                guildId: '456',
            });

            (onDemandGameService.listGamesByPlayerParticipation as any).mockResolvedValue({ success: true, haventPlayed: [], havePlayed: [], finished: [] });

            await harness.run();

            expect(onDemandGameService.listGamesByPlayerParticipation).toHaveBeenCalledWith('123', '456');
            expect(SimpleMessage.sendInfo).toHaveBeenCalled();
        });
    });

    describe('show subcommand', () => {
        it('should show game details', async () => {
            harness.withChatInputCommand({
                options: {
                    getSubcommand: () => 'show',
                    getString: () => '789',
                },
                user: {
                    id: '123',
                },
            });

            (onDemandGameService.getGameDetails as any).mockResolvedValue({ id: '789', createdAt: new Date(), turns: [], status: 'IN_PROGRESS' });

            await harness.run();

            expect(onDemandGameService.getGameDetails).toHaveBeenCalledWith('789');
            expect(SimpleMessage.sendInfo).toHaveBeenCalled();
        });
    });
});
