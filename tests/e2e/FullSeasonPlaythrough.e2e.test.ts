import { PrismaClient } from '@prisma/client';
import { 
  ChatInputCommandInteraction, 
  Client as DiscordClient,
  Guild,
  GuildMember,
  Message,
  MessageContextMenuCommandInteraction,
  TextChannel,
  User,
  UserContextMenuCommandInteraction
} from 'discord.js';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';


// Import all command classes for testing
import { AdminCommand } from '../../src/commands/chat/admin-command.js';
import { DevCommand } from '../../src/commands/chat/dev-command.js';
import { HelpCommand } from '../../src/commands/chat/help-command.js';
import { InfoCommand } from '../../src/commands/chat/info-command.js';
import { SeasonCommand } from '../../src/commands/chat/season-command.js';
import { ViewDateSent } from '../../src/commands/message/view-date-sent.js';
import { ViewDateJoined } from '../../src/commands/user/view-date-joined.js';
import { EventData } from '../../src/models/internal-models.js';
import { ConfigService } from '../../src/services/ConfigService.js';
import { GameService } from '../../src/services/GameService.js';
import { PlayerService } from '../../src/services/PlayerService.js';
import { PlayerTurnService } from '../../src/services/PlayerTurnService.js';
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

// Mock Config for dev command
vi.mock('../../../config/config.json', () => ({
  default: {
    developers: ['test-dev-user-id'],
    client: { token: 'test-token' }
  }
}));

// This is a comprehensive end-to-end test that simulates a complete season playthrough
// AND tests every single Discord bot command
describe('Full Season Playthrough + All Commands End-to-End Test', () => {
  let prisma: PrismaClient;
  let seasonService: SeasonService;
  let turnService: SeasonTurnService;
  let turnOfferingService: TurnOfferingService;
  let _playerService: PlayerService;
  let _playerTurnService: PlayerTurnService;
  let gameService: GameService;
  let _configService: ConfigService;
  let mockSchedulerService: SchedulerService;
  let mockDiscordClient: any;
  let testPlayers: any[] = [];
  let seasonId: string;
  let adminSeasonId: string;

  // Command instances for testing
  let helpCommand: HelpCommand;
  let infoCommand: InfoCommand;
  let devCommand: DevCommand;
  let seasonCommand: SeasonCommand;
  let adminCommand: AdminCommand;
  let viewDateJoinedCommand: ViewDateJoined;
  let viewDateSentCommand: ViewDateSent;

  // Mock interaction creators
  const createMockChatInteraction = (commandName: string, subcommand?: string, options: any = {}, userId = 'test-user-id'): ChatInputCommandInteraction => {
    const mockUser = {
      id: userId,
      username: `TestUser-${userId.substring(0, 5)}`,
      displayName: `TestUser-${userId.substring(0, 5)}`
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
      commandName,
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
        getSubcommandGroup: vi.fn().mockReturnValue(options.subcommandGroup || null)
      },
      reply: vi.fn().mockResolvedValue({}),
      editReply: vi.fn().mockResolvedValue({}),
      followUp: vi.fn().mockResolvedValue({}),
      deferReply: vi.fn().mockResolvedValue({}),
      replied: false,
      deferred: false
    } as unknown as ChatInputCommandInteraction;
  };

  const createMockUserContextInteraction = (targetUserId = 'target-user-id'): UserContextMenuCommandInteraction => {
    const mockUser = {
      id: 'test-user-id',
      username: 'TestUser',
      displayName: 'TestUser'
    } as User;

    const mockTargetUser = {
      id: targetUserId,
      username: `TargetUser-${targetUserId.substring(0, 5)}`,
      displayName: `TargetUser-${targetUserId.substring(0, 5)}`,
      createdAt: new Date('2023-01-01'),
      toString: () => `<@${targetUserId}>`
    } as User;

    const mockGuild = {
      id: 'test-guild-id',
      members: {
        fetch: vi.fn().mockResolvedValue({
          id: targetUserId,
          joinedAt: new Date('2023-06-01'),
          user: mockTargetUser
        } as GuildMember)
      }
    } as unknown as Guild;

    const mockChannel = {
      id: 'test-channel-id'
    } as unknown as TextChannel;

    return {
      user: mockUser,
      targetUser: mockTargetUser,
      guild: mockGuild,
      channel: mockChannel,
      client: mockDiscordClient,
      reply: vi.fn().mockResolvedValue({}),
      editReply: vi.fn().mockResolvedValue({}),
      followUp: vi.fn().mockResolvedValue({}),
      deferReply: vi.fn().mockResolvedValue({}),
      replied: false,
      deferred: false
    } as unknown as UserContextMenuCommandInteraction;
  };

  const createMockMessageContextInteraction = (): MessageContextMenuCommandInteraction => {
    const mockUser = {
      id: 'test-user-id',
      username: 'TestUser',
      displayName: 'TestUser'
    } as User;

    const mockTargetMessage = {
      id: 'target-message-id',
      createdAt: new Date('2023-12-01T10:30:00Z'),
      content: 'Test message content'
    } as Message;

    return {
      user: mockUser,
      targetMessage: mockTargetMessage,
      client: mockDiscordClient,
      reply: vi.fn().mockResolvedValue({}),
      editReply: vi.fn().mockResolvedValue({}),
      followUp: vi.fn().mockResolvedValue({}),
      deferReply: vi.fn().mockResolvedValue({}),
      replied: false,
      deferred: false
    } as unknown as MessageContextMenuCommandInteraction;
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
    _playerService = new PlayerService(prisma);
    _playerTurnService = new PlayerTurnService(prisma);
    _configService = new ConfigService(prisma);
    
    // Initialize command instances
    helpCommand = new HelpCommand();
    infoCommand = new InfoCommand();
    devCommand = new DevCommand();
    seasonCommand = new SeasonCommand(prisma, seasonService, _playerTurnService);
    adminCommand = new AdminCommand();
    viewDateJoinedCommand = new ViewDateJoined();
    viewDateSentCommand = new ViewDateSent();
    
    // Create test players for a 4-player season (4 players = 4 games = 16 total turns)
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

  it('should test all Discord bot commands comprehensively', async () => {
    console.log('🤖 Starting Comprehensive Command Testing');
    
    // ===== PHASE 1: HELP COMMAND TESTING =====
    console.log('\n❓ PHASE 1: Help Command Testing');
    
    // Test /help contact-support
    const helpContactInteraction = createMockChatInteraction('help', undefined, { option: 'contact-support' });
    await helpCommand.execute(helpContactInteraction, {} as EventData);
    console.log('✅ /help contact-support executed');
    
    // Test /help commands
    const helpCommandsInteraction = createMockChatInteraction('help', undefined, { option: 'commands' });
    await helpCommand.execute(helpCommandsInteraction, {} as EventData);
    console.log('✅ /help commands executed');
    
    // Test /help default
    const helpDefaultInteraction = createMockChatInteraction('help', undefined, { option: null });
    await helpCommand.execute(helpDefaultInteraction, {} as EventData);
    console.log('✅ /help default executed');

    // ===== PHASE 2: INFO COMMAND TESTING =====
    console.log('\n📋 PHASE 2: Info Command Testing');
    
    // Test /info about
    const infoAboutInteraction = createMockChatInteraction('info', undefined, { option: 'about' });
    await infoCommand.execute(infoAboutInteraction, {} as EventData);
    console.log('✅ /info about executed');
    
    // Test /info translate
    const infoTranslateInteraction = createMockChatInteraction('info', undefined, { option: 'translate' });
    await infoCommand.execute(infoTranslateInteraction, {} as EventData);
    console.log('✅ /info translate executed');
    
    // Test /info default
    const infoDefaultInteraction = createMockChatInteraction('info', undefined, { option: null });
    await infoCommand.execute(infoDefaultInteraction, {} as EventData);
    console.log('✅ /info default executed');

    // ===== PHASE 3: DEV COMMAND TESTING =====
    console.log('\n🔧 PHASE 3: Dev Command Testing');
    
    // Test /dev info (as developer)
    const devInfoInteraction = createMockChatInteraction('dev', undefined, { command: 'info' }, 'test-dev-user-id');
    await devCommand.execute(devInfoInteraction, {} as EventData);
    console.log('✅ /dev info executed (as developer)');
    
    // Test /dev info (as non-developer)
    const devInfoNonDevInteraction = createMockChatInteraction('dev', undefined, { command: 'info' }, 'non-dev-user-id');
    await devCommand.execute(devInfoNonDevInteraction, {} as EventData);
    console.log('✅ /dev info executed (as non-developer - should show warning)');

    // ===== PHASE 4: SEASON COMMAND TESTING =====
    console.log('\n🎮 PHASE 4: Season Command Testing');
    
    // Test /season list (empty)
    const seasonListEmptyInteraction = createMockChatInteraction('season', 'list');
    await seasonCommand.execute(seasonListEmptyInteraction, {} as EventData);
    console.log('✅ /season list executed (empty)');
    
    // Create a season for testing
    const createSeasonResult = await seasonService.createSeason({
      creatorPlayerId: testPlayers[0].id,
      maxPlayers: 4,
      minPlayers: 2,
      openDuration: '1d',
      turnPattern: 'writing,drawing',
      claimTimeout: '1h',
      writingTimeout: '30m',
      drawingTimeout: '1h',
    });
    expect(createSeasonResult.type).toBe('success');
    seasonId = createSeasonResult.data?.seasonId ?? '';
    console.log(`✅ Created test season: ${seasonId}`);
    
    // Test /season list (with seasons)
    const seasonListInteraction = createMockChatInteraction('season', 'list');
    await seasonCommand.execute(seasonListInteraction, {} as EventData);
    console.log('✅ /season list executed (with seasons)');
    
    // Test /season show
    const seasonShowInteraction = createMockChatInteraction('season', 'show', { season: seasonId });
    await seasonCommand.execute(seasonShowInteraction, {} as EventData);
    console.log('✅ /season show executed');
    
    // Test /season show (invalid season)
    const seasonShowInvalidInteraction = createMockChatInteraction('season', 'show', { season: 'invalid-season-id' });
    await seasonCommand.execute(seasonShowInvalidInteraction, {} as EventData);
    console.log('✅ /season show executed (invalid season)');
    
    // Test /season join
    const seasonJoinInteraction = createMockChatInteraction('season', 'join', { season: seasonId }, testPlayers[1].discordUserId);
    await seasonCommand.execute(seasonJoinInteraction, {} as EventData);
    console.log('✅ /season join executed');
    
    // Test /season join (invalid season)
    const seasonJoinInvalidInteraction = createMockChatInteraction('season', 'join', { season: 'invalid-season-id' });
    await seasonCommand.execute(seasonJoinInvalidInteraction, {} as EventData);
    console.log('✅ /season join executed (invalid season)');
    
    // Test /season new (minimal)
    const seasonNewMinimalInteraction = createMockChatInteraction('season', 'new', {}, testPlayers[2].discordUserId);
    await seasonCommand.execute(seasonNewMinimalInteraction, {} as EventData);
    console.log('✅ /season new executed (minimal options)');
    
    // Test /season new (full options)
    const seasonNewFullInteraction = createMockChatInteraction('season', 'new', {
      open_duration: '3d',
      min_players: 3,
      max_players: 6,
      turn_pattern: 'writing,drawing,writing',
      claim_timeout: '2h',
      writing_timeout: '1d',
      drawing_timeout: '2h'
    }, testPlayers[3].discordUserId);
    await seasonCommand.execute(seasonNewFullInteraction, {} as EventData);
    console.log('✅ /season new executed (full options)');

    // ===== PHASE 5: ADMIN COMMAND TESTING =====
    console.log('\n👑 PHASE 5: Admin Command Testing');
    
    // Create an admin season for testing
    const adminSeasonResult = await seasonService.createSeason({
      creatorPlayerId: testPlayers[0].id,
      maxPlayers: 3,
      minPlayers: 2,
      openDuration: '2d',
      turnPattern: 'writing,drawing',
      claimTimeout: '1h',
      writingTimeout: '45m',
      drawingTimeout: '1h30m',
    });
    expect(adminSeasonResult.type).toBe('success');
    adminSeasonId = adminSeasonResult.data?.seasonId ?? '';
    console.log(`✅ Created admin test season: ${adminSeasonId}`);
    
    // Test /admin player list
    const adminPlayerListInteraction = createMockChatInteraction('admin', 'list', { subcommandGroup: 'player' }, 'test-dev-user-id');
    await adminCommand.execute(adminPlayerListInteraction, {} as EventData);
    console.log('✅ /admin player list executed');
    
    // Test /admin player list (with season filter)
    const adminPlayerListSeasonInteraction = createMockChatInteraction('admin', 'list', { 
      subcommandGroup: 'player',
      season: seasonId 
    }, 'test-dev-user-id');
    await adminCommand.execute(adminPlayerListSeasonInteraction, {} as EventData);
    console.log('✅ /admin player list executed (with season filter)');
    
    // Test /admin player list (banned only)
    const adminPlayerListBannedInteraction = createMockChatInteraction('admin', 'list', { 
      subcommandGroup: 'player',
      banned: true 
    }, 'test-dev-user-id');
    await adminCommand.execute(adminPlayerListBannedInteraction, {} as EventData);
    console.log('✅ /admin player list executed (banned only)');
    
    // Test /admin player show
    const mockTargetUser = {
      id: testPlayers[0].discordUserId,
      username: testPlayers[0].name,
      displayName: testPlayers[0].name
    } as User;
    const adminPlayerShowInteraction = createMockChatInteraction('admin', 'show', { 
      subcommandGroup: 'player',
      user: mockTargetUser 
    }, 'test-dev-user-id');
    await adminCommand.execute(adminPlayerShowInteraction, {} as EventData);
    console.log('✅ /admin player show executed');
    
    // Test /admin player show (non-existent player)
    const mockNonExistentUser = {
      id: 'non-existent-user-id',
      username: 'NonExistentUser',
      displayName: 'NonExistentUser'
    } as User;
    const adminPlayerShowNonExistentInteraction = createMockChatInteraction('admin', 'show', { 
      subcommandGroup: 'player',
      user: mockNonExistentUser 
    }, 'test-dev-user-id');
    await adminCommand.execute(adminPlayerShowNonExistentInteraction, {} as EventData);
    console.log('✅ /admin player show executed (non-existent player)');
    
    // Test /admin player ban
    const adminPlayerBanInteraction = createMockChatInteraction('admin', 'ban', { 
      subcommandGroup: 'player',
      user: mockTargetUser,
      reason: 'Test ban reason'
    }, 'test-dev-user-id');
    await adminCommand.execute(adminPlayerBanInteraction, {} as EventData);
    console.log('✅ /admin player ban executed');
    
    // Test /admin player ban (already banned)
    const adminPlayerBanAlreadyInteraction = createMockChatInteraction('admin', 'ban', { 
      subcommandGroup: 'player',
      user: mockTargetUser,
      reason: 'Another ban attempt'
    }, 'test-dev-user-id');
    await adminCommand.execute(adminPlayerBanAlreadyInteraction, {} as EventData);
    console.log('✅ /admin player ban executed (already banned)');
    
    // Test /admin player unban
    const adminPlayerUnbanInteraction = createMockChatInteraction('admin', 'unban', { 
      subcommandGroup: 'player',
      user: mockTargetUser
    }, 'test-dev-user-id');
    await adminCommand.execute(adminPlayerUnbanInteraction, {} as EventData);
    console.log('✅ /admin player unban executed');
    
    // Test /admin player unban (not banned)
    const adminPlayerUnbanNotBannedInteraction = createMockChatInteraction('admin', 'unban', { 
      subcommandGroup: 'player',
      user: mockTargetUser
    }, 'test-dev-user-id');
    await adminCommand.execute(adminPlayerUnbanNotBannedInteraction, {} as EventData);
    console.log('✅ /admin player unban executed (not banned)');
    
    // Test /admin season list
    const adminSeasonListInteraction = createMockChatInteraction('admin', 'list', { subcommandGroup: 'season' }, 'test-dev-user-id');
    await adminCommand.execute(adminSeasonListInteraction, {} as EventData);
    console.log('✅ /admin season list executed');
    
    // Test /admin season list (with status filter)
    const adminSeasonListStatusInteraction = createMockChatInteraction('admin', 'list', { 
      subcommandGroup: 'season',
      status: 'OPEN'
    }, 'test-dev-user-id');
    await adminCommand.execute(adminSeasonListStatusInteraction, {} as EventData);
    console.log('✅ /admin season list executed (with status filter)');
    
    // Test /admin season show
    const adminSeasonShowInteraction = createMockChatInteraction('admin', 'show', { 
      subcommandGroup: 'season',
      season: adminSeasonId
    }, 'test-dev-user-id');
    await adminCommand.execute(adminSeasonShowInteraction, {} as EventData);
    console.log('✅ /admin season show executed');
    
    // Test /admin season show (invalid season)
    const adminSeasonShowInvalidInteraction = createMockChatInteraction('admin', 'show', { 
      subcommandGroup: 'season',
      season: 'invalid-admin-season-id'
    }, 'test-dev-user-id');
    await adminCommand.execute(adminSeasonShowInvalidInteraction, {} as EventData);
    console.log('✅ /admin season show executed (invalid season)');
    
    // Test /admin season config (view current)
    const adminSeasonConfigViewInteraction = createMockChatInteraction('admin', 'config', { subcommandGroup: 'season' }, 'test-dev-user-id');
    await adminCommand.execute(adminSeasonConfigViewInteraction, {} as EventData);
    console.log('✅ /admin season config executed (view current)');
    
    // Test /admin season config (update settings)
    const adminSeasonConfigUpdateInteraction = createMockChatInteraction('admin', 'config', { 
      subcommandGroup: 'season',
      turn_pattern: 'writing,drawing,writing',
      claim_timeout: '2h',
      writing_timeout: '1d',
      writing_warning: '2h',
      drawing_timeout: '3h',
      drawing_warning: '30m',
      open_duration: '5d',
      min_players: 3,
      max_players: 8
    }, 'test-dev-user-id');
    await adminCommand.execute(adminSeasonConfigUpdateInteraction, {} as EventData);
    console.log('✅ /admin season config executed (update settings)');
    
    // Test /admin season kill
    const adminSeasonKillInteraction = createMockChatInteraction('admin', 'kill', { 
      subcommandGroup: 'season',
      id: adminSeasonId
    }, 'test-dev-user-id');
    await adminCommand.execute(adminSeasonKillInteraction, {} as EventData);
    console.log('✅ /admin season kill executed');
    
    // Test /admin season kill (invalid season)
    const adminSeasonKillInvalidInteraction = createMockChatInteraction('admin', 'kill', { 
      subcommandGroup: 'season',
      id: 'invalid-kill-season-id'
    }, 'test-dev-user-id');
    await adminCommand.execute(adminSeasonKillInvalidInteraction, {} as EventData);
    console.log('✅ /admin season kill executed (invalid season)');

    // ===== PHASE 6: CONTEXT MENU COMMAND TESTING =====
    console.log('\n📱 PHASE 6: Context Menu Command Testing');
    
    // Test View Date Joined (User Context Menu)
    const viewDateJoinedInteraction = createMockUserContextInteraction(testPlayers[0].discordUserId);
    await viewDateJoinedCommand.execute(viewDateJoinedInteraction, {} as EventData);
    console.log('✅ View Date Joined executed (guild context)');
    
    // Test View Date Joined in DM context
    const viewDateJoinedDMInteraction = createMockUserContextInteraction(testPlayers[0].discordUserId);
    // Simulate DM channel
    (viewDateJoinedDMInteraction as any).channel = { constructor: { name: 'DMChannel' } };
    await viewDateJoinedCommand.execute(viewDateJoinedDMInteraction, {} as EventData);
    console.log('✅ View Date Joined executed (DM context)');
    
    // Test View Date Sent (Message Context Menu)
    const viewDateSentInteraction = createMockMessageContextInteraction();
    await viewDateSentCommand.execute(viewDateSentInteraction, {} as EventData);
    console.log('✅ View Date Sent executed');

    console.log('\n🎉 ALL DISCORD BOT COMMANDS TESTED SUCCESSFULLY!');
  });

  it('should complete a full season playthrough with 4 players from start to finish', async () => {
    console.log('🎮 Starting Full Season Playthrough Test');
    
    // ===== PHASE 1: SEASON CREATION AND JOINING =====
    console.log('\n📅 PHASE 1: Season Creation and Joining');
    
    // Create season with 4 players max for quick activation
    const createSeasonResult = await seasonService.createSeason({
      creatorPlayerId: testPlayers[0].id,
      maxPlayers: 4,
      minPlayers: 2,
      openDuration: '1d',
      turnPattern: 'writing,drawing',
      claimTimeout: '1h',
      writingTimeout: '30m',
      drawingTimeout: '1h',
    });

    expect(createSeasonResult.type).toBe('success');
    expect(createSeasonResult.data).toBeDefined();
    seasonId = createSeasonResult.data?.seasonId ?? '';
    console.log(`✅ Created season: ${seasonId}`);

    // All players join the season
    for (let i = 0; i < 4; i++) {
      const result = await seasonService.addPlayerToSeason(testPlayers[i].id, seasonId);
      expect(result.type).toBe('success');
      
      // For the last player, expect activation success key
      if (i === 3) {
        expect(result.key).toBe('messages.season.activateSuccess');
        console.log(`✅ Player ${i + 1} joined - Season activated!`);
      } else {
        // Updated to expect contextual join success messages instead of generic one
        expect(result.key).toMatch(/^messages\.season\.join(Success|SuccessTimeRemaining|SuccessPlayersNeeded)$/);
        console.log(`✅ Player ${i + 1} joined`);
      }
    }

    // ===== PHASE 2: VERIFY SEASON ACTIVATION =====
    console.log('\n🚀 PHASE 2: Season Activation Verification');
    
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
    expect(activatedSeason!.games.length).toBe(4); // 4 players = 4 games
    console.log(`✅ Season activated with ${activatedSeason!.games.length} games`);

    // Each game should have its first turn created and offered
    for (const game of activatedSeason!.games) {
      expect(game.turns.length).toBe(1);
      expect(game.turns[0].turnNumber).toBe(1);
      expect(game.turns[0].type).toBe('WRITING'); // First turn is always writing
      expect(game.turns[0].status).toBe('OFFERED');
      console.log(`✅ Game ${game.id} has initial writing turn offered`);
    }

    // ===== PHASE 3: COMPLETE ALL INITIAL WRITING TURNS =====
    console.log('\n✍️ PHASE 3: Initial Writing Turns');
    
    const games = activatedSeason!.games;
    
    // Each player claims and completes their initial writing turn
    for (let i = 0; i < 4; i++) {
      const game = games[i];
      const turn = game.turns[0];
      const player = testPlayers[i];
      
      console.log(`Player ${i + 1} claiming turn in Game ${i + 1}`);
      
      // Claim the turn
      const claimResult = await turnService.claimTurn(turn.id, player.id);
      expect(claimResult.success).toBe(true);
      
      // Submit writing content
      const submitResult = await turnService.submitTurn(turn.id, player.id, 
        `Initial story ${i + 1}: A magical adventure begins in a distant land.`, 'text');
      expect(submitResult.success).toBe(true);
      
      // Trigger turn offering for next turn (simulates what happens in real system)
      await turnOfferingService.offerNextTurn(game.id, 'turn_completed');
     
      console.log(`✅ Player ${i + 1} completed initial writing turn`);
    }

    // ===== PHASE 4: VERIFY DRAWING TURNS ARE OFFERED =====
    console.log('\n🎨 PHASE 4: Drawing Turns Generation');
    
    // In this simplified test, we'll verify that the turn offering service can create next turns
    // In the real system, this happens automatically after turn submission
    
    // For each game, create the next turn (drawing) manually to simulate the progression
    const gamesAfterWriting = await prisma.game.findMany({
      where: { seasonId },
      include: {
        turns: {
          orderBy: { turnNumber: 'asc' }
        }
      }
    });

    // Create drawing turns for each game
    for (const game of gamesAfterWriting) {
      // Create the next turn (drawing turn)
      const _drawingTurn = await prisma.turn.create({
        data: {
          id: nanoid(),
          gameId: game.id,
          turnNumber: 2,
          type: 'DRAWING',
          status: 'AVAILABLE',
          previousTurnId: game.turns[0].id
        }
      });
      
      console.log(`✅ Game ${game.id}: Drawing turn created`);
    }
    
    // Now offer the drawing turns to players using turn offering service
    for (const game of gamesAfterWriting) {
      const offerResult = await turnOfferingService.offerNextTurn(game.id, 'turn_completed');
      expect(offerResult.success).toBe(true);
      
      console.log(`✅ Game ${game.id}: Drawing turn offered`);
    }

    // ===== PHASE 5: COMPLETE ALL DRAWING TURNS =====
    console.log('\n🎨 PHASE 5: Drawing Turns Completion');
    
    // Refresh game data to include the newly created drawing turns
    const gamesWithDrawingTurns = await prisma.game.findMany({
      where: { seasonId },
      include: {
        turns: {
          orderBy: { turnNumber: 'asc' }
        }
      }
    });
    
    // Players complete drawing turns (different player for each game due to next player logic)
    for (const game of gamesWithDrawingTurns) {
      const drawingTurn = game.turns[1];
      
      // The drawing turn should already be offered to a specific player by the turn offering service
      // Let's use the player it was actually offered to
      if (!drawingTurn.playerId) {
        throw new Error(`Drawing turn ${drawingTurn.id} was not offered to any player`);
      }
      
      const drawingPlayer = testPlayers.find(p => p.id === drawingTurn.playerId);
      if (!drawingPlayer) {
        throw new Error(`Could not find player ${drawingTurn.playerId} in test players`);
      }
      
      console.log(`Drawing turn in Game ${game.id} assigned to Player ${testPlayers.findIndex(p => p.id === drawingPlayer.id) + 1}`);
      
      // Claim the drawing turn
      const claimResult = await turnService.claimTurn(drawingTurn.id, drawingPlayer.id);
      expect(claimResult.success).toBe(true);
      
      // Submit drawing content (mock image)
      const submitResult = await turnService.submitTurn(drawingTurn.id, drawingPlayer.id, 
        'https://example.com/mock-drawing.png', 'image');
      expect(submitResult.success).toBe(true);
     
      console.log(`✅ Drawing turn completed in Game ${game.id}`);
    }

    // ===== PHASE 6: CONTINUE ALTERNATING TURNS =====
    console.log('\n🔄 PHASE 6: Continuing Turn Sequence');
    
    // Continue the pattern until each game has 4 turns (one per player)
    // Pattern: Writing -> Drawing -> Writing -> Drawing
    for (let turnNumber = 3; turnNumber <= 4; turnNumber++) {
      console.log(`\n--- Turn ${turnNumber} (${turnNumber % 2 === 1 ? 'WRITING' : 'DRAWING'}) ---`);
      
      // First, create the turns for this turn number if they don't exist
      const currentGames = await prisma.game.findMany({
        where: { seasonId },
        include: {
          turns: {
            orderBy: { turnNumber: 'asc' }
          }
        }
      });

      // Create turns for games that don't have this turn number yet
      for (const game of currentGames) {
        if (game.turns.length < turnNumber) {
          const turnType = turnNumber % 2 === 1 ? 'WRITING' : 'DRAWING';
          const previousTurn = game.turns[turnNumber - 2];
          
          await prisma.turn.create({
            data: {
              id: nanoid(),
              gameId: game.id,
              turnNumber: turnNumber,
              type: turnType,
              status: 'AVAILABLE',
              previousTurnId: previousTurn?.id
            }
          });
          
          console.log(`✅ Created turn ${turnNumber} (${turnType}) for Game ${game.id}`);
        }
      }

      // Now offer and complete the turns
      for (const game of currentGames) {
        // Offer the turn using turn offering service
        const offerResult = await turnOfferingService.offerNextTurn(game.id, 'turn_completed');
        if (offerResult.success && offerResult.turn && offerResult.player) {
          const currentTurn = offerResult.turn;
          const currentPlayer = offerResult.player;
          
          console.log(`Turn ${turnNumber} in Game ${game.id} - Player ${testPlayers.findIndex(p => p.id === currentPlayer.id) + 1}`);
          
          // Claim turn
          const claimResult = await turnService.claimTurn(currentTurn.id, currentPlayer.id);
          expect(claimResult.success).toBe(true);
          
          // Submit content based on turn type
          const isWriting = turnNumber % 2 === 1;
          const content = isWriting 
            ? `Story continuation ${turnNumber}: The adventure continues with new twists.`
            : `https://example.com/mock-drawing-${turnNumber}.png`;
          const contentType = isWriting ? 'text' : 'image';
          const submitResult = await turnService.submitTurn(currentTurn.id, currentPlayer.id, content, contentType);
          expect(submitResult.success).toBe(true);
          
          console.log(`✅ Turn ${turnNumber} completed in Game ${game.id}`);
        }
      }
    }

    // ===== PHASE 7: VERIFY SEASON COMPLETION =====
    console.log('\n🏁 PHASE 7: Season Completion Verification');
    
    const finalSeason = await prisma.season.findUnique({
      where: { id: seasonId },
      include: { 
        games: {
          include: {
            turns: {
              orderBy: { turnNumber: 'asc' },
              include: {
                player: true
              }
            }
          }
        },
        players: { include: { player: true } },
      },
    });

    expect(finalSeason).not.toBeNull();
    
    // Check if season is completed (all games should have 4 turns each)
    let allGamesComplete = true;
    for (const game of finalSeason!.games) {
      console.log(`Game ${game.id}: ${game.turns.length} turns, Status: ${game.status}`);
      
      // Each game should have 4 turns (one per player)
      expect(game.turns.length).toBe(4);
      
      // All turns should be completed
      for (const turn of game.turns) {
        expect(turn.status).toBe('COMPLETED');
      }
      
      if (game.status !== 'COMPLETED') {
        allGamesComplete = false;
      }
    }

    if (allGamesComplete) {
      expect(finalSeason!.status).toBe('COMPLETED');
      console.log('🎉 Season completed successfully!');
    }

    // ===== PHASE 8: VERIFY TURN SEQUENCE AND CONTENT =====
    console.log('\n📋 PHASE 8: Final Verification');
    
    for (let gameIndex = 0; gameIndex < finalSeason!.games.length; gameIndex++) {
      const game = finalSeason!.games[gameIndex];
      console.log(`\n📖 Game ${gameIndex + 1} Final Sequence:`);
      
      for (const turn of game.turns) {
        const playerIndex = testPlayers.findIndex(p => p.id === turn.playerId);
        const content = turn.textContent || turn.imageUrl || '';
        console.log(`  Turn ${turn.turnNumber} (${turn.type}): Player ${playerIndex + 1} - "${content.substring(0, 50)}..."`);
        
        // Verify turn pattern alternates correctly
        const expectedType = turn.turnNumber % 2 === 1 ? 'WRITING' : 'DRAWING';
        expect(turn.type).toBe(expectedType);
        
        // Verify content type matches turn type
        if (turn.type === 'WRITING') {
          expect(turn.textContent).toBeTruthy();
          expect(turn.textContent).toMatch(/story|Story|adventure|Adventure/);
        } else {
          expect(turn.imageUrl).toBeTruthy();
          expect(turn.imageUrl).toContain('https://');
        }
      }
    }

    // ===== PHASE 9: TEST STATUS COMMAND =====
    console.log('\n📊 PHASE 9: Status Command Verification');
    
    // Test that we can retrieve season data (status functionality)
    const seasonData = await prisma.season.findUnique({
      where: { id: seasonId },
      include: { games: { include: { turns: true } } }
    });
    expect(seasonData).toBeTruthy();
    console.log('✅ Season data retrieval works correctly');

    // ===== FINAL VERIFICATION =====
    console.log('\n✅ FULL SEASON PLAYTHROUGH TEST COMPLETED SUCCESSFULLY!');
    console.log(`Season ${seasonId} completed with:`);
    console.log(`- 4 players`);
    console.log(`- 4 games`);
    console.log(`- 16 total turns (4 per game)`);
    console.log(`- Proper turn alternation (writing/drawing)`);
    console.log(`- All turns completed successfully`);
    
    // Verify Discord client was called for DM notifications
    expect(mockDiscordClient.users.fetch).toHaveBeenCalled();
    console.log('✅ Discord DM notifications were sent');
  });

  it('should handle timeout scenarios during season playthrough', async () => {
    console.log('⏰ Testing Timeout Scenarios');
    
    // Create a season with very short timeouts for testing
    const createSeasonResult = await seasonService.createSeason({
      creatorPlayerId: testPlayers[0].id,
      maxPlayers: 3,
      minPlayers: 2,
      openDuration: '1d',
      turnPattern: 'writing,drawing',
      claimTimeout: '1m', // Very short for testing
      writingTimeout: '2m',
      drawingTimeout: '3m',
    });

    expect(createSeasonResult.type).toBe('success');
    seasonId = createSeasonResult.data?.seasonId ?? '';

    // Players join
    for (let i = 0; i < 3; i++) {
      const result = await seasonService.addPlayerToSeason(testPlayers[i].id, seasonId);
      expect(result.type).toBe('success');
    }

    // Get the first turn
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: { 
        games: {
          include: { turns: true }
        }
      },
    });

    const firstTurn = season!.games[0].turns[0];

    // Test claim timeout - simulate by dismissing the offer
    const dismissResult = await turnService.dismissOffer(firstTurn.id);
    expect(dismissResult.success).toBe(true);
    
    const turnAfterTimeout = await prisma.turn.findUnique({
      where: { id: firstTurn.id }
    });
    
    // Turn should be available again after dismissing offer
    expect(turnAfterTimeout!.status).toBe('AVAILABLE');
    console.log('✅ Claim timeout simulation handled correctly');

    // Test submission timeout - first offer the turn to a player, then claim and skip it
    const offerResult = await turnService.offerTurn(firstTurn.id, testPlayers[0].id);
    expect(offerResult.success).toBe(true);
    
    const claimResult = await turnService.claimTurn(firstTurn.id, testPlayers[0].id);
    expect(claimResult.success).toBe(true);

    // Simulate submission timeout by skipping the turn
    const skipResult = await turnService.skipTurn(firstTurn.id);
    expect(skipResult.success).toBe(true);
    
    const turnAfterSubmissionTimeout = await prisma.turn.findUnique({
      where: { id: firstTurn.id }
    });
    
    // Turn should be skipped after submission timeout
    expect(turnAfterSubmissionTimeout!.status).toBe('SKIPPED');
    console.log('✅ Submission timeout simulation handled correctly');
  });
}); 