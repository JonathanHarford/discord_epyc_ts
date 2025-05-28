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

  // Test Case 8: Full On-Demand Game Playthrough (2 Players, 3 Turns)
  it('should simulate a full on-demand game playthrough with two players (Alice and Bob) and three turns', async () => {
    // Phase 0: Setup
    // 0.1 Users & Players
    const aliceMockUser = createMockUser({ id: 'alice-discord-id', username: 'Alice', discriminator: '0001' });
    const bobMockUser = createMockUser({ id: 'bob-discord-id', username: 'Bob', discriminator: '0002' });

    const alicePlayer = await prisma.player.create({
      data: { id: nanoid(), discordUserId: aliceMockUser.id, name: aliceMockUser.username },
    });
    const bobPlayer = await prisma.player.create({
      data: { id: nanoid(), discordUserId: bobMockUser.id, name: bobMockUser.username },
    });

    // 0.2 GameConfig
    const gameConfig = await prisma.gameConfig.create({
      data: {
        id: nanoid(),
        name: 'Full Game Test Config',
        type: 'ON_DEMAND',
        turnPattern: ['WRITING', 'DRAWING', 'WRITING'], // Corrected to array
        minTurns: 3,
        maxTurns: 3,
        turnDurationMinutes: 10,
        maxPlayers: 2, // Allows Alice and Bob
        rounds: 1, // For simplicity, one set of turns
        // Assuming default return policy is permissive or set returnCount high if needed.
      },
    });

    // 0.3 Services & Mocks
    const mockDiscordClient = {
      users: {
        fetch: vi.fn(async (userId: string) => {
          if (userId === aliceMockUser.id) return aliceMockUser;
          if (userId === bobMockUser.id) return bobMockUser;
          // Add bot user mock if services try to fetch it e.g. for logging or self-mention
          if (userId === mockInteraction.client.user.id) return mockInteraction.client.user;
          console.warn(`[FullGameTest] Unmocked user fetch for ID: ${userId}`);
          return createMockUser({ id: userId });
        }),
      },
      channels: {
        fetch: vi.fn().mockImplementation(async (channelId: string) => ({
          id: channelId,
          type: 0, // Assume TextChannel or similar if type matters for message sending
          send: vi.fn().mockResolvedValue({ id: nanoid() }), // For game completion message
          guildId: 'test-guild-id',
        })),
      },
    } as unknown as DiscordClient;

    const onDemandTurnService = new OnDemandTurnService(prisma, mockDiscordClient);
    const mockSchedulerService = {
      scheduleJob: vi.fn().mockResolvedValue(true),
      cancelJob: vi.fn().mockResolvedValue(true),
    } as unknown as SchedulerService;
    const onDemandGameService = new OnDemandGameService(prisma, onDemandTurnService, mockDiscordClient, mockSchedulerService);
    const gameCommand = new GameCommand(prisma, onDemandGameService);
    
    // 0.4 EventData & Message Clearing
    // eventData is already available from beforeEach.
    // startCapturingMessages in beforeEach already clears messages.

    // --- Phase 1: Game Creation & Alice's First Turn ---
    // Step 1.1: Alice executes /game new
    mockInteraction.user = aliceMockUser; // Set Alice as the interactor
    vi.spyOn(mockInteraction.options, 'getSubcommand').mockReturnValue('new');
    // No specific options needed for /game new in this context

    await gameCommand.execute(mockInteraction as ChatInputCommandInteraction, eventData);

    // Assert DB for Step 1.1
    let game = await prisma.game.findFirst({ where: { creatorId: alicePlayer.id, gameConfigId: gameConfig.id }, include: { turns: true } });
    expect(game).not.toBeNull();
    expect(game?.status).toBe('PENDING'); // Game is pending until first turn is submitted or another player joins.
    expect(game?.turns.length).toBe(1);
    const aliceTurn1 = game!.turns[0];
    expect(aliceTurn1.type).toBe('WRITING');
    expect(aliceTurn1.status).toBe('PENDING');
    expect(aliceTurn1.playerId).toBe(alicePlayer.id);

    // Assert Messages for Step 1.1
    let captured = getCapturedMessages();
    expect(captured.length).toBe(2); // Public reply + DM to Alice

    const publicReplyNewGame = captured.find(msg => msg.content?.includes(strings.onDemandGames.newGame.success.split('!')[0])); // Check for "Alice has started a new game!"
    expect(publicReplyNewGame).toBeDefined();
    
    const dmToAliceNewGame = captured.find(msg => msg.content === strings.onDemandGames.turnPrompt.initial);
    expect(dmToAliceNewGame).toBeDefined();
    // Implicitly to Alice because userSendSpy on User.prototype.send is used, and it would be aliceMockUser.send()

    clearCapturedMessages();

    // Step 1.2: Alice submits her WRITING turn
    const aliceTurn1Content = "A cat wearing a very tall hat";
    await onDemandTurnService.submitTurn(aliceTurn1.id, alicePlayer.id, aliceTurn1Content, 'text');

    // Assert DB for Step 1.2
    const updatedAliceTurn1 = await prisma.turn.findUnique({ where: { id: aliceTurn1.id } });
    expect(updatedAliceTurn1?.status).toBe('COMPLETED');
    expect(updatedAliceTurn1?.textContent).toBe(aliceTurn1Content);
    game = await prisma.game.findUnique({ where: { id: game!.id }, include: { turns: { orderBy: { turnNumber: 'asc' }} } });
    expect(game?.lastActivityAt).not.toEqual(aliceTurn1.createdAt); // lastActivityAt updated
    expect(game?.turns.length).toBe(2); // Alice's completed, Turn 2 (DRAWING) created
    const turn2ForBob = game!.turns[1];
    expect(turn2ForBob.type).toBe('DRAWING');
    expect(turn2ForBob.status).toBe('AVAILABLE'); // Available for Bob to pick up
    expect(turn2ForBob.previousTurnId).toBe(aliceTurn1.id);


    // Assert Messages for Step 1.2
    captured = getCapturedMessages();
    expect(captured.length).toBe(1); // DM to Alice
    const dmAliceTurn1Confirm = captured.find(msg => msg.content === strings.onDemandGames.turnConfirmation);
    expect(dmAliceTurn1Confirm).toBeDefined();
    
    clearCapturedMessages();

    // --- Phase 2: Bob Joins & Submits Drawing ---
    // Step 2.3: Bob executes /game play
    mockInteraction.user = bobMockUser; // Set Bob as the interactor
    vi.spyOn(mockInteraction.options, 'getSubcommand').mockReturnValue('play');
    // Ensure the client mock on mockInteraction is also updated if it's user-specific, or use a shared one.
    mockInteraction.client.users.fetch = mockDiscordClient.users.fetch; // Point to the multi-user aware fetch

    await gameCommand.execute(mockInteraction as ChatInputCommandInteraction, eventData);
    
    // Assert DB for Step 2.3
    game = await prisma.game.findUnique({ where: { id: game!.id }, include: { turns: { orderBy: { turnNumber: 'asc' } } } });
    expect(game?.status).toBe('IN_PROGRESS'); // Game is now IN_PROGRESS
    const bobTurn2 = game!.turns.find(t => t.turnNumber === 2);
    expect(bobTurn2).toBeDefined();
    expect(bobTurn2?.status).toBe('PENDING');
    expect(bobTurn2?.playerId).toBe(bobPlayer.id);
    expect(bobTurn2?.type).toBe('DRAWING');

    // Assert Messages for Step 2.3
    captured = getCapturedMessages();
    expect(captured.length).toBe(2); // Public reply + DM to Bob

    const publicReplyBobJoins = captured.find(msg => msg.content?.includes(bobMockUser.username) && msg.content?.includes(aliceMockUser.username));
    expect(publicReplyBobJoins).toBeDefined(); // e.g., "Bob has joined the game started by Alice..."
    // Check string key if precise: strings.onDemandGames.join.success.replace(/{playerName}/g, bobMockUser.username).replace(/{creatorName}/g, aliceMockUser.username)
    
    const dmToBobDrawing = captured.find(msg => msg.content?.includes(strings.onDemandGames.turnPrompt.drawing.split(':')[0])); // "It's your turn! Draw..."
    expect(dmToBobDrawing).toBeDefined();
    expect(dmToBobDrawing?.content).toContain(aliceTurn1Content); // Prompt should contain Alice's text

    clearCapturedMessages();

    // Step 2.4: Bob submits his DRAWING turn
    const bobTurn2ImageUrl = "https://example.com/cat_in_hat_by_bob.png";
    await onDemandTurnService.submitTurn(bobTurn2!.id, bobPlayer.id, bobTurn2ImageUrl, 'image');

    // Assert DB for Step 2.4
    const updatedBobTurn2 = await prisma.turn.findUnique({ where: { id: bobTurn2!.id } });
    expect(updatedBobTurn2?.status).toBe('COMPLETED');
    expect(updatedBobTurn2?.imageUrl).toBe(bobTurn2ImageUrl);
    game = await prisma.game.findUnique({ where: { id: game!.id }, include: { turns: { orderBy: { turnNumber: 'asc' }} } });
    expect(game?.turns.length).toBe(3); // Bob's completed, Turn 3 (WRITING) created
    const turn3ForAlice = game!.turns[2];
    expect(turn3ForAlice.type).toBe('WRITING');
    expect(turn3ForAlice.status).toBe('AVAILABLE');
    expect(turn3ForAlice.previousTurnId).toBe(bobTurn2!.id);

    // Assert Messages for Step 2.4
    captured = getCapturedMessages();
    expect(captured.length).toBe(1); // DM to Bob
    const dmBobTurn2Confirm = captured.find(msg => msg.content === strings.onDemandGames.turnConfirmation);
    expect(dmBobTurn2Confirm).toBeDefined();

    clearCapturedMessages();

    // --- Phase 3: Alice's Second Turn & Game Completion ---
    // Step 3.5: Alice executes /game play again
    mockInteraction.user = aliceMockUser; // Set Alice as the interactor
    // options.getSubcommand is still 'play'
    mockInteraction.client.users.fetch = mockDiscordClient.users.fetch; // Ensure client is correctly set

    await gameCommand.execute(mockInteraction as ChatInputCommandInteraction, eventData);

    // Assert DB for Step 3.5
    game = await prisma.game.findUnique({ where: { id: game!.id }, include: { turns: { orderBy: { turnNumber: 'asc' } } } });
    const aliceTurn3 = game!.turns.find(t => t.turnNumber === 3);
    expect(aliceTurn3).toBeDefined();
    expect(aliceTurn3?.status).toBe('PENDING');
    expect(aliceTurn3?.playerId).toBe(alicePlayer.id);
    expect(aliceTurn3?.type).toBe('WRITING');

    // Assert Messages for Step 3.5
    captured = getCapturedMessages();
    expect(captured.length).toBe(2); // Public reply + DM to Alice

    const publicReplyAliceJoinsAgain = captured.find(msg => msg.content?.includes(aliceMockUser.username)); // Simplified check
    expect(publicReplyAliceJoinsAgain).toBeDefined();
    
    const dmToAliceWriting = captured.find(msg => msg.content?.includes(strings.onDemandGames.turnPrompt.writingBasedOnImage.split(':')[0]));
    expect(dmToAliceWriting).toBeDefined();
    // The actual image URL is not in the DM text for writing prompts based on images, so this is a generic prompt.

    clearCapturedMessages();

    // Step 3.6: Alice submits her WRITING turn
    const aliceTurn3Content = "The artistic cat showed off its masterpiece to an admiring crowd.";
    await onDemandTurnService.submitTurn(aliceTurn3!.id, alicePlayer.id, aliceTurn3Content, 'text');

    // Assert DB for Step 3.6
    const updatedAliceTurn3 = await prisma.turn.findUnique({ where: { id: aliceTurn3!.id } });
    expect(updatedAliceTurn3?.status).toBe('COMPLETED');
    expect(updatedAliceTurn3?.textContent).toBe(aliceTurn3Content);

    game = await prisma.game.findUnique({ where: { id: game!.id } });
    expect(game?.status).toBe('COMPLETED'); // Game is now COMPLETED
    expect(game?.completedAt).not.toBeNull();

    // Assert Messages for Step 3.6
    captured = getCapturedMessages();
    // Expect 1 DM to Alice (turn confirmation) + potentially 1 channel message (game completion)
    // For now, focus on the DM.
    const dmAliceTurn3Confirm = captured.find(msg => msg.content === strings.onDemandGames.turnConfirmation);
    expect(dmAliceTurn3Confirm).toBeDefined();
    
    // Optional: Assert Game Completion Channel Message
    // This depends on OnDemandGameService.sendGameCompletionAnnouncement and its mocking.
    // Assuming it sends a message to game.channelId if it exists.
    if (game?.channelId) {
        const gameCompletionMessage = captured.find(msg => 
            msg !== dmAliceTurn3Confirm && // Not the DM
            (msg.content?.includes(strings.onDemandGames.complete.title) || 
             (msg.embeds && msg.embeds.length > 0 && msg.embeds[0].title === strings.onDemandGames.complete.title))
        );
        // This assertion is highly dependent on the exact format of the completion message.
        // For now, checking if any other message was sent (besides the DM) might be a start.
        // If sendGameCompletionAnnouncement uses SimpleMessage, it will be captured by simpleMessageSpy.
        // If it uses client.channels.cache.get(...).send(...), that part of client needs mocking.
        // The current mockDiscordClient.channels.fetch().send() should capture it if channelId is used.
        expect(gameCompletionMessage).toBeDefined(); // This might be too strict without knowing exact message
    }
    
    clearCapturedMessages();
  });
});
