import { PrismaClient } from '@prisma/client';
import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';

import { gameCommandData } from './game-command-data.js';
import { strings } from '../../lang/strings.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { EventData } from '../../models/internal-models.js';
import { OnDemandGameService } from '../../services/OnDemandGameService.js';
import { OnDemandTurnService } from '../../services/OnDemandTurnService.js';
import { PlayerTurnService } from '../../services/PlayerTurnService.js';
import { Command, CommandDeferType } from '../command.js';

export class GameCommand implements Command {
    public names = [gameCommandData.name];
    public data = gameCommandData;
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = ['SendMessages'];

    private prisma: PrismaClient;
    private onDemandGameService: OnDemandGameService;
    private onDemandTurnService: OnDemandTurnService;
    private playerTurnService: PlayerTurnService;

    constructor(
        prisma: PrismaClient, 
        onDemandGameService: OnDemandGameService,
        onDemandTurnService: OnDemandTurnService,
        playerTurnService: PlayerTurnService
    ) {
        this.prisma = prisma;
        this.onDemandGameService = onDemandGameService;
        this.onDemandTurnService = onDemandTurnService;
        this.playerTurnService = playerTurnService;
    }

    public async execute(interaction: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'new':
                await this.handleNewCommand(interaction, data);
                break;
            case 'play':
                await this.handlePlayCommand(interaction, data);
                break;
            case 'list':
                await this.handleListCommand(interaction, data);
                break;
            case 'show':
                await this.handleShowCommand(interaction, data);
                break;
            default:
                await SimpleMessage.sendError(interaction, 'Command not implemented yet.', {}, true);
                return;
        }
    }

    private async handleNewCommand(interaction: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        console.log(`[GameCommand] Executing /game new command for user: ${interaction.user.id}, username: ${interaction.user.username}`);
        
        try {
            // Check if user has pending turns before allowing them to start a new game
            const pendingCheck = await this.playerTurnService.checkPlayerPendingTurns(interaction.user.id);
            
            if (pendingCheck.error) {
                await SimpleMessage.sendError(interaction, 'Failed to check your turn status. Please try again.', {}, true);
                return;
            }

            if (pendingCheck.hasPendingTurn && pendingCheck.pendingTurn) {
                const turn = pendingCheck.pendingTurn;
                const gameType = turn.game.season ? 'seasonal' : 'on-demand';
                const gameIdentifier = turn.game.season 
                    ? `Season ${turn.game.season.id}` 
                    : `Game started on ${new Date(turn.game.createdAt).toLocaleDateString()}`;
                
                const creatorInfo = turn.game.creator 
                    ? ` by @${turn.game.creator.name}` 
                    : '';

                await SimpleMessage.sendError(
                    interaction,
                    `You have a pending turn waiting for you in ${gameType} game (${gameIdentifier}${creatorInfo}). Please complete your current turn before starting a new game.`,
                    {},
                    true
                );
                return;
            }

            // Create a new on-demand game
            const result = await this.onDemandGameService.createGame(
                interaction.user.id,
                interaction.guildId!
            );

            if (!result.success) {
                await SimpleMessage.sendError(interaction, result.error || 'Failed to create game', {}, true);
                return;
            }

            // Send public announcement
            await SimpleMessage.sendInfo(
                interaction, 
                `<@${interaction.user.id}> has started a new game!`,
                {},
                false // Not ephemeral - public announcement
            );

            console.log(`[GameCommand] Successfully created game ${result.game?.id} for user ${interaction.user.id}`);

        } catch (error) {
            console.error('Error in /game new command:', error);
            await SimpleMessage.sendError(interaction, strings.messages.common.errorCriticalCommand, {}, true);
        }
    }

    private async handlePlayCommand(interaction: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        console.log(`[GameCommand] Executing /game play command for user: ${interaction.user.id}, username: ${interaction.user.username}`);
        
        try {
            // Check if user has pending turns before allowing them to join a game
            const pendingCheck = await this.playerTurnService.checkPlayerPendingTurns(interaction.user.id);
            
            if (pendingCheck.error) {
                await SimpleMessage.sendError(interaction, 'Failed to check your turn status. Please try again.', {}, true);
                return;
            }

            if (pendingCheck.hasPendingTurn && pendingCheck.pendingTurn) {
                const turn = pendingCheck.pendingTurn;
                const gameType = turn.game.season ? 'seasonal' : 'on-demand';
                const gameIdentifier = turn.game.season 
                    ? `Season ${turn.game.season.id}` 
                    : `Game started on ${new Date(turn.game.createdAt).toLocaleDateString()}`;
                
                const creatorInfo = turn.game.creator 
                    ? ` by @${turn.game.creator.name}` 
                    : '';

                await SimpleMessage.sendError(
                    interaction,
                    `You have a pending turn waiting for you in ${gameType} game (${gameIdentifier}${creatorInfo}). Please complete your current turn before joining another game.`,
                    {},
                    true
                );
                return;
            }

            // Find and join the best available game
            const result = await this.onDemandGameService.joinGame(
                interaction.user.id,
                interaction.guildId!
            );

            if (!result.success) {
                await SimpleMessage.sendError(interaction, result.error || 'Failed to join game', {}, true);
                return;
            }

            // Send public announcement
            await SimpleMessage.sendInfo(
                interaction,
                `<@${interaction.user.id}> has joined the game${result.game ? ` started by <@${result.game.creatorId}>` : ''}!`,
                {},
                false // Not ephemeral - public announcement
            );

            console.log(`[GameCommand] Successfully joined game ${result.game?.id} for user ${interaction.user.id}`);

        } catch (error) {
            console.error('Error in /game play command:', error);
            await SimpleMessage.sendError(interaction, strings.messages.common.errorCriticalCommand, {}, true);
        }
    }

    private async handleListCommand(interaction: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        console.log(`[GameCommand] Executing /game list command for user: ${interaction.user.id}, username: ${interaction.user.username}`);
        
        try {
            // Get games categorized by player participation
            const result = await this.onDemandGameService.listGamesByPlayerParticipation(interaction.user.id, interaction.guildId!);

            if (!result.success) {
                await SimpleMessage.sendError(interaction, result.error || 'Failed to list games', {}, true);
                return;
            }

            const haventPlayed = result.haventPlayed || [];
            const havePlayed = result.havePlayed || [];
            const finished = result.finished || [];

            // Format "You haven't played" section
            const haventPlayedText = haventPlayed.length === 0 
                ? '' 
                : haventPlayed.map(game => {
                    const createdDate = new Date(game.createdAt).toISOString().split('T')[0];
                    const creatorName = game.creator?.name || 'Unknown';
                    return `@${creatorName} ${createdDate}`;
                }).join('\n');

            // Format "You've played" section
            const havePlayedText = havePlayed.length === 0 
                ? '' 
                : havePlayed.map(game => {
                    const createdDate = new Date(game.createdAt).toISOString().split('T')[0];
                    const creatorName = game.creator?.name || 'Unknown';
                    const completedTurns = game.turns.filter(turn => turn.status === 'COMPLETED');
                    const turnCount = completedTurns.length;
                    return `@${creatorName} ${createdDate} (${turnCount} turns)`;
                }).join('\n');

            // Format "Finished" section
            const finishedText = finished.length === 0 
                ? '' 
                : finished.map(game => {
                    const createdDate = new Date(game.createdAt).toISOString().split('T')[0];
                    const creatorName = game.creator?.name || 'Unknown';
                    const completedTurns = game.turns.filter(turn => turn.status === 'COMPLETED');
                    const turnCount = completedTurns.length;
                    return `@${creatorName} ${createdDate} (${turnCount} turns)`;
                }).join('\n');

            // Build the response message
            let message = '';
            
            if (haventPlayedText) {
                message += `**You haven't played:**\n${haventPlayedText}\n\n`;
            }
            
            if (havePlayedText) {
                message += `**You've played:**\n${havePlayedText}\n\n`;
            }
            
            if (finishedText) {
                message += `**Finished:**\n${finishedText}`;
            }

            // If no games at all, show a helpful message
            if (!message.trim()) {
                message = 'No games found. Use `/game new` to start a new game!';
            }

            await SimpleMessage.sendInfo(interaction, message.trim(), {}, true); // Ephemeral - personal info

        } catch (error) {
            console.error('Error in /game list command:', error);
            await SimpleMessage.sendError(interaction, strings.messages.common.errorCriticalCommand, {}, true);
        }
    }

    private async handleShowCommand(interaction: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        console.log(`[GameCommand] Executing /game show command for user: ${interaction.user.id}, username: ${interaction.user.username}`);
        const gameId = interaction.options.getString('id', true);
        console.log(`[GameCommand] Received game ID: ${gameId}`);

        try {
            // Get game details
            const gameDetails = await this.onDemandGameService.getGameDetails(gameId);

            if (!gameDetails) {
                await SimpleMessage.sendError(interaction, `Game #${gameId} not found.`, {}, true);
                return;
            }

            // Format game information
            const createdDate = new Date(gameDetails.createdAt).toISOString().split('T')[0];

            // Get turn count and current turn info
            const totalTurns = gameDetails.turns.length;
            const completedTurns = gameDetails.turns.filter(t => t.status === 'COMPLETED').length;

            // Format the response
            let response = `**Game #${gameId} - ${gameDetails.status}**\n`;
            response += `**Players:** ${totalTurns > 0 ? 'Active' : 'None'}\n`;
            response += `**Created:** ${createdDate}\n`;
            response += `**Turns:** ${completedTurns}/${totalTurns}\n`;
            
            if (gameDetails.config) {
                response += `**Rules:**\n`;
                response += `\`turn_pattern\`: ${gameDetails.config.turnPattern || 'default'}\n`;
                response += `\`min_turns\`: ${gameDetails.config.minTurns || 'default'}\n`;
                response += `\`max_turns\`: ${gameDetails.config.maxTurns || 'unlimited'}\n`;
                response += `\`writing_timeout\`: ${gameDetails.config.writingTimeout || 'default'}\n`;
                response += `\`drawing_timeout\`: ${gameDetails.config.drawingTimeout || 'default'}\n`;
                response += `\`stale_timeout\`: ${gameDetails.config.staleTimeout || 'default'}`;
            }

            await SimpleMessage.sendInfo(interaction, response, {}, true); // Ephemeral - game details

        } catch (error) {
            console.error('Error in /game show command:', error);
            await SimpleMessage.sendError(interaction, strings.messages.common.errorCriticalCommand, {}, true);
        }
    }
} 