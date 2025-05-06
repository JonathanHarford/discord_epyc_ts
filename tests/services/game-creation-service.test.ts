import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameCreationService, CreateGameParams } from '../../src/services/game-creation-service.js';
import { DatabaseService } from '../../src/database/index.js';

// Mock the database services but don't mock the validation logic
vi.mock('../../src/database/index.js', () => {
    return {
        DatabaseService: vi.fn().mockImplementation(() => ({
            players: {
                ensurePlayer: vi.fn().mockResolvedValue(undefined)
            },
            servers: {
                getServer: vi.fn().mockImplementation((serverId) => {
                    // Return a valid server for our test serverId
                    if (serverId === 'test-server') {
                        return Promise.resolve({ id: 'test-server' });
                    }
                    // Return null for nonexistent server
                    return Promise.resolve(null);
                })
            },
            games: {
                getDefaultGameSettings: vi.fn().mockResolvedValue({
                    id: 'test-settings',
                    turnPattern: 'writing,drawing',
                    writingTimeout: '5m',
                    drawingTimeout: '5m',
                    minTurns: 4,
                    maxTurns: 10,
                    returns: '2/3'
                }),
                createGame: vi.fn().mockImplementation((serverId, userId, settingsId, customSettings) => {
                    return Promise.resolve({
                        id: 'test-game-id',
                        serverId,
                        creatorId: userId,
                        status: 'setup',
                        settings: customSettings ? {
                            ...customSettings
                        } : {
                            turnPattern: 'writing,drawing',
                            writingTimeout: '5m',
                            drawingTimeout: '5m',
                            minTurns: 4,
                            maxTurns: 10,
                            returns: '2/3'
                        }
                    });
                })
            }
        }))
    };
});

describe('GameCreationService', () => {
    let gameCreationService: GameCreationService;
    let mockDbService: DatabaseService;
    
    beforeEach(() => {
        gameCreationService = new GameCreationService();
        mockDbService = new DatabaseService();
        
        // Reset mock implementation for specific test cases
        vi.mocked(mockDbService.servers.getServer).mockImplementation((serverId) => {
            if (serverId === 'test-server') {
                return Promise.resolve({ id: 'test-server' });
            }
            return Promise.resolve(null);
        });
    });
    
    it('should successfully create a game with default settings', async () => {
        // Parameters for game creation with defaults
        const params: CreateGameParams = {
            serverId: 'test-server',
            userId: 'test-user'
        };
        
        // Call the service
        const result = await gameCreationService.createGame(params, mockDbService);
        
        // Assertions
        expect(result.success).toBe(true);
        expect(result.gameId).toBe('test-game-id');
        expect(result.customSettings).toBeUndefined();
        
        // Verify correct methods were called
        expect(mockDbService.players.ensurePlayer).toHaveBeenCalledWith('test-user');
        expect(mockDbService.servers.getServer).toHaveBeenCalledWith('test-server');
        expect(mockDbService.games.getDefaultGameSettings).toHaveBeenCalledWith('test-server');
        expect(mockDbService.games.createGame).toHaveBeenCalledWith(
            'test-server',
            'test-user',
            'test-settings',
            undefined
        );
    });
    
    it('should create a game with custom settings', async () => {
        // Parameters with custom settings
        const params: CreateGameParams = {
            serverId: 'test-server',
            userId: 'test-user',
            turnPattern: 'drawing,writing',
            writingTimeout: '10m',
            drawingTimeout: '15m',
            minTurns: 6,
            maxTurns: 12
        };
        
        // Call the service
        const result = await gameCreationService.createGame(params, mockDbService);
        
        // Assertions
        expect(result.success).toBe(true);
        expect(result.gameId).toBe('test-game-id');
        expect(result.customSettings).toBeDefined();
        expect(result.customSettings?.turnPattern).toBe('drawing,writing');
        expect(result.customSettings?.writingTimeout).toBe('10m');
        expect(result.customSettings?.drawingTimeout).toBe('15m');
        expect(result.customSettings?.minTurns).toBe(6);
        expect(result.customSettings?.maxTurns).toBe(12);
    });
    
    it('should fail when server does not exist', async () => {
        // Parameters with non-existent server
        const params: CreateGameParams = {
            serverId: 'nonexistent-server',
            userId: 'test-user'
        };
        
        // Call the service
        const result = await gameCreationService.createGame(params, mockDbService);
        
        // Assertions
        expect(result.success).toBe(false);
        expect(result.error).toBe('Server needs to be set up first.');
        expect(mockDbService.games.createGame).not.toHaveBeenCalled();
    });
    
    it('should fail validation for invalid settings', async () => {
        // Parameters with invalid settings
        const params: CreateGameParams = {
            serverId: 'test-server',
            userId: 'test-user',
            turnPattern: 'invalid-pattern', // Invalid turn pattern
            minTurns: 2, // Too low
            maxTurns: 1  // Lower than min turns
        };
        
        // Call the service
        const result = await gameCreationService.createGame(params, mockDbService);
        
        // Assertions
        expect(result.success).toBe(false);
        expect(result.error).toBe('Validation failed');
        expect(result.validationErrors).toBeDefined();
        expect(result.validationErrors?.length).toBe(2);
        expect(mockDbService.games.createGame).not.toHaveBeenCalled();
        
        // Check for specific validation errors
        if (result.validationErrors) {
            // Should have turn pattern error with specific message
            expect(result.validationErrors).toContain(
                'Turn pattern: Turn pattern must include both "writing" and "drawing" terms separated by commas'
            );
            
            // Should have min turns error with specific message
            expect(result.validationErrors).toContain(
                'Minimum turns: Minimum turns must be at least 4.'
            );
        }
    });
}); 