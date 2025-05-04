import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigCommand } from '../../src/commands/chat/config-command.js';
import { Locale, PermissionFlagsBits } from 'discord.js';
import { 
    createMockCommandInteraction
} from '../helpers/discord-mocks.js';
import { EventData } from '../../src/models/internal-models.js';

// Mock dependencies
vi.mock('../../src/utils/index.js', () => ({
    InteractionUtils: {
        send: vi.fn().mockResolvedValue({}),
    },
    DurationUtils: {
        parseDurationString: vi.fn().mockImplementation((str) => {
            // Simple mock implementation
            if (str === '1d') return 86400000; // 1 day in ms
            if (str === '2d') return 172800000; // 2 days in ms
            if (str === '3d') return 259200000; // 3 days in ms
            if (str === '7d') return 604800000; // 7 days in ms
            return 0;
        })
    },
    durationStringSchema: {
        safeParse: vi.fn().mockImplementation((str) => {
            if (str === '1d' || str === '2d' || str === '3d' || str === '7d') {
                return {
                    success: true,
                    data: {
                        value: str,
                        milliseconds: str === '1d' ? 86400000 : str === '2d' ? 172800000 : str === '3d' ? 259200000 : 604800000
                    }
                };
            }
            return { success: false, error: { format: () => ({ _errors: ['Invalid duration format'] }) } };
        })
    }
}));

// Mock database service
vi.mock('../../src/database/index.js', () => {
    // Create a mock server service
    const mockServerService = {
        getServer: vi.fn(),
        getServerSettings: vi.fn(),
        updateDefaultSeasonSettings: vi.fn(),
        initializeServerSettings: vi.fn()
    };

    return {
        DatabaseService: vi.fn().mockImplementation(() => ({
            servers: mockServerService
        }))
    };
});

// Mock EventData with proper properties
const mockEventData = new EventData(
    Locale.EnglishUS,
    Locale.EnglishUS
);

describe('ConfigCommand - Season Settings', () => {
    let command: ConfigCommand;
    let mockInteraction: any;
    let mockServerService: any;
    
    // Reset mocks before each test
    beforeEach(() => {
        vi.resetAllMocks();
        
        // Create a new command instance for each test
        command = new ConfigCommand();
        
        // Get mock database service
        mockServerService = command['dbService'].servers;
        
        // Create mock interaction with admin permissions and seasons subcommand
        mockInteraction = createMockCommandInteraction({
            guild: { 
                id: '987654321098765432',
                name: 'Test Guild'
            },
            channelId: '123456789012345678',
            memberPermissions: {
                has: vi.fn().mockReturnValue(true) // Admin perms
            },
            options: {
                getSubcommand: vi.fn().mockReturnValue('seasons'),
                getString: vi.fn(),
                getInteger: vi.fn(),
                getBoolean: vi.fn()
            }
        });
        
        // Setup default mock database responses
        mockServerService.getServer.mockResolvedValue({
            id: '987654321098765432',
            name: 'Test Guild'
        });
        
        mockServerService.getServerSettings.mockResolvedValue({
            id: '987654321098765432',
            defaultSeasonSettings: {
                id: '987654321098765432-default-season',
                openDuration: '7d',
                minPlayers: 2,
                maxPlayers: null
            }
        });
        
        mockServerService.updateDefaultSeasonSettings.mockResolvedValue({
            id: '987654321098765432-default-season',
            openDuration: '7d',
            minPlayers: 2,
            maxPlayers: null
        });
    });
    
    afterEach(() => {
        vi.clearAllMocks();
    });
    
    describe('handleSeasonsConfig', () => {
        it('should show current season settings when no options are provided', async () => {
            // Setup: No options provided
            mockInteraction.options.getString.mockReturnValue(null);
            mockInteraction.options.getInteger.mockReturnValue(null);
            
            // Act: Execute the command
            await command.execute(mockInteraction, mockEventData);
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            // Assert: Should call showCurrentSeasonSettings
            expect(mockServerService.getServerSettings).toHaveBeenCalledWith('987654321098765432');
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                expect.stringContaining('**Default season settings:**')
            );
        });
        
        it('should update open_duration setting', async () => {
            // Setup: Provide open_duration option
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'open_duration') return '3d';
                return null;
            });
            mockInteraction.options.getInteger.mockReturnValue(null);
            
            // Mock the updated settings
            mockServerService.updateDefaultSeasonSettings.mockResolvedValue({
                id: '987654321098765432-default-season',
                openDuration: '3d',
                minPlayers: 2,
                maxPlayers: null
            });
            
            // Act: Execute the command
            await command.execute(mockInteraction, mockEventData);
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            // Assert: Should update season settings
            expect(mockServerService.updateDefaultSeasonSettings).toHaveBeenCalledWith(
                '987654321098765432',
                expect.objectContaining({
                    openDuration: '3d'
                })
            );
            
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                expect.stringContaining('✅ Server default season settings updated!')
            );
        });
        
        it('should update min_players setting', async () => {
            // Setup: Provide min_players option
            mockInteraction.options.getString.mockReturnValue(null);
            mockInteraction.options.getInteger.mockImplementation((name) => {
                if (name === 'min_players') return 3;
                return null;
            });
            
            // Mock the updated settings
            mockServerService.updateDefaultSeasonSettings.mockResolvedValue({
                id: '987654321098765432-default-season',
                openDuration: '7d',
                minPlayers: 3,
                maxPlayers: null
            });
            
            // Act: Execute the command
            await command.execute(mockInteraction, mockEventData);
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            // Assert: Should update season settings
            expect(mockServerService.updateDefaultSeasonSettings).toHaveBeenCalledWith(
                '987654321098765432',
                expect.objectContaining({
                    minPlayers: 3
                })
            );
            
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                expect.stringContaining('✅ Server default season settings updated!')
            );
        });
        
        it('should update max_players setting', async () => {
            // Setup: Provide max_players option
            mockInteraction.options.getString.mockReturnValue(null);
            mockInteraction.options.getInteger.mockImplementation((name) => {
                if (name === 'max_players') return 10;
                return null;
            });
            
            // Mock the updated settings
            mockServerService.updateDefaultSeasonSettings.mockResolvedValue({
                id: '987654321098765432-default-season',
                openDuration: '7d',
                minPlayers: 2,
                maxPlayers: 10
            });
            
            // Act: Execute the command
            await command.execute(mockInteraction, mockEventData);
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            // Assert: Should update season settings
            expect(mockServerService.updateDefaultSeasonSettings).toHaveBeenCalledWith(
                '987654321098765432',
                expect.objectContaining({
                    maxPlayers: 10
                })
            );
            
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                expect.stringContaining('✅ Server default season settings updated!')
            );
        });
        
        it('should validate that max_players is greater than min_players', async () => {
            // Setup: Provide invalid max_players < min_players
            mockInteraction.options.getString.mockReturnValue(null);
            mockInteraction.options.getInteger.mockImplementation((name) => {
                if (name === 'min_players') return 5;
                if (name === 'max_players') return 3; // Less than min_players
                return null;
            });
            
            // Act: Execute the command
            await command.execute(mockInteraction, mockEventData);
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            // Assert: Should show validation error
            expect(mockServerService.updateDefaultSeasonSettings).not.toHaveBeenCalled();
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                expect.stringContaining('❌ Validation failed')
            );
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                expect.stringContaining('Maximum players must be greater than minimum players')
            );
        });
        
        it('should initialize server settings if they do not exist', async () => {
            // Setup: Server exists but no settings
            mockServerService.getServer.mockResolvedValue({
                id: '987654321098765432',
                name: 'Test Guild'
            });
            mockServerService.getServerSettings.mockResolvedValueOnce(null);
            mockServerService.getServerSettings.mockResolvedValueOnce({
                id: '987654321098765432',
                defaultSeasonSettings: {
                    id: '987654321098765432-default-season',
                    openDuration: '7d',
                    minPlayers: 2,
                    maxPlayers: null
                }
            });
            
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'open_duration') return '2d';
                return null;
            });
            mockInteraction.options.getInteger.mockReturnValue(null);
            
            mockServerService.initializeServerSettings.mockResolvedValue({
                id: '987654321098765432',
                defaultSeasonSettings: {
                    id: '987654321098765432-default-season',
                    openDuration: '7d',
                    minPlayers: 2
                }
            });
            
            // Act: Execute the command
            await command.execute(mockInteraction, mockEventData);
            
            // Assert: Should initialize server settings
            expect(mockServerService.initializeServerSettings).toHaveBeenCalledWith(
                '987654321098765432',
                'Test Guild',
                '123456789012345678'
            );
        });
        
        it('should handle server settings not found error', async () => {
            // Setup: Server exists but no settings and initialization fails
            mockServerService.getServer.mockResolvedValue({
                id: '987654321098765432',
                name: 'Test Guild'
            });
            mockServerService.getServerSettings.mockResolvedValue(null);
            mockServerService.initializeServerSettings.mockResolvedValue(null);
            
            // Act: Execute the command
            await command.execute(mockInteraction, mockEventData);
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            // Assert: Should show error message
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                'Server settings not found. Please try again later.'
            );
        });
        
        it('should handle database errors gracefully', async () => {
            // Setup: Force an error in the database service
            mockServerService.getServerSettings.mockRejectedValue(new Error('Database error'));
            
            // Mock console.error to avoid cluttering test output
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            // Act: Execute the command
            await command.execute(mockInteraction, mockEventData);
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            // Assert: Should show error message
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                'An error occurred while configuring the server. Please try again later.'
            );
            
            // Clean up
            consoleSpy.mockRestore();
        });
    });
}); 