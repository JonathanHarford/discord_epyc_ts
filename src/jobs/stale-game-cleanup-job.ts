import { PrismaClient } from '@prisma/client';

import { Job } from './job.js';
import { Logger } from '../services/index.js';
import { OnDemandGameService } from '../services/OnDemandGameService.js';

export class StaleGameCleanupJob extends Job {
  public name = 'Stale Game Cleanup';
  public log = true;
  public schedule = '*/5 * * * *'; // Run every 5 minutes
  
  private prisma: PrismaClient;
  private gameService: OnDemandGameService;

  constructor(prisma: PrismaClient, gameService: OnDemandGameService) {
    super();
    this.prisma = prisma;
    this.gameService = gameService;
  }

  public async run(): Promise<void> {
    try {
      Logger.info('Starting stale game cleanup job...');

      // Find all active on-demand games
      const activeGames = await this.prisma.game.findMany({
        where: {
          seasonId: null, // Only on-demand games
          status: {
            in: ['PENDING', 'ACTIVE']
          }
        },
        include: {
          config: true,
          turns: {
            orderBy: { turnNumber: 'asc' }
          }
        }
      });

      let completedCount = 0;

      for (const game of activeGames) {
        if (!game.config) {
          Logger.warn(`Game ${game.id} has no config, skipping stale check`);
          continue;
        }

        // Check if game should be completed
        const completionCheck = await this.gameService.checkGameCompletion(game.id);
        
        if (completionCheck.shouldComplete) {
          Logger.info(`Completing stale game ${game.id}: ${completionCheck.reason}`);
          
          const result = await this.gameService.completeGame(game.id);
          if (result.success) {
            completedCount++;
            Logger.info(`Successfully completed stale game ${game.id}`);
          } else {
            Logger.error(`Failed to complete stale game ${game.id}: ${result.error}`);
          }
        }
      }

      if (completedCount > 0) {
        Logger.info(`Stale game cleanup completed: ${completedCount} games completed out of ${activeGames.length} checked`);
      } else {
        Logger.info(`Stale game cleanup completed: No stale games found out of ${activeGames.length} checked`);
      }

    } catch (error) {
      Logger.error('Error in stale game cleanup job:', error);
      throw error; // Re-throw to mark job as failed
    }
  }
} 