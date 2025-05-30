import { ButtonInteraction, User } from 'discord.js';
import { SeasonJoinButtonHandler } from '../seasonJoinButtonHandler';
import { SeasonService } from '../../services/SeasonService';
import { PlayerService } from '../../services/PlayerService';
import prisma from '../../lib/prisma'; // Prisma is used by services
import { Logger } from '../../services'; // Logger is used
import { strings } from '../../lang/strings'; // Strings are used

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    player: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    season: {
      findUnique: jest.fn(), // Assuming SeasonService uses this
    },
    seasonPlayer: {
      findUnique: jest.fn(), // Used directly in the handler
    },
    // Add other models and methods as needed by SeasonService/PlayerService
  },
}));

// Mock services
jest.mock('../../services/SeasonService');
jest.mock('../../services/PlayerService');

// Mock Logger and strings to prevent issues if they are called
jest.mock('../../services/index.js', () => ({
    ...jest.requireActual('../../services/index.js'), // Keep other exports if any
    Logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }
}));
jest.mock('../../lang/strings.js', () => ({
    strings: {
        messages: {
            joinSeason: {
                successButton: "Successfully joined Season {seasonId}!",
                alreadyJoined: "You are already in Season {seasonId}.",
                seasonNotFound: "Season {seasonId} not found.",
                notOpen: "Season {seasonId} is not open for joining (status: {status}).",
                seasonFull: "Season {seasonId} is full.",
                errorPlayerCreateFailed: "Could not prepare your player record. Please try again.",
                genericError: "Failed to join season {seasonId}: {errorMessage}",
                genericErrorNoSeasonId: "Could not determine the season ID for joining."
            },
            // Add other string keys if used by the handler indirectly
        }
    }
}));


