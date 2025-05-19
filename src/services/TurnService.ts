import { PrismaClient, Game, Player, Turn, Prisma } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';
import { nanoid } from 'nanoid';
// TODO: Import LangService if used for messages
// TODO: Import TaskSchedulerService if scheduling claim timeouts

export class TurnService {
  private prisma: PrismaClient;
  private discordClient: DiscordClient;
  // private langService: LangService; // Uncomment if used
  // private taskSchedulerService: TaskSchedulerService; // Uncomment if used

  constructor(
    prisma: PrismaClient,
    discordClient: DiscordClient,
    // langService: LangService, // Uncomment if used
    // taskSchedulerService: TaskSchedulerService // Uncomment if used
  ) {
    this.prisma = prisma;
    this.discordClient = discordClient;
    // this.langService = langService; // Uncomment if used
    // this.taskSchedulerService = taskSchedulerService; // Uncomment if used
  }

  /**
   * Creates an initial turn for a game, offers it to a player, and sends a DM.
   * @param game The game for which to offer the turn.
   * @param player The player to whom the turn is offered.
   * @param seasonId The ID of the season this game belongs to (for context in DM).
   * @returns An object indicating success or failure, with the created turn or an error message.
   */
  async offerInitialTurn(
    game: Game,
    player: Player,
    seasonId: string
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      // For now, assume 'WRITING' or get from a default/config.
      // TODO: Determine initial turn type based on game/season config if available.
      const initialTurnType: Prisma.TurnCreateInput['type'] = 'WRITING';

      const newTurn = await this.prisma.turn.create({
        data: {
          id: nanoid(),
          gameId: game.id,
          playerId: player.id,
          turnNumber: 1, // Initial turn
          status: 'OFFERED',
          type: initialTurnType,
          // expiresAt: // TODO: Set if scheduling claim timeout (integrates with Task 14/15 for scheduler)
          // content: // No content for an offered turn
          // nextTurnId: // Not applicable for initial turn
        },
      });

      try {
        const user = await this.discordClient.users.fetch(player.discordUserId);
        if (user) {
          // TODO: Replace with LangService/MessagingLayer for robust message construction and i18n.
          // TODO: Include actual claim timeout duration in the message.
          const claimTimeoutInfo = "a limited time"; // Placeholder
          await user.send(
            `It's your first turn in game \`${game.id}\` for season \`${seasonId}\`!\n` +
            `The turn type is: **${initialTurnType}**.\n` +
            `Please type \`/ready\` in this DM to claim your turn. You have ${claimTimeoutInfo} to claim it.`
          );
          console.log(`Successfully sent initial turn offer DM to player ${player.id} (${player.discordUserId}) for game ${game.id}, turn ${newTurn.id}`);
        } else {
          console.error(`Could not find Discord user with ID ${player.discordUserId} (Player internal ID: ${player.id}) to send initial turn offer for game ${game.id}.`);
          // The turn is still created and offered. Admin/system might need alerting.
        }
      } catch (dmError) {
        console.error(`Failed to send initial turn offer DM to player ${player.id} (${player.discordUserId}) for game ${game.id}:`, dmError);
        // Log error, but proceed as turn is programmatically offered.
      }
      
      // TODO: Schedule claim timeout using TaskSchedulerService (relates to Task 14/15)
      // Example: this.taskSchedulerService.scheduleTurnClaimTimeout(newTurn.id, configuredClaimDuration);

      return { success: true, turn: newTurn };
    } catch (error) {
      console.error(`Error in TurnService.offerInitialTurn for game ${game.id}, player ${player.id}:`, error);
      let errorMessage = 'Unknown error occurred while offering the initial turn.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      // Consider if Prisma errors need specific handling here
      return { success: false, error: errorMessage };
    }
  }

  // TODO: Implement other TurnService methods as per Task 9, 11, 12, 13, 14, 16, 17, 18
  // - claimTurn(turnId, playerId)
  // - submitTurn(turnId, playerId, content)
  // - dismissOffer(turnId)
  // - skipTurn(turnId)
  // - offerNextTurn(gameId)
  // - etc.
} 