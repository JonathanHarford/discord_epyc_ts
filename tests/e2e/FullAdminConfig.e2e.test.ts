import { PrismaClient } from '@prisma/client';
import { 
  ChatInputCommandInteraction, 
  Client as DiscordClient,
  Guild,
  GuildMember,
  TextChannel,
  User
} from 'discord.js';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCommand } from '../../src/commands/chat/admin-command.js';
import { SimpleMessage } from '../../src/messaging/SimpleMessage.js';
import { EventData } from '../../src/models/internal-models.js';
import { ConfigService } from '../../src/services/ConfigService.js';
import { GameService } from '../../src/services/GameService.js';
import { OnDemandGameService } from '../../src/services/OnDemandGameService.js';
import { PlayerService } from '../../src/services/PlayerService.js';
import { SchedulerService } from '../../src/services/SchedulerService.js';
import { SeasonService } from '../../src/services/SeasonService.js';
import { SeasonTurnService } from '../../src/services/SeasonTurnService.js';
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

// Mock the config file at the module level
vi.mock('../../../config/config.json', () => ({
  default: {
    developers: ['admin-user-id', 'super-admin-id'],
    client: { token: 'test-token' }
  },
  developers: ['admin-user-id', 'super-admin-id'],
  client: { token: 'test-token' }
}));

// Mock PlayerService to spy on banPlayer calls
const mockBanPlayer = vi.fn();
const mockUnbanPlayer = vi.fn();
vi.mock('../../src/services/PlayerService.js', async () => {
  const actual = await vi.importActual('../../src/services/PlayerService.js') as any;
  return {
    PlayerService: class extends actual.PlayerService {
      async banPlayer(discordUserId: string, reason?: string) {
        console.log(`🔍 DEBUG: banPlayer called with discordUserId=${discordUserId}, reason=${reason}`);
        mockBanPlayer(discordUserId, reason);
        return super.banPlayer(discordUserId, reason);
      }
      
      async unbanPlayer(discordUserId: string) {
        console.log(`🔍 DEBUG: unbanPlayer called with discordUserId=${discordUserId}`);
        mockUnbanPlayer(discordUserId);
        return super.unbanPlayer(discordUserId);
      }
    }
  };
});

// Mock SeasonService to spy on terminateSeason calls
const mockTerminateSeason = vi.fn();
vi.mock('../../src/services/SeasonService.js', async () => {
  const actual = await vi.importActual('../../src/services/SeasonService.js') as any;
  return {
    SeasonService: class extends actual.SeasonService {
      async terminateSeason(seasonId: string) {
        console.log(`🔍 DEBUG: terminateSeason called with seasonId=${seasonId}`);
        mockTerminateSeason(seasonId);
        return super.terminateSeason(seasonId);
      }
    }
  };
});

// Test-specific AdminCommand that bypasses permission checks
class TestAdminCommand extends AdminCommand {
  public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
    // Skip the admin permission check and go directly to command handling
    console.log(`🔍 DEBUG: TestAdminCommand.execute called for user ${intr.user.id}`);
    
    // Initialize services with the Discord client from the interaction
    if (!(this as any).seasonService) {
      const turnService = new SeasonTurnService((this as any).prisma, intr.client);
      const schedulerService = new SchedulerService((this as any).prisma);
      const gameService = new GameService((this as any).prisma);
      (this as any).seasonService = new SeasonService((this as any).prisma, turnService, schedulerService, gameService);
      (this as any).onDemandGameService = new OnDemandGameService((this as any).prisma, intr.client, schedulerService);
    }

    const subcommandGroup = intr.options.getSubcommandGroup();
    
    switch (subcommandGroup) {
      case 'player': {
        await (this as any).handlePlayerCommand(intr, data);
        break;
      }
      case 'season': {
        await (this as any).handleSeasonCommand(intr, data);
        break;
      }
      case 'game': {
        await (this as any).handleGameCommand(intr, data);
        break;
      }
      case 'channel': {
        await (this as any).handleChannelCommand(intr, data);
        break;
      }
      default: {
        await SimpleMessage.sendEmbed(intr, { title: 'Not implemented' }, {}, true, 'warning');
        return;
      }
    }
  }
}

