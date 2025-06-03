import { User } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SeasonJoinButtonHandler } from '../../src/handlers/seasonJoinButtonHandler.js';
import { strings } from '../../src/lang/strings.js';
import prisma from '../../src/lib/prisma.js';
import { SeasonService } from '../../src/services/SeasonService.js';

// Mock Prisma
vi.mock('../../src/lib/prisma', () => ({
  default: {
    player: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    season: {
      findUnique: vi.fn(), // Assuming SeasonService uses this
    },
    playersOnSeasons: {
      findUnique: vi.fn(), // Used directly in the handler
    },
    // Add other models and methods as needed by SeasonService/PlayerService
  },
}));

// Mock services
vi.mock('../../src/services/SeasonService');
vi.mock('../../src/services/PlayerService');

// Mock Logger and strings to prevent issues if they are called
vi.mock('../../src/services/index.js', () => ({
    Logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }
}));
vi.mock('../../src/lang/strings.js', () => ({
    strings: {
        messages: {
            joinSeason: {
                successButton: 'Successfully joined Season {seasonId}!',
                alreadyJoined: 'You are already in Season {seasonId}.',
                seasonNotFound: 'Season {seasonId} not found.',
                notOpen: 'Season {seasonId} is not open for joining (status: {status}).',
                seasonFull: 'Season {seasonId} is full.',
                errorPlayerCreateFailed: 'Could not prepare your player record. Please try again.',
                genericError: 'Failed to join season {seasonId}: {errorMessage}',
                genericErrorNoSeasonId: 'Could not determine the season ID for joining.'
            },
            season: {
                joinSuccess: 'You have successfully joined **{seasonId}**!\nThe season will start in {timeRemaining}, or once {playersNeeded} more players join!',
                joinSuccessPlayersNeeded: 'You have successfully joined **{seasonId}**!\nThe game will start when {playersNeeded} more players have joined.',
                joinSuccessTimeRemaining: 'You have successfully joined **{seasonId}**!\nThe game will start in {timeRemaining}.'
            }
        }
    },
    interpolate: vi.fn((template, data) => {
        let result = template;
        for (const [key, value] of Object.entries(data || {})) {
            result = result.replace(new RegExp(`{${key}}`, 'g'), String(value));
        }
        return result;
    })
}));


describe('SeasonJoinButtonHandler', () => {
    let handler: SeasonJoinButtonHandler;
    let mockInteraction: any;

    const mockPrismaClient = prisma as any;

    beforeEach(() => {
        // Reset mocks for SeasonService and PlayerService before each test
        vi.clearAllMocks();

        // Setup default mock implementations for service methods if SeasonService is used by handler
        SeasonService.prototype.findSeasonById = vi.fn();
        SeasonService.prototype.addPlayerToSeason = vi.fn();

        handler = new SeasonJoinButtonHandler();

        mockInteraction = {
            customId: 'season_join_123',
            user: { id: 'user1', username: 'TestUser' } as User,
            reply: vi.fn().mockResolvedValue(undefined),
            followUp: vi.fn().mockResolvedValue(undefined), // For consistency if used
        };

        // Reset Prisma mocks
        mockPrismaClient.player.findUnique.mockReset();
        mockPrismaClient.player.create.mockReset();
        mockPrismaClient.playersOnSeasons.findUnique.mockReset();
    });

    it('should successfully add a player to an open season', async () => {
        mockInteraction.customId = 'season_join_1';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'playerRecord1', discordUserId: 'user1', name: 'TestUser' });
        (SeasonService.prototype.findSeasonById as any).mockResolvedValueOnce({
            id: '1', status: 'OPEN', config: { maxPlayers: 10 }, _count: { players: 5 }
        });
        mockPrismaClient.playersOnSeasons.findUnique.mockResolvedValueOnce(null); // Not in season
        (SeasonService.prototype.addPlayerToSeason as any).mockResolvedValueOnce({ 
            type: 'success', 
            key: 'messages.season.joinSuccess',
            data: { 
                seasonId: '1', 
                currentPlayers: 6, 
                maxPlayers: 10, 
                timeRemaining: '2 hours', 
                playersNeeded: 4 
            } 
        });

        await handler.execute(mockInteraction);

        expect(SeasonService.prototype.addPlayerToSeason).toHaveBeenCalledWith('playerRecord1', '1');
        // The handler should use the enhanced message with interpolation
        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: expect.stringContaining('successfully joined'),
            ephemeral: true,
        });
    });

    it('should create player record if not exists and then add to season', async () => {
        mockInteraction.customId = 'season_join_2';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce(null); // Player not found
        mockPrismaClient.player.create.mockResolvedValueOnce({ id: 'playerRecord2', discordUserId: 'user1', name: 'TestUser' }); // Player created
        (SeasonService.prototype.findSeasonById as any).mockResolvedValueOnce({
            id: '2', status: 'OPEN', config: { maxPlayers: 10 }, _count: { players: 5 }
        });
        mockPrismaClient.playersOnSeasons.findUnique.mockResolvedValueOnce(null); // Not in season
        (SeasonService.prototype.addPlayerToSeason as any).mockResolvedValueOnce({ 
            type: 'success', 
            key: 'messages.season.joinSuccessPlayersNeeded',
            data: { 
                seasonId: '2', 
                currentPlayers: 6, 
                maxPlayers: 10, 
                playersNeeded: 4 
            } 
        });

        await handler.execute(mockInteraction);

        expect(mockPrismaClient.player.create).toHaveBeenCalledWith({ data: { discordUserId: 'user1', name: 'TestUser' } });
        expect(SeasonService.prototype.addPlayerToSeason).toHaveBeenCalledWith('playerRecord2', '2');
        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: expect.stringContaining('successfully joined'),
            ephemeral: true,
        });
    });


    it('should inform the user if they already joined the season', async () => {
        mockInteraction.customId = 'season_join_3';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'playerRecord3', discordUserId: 'user1', name: 'TestUser' });
        (SeasonService.prototype.findSeasonById as any).mockResolvedValueOnce({
            id: '3', status: 'OPEN', config: { maxPlayers: 10 }, _count: { players: 5 }
        });
        mockPrismaClient.playersOnSeasons.findUnique.mockResolvedValueOnce({ playerId: 'playerRecord3', seasonId: 3 }); // Already in season

        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.alreadyJoined.replace('{seasonId}', '3'),
            ephemeral: true,
        });
        expect(SeasonService.prototype.addPlayerToSeason).not.toHaveBeenCalled();
    });

    it('should inform the user if the season is not found', async () => {
        mockInteraction.customId = 'season_join_4';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'playerRecord4', discordUserId: 'user1', name: 'TestUser' });
        (SeasonService.prototype.findSeasonById as any).mockResolvedValueOnce(null); // Season not found

        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.seasonNotFound.replace('{seasonId}', '4'),
            ephemeral: true,
        });
    });

    it('should inform the user if the season is not joinable (e.g., IN_PROGRESS)', async () => {
        mockInteraction.customId = 'season_join_5';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'playerRecord5', discordUserId: 'user1', name: 'TestUser' });
        (SeasonService.prototype.findSeasonById as any).mockResolvedValueOnce({
            id: '5', status: 'IN_PROGRESS', config: { maxPlayers: 10 }, _count: { players: 5 }
        });

        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.notOpen.replace('{seasonId}', '5').replace('{status}', 'IN_PROGRESS'),
            ephemeral: true,
        });
    });

    it('should inform the user if the season is full', async () => {
        mockInteraction.customId = 'season_join_6';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'playerRecord6', discordUserId: 'user1', name: 'TestUser' });
        (SeasonService.prototype.findSeasonById as any).mockResolvedValueOnce({ // Season found
            id: '6', status: 'OPEN', config: { maxPlayers: 5 }, _count: { players: 5 } // Season is full
        });
        // This check is now inside addPlayerToSeason or a new specific check in handler
        // For this test, let's assume findSeasonById is enough, and addPlayerToSeason returns 'season_full'
        mockPrismaClient.playersOnSeasons.findUnique.mockResolvedValueOnce(null); // Not in season yet
        (SeasonService.prototype.addPlayerToSeason as any).mockResolvedValueOnce({ type: 'error', key: 'season_full' });


        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.seasonFull.replace('{seasonId}', '6'),
            ephemeral: true,
        });
    });

    it('should handle errors during player record creation', async () => {
        mockInteraction.customId = 'season_join_7';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce(null); // Player not found
        mockPrismaClient.player.create.mockRejectedValueOnce(new Error('DB error creating player')); // Player creation fails

        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.errorPlayerCreateFailed || 'Could not prepare your player record. Please try again.',
            ephemeral: true,
        });
    });

    it('should handle generic error from addPlayerToSeason service call', async () => {
        mockInteraction.customId = 'season_join_8';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'playerRecord8', discordUserId: 'user1', name: 'TestUser' });
        (SeasonService.prototype.findSeasonById as any).mockResolvedValueOnce({
            id: '8', status: 'OPEN', config: { maxPlayers: 10 }, _count: { players: 3 }
        });
        mockPrismaClient.playersOnSeasons.findUnique.mockResolvedValueOnce(null); // Not in season
        (SeasonService.prototype.addPlayerToSeason as any).mockResolvedValueOnce({ type: 'error', key: 'some_other_error' });

        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: `Failed to join season 8: some_other_error.`, // Based on current handler's error formatting
            ephemeral: true,
        });
    });

    it('should handle invalid seasonId format from customId', async () => {
        mockInteraction.customId = 'season_join_   '; // Empty/whitespace seasonId

        // No service calls should be made if customId parsing fails early
        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.genericErrorNoSeasonId,
            ephemeral: true,
        });
    });

    it('should handle valid nanoid seasonId format', async () => {
        mockInteraction.customId = 'season_join_public-papers-warn'; // Valid nanoid string

        mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'playerRecord9', discordUserId: 'user1', name: 'TestUser' });
        (SeasonService.prototype.findSeasonById as any).mockResolvedValueOnce({
            id: 'public-papers-warn', status: 'OPEN', config: { maxPlayers: 10 }, _count: { players: 5 }
        });
        mockPrismaClient.playersOnSeasons.findUnique.mockResolvedValueOnce(null); // Not in season
        (SeasonService.prototype.addPlayerToSeason as any).mockResolvedValueOnce({ 
            type: 'success', 
            key: 'messages.season.joinSuccessTimeRemaining',
            data: { 
                seasonId: 'public-papers-warn', 
                currentPlayers: 6, 
                maxPlayers: 10, 
                timeRemaining: '30 minutes' 
            } 
        });

        await handler.execute(mockInteraction);

        expect(SeasonService.prototype.addPlayerToSeason).toHaveBeenCalledWith('playerRecord9', 'public-papers-warn');
        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: expect.stringContaining('successfully joined'),
            ephemeral: true,
        });
    });
});
