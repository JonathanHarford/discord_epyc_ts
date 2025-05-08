import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { ConfigService, GameSettingsInput, SeasonSettingsInput, ChannelConfigInput } from '../../src/services/config-service.js';
import { DatabaseService } from '../../src/database/index.js';
import { PrismaClient } from '../../prisma/generated/index.js';
import { setupTestDatabase, resetTestDatabase } from '../utils/test-db.js';

describe('ConfigService Integration Tests', () => {
  let configService: ConfigService;
  let dbService: DatabaseService;
  let prismaTestClient: PrismaClient;

  beforeEach(async () => {
    prismaTestClient = await setupTestDatabase();
    // Pass the test-specific Prisma client to the DatabaseService
    dbService = new DatabaseService(prismaTestClient);
    configService = new ConfigService(); // ConfigService doesn't take dbService in constructor based on current code
    await resetTestDatabase(prismaTestClient);
  });

  // Teardown: Disconnect Prisma client after tests
  afterAll(async () => {
    await prismaTestClient?.$disconnect();
  });

  it('should initialize server settings and retrieve them', async () => {
    // Use the dbService initialized in beforeEach, which now uses the test Prisma client
    const serverId = 'test-server-integration';
    const serverName = 'Test Server Integration';
    const defaultChannelId = 'test-channel-integration';

    // Initialize settings
    const initResult = await configService.initializeServerSettings(serverId, serverName, defaultChannelId, dbService);
    expect(initResult.success).toBe(true);
    expect(initResult.settings).toBeDefined();
    expect(initResult.settings.id).toBe(serverId);
    expect(initResult.settings.announcementChannelId).toBe(defaultChannelId);

    // Retrieve settings
    const retrievedSettingsResult = await configService.getServerSettings(serverId, dbService);
    expect(retrievedSettingsResult.success).toBe(true);
    expect(retrievedSettingsResult.settings).toBeDefined();
    expect(retrievedSettingsResult.settings.id).toBe(serverId);
    expect(retrievedSettingsResult.settings.announcementChannelId).toBe(defaultChannelId);
    expect(retrievedSettingsResult.settings.defaultGameSettingsId).toBe(`${serverId}-default-game`);
    expect(retrievedSettingsResult.settings.defaultSeasonSettingsId).toBe(`${serverId}-default-season`);

    // Verify default game settings were created using dbService
    const gameSettings = await dbService.servers.getDefaultGameSettings(serverId);
    expect(gameSettings).toBeDefined();
    expect(gameSettings.id).toBe(`${serverId}-default-game`);
    expect(gameSettings.turnPattern).toBe('drawing,writing');

    // Verify default season settings were created using dbService
    const seasonSettings = await dbService.servers.getDefaultSeasonSettings(serverId);
    expect(seasonSettings).toBeDefined();
    expect(seasonSettings.id).toBe(`${serverId}-default-season`);
    expect(seasonSettings.openDuration).toBe('7d');
  });

  // Add more tests for other ConfigService methods:
  // - updateChannelConfig
  // - updateDefaultGameSettings
  // - updateDefaultSeasonSettings
  // - getOrInitializeServerSettings (covering both get and initialize paths)

  it('should update and retrieve channel configurations', async () => {
    // Use the dbService initialized in beforeEach
    const serverId = 'server-channel-config';
    const serverName = 'Channel Config Server';
    const initialChannelId = 'initial-channel';

    // Initialize first
    await configService.initializeServerSettings(serverId, serverName, initialChannelId, dbService);

    const channelConfig: ChannelConfigInput = {
      announcementChannelId: 'new-announcement-channel',
      completedChannelId: 'new-completed-channel',
      adminChannelId: 'new-admin-channel',
    };

    // Pass null for guildChannels argument
    const updateResult = await configService.updateChannelConfig(serverId, channelConfig, null, dbService);
    expect(updateResult.success).toBe(true);
    expect(updateResult.settings).toBeDefined();
    if (!updateResult.settings) throw new Error('updateResult.settings is undefined');

    expect(updateResult.settings).toMatchObject(channelConfig);

    const retrievedSettingsResult = await configService.getServerSettings(serverId, dbService);
    expect(retrievedSettingsResult.success).toBe(true);
    expect(retrievedSettingsResult.settings).toBeDefined();
    if (!retrievedSettingsResult.settings) throw new Error('retrievedSettingsResult.settings is undefined');
    
    const retrievedSettings = retrievedSettingsResult.settings;
    expect(retrievedSettings.announcementChannelId).toBe(channelConfig.announcementChannelId);
    expect(retrievedSettings.completedChannelId).toBe(channelConfig.completedChannelId);
    expect(retrievedSettings.adminChannelId).toBe(channelConfig.adminChannelId);
  });

  it('should update and retrieve default game settings', async () => {
    // Use the dbService initialized in beforeEach
    const serverId = 'server-game-settings-update';
    const serverName = 'Game Settings Update Server';
    const initialChannelId = 'initial-channel-gs-update';

    await configService.initializeServerSettings(serverId, serverName, initialChannelId, dbService);

    const gameSettingsInput: GameSettingsInput = {
      turnPattern: 'writing,drawing,writing',
      writingTimeout: '2d',
      minTurns: 8,
      maxTurns: 16,
      returns: '1/2',
    };

    const updateResult = await configService.updateGameSettings(serverId, gameSettingsInput, dbService);
    if (!updateResult.success) {
      console.log('updateGameSettings failed. Result:', JSON.stringify(updateResult, null, 2));
    }
    expect(updateResult.success).toBe(true);
    expect(updateResult.settings).toBeDefined();
    if (!updateResult.settings) throw new Error('updateResult.settings is undefined');

    const updatedSettings = updateResult.settings;
    expect(updatedSettings.turnPattern).toBe(gameSettingsInput.turnPattern);
    expect(updatedSettings.writingTimeout).toBe(gameSettingsInput.writingTimeout);
    expect(updatedSettings.minTurns).toBe(gameSettingsInput.minTurns);

    const retrievedResult = await configService.getGameSettings(serverId, dbService);
    expect(retrievedResult.success).toBe(true);
    expect(retrievedResult.settings).toBeDefined();
    if (!retrievedResult.settings) throw new Error('retrievedResult.settings is undefined');

    const retrievedSettings = retrievedResult.settings;
    expect(retrievedSettings.turnPattern).toBe(gameSettingsInput.turnPattern);
    expect(retrievedSettings.writingTimeout).toBe(gameSettingsInput.writingTimeout);
    expect(retrievedSettings.minTurns).toBe(gameSettingsInput.minTurns);
  });

  it('should update and retrieve default season settings', async () => {
    // Use the dbService initialized in beforeEach
    const serverId = 'server-season-settings-update';
    const serverName = 'Season Settings Update Server';
    const initialChannelId = 'initial-channel-ss-update';

    await configService.initializeServerSettings(serverId, serverName, initialChannelId, dbService);

    const seasonSettingsInput: SeasonSettingsInput = {
      openDuration: '14d',
      minPlayers: 3,
      maxPlayers: 15,
    };

    const updateResult = await configService.updateSeasonSettings(serverId, seasonSettingsInput, dbService);
    expect(updateResult.success).toBe(true);
    expect(updateResult.settings).toBeDefined();
    if (!updateResult.settings) throw new Error('updateResult.settings is undefined');

    const updatedSettings = updateResult.settings;
    expect(updatedSettings.openDuration).toBe(seasonSettingsInput.openDuration);
    expect(updatedSettings.minPlayers).toBe(seasonSettingsInput.minPlayers);
    expect(updatedSettings.maxPlayers).toBe(seasonSettingsInput.maxPlayers);

    const retrievedResult = await configService.getSeasonSettings(serverId, dbService);
    expect(retrievedResult.success).toBe(true);
    expect(retrievedResult.settings).toBeDefined();
    if (!retrievedResult.settings) throw new Error('retrievedResult.settings is undefined');

    const retrievedSettings = retrievedResult.settings;
    expect(retrievedSettings.openDuration).toBe(seasonSettingsInput.openDuration);
    expect(retrievedSettings.minPlayers).toBe(seasonSettingsInput.minPlayers);
    expect(retrievedSettings.maxPlayers).toBe(seasonSettingsInput.maxPlayers);
  });

}); 