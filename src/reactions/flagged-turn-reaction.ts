import { Message, MessageReaction, User } from 'discord.js';

import { EventData } from '../models/internal-models.js';
import { Reaction } from './reaction.js';
import prisma from '../lib/prisma.js';
import { OnDemandGameService } from '../services/OnDemandGameService.js';
import { OnDemandTurnService } from '../services/OnDemandTurnService.js';
import { SchedulerService } from '../services/SchedulerService.js';

export class FlaggedTurnApprovalReaction implements Reaction {
  public emoji = '✅';
  public requireGuild = true;
  public requireSentByClient = true;
  public requireEmbedAuthorTag = false;

  private gameService: OnDemandGameService;
  private turnService: OnDemandTurnService;

  constructor(schedulerService?: SchedulerService) {
    this.gameService = new OnDemandGameService(prisma, null as any, schedulerService);
    this.turnService = new OnDemandTurnService(prisma, null as any, schedulerService);
  }

  public async execute(
    msgReaction: MessageReaction,
    msg: Message,
    reactor: User,
    _data: EventData
  ): Promise<void> {
    try {
      // Check if this is a flag notification message
      if (!this.isFlagNotificationMessage(msg)) {
        return;
      }

      // Extract turn ID from the message
      const turnId = this.extractTurnIdFromMessage(msg);
      if (!turnId) {
        console.error('Could not extract turn ID from flag notification message');
        return;
      }

      // Check if user has admin permissions
      if (!msg.guild?.members.cache.get(reactor.id)?.permissions.has('Administrator')) {
        await reactor.send('You need administrator permissions to approve flagged content.');
        return;
      }

      // Get the turn details
      const turn = await prisma.turn.findUnique({
        where: { id: turnId },
        include: {
          game: true,
          player: true
        }
      });

      if (!turn) {
        await reactor.send('Turn not found.');
        return;
      }

      if (turn.status !== 'FLAGGED') {
        await reactor.send('This turn is no longer flagged.');
        return;
      }

      // Approve the turn - change status back to COMPLETED
      await prisma.turn.update({
        where: { id: turnId },
        data: { status: 'COMPLETED' }
      });

      // Resume the game
      await prisma.game.update({
        where: { id: turn.gameId },
        data: { status: 'ACTIVE' }
      });

      // Update the message to show it was approved
      const approvalMessage = `✅ **Turn Approved by ${reactor.tag}**\n\nThe flagged turn has been approved and the game has been resumed.`;
      await msg.edit(approvalMessage);

      // Remove reactions to prevent further actions
      await msg.reactions.removeAll();

      console.log(`Turn ${turnId} approved by admin ${reactor.id}`);

    } catch (error) {
      console.error('Error in FlaggedTurnApprovalReaction:', error);
      await reactor.send('An error occurred while processing the approval.');
    }
  }

  private isFlagNotificationMessage(msg: Message): boolean {
    return msg.content.includes('**Turn Flagged for Review**') && 
           msg.content.includes('React with ✅ to approve or ❌ to reject');
  }

  private extractTurnIdFromMessage(msg: Message): string | null {
    // Look for the Turn ID pattern in the message
    const turnIdMatch = msg.content.match(/\*\*Turn ID:\*\* (\w+)/);
    if (!turnIdMatch) return null;
    
    return turnIdMatch[1];
  }
}

export class FlaggedTurnRejectionReaction implements Reaction {
  public emoji = '❌';
  public requireGuild = true;
  public requireSentByClient = true;
  public requireEmbedAuthorTag = false;

  private gameService: OnDemandGameService;
  private turnService: OnDemandTurnService;

  constructor(schedulerService?: SchedulerService) {
    this.gameService = new OnDemandGameService(prisma, null as any, schedulerService);
    this.turnService = new OnDemandTurnService(prisma, null as any, schedulerService);
  }

  public async execute(
    msgReaction: MessageReaction,
    msg: Message,
    reactor: User,
    _data: EventData
  ): Promise<void> {
    try {
      // Check if this is a flag notification message
      if (!this.isFlagNotificationMessage(msg)) {
        return;
      }

      // Extract turn ID from the message
      const turnId = this.extractTurnIdFromMessage(msg);
      if (!turnId) {
        console.error('Could not extract turn ID from flag notification message');
        return;
      }

      // Check if user has admin permissions
      if (!msg.guild?.members.cache.get(reactor.id)?.permissions.has('Administrator')) {
        await reactor.send('You need administrator permissions to reject flagged content.');
        return;
      }

      // Get the turn details
      const turn = await prisma.turn.findUnique({
        where: { id: turnId },
        include: {
          game: true,
          player: true
        }
      });

      if (!turn) {
        await reactor.send('Turn not found.');
        return;
      }

      if (turn.status !== 'FLAGGED') {
        await reactor.send('This turn is no longer flagged.');
        return;
      }

      // Reject the turn - mark as SKIPPED and terminate the game
      await prisma.turn.update({
        where: { id: turnId },
        data: { 
          status: 'SKIPPED',
          skippedAt: new Date()
        }
      });

      // Terminate the game due to inappropriate content
      await this.gameService.terminateGame(turn.gameId);

      // Update the message to show it was rejected
      const rejectionMessage = `❌ **Turn Rejected by ${reactor.tag}**\n\nThe flagged turn has been rejected and the game has been terminated due to inappropriate content.`;
      await msg.edit(rejectionMessage);

      // Remove reactions to prevent further actions
      await msg.reactions.removeAll();

      console.log(`Turn ${turnId} rejected by admin ${reactor.id}, game ${turn.gameId} terminated`);

    } catch (error) {
      console.error('Error in FlaggedTurnRejectionReaction:', error);
      await reactor.send('An error occurred while processing the rejection.');
    }
  }

  private isFlagNotificationMessage(msg: Message): boolean {
    return msg.content.includes('**Turn Flagged for Review**') && 
           msg.content.includes('React with ✅ to approve or ❌ to reject');
  }

  private extractTurnIdFromMessage(msg: Message): string | null {
    // Look for the Turn ID pattern in the message
    const turnIdMatch = msg.content.match(/\*\*Turn ID:\*\* (\w+)/);
    if (!turnIdMatch) return null;
    
    return turnIdMatch[1];
  }
} 