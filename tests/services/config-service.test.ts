import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService, GameSettingsInput, SeasonSettingsInput, ChannelConfigInput } from '../../src/services/config-service.js';
import { DatabaseService } from '../../src/database/index.js';
import { ChannelType } from 'discord.js';

// Mock the database services
vi.mock('../../src/database/index.js', () => {
    return {
        DatabaseService: vi.fn().mockImplementation(() => ({
            servers: {
                getServer: vi.fn().mockImplementation((serverId) => {
                    // Return a valid server for our test serverId
                    if (serverId === 'test-server') {
                        return Promise.resolve({ id: 'test-server' });
                    }
                    // Return null for nonexistent server
                    return Promise.resolve(null);
                }),
                getServerSettings: vi.fn().mockImplementation((serverId) => {
                    if (serverId === 'test-server') {
                        return Promise.resolve({
                            id: 'test-server',
                            announcementChannelId: 'test-channel',
                            completedChannelId: 'completed-channel',
                            adminChannelId: 'admin-channel',
                            defaultGameSettingsId: 'test-game-settings',
                            defaultSeasonSettingsId: 'test-season-settings',
                            defaultGameSettings: {
                                id: 'test-game-settings',
                                turnPattern: 'writing,drawing',
                                writingTimeout: '1d',
                                writingWarning: '1m',
                                drawingTimeout: '1d',
                                drawingWarning: '10m',
                                staleTimeout: '7d',
                                minTurns: 6,
                                maxTurns: 12,
                                returns: '2/3'
                            },
                            defaultSeasonSettings: {
                                id: 'test-season-settings',
                                openDuration: '7d',
                                minPlayers: 2,
                                maxPlayers: 10
                            }
                        });
                    }
                    return Promise.resolve(null);
                }),
                initializeServerSettings: vi.fn().mockImplementation((serverId, serverName, channelId) => {
                    return Promise.resolve({
                        id: serverId,
                        announcementChannelId: channelId,
                        completedChannelId: channelId,
                        adminChannelId: channelId,
                        defaultGameSettingsId: `${serverId}-default-game`,
                        defaultSeasonSettingsId: `${serverId}-default-season`
                    });
                }),
                updateChannelConfig: vi.fn().mockImplementation((serverId, channelConfig) => {
                    return Promise.resolve({
                        id: serverId,
                        ...channelConfig
                    });
                }),
                updateDefaultGameSettings: vi.fn().mockImplementation((serverId, gameSettings) => {
                    return Promise.resolve({
                        id: `${serverId}-default-game`,
                        ...gameSettings
                    });
                }),
                getDefaultGameSettings: vi.fn().mockImplementation((serverId) => {
                    if (serverId === 'test-server') {
                        return Promise.resolve({
                            id: 'test-game-settings',
                            turnPattern: 'writing,drawing',
                            writingTimeout: '1d',
                            writingWarning: '1m',
                            drawingTimeout: '1d',
                            drawingWarning: '10m',
                            staleTimeout: '7d',
                            minTurns: 6,
                            maxTurns: 12,
                            returns: '2/3'
                        });
                    }
                    return Promise.resolve(null);
                }),
                updateDefaultSeasonSettings: vi.fn().mockImplementation((serverId, seasonSettings) => {
                    return Promise.resolve({
                        id: `${serverId}-default-season`,
                        ...seasonSettings
                    });
                }),
                getDefaultSeasonSettings: vi.fn().mockImplementation((serverId) => {
                    if (serverId === 'test-server') {
                        return Promise.resolve({
                            id: 'test-season-settings',
                            openDuration: '7d',
                            minPlayers: 2,
                            maxPlayers: 10
                        });
                    }
                    return Promise.resolve(null);
                })
            }
        }))
    };
});