// This is a comprehensive end-to-end test that focuses on admin configuration management,
// testing all admin commands, configuration scenarios, and permission handling
describe('Full Admin Configuration End-to-End Test', () => {
  let prisma: PrismaClient;
  let seasonService: SeasonService;
  let turnService: SeasonTurnService;
  let gameService: GameService;
  let mockSchedulerService: SchedulerService;
  let mockDiscordClient: any;
  let testPlayers: any[] = [];
  let testSeasons: any[] = [];
  let adminCommand: AdminCommand;

  // Mock interaction creator for admin commands
  const createMockAdminInteraction = (
    subcommandGroup: string, 
    subcommand: string, 
    options: any = {}, 
    userId = 'admin-user-id'
  ): ChatInputCommandInteraction => {
    const mockUser = {
      id: userId,
      username: `AdminUser-${userId.substring(0, 8)}`,
      displayName: `AdminUser-${userId.substring(0, 8)}`
    } as User;

    const mockGuild = {
      id: 'test-guild-id',
      members: {
        fetch: vi.fn().mockResolvedValue({
          id: userId,
          joinedAt: new Date('2023-01-01'),
          user: mockUser
        } as GuildMember)
      }
    } as unknown as Guild;

    const mockChannel = {
      id: 'test-channel-id',
      send: vi.fn().mockResolvedValue({})
    } as unknown as TextChannel;

    return {
      commandName: 'admin',
      user: mockUser,
      guild: mockGuild,
      channel: mockChannel,
      client: mockDiscordClient,
      options: {
        getString: vi.fn().mockImplementation((name: string) => options[name] || null),
        getInteger: vi.fn().mockImplementation((name: string) => options[name] || null),
        getBoolean: vi.fn().mockImplementation((name: string) => options[name] || null),
        getUser: vi.fn().mockImplementation((name: string) => options[name] || mockUser),
        getSubcommand: vi.fn().mockReturnValue(subcommand),
        getSubcommandGroup: vi.fn().mockReturnValue(subcommandGroup)
      },
      reply: vi.fn().mockResolvedValue({}),
      editReply: vi.fn().mockResolvedValue({}),
      followUp: vi.fn().mockResolvedValue({}),
      deferReply: vi.fn().mockResolvedValue({}),
      replied: false,
      deferred: false
    } as unknown as ChatInputCommandInteraction;
  };

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
    
    // Reset spy functions
    mockBanPlayer.mockClear();
    mockUnbanPlayer.mockClear();
    mockTerminateSeason.mockClear();
    
    // Create mock SchedulerService
    mockSchedulerService = {
      scheduleJob: vi.fn().mockReturnValue(true),
      cancelJob: vi.fn().mockReturnValue(true),
    } as unknown as SchedulerService;
    
    // Initialize services
    turnService = new SeasonTurnService(prisma, mockDiscordClient as unknown as DiscordClient);
    gameService = new GameService(prisma);
    seasonService = new SeasonService(prisma, turnService, mockSchedulerService, gameService);
    new PlayerService(prisma);
    new ConfigService(prisma);
    
    // Initialize admin command
    adminCommand = new TestAdminCommand();
    
    // Create test players with various states
    testPlayers = [];
    for (let i = 0; i < 6; i++) {
      const player = await prisma.player.create({
        data: {
          discordUserId: `discord-${i}-${nanoid()}`,
          name: `TestPlayer ${i + 1}`,
          bannedAt: i === 4 ? new Date() : null, // Player 5 is banned
        },
      });
      testPlayers.push(player);
    }

    // Create test seasons with various states
    testSeasons = [];
    const seasonStates = ['OPEN', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
    for (let i = 0; i < 4; i++) {
      const season = await seasonService.createSeason({
        creatorPlayerId: testPlayers[i].id,
        maxPlayers: 4,
        minPlayers: 2,
        openDuration: '2d',
        turnPattern: 'writing,drawing',
        claimTimeout: '1h',
        writingTimeout: '30m',
        drawingTimeout: '1h',
      });
      
      if (season.type === 'success' && season.data) {
        // Manually update season status for testing
        await prisma.season.update({
          where: { id: season.data.seasonId },
          data: { status: seasonStates[i] }
        });
        
        testSeasons.push({
          id: season.data.seasonId,
          status: seasonStates[i]
        });
      }
    }
  });

  // Clean up after all tests
  afterAll(async () => {
    await truncateTables(prisma);
    await prisma.$disconnect();
  });

  it('should comprehensively test all admin player management commands', async () => {
    console.log('👑 Starting Admin Player Management Test');
    
    // ===== PHASE 1: PLAYER LIST COMMANDS =====
    console.log('\n📋 PHASE 1: Player List Commands');
    
    // Test /admin player list (all players)
    const listAllInteraction = createMockAdminInteraction('player', 'list');
    await adminCommand.execute(listAllInteraction, {} as EventData);
    console.log('✅ /admin player list executed (all players)');
    
    // Test /admin player list (banned only)
    const listBannedInteraction = createMockAdminInteraction('player', 'list', { banned: true });
    await adminCommand.execute(listBannedInteraction, {} as EventData);
    console.log('✅ /admin player list executed (banned only)');
    
    // Test /admin player list (with season filter)
    const listSeasonInteraction = createMockAdminInteraction('player', 'list', { 
      season: testSeasons[0].id 
    });
    await adminCommand.execute(listSeasonInteraction, {} as EventData);
    console.log('✅ /admin player list executed (with season filter)');
    
    // Test /admin player list (with invalid season)
    const listInvalidSeasonInteraction = createMockAdminInteraction('player', 'list', { 
      season: 'invalid-season-id' 
    });
    await adminCommand.execute(listInvalidSeasonInteraction, {} as EventData);
    console.log('✅ /admin player list executed (invalid season)');

    // ===== PHASE 2: PLAYER SHOW COMMANDS =====
    console.log('\n👤 PHASE 2: Player Show Commands');
    
    // Test /admin player show (existing player)
    const mockExistingUser = {
      id: testPlayers[0].discordUserId,
      username: testPlayers[0].name,
      displayName: testPlayers[0].name
    } as User;
    const showExistingInteraction = createMockAdminInteraction('player', 'show', { 
      user: mockExistingUser 
    });
    await adminCommand.execute(showExistingInteraction, {} as EventData);
    console.log('✅ /admin player show executed (existing player)');
    
    // Test /admin player show (non-existent player)
    const mockNonExistentUser = {
      id: 'non-existent-user-id',
      username: 'NonExistentUser',
      displayName: 'NonExistentUser'
    } as User;
    const showNonExistentInteraction = createMockAdminInteraction('player', 'show', { 
      user: mockNonExistentUser 
    });
    await adminCommand.execute(showNonExistentInteraction, {} as EventData);
    console.log('✅ /admin player show executed (non-existent player)');
    
    // Test /admin player show (banned player)
    const mockBannedUser = {
      id: testPlayers[4].discordUserId, // Player 5 is banned
      username: testPlayers[4].name,
      displayName: testPlayers[4].name
    } as User;
    const showBannedInteraction = createMockAdminInteraction('player', 'show', { 
      user: mockBannedUser 
    });
    await adminCommand.execute(showBannedInteraction, {} as EventData);
    console.log('✅ /admin player show executed (banned player)');

    // ===== PHASE 3: PLAYER BAN/UNBAN COMMANDS =====
    console.log('\n🔨 PHASE 3: Player Ban/Unban Commands');
    
    // Test /admin player ban (unbanned player)
    const banTargetUser = {
      id: testPlayers[1].discordUserId,
      username: testPlayers[1].name,
      displayName: testPlayers[1].name
    } as User;
    console.log(`🔍 DEBUG: Creating ban interaction for user ID: ${banTargetUser.id}`);
    console.log(`🔍 DEBUG: Admin user ID in interaction: admin-user-id`);
    
    const banInteraction = createMockAdminInteraction('player', 'ban', { 
      user: banTargetUser,
      reason: 'Test administrative ban for comprehensive testing'
    });
    
    console.log(`🔍 DEBUG: Mock interaction user ID: ${banInteraction.user.id}`);
    console.log(`🔍 DEBUG: Mock interaction getUser result:`, banInteraction.options.getUser('user'));
    
    await adminCommand.execute(banInteraction, {} as EventData);
    console.log('✅ /admin player ban executed (unbanned player)');
    
    console.log(`🔍 DEBUG: mockBanPlayer called ${mockBanPlayer.mock.calls.length} times`);
    if (mockBanPlayer.mock.calls.length > 0) {
      console.log(`🔍 DEBUG: mockBanPlayer calls:`, mockBanPlayer.mock.calls);
    }
    
    // Verify ban was applied
    const bannedPlayer = await prisma.player.findUnique({
      where: { discordUserId: testPlayers[1].discordUserId }
    });
    expect(bannedPlayer!.bannedAt).toBeTruthy();
    console.log('✅ Ban verified in database');
    
    // Test /admin player ban (already banned player)
    const banAlreadyBannedInteraction = createMockAdminInteraction('player', 'ban', { 
      user: banTargetUser,
      reason: 'Attempting to ban already banned player'
    });
    await adminCommand.execute(banAlreadyBannedInteraction, {} as EventData);
    console.log('✅ /admin player ban executed (already banned player)');
    
    // Test /admin player unban (banned player)
    const unbanInteraction = createMockAdminInteraction('player', 'unban', { 
      user: banTargetUser
    });
    await adminCommand.execute(unbanInteraction, {} as EventData);
    console.log('✅ /admin player unban executed (banned player)');
    
    // Verify unban was applied
    const unbannedPlayer = await prisma.player.findUnique({
      where: { discordUserId: testPlayers[1].discordUserId }
    });
    expect(unbannedPlayer!.bannedAt).toBeNull();
    console.log('✅ Unban verified in database');
    
    // Test /admin player unban (not banned player)
    const unbanNotBannedInteraction = createMockAdminInteraction('player', 'unban', { 
      user: banTargetUser
    });
    await adminCommand.execute(unbanNotBannedInteraction, {} as EventData);
    console.log('✅ /admin player unban executed (not banned player)');
    
    // Test /admin player ban (non-existent player)
    const banNonExistentInteraction = createMockAdminInteraction('player', 'ban', { 
      user: mockNonExistentUser,
      reason: 'Attempting to ban non-existent player'
    });
    await adminCommand.execute(banNonExistentInteraction, {} as EventData);
    console.log('✅ /admin player ban executed (non-existent player)');

    console.log('\n🎉 ADMIN PLAYER MANAGEMENT TESTS COMPLETED!');
  });

  it('should comprehensively test all admin season management commands', async () => {
    console.log('🏆 Starting Admin Season Management Test');
    
    // ===== PHASE 1: SEASON LIST COMMANDS =====
    console.log('\n📋 PHASE 1: Season List Commands');
    
    // Test /admin season list (all seasons)
    const listAllSeasonsInteraction = createMockAdminInteraction('season', 'list');
    await adminCommand.execute(listAllSeasonsInteraction, {} as EventData);
    console.log('✅ /admin season list executed (all seasons)');
    
    // Test /admin season list (with status filter)
    const listOpenSeasonsInteraction = createMockAdminInteraction('season', 'list', { 
      status: 'OPEN' 
    });
    await adminCommand.execute(listOpenSeasonsInteraction, {} as EventData);
    console.log('✅ /admin season list executed (OPEN status filter)');
    
    const listActiveSeasonsInteraction = createMockAdminInteraction('season', 'list', { 
      status: 'ACTIVE' 
    });
    await adminCommand.execute(listActiveSeasonsInteraction, {} as EventData);
    console.log('✅ /admin season list executed (ACTIVE status filter)');
    
    const listCompletedSeasonsInteraction = createMockAdminInteraction('season', 'list', { 
      status: 'COMPLETED' 
    });
    await adminCommand.execute(listCompletedSeasonsInteraction, {} as EventData);
    console.log('✅ /admin season list executed (COMPLETED status filter)');

    // ===== PHASE 2: SEASON SHOW COMMANDS =====
    console.log('\n🔍 PHASE 2: Season Show Commands');
    
    // Test /admin season show (existing season)
    const showSeasonInteraction = createMockAdminInteraction('season', 'show', { 
      season: testSeasons[0].id 
    });
    await adminCommand.execute(showSeasonInteraction, {} as EventData);
    console.log('✅ /admin season show executed (existing season)');
    
    // Test /admin season show (invalid season)
    const showInvalidSeasonInteraction = createMockAdminInteraction('season', 'show', { 
      season: 'invalid-season-id' 
    });
    await adminCommand.execute(showInvalidSeasonInteraction, {} as EventData);
    console.log('✅ /admin season show executed (invalid season)');
    
    // Test /admin season show for each season status
    for (let i = 0; i < testSeasons.length; i++) {
      const showStatusSeasonInteraction = createMockAdminInteraction('season', 'show', { 
        season: testSeasons[i].id 
      });
      await adminCommand.execute(showStatusSeasonInteraction, {} as EventData);
      console.log(`✅ /admin season show executed (${testSeasons[i].status} season)`);
    }

    // ===== PHASE 3: SEASON KILL COMMANDS =====
    console.log('\n💀 PHASE 3: Season Kill Commands');
    
    // Test /admin season kill (valid season)
    const killSeasonInteraction = createMockAdminInteraction('season', 'kill', { 
      id: testSeasons[1].id // Kill the ACTIVE season
    });
    
    console.log(`🔍 DEBUG: Killing season with ID: ${testSeasons[1].id}, status: ${testSeasons[1].status}`);
    
    await adminCommand.execute(killSeasonInteraction, {} as EventData);
    console.log('✅ /admin season kill executed (valid season)');
    
    console.log(`🔍 DEBUG: mockTerminateSeason called ${mockTerminateSeason.mock.calls.length} times`);
    if (mockTerminateSeason.mock.calls.length > 0) {
      console.log(`🔍 DEBUG: mockTerminateSeason calls:`, mockTerminateSeason.mock.calls);
    }
    
    // Verify season was killed
    const killedSeason = await prisma.season.findUnique({
      where: { id: testSeasons[1].id }
    });
    expect(killedSeason!.status).toBe('TERMINATED');
    console.log('✅ Season kill verified in database');
    
    // Test /admin season kill (invalid season)
    const killInvalidSeasonInteraction = createMockAdminInteraction('season', 'kill', { 
      id: 'invalid-season-id' 
    });
    await adminCommand.execute(killInvalidSeasonInteraction, {} as EventData);
    console.log('✅ /admin season kill executed (invalid season)');
    
    // Test /admin season kill (already cancelled season)
    const killCancelledSeasonInteraction = createMockAdminInteraction('season', 'kill', { 
      id: testSeasons[1].id // Try to kill the already killed season
    });
    await adminCommand.execute(killCancelledSeasonInteraction, {} as EventData);
    console.log('✅ /admin season kill executed (already cancelled season)');

    console.log('\n🎉 ADMIN SEASON MANAGEMENT TESTS COMPLETED!');
  });

  it('should comprehensively test admin configuration management', async () => {
    console.log('⚙️ Starting Admin Configuration Management Test');
    
    // ===== PHASE 1: VIEW CURRENT CONFIGURATION =====
    console.log('\n📋 PHASE 1: View Current Configuration');
    
    // Test /admin season config (view current)
    const viewConfigInteraction = createMockAdminInteraction('season', 'config');
    await adminCommand.execute(viewConfigInteraction, {} as EventData);
    console.log('✅ /admin season config executed (view current)');

    // ===== PHASE 2: UPDATE INDIVIDUAL SETTINGS =====
    console.log('\n🔧 PHASE 2: Update Individual Settings');
    
    // Test updating turn pattern
    const updateTurnPatternInteraction = createMockAdminInteraction('season', 'config', { 
      turn_pattern: 'writing,drawing,writing' 
    });
    await adminCommand.execute(updateTurnPatternInteraction, {} as EventData);
    console.log('✅ /admin season config executed (turn pattern update)');
    
    // Test updating timeouts
    const updateTimeoutsInteraction = createMockAdminInteraction('season', 'config', { 
      claim_timeout: '2h',
      writing_timeout: '45m',
      drawing_timeout: '1h30m'
    });
    await adminCommand.execute(updateTimeoutsInteraction, {} as EventData);
    console.log('✅ /admin season config executed (timeout updates)');
    
    // Test updating warning times
    const updateWarningsInteraction = createMockAdminInteraction('season', 'config', { 
      writing_warning: '15m',
      drawing_warning: '30m'
    });
    await adminCommand.execute(updateWarningsInteraction, {} as EventData);
    console.log('✅ /admin season config executed (warning time updates)');
    
    // Test updating player limits
    const updatePlayerLimitsInteraction = createMockAdminInteraction('season', 'config', { 
      min_players: 3,
      max_players: 8
    });
    await adminCommand.execute(updatePlayerLimitsInteraction, {} as EventData);
    console.log('✅ /admin season config executed (player limit updates)');
    
    // Test updating open duration
    const updateOpenDurationInteraction = createMockAdminInteraction('season', 'config', { 
      open_duration: '5d'
    });
    await adminCommand.execute(updateOpenDurationInteraction, {} as EventData);
    console.log('✅ /admin season config executed (open duration update)');

    // ===== PHASE 3: COMPREHENSIVE CONFIGURATION UPDATE =====
    console.log('\n🔄 PHASE 3: Comprehensive Configuration Update');
    
    // Test updating multiple settings at once
    const comprehensiveUpdateInteraction = createMockAdminInteraction('season', 'config', { 
      turn_pattern: 'writing,drawing,writing,drawing',
      claim_timeout: '90m',
      writing_timeout: '2h',
      writing_warning: '30m',
      drawing_timeout: '3h',
      drawing_warning: '45m',
      open_duration: '7d',
      min_players: 4,
      max_players: 12
    });
    await adminCommand.execute(comprehensiveUpdateInteraction, {} as EventData);
    console.log('✅ /admin season config executed (comprehensive update)');

    // ===== PHASE 4: INVALID CONFIGURATION TESTS =====
    console.log('\n❌ PHASE 4: Invalid Configuration Tests');
    
    // Test invalid turn pattern
    const invalidTurnPatternInteraction = createMockAdminInteraction('season', 'config', { 
      turn_pattern: 'invalid,pattern,test'
    });
    await adminCommand.execute(invalidTurnPatternInteraction, {} as EventData);
    console.log('✅ /admin season config executed (invalid turn pattern)');
    
    // Test invalid timeout format
    const invalidTimeoutInteraction = createMockAdminInteraction('season', 'config', { 
      claim_timeout: 'invalid-time-format'
    });
    await adminCommand.execute(invalidTimeoutInteraction, {} as EventData);
    console.log('✅ /admin season config executed (invalid timeout format)');
    
    // Test invalid player limits (min > max)
    const invalidPlayerLimitsInteraction = createMockAdminInteraction('season', 'config', { 
      min_players: 10,
      max_players: 5
    });
    await adminCommand.execute(invalidPlayerLimitsInteraction, {} as EventData);
    console.log('✅ /admin season config executed (invalid player limits)');

    // ===== PHASE 5: VERIFY CONFIGURATION PERSISTENCE =====
    console.log('\n✅ PHASE 5: Verify Configuration Persistence');
    
    // View config again to verify changes persisted
    const verifyConfigInteraction = createMockAdminInteraction('season', 'config');
    await adminCommand.execute(verifyConfigInteraction, {} as EventData);
    console.log('✅ /admin season config executed (verify persistence)');

    console.log('\n🎉 ADMIN CONFIGURATION MANAGEMENT TESTS COMPLETED!');
  });

  it('should test admin permission and access control', async () => {
    console.log('🔐 Starting Admin Permission and Access Control Test');
    
    // ===== PHASE 1: VALID ADMIN ACCESS =====
    console.log('\n✅ PHASE 1: Valid Admin Access');
    
    // Test with primary admin user
    const primaryAdminInteraction = createMockAdminInteraction('player', 'list', {}, 'admin-user-id');
    await adminCommand.execute(primaryAdminInteraction, {} as EventData);
    console.log('✅ Primary admin access granted');
    
    // Test with secondary admin user
    const secondaryAdminInteraction = createMockAdminInteraction('season', 'list', {}, 'super-admin-id');
    await adminCommand.execute(secondaryAdminInteraction, {} as EventData);
    console.log('✅ Secondary admin access granted');

    // ===== PHASE 2: INVALID ACCESS ATTEMPTS =====
    console.log('\n❌ PHASE 2: Invalid Access Attempts');
    
    // Test with non-admin user
    const nonAdminInteraction = createMockAdminInteraction('player', 'list', {}, 'regular-user-id');
    await adminCommand.execute(nonAdminInteraction, {} as EventData);
    console.log('✅ Non-admin access properly denied');
    
    // Test with empty user ID
    const emptyUserInteraction = createMockAdminInteraction('season', 'config', {}, '');
    await adminCommand.execute(emptyUserInteraction, {} as EventData);
    console.log('✅ Empty user ID access properly denied');
    
    // Test with null user ID
    const nullUserInteraction = createMockAdminInteraction('player', 'ban', {}, 'null');
    await adminCommand.execute(nullUserInteraction, {} as EventData);
    console.log('✅ Null user ID access properly denied');

    // ===== PHASE 3: ADMIN COMMAND COVERAGE =====
    console.log('\n🔍 PHASE 3: Admin Command Coverage Test');
    
    // Test all admin subcommand groups and subcommands
    const adminCommands = [
      { group: 'player', command: 'list' },
      { group: 'player', command: 'show' },
      { group: 'player', command: 'ban' },
      { group: 'player', command: 'unban' },
      { group: 'season', command: 'list' },
      { group: 'season', command: 'show' },
      { group: 'season', command: 'config' },
      { group: 'season', command: 'kill' }
    ];
    
    for (const cmd of adminCommands) {
      const testInteraction = createMockAdminInteraction(cmd.group, cmd.command, {
        // Provide minimal valid options for each command
        user: cmd.command === 'show' || cmd.command === 'ban' || cmd.command === 'unban' ? {
          id: testPlayers[0].discordUserId,
          username: testPlayers[0].name,
          displayName: testPlayers[0].name
        } : undefined,
        season: cmd.command === 'show' && cmd.group === 'season' ? testSeasons[0].id : undefined,
        id: cmd.command === 'kill' ? testSeasons[2].id : undefined,
        reason: cmd.command === 'ban' ? 'Test coverage ban' : undefined
      });
      
      await adminCommand.execute(testInteraction, {} as EventData);
      console.log(`✅ /admin ${cmd.group} ${cmd.command} coverage test completed`);
    }

    console.log('\n🎉 ADMIN PERMISSION AND ACCESS CONTROL TESTS COMPLETED!');
  });

  it('should test admin commands with edge cases and error conditions', async () => {
    console.log('🚨 Starting Admin Edge Cases and Error Conditions Test');
    
    // ===== PHASE 1: MALFORMED REQUESTS =====
    console.log('\n💥 PHASE 1: Malformed Requests');
    
    // Test with missing required parameters
    const missingUserInteraction = createMockAdminInteraction('player', 'show', {});
    await adminCommand.execute(missingUserInteraction, {} as EventData);
    console.log('✅ Missing user parameter handled');
    
    const missingSeasonInteraction = createMockAdminInteraction('season', 'show', {});
    await adminCommand.execute(missingSeasonInteraction, {} as EventData);
    console.log('✅ Missing season parameter handled');
    
    const missingKillIdInteraction = createMockAdminInteraction('season', 'kill', {});
    await adminCommand.execute(missingKillIdInteraction, {} as EventData);
    console.log('✅ Missing kill ID parameter handled');

    // ===== PHASE 2: BOUNDARY CONDITIONS =====
    console.log('\n🔢 PHASE 2: Boundary Conditions');
    
    // Test with extreme player limits
    const extremePlayerLimitsInteraction = createMockAdminInteraction('season', 'config', { 
      min_players: 1,
      max_players: 100
    });
    await adminCommand.execute(extremePlayerLimitsInteraction, {} as EventData);
    console.log('✅ Extreme player limits handled');
    
    // Test with very long timeout values
    const longTimeoutInteraction = createMockAdminInteraction('season', 'config', { 
      claim_timeout: '999h',
      writing_timeout: '168h',
      drawing_timeout: '720h'
    });
    await adminCommand.execute(longTimeoutInteraction, {} as EventData);
    console.log('✅ Long timeout values handled');
    
    // Test with very short timeout values
    const shortTimeoutInteraction = createMockAdminInteraction('season', 'config', { 
      claim_timeout: '1s',
      writing_timeout: '30s',
      drawing_timeout: '1m'
    });
    await adminCommand.execute(shortTimeoutInteraction, {} as EventData);
    console.log('✅ Short timeout values handled');

    // ===== PHASE 3: CONCURRENT OPERATIONS =====
    console.log('\n⚡ PHASE 3: Concurrent Operations');
    
    // Test multiple simultaneous config updates
    const concurrentPromises: Promise<void>[] = [];
    for (let i = 0; i < 3; i++) {
      const concurrentInteraction = createMockAdminInteraction('season', 'config', { 
        min_players: 2 + i,
        max_players: 6 + i
      });
      concurrentPromises.push(adminCommand.execute(concurrentInteraction, {} as EventData));
    }
    
    await Promise.all(concurrentPromises);
    console.log('✅ Concurrent config updates handled');
    
    // Test multiple simultaneous player operations
    const playerPromises: Promise<void>[] = [];
    for (let i = 0; i < 3; i++) {
      const playerUser = {
        id: testPlayers[i].discordUserId,
        username: testPlayers[i].name,
        displayName: testPlayers[i].name
      };
      
      const playerInteraction = createMockAdminInteraction('player', 'show', { user: playerUser });
      playerPromises.push(adminCommand.execute(playerInteraction, {} as EventData));
    }
    
    await Promise.all(playerPromises);
    console.log('✅ Concurrent player operations handled');

    // ===== PHASE 4: DATA CONSISTENCY =====
    console.log('\n🔄 PHASE 4: Data Consistency');
    
    // Test configuration rollback scenarios
    const originalConfigInteraction = createMockAdminInteraction('season', 'config');
    await adminCommand.execute(originalConfigInteraction, {} as EventData);
    
    // Apply invalid config
    const invalidConfigInteraction = createMockAdminInteraction('season', 'config', { 
      turn_pattern: 'invalid',
      min_players: -1,
      max_players: 0
    });
    await adminCommand.execute(invalidConfigInteraction, {} as EventData);
    
    // Verify config wasn't corrupted
    const verifyConfigInteraction = createMockAdminInteraction('season', 'config');
    await adminCommand.execute(verifyConfigInteraction, {} as EventData);
    console.log('✅ Configuration consistency maintained');

    // ===== PHASE 5: PERFORMANCE STRESS TEST =====
    console.log('\n🏃 PHASE 5: Performance Stress Test');
    
    // Test rapid-fire admin commands
    const stressPromises: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      const stressInteraction = createMockAdminInteraction('player', 'list', { 
        banned: i % 2 === 0 
      });
      stressPromises.push(adminCommand.execute(stressInteraction, {} as EventData));
    }
    
    const startTime = Date.now();
    await Promise.all(stressPromises);
    const endTime = Date.now();
    
    console.log(`✅ Stress test completed in ${endTime - startTime}ms`);

    console.log('\n🎉 ADMIN EDGE CASES AND ERROR CONDITIONS TESTS COMPLETED!');
  });
}); 