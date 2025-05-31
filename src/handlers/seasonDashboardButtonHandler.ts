import { ButtonInteraction, CacheType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ButtonHandler } from './buttonHandler.js';
import { SeasonService } from '../services/SeasonService.js';
import { GameService } from '../services/GameService.js'; // Conceptual, might not exist yet
import { Logger } from '../services/index.js';
import { strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js'; // For direct prisma interactions

// Instantiate services - adjust if using a DI container
const seasonService = new SeasonService(prisma);
const gameService = new GameService(prisma); // Assuming GameService is similar

// Helper function to create dashboard components
// Exported for use in season-command.ts and other handlers
export async function createDashboardComponents(seasonId: string, interactionUser: { id: string }, prismaClient: typeof prisma): Promise<ActionRowBuilder<ButtonBuilder>[]> {
    // Passed prismaClient for testability or if service isn't a singleton/easily accessible
    const season = await new SeasonService(prismaClient).findSeasonByIdWithCreator(seasonId); // Re-instantiate service or use singleton

    if (!season) {
        const errorButton = new ButtonBuilder().setCustomId(`error_season_not_found_${seasonId}`).setLabel("Error: Season Not Found").setStyle(ButtonStyle.Danger).setDisabled(true);
        return [new ActionRowBuilder<ButtonBuilder>().addComponents(errorButton)];
    }

    let userPlayerRecord = await prismaClient.player.findUnique({where: {discordUserId: interactionUser.id}});
    const isCreator = season.creatorPlayerId === userPlayerRecord?.id;
    // TODO: Add role-based admin check if needed: const isAdmin = interaction.member.permissions.has("ADMINISTRATOR");
    const canManage = isCreator; // || isAdmin;

    const components = [];

    // First Row: Refresh, Start/Status
    const row1 = new ActionRowBuilder<ButtonBuilder>();
    row1.addComponents(
        new ButtonBuilder()
            .setCustomId(`season_dashboard_refresh_${season.id}`)
            .setLabel("Refresh")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄')
    );

    if ((season.status === 'OPEN' || season.status === 'SETUP')) {
        const minPlayersMet = season._count.players >= season.config.minPlayers;
        row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`season_dashboard_start_${season.id}`)
                .setLabel("Start Season")
                .setStyle(ButtonStyle.Success)
                .setDisabled(!canManage || !minPlayersMet) // Disabled if not manager or min players not met
                .setEmoji('▶️')
        );
         if (canManage && !minPlayersMet) {
            // Optionally add a specific message or button state if min players not met by manager
        }
    } else if (season.status === 'IN_PROGRESS') {
         row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`season_status_inprogress_${season.id}`) // Could link to game view or more details
                .setLabel("In Progress")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true) // Or link to a game specific dashboard
                .setEmoji('⚔️')
        );
    }
    // Add other statuses (COMPLETED, CANCELED) if needed

    components.push(row1);

    // Second Row: Settings (conditionally other actions)
    const row2 = new ActionRowBuilder<ButtonBuilder>();
     row2.addComponents(
        new ButtonBuilder()
            .setCustomId(`season_dashboard_settings_${season.id}`)
            .setLabel("Settings")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!canManage) // Only manager can change settings
            .setEmoji('⚙️')
    );
    // Potentially add more buttons like "View Participants", "Manage Invites" etc.
    if(row2.components.length > 0) components.push(row2);


    return components;
}


export class SeasonDashboardButtonHandler implements ButtonHandler {
    customIdPrefix = 'season_dashboard_'; // Will handle refresh, start, settings

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        const parts = interaction.customId.substring(this.customIdPrefix.length).split('_');
        const action = parts[0];
        const seasonId = parts[1]; // Assuming format is "season_dashboard_action_seasonId"

        Logger.info(`SeasonDashboardButtonHandler: User ${interaction.user.tag} (${interaction.user.id}) triggered action '${action}' for season ${seasonId}`);

        if (!seasonId) {
            await interaction.reply({ content: "Could not determine the season for this action.", ephemeral: true });
            return;
        }

