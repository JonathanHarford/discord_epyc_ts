import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DevCommand } from '../../src/commands/chat/dev-command.js';
import { Locale } from 'discord.js';
import { 
    createMockCommandInteraction
} from '../helpers/discord-mocks.js';
import { EventData } from '../../src/models/internal-models.js';

// Mock dependencies
vi.mock('../../src/utils/index.js', () => ({
    InteractionUtils: {
        send: vi.fn().mockResolvedValue({}),
    },
    FormatUtils: {
        fileSize: vi.fn().mockImplementation(size => `${size} bytes`),
    },
    ShardUtils: {
        serverCount: vi.fn().mockResolvedValue(10),
    }
}));

// Mock configuration to include test developer ID
vi.mock('node:module', () => ({
    createRequire: () => () => ({
        developers: ['123456789012345678']
    })
}));

// Import mocked utilities directly (not using vi.importMock)
import { InteractionUtils } from '../../src/utils/index.js';

// Mock database service
vi.mock('../../src/database/index.js', () => {
    // Create a mock server service
    const mockServerService = {
        getServer: vi.fn(),
        getServerSettings: vi.fn(),
        updateTestMode: vi.fn()
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

describe('DevCommand - testmode', () => {
    let command: DevCommand;
    let mockInteraction: any;
    let mockServerService: any;
    
    // Reset mocks before each test
    beforeEach(() => {
        vi.resetAllMocks();
        
        // Create a new command instance for each test
        command = new DevCommand();
        
        // Get mock database service
        mockServerService = command['dbService'].servers;
        
        // Create mock interaction with developer permissions
        mockInteraction = createMockCommandInteraction({
            user: { 
                id: '123456789012345678' // Developer ID matching the mocked config
            },
            options: {
                getSubcommand: vi.fn().mockReturnValue('testmode'),
                getString: vi.fn().mockImplementation((name, required) => {
                    if (name === 'server_id') return '987654321098765432';
                    return null;
                })
            }
        });
        
        // Setup default mock database responses
        mockServerService.getServer.mockResolvedValue({
            id: '987654321098765432',
            name: 'Test Guild'
        });
        
        mockServerService.updateTestMode.mockResolvedValue({
            id: '987654321098765432',
            testMode: true
        });
    });
    
    afterEach(() => {
        vi.clearAllMocks();
    });
    
    it('should reject non-developer users', async () => {
        // Setup: Change user ID to non-developer
        mockInteraction.user.id = '999999999999999999';
        
        // Act: Execute the command
        await command.execute(mockInteraction, mockEventData);
        
        // Assert: Should reject with proper message
        expect(InteractionUtils.send).toHaveBeenCalledTimes(1);
        expect(mockServerService.getServer).not.toHaveBeenCalled();
        expect(mockServerService.updateTestMode).not.toHaveBeenCalled();
    });
    
    it('should toggle test mode to true when current value is false', async () => {
        // Setup: Current test mode is false
        mockServerService.updateTestMode.mockResolvedValue({
            id: '987654321098765432',
            testMode: true // Toggled to true
        });
        
        // Act: Execute the command
        await command.execute(mockInteraction, mockEventData);
        
        // Assert: Should call updateTestMode and show success message
        expect(mockServerService.getServer).toHaveBeenCalledWith('987654321098765432');
        expect(mockServerService.updateTestMode).toHaveBeenCalledWith('987654321098765432');
        expect(InteractionUtils.send).toHaveBeenCalledWith(
            mockInteraction,
            expect.stringContaining('Test mode enabled')
        );
    });
    
    it('should toggle test mode to false when current value is true', async () => {
        // Setup: Current test mode is true
        mockServerService.updateTestMode.mockResolvedValue({
            id: '987654321098765432',
            testMode: false // Toggled to false
        });
        
        // Act: Execute the command
        await command.execute(mockInteraction, mockEventData);
        
        // Assert: Should call updateTestMode and show success message
        expect(mockServerService.getServer).toHaveBeenCalledWith('987654321098765432');
        expect(mockServerService.updateTestMode).toHaveBeenCalledWith('987654321098765432');
        expect(InteractionUtils.send).toHaveBeenCalledWith(
            mockInteraction,
            expect.stringContaining('Test mode disabled')
        );
    });
    
    it('should handle server not found in database', async () => {
        // Setup: Server does not exist
        mockServerService.getServer.mockResolvedValue(null);
        
        // Act: Execute the command
        await command.execute(mockInteraction, mockEventData);
        
        // Assert: Should show error message
        expect(mockServerService.getServer).toHaveBeenCalledWith('987654321098765432');
        expect(mockServerService.updateTestMode).not.toHaveBeenCalled();
        expect(InteractionUtils.send).toHaveBeenCalledWith(
            mockInteraction,
            expect.stringContaining('Server with ID')
        );
        expect(InteractionUtils.send).toHaveBeenCalledWith(
            mockInteraction,
            expect.stringContaining('not found in database')
        );
    });
    
    it('should handle database errors', async () => {
        // Setup: Force an error in the database service
        mockServerService.updateTestMode.mockRejectedValue(new Error('Database error'));
        
        // Mock console.error to avoid cluttering test output
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        // Act: Execute the command
        await command.execute(mockInteraction, mockEventData);
        
        // Assert: Should show error message
        expect(mockServerService.getServer).toHaveBeenCalledWith('987654321098765432');
        expect(mockServerService.updateTestMode).toHaveBeenCalledWith('987654321098765432');
        expect(InteractionUtils.send).toHaveBeenCalledWith(
            mockInteraction,
            expect.stringContaining('Failed to toggle test mode')
        );
        
        // Clean up
        consoleSpy.mockRestore();
    });
}); 