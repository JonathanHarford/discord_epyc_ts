import { Player, PrismaClient, Season } from '@prisma/client';
import { AutocompleteInteraction, CacheType } from 'discord.js';
import { nanoid } from 'nanoid';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SeasonCommand } from '../../../src/commands/chat/season-command.js';
import { PlayerTurnService } from '../../../src/services/PlayerTurnService.js';
import { SeasonService } from '../../../src/services/SeasonService.js';
import { truncateTables } from '../../utils/testUtils.js';

// Mock the logger to prevent console output during tests
vi.mock('../../../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('SeasonCommand Autocomplete', () => {
  let prisma: PrismaClient;
  let seasonCommand: SeasonCommand;
  let testPlayer: Player;
  let testSeasons: Season[];

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });
  });

  beforeEach(async () => {
    await truncateTables(prisma);

    // Create mock services
    const mockSeasonService = {} as SeasonService;
    const mockPlayerTurnService = {} as PlayerTurnService;

    // Create the command instance
    seasonCommand = new SeasonCommand(prisma, mockSeasonService, mockPlayerTurnService);

    // Create a test player
    testPlayer = await prisma.player.create({
      data: {
        discordUserId: `test-user-${nanoid()}`,
        name: 'TestUser',
      },
    });

    // Create test seasons with different statuses
    const seasonConfigs = await Promise.all([
      prisma.seasonConfig.create({ data: { id: nanoid(), maxPlayers: 10 } }),
      prisma.seasonConfig.create({ data: { id: nanoid(), maxPlayers: 5 } }),
      prisma.seasonConfig.create({ data: { id: nanoid(), maxPlayers: 20 } }),
    ]);

    testSeasons = await Promise.all([
      // Open season user can join
      prisma.season.create({
        data: {
          id: nanoid(),
          status: 'OPEN',
          creatorId: testPlayer.id,
          configId: seasonConfigs[0].id,
        },
        include: {
          _count: { select: { players: true } },
          config: { select: { maxPlayers: true } },
          creator: { select: { name: true } },
        }
      }),
      // Setup season user is already in
      prisma.season.create({
        data: {
          id: nanoid(),
          status: 'SETUP',
          creatorId: testPlayer.id,
          configId: seasonConfigs[1].id,
          players: {
            create: {
              playerId: testPlayer.id
            }
          }
        },
        include: {
          _count: { select: { players: true } },
          config: { select: { maxPlayers: true } },
          creator: { select: { name: true } },
        }
      }),
      // Active season
      prisma.season.create({
        data: {
          id: nanoid(),
          status: 'ACTIVE',
          creatorId: testPlayer.id,
          configId: seasonConfigs[2].id,
        },
        include: {
          _count: { select: { players: true } },
          config: { select: { maxPlayers: true } },
          creator: { select: { name: true } },
        }
      }),
    ]);
  });

  afterEach(async () => {
    await truncateTables(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const createMockAutocompleteInteraction = (
    userInput: string,
    subcommand: string,
    userId: string = testPlayer.discordUserId
  ): AutocompleteInteraction<CacheType> => {
    return {
      user: { id: userId },
      options: {
        getFocused: vi.fn().mockReturnValue({ name: 'season', value: userInput }),
        getSubcommand: vi.fn().mockReturnValue(subcommand),
      },
      respond: vi.fn(),
    } as any;
  };

  describe('autocomplete for /season join', () => {
    it('should return joinable seasons when no input provided', async () => {
      const interaction = createMockAutocompleteInteraction('', 'join');
      
      const result = await seasonCommand.autocomplete(interaction, {} as any);
      
      expect(interaction.respond).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Array);
      
      // Should only include joinable seasons (OPEN/SETUP that user is not in and not full)
      const respondCall = (interaction.respond as any).mock.calls[0][0];
      expect(respondCall.length).toBeGreaterThan(0);
      
      // Check that the format is correct
      const firstOption = respondCall[0];
      expect(firstOption).toHaveProperty('name');
      expect(firstOption).toHaveProperty('value');
      expect(firstOption.name).toMatch(/^S[a-zA-Z0-9_-]{8} - @TestUser \(\d+\/\d+\) [🔧🟢]/);
    });

    it('should filter out seasons user is already in', async () => {
      const interaction = createMockAutocompleteInteraction('', 'join');
      
      await seasonCommand.autocomplete(interaction, {} as any);
      
      const respondCall = (interaction.respond as any).mock.calls[0][0];
      
      // Should not include the season the user is already in
      const seasonUserIsIn = testSeasons[1]; // SETUP season with user as participant
      const foundUserSeason = respondCall.find((option: any) => option.value === seasonUserIsIn.id);
      expect(foundUserSeason).toBeUndefined();
    });
  });

  describe('autocomplete for /season show', () => {
    it('should return user seasons first when no input provided', async () => {
      const interaction = createMockAutocompleteInteraction('', 'show');
      
      await seasonCommand.autocomplete(interaction, {} as any);
      
      const respondCall = (interaction.respond as any).mock.calls[0][0];
      expect(respondCall.length).toBeGreaterThan(0);
      
      // Should include all non-terminated seasons
      expect(respondCall.length).toBe(testSeasons.length);
    });

    it('should include user participation indicator', async () => {
      const interaction = createMockAutocompleteInteraction('', 'show');
      
      await seasonCommand.autocomplete(interaction, {} as any);
      
      const respondCall = (interaction.respond as any).mock.calls[0][0];
      
      // Find the season the user is in
      const seasonUserIsIn = testSeasons[1];
      const userSeasonOption = respondCall.find((option: any) => option.value === seasonUserIsIn.id);
      
      expect(userSeasonOption).toBeDefined();
      expect(userSeasonOption.name).toContain('👤'); // User participation indicator
    });
  });

  describe('autocomplete with search input', () => {
    it('should search by creator name', async () => {
      const interaction = createMockAutocompleteInteraction('testuser', 'show');
      
      await seasonCommand.autocomplete(interaction, {} as any);
      
      const respondCall = (interaction.respond as any).mock.calls[0][0];
      expect(respondCall.length).toBeGreaterThan(0);
      
      // All results should be from TestUser since that's what we searched for
      respondCall.forEach((option: any) => {
        expect(option.name).toContain('@TestUser');
      });
    });

    it('should search by partial season ID', async () => {
      const seasonId = testSeasons[0].id;
      const partialId = seasonId.substring(0, 4);
      
      const interaction = createMockAutocompleteInteraction(partialId, 'show');
      
      await seasonCommand.autocomplete(interaction, {} as any);
      
      const respondCall = (interaction.respond as any).mock.calls[0][0];
      
      // Should find the season with matching ID
      const foundSeason = respondCall.find((option: any) => option.value === seasonId);
      expect(foundSeason).toBeDefined();
    });

    it('should return empty array for non-matching search', async () => {
      const interaction = createMockAutocompleteInteraction('nonexistentuser', 'show');
      
      await seasonCommand.autocomplete(interaction, {} as any);
      
      const respondCall = (interaction.respond as any).mock.calls[0][0];
      expect(respondCall).toEqual([]);
    });
  });

  describe('status icons', () => {
    it('should include correct status icons', async () => {
      const interaction = createMockAutocompleteInteraction('', 'show');
      
      await seasonCommand.autocomplete(interaction, {} as any);
      
      const respondCall = (interaction.respond as any).mock.calls[0][0];
      
      // Check for status icons
      const openSeason = respondCall.find((option: any) => option.value === testSeasons[0].id);
      const setupSeason = respondCall.find((option: any) => option.value === testSeasons[1].id);
      const activeSeason = respondCall.find((option: any) => option.value === testSeasons[2].id);
      
      expect(openSeason.name).toContain('🟢'); // OPEN
      expect(setupSeason.name).toContain('🔧'); // SETUP  
      expect(activeSeason.name).toContain('🎮'); // ACTIVE
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error
      const originalFindMany = prisma.season.findMany;
      prisma.season.findMany = vi.fn().mockRejectedValue(new Error('Database error'));
      
      const interaction = createMockAutocompleteInteraction('', 'show');
      
      const result = await seasonCommand.autocomplete(interaction, {} as any);
      
      expect(interaction.respond).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
      
      // Restore original method
      prisma.season.findMany = originalFindMany;
    });
  });
}); 