describe('ConfigService', () => {
    let configService: ConfigService;
    let mockDbService: DatabaseService;
    
    beforeEach(() => {
        configService = new ConfigService();
        mockDbService = new DatabaseService();
        
        // Reset mock implementation for specific test cases
        vi.mocked(mockDbService.servers.getServer).mockImplementation((serverId) => {
            if (serverId === 'test-server') {
                return Promise.resolve({ id: 'test-server' });
            }
            return Promise.resolve(null);
        });
    });
    
    describe('Validation Methods', () => {
        describe('validateGameSettings', () => {
            it('should validate correct game settings', () => {
                const input: GameSettingsInput = {
                    turnPattern: 'writing,drawing',
                    writingTimeout: '1d',
                    writingWarning: '1h',
                    drawingTimeout: '2d',
                    drawingWarning: '5h',
                    staleTimeout: '7d',
                    minTurns: 6,
                    maxTurns: 12,
                    returns: '2/3'
                };
                
                const result = configService.validateGameSettings(input);
                
                expect(result.success).toBe(true);
                expect(result.settings).toBeDefined();
                if (result.settings) {
                    expect(result.settings.turnPattern).toBe('writing,drawing');
                    expect(result.settings.writingTimeout).toBe('1d');
                    expect(result.settings.minTurns).toBe(6);
                    expect(result.settings.maxTurns).toBe(12);
                }
            });
            
            it('should return success with empty settings for empty input', () => {
                const result = configService.validateGameSettings({});
                
                expect(result.success).toBe(true);
                expect(result.settings).toEqual({});
            });
            
            it('should validate and convert "none" returns to null', () => {
                const input: GameSettingsInput = {
                    returns: 'none'
                };
                
                const result = configService.validateGameSettings(input);
                
                expect(result.success).toBe(true);
                expect(result.settings?.returns).toBeNull();
            });
            
            it('should fail validation for invalid turn pattern', () => {
                const input: GameSettingsInput = {
                    turnPattern: 'invalid-pattern'
                };
                
                const result = configService.validateGameSettings(input);
                
                expect(result.success).toBe(false);
                expect(result.errors).toBeDefined();
                expect(result.errors?.length).toBeGreaterThan(0);
                expect(result.errors?.[0]).toContain('Turn pattern');
            });
            
            it('should fail validation for invalid duration format', () => {
                const input: GameSettingsInput = {
                    writingTimeout: 'invalid-duration'
                };
                
                const result = configService.validateGameSettings(input);
                
                expect(result.success).toBe(false);
                expect(result.errors).toBeDefined();
                expect(result.errors?.length).toBeGreaterThan(0);
                expect(result.errors?.[0]).toContain('Writing timeout');
            });
            
            it('should fail validation when minimum turns too low', () => {
                const input: GameSettingsInput = {
                    minTurns: 2 // Should be at least 4
                };
                
                const result = configService.validateGameSettings(input);
                
                expect(result.success).toBe(false);
                expect(result.errors).toBeDefined();
                expect(result.errors?.length).toBeGreaterThan(0);
                expect(result.errors?.[0]).toContain('Minimum turns');
            });
            
            it('should fail validation when maxTurns less than minTurns', () => {
                const input: GameSettingsInput = {
                    minTurns: 8,
                    maxTurns: 6
                };
                
                const result = configService.validateGameSettings(input);
                
                expect(result.success).toBe(false);
                expect(result.errors).toBeDefined();
                expect(result.errors?.length).toBeGreaterThan(0);
                expect(result.errors?.[0]).toContain('Maximum turns');
            });
        });
        
        describe('validateSeasonSettings', () => {
            it('should validate correct season settings', () => {
                const input: SeasonSettingsInput = {
                    openDuration: '7d',
                    minPlayers: 2,
                    maxPlayers: 10
                };
                
                const result = configService.validateSeasonSettings(input);
                
                expect(result.success).toBe(true);
                expect(result.settings).toBeDefined();
                if (result.settings) {
                    expect(result.settings.openDuration).toBe('7d');
                    expect(result.settings.minPlayers).toBe(2);
                    expect(result.settings.maxPlayers).toBe(10);
                }
            });
            
            it('should return success with empty settings for empty input', () => {
                const result = configService.validateSeasonSettings({});
                
                expect(result.success).toBe(true);
                expect(result.settings).toEqual({});
            });
            
            it('should fail validation when minimum players too low', () => {
                const input: SeasonSettingsInput = {
                    minPlayers: 1 // Should be at least 2
                };
                
                const result = configService.validateSeasonSettings(input);
                
                expect(result.success).toBe(false);
                expect(result.errors).toBeDefined();
                expect(result.errors?.length).toBeGreaterThan(0);
                expect(result.errors?.[0]).toContain('Minimum players');
            });
            
            it('should fail validation when maxPlayers less than minPlayers', () => {
                const input: SeasonSettingsInput = {
                    minPlayers: 5,
                    maxPlayers: 3
                };
                
                const result = configService.validateSeasonSettings(input);
                
                expect(result.success).toBe(false);
                expect(result.errors).toBeDefined();
                expect(result.errors?.length).toBeGreaterThan(0);
                expect(result.errors?.[0]).toContain('Maximum players');
            });
        });
        
        describe('validateChannelConfig', () => {
            it('should validate correct channel configuration', () => {
                const input: ChannelConfigInput = {
                    announcementChannelId: 'channel-1',
                    completedChannelId: 'channel-2',
                    adminChannelId: 'channel-3'
                };
                
                // Create a map of guild channels for validation
                const guildChannels = new Map<string, { type: number }>();
                guildChannels.set('channel-1', { type: ChannelType.GuildText });
                guildChannels.set('channel-2', { type: ChannelType.GuildText });
                guildChannels.set('channel-3', { type: ChannelType.GuildText });
                
                const result = configService.validateChannelConfig(input, guildChannels);
                
                expect(result.success).toBe(true);
                expect(result.settings).toBeDefined();
                if (result.settings) {
                    expect(result.settings.announcementChannelId).toBe('channel-1');
                    expect(result.settings.completedChannelId).toBe('channel-2');
                    expect(result.settings.adminChannelId).toBe('channel-3');
                }
            });
            
            it('should return success with empty settings for empty input', () => {
                const result = configService.validateChannelConfig({}, null);
                
                expect(result.success).toBe(true);
                expect(result.settings).toEqual({});
            });
            
            it('should fail validation for non-text channels', () => {
                const input: ChannelConfigInput = {
                    announcementChannelId: 'voice-channel',
                    completedChannelId: 'text-channel'
                };
                
                // Create a map with one text channel and one voice channel
                const guildChannels = new Map<string, { type: number }>();
                guildChannels.set('text-channel', { type: ChannelType.GuildText });
                guildChannels.set('voice-channel', { type: ChannelType.GuildVoice });
                
                const result = configService.validateChannelConfig(input, guildChannels);
                
                expect(result.success).toBe(false);
                expect(result.errors).toBeDefined();
                expect(result.errors?.length).toBeGreaterThan(0);
                expect(result.errors?.[0]).toContain('Announcement Channel');
            });
            
            it('should not validate channel types if guildChannels is null', () => {
                const input: ChannelConfigInput = {
                    announcementChannelId: 'any-channel'
                };
                
                const result = configService.validateChannelConfig(input, null);
                
                expect(result.success).toBe(true);
                expect(result.settings).toBeDefined();
                expect(result.settings?.announcementChannelId).toBe('any-channel');
            });
        });
    });
    
    describe('Database Methods', () => {
        describe('getServerSettings', () => {
            it('should retrieve server settings when they exist', async () => {
                const result = await configService.getServerSettings('test-server', mockDbService);
                
                expect(result.success).toBe(true);
                expect(result.settings).toBeDefined();
                expect(result.settings?.id).toBe('test-server');
                expect(result.settings?.announcementChannelId).toBe('test-channel');
                expect(vi.mocked(mockDbService.servers.getServerSettings)).toHaveBeenCalledWith('test-server');
            });
            
            it('should return error when server settings do not exist', async () => {
                const result = await configService.getServerSettings('nonexistent-server', mockDbService);
                
                expect(result.success).toBe(false);
                expect(result.error).toBe('Server settings not found');
                expect(vi.mocked(mockDbService.servers.getServerSettings)).toHaveBeenCalledWith('nonexistent-server');
            });
        });
        
        describe('initializeServerSettings', () => {
            it('should initialize server settings successfully', async () => {
                const result = await configService.initializeServerSettings(
                    'new-server',
                    'New Server',
                    'default-channel',
                    mockDbService
                );
                
                expect(result.success).toBe(true);
                expect(result.settings).toBeDefined();
                expect(result.settings.id).toBe('new-server');
                expect(result.settings.announcementChannelId).toBe('default-channel');
                expect(vi.mocked(mockDbService.servers.initializeServerSettings)).toHaveBeenCalledWith(
                    'new-server',
                    'New Server',
                    'default-channel'
                );
            });
        });
        
        describe('getOrInitializeServerSettings', () => {
            it('should get existing server settings', async () => {
                const result = await configService.getOrInitializeServerSettings(
                    'test-server',
                    'Test Server',
                    'test-channel',
                    mockDbService
                );
                
                expect(result.success).toBe(true);
                expect(result.settings).toBeDefined();
                expect(result.settings.id).toBe('test-server');
                expect(vi.mocked(mockDbService.servers.getServer)).toHaveBeenCalledWith('test-server');
                expect(vi.mocked(mockDbService.servers.initializeServerSettings)).not.toHaveBeenCalled();
            });
            
            it('should initialize server settings when they do not exist', async () => {
                const result = await configService.getOrInitializeServerSettings(
                    'nonexistent-server',
                    'New Server',
                    'default-channel',
                    mockDbService
                );
                
                expect(result.success).toBe(true);
                expect(result.settings).toBeDefined();
                expect(vi.mocked(mockDbService.servers.getServer)).toHaveBeenCalledWith('nonexistent-server');
                expect(vi.mocked(mockDbService.servers.initializeServerSettings)).toHaveBeenCalledWith(
                    'nonexistent-server',
                    'New Server',
                    'default-channel'
                );
            });
        });
        
        describe('updateGameSettings', () => {
            it('should update game settings successfully with valid input', async () => {
                const gameSettings: GameSettingsInput = {
                    turnPattern: 'drawing,writing',
                    writingTimeout: '30m',
                    minTurns: 8
                };
                
                const result = await configService.updateGameSettings(
                    'test-server',
                    gameSettings,
                    mockDbService
                );
                
                expect(result.success).toBe(true);
                expect(result.settings).toBeDefined();
                expect(result.settings?.turnPattern).toBe('drawing,writing');
                expect(result.settings?.writingTimeout).toBe('30m');
                expect(result.settings?.minTurns).toBe(8);
                expect(vi.mocked(mockDbService.servers.updateDefaultGameSettings)).toHaveBeenCalledWith(
                    'test-server',
                    expect.objectContaining({
                        turnPattern: 'drawing,writing',
                        writingTimeout: '30m',
                        minTurns: 8
                    })
                );
            });
            
            it('should fail with validation errors for invalid input', async () => {
                const gameSettings: GameSettingsInput = {
                    turnPattern: 'invalid-pattern',
                    minTurns: 2 // Less than minimum 4
                };
                
                const result = await configService.updateGameSettings(
                    'test-server',
                    gameSettings,
                    mockDbService
                );
                
                expect(result.success).toBe(false);
                expect(result.error).toBe('Validation failed');
                expect(result.validationErrors).toBeDefined();
                expect(result.validationErrors?.length).toBeGreaterThan(0);
                expect(vi.mocked(mockDbService.servers.updateDefaultGameSettings)).not.toHaveBeenCalled();
            });
            
            it('should fail when server settings not found', async () => {
                const gameSettings: GameSettingsInput = {
                    turnPattern: 'writing,drawing'
                };
                
                vi.mocked(mockDbService.servers.getServerSettings).mockResolvedValueOnce(null);
                
                const result = await configService.updateGameSettings(
                    'nonexistent-server',
                    gameSettings,
                    mockDbService
                );
                
                expect(result.success).toBe(false);
                expect(result.error).toBe('Server settings not found. Initialize server first.');
                expect(vi.mocked(mockDbService.servers.updateDefaultGameSettings)).not.toHaveBeenCalled();
            });
        });
        
        describe('updateSeasonSettings', () => {
            it('should update season settings successfully with valid input', async () => {
                const seasonSettings: SeasonSettingsInput = {
                    openDuration: '14d',
                    minPlayers: 3,
                    maxPlayers: 15
                };
                
                const result = await configService.updateSeasonSettings(
                    'test-server',
                    seasonSettings,
                    mockDbService
                );
                
                expect(result.success).toBe(true);
                expect(result.settings).toBeDefined();
                expect(result.settings?.openDuration).toBe('14d');
                expect(result.settings?.minPlayers).toBe(3);
                expect(result.settings?.maxPlayers).toBe(15);
                expect(vi.mocked(mockDbService.servers.updateDefaultSeasonSettings)).toHaveBeenCalledWith(
                    'test-server',
                    expect.objectContaining({
                        openDuration: '14d',
                        minPlayers: 3,
                        maxPlayers: 15
                    })
                );
            });
            
            it('should fail with validation errors for invalid input', async () => {
                const seasonSettings: SeasonSettingsInput = {
                    minPlayers: 1, // Less than minimum 2
                    maxPlayers: 1
                };
                
                const result = await configService.updateSeasonSettings(
                    'test-server',
                    seasonSettings,
                    mockDbService
                );
                
                expect(result.success).toBe(false);
                expect(result.error).toBe('Validation failed');
                expect(result.validationErrors).toBeDefined();
                expect(result.validationErrors?.length).toBeGreaterThan(0);
                expect(vi.mocked(mockDbService.servers.updateDefaultSeasonSettings)).not.toHaveBeenCalled();
            });
        });
        
        describe('updateChannelConfig', () => {
            it('should update channel configuration successfully with valid input', async () => {
                const channelConfig: ChannelConfigInput = {
                    announcementChannelId: 'new-channel',
                    completedChannelId: null
                };
                
                // Create guild channels map for validation
                const guildChannels = new Map<string, { type: number }>();
                guildChannels.set('new-channel', { type: ChannelType.GuildText });
                
                const result = await configService.updateChannelConfig(
                    'test-server',
                    channelConfig,
                    guildChannels,
                    mockDbService
                );
                
                expect(result.success).toBe(true);
                expect(result.settings).toBeDefined();
                expect(result.settings?.announcementChannelId).toBe('new-channel');
                expect(result.settings?.completedChannelId).toBeNull();
                expect(vi.mocked(mockDbService.servers.updateChannelConfig)).toHaveBeenCalledWith(
                    'test-server',
                    expect.objectContaining({
                        announcementChannelId: 'new-channel',
                        completedChannelId: null
                    })
                );
            });
            
            it('should fail with validation errors for invalid channels', async () => {
                const channelConfig: ChannelConfigInput = {
                    announcementChannelId: 'voice-channel'
                };
                
                // Create guild channels map with a voice channel
                const guildChannels = new Map<string, { type: number }>();
                guildChannels.set('voice-channel', { type: ChannelType.GuildVoice });
                
                const result = await configService.updateChannelConfig(
                    'test-server',
                    channelConfig,
                    guildChannels,
                    mockDbService
                );
                
                expect(result.success).toBe(false);
                expect(result.error).toBe('Validation failed');
                expect(result.validationErrors).toBeDefined();
                expect(result.validationErrors?.length).toBeGreaterThan(0);
                expect(vi.mocked(mockDbService.servers.updateChannelConfig)).not.toHaveBeenCalled();
            });
        });
    });
}); 