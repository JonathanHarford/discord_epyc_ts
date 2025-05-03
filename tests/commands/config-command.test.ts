import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigCommand } from '../../src/commands/chat/config-command.js';
import { ChannelType, Locale, PermissionFlagsBits } from 'discord.js';
import { 
    createMockCommandInteraction,
    createMockGuildChannel
} from '../helpers/discord-mocks.js';
import { EventData } from '../../src/models/internal-models.js';

// Mock dependencies
vi.mock('../../src/utils/index.js', () => ({
    InteractionUtils: {
        send: vi.fn().mockResolvedValue({}),
    }
}));

// Mock the database service with a simplified implementation
vi.mock('../../src/database/index.js', () => {
    return {
        DatabaseService: vi.fn().mockImplementation(() => ({
            servers: {
                getServer: vi.fn().mockResolvedValue({ id: '987654321098765432', name: 'Test Guild' }),
                getServerSettings: vi.fn().mockResolvedValue({
                    id: '987654321098765432',
                    announcementChannelId: '123456789012345678',
                    completedChannelId: null,
                    adminChannelId: null
                }),
                updateChannelConfig: vi.fn().mockResolvedValue({}),
                initializeServerSettings: vi.fn().mockResolvedValue({})
            }
        }))
    };
});

// Mock EventData with proper properties
const mockEventData = new EventData(
    Locale.EnglishUS,
    Locale.EnglishUS
);

describe('ConfigCommand', () => {
    let command: ConfigCommand;
    let mockInteraction: any;
    
    // Reset mocks before each test
    beforeEach(() => {
        vi.resetAllMocks();
        
        // Create a new command instance for each test
        command = new ConfigCommand();
        
        // Create mock interaction with admin permissions
        mockInteraction = createMockCommandInteraction({
            guild: { 
                id: '987654321098765432',
                name: 'Test Guild',
                channels: {
                    cache: new Map()
                },
                members: {
                    me: {
                        id: '987654321098765432'
                    }
                }
            },
            channelId: '123456789012345678',
            memberPermissions: {
                has: vi.fn().mockReturnValue(true) // Initially has admin perms
            },
            options: {
                getSubcommand: vi.fn().mockReturnValue('channels'),
                getChannel: vi.fn().mockReturnValue(null),
                get: vi.fn().mockReturnValue(null)
            }
        });
    });
    
    afterEach(() => {
        vi.clearAllMocks();
    });
    
    // Basic tests for execute method
    describe('execute', () => {
        it('should reject if not in a guild', async () => {
            // Mock not being in a guild
            mockInteraction.guild = null;
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            await command.execute(mockInteraction, mockEventData);
            
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                'This command can only be used in a server.'
            );
        });
        
        it('should reject if user lacks admin permissions', async () => {
            // Mock user without admin permissions
            mockInteraction.memberPermissions.has.mockReturnValue(false);
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            await command.execute(mockInteraction, mockEventData);
            
            expect(mockInteraction.memberPermissions.has).toHaveBeenCalledWith(PermissionFlagsBits.Administrator);
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                'You need administrator permissions to use this command.'
            );
        });
        
        it('should handle unknown subcommands', async () => {
            // Mock unknown subcommand
            mockInteraction.options.getSubcommand.mockReturnValue('unknown');
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            await command.execute(mockInteraction, mockEventData);
            
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                'Unknown configuration option.'
            );
        });
        
        it('should handle errors gracefully', async () => {
            // Force an error by making getSubcommand throw
            mockInteraction.options.getSubcommand.mockImplementation(() => {
                throw new Error('Test error');
            });
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            // Mock console.error to avoid cluttering test output
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            await command.execute(mockInteraction, mockEventData);
            
            expect(InteractionUtils.send).toHaveBeenCalledWith(
                mockInteraction,
                'An error occurred while configuring the server. Please try again later.'
            );
            
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
}); 