import { Message, User, Client, DMChannel } from 'discord.js';
import { beforeEach, describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';

import { DirectMessageHandler, DMContextType } from '../../src/events/direct-message-handler.js';
import { Logger } from '../../src/services/index.js';
import { TurnService } from '../../src/services/TurnService.js';
import { PlayerService } from '../../src/services/PlayerService.js';
import { SchedulerService } from '../../src/services/SchedulerService.js';
import { TurnOfferingService } from '../../src/services/TurnOfferingService.js';

// Mock the Logger
vi.mock('../../src/services/index.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock MessageAdapter to avoid language file issues in tests
vi.mock('../../src/messaging/MessageAdapter.js', () => ({
    MessageAdapter: {
        processInstruction: vi.fn().mockResolvedValue(undefined),
        safeProcessInstruction: vi.fn().mockResolvedValue(true),
    },
}));

describe('DirectMessageHandler - Integration Tests', () => {
    let handler: DirectMessageHandler;
    let mockMessage: Message;
    let mockUser: User;
    let mockClient: Client;
    let mockDMChannel: DMChannel;
    let prisma: PrismaClient;
    let turnService: TurnService;
    let playerService: PlayerService;
    let mockSchedulerService: SchedulerService;
    let turnOfferingService: TurnOfferingService;

    beforeAll(async () => {
        prisma = new PrismaClient();
        
        // Create mock Discord client for TurnService
        const mockDiscordClient = {
            users: {
                fetch: vi.fn().mockResolvedValue({
                    send: vi.fn().mockResolvedValue(undefined)
                })
            }
        } as any;
        
        // Create mock scheduler service (we don't want real timers in tests)
        mockSchedulerService = {
            scheduleJob: vi.fn().mockReturnValue(true),
            cancelJob: vi.fn().mockReturnValue(true),
        } as unknown as SchedulerService;
        
        // Create real services with test database
        turnService = new TurnService(prisma, mockDiscordClient);
        playerService = new PlayerService(prisma);
        
        // Create real turn offering service with test database
        turnOfferingService = new TurnOfferingService(prisma, mockDiscordClient, turnService, mockSchedulerService);
        
        // Create handler instance with real services
        handler = new DirectMessageHandler(turnService, playerService, mockSchedulerService, turnOfferingService);
        
        // Clean database
        await prisma.$transaction([
            prisma.playersOnSeasons.deleteMany(),
            prisma.turn.deleteMany(),
            prisma.game.deleteMany(),
            prisma.season.deleteMany(),
            prisma.seasonConfig.deleteMany(),
            prisma.player.deleteMany(),
        ]);
    });

    afterAll(async () => {
        // Clean up after all tests
        await prisma.$transaction([
            prisma.playersOnSeasons.deleteMany(),
            prisma.turn.deleteMany(),
            prisma.game.deleteMany(),
            prisma.season.deleteMany(),
            prisma.seasonConfig.deleteMany(),
            prisma.player.deleteMany(),
        ]);
        await prisma.$disconnect();
    });

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create mock Discord objects
        mockUser = {
            id: '123456789',
            tag: 'testuser#1234',
            bot: false,
        } as unknown as User;

        mockClient = {
            user: {
                id: '987654321',
            },
        } as unknown as Client;

        mockDMChannel = {
            type: 1, // DM Channel type
        } as unknown as DMChannel;

        // Create mock message
        mockMessage = {
            id: '111222333',
            content: '',
            author: mockUser,
            client: mockClient,
            channel: mockDMChannel,
            attachments: {
                size: 0,
            },
            reply: vi.fn().mockResolvedValue(undefined),
        } as unknown as Message;
    });

    describe('process', () => {
        it('should process a DM with /ready command', async () => {
            // Arrange
            mockMessage.content = '/ready';

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Routing DM'));
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Processing /ready command'));
        });

        it('should process a DM with text content as turn submission', async () => {
            // Arrange
            mockMessage.content = 'This is my turn submission';

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Routing DM'));
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Processing turn submission'));
        });

        it('should process a DM with attachment as turn submission', async () => {
            // Arrange
            mockMessage.content = '';
            mockMessage.attachments = {
                size: 1,
            } as any;

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Routing DM'));
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Processing turn submission'));
        });

        it('should process an empty DM as other', async () => {
            // Arrange
            mockMessage.content = '';

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Routing DM'));
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('unrecognized DM'));
        });

        it('should handle errors during processing', async () => {
            // Arrange
            mockMessage.reply = vi.fn().mockRejectedValue(new Error('Test error'));

            // Act
            await handler.process(mockMessage);

            // Assert - The error should be handled gracefully by the error handler
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Routing DM'));
        });
    });

    describe('ready command integration', () => {
        it('should handle /ready command when player does not exist', async () => {
            // Arrange
            mockMessage.content = '/ready';
            mockMessage.author.id = 'non-existent-player';

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Processing /ready command'));
            // The handler should attempt to process but find no player
        });

        it('should handle /ready command when player exists but has no offered turns', async () => {
            // Arrange
            const testPlayer = await prisma.player.create({
                data: {
                    id: nanoid(),
                    discordUserId: 'test-player-ready',
                    name: 'Test Player'
                }
            });

            mockMessage.content = '/ready';
            mockMessage.author.id = testPlayer.discordUserId;

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Processing /ready command'));
            // The handler should find the player but no offered turns
        });
    });

    describe('turn submission integration', () => {
        it('should handle turn submission when player does not exist', async () => {
            // Arrange
            mockMessage.content = 'My turn submission';
            mockMessage.author.id = 'non-existent-player-submission';

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Processing turn submission'));
            // The handler should attempt to process but find no player
        });

        it('should handle turn submission when player exists but has no pending turns', async () => {
            // Arrange
            const testPlayer = await prisma.player.create({
                data: {
                    id: nanoid(),
                    discordUserId: 'test-player-submission',
                    name: 'Test Player'
                }
            });

            mockMessage.content = 'My turn submission';
            mockMessage.author.id = testPlayer.discordUserId;

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Processing turn submission'));
            // The handler should find the player but no pending turns
        });
    });
}); 