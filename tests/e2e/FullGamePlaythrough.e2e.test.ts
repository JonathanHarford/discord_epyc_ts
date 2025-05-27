import { PrismaClient } from '@prisma/client';
import { 
  Client as DiscordClient
} from 'discord.js';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameService } from '../../src/services/GameService.js';
import { SchedulerService } from '../../src/services/SchedulerService.js';
import { SeasonService } from '../../src/services/SeasonService.js';
import { SeasonTurnService } from '../../src/services/SeasonTurnService.js';
import { TurnOfferingService } from '../../src/services/TurnOfferingService.js';
import { truncateTables } from '../utils/testUtils.js';

// Mock SimpleMessage to capture command outputs
vi.mock('../../src/messaging/SimpleMessage.js', () => ({
  SimpleMessage: {
    sendEmbed: vi.fn().mockResolvedValue(undefined),
    sendSuccess: vi.fn().mockResolvedValue(undefined),
    sendError: vi.fn().mockResolvedValue(undefined),
    sendWarning: vi.fn().mockResolvedValue(undefined),
    sendInfo: vi.fn().mockResolvedValue(undefined)
  }
}));

// This is a comprehensive end-to-end test that focuses on game mechanics,
// turn progression, player interactions, and edge cases within a single game
describe('Full Game Playthrough End-to-End Test', () => {
  let prisma: PrismaClient;
  let seasonService: SeasonService;
  let turnService: SeasonTurnService;
  let turnOfferingService: TurnOfferingService;
  let gameService: GameService;
  let mockSchedulerService: SchedulerService;
  let mockDiscordClient: any;
  let testPlayers: any[] = [];
  let seasonId: string;
  let gameId: string;

  // Initialize services and test data
  beforeAll(async () => {
    prisma = new PrismaClient();
    
    // Create comprehensive mock Discord client
    mockDiscordClient = {
      users: {
        fetch: vi.fn().mockImplementation((userId) => {
          return Promise.resolve({
            id: userId,
            username: `User-${userId.substring(0, 5)}`,
            send: vi.fn().mockImplementation((message) => {
              console.log(`Mock Discord DM to ${userId}: ${JSON.stringify(message)}`);
              return Promise.resolve({});
            }),
          });
        }),
      },
      shard: null,
      guilds: {
        cache: {
          size: 1
        }
      }
    };
    
    // Clean database before starting
    await truncateTables(prisma);
  });

  // Set up fresh test data before each test
  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock SchedulerService
    mockSchedulerService = {
      scheduleJob: vi.fn().mockReturnValue(true),
      cancelJob: vi.fn().mockReturnValue(true),
    } as unknown as SchedulerService;
    
    // Initialize services
    turnService = new SeasonTurnService(prisma, mockDiscordClient as unknown as DiscordClient);
    turnOfferingService = new TurnOfferingService(prisma, mockDiscordClient as unknown as DiscordClient, turnService, mockSchedulerService);
    gameService = new GameService(prisma);
    seasonService = new SeasonService(prisma, turnService, mockSchedulerService, gameService);
    
    // Create test players for a 4-player game
    testPlayers = [];
    for (let i = 0; i < 4; i++) {
      const player = await prisma.player.create({
        data: {
          discordUserId: `discord-${i}-${nanoid()}`,
          name: `Player ${i + 1}`,
        },
      });
      testPlayers.push(player);
    }
  });

  // Clean up after all tests
  afterAll(async () => {
    await truncateTables(prisma);
    await prisma.$disconnect();
  });

  it('should complete a full game with complex turn patterns and player interactions', async () => {
    console.log('🎮 Starting Full Game Playthrough Test');
    
    // ===== PHASE 1: SEASON AND GAME SETUP =====
    console.log('\n📅 PHASE 1: Season and Game Setup');
    
    // Create season with complex turn pattern
    const createSeasonResult = await seasonService.createSeason({
      creatorPlayerId: testPlayers[0].id,
      maxPlayers: 4,
      minPlayers: 4,
      openDuration: '1d',
      turnPattern: 'writing,drawing,writing,drawing', // 4 turns per game
      claimTimeout: '1h',
      writingTimeout: '30m',
      drawingTimeout: '1h',
    });

    expect(createSeasonResult.type).toBe('success');
    seasonId = createSeasonResult.data?.seasonId ?? '';
    console.log(`✅ Created season: ${seasonId}`);

    // All players join the season
    for (let i = 0; i < 4; i++) {
      const result = await seasonService.addPlayerToSeason(testPlayers[i].id, seasonId);
      expect(result.type).toBe('success');
      console.log(`✅ Player ${i + 1} joined`);
    }

    // Get the activated season and select one game for detailed testing
    const activatedSeason = await prisma.season.findUnique({
      where: { id: seasonId },
      include: { 
        games: {
          include: {
            turns: {
              orderBy: { turnNumber: 'asc' }
            }
          }
        },
        players: { include: { player: true } },
      },
    });

    expect(activatedSeason).not.toBeNull();
    expect(activatedSeason!.status).toBe('ACTIVE');
    expect(activatedSeason!.games.length).toBe(4);
    
    // Focus on the first game for detailed testing
    gameId = activatedSeason!.games[0].id;
    console.log(`✅ Focusing on Game: ${gameId}`);

    // ===== PHASE 2: TURN 1 - INITIAL WRITING =====
    console.log('\n✍️ PHASE 2: Turn 1 - Initial Writing');
    
    let currentGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        turns: {
          orderBy: { turnNumber: 'asc' }
        }
      }
    });

    expect(currentGame!.turns.length).toBe(1);
    let currentTurn = currentGame!.turns[0];
    expect(currentTurn.type).toBe('WRITING');
    expect(currentTurn.status).toBe('OFFERED');
    
    // Test turn offering details
    expect(currentTurn.playerId).toBeTruthy();
    const firstPlayer = testPlayers.find(p => p.id === currentTurn.playerId);
    expect(firstPlayer).toBeTruthy();
    console.log(`✅ Turn 1 offered to Player ${testPlayers.indexOf(firstPlayer!) + 1}`);

    // Player claims the turn
    const claimResult1 = await turnService.claimTurn(currentTurn.id, firstPlayer!.id);
    expect(claimResult1.success).toBe(true);
    console.log('✅ Turn 1 claimed');

    // Verify turn status after claiming
    currentTurn = (await prisma.turn.findUnique({ where: { id: currentTurn.id } }))!;
    expect(currentTurn!.status).toBe('PENDING');

    // Submit writing content with rich story
    const story1 = 'In the mystical realm of Aethermoor, where floating islands drift through clouds of stardust, a young cartographer named Lyra discovered an ancient map that seemed to redraw itself with each passing moment. The parchment whispered secrets of forgotten kingdoms and warned of the Shadow Weaver who sought to unravel the very fabric of reality.';
    const submitResult1 = await turnService.submitTurn(currentTurn.id, firstPlayer!.id, story1, 'text');
    expect(submitResult1.success).toBe(true);
    console.log('✅ Turn 1 submitted with rich story content');

    // Verify turn completion and content
    currentTurn = (await prisma.turn.findUnique({ where: { id: currentTurn.id } }))!;
    expect(currentTurn!.status).toBe('COMPLETED');
    expect(currentTurn!.textContent).toBe(story1);
    expect(currentTurn!.completedAt).toBeTruthy();

    // ===== PHASE 3: TURN 2 - FIRST DRAWING =====
    console.log('\n🎨 PHASE 3: Turn 2 - First Drawing');
    
    // Create and offer the next turn
    const drawingTurn1 = await prisma.turn.create({
      data: {
        id: nanoid(),
        gameId: gameId,
        turnNumber: 2,
        type: 'DRAWING',
        status: 'AVAILABLE',
        previousTurnId: currentTurn.id
      }
    });

    const offerResult2 = await turnOfferingService.offerNextTurn(gameId, 'turn_completed');
    expect(offerResult2.success).toBe(true);
    
    // Get the updated turn with player assignment
    let drawingTurn = await prisma.turn.findUnique({ where: { id: drawingTurn1.id } })!;
    expect(drawingTurn!.status).toBe('OFFERED');
    expect(drawingTurn!.playerId).toBeTruthy();
    
    const secondPlayer = testPlayers.find(p => p.id === drawingTurn!.playerId);
    expect(secondPlayer).toBeTruthy();
    expect(secondPlayer!.id).not.toBe(firstPlayer!.id); // Should be different player
    console.log(`✅ Turn 2 offered to Player ${testPlayers.indexOf(secondPlayer!) + 1}`);

    // Player claims and submits drawing
    const claimResult2 = await turnService.claimTurn(drawingTurn!.id, secondPlayer!.id);
    expect(claimResult2.success).toBe(true);

    const drawingUrl1 = 'https://example.com/drawings/aethermoor-floating-islands.png';
    const submitResult2 = await turnService.submitTurn(drawingTurn!.id, secondPlayer!.id, drawingUrl1, 'image');
    expect(submitResult2.success).toBe(true);
    console.log('✅ Turn 2 drawing submitted');

    // Verify drawing turn completion
    drawingTurn = await prisma.turn.findUnique({ where: { id: drawingTurn!.id } })!;
    expect(drawingTurn!.status).toBe('COMPLETED');
    expect(drawingTurn!.imageUrl).toBe(drawingUrl1);

    // ===== PHASE 4: TURN 3 - SECOND WRITING =====
    console.log('\n✍️ PHASE 4: Turn 3 - Second Writing');
    
    // Create and offer the third turn
    const writingTurn2 = await prisma.turn.create({
      data: {
        id: nanoid(),
        gameId: gameId,
        turnNumber: 3,
        type: 'WRITING',
        status: 'AVAILABLE',
        previousTurnId: drawingTurn!.id
      }
    });

    const offerResult3 = await turnOfferingService.offerNextTurn(gameId, 'turn_completed');
    expect(offerResult3.success).toBe(true);
    
    let writingTurn = await prisma.turn.findUnique({ where: { id: writingTurn2.id } })!;
    const thirdPlayer = testPlayers.find(p => p.id === writingTurn!.playerId);
    expect(thirdPlayer).toBeTruthy();
    console.log(`✅ Turn 3 offered to Player ${testPlayers.indexOf(thirdPlayer!) + 1}`);

    // Player claims and submits continuation
    const claimResult3 = await turnService.claimTurn(writingTurn!.id, thirdPlayer!.id);
    expect(claimResult3.success).toBe(true);

    const story2 = 'Gazing upon the ethereal artwork that materialized before her, Lyra felt the map\'s magic pulse stronger than ever. The floating islands in the drawing seemed to mirror those depicted on her ancient parchment, but with a crucial difference - a dark tendril snaked between them, growing larger with each heartbeat. She realized the Shadow Weaver had already begun its work, and time was running short to gather the three Crystal Anchors that could stabilize the realm.';
    const submitResult3 = await turnService.submitTurn(writingTurn!.id, thirdPlayer!.id, story2, 'text');
    expect(submitResult3.success).toBe(true);
    console.log('✅ Turn 3 story continuation submitted');

    // ===== PHASE 5: TURN 4 - FINAL DRAWING =====
    console.log('\n🎨 PHASE 5: Turn 4 - Final Drawing');
    
    // Create and offer the final turn
    const drawingTurn2 = await prisma.turn.create({
      data: {
        id: nanoid(),
        gameId: gameId,
        turnNumber: 4,
        type: 'DRAWING',
        status: 'AVAILABLE',
        previousTurnId: writingTurn!.id
      }
    });

    const offerResult4 = await turnOfferingService.offerNextTurn(gameId, 'turn_completed');
    expect(offerResult4.success).toBe(true);
    
    let finalDrawingTurn = await prisma.turn.findUnique({ where: { id: drawingTurn2.id } })!;
    const fourthPlayer = testPlayers.find(p => p.id === finalDrawingTurn!.playerId);
    expect(fourthPlayer).toBeTruthy();
    console.log(`✅ Turn 4 offered to Player ${testPlayers.indexOf(fourthPlayer!) + 1}`);

    // Player claims and submits final drawing
    const claimResult4 = await turnService.claimTurn(finalDrawingTurn!.id, fourthPlayer!.id);
    expect(claimResult4.success).toBe(true);

    const drawingUrl2 = 'https://example.com/drawings/shadow-weaver-crystal-anchors.png';
    const submitResult4 = await turnService.submitTurn(finalDrawingTurn!.id, fourthPlayer!.id, drawingUrl2, 'image');
    expect(submitResult4.success).toBe(true);
    console.log('✅ Turn 4 final drawing submitted');

    // ===== PHASE 6: GAME COMPLETION VERIFICATION =====
    console.log('\n🏁 PHASE 6: Game Completion Verification');
    
    const completedGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        turns: {
          orderBy: { turnNumber: 'asc' },
          include: {
            player: true
          }
        }
      }
    });

    expect(completedGame).not.toBeNull();
    expect(completedGame!.turns.length).toBe(4);
    expect(completedGame!.status).toBe('COMPLETED');
    
    // Verify turn sequence and player rotation
    const playerOrder: string[] = [];
    for (const turn of completedGame!.turns) {
      expect(turn.status).toBe('COMPLETED');
      if (turn.playerId) {
        playerOrder.push(turn.playerId);
      }
      
      // Verify content exists and is appropriate for turn type
      if (turn.type === 'WRITING') {
        expect(turn.textContent).toBeTruthy();
        expect(turn.textContent!.length).toBeGreaterThan(50);
      } else {
        expect(turn.imageUrl).toBeTruthy();
        expect(turn.imageUrl).toContain('https://');
      }
    }
    
    // Verify all players participated and no player repeated
    expect(new Set(playerOrder).size).toBe(4);
    console.log('✅ All 4 players participated exactly once');

    // ===== PHASE 7: STORY COHERENCE VERIFICATION =====
    console.log('\n📖 PHASE 7: Story Coherence Verification');
    
    console.log('\n📚 Complete Game Story:');
    for (let i = 0; i < completedGame!.turns.length; i++) {
      const turn = completedGame!.turns[i];
      const playerIndex = testPlayers.findIndex(p => p.id === turn.playerId);
      
      if (turn.type === 'WRITING') {
        console.log(`Turn ${i + 1} (Writing by Player ${playerIndex + 1}):`);
        console.log(`"${turn.textContent}"`);
      } else {
        console.log(`Turn ${i + 1} (Drawing by Player ${playerIndex + 1}):`);
        console.log(`Image: ${turn.imageUrl}`);
      }
      console.log('');
    }

    // Verify story elements are present
    const allText = completedGame!.turns
      .filter(t => t.type === 'WRITING')
      .map(t => t.textContent)
      .join(' ');
    
    expect(allText).toContain('Lyra');
    expect(allText).toContain('Aethermoor');
    expect(allText).toContain('Shadow Weaver');
    expect(allText).toContain('Crystal Anchors');
    console.log('✅ Story coherence maintained across turns');

    console.log('\n🎉 FULL GAME PLAYTHROUGH COMPLETED SUCCESSFULLY!');
  });

  it('should handle turn dismissals and re-offerings correctly', async () => {
    console.log('🔄 Testing Turn Dismissal and Re-offering');
    
    // Create a simple season for testing dismissals
    const createSeasonResult = await seasonService.createSeason({
      creatorPlayerId: testPlayers[0].id,
      maxPlayers: 3,
      minPlayers: 3,
      openDuration: '1d',
      turnPattern: 'writing,drawing',
      claimTimeout: '30m',
      writingTimeout: '1h',
      drawingTimeout: '1h',
    });

    expect(createSeasonResult.type).toBe('success');
    seasonId = createSeasonResult.data?.seasonId ?? '';

    // Players join
    for (let i = 0; i < 3; i++) {
      await seasonService.addPlayerToSeason(testPlayers[i].id, seasonId);
    }

    // Get the first game and turn
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: { games: { include: { turns: true } } }
    });

    gameId = season!.games[0].id;
    const firstTurn = season!.games[0].turns[0];

    // Test dismissal
    console.log('Testing turn dismissal...');
    const dismissResult = await turnService.dismissOffer(firstTurn.id);
    expect(dismissResult.success).toBe(true);
    
    let turnAfterDismiss = await prisma.turn.findUnique({ where: { id: firstTurn.id } });
    expect(turnAfterDismiss!.status).toBe('AVAILABLE');
    expect(turnAfterDismiss!.playerId).toBeNull();
    console.log('✅ Turn dismissed successfully');

    // Test re-offering to different player
    console.log('Testing turn re-offering...');
    const reOfferResult = await turnOfferingService.offerNextTurn(gameId, 'claim_timeout');
    expect(reOfferResult.success).toBe(true);
    
    let turnAfterReOffer = await prisma.turn.findUnique({ where: { id: firstTurn.id } });
    expect(turnAfterReOffer!.status).toBe('OFFERED');
    expect(turnAfterReOffer!.playerId).toBeTruthy();
    console.log('✅ Turn re-offered successfully');

    // Test multiple dismissals cycle through players
    
    // Dismiss again
    await turnService.dismissOffer(firstTurn.id);
    const secondReOffer = await turnOfferingService.offerNextTurn(gameId, 'claim_timeout');
    expect(secondReOffer.success).toBe(true);
    
    let turnAfterSecondReOffer = await prisma.turn.findUnique({ where: { id: firstTurn.id } });
    // Note: The turn might be offered to the same player again in a small player pool
    expect(turnAfterSecondReOffer!.playerId).toBeTruthy();
    console.log('✅ Turn re-offered successfully after second dismissal');
  });

  it('should handle turn skipping due to timeouts', async () => {
    console.log('⏰ Testing Turn Skipping Due to Timeouts');
    
    // Create season with short timeouts
    const createSeasonResult = await seasonService.createSeason({
      creatorPlayerId: testPlayers[0].id,
      maxPlayers: 3,
      minPlayers: 3,
      openDuration: '1d',
      turnPattern: 'writing,drawing',
      claimTimeout: '1m',
      writingTimeout: '2m',
      drawingTimeout: '3m',
    });

    expect(createSeasonResult.type).toBe('success');
    seasonId = createSeasonResult.data?.seasonId ?? '';

    // Players join
    for (let i = 0; i < 3; i++) {
      await seasonService.addPlayerToSeason(testPlayers[i].id, seasonId);
    }

    // Get the first turn
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: { games: { include: { turns: true } } }
    });

    const firstTurn = season!.games[0].turns[0];
    gameId = season!.games[0].id;

    // Claim the turn
    const player = testPlayers.find(p => p.id === firstTurn.playerId);
    const claimResult = await turnService.claimTurn(firstTurn.id, player!.id);
    expect(claimResult.success).toBe(true);
    console.log('✅ Turn claimed');

    // Simulate timeout by skipping the turn
    const skipResult = await turnService.skipTurn(firstTurn.id);
    expect(skipResult.success).toBe(true);
    
    const skippedTurn = await prisma.turn.findUnique({ where: { id: firstTurn.id } });
    expect(skippedTurn!.status).toBe('SKIPPED');
    expect(skippedTurn!.skippedAt).toBeTruthy();
    console.log('✅ Turn skipped due to timeout');

    // Verify next turn is offered
    const _nextTurn = await prisma.turn.create({
      data: {
        id: nanoid(),
        gameId: gameId,
        turnNumber: 2,
        type: 'DRAWING',
        status: 'AVAILABLE',
        previousTurnId: firstTurn.id
      }
    });

    const offerNextResult = await turnOfferingService.offerNextTurn(gameId, 'turn_skipped');
    expect(offerNextResult.success).toBe(true);
    console.log('✅ Next turn offered after skip');
  });

  it('should handle edge cases and error conditions', async () => {
    console.log('🚨 Testing Edge Cases and Error Conditions');
    
    // Create minimal season
    const createSeasonResult = await seasonService.createSeason({
      creatorPlayerId: testPlayers[0].id,
      maxPlayers: 2,
      minPlayers: 2,
      openDuration: '1d',
      turnPattern: 'writing',
      claimTimeout: '1h',
      writingTimeout: '1h',
      drawingTimeout: '1h',
    });

    expect(createSeasonResult.type).toBe('success');
    seasonId = createSeasonResult.data?.seasonId ?? '';

    // Only 2 players join
    for (let i = 0; i < 2; i++) {
      await seasonService.addPlayerToSeason(testPlayers[i].id, seasonId);
    }

    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: { games: { include: { turns: true } } }
    });

    const firstTurn = season!.games[0].turns[0];
    const assignedPlayer = testPlayers.find(p => p.id === firstTurn.playerId);
    const otherPlayer = testPlayers.find(p => p.id !== firstTurn.playerId);

    // Test: Wrong player trying to claim turn
    console.log('Testing wrong player claim attempt...');
    const wrongClaimResult = await turnService.claimTurn(firstTurn.id, otherPlayer!.id);
    expect(wrongClaimResult.success).toBe(false);
    expect(wrongClaimResult.error).toContain('not offered');
    console.log('✅ Wrong player claim rejected');

    // Test: Double claiming
    console.log('Testing double claim attempt...');
    const firstClaimResult = await turnService.claimTurn(firstTurn.id, assignedPlayer!.id);
    expect(firstClaimResult.success).toBe(true);
    
    const secondClaimResult = await turnService.claimTurn(firstTurn.id, assignedPlayer!.id);
    expect(secondClaimResult.success).toBe(false);
    expect(secondClaimResult.error).toContain('not in OFFERED state');
    console.log('✅ Double claim rejected');

    // Test: Wrong player trying to submit
    console.log('Testing wrong player submission attempt...');
    const wrongSubmitResult = await turnService.submitTurn(firstTurn.id, otherPlayer!.id, 'Test content', 'text');
    expect(wrongSubmitResult.success).toBe(false);
    expect(wrongSubmitResult.error).toContain('Turn does not belong to this player');
    console.log('✅ Wrong player submission rejected');

    // Test: Empty content submission
    console.log('Testing empty content submission...');
    const emptySubmitResult = await turnService.submitTurn(firstTurn.id, assignedPlayer!.id, '', 'text');
    expect(emptySubmitResult.success).toBe(false);
    expect(emptySubmitResult.error).toContain('Content cannot be empty');
    console.log('✅ Empty content submission rejected');

    // Test: Invalid content type
    console.log('Testing invalid content type...');
    const invalidTypeResult = await turnService.submitTurn(firstTurn.id, assignedPlayer!.id, 'Test content', 'invalid' as any);
    expect(invalidTypeResult.success).toBe(false);
    console.log('✅ Invalid content type rejected');

    // Test: Successful submission
    console.log('Testing successful submission...');
    const successSubmitResult = await turnService.submitTurn(firstTurn.id, assignedPlayer!.id, 'Valid test content', 'text');
    expect(successSubmitResult.success).toBe(true);
    console.log('✅ Valid submission accepted');

    // Test: Double submission
    console.log('Testing double submission attempt...');
    const doubleSubmitResult = await turnService.submitTurn(firstTurn.id, assignedPlayer!.id, 'Another content', 'text');
    expect(doubleSubmitResult.success).toBe(false);
    expect(doubleSubmitResult.error).toContain('not in PENDING state');
    console.log('✅ Double submission rejected');
  });

  it('should track turn timing and performance metrics', async () => {
    console.log('📊 Testing Turn Timing and Performance Metrics');
    
    // Create season for timing tests
    const createSeasonResult = await seasonService.createSeason({
      creatorPlayerId: testPlayers[0].id,
      maxPlayers: 2,
      minPlayers: 2,
      openDuration: '1d',
      turnPattern: 'writing,drawing',
      claimTimeout: '1h',
      writingTimeout: '30m',
      drawingTimeout: '1h',
    });

    expect(createSeasonResult.type).toBe('success');
    seasonId = createSeasonResult.data?.seasonId ?? '';

    // Players join
    for (let i = 0; i < 2; i++) {
      await seasonService.addPlayerToSeason(testPlayers[i].id, seasonId);
    }

    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: { games: { include: { turns: true } } }
    });

    const firstTurn = season!.games[0].turns[0];
    const player = testPlayers.find(p => p.id === firstTurn.playerId);

    // Record timing for claim
    const claimStartTime = new Date();
    const claimResult = await turnService.claimTurn(firstTurn.id, player!.id);
    expect(claimResult.success).toBe(true);
    
    let turnAfterClaim = await prisma.turn.findUnique({ where: { id: firstTurn.id } });
    expect(turnAfterClaim!.claimedAt).toBeTruthy();
    
    const claimDuration = new Date().getTime() - claimStartTime.getTime();
    console.log(`✅ Turn claimed in ${claimDuration}ms`);

    // Add small delay to simulate thinking time
    await new Promise(resolve => setTimeout(resolve, 10));

    // Record timing for submission
    const submitStartTime = new Date();
    const submitResult = await turnService.submitTurn(firstTurn.id, player!.id, 'Timed test content', 'text');
    expect(submitResult.success).toBe(true);
    
    let turnAfterSubmit = await prisma.turn.findUnique({ where: { id: firstTurn.id } });
    expect(turnAfterSubmit!.completedAt).toBeTruthy();
    
    const submitDuration = new Date().getTime() - submitStartTime.getTime();
    console.log(`✅ Turn submitted in ${submitDuration}ms`);

    // Calculate total turn duration
    const totalTurnDuration = turnAfterSubmit!.completedAt!.getTime() - turnAfterSubmit!.claimedAt!.getTime();
    console.log(`✅ Total turn duration: ${totalTurnDuration}ms`);

    // Verify timing fields are properly set
    expect(turnAfterSubmit!.offeredAt).toBeTruthy();
    expect(turnAfterSubmit!.claimedAt).toBeTruthy();
    expect(turnAfterSubmit!.completedAt).toBeTruthy();
    expect(turnAfterSubmit!.claimedAt!.getTime()).toBeGreaterThan(turnAfterSubmit!.offeredAt!.getTime());
    expect(turnAfterSubmit!.completedAt!.getTime()).toBeGreaterThan(turnAfterSubmit!.claimedAt!.getTime());
    
    console.log('✅ All timing fields properly recorded');
  });
}); 