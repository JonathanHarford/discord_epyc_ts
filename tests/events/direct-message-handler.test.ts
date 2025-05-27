import { PrismaClient } from '@prisma/client';
import { Client, DMChannel, Message, User } from 'discord.js';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DirectMessageHandler, DMContextType } from '../../src/events/direct-message-handler.js';
import { Logger } from '../../src/services/index.js';
import { PlayerService } from '../../src/services/PlayerService.js';
import { SchedulerService } from '../../src/services/SchedulerService.js';
import { TurnOfferingService } from '../../src/services/TurnOfferingService.js';
import { SeasonTurnService } from '../../src/services/SeasonTurnService.js';
import { DEFAULT_TIMEOUTS } from '../../src/utils/seasonConfig.js';

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
    let turnService: SeasonTurnService;
    let playerService: PlayerService;
    let mockSchedulerService: SchedulerService;
    let turnOfferingService: TurnOfferingService;

    beforeAll(async () => {
        prisma = new PrismaClient();
        
        // Create mock Discord client for SeasonTurnService
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
        turnService = new SeasonTurnService(prisma, mockDiscordClient, mockSchedulerService);
        playerService = new PlayerService(prisma);
        
        // Create real turn offering service with test database
        turnOfferingService = new TurnOfferingService(prisma, mockDiscordClient, turnService, mockSchedulerService);
        
        // Create handler instance with real services
        handler = new DirectMessageHandler(prisma, mockDiscordClient, turnService, playerService, mockSchedulerService, turnOfferingService);
        
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
            send: vi.fn().mockResolvedValue(undefined),
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

    describe('season timeout configuration integration', () => {
        let testPlayer: any;
        let testSeasonConfig: any;
        let testSeason: any;
        let testGame: any;

        beforeEach(async () => {
            // Clean up before each test
            await prisma.$transaction([
                prisma.playersOnSeasons.deleteMany(),
                prisma.turn.deleteMany(),
                prisma.game.deleteMany(),
                prisma.season.deleteMany(),
                prisma.seasonConfig.deleteMany(),
                prisma.player.deleteMany(),
            ]);

            // Create test player
            testPlayer = await prisma.player.create({
                data: {
                    id: nanoid(),
                    discordUserId: 'timeout-test-player',
                    name: 'Timeout Test Player'
                }
            });

            mockMessage.author.id = testPlayer.discordUserId;
        });

        describe('/ready command with custom season timeouts', () => {
            it('should use custom writing timeout from season config when claiming writing turn', async () => {
                // Arrange - Create season with custom timeouts
                testSeasonConfig = await prisma.seasonConfig.create({
                    data: {
                        maxPlayers: 5,
                        minPlayers: 2,
                        turnPattern: 'WRITING,DRAWING',
                        claimTimeout: '2h',
                        writingTimeout: '6h', // Custom writing timeout
                        drawingTimeout: '3d',
                    },
                });

                testSeason = await prisma.season.create({
                    data: {
                        configId: testSeasonConfig.id,
                        status: 'ACTIVE',
                        creatorId: testPlayer.id,
                    },
                });

                await prisma.playersOnSeasons.create({
                    data: {
                        playerId: testPlayer.id,
                        seasonId: testSeason.id,
                    },
                });

                testGame = await prisma.game.create({
                    data: {
                        seasonId: testSeason.id,
                        status: 'ACTIVE',
                    },
                });

                // Create an OFFERED writing turn
                const writingTurn = await prisma.turn.create({
                    data: {
                        gameId: testGame.id,
                        playerId: testPlayer.id,
                        turnNumber: 1,
                        type: 'WRITING',
                        status: 'OFFERED',
                    },
                });

                mockMessage.content = '/ready';

                // Act
                await handler.process(mockMessage);

                // Assert - Check that scheduler was called with custom writing timeout (6h = 360 minutes)
                expect(mockSchedulerService.scheduleJob).toHaveBeenCalledWith(
                    `turn-submission-timeout-${writingTurn.id}`,
                    expect.any(Date),
                    expect.any(Function),
                    { turnId: writingTurn.id, playerId: testPlayer.id },
                    'turn-submission-timeout'
                );

                // Verify the scheduled date uses the custom timeout (6h = 360 minutes)
                const scheduledDate = (mockSchedulerService.scheduleJob as any).mock.calls[0][1];
                const now = Date.now();
                const expectedTimeoutMillis = 360 * 60 * 1000; // 6 hours in milliseconds
                expect(scheduledDate.getTime()).toBeGreaterThanOrEqual(now + expectedTimeoutMillis - 5000);
                expect(scheduledDate.getTime()).toBeLessThanOrEqual(now + expectedTimeoutMillis + 5000);
            });

            it('should use custom drawing timeout from season config when claiming drawing turn', async () => {
                // Arrange - Create season with custom timeouts
                testSeasonConfig = await prisma.seasonConfig.create({
                    data: {
                        maxPlayers: 5,
                        minPlayers: 2,
                        turnPattern: 'WRITING,DRAWING',
                        claimTimeout: '2h',
                        writingTimeout: '1d',
                        drawingTimeout: '5d', // Custom drawing timeout
                    },
                });

                testSeason = await prisma.season.create({
                    data: {
                        configId: testSeasonConfig.id,
                        status: 'ACTIVE',
                        creatorId: testPlayer.id,
                    },
                });

                await prisma.playersOnSeasons.create({
                    data: {
                        playerId: testPlayer.id,
                        seasonId: testSeason.id,
                    },
                });

                testGame = await prisma.game.create({
                    data: {
                        seasonId: testSeason.id,
                        status: 'ACTIVE',
                    },
                });

                // Create an OFFERED drawing turn
                const drawingTurn = await prisma.turn.create({
                    data: {
                        gameId: testGame.id,
                        playerId: testPlayer.id,
                        turnNumber: 1,
                        type: 'DRAWING',
                        status: 'OFFERED',
                    },
                });

                mockMessage.content = '/ready';

                // Act
                await handler.process(mockMessage);

                // Assert - Check that scheduler was called with custom drawing timeout (5d = 7200 minutes)
                expect(mockSchedulerService.scheduleJob).toHaveBeenCalledWith(
                    `turn-submission-timeout-${drawingTurn.id}`,
                    expect.any(Date),
                    expect.any(Function),
                    { turnId: drawingTurn.id, playerId: testPlayer.id },
                    'turn-submission-timeout'
                );

                // Verify the scheduled date uses the custom timeout (5d = 7200 minutes)
                const scheduledDate = (mockSchedulerService.scheduleJob as any).mock.calls[0][1];
                const now = Date.now();
                const expectedTimeoutMillis = 7200 * 60 * 1000; // 5 days in milliseconds
                expect(scheduledDate.getTime()).toBeGreaterThanOrEqual(now + expectedTimeoutMillis - 5000);
                expect(scheduledDate.getTime()).toBeLessThanOrEqual(now + expectedTimeoutMillis + 5000);
            });

            it('should use default timeouts when season config has invalid timeout values', async () => {
                // Arrange - Create season with invalid timeouts
                testSeasonConfig = await prisma.seasonConfig.create({
                    data: {
                        maxPlayers: 5,
                        minPlayers: 2,
                        turnPattern: 'WRITING,DRAWING',
                        claimTimeout: '2h',
                        writingTimeout: 'invalid_writing', // Invalid writing timeout
                        drawingTimeout: 'invalid_drawing', // Invalid drawing timeout
                    },
                });

                testSeason = await prisma.season.create({
                    data: {
                        configId: testSeasonConfig.id,
                        status: 'ACTIVE',
                        creatorId: testPlayer.id,
                    },
                });

                await prisma.playersOnSeasons.create({
                    data: {
                        playerId: testPlayer.id,
                        seasonId: testSeason.id,
                    },
                });

                testGame = await prisma.game.create({
                    data: {
                        seasonId: testSeason.id,
                        status: 'ACTIVE',
                    },
                });

                // Create an OFFERED writing turn
                const writingTurn = await prisma.turn.create({
                    data: {
                        gameId: testGame.id,
                        playerId: testPlayer.id,
                        turnNumber: 1,
                        type: 'WRITING',
                        status: 'OFFERED',
                    },
                });

                mockMessage.content = '/ready';

                // Act
                await handler.process(mockMessage);

                // Assert - Check that scheduler was called with default writing timeout
                expect(mockSchedulerService.scheduleJob).toHaveBeenCalledWith(
                    `turn-submission-timeout-${writingTurn.id}`,
                    expect.any(Date),
                    expect.any(Function),
                    { turnId: writingTurn.id, playerId: testPlayer.id },
                    'turn-submission-timeout'
                );

                // Verify the scheduled date uses the default timeout
                const scheduledDate = (mockSchedulerService.scheduleJob as any).mock.calls[0][1];
                const now = Date.now();
                const expectedTimeoutMillis = DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES * 60 * 1000;
                expect(scheduledDate.getTime()).toBeGreaterThanOrEqual(now + expectedTimeoutMillis - 5000);
                expect(scheduledDate.getTime()).toBeLessThanOrEqual(now + expectedTimeoutMillis + 5000);
            });

            it('should use default timeouts when season config has null timeout values', async () => {
                // Arrange - Create season with config that has invalid timeout values
                testSeasonConfig = await prisma.seasonConfig.create({
                    data: {
                        maxPlayers: 5,
                        minPlayers: 2,
                        turnPattern: 'WRITING,DRAWING',
                        claimTimeout: 'invalid_claim',
                        writingTimeout: 'invalid_writing', 
                        drawingTimeout: 'invalid_drawing',
                    },
                });

                testSeason = await prisma.season.create({
                    data: {
                        status: 'ACTIVE',
                        config: {
                            connect: { id: testSeasonConfig.id }
                        },
                        creator: {
                            connect: { id: testPlayer.id }
                        },
                    },
                });

                await prisma.playersOnSeasons.create({
                    data: {
                        playerId: testPlayer.id,
                        seasonId: testSeason.id,
                    },
                });

                testGame = await prisma.game.create({
                    data: {
                        seasonId: testSeason.id,
                        status: 'ACTIVE',
                    },
                });

                // Create an OFFERED drawing turn
                const drawingTurn = await prisma.turn.create({
                    data: {
                        gameId: testGame.id,
                        playerId: testPlayer.id,
                        turnNumber: 1,
                        type: 'DRAWING',
                        status: 'OFFERED',
                    },
                });

                mockMessage.content = '/ready';

                // Act
                await handler.process(mockMessage);

                // Assert - Check that scheduler was called with default drawing timeout
                expect(mockSchedulerService.scheduleJob).toHaveBeenCalledWith(
                    `turn-submission-timeout-${drawingTurn.id}`,
                    expect.any(Date),
                    expect.any(Function),
                    { turnId: drawingTurn.id, playerId: testPlayer.id },
                    'turn-submission-timeout'
                );

                // Verify the scheduled date uses the default timeout
                const scheduledDate = (mockSchedulerService.scheduleJob as any).mock.calls[0][1];
                const now = Date.now();
                const expectedTimeoutMillis = DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES * 60 * 1000;
                expect(scheduledDate.getTime()).toBeGreaterThanOrEqual(now + expectedTimeoutMillis - 5000);
                expect(scheduledDate.getTime()).toBeLessThanOrEqual(now + expectedTimeoutMillis + 5000);
            });
        });
    });
}); 