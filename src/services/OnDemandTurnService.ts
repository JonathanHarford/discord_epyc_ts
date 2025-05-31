import { Game, GameConfig, Player, PrismaClient, Turn } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';
import { DateTime } from 'luxon';
import { nanoid } from 'nanoid';

import { ChannelConfigService } from './ChannelConfigService.js';
import { TurnTimeoutService } from './interfaces/TurnTimeoutService.js';
import { SchedulerService } from './SchedulerService.js';
import { interpolate, strings } from '../lang/strings.js';
import { parseDuration } from '../utils/datetime.js';

export class OnDemandTurnService implements TurnTimeoutService {
  private prisma: PrismaClient;
  private discordClient: DiscordClient;
  private schedulerService?: SchedulerService;
  private channelConfigService: ChannelConfigService;

  constructor(
    prisma: PrismaClient,
    discordClient: DiscordClient,
    schedulerService?: SchedulerService
  ) {
    this.prisma = prisma;
    this.discordClient = discordClient;
    this.schedulerService = schedulerService;
    this.channelConfigService = new ChannelConfigService(prisma);
  }

  /**
   * Creates the initial turn for a new on-demand game
   * @param game The game to create the initial turn for
   * @param creator The player who created the game
   * @returns Success status and turn details
   */
  async createInitialTurn(
    game: Game & { config: GameConfig },
    creator: Player
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      // Determine the first turn type based on turn pattern
      const turnPattern = game.config.turnPattern.split(',');
      const firstTurnType = turnPattern[0].toUpperCase();

      const turn = await this.prisma.turn.create({
        data: {
          id: nanoid(),
          turnNumber: 1,
          type: firstTurnType,
          status: 'PENDING', // Creator immediately gets the turn
          gameId: game.id,
          playerId: creator.id,
          claimedAt: new Date(),
        },
      });

      // Send DM to creator asking for their turn
      await this.sendTurnRequestDM(turn, creator, null);

      // Schedule timeout for this turn
      if (this.schedulerService) {
        await this.scheduleTurnTimeout(turn, game.config);
      }

      console.log(`Initial turn created for game ${game.id}, assigned to creator ${creator.id}`);
      return { success: true, turn };

    } catch (error) {
      console.error(`Error creating initial turn for game ${game.id}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Creates the next turn in an on-demand game
   * @param game The game to create the turn for
   * @param previousTurn The previous turn that was just completed
   * @returns Success status and turn details
   */
  async createNextTurn(
    game: Game & { config: GameConfig },
    previousTurn: Turn
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      // Determine next turn type based on turn pattern
      const turnPattern = game.config.turnPattern.split(',');
      const currentTypeIndex = turnPattern.findIndex(type => 
        type.toUpperCase() === previousTurn.type
      );
      const nextTypeIndex = (currentTypeIndex + 1) % turnPattern.length;
      const nextTurnType = turnPattern[nextTypeIndex].toUpperCase();

      // Check if we've hit max turns
      if (game.config.maxTurns && previousTurn.turnNumber >= game.config.maxTurns) {
        console.log(`Game ${game.id} has reached max turns (${game.config.maxTurns})`);
        return { success: false, error: 'Game has reached maximum turns' };
      }

      const turn = await this.prisma.turn.create({
        data: {
          id: nanoid(),
          turnNumber: previousTurn.turnNumber + 1,
          type: nextTurnType,
          status: 'AVAILABLE', // Will be assigned when a player joins
          gameId: game.id,
          previousTurnId: previousTurn.id,
        },
      });

      console.log(`Next turn created for game ${game.id}, turn number ${turn.turnNumber}`);
      return { success: true, turn };

    } catch (error) {
      console.error(`Error creating next turn for game ${game.id}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Assigns an available turn to a player who used /game play
   * @param turnId The ID of the turn to assign
   * @param playerId The ID of the player to assign it to
   * @returns Success status and turn details
   */
  async assignTurn(
    turnId: string,
    playerId: string
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      const turn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { 
          game: { include: { config: true } },
          previousTurn: true,
          player: true
        }
      });

      if (!turn) {
        return { success: false, error: 'Turn not found' };
      }

      if (turn.status !== 'AVAILABLE') {
        return { success: false, error: 'Turn is not available for assignment' };
      }

      const player = await this.prisma.player.findUnique({
        where: { id: playerId }
      });

      if (!player) {
        return { success: false, error: 'Player not found' };
      }

      // Update turn to assign it to the player
      const updatedTurn = await this.prisma.turn.update({
        where: { id: turnId },
        data: {
          status: 'PENDING',
          playerId: playerId,
          claimedAt: new Date(),
        },
        include: {
          game: { include: { config: true } },
          previousTurn: true,
          player: true
        }
      });

      // Update game's last activity
      await this.prisma.game.update({
        where: { id: turn.gameId },
        data: { lastActivityAt: new Date() }
      });

      // Send DM to player with turn request
      await this.sendTurnRequestDM(updatedTurn, player, turn.previousTurn);

      // Schedule timeout for this turn
      if (this.schedulerService && turn.game?.config) {
        await this.scheduleTurnTimeout(updatedTurn, turn.game.config);
      }

      console.log(`Turn ${turnId} assigned to player ${playerId}`);
      return { success: true, turn: updatedTurn };

    } catch (error) {
      console.error(`Error assigning turn ${turnId} to player ${playerId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Submits a turn with content (text or image)
   * @param turnId The ID of the turn to submit
   * @param playerId The ID of the player submitting
   * @param content The content (text for writing, image URL for drawing)
   * @param contentType The type of content ('text' or 'image')
   * @returns Success status and turn details
   */
  async submitTurn(
    turnId: string,
    playerId: string,
    content: string,
    contentType: 'text' | 'image'
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      const turn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { 
          game: { include: { config: true } },
          player: true
        }
      });

      if (!turn) {
        return { success: false, error: 'Turn not found' };
      }

      if (turn.status !== 'PENDING') {
        return { success: false, error: 'Turn is not pending submission' };
      }

      if (turn.playerId !== playerId) {
        return { success: false, error: 'Turn is not assigned to this player' };
      }

      // Validate content type matches turn type
      if (turn.type === 'WRITING' && contentType !== 'text') {
        return { success: false, error: 'Writing turns require text content' };
      }

      if (turn.type === 'DRAWING' && contentType !== 'image') {
        return { success: false, error: 'Drawing turns require image content' };
      }

      // Update turn with content
      const updatedTurn = await this.prisma.turn.update({
        where: { id: turnId },
        data: {
          status: 'COMPLETED',
          ...(contentType === 'text' ? { textContent: content } : { imageUrl: content }),
          completedAt: new Date(),
        },
        include: {
          game: { include: { config: true } },
          player: true
        }
      });

      // Update game's last activity
      await this.prisma.game.update({
        where: { id: turn.gameId },
        data: { lastActivityAt: new Date() }
      });

      // Cancel the timeout job for this turn
      if (this.schedulerService) {
        const timeoutJobId = `turn-timeout-${turnId}`;
        await this.schedulerService.cancelJob(timeoutJobId);
      }

      // Send confirmation to player
      await this.sendTurnCompletionConfirmation(updatedTurn, turn.player!);

      console.log(`Turn ${turnId} submitted by player ${playerId}`);
      return { success: true, turn: updatedTurn };

    } catch (error) {
      console.error(`Error submitting turn ${turnId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Flags a turn as inappropriate
   * @param turnId The ID of the turn to flag
   * @param flaggerId The ID of the player flagging the turn
   * @returns Success status
   */
  async flagTurn(
    turnId: string,
    flaggerId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const turn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { 
          game: true,
          player: true
        }
      });

      if (!turn) {
        return { success: false, error: 'Turn not found' };
      }

      if (turn.status !== 'COMPLETED') {
        return { success: false, error: 'Only completed turns can be flagged' };
      }

      // Update turn status to flagged
      await this.prisma.turn.update({
        where: { id: turnId },
        data: { status: 'FLAGGED' }
      });

      // Pause the game
      await this.prisma.game.update({
        where: { id: turn.gameId },
        data: { status: 'PAUSED' }
      });

      // Send notification to admin channel
      await this.sendFlagNotification(turn, flaggerId);

      console.log(`Turn ${turnId} flagged by player ${flaggerId}`);
      return { success: true };

    } catch (error) {
      console.error(`Error flagging turn ${turnId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Dismisses an offered turn, making it available again
   * For on-demand games, this unassigns a turn and makes it available
   * @param turnId The ID of the turn to dismiss/unassign
   * @returns Success status with optional turn data or error message
   */
  async dismissOffer(turnId: string): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      const turn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { 
          game: true,
          player: true
        }
      });

      if (!turn) {
        return { success: false, error: 'Turn not found' };
      }

      if (turn.status !== 'PENDING') {
        return { success: false, error: 'Turn is not in pending state' };
      }

      // Update turn to make it available again and clear player assignment
      const updatedTurn = await this.prisma.turn.update({
        where: { id: turnId },
        data: {
          status: 'AVAILABLE',
          playerId: null,
          claimedAt: null,
        },
        include: {
          game: true,
          player: true
        }
      });

      console.log(`Turn ${turnId} offer dismissed, status reverted to AVAILABLE`);
      return { success: true, turn: updatedTurn };

    } catch (error) {
      console.error(`Error dismissing turn offer ${turnId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Skips a turn due to timeout
   * @param turnId The ID of the turn to skip
   * @returns Success status with optional turn data or error message
   */
  async skipTurn(turnId: string): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      const turn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { 
          game: { include: { config: true } },
          player: true
        }
      });

      if (!turn) {
        return { success: false, error: 'Turn not found' };
      }

      if (turn.status !== 'PENDING') {
        return { success: false, error: 'Turn is not pending' };
      }

      // Update turn to skipped
      const updatedTurn = await this.prisma.turn.update({
        where: { id: turnId },
        data: {
          status: 'SKIPPED',
          skippedAt: new Date(),
        },
        include: {
          game: true,
          player: true
        }
      });

      // Send notification to player
      if (turn.player) {
        await this.sendTurnSkippedNotification(turn, turn.player);
      }

      console.log(`Turn ${turnId} skipped due to timeout`);
      return { success: true, turn: updatedTurn };

    } catch (error) {
      console.error(`Error skipping turn ${turnId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Sends a DM to a player requesting their turn
   */
  private async sendTurnRequestDM(
    turn: Turn,
    player: Player,
    previousTurn: Turn | null
  ): Promise<void> {
    try {
      const user = await this.discordClient.users.fetch(player.discordUserId);
      
      // Get the game config to determine timeout
      const game = await this.prisma.game.findUnique({
        where: { id: turn.gameId },
        include: { config: true }
      });

      if (!game?.config) {
        console.error(`Game config not found for turn ${turn.id}`);
        return;
      }

      // Calculate timeout in minutes
      const timeoutDuration = turn.type === 'WRITING' 
        ? game.config.writingTimeout 
        : game.config.drawingTimeout;
      
      const luxonDuration = parseDuration(timeoutDuration);
      const timeoutMinutes = luxonDuration ? Math.floor(luxonDuration.as('minutes')) : 1440; // Default to 24 hours
      
      let message = '';
      if (turn.type === 'WRITING') {
        if (previousTurn?.imageUrl) {
          message = `It's your turn! Write a sentence or phrase describing this image:\n\n[Type your response directly in this DM]\n[To flag this turn as inappropriate, type "flag"]\n\n⏰ You have **${timeoutMinutes} minutes** to submit before your turn is automatically skipped.`;
          // TODO: Send the image from previousTurn.imageUrl
        } else {
          message = `You've started a new game! Please write a starting sentence or phrase.\n\n⏰ You have **${timeoutMinutes} minutes** to submit before your turn is automatically skipped.`;
        }
      } else if (turn.type === 'DRAWING') {
        if (previousTurn?.textContent) {
          message = `It's your turn! Draw an illustration based on this sentence:\n"${previousTurn.textContent}"\n\n[Attach your drawing as an image file in this DM]\n[To flag this turn as inappropriate, type "flag"]\n\n⏰ You have **${timeoutMinutes} minutes** to submit before your turn is automatically skipped.`;
        }
      }

      await user.send(message);
      
    } catch (error) {
      console.error(`Error sending turn request DM to player ${player.id}:`, error);
    }
  }

  /**
   * Sends a confirmation DM when a turn is completed
   */
  private async sendTurnCompletionConfirmation(turn: Turn, player: Player): Promise<void> {
    try {
      const user = await this.discordClient.users.fetch(player.discordUserId);
      await user.send(`Thanks! Your turn has been recorded. I'll notify you when the game is completed.`);
    } catch (error) {
      console.error(`Error sending completion confirmation to player ${player.id}:`, error);
    }
  }

  /**
   * Sends a notification when a turn is skipped
   */
  private async sendTurnSkippedNotification(turn: Turn, player: Player): Promise<void> {
    try {
      const user = await this.discordClient.users.fetch(player.discordUserId);
      await user.send(`Your turn has timed out. The game will now be available for another player.`);
    } catch (error) {
      console.error(`Error sending skip notification to player ${player.id}:`, error);
    }
  }

  /**
   * Sends a flag notification to the admin channel
   */
  private async sendFlagNotification(turn: Turn & { game: Game; player: Player | null }, flaggerId: string): Promise<void> {
    try {
      if (!turn.game?.guildId) {
        console.log(`Turn ${turn.id} has no guild ID, skipping flag notification`);
        return;
      }

      // Get the admin channel from config
      const adminChannelId = await this.channelConfigService.getAdminChannelId(turn.game.guildId);
      if (!adminChannelId) {
        console.log(`No admin channel configured for guild ${turn.game.guildId}, skipping flag notification`);
        return;
      }

      // Get the channel
      const channel = await this.discordClient.channels.fetch(adminChannelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`Admin channel ${adminChannelId} not found or not text-based`);
        return;
      }

      // Get flagger information
      const flagger = await this.prisma.player.findUnique({
        where: { id: flaggerId }
      });

      // Create the message content directly
      const messageContent = interpolate(strings.messages.ondemand.turnFlagged, {
        turnId: turn.id,
        gameId: turn.gameId,
        turnNumber: turn.turnNumber,
        turnType: turn.type,
        flaggerName: flagger?.name || flagger?.discordUserId || 'Unknown',
        flaggerId: flaggerId,
        turnContent: turn.textContent || '[Image content]',
        playerName: turn.player?.name || turn.player?.discordUserId || 'Unknown'
      });

      // Send the message directly to the channel (cast to text-based channel)
      const sentMessage = await (channel as any).send({ content: messageContent });

      // Add reaction buttons for admin approval/rejection
      try {
        await sentMessage.react('✅'); // Approve
        await sentMessage.react('❌'); // Reject
      } catch (error) {
        console.error(`Error adding reactions to flag notification for turn ${turn.id}:`, error);
      }

      console.log(`Flag notification sent to admin channel ${adminChannelId} for turn ${turn.id}`);

    } catch (error) {
      console.error(`Error sending flag notification for turn ${turn.id}:`, error);
    }
  }

  /**
   * Schedules a timeout job for a turn
   */
  private async scheduleTurnTimeout(turn: Turn, config: GameConfig): Promise<void> {
    if (!this.schedulerService) return;

    try {
      const timeoutDuration = turn.type === 'WRITING' 
        ? config.writingTimeout 
        : config.drawingTimeout;
      
      const warningDuration = turn.type === 'WRITING'
        ? config.writingWarning
        : config.drawingWarning;
      
      const luxonTimeoutDuration = parseDuration(timeoutDuration);
      const luxonWarningDuration = parseDuration(warningDuration);
      
      if (!luxonTimeoutDuration || luxonTimeoutDuration.as('milliseconds') <= 0) {
        console.warn(`Invalid timeout duration for turn ${turn.id}: ${timeoutDuration}`);
        return;
      }

      // Schedule warning job if warning duration is valid and less than timeout duration
      if (luxonWarningDuration && luxonWarningDuration.as('milliseconds') > 0) {
        const warningTime = DateTime.now().plus(luxonTimeoutDuration).minus(luxonWarningDuration).toJSDate();
        
        // Only schedule warning if it's in the future
        if (warningTime.getTime() > Date.now()) {
          const warningJobId = `turn-warning-${turn.id}`;

          await this.schedulerService.scheduleJob(
            warningJobId,
            warningTime,
            async () => {
              console.log(`Turn warning job running for turn ${turn.id}`);
              await this.sendTurnWarning(turn.id);
            },
            { turnId: turn.id },
            'turn-warning'
          );

          console.log(`Scheduled warning for turn ${turn.id} at ${warningTime.toISOString()}`);
        }
      }

      // Schedule main timeout job
      const timeoutTime = DateTime.now().plus(luxonTimeoutDuration).toJSDate();
      const jobId = `turn-timeout-${turn.id}`;

      await this.schedulerService.scheduleJob(
        jobId,
        timeoutTime,
        async () => {
          console.log(`Turn timeout job running for turn ${turn.id}`);
          await this.skipTurn(turn.id);
        },
        { turnId: turn.id },
        'turn-timeout'
      );

      console.log(`Scheduled timeout for turn ${turn.id} at ${timeoutTime.toISOString()}`);

    } catch (error) {
      console.error(`Error scheduling timeout for turn ${turn.id}:`, error);
    }
  }

  /**
   * Sends a warning DM to a player about their upcoming turn timeout
   */
  public async sendTurnWarning(turnId: string): Promise<void> {
    try {
      const turn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { 
          player: true,
          game: { include: { config: true } }
        }
      });

      if (!turn || !turn.player || !turn.game?.config) {
        console.error(`Turn, player, or config not found for warning ${turnId}`);
        return;
      }

      // Only send warning if turn is still pending
      if (turn.status !== 'PENDING') {
        console.log(`Turn ${turnId} is no longer pending, skipping warning`);
        return;
      }

      const user = await this.discordClient.users.fetch(turn.player.discordUserId);
      
      const warningDuration = turn.type === 'WRITING' 
        ? turn.game.config.writingWarning 
        : turn.game.config.drawingWarning;
      
      const luxonWarningDuration = parseDuration(warningDuration);
      const warningMinutes = luxonWarningDuration ? Math.floor(luxonWarningDuration.as('minutes')) : 1;
      
      const message = `⚠️ **Turn Timeout Warning** ⚠️\n\nYour turn will timeout in **${warningMinutes} minute${warningMinutes !== 1 ? 's' : ''}**! Please submit your ${turn.type.toLowerCase()} turn soon to avoid being skipped.`;
      
      await user.send(message);
      console.log(`Warning sent to player ${turn.player.id} for turn ${turnId}`);
      
    } catch (error) {
      console.error(`Error sending turn warning for turn ${turnId}:`, error);
    }
  }
} 