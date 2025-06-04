import { ChatInputCommandInteraction, CacheType, Attachment } from 'discord.js';
import { PrismaClient, Turn } from '@prisma/client'; // Assuming Turn might be returned by services

import { Command, CommandDeferType } from '../../models/Command.js';
import { Logger } from '../../services/index.js';
import prisma from '../../lib/prisma.js'; // Global prisma instance
import { PlayerService } from '../../services/PlayerService.js';
import { SeasonTurnService } from '../../services/SeasonTurnService.js';
import { OnDemandTurnService } from '../../services/OnDemandTurnService.js';
import { MessageAdapter } from '../../messaging/MessageAdapter.js';
import { strings } from '../../lang/strings.js';
import { interpolate } from '../../lang/strings.js';
import { gameCommandData } from './game-command-data.js'; // Import command data

export class GameCommand implements Command {
    public metadata = gameCommandData; // Link to command data
    public deferType = CommandDeferType.NONE; // Or HIDDEN if operations can be slow

    private playerService: PlayerService;
    private seasonTurnService: SeasonTurnService;
    private onDemandTurnService: OnDemandTurnService;
    // Constructor to initialize services
    constructor(
        playerService: PlayerService,
        seasonTurnService: SeasonTurnService,
        onDemandTurnService: OnDemandTurnService
        // Add OnDemandGameService if needed for other subcommands later
    ) {
        this.playerService = playerService;
        this.seasonTurnService = seasonTurnService;
        this.onDemandTurnService = onDemandTurnService;
    }

    public async execute(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
        const subcommand = interaction.options.getSubcommand(false);

        try {
            switch (subcommand) {
                // ... other subcommands like 'new', 'play', 'list', 'show' would go here ...
                case strings.commands.game.subcommands.submitDrawing.name: // 'submit_drawing'
                    await this.handleSubmitDrawing(interaction);
                    break;
                // ... admin subcommands might be in a separate AdminGameCommand or handled by permissions ...
                default:
                    Logger.warn(`[GameCommand] Unhandled subcommand: ${subcommand}`);
                    await interaction.reply({ content: 'Unknown game subcommand.', ephemeral: true });
            }
        } catch (error) {
            Logger.error(`[GameCommand] Error executing subcommand ${subcommand}:`, error);
            const errMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `An error occurred: ${errMessage}`, ephemeral: true });
            } else {
                await interaction.followUp({ content: `An error occurred: ${errMessage}`, ephemeral: true });
            }
        }
    }

    private async handleSubmitDrawing(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
        const discordUserId = interaction.user.id;
        const attachment = interaction.options.getAttachment(strings.commands.game.subcommands.submitDrawing.options.image.name, true);

        Logger.info(`[GameCommand] handleSubmitDrawing: User ${discordUserId} submitted attachment: ${attachment.name}`);

        // 1. Validate attachment type
        if (!attachment.contentType?.startsWith('image/')) {
            await interaction.reply({
                content: interpolate(strings.messages.submission.invalidFileType, { fileType: attachment.contentType || 'unknown' }),
                ephemeral: true
            });
            return;
        }

        // 2. Get Player
        const player = await this.playerService.getPlayerByDiscordId(discordUserId);
        if (!player) {
            await interaction.reply({ content: strings.messages.submission.playerNotFound, ephemeral: true });
            return;
        }

        // 3. Find PENDING DRAWING turn for this player (simplified - checks both services)
        let pendingTurn: Turn | null | undefined = null; // Allow Turn from @prisma/client
        let turnSource: 'season' | 'ondemand' | null = null;

        const seasonPendingTurns = await this.seasonTurnService.getTurnsForPlayer(player.id, 'PENDING');
        pendingTurn = seasonPendingTurns.find(t => t.type === 'DRAWING');
        if (pendingTurn) {
            turnSource = 'season';
        } else {
            const onDemandPendingTurns = await this.onDemandTurnService.getTurnsForPlayer(player.id, 'PENDING'); // Need getTurnsForPlayer in OnDemandTurnService
            pendingTurn = onDemandPendingTurns.find(t => t.type === 'DRAWING');
            if (pendingTurn) {
                turnSource = 'ondemand';
            }
        }

        if (!pendingTurn) {
            await interaction.reply({ content: strings.messages.submission.noPendingDrawingTurn, ephemeral: true });
            return;
        }

        // 4. Call appropriate service to submit the image turn
        let serviceResult;
        const imageUrl = attachment.url; // Using the direct URL

        if (turnSource === 'season') {
            serviceResult = await this.seasonTurnService.submitTurn(pendingTurn.id, player.id, imageUrl, 'image');
        } else if (turnSource === 'ondemand') {
            serviceResult = await this.onDemandTurnService.submitTurn(pendingTurn.id, player.id, imageUrl, 'image');
        } else {
            // Should not happen if pendingTurn was found
            Logger.error(`[GameCommand] handleSubmitDrawing: Could not determine turn source for turn ${pendingTurn.id}`);
            await interaction.reply({ content: 'Error: Could not process submission due to unknown game type.', ephemeral: true });
            return;
        }

        // 5. Reply with feedback
        if (serviceResult.success) {
            let finishedGamesLink = 'the completed games channel';
            const gameWithSeason = await prisma.game.findUnique({ // Use global prisma
                where: { id: pendingTurn.gameId },
                include: { season: true }
            });
            const guildId = gameWithSeason?.season?.guildId || gameWithSeason?.guildId;
            if (guildId) {
                const { ChannelConfigService } = await import('../../services/ChannelConfigService.js'); // Relative path
                const channelConfigService = new ChannelConfigService(prisma); // Use global prisma
                const completedChannelId = await channelConfigService.getCompletedChannelId(guildId);
                if (completedChannelId) {
                    finishedGamesLink = `<#${completedChannelId}>`;
                }
            }
            const successMessage = interpolate(strings.messages.submission.submitSuccessModal, { // Reusing modal success string
                finishedGamesLink: finishedGamesLink
            });
            await interaction.reply({ content: successMessage, ephemeral: true });
        } else {
            await interaction.reply({
                content: interpolate(strings.messages.submission.submitFailed, { error: serviceResult.error || 'Unknown error', turnId: pendingTurn.id }),
                ephemeral: true
            });
        }
    }
}