describe('SeasonJoinButtonHandler', () => {
    let handler: SeasonJoinButtonHandler;
    let mockInteraction: jest.Mocked<ButtonInteraction>;
    let mockSeasonService: jest.Mocked<SeasonService>;
    let mockPlayerService: jest.Mocked<PlayerService>; // PlayerService might not be directly used if SeasonService handles player logic

    const mockPrismaClient = prisma as jest.Mocked<typeof prisma>;

    beforeEach(() => {
        // Reset mocks for SeasonService and PlayerService before each test
        // This ensures that `new SeasonService()` in the handler gets the mocked version
        SeasonService.mockClear();
        PlayerService.mockClear();

        // Instantiate the mocked service that will be used by the handler
        // The actual instances created inside the handler will be this mocked one due to jest.mock
        mockSeasonService = new (SeasonService as jest.Mock<SeasonService>)(mockPrismaClient) as jest.Mocked<SeasonService>;
        // mockPlayerService = new (PlayerService as jest.Mock<PlayerService>)(mockPrismaClient) as jest.Mocked<PlayerService>;

        // Setup default mock implementations for service methods if SeasonService is used by handler
        // This needs to be done on the prototype if the handler news up the service itself.
        // Or, ensure the constructor mock returns these specific instances.
        // For this handler, SeasonService is new'd up inside. So we mock the constructor's return or methods on prototype.
        // Let's mock specific methods on the prototype that SeasonService instance would call.
        SeasonService.prototype.findSeasonById = jest.fn();
        SeasonService.prototype.addPlayerToSeason = jest.fn();

        handler = new SeasonJoinButtonHandler();

        mockInteraction = {
            customId: 'season_join_123',
            user: { id: 'user1', username: 'TestUser' } as User,
            reply: jest.fn().mockResolvedValue(undefined),
            followUp: jest.fn().mockResolvedValue(undefined), // For consistency if used
        } as unknown as jest.Mocked<ButtonInteraction>;

        // Reset Prisma mocks
        mockPrismaClient.player.findUnique.mockReset();
        mockPrismaClient.player.create.mockReset();
        mockPrismaClient.seasonPlayer.findUnique.mockReset();
    });

    it('should successfully add a player to an open season', async () => {
        mockInteraction.customId = 'season_join_1';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'playerRecord1', discordUserId: 'user1', name: 'TestUser' });
        (SeasonService.prototype.findSeasonById as jest.Mock).mockResolvedValueOnce({
            id: '1', status: 'OPEN', config: { maxPlayers: 10 }, _count: { players: 5 }
        });
        mockPrismaClient.seasonPlayer.findUnique.mockResolvedValueOnce(null); // Not in season
        (SeasonService.prototype.addPlayerToSeason as jest.Mock).mockResolvedValueOnce({ type: 'success', data: {} });

        await handler.execute(mockInteraction);

        expect(SeasonService.prototype.addPlayerToSeason).toHaveBeenCalledWith('playerRecord1', '1');
        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.successButton.replace('{seasonId}', '1'),
            ephemeral: true,
        });
    });

    it('should create player record if not exists and then add to season', async () => {
        mockInteraction.customId = 'season_join_2';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce(null); // Player not found
        mockPrismaClient.player.create.mockResolvedValueOnce({ id: 'playerRecord2', discordUserId: 'user1', name: 'TestUser' }); // Player created
        (SeasonService.prototype.findSeasonById as jest.Mock).mockResolvedValueOnce({
            id: '2', status: 'OPEN', config: { maxPlayers: 10 }, _count: { players: 5 }
        });
        mockPrismaClient.seasonPlayer.findUnique.mockResolvedValueOnce(null); // Not in season
        (SeasonService.prototype.addPlayerToSeason as jest.Mock).mockResolvedValueOnce({ type: 'success', data: {} });

        await handler.execute(mockInteraction);

        expect(mockPrismaClient.player.create).toHaveBeenCalledWith({ data: { discordUserId: 'user1', name: 'TestUser' } });
        expect(SeasonService.prototype.addPlayerToSeason).toHaveBeenCalledWith('playerRecord2', '2');
        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.successButton.replace('{seasonId}', '2'),
            ephemeral: true,
        });
    });


    it('should inform the user if they already joined the season', async () => {
        mockInteraction.customId = 'season_join_3';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'playerRecord3', discordUserId: 'user1', name: 'TestUser' });
        (SeasonService.prototype.findSeasonById as jest.Mock).mockResolvedValueOnce({
            id: '3', status: 'OPEN', config: { maxPlayers: 10 }, _count: { players: 5 }
        });
        mockPrismaClient.seasonPlayer.findUnique.mockResolvedValueOnce({ playerId: 'playerRecord3', seasonId: 3 }); // Already in season

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
        (SeasonService.prototype.findSeasonById as jest.Mock).mockResolvedValueOnce(null); // Season not found

        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.seasonNotFound.replace('{seasonId}', '4'),
            ephemeral: true,
        });
    });

    it('should inform the user if the season is not joinable (e.g., IN_PROGRESS)', async () => {
        mockInteraction.customId = 'season_join_5';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'playerRecord5', discordUserId: 'user1', name: 'TestUser' });
        (SeasonService.prototype.findSeasonById as jest.Mock).mockResolvedValueOnce({
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
        (SeasonService.prototype.findSeasonById as jest.Mock).mockResolvedValueOnce({ // Season found
            id: '6', status: 'OPEN', config: { maxPlayers: 5 }, _count: { players: 5 } // Season is full
        });
        // This check is now inside addPlayerToSeason or a new specific check in handler
        // For this test, let's assume findSeasonById is enough, and addPlayerToSeason returns 'season_full'
        mockPrismaClient.seasonPlayer.findUnique.mockResolvedValueOnce(null); // Not in season yet
        (SeasonService.prototype.addPlayerToSeason as jest.Mock).mockResolvedValueOnce({ type: 'error', key: 'season_full' });


        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.seasonFull.replace('{seasonId}', '6'),
            ephemeral: true,
        });
    });

    it('should handle errors during player record creation', async () => {
        mockInteraction.customId = 'season_join_7';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce(null); // Player not found
        mockPrismaClient.player.create.mockRejectedValueOnce(new Error("DB error creating player")); // Player creation fails

        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.errorPlayerCreateFailed || "Could not prepare your player record. Please try again.",
            ephemeral: true,
        });
    });

    it('should handle generic error from addPlayerToSeason service call', async () => {
        mockInteraction.customId = 'season_join_8';

        mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'playerRecord8', discordUserId: 'user1', name: 'TestUser' });
        (SeasonService.prototype.findSeasonById as jest.Mock).mockResolvedValueOnce({
            id: '8', status: 'OPEN', config: { maxPlayers: 10 }, _count: { players: 3 }
        });
        mockPrismaClient.seasonPlayer.findUnique.mockResolvedValueOnce(null); // Not in season
        (SeasonService.prototype.addPlayerToSeason as jest.Mock).mockResolvedValueOnce({ type: 'error', key: 'some_other_error' });

        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: `Failed to join season 8: some_other_error.`, // Based on current handler's error formatting
            ephemeral: true,
        });
    });

    it('should handle invalid seasonId format from customId', async () => {
        mockInteraction.customId = 'season_join_invalidID'; // Non-numeric part

        // No service calls should be made if customId parsing fails early
        await handler.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: strings.messages.joinSeason.genericErrorNoSeasonId,
            ephemeral: true,
        });
    });
});
