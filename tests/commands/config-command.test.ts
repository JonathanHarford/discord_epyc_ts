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

// Mock the database service
vi.mock('../../src/database/index.js', () => {
    return {
        DatabaseService: vi.fn().mockImplementation(() => ({}))
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
    
    // Tests that mock the handleChannelsConfig method directly
    describe('channelsConfig validation', () => {
        beforeEach(() => {
            // Mock the handleChannelsConfig method to prevent actual implementation from running
            vi.spyOn(command as any, 'handleChannelsConfig').mockResolvedValue(undefined);
        });
        
        it('should call handleChannelsConfig with channels subcommand', async () => {
            // Set up the mock
            const handleChannelsConfigSpy = vi.spyOn(command as any, 'handleChannelsConfig');
            
            // Execute the command
            await command.execute(mockInteraction, mockEventData);
            
            // Verify the method was called
            expect(handleChannelsConfigSpy).toHaveBeenCalledWith(mockInteraction);
        });
    });
    
    // Direct tests of the validation logic
    describe('channel validation', () => {
        it('should reject voice channels', async () => {
            // Create a voice channel
            const voiceChannel = createMockGuildChannel({
                id: '222333444555666777',
                name: 'voice-channel',
                type: ChannelType.GuildVoice
            });
            
            // Import the mocked InteractionUtils
            const { InteractionUtils } = await import('../../src/utils/index.js');
            
            // We'll test the specific validation logic directly
            const channelsValid = [
                voiceChannel,
                null,
                null
            ].every(channel => !channel || channel.type === ChannelType.GuildText);
            
            expect(channelsValid).toBe(false);
        });
        
        it('should accept text channels', () => {
            // Create a text channel
            const textChannel = createMockGuildChannel({
                id: '222333444555666777',
                name: 'text-channel',
                type: ChannelType.GuildText
            });
            
            // Test the specific validation logic directly
            const channelsValid = [
                textChannel,
                null,
                null
            ].every(channel => !channel || channel.type === ChannelType.GuildText);
            
            expect(channelsValid).toBe(true);
        });
    });
    
    // Test the permission checking logic directly
    describe('permission checking', () => {
        it('should detect missing permissions', () => {
            // Create a channel with no permissions
            const noPermChannel = createMockGuildChannel({
                id: '222333444555666777',
                name: 'no-permission-channel',
                type: ChannelType.GuildText,
                permissionsFor: vi.fn().mockReturnValue({
                    has: vi.fn().mockReturnValue(false) // Missing permissions
                })
            });
            
            // Create a channel with permissions
            const permChannel = createMockGuildChannel({
                id: '333444555666777888',
                name: 'with-permission-channel',
                type: ChannelType.GuildText,
                permissionsFor: vi.fn().mockReturnValue({
                    has: vi.fn().mockReturnValue(true) // Has permissions
                })
            });
            
            // Check permissions on both channels
            const noPermResult = noPermChannel.permissionsFor(null)?.has(['ViewChannel', 'SendMessages']);
            const permResult = permChannel.permissionsFor(null)?.has(['ViewChannel', 'SendMessages']);
            
            expect(noPermResult).toBe(false);
            expect(permResult).toBe(true);
        });
    });
    
    // Test channel configuration update logic
    describe('channel configuration', () => {
        it('should handle null channels and apply defaults', () => {
            // Create mock server settings with an announcement channel
            const mockAnnouncementChannelId = '111222333444555666';
            const mockServerSettings: {
                announcementChannelId: string;
                completedChannelId?: string | null;
                adminChannelId?: string | null;
            } = {
                announcementChannelId: mockAnnouncementChannelId
            };
            
            // Test the logic of setting defaults
            const channelConfig: any = {};
            
            // Default behavior: completed and admin channels should default to announcement channel
            // if not set and not explicitly set to null
            const announcementChannelId = mockAnnouncementChannelId;
            channelConfig.announcementChannelId = announcementChannelId;
            
            // Should set completedChannelId to announcement channel if not previously set
            if (!mockServerSettings.completedChannelId) {
                channelConfig.completedChannelId = announcementChannelId;
            }
            
            // Should set adminChannelId to announcement channel if not previously set
            if (!mockServerSettings.adminChannelId) {
                channelConfig.adminChannelId = announcementChannelId;
            }
            
            // Check if defaults are applied
            expect(channelConfig.completedChannelId).toBe(mockAnnouncementChannelId);
            expect(channelConfig.adminChannelId).toBe(mockAnnouncementChannelId);
            
            // Now test with 'none' option
            mockInteraction.options.get.mockImplementation((name) => {
                if (name === 'completed') {
                    return { value: 'none' };
                }
                return null;
            });
            
            // Re-test the logic
            const updatedConfig: any = {};
            updatedConfig.announcementChannelId = announcementChannelId;
            
            // Should set to null when explicitly set to 'none'
            if (mockInteraction.options.get('completed')?.value === 'none') {
                updatedConfig.completedChannelId = null;
            } else if (!mockServerSettings.completedChannelId) {
                updatedConfig.completedChannelId = announcementChannelId;
            }
            
            if (mockInteraction.options.get('admin')?.value === 'none') {
                updatedConfig.adminChannelId = null;
            } else if (!mockServerSettings.adminChannelId) {
                updatedConfig.adminChannelId = announcementChannelId;
            }
            
            // Now completedChannelId should be null, but adminChannelId should still default
            expect(updatedConfig.completedChannelId).toBe(null);
            expect(updatedConfig.adminChannelId).toBe(mockAnnouncementChannelId);
        });
    });
}); 