import { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChatInputCommandInteraction, 
    PermissionsString 
} from 'discord.js';

import { interpolate, strings } from '../../lang/strings.js';
import prisma from '../../lib/prisma.js';
import { EventData } from '../../models/internal-models.js';
import { Logger } from '../../services/index.js';
import { PlayerService } from '../../services/PlayerService.js';
import { SchedulerService } from '../../services/SchedulerService.js';
import { SeasonTurnService } from '../../services/SeasonTurnService.js';
import { FormatUtils } from '../../utils/format-utils.js';
import { getSeasonTimeouts } from '../../utils/seasonConfig.js';
import { Command, CommandDeferType } from '../command.js';

export class ReadyCommand implements Command {
    public names = ['ready'];
    public deferType = CommandDeferType.HIDDEN; // Use ephemeral responses
    public requireClientPerms: PermissionsString[] = [];

    private playerService: PlayerService;
    private turnService: SeasonTurnService;
    private schedulerService: SchedulerService;

    constructor() {
        this.playerService = new PlayerService(prisma);
        this.turnService = new SeasonTurnService(prisma, null as any); // DiscordClient will be set in execute
        this.schedulerService = new SchedulerService(prisma);
    }

    public async execute(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        try {
            // Set the Discord client for the turn service
            (this.turnService as any).discordClient = intr.client;

            Logger.info(`Processing /ready command from ${intr.user.tag} (${intr.user.id}) in guild ${intr.guild?.id}`);
            
            // 1. Find the player by Discord user ID
            const player = await this.playerService.getPlayerByDiscordId(intr.user.id);
            if (!player) {
                await intr.editReply({
                    content: strings.messages.ready.playerNotFound
                });
                return;
            }

            // 2. Find turns currently OFFERED to this player
            const offeredTurns = await this.turnService.getTurnsForPlayer(player.id, 'OFFERED');
            
            if (offeredTurns.length === 0) {
                // Add status check button when no turns are offered
                const actionRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('status_check')
                            .setLabel('Check My Status')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📊')
                    );

                await intr.editReply({
                    content: strings.messages.ready.noOfferedTurns,
                    components: [actionRow]
                });
                return;
            }

            // 3. Check if player already has a PENDING turn (can't claim multiple)
            const pendingTurns = await this.turnService.getTurnsForPlayer(player.id, 'PENDING');
            if (pendingTurns.length > 0) {
                // Show the pending turn information with action buttons
                const pendingTurn = pendingTurns[0];
                const timeouts = await getSeasonTimeouts(prisma, pendingTurn.id);
                const submissionTimeoutMinutes = pendingTurn.type === 'WRITING' 
                    ? timeouts.writingTimeoutMinutes 
                    : timeouts.drawingTimeoutMinutes;
                
                // Get the previous turn content for context
                const previousTurn = await prisma.turn.findFirst({
                    where: {
                        gameId: pendingTurn.gameId,
                        turnNumber: pendingTurn.turnNumber - 1,
                        status: 'COMPLETED'
                    }
                });
                
                // Calculate submission timeout expiration time
                const submissionTimeoutDate = new Date(pendingTurn.updatedAt.getTime() + submissionTimeoutMinutes * 60 * 1000);
                
                // Create appropriate message based on turn type
                let message: string;
                if (pendingTurn.type === 'WRITING') {
                    message = interpolate(strings.messages.ready.claimSuccessWriting, {
                        previousTurnImage: previousTurn?.imageUrl || '[Previous image not found]',
                        submissionTimeoutFormatted: FormatUtils.formatRemainingTime(submissionTimeoutDate)
                    });
                } else {
                    message = interpolate(strings.messages.ready.claimSuccessDrawing, {
                        previousTurnWriting: previousTurn?.textContent || '[Previous text not found]',
                        submissionTimeoutFormatted: FormatUtils.formatRemainingTime(submissionTimeoutDate)
                    });
                }

                // Add action buttons for turn submission
                const actionRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`turn_submit_${pendingTurn.id}`)
                            .setLabel('Submit Turn')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`turn_status_${pendingTurn.id}`)
                            .setLabel('View Status')
                            .setStyle(ButtonStyle.Secondary)
                    );

                await intr.editReply({
                    content: `${strings.messages.ready.alreadyHasPendingTurn}\n\n${message}`,
                    components: [actionRow]
                });
                return;
            }

            // 4. Show offered turns with claim buttons
            if (offeredTurns.length === 1) {
                // Single turn - show claim button
                const turnToClaim = offeredTurns[0];
                
                const actionRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`turn_claim_${turnToClaim.id}`)
                            .setLabel('Claim Turn')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`turn_dismiss_${turnToClaim.id}`)
                            .setLabel('Dismiss')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('status_check')
                            .setLabel('Check Status')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📊')
                    );

                await intr.editReply({
                    content: `🎨 You have a turn waiting to be claimed! Click the button below to claim it.`,
                    components: [actionRow]
                });
            } else {
                // Multiple turns - show selection buttons
                const actionRows: ActionRowBuilder<ButtonBuilder>[] = [];
                let currentRow = new ActionRowBuilder<ButtonBuilder>();
                
                for (let i = 0; i < offeredTurns.length && i < 10; i++) { // Discord limit of 25 components, 5 per row
                    const turn = offeredTurns[i];
                    
                    if (currentRow.components.length >= 5) {
                        actionRows.push(currentRow);
                        currentRow = new ActionRowBuilder<ButtonBuilder>();
                    }
                    
                    currentRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`turn_claim_${turn.id}`)
                            .setLabel(`Claim Turn ${i + 1}`)
                            .setStyle(ButtonStyle.Success)
                    );
                }
                
                if (currentRow.components.length > 0) {
                    actionRows.push(currentRow);
                }

                // Add status check button as a separate row
                const statusRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('status_check')
                            .setLabel('Check My Status')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📊')
                    );
                actionRows.push(statusRow);

                await intr.editReply({
                    content: `🎨 You have ${offeredTurns.length} turns waiting! Choose which one to claim:`,
                    components: actionRows
                });
            }

            Logger.info(`Successfully processed /ready command for player ${player.id} (${intr.user.tag}), showing ${offeredTurns.length} offered turns`);
        } catch (error) {
            Logger.error('Error in ReadyCommand.execute:', error);
            
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            await intr.editReply({
                content: `❌ An error occurred while processing your ready command: ${errorMessage}`
            }).catch(err => Logger.error('Failed to send error reply:', err));
        }
    }
} 