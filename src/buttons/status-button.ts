import { ButtonInteraction } from 'discord.js';

import { ButtonHandler } from '../handlers/buttonHandler.js';
import { strings } from '../lang/strings.js';
import { Logger } from '../services/index.js';
import { PlayerService } from '../services/PlayerService.js';
import { PlayerTurnService } from '../services/PlayerTurnService.js';

/**
 * Button handler for player status check interactions
 * Provides ephemeral status information about a player's current turns and game state
 */
export class StatusButton implements ButtonHandler {
    public customIdPrefix = 'status_check';

    constructor(
        private playerService: PlayerService,
        private playerTurnService: PlayerTurnService
    ) {}

    public async execute(intr: ButtonInteraction): Promise<void> {
        try {
            Logger.info(`Processing status check from ${intr.user.tag} (${intr.user.id})`);
            
            // 1. Find the player by Discord user ID
            const player = await this.playerService.getPlayerByDiscordId(intr.user.id);
            if (!player) {
                await intr.reply({
                    content: strings.messages.ready.playerNotFound,
                    ephemeral: true
                });
                return;
            }

            // 2. Check for pending turns
            const pendingCheck = await this.playerTurnService.checkPlayerPendingTurns(intr.user.id);
            
            if (pendingCheck.error) {
                await intr.reply({
                    content: 'Failed to check your turn status. Please try again.',
                    ephemeral: true
                });
                return;
            }

            // 3. Get all pending turns for detailed status
            const pendingTurnsResult = await this.playerTurnService.getPlayerPendingTurns(intr.user.id);
            
            if (pendingTurnsResult.error) {
                await intr.reply({
                    content: 'Failed to check your turn status. Please try again.',
                    ephemeral: true
                });
                return;
            }

            // 4. Format status response
            let statusMessage = `**Player Status for ${player.name}**\n\n`;
            
            if (pendingTurnsResult.pendingTurns.length === 0) {
                statusMessage += '✅ No pending turns - you\'re all caught up!\n';
                statusMessage += 'You can join a new season or start an on-demand game.';
            } else {
                statusMessage += `⏳ You have ${pendingTurnsResult.pendingTurns.length} pending turn(s):\n\n`;
                
                for (const turn of pendingTurnsResult.pendingTurns) {
                    const gameType = turn.game.season ? 'Season' : 'On-Demand Game';
                    const gameIdentifier = turn.game.season 
                        ? `Season ${turn.game.season.id}` 
                        : `Game started ${turn.game.createdAt.toLocaleDateString()}`;
                    
                    const creatorInfo = turn.game.creator 
                        ? ` (by ${turn.game.creator.name})` 
                        : '';
                    
                    const turnStatus = turn.status === 'OFFERED' ? '🔔 Offered' : '⏰ In Progress';
                    const turnType = turn.type === 'WRITING' ? '✍️ Writing' : '🎨 Drawing';
                    
                    statusMessage += `• ${turnStatus} ${turnType} turn in ${gameType}: ${gameIdentifier}${creatorInfo}\n`;
                }
                
                statusMessage += '\nPlease complete your pending turns before joining new games.';
            }

            await intr.reply({
                content: statusMessage,
                ephemeral: true
            });

            Logger.info(`Successfully processed status check for player ${player.id} (${intr.user.tag})`);
        } catch (error) {
            Logger.error(`Error processing status check for user ${intr.user.id}:`, error);
            
            await intr.reply({
                content: 'An error occurred while checking your status. Please try again.',
                ephemeral: true
            }).catch(e => Logger.error('Failed to send error response:', e));
        }
    }
} 