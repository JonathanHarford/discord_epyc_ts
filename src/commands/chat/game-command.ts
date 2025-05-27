import { PrismaClient } from '@prisma/client';
import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';

import { gameCommandData } from './game-command-data.js';
import { strings } from '../../lang/strings.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { EventData } from '../../models/internal-models.js';
import { OnDemandGameService } from '../../services/OnDemandGameService.js';
import { OnDemandTurnService } from '../../services/OnDemandTurnService.js';
import { Command, CommandDeferType } from '../command.js';

export class GameCommand implements Command {
    public names = [gameCommandData.name];
    public data = gameCommandData;
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = ['SendMessages'];

    private prisma: PrismaClient;
    private onDemandGameService: OnDemandGameService;
    private onDemandTurnService: OnDemandTurnService;

    constructor(
        prisma: PrismaClient, 
        onDemandGameService: OnDemandGameService,
        onDemandTurnService: OnDemandTurnService
    ) {
        this.prisma = prisma;
        this.onDemandGameService = onDemandGameService;
        this.onDemandTurnService = onDemandTurnService;
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
                await SimpleMessage.sendEmbed(interaction, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
                return;
        }
    }

    private async handleNewCommand(interaction: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        console.log(`[GameCommand] Executing /game new command for user: ${interaction.user.id}, username: ${interaction.user.username}`);
        
        try {
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
                `<@${interaction.user.id}> has started a new game! Use \`/game play\` to join.`,
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
            // Get user's active games and available games
            const result = await this.onDemandGameService.listGamesForPlayer(interaction.user.id, interaction.guildId!);

            if (!result.success) {
                await SimpleMessage.sendError(interaction, result.error || 'Failed to list games', {}, true);
                return;
            }

            const userGames = result.activeGames || [];
            const availableGames = result.availableGames || [];

            // Format user's active games
            const userGamesText = userGames.length === 0 
                ? 'You have no active games.'
                : userGames.map(game => {
                    const createdDate = new Date(game.createdAt).toISOString().split('T')[0];
                    return `**Game #${game.id}** - Started by <@${game.creatorId}> (${createdDate})`;
                }).join('\n');

            // Format available games
            const availableGamesText = availableGames.length === 0 
                ? 'No games available to join.'
                : availableGames.map(game => {
                    const createdDate = new Date(game.createdAt).toISOString().split('T')[0];
                    return `**Game #${game.id}** - Started by <@${game.creatorId}> (${createdDate})`;
                }).join('\n');

            // Create the response message
            const message = `**Your Active Games:**\n${userGamesText}\n\n**Available Games to Join:**\n${availableGamesText}`;

            await SimpleMessage.sendInfo(interaction, message, {}, true); // Ephemeral - personal info

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
            const lastActivityDate = gameDetails.lastActivityAt 
                ? new Date(gameDetails.lastActivityAt).toISOString().split('T')[0]
                : 'Never';

            // Get turn count and current turn info
            const totalTurns = gameDetails.turns.length;
            const completedTurns = gameDetails.turns.filter(t => t.status === 'COMPLETED').length;
            const currentTurn = gameDetails.turns.find(t => t.status === 'PENDING' || t.status === 'OFFERED');

            const message = `**Game #${gameId}**\n` +
                `Started by: <@${gameDetails.creatorId}>\n` +
                `Turns: ${completedTurns}/${totalTurns}\n` +
                `Status: ${gameDetails.status}\n` +
                `Started: ${createdDate}\n` +
                `Last activity: ${lastActivityDate}` +
                (currentTurn ? `\nCurrent turn: ${currentTurn.turnNumber} (${currentTurn.type}) - ${currentTurn.status}` : '');

            await SimpleMessage.sendInfo(interaction, message, {}, true); // Ephemeral - game details

        } catch (error) {
            console.error('Error in /game show command:', error);
            await SimpleMessage.sendError(interaction, strings.messages.common.errorCriticalCommand, {}, true);
        }
    }
} 