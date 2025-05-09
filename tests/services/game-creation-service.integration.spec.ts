import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { E2EPrisma, setupTestDatabaseAndTruncate } from '../setup/integration-test-setup';
import { GameCreationService, CreateGameParams } from '../../src/services/game-creation-service';
import { DatabaseService } from '../../src/database';
import { Server, User, GameSettings } from '@prisma/client';

// DatabaseService is now instantiated without arguments, relying on the mock.
const dbService = new DatabaseService();
const gameCreationService = new GameCreationService();

describe('GameCreationService - Integration Tests', () => {
    let server: Server;
    let user: User;
    let defaultSettings: GameSettings;

    beforeAll(async () => {
        await setupTestDatabaseAndTruncate();

        user = await E2EPrisma.user.create({
            data: {
                id: 'test-user-gcs',
            },
        });

        server = await E2EPrisma.server.create({
            data: {
                id: 'test-server-gcs',
                name: 'Test Server GCS',
            },
        });

        defaultSettings = await E2EPrisma.gameSettings.create({
            data: {
                id: 'default-settings-gcs',
                turnPattern: 'wd',
                writingTimeout: '300s',
                drawingTimeout: '300s',
                minTurns: 4,
                maxTurns: 10,
                returns: 'all',
            }
        });
    });

    afterEach(async () => {
        // General truncation should handle cleanup
    });

    describe('Successful Game Creation', () => {
        it('should successfully create a game with default server settings', async () => {
            const params: CreateGameParams = {
                serverId: server.id,
                userId: user.id,
            };

            const result = await gameCreationService.createGame(params, dbService);

            expect(result.success).toBe(true);
            expect(result.gameId).toBeDefined();
            expect(result.error).toBeUndefined();
            expect(result.validationErrors).toBeUndefined();
            expect(result.customSettings).toBeUndefined();

            const game = await E2EPrisma.game.findUnique({ where: { id: result.gameId } });
            expect(game).not.toBeNull();
            expect(game?.serverId).toBe(server.id);
            expect(game?.creatorId).toBe(user.id);
            expect(game?.settingsId).toBe(defaultSettings.id);

            const player = await E2EPrisma.player.findUnique({ where: { id: user.id } });
            expect(player).not.toBeNull();
        });

        it('should successfully create a game with valid custom settings', async () => {
            const customParams: CreateGameParams = {
                serverId: server.id,
                userId: user.id,
                turnPattern: 'w',
                writingTimeout: '120s',
                drawingTimeout: '180s',
                minTurns: 5,
                maxTurns: 8,
                returns: 'last',
            };

            const result = await gameCreationService.createGame(customParams, dbService);

            expect(result.success).toBe(true);
            expect(result.gameId).toBeDefined();
            expect(result.error).toBeUndefined();
            expect(result.validationErrors).toBeUndefined();
            expect(result.customSettings).toBeDefined();
            
            expect(result.customSettings?.turnPattern).toBe('w');
            expect(result.customSettings?.writingTimeout).toBe(120);
            expect(result.customSettings?.drawingTimeout).toBe(180);
            expect(result.customSettings?.minTurns).toBe(5);
            expect(result.customSettings?.maxTurns).toBe(8);
            expect(result.customSettings?.returns).toBe('last');

            const game = await E2EPrisma.game.findUnique({ where: { id: result.gameId } });
            expect(game).not.toBeNull();
            expect(game?.serverId).toBe(server.id);
            expect(game?.creatorId).toBe(user.id);
            expect(game?.settingsId).toBeDefined();
            expect(game?.settingsId).not.toBe(defaultSettings.id);

            const customGameSettings = await E2EPrisma.gameSettings.findUnique({ 
                where: { id: game?.settingsId! } 
            });
            expect(customGameSettings).not.toBeNull();
            expect(customGameSettings?.turnPattern).toBe('w');
            expect(customGameSettings?.writingTimeout).toBe('120s');
            expect(customGameSettings?.drawingTimeout).toBe('180s');
            expect(customGameSettings?.minTurns).toBe(5);
            expect(customGameSettings?.maxTurns).toBe(8);
            expect(customGameSettings?.returns).toBe('last');
        });
    });

    // More describe blocks for failure/edge cases and validation errors will go here
    describe('Failure and Edge Cases', () => {
        it('should return error if server does not exist', async () => {
            const params: CreateGameParams = {
                serverId: 'non-existent-server',
                userId: user.id,
            };

            const result = await gameCreationService.createGame(params, dbService);

            expect(result.success).toBe(false);
            expect(result.gameId).toBeUndefined();
            expect(result.error).toBe('Server needs to be set up first.');
            expect(result.validationErrors).toBeUndefined();
        });

        it('should return error if default server game settings are not configured', async () => {
            // Create a new server without default game settings
            const serverWithoutSettings = await E2EPrisma.server.create({
                data: {
                    id: 'server-no-defaults',
                    name: 'Server Without Defaults',
                },
            });

            const params: CreateGameParams = {
                serverId: serverWithoutSettings.id,
                userId: user.id,
            };

            const result = await gameCreationService.createGame(params, dbService);

            expect(result.success).toBe(false);
            expect(result.gameId).toBeUndefined();
            expect(result.error).toBe('Server game settings haven\'t been configured.');
            expect(result.validationErrors).toBeUndefined();
        });
    });

    describe('Validation Error Cases', () => {
        const baseParams: CreateGameParams = {
            serverId: 'test-server-gcs', // Assuming this server is set up in beforeAll
            userId: 'test-user-gcs',     // Assuming this user is set up in beforeAll
        };

        it('should return validation error for invalid turnPattern', async () => {
            const params = { ...baseParams, turnPattern: 'invalid-pattern!' };
            const result = await gameCreationService.createGame(params, dbService);
            expect(result.success).toBe(false);
            expect(result.validationErrors).toBeDefined();
            expect(result.validationErrors).toContain('Turn pattern: Invalid turn pattern. Allowed characters are w, d, W, D and it must be 1-10 characters long.');
        });

        it('should return validation error for invalid writingTimeout format', async () => {
            const params = { ...baseParams, writingTimeout: 'invalid-duration' };
            const result = await gameCreationService.createGame(params, dbService);
            expect(result.success).toBe(false);
            expect(result.validationErrors).toBeDefined();
            expect(result.validationErrors).toContain('Writing timeout: Invalid duration string. Must be a number followed by s, m, or h.');
        });

        it('should return validation error for invalid drawingTimeout format', async () => {
            const params = { ...baseParams, drawingTimeout: '10x' }; // Invalid unit
            const result = await gameCreationService.createGame(params, dbService);
            expect(result.success).toBe(false);
            expect(result.validationErrors).toBeDefined();
            expect(result.validationErrors).toContain('Drawing timeout: Invalid duration string. Must be a number followed by s, m, or h.');
        });

        it('should return validation error if maxTurns < minTurns', async () => {
            const params = { ...baseParams, minTurns: 10, maxTurns: 5 };
            const result = await gameCreationService.createGame(params, dbService);
            expect(result.success).toBe(false);
            expect(result.validationErrors).toBeDefined();
            // The error message comes from the .refine in the Zod schema
            expect(result.validationErrors).toContain('Maximum turns: Maximum turns must be greater than minimum turns.');
        });

        it('should return validation error if minTurns < 4', async () => {
            const params = { ...baseParams, minTurns: 3 };
            const result = await gameCreationService.createGame(params, dbService);
            expect(result.success).toBe(false);
            expect(result.validationErrors).toBeDefined();
            expect(result.validationErrors).toContain('Minimum turns: Minimum turns must be at least 4.');
        });

        // Test case for when only maxTurns is provided and it's less than the default minTurns (if applicable)
        // This depends on how defaults and individual validations interact.
        // For now, we focus on the explicit validation rules mentioned.

        it('should return multiple validation errors if multiple fields are invalid', async () => {
            const params = { 
                ...baseParams, 
                turnPattern: '$',
                minTurns: 2,
                maxTurns: 1 
            };
            const result = await gameCreationService.createGame(params, dbService);
            expect(result.success).toBe(false);
            expect(result.validationErrors).toBeDefined();
            expect(result.validationErrors).toHaveLength(3); // Expecting 3 distinct errors
            expect(result.validationErrors).toContain('Turn pattern: Invalid turn pattern. Allowed characters are w, d, W, D and it must be 1-10 characters long.');
            expect(result.validationErrors).toContain('Minimum turns: Minimum turns must be at least 4.');
            expect(result.validationErrors).toContain('Maximum turns: Maximum turns must be greater than minimum turns.');
        });
    });
}); 