import { PrismaClient } from '@prisma/client';
import { ChatInputCommandInteraction, Locale, User, Embed, BaseMessageOptions } from 'discord.js'; // Added Embed and BaseMessageOptions
import { nanoid } from 'nanoid';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Helpers and Services
import { startCapturingMessages, stopCapturingMessages, getCapturedMessages, clearCapturedMessages } from '../helpers/message-capture';
import { createMockCommandInteraction, createMockUser } from '../helpers/discord-mocks';
import { HelpCommand } from '../../src/commands/chat/help-command';
import { SeasonCommand } from '../../src/commands/chat/season-command';
import { GameCommand } from '../../src/commands/chat/game-command'; // Added
import { SeasonService } from '../../src/services/SeasonService';
import { GameService } from '../../src/services/GameService';
import { SeasonTurnService } from '../../src/services/SeasonTurnService';
import { OnDemandGameService } from '../../src/services/OnDemandGameService'; // Added
import { OnDemandTurnService } from '../../src/services/OnDemandTurnService'; // Added
import { SchedulerService } from '../../src/services/SchedulerService';
import { EventData } from '../../src/models/internal-models';
import { strings } from '../../src/lang/strings'; // For asserting against actual string keys
import { Client as DiscordClient } from 'discord.js'; // Added

// Main Prisma Client instance
let prisma: PrismaClient;

describe('Bot Integration Tests (Interactions & Messaging)', () => {
  let mockInteraction: any; 
  let mockUser: User;
  let eventData: EventData;

  beforeAll(async () => {
    prisma = new PrismaClient();
    // Optional: Any global setup for this test suite, if not covered by global-setup.ts
    // Ensure test DB is clean or seeded if necessary (global-setup should handle migrations)
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    startCapturingMessages();
    
    mockUser = createMockUser({ id: 'test-user-id-default', username: 'TestUserDefault' });
    
    // Default mockInteraction, commandName and options will be set per test
    mockInteraction = createMockCommandInteraction({ 
      user: mockUser, 
      guildId: 'test-guild-id',
      client: { users: { fetch: vi.fn().mockResolvedValue(mockUser) } } as any // Mock client for SeasonCommand player fetch
    });
    eventData = new EventData(Locale.EnglishUS, Locale.EnglishUS);

    // Clean relevant tables before each test to ensure independence
    await prisma.playersOnSeasons.deleteMany();
    await prisma.turn.deleteMany();
    await prisma.game.deleteMany();
    await prisma.season.deleteMany();
    await prisma.seasonConfig.deleteMany();
    await prisma.gameConfig.deleteMany(); // Added GameConfig cleanup
    await prisma.player.deleteMany();
  });

  afterEach(() => {
    stopCapturingMessages();
    // clearCapturedMessages(); // startCapturingMessages already clears
    vi.restoreAllMocks(); // Restore all vi mocks
  });

  // Test Case 1: Help Command
  it('should respond to /help command with a list of commands', async () => {
    // Arrange
    const helpCommand = new HelpCommand();
    mockInteraction.commandName = 'help';

    // Act
    await helpCommand.execute(mockInteraction as ChatInputCommandInteraction, eventData);

    // Assert
    const messages = getCapturedMessages();
    expect(messages.length).toBe(1);
    const reply = messages[0] as BaseMessageOptions & { embeds: Embed[] };
    expect(reply.embeds).toBeDefined();
    expect(reply.embeds.length).toBe(1);
    const embed = reply.embeds[0];
    
    expect(embed.title).toBe(strings.commands.help.title); 
    expect(embed.description).toContain(strings.commands.season.name);
    expect(embed.description).toContain(strings.commands.game.name);
  });

  // Test Case 2: Season Creation (/season new)
  it('should create a new season with /season new and send a confirmation message', async () => {
    // Arrange
    const seasonName = 'My Test Season';
    const player = await prisma.player.create({
      data: {
        id: nanoid(), 
        discordUserId: mockUser.id,
        name: mockUser.username,
      },
    });

    const mockSchedulerService = {
      scheduleJob: vi.fn().mockResolvedValue(true),
      cancelJob: vi.fn().mockResolvedValue(true),
      scheduleAllSeasonJobs: vi.fn().mockResolvedValue(undefined),
    } as unknown as SchedulerService;
    const gameService = new GameService(prisma);
    const turnService = new SeasonTurnService(prisma, {} as any); // Minimal mock for Discord client
    const seasonService = new SeasonService(prisma, turnService, mockSchedulerService, gameService);
    const seasonCommand = new SeasonCommand(prisma, seasonService);

    mockInteraction.commandName = 'season';
    vi.spyOn(mockInteraction.options, 'getSubcommand').mockReturnValue('new');
    vi.spyOn(mockInteraction.options, 'getString').mockImplementation((optionName: string) => {
      if (optionName === 'name') return seasonName;
      return null; 
    });
    vi.spyOn(mockInteraction.options, 'getInteger').mockImplementation((optionName: string) => {
        if (optionName === 'min_players') return 2; 
        if (optionName === 'max_players') return 4; 
        return null;
    });

    // Act
    await seasonCommand.execute(mockInteraction as ChatInputCommandInteraction, eventData);

    // Assert
    // Assert Messages
    const messages = getCapturedMessages();
    expect(messages.length).toBe(1);
    const reply = messages[0] as BaseMessageOptions & { embeds?: Embed[] };

    const expectedMessage = strings.commands.season.new.success.replace('{seasonName}', seasonName);
    
    if (reply.content) {
       expect(reply.content).toBe(expectedMessage);
    } else if (reply.embeds && reply.embeds.length > 0) {
       expect(reply.embeds[0].description).toBe(expectedMessage);
    } else {
       throw new Error('No message content or embed found for season creation confirmation');
    }

    // Assert Database Changes
    const createdSeason = await prisma.season.findFirst({
      where: { name: seasonName, creatorId: player.id },
      include: { players: true },
    });
    expect(createdSeason).not.toBeNull();
    expect(createdSeason?.status).toBe('OPEN');
    expect(createdSeason?.players.length).toBe(1); // Creator is automatically added
    expect(createdSeason?.players[0].playerId).toBe(player.id);
  });

  // Test Case 3: Joining an Existing Open Season (/season join)
  it('should allow a player to join an open season and send a confirmation message', async () => {
    // Arrange
    const seasonName = 'Open Season for Joining';
    const creatorPlayer = await prisma.player.create({
      data: { id: nanoid(), discordUserId: 'creator-discord-id', name: 'SeasonCreator' },
    });
    const joiningPlayer = await prisma.player.create({ // This is mockUser
      data: { id: nanoid(), discordUserId: mockUser.id, name: mockUser.username },
    });
    const seasonConfig = await prisma.seasonConfig.create({
      data: { id: nanoid(), name: 'Test Join Config', minPlayers: 2, maxPlayers: 3, defaultDurationDays: 7 },
    });
    const season = await prisma.season.create({
      data: {
        id: nanoid(),
        name: seasonName,
        creatorId: creatorPlayer.id,
        seasonConfigId: seasonConfig.id,
        status: 'OPEN',
      },
    });
    await prisma.playersOnSeasons.create({ // Creator is part of the season
      data: { playerId: creatorPlayer.id, seasonId: season.id, joinedAt: new Date() },
    });

    const mockSchedulerService = { scheduleAllSeasonJobs: vi.fn().mockResolvedValue(undefined) } as unknown as SchedulerService;
    const gameService = new GameService(prisma);
    const turnService = new SeasonTurnService(prisma, {} as any);
    const seasonService = new SeasonService(prisma, turnService, mockSchedulerService, gameService);
    const seasonCommand = new SeasonCommand(prisma, seasonService);

    mockInteraction.commandName = 'season';
    vi.spyOn(mockInteraction.options, 'getSubcommand').mockReturnValue('join');
    vi.spyOn(mockInteraction.options, 'getString').mockReturnValue(season.id); // Player provides season ID

    // Act
    await seasonCommand.execute(mockInteraction as ChatInputCommandInteraction, eventData);

    // Assert
    // Assert Messages
    const messages = getCapturedMessages();
    expect(messages.length).toBe(1);
    const reply = messages[0];
    const expectedMessage = strings.commands.season.join.success.replace('{seasonName}', seasonName);
    
    if (reply.content) {
      expect(reply.content).toBe(expectedMessage);
    } else if ((reply as any).embeds && (reply as any).embeds.length > 0) {
      expect((reply as any).embeds[0].description).toBe(expectedMessage);
    } else {
      throw new Error('No message content or embed found for season join confirmation');
    }

    // Assert Database Changes
    const playerInSeason = await prisma.playersOnSeasons.findFirst({
      where: { playerId: joiningPlayer.id, seasonId: season.id },
    });
    expect(playerInSeason).not.toBeNull();
    const seasonWithPlayers = await prisma.season.findUnique({
        where: { id: season.id },
        include: { players: true }
    });
    expect(seasonWithPlayers?.players.length).toBe(2); // Creator + joiningPlayer
  });

  // Test Case 4: Attempt to Join a Full Season (/season join)
  it('should prevent a player from joining a full season and send an error message', async () => {
    // Arrange
    const seasonName = 'Full Season Test';
    const creatorPlayer = await prisma.player.create({
      data: { id: nanoid(), discordUserId: 'creator-discord-id-full', name: 'FullSeasonCreator' },
    });
    const joiningPlayer = await prisma.player.create({ // This is mockUser
      data: { id: nanoid(), discordUserId: mockUser.id, name: mockUser.username },
    });
    // Season config allows only 1 player, and creator already joined.
    const seasonConfig = await prisma.seasonConfig.create({
      data: { id: nanoid(), name: 'Test Full Config', minPlayers: 1, maxPlayers: 1, defaultDurationDays: 7 },
    });
    const season = await prisma.season.create({
      data: {
        id: nanoid(),
        name: seasonName,
        creatorId: creatorPlayer.id,
        seasonConfigId: seasonConfig.id,
        status: 'OPEN', 
      },
    });
    await prisma.playersOnSeasons.create({ // Creator is part of the season, making it full
      data: { playerId: creatorPlayer.id, seasonId: season.id, joinedAt: new Date() },
    });

    const mockSchedulerService = { scheduleAllSeasonJobs: vi.fn().mockResolvedValue(undefined) } as unknown as SchedulerService;
    const gameService = new GameService(prisma);
    const turnService = new SeasonTurnService(prisma, {} as any);
    const seasonService = new SeasonService(prisma, turnService, mockSchedulerService, gameService);
    const seasonCommand = new SeasonCommand(prisma, seasonService);

    mockInteraction.commandName = 'season';
    vi.spyOn(mockInteraction.options, 'getSubcommand').mockReturnValue('join');
    vi.spyOn(mockInteraction.options, 'getString').mockReturnValue(season.id);

    // Act
    await seasonCommand.execute(mockInteraction as ChatInputCommandInteraction, eventData);

    // Assert
    // Assert Messages
    const messages = getCapturedMessages();
    expect(messages.length).toBe(1);
    const reply = messages[0];
    const expectedMessage = strings.commands.season.join.error.full.replace('{seasonName}', seasonName);
    
    if (reply.content) {
      expect(reply.content).toBe(expectedMessage);
    } else if ((reply as any).embeds && (reply as any).embeds.length > 0) {
      expect((reply as any).embeds[0].description).toBe(expectedMessage);
    } else {
      throw new Error('No message content or embed found for season full error');
    }

    // Assert Database Changes
    const playerAttemptingToJoin = await prisma.playersOnSeasons.findFirst({
      where: { playerId: joiningPlayer.id, seasonId: season.id },
    });
    expect(playerAttemptingToJoin).toBeNull(); // Player should not have been added

    const seasonWithPlayers = await prisma.season.findUnique({
        where: { id: season.id },
        include: { players: true }
    });
    expect(seasonWithPlayers?.players.length).toBe(1); // Should still only have the creator
  });

  // Test Case 5: DM Sent on New On-Demand Game Creation (/game new)
  it('should send a DM to the creator upon new on-demand game creation', async () => {
    // Arrange
    const gameCreatorPlayer = await prisma.player.create({ // This is mockUser
      data: {
        id: nanoid(),
        discordUserId: mockUser.id,
        name: mockUser.username,
      },
    });

    const mockDiscordClient = {
      users: { fetch: vi.fn().mockResolvedValue(mockUser) },
      channels: { fetch: vi.fn().mockResolvedValue({ type: 0 }) } 
    } as unknown as DiscordClient;
    
    const onDemandTurnService = new OnDemandTurnService(prisma, mockDiscordClient);
    const mockSchedulerService = { 
      scheduleJob: vi.fn().mockResolvedValue(true),
      cancelJob: vi.fn().mockResolvedValue(true) 
    } as unknown as SchedulerService;
    const onDemandGameService = new OnDemandGameService(prisma, onDemandTurnService, mockDiscordClient, mockSchedulerService);
    const gameCommand = new GameCommand(prisma, onDemandGameService);

    mockInteraction.commandName = 'game';
    vi.spyOn(mockInteraction.options, 'getSubcommand').mockReturnValue('new');

    // Act
    await gameCommand.execute(mockInteraction as ChatInputCommandInteraction, eventData);

    // Assert
    // Assert Messages (Interaction Reply + DM)
    const messages = getCapturedMessages();
    expect(messages.length).toBe(2); 

    // Find the DM (sent via User.prototype.send)
    const dmContent = strings.onDemandGames.turnPrompt.initial;
    const dmMessage = messages.find(msg => msg.content === dmContent);
    expect(dmMessage).toBeDefined();
    expect(dmMessage?.content).toBe(dmContent);
    
    // Assert Database Changes
    const createdGame = await prisma.game.findFirst({
      where: { creatorId: gameCreatorPlayer.id, type: 'ON_DEMAND' },
      include: { turns: true },
    });
    expect(createdGame).not.toBeNull();
    expect(createdGame?.status).toBe('IN_PROGRESS');
    expect(createdGame?.turns.length).toBe(1); // Initial turn for creator
    expect(createdGame?.turns[0].playerId).toBe(gameCreatorPlayer.id);
    expect(createdGame?.turns[0].status).toBe('PENDING');
  });

  // Test Case 6: Submit Image URL for Drawing Turn (On-Demand Game)
  it('should update a DRAWING turn with an image URL and send DM confirmation for an on-demand game', async () => {
    // Arrange
    const player = await prisma.player.create({ // This is mockUser
      data: { id: nanoid(), discordUserId: mockUser.id, name: mockUser.username },
    });

    const gameConfig = await prisma.gameConfig.create({
      data: {
        id: nanoid(),
        name: 'Test On-Demand Config for Drawing',
        type: 'ON_DEMAND',
        turnDurationMinutes: 10, 
        maxPlayers: 4, 
        rounds: 3,
        firstTurnType: 'DRAWING', // Ensures the first turn is a drawing turn
      },
    });

    const game = await prisma.game.create({
      data: {
        id: nanoid(),
        creatorId: player.id,
        guildId: mockInteraction.guildId,
        gameConfigId: gameConfig.id,
        status: 'IN_PROGRESS', 
        type: 'ON_DEMAND',
      },
    });

    const initialTurn = await prisma.turn.create({ // Creator's first turn
      data: {
        id: nanoid(),
        gameId: game.id,
        playerId: player.id,
        turnNumber: 1,
        type: 'DRAWING',
        status: 'PENDING', 
        claimedAt: new Date(),
      },
    });

    const mockDiscordClient = {
      users: { fetch: vi.fn().mockResolvedValue(mockUser) },
      channels: { fetch: vi.fn().mockResolvedValue({ type: 0 }) }
    } as unknown as DiscordClient;
    const onDemandTurnService = new OnDemandTurnService(prisma, mockDiscordClient);

    const mockImageUrl = 'https://example.com/test_drawing.png';

    // Act
    // This test calls the service method directly, not via a command.
    await onDemandTurnService.submitTurn(initialTurn.id, player.id, mockImageUrl, 'image');

    // Assert
    // Assert Database Changes
    const updatedTurn = await prisma.turn.findUnique({
      where: { id: initialTurn.id },
    });
    expect(updatedTurn).not.toBeNull();
    expect(updatedTurn?.status).toBe('COMPLETED');
    expect(updatedTurn?.imageUrl).toBe(mockImageUrl);
    expect(updatedTurn?.textContent).toBeNull(); 
    expect(updatedTurn?.completedAt).not.toBeNull();

    // Assert Messages (DM Confirmation)
    const messages = getCapturedMessages();
    expect(messages.length).toBe(1); // Expecting only the DM confirmation
    
    const expectedDmContent = strings.onDemandGames.turnConfirmation; 
    const dmMessage = messages.find(msg => msg.content === expectedDmContent);
    expect(dmMessage).toBeDefined();
    expect(dmMessage?.content).toBe(expectedDmContent);
  });

  // Test Case 7: Player Joins an On-Demand Game via /game play
  it('should allow a player to join an available on-demand game, make an announcement, and send a DM', async () => {
    // Arrange
    const creatorPlayer = await prisma.player.create({
      data: { id: nanoid(), discordUserId: 'creator-discord-id-gameplay', name: 'GameCreatorPlay' },
    });
    const joiningPlayer = await prisma.player.create({ // This is mockUser
      data: { id: nanoid(), discordUserId: mockUser.id, name: mockUser.username },
    });

    const gameConfig = await prisma.gameConfig.create({
      data: {
        id: nanoid(),
        name: 'Test On-Demand Play Config',
        type: 'ON_DEMAND',
        turnDurationMinutes: 10,
        maxPlayers: 2, 
        rounds: 1,
        firstTurnType: 'WRITING', 
      },
    });

    const game = await prisma.game.create({
      data: {
        id: nanoid(),
        creatorId: creatorPlayer.id,
        guildId: mockInteraction.guildId,
        gameConfigId: gameConfig.id,
        status: 'PENDING', // Game is waiting for players
        type: 'ON_DEMAND',
      },
    });
    const initialLastActivityAt = game.lastActivityAt;

    // This turn is open for anyone to pick up by joining the game.
    const availableTurn = await prisma.turn.create({
      data: {
        id: nanoid(),
        gameId: game.id,
        turnNumber: 1, 
        type: 'WRITING', 
        status: 'AVAILABLE', // Key for /game play to pick it up
        playerId: null, // No player assigned yet
      },
    });
    
    const mockDiscordClient = {
      users: { fetch: vi.fn().mockImplementation(userId => { // Ensure correct user objects are fetched
        if (userId === mockUser.id) return Promise.resolve(mockUser); // mockUser is joiningPlayer
        if (userId === creatorPlayer.discordUserId) return Promise.resolve(createMockUser({id: creatorPlayer.discordUserId, username: creatorPlayer.name}));
        return Promise.resolve(createMockUser({id: userId})); // Generic mock for other cases
      })},
      channels: { fetch: vi.fn().mockResolvedValue({ type: 0, send: vi.fn().mockResolvedValue({}) }) }
    } as unknown as DiscordClient;

    const onDemandTurnService = new OnDemandTurnService(prisma, mockDiscordClient);
    const mockSchedulerService = { 
        scheduleJob: vi.fn().mockResolvedValue(true), 
        cancelJob: vi.fn().mockResolvedValue(true) 
    } as unknown as SchedulerService;
    const onDemandGameService = new OnDemandGameService(prisma, onDemandTurnService, mockDiscordClient, mockSchedulerService);
    const gameCommand = new GameCommand(prisma, onDemandGameService);
    
    // mockInteraction.user is already mockUser (joiningPlayer) from beforeEach
    mockInteraction.commandName = 'game';
    vi.spyOn(mockInteraction.options, 'getSubcommand').mockReturnValue('play');

    // Act
    await gameCommand.execute(mockInteraction as ChatInputCommandInteraction, eventData);

    // Assert
    // Assert Messages (Public Announcement + DM to Joiner)
    const messages = getCapturedMessages();
    expect(messages.length).toBe(2);

    // 1. Public Announcement (captured by simpleMessageSpy)
    const expectedPublicAnnouncement = strings.onDemandGames.join.success
        .replace('{playerName}', `<@${joiningPlayer.discordUserId}>`) 
        .replace('{creatorName}', `<@${creatorPlayer.discordUserId}>`);
    const publicMessage = messages.find(msg => msg.content === expectedPublicAnnouncement);
    expect(publicMessage).toBeDefined();
    expect(publicMessage?.content).toBe(expectedPublicAnnouncement);

    // 2. Direct Message to joiningPlayer (captured by userSendSpy)
    const expectedDmContent = strings.onDemandGames.turnPrompt.initial; 
    const dmMessage = messages.find(msg => msg.content === expectedDmContent);
    expect(dmMessage).toBeDefined();
    expect(dmMessage?.content).toBe(expectedDmContent);
    
    // Assert Database Changes
    const updatedGame = await prisma.game.findUnique({ where: { id: game.id } });
    expect(updatedGame).not.toBeNull();
    expect(updatedGame?.status).toBe('IN_PROGRESS'); 
    expect(updatedGame?.lastActivityAt).not.toEqual(initialLastActivityAt);

    const updatedTurn = await prisma.turn.findUnique({ where: { id: availableTurn.id } });
    expect(updatedTurn).not.toBeNull();
    expect(updatedTurn?.status).toBe('PENDING'); 
    expect(updatedTurn?.playerId).toBe(joiningPlayer.id); 
    expect(updatedTurn?.claimedAt).not.toBeNull();
  });
});