        switch (action) {
            case 'refresh':
                await this.handleRefresh(interaction, seasonId);
                break;
            case 'start':
                await this.handleStartGame(interaction, seasonId);
                break;
            case 'settings':
                await this.handleSettings(interaction, seasonId);
                break;
            default:
                Logger.warn(`SeasonDashboardButtonHandler: Unknown action '${action}' for season ${seasonId}`);
                await interaction.reply({ content: "This action is not recognized.", ephemeral: true });
        }
    }

    private async handleRefresh(interaction: ButtonInteraction<CacheType>, seasonId: string): Promise<void> {
        try {
            const season = await seasonService.findSeasonByIdWithPlayers(seasonId); // Method needs to include players for player count, and config
            if (!season) {
                await interaction.update({ content: "Season not found or an error occurred.", embeds: [], components: [] });
                return;
            }

            const embed = this.buildSeasonEmbed(season); // Re-use embed logic
            const components = await createDashboardComponents(seasonId, interaction.user); // Re-create buttons with updated state

            await interaction.update({ embeds: [embed], components: components });
        } catch (error) {
            Logger.error(`Error refreshing season dashboard for S${seasonId}:`, error);
            await interaction.followUp({ content: "Failed to refresh season details.", ephemeral: true });
        }
    }

    private async handleStartGame(interaction: ButtonInteraction<CacheType>, seasonId: string): Promise<void> {
        try {
            const player = await prisma.player.findUnique({ where: { discordUserId: interaction.user.id } });
            if (!player) {
                await interaction.reply({ content: "Could not find your player record.", ephemeral: true });
                return;
            }

            const season = await seasonService.findSeasonByIdWithCreator(seasonId);
            if (!season) {
                await interaction.reply({ content: "Season not found.", ephemeral: true });
                return;
            }

            // Permission Check
            if (season.creatorPlayerId !== player.id /* && !isAdmin(interaction.member) */) {
                await interaction.reply({ content: "You do not have permission to start this season.", ephemeral: true });
                return;
            }

            // State Check
            if (season.status !== 'OPEN' && season.status !== 'SETUP') {
                await interaction.reply({ content: `Season is not in a startable state (current: ${season.status}).`, ephemeral: true });
                return;
            }
            if (season._count.players < season.config.minPlayers) {
                 await interaction.reply({ content: `Cannot start: Minimum ${season.config.minPlayers} players required, currently ${season._count.players}.`, ephemeral: true });
                return;
            }

            const result = await gameService.startGame(seasonId, player.id); // Conceptual method

            if (result.type === 'success') {
                const updatedSeason = await seasonService.findSeasonByIdWithPlayers(seasonId);
                const embed = this.buildSeasonEmbed(updatedSeason);
                const components = await createDashboardComponents(seasonId, interaction.user);
                await interaction.update({ content: `Season ${seasonId} started successfully!`, embeds: [embed], components });
            } else {
                await interaction.reply({ content: `Failed to start season: ${result.message || 'Unknown error.'}`, ephemeral: true });
            }
        } catch (error) {
            Logger.error(`Error starting game for season S${seasonId}:`, error);
            // Check if already replied
            if (interaction.replied || interaction.deferred) {
                 await interaction.followUp({ content: "An error occurred while trying to start the season.", ephemeral: true });
            } else {
                 await interaction.reply({ content: "An error occurred while trying to start the season.", ephemeral: true });
            }
        }
    }

    private async handleSettings(interaction: ButtonInteraction<CacheType>, seasonId: string): Promise<void> {
        // For now, placeholder. Could open a modal for settings.
        await interaction.reply({ content: `Season settings management for S${seasonId} is not yet implemented.`, ephemeral: true });
    }

    // Helper to build season embed (similar to what /season show does)
    // This should ideally be a shared utility if used in multiple places.
    private buildSeasonEmbed(season: any): EmbedBuilder { // Use a proper type for season
        const embed = new EmbedBuilder()
            .setTitle(`Season Details: ${season.id}`)
            .setColor(0x0099FF) // Default Blue, can be dynamic based on status
            .addFields(
                { name: 'Status', value: season.status, inline: true },
                { name: 'Players', value: `${season._count.players} / ${season.config.maxPlayers || '∞'}`, inline: true }
            );
        if (season.name) embed.setDescription(`**${season.name}**`);

        if (season.status === 'SETUP' && season.config.openDuration) {
            // Logic for openUntilText (similar to season-command)
            // const openUntilText = ...;
            // embed.addFields({ name: 'Open Until', value: openUntilText, inline: true });
        }
        embed.addFields({ name: 'Created', value: `<t:${Math.floor(new Date(season.createdAt).getTime() / 1000)}:D>`, inline: true });

        // Add more fields as needed (rules, etc.)
        return embed;
    }
}
