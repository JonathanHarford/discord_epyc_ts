import { Game, Player, PrismaClient, Season, SeasonConfig, Turn } from '@prisma/client';
import { Client as DiscordClient, User } from 'discord.js';
import { nanoid } from 'nanoid';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { interpolate, strings } from '../../src/lang/strings.js';
import { SchedulerService } from '../../src/services/SchedulerService.js';
import { SeasonTurnService } from '../../src/services/SeasonTurnService.js';
import { TurnOfferingService } from '../../src/services/TurnOfferingService.js';
import { FormatUtils } from '../../src/utils/format-utils.js';
import { DEFAULT_TIMEOUTS } from '../../src/utils/seasonConfig.js';

// --- Mocks ---

// Mock DiscordClient and its methods needed
const mockDiscordUser = { send: vi.fn() } as unknown as User;
const mockDiscordClient = {
  users: {
    fetch: vi.fn().mockResolvedValue(mockDiscordUser),
  },
} as unknown as DiscordClient;

// Mock only the scheduling part of SchedulerService
const mockScheduleJob = vi.fn().mockResolvedValue(true);
vi.mock('../../src/services/SchedulerService.js', () => ({
  SchedulerService: vi.fn().mockImplementation(() => ({
    scheduleJob: mockScheduleJob,
    cancelJob: vi.fn().mockResolvedValue(true),
  })),
}));

// --- Test Setup ---
const prisma = new PrismaClient();

describe('TurnOfferingService - Integration Tests', () => {
  let turnService: SeasonTurnService;
  let schedulerService: SchedulerService;
  let turnOfferingService: TurnOfferingService;

  let testPlayer: Player;
  let testGame: Game;
  let testSeason: Season;
  let testSeasonConfig: SeasonConfig;
  let availableTurn: Turn;

  const cleanupDatabase = async () => {
    await prisma.turn.deleteMany();
    await prisma.game.deleteMany();
    await prisma.playersOnSeasons.deleteMany();
    await prisma.season.deleteMany();
    await prisma.seasonConfig.deleteMany();
    await prisma.player.deleteMany();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupDatabase();

    // 1. Create Player
    testPlayer = await prisma.player.create({
      data: { discordUserId: 'user-' + nanoid(), name: 'TestOfferPlayer' },
    });

    // 2. Create SeasonConfig
    testSeasonConfig = await prisma.seasonConfig.create({
      data: {
        maxPlayers: 5,
        minPlayers: 2,
        turnPattern: 'WRITING,DRAWING',
        claimTimeout: '3h', // Custom claim timeout
        writingTimeout: '1d',
        drawingTimeout: '2d',
      },
    });

    // 3. Create Season
    testSeason = await prisma.season.create({
      data: {
        configId: testSeasonConfig.id,
        status: 'ACTIVE',
        creatorId: testPlayer.id,
      },
    });

    // 4. Add player to season
    await prisma.playersOnSeasons.create({
      data: {
        playerId: testPlayer.id,
        seasonId: testSeason.id,
      },
    });

    // 5. Create Game
    testGame = await prisma.game.create({
      data: {
        seasonId: testSeason.id,
        status: 'ACTIVE',
      },
    });

    // 6. Create an AVAILABLE Turn
    availableTurn = await prisma.turn.create({
      data: {
        gameId: testGame.id,
        turnNumber: 1,
        type: 'WRITING',
        status: 'AVAILABLE',
      },
    });
    
    // Initialize services with real instances (no mocking of database services)
    schedulerService = new SchedulerService(prisma);
    turnService = new SeasonTurnService(prisma, mockDiscordClient, schedulerService);
    turnOfferingService = new TurnOfferingService(
      prisma,
      mockDiscordClient,
      turnService,
      schedulerService
    );
  });

  afterAll(async () => {
    await cleanupDatabase();
    await prisma.$disconnect();
  });

  it('should offer a turn and use season-specific claim timeout for DM and scheduling', async () => {
    const expectedClaimTimeoutMinutes = 3 * 60; // 3h from config

    const result = await turnOfferingService.offerNextTurn(testGame.id, 'turn_completed');

    expect(result.success).toBe(true);
    expect(result.turn?.id).toBe(availableTurn.id);
    expect(result.player?.id).toBe(testPlayer.id);

    // Check DM content - enhanced messaging layer sends an object with content and components
    expect(mockDiscordClient.users.fetch).toHaveBeenCalledWith(testPlayer.discordUserId);
    
    // Calculate expected timeout expiration time for the test
    const turnAfterOffer = await prisma.turn.findUnique({ where: { id: availableTurn.id } });
    const turnOfferedAt = turnAfterOffer!.updatedAt;
    const timeoutExpiresAt = new Date(turnOfferedAt.getTime() + expectedClaimTimeoutMinutes * 60 * 1000);
    
    const expectedDMContent = interpolate(strings.messages.turnOffer.initialTurnOffer, {
      serverName: 'Direct Message', // Add server context for test scenarios
      gameId: testGame.id,
      seasonId: testSeason.id,
      turnNumber: availableTurn.turnNumber,
      turnType: availableTurn.type,
      claimTimeoutFormatted: FormatUtils.formatRemainingTime(timeoutExpiresAt),
    });
    expect(mockDiscordUser.send).toHaveBeenCalledWith({ 
      content: expectedDMContent,
      components: expect.arrayContaining([
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                custom_id: `turn_claim_${availableTurn.id}`,
                style: 1 // ButtonStyle.Primary
              })
            })
          ])
        })
      ])
    });

    // Check scheduled jobs (claim warning + claim timeout)
    expect(mockScheduleJob).toHaveBeenCalledTimes(2);
    
    // Find the claim timeout job (should be the second call)
    const claimTimeoutCall = mockScheduleJob.mock.calls.find(call => call[4] === 'turn-claim-timeout');
    expect(claimTimeoutCall).toBeDefined();
    const [jobId, scheduledDate, _jobFunction, jobData, jobType] = claimTimeoutCall!;
    
    expect(jobId).toBe('turn-claim-timeout-' + availableTurn.id);
    expect(jobType).toBe('turn-claim-timeout');
    expect(jobData).toEqual({ turnId: availableTurn.id, playerId: testPlayer.id });

    const now = Date.now();
    const expectedTimeoutMillis = expectedClaimTimeoutMinutes * 60 * 1000;
    // Check if the scheduledDate is approximately now + timeout duration
    // Allow a small delta for execution time (e.g., 5 seconds)
    expect(scheduledDate.getTime()).toBeGreaterThanOrEqual(now + expectedTimeoutMillis - 5000);
    expect(scheduledDate.getTime()).toBeLessThanOrEqual(now + expectedTimeoutMillis + 5000);
    
    // Verify the turn status was updated to OFFERED
    const updatedTurn = await prisma.turn.findUnique({ where: { id: availableTurn.id } });
    expect(updatedTurn?.status).toBe('OFFERED');
    expect(updatedTurn?.playerId).toBe(testPlayer.id);
  });

  it('should use default claim timeout if season config value is missing or invalid', async () => {
    // Update season config to have an invalid claimTimeout
    await prisma.seasonConfig.update({
      where: { id: testSeasonConfig.id },
      data: { claimTimeout: 'invalid_duration' },
    });
    
    const defaultClaimMinutes = DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES;

    await turnOfferingService.offerNextTurn(testGame.id, 'turn_completed');

    // Check DM - enhanced messaging layer sends an object with content and components
    // Calculate expected timeout expiration time for the default test
    const turnAfterDefaultOffer = await prisma.turn.findUnique({ where: { id: availableTurn.id } });
    const turnOfferedAtDefault = turnAfterDefaultOffer!.updatedAt;
    const timeoutExpiresAtDefault = new Date(turnOfferedAtDefault.getTime() + defaultClaimMinutes * 60 * 1000);
    
    const expectedDMContentWithDefault = interpolate(strings.messages.turnOffer.initialTurnOffer, {
        serverName: 'Direct Message', // Add server context for test scenarios
        gameId: testGame.id,
        seasonId: testSeason.id,
        turnNumber: availableTurn.turnNumber,
        turnType: availableTurn.type,
        claimTimeoutFormatted: FormatUtils.formatRemainingTime(timeoutExpiresAtDefault),
      });
    expect(mockDiscordUser.send).toHaveBeenCalledWith({ 
      content: expectedDMContentWithDefault,
      components: expect.arrayContaining([
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                custom_id: `turn_claim_${availableTurn.id}`,
                style: 1 // ButtonStyle.Primary
              })
            })
          ])
        })
      ])
    });
    
    // Check scheduled jobs (claim warning + claim timeout)
    expect(mockScheduleJob).toHaveBeenCalledTimes(2);
    
    // Find the claim timeout job
    const claimTimeoutCallDefault = mockScheduleJob.mock.calls.find(call => call[4] === 'turn-claim-timeout');
    expect(claimTimeoutCallDefault).toBeDefined();
    const [, scheduledDateDefault] = claimTimeoutCallDefault!;
    const nowDefault = Date.now();
    const expectedDefaultTimeoutMillis = defaultClaimMinutes * 60 * 1000;
    expect(scheduledDateDefault.getTime()).toBeGreaterThanOrEqual(nowDefault + expectedDefaultTimeoutMillis - 5000);
    expect(scheduledDateDefault.getTime()).toBeLessThanOrEqual(nowDefault + expectedDefaultTimeoutMillis + 5000);
  });

  it('should include previous turn context for subsequent turns', async () => {
    // First, delete the existing available turn to avoid conflicts
    await prisma.turn.delete({ where: { id: availableTurn.id } });

    // Create a second player for the test (MUST Rule 1 prevents same player from playing twice in one game)
    const secondPlayer = await prisma.player.create({
      data: { discordUserId: 'user-' + nanoid(), name: 'TestOfferPlayer2' },
    });

    // Add second player to season
    await prisma.playersOnSeasons.create({
      data: {
        playerId: secondPlayer.id,
        seasonId: testSeason.id,
      },
    });

    // Create a completed turn (turn 1) with content
    const completedTurn = await prisma.turn.create({
      data: {
        gameId: testGame.id,
        turnNumber: 1,
        type: 'WRITING',
        status: 'COMPLETED',
        textContent: 'A funny cat drawing',
        playerId: testPlayer.id,
      },
    });

    // Create an available turn 2 (drawing turn that should reference the previous writing)
    const secondTurn = await prisma.turn.create({
      data: {
        gameId: testGame.id,
        turnNumber: 2,
        type: 'DRAWING',
        status: 'AVAILABLE',
      },
    });

    const result = await turnOfferingService.offerNextTurn(testGame.id, 'turn_completed');

    expect(result.success).toBe(true);
    expect(result.turn?.id).toBe(secondTurn.id);
    expect(result.player?.id).toBe(secondPlayer.id); // Should be the second player

    // Check that the DM includes previous turn context
    const turnAfterOffer = await prisma.turn.findUnique({ where: { id: secondTurn.id } });
    const turnOfferedAt = turnAfterOffer!.updatedAt;
    const timeoutExpiresAt = new Date(turnOfferedAt.getTime() + 3 * 60 * 60 * 1000); // 3h from config

    const expectedDMContent = interpolate(strings.messages.turnOffer.newTurnAvailable, {
      serverName: 'Direct Message',
      gameId: testGame.id,
      seasonId: testSeason.id,
      turnNumber: secondTurn.turnNumber,
      turnType: secondTurn.type,
      claimTimeoutFormatted: FormatUtils.formatRemainingTime(timeoutExpiresAt),
      previousTurnContext: `**Previous text to draw:**\n"${completedTurn.textContent}"`
    });

    // Check that the Discord client fetched the second player's user
    expect(mockDiscordClient.users.fetch).toHaveBeenCalledWith(secondPlayer.discordUserId);

    expect(mockDiscordUser.send).toHaveBeenCalledWith({ 
      content: expectedDMContent,
      components: expect.arrayContaining([
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                custom_id: `turn_claim_${secondTurn.id}`,
                style: 1
              })
            })
          ])
        })
      ])
    });
  });
}); 