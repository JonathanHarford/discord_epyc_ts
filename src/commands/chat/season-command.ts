import { ActionRowBuilder, ApplicationCommandOptionChoiceData, AutocompleteFocusedOption, AutocompleteInteraction, ButtonBuilder, ButtonStyle, CacheType, ChatInputCommandInteraction, EmbedBuilder, PermissionsString, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { createDashboardComponents } from '../../handlers/seasonDashboardButtonHandler.js'; // Import the helper
import { strings } from '../../lang/strings.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { EventData } from '../../models/internal-models.js';
import { Logger } from '../../services/index.js'; // Assuming Logger is exported from services
import { PlayerTurnService } from '../../services/PlayerTurnService.js';
import { SeasonService } from '../../services/SeasonService.js';
import { Command, CommandDeferType } from '../index.js';


export class SeasonCommand implements Command {
    public names = [strings.chatCommands.season];
    public cooldown = new RateLimiter(1, 5000);
    public deferType = CommandDeferType.NONE;
    public requireClientPerms: PermissionsString[] = [];

    constructor(
        private prisma: any, // Keep this as it's used in the constructor
        private seasonService: SeasonService,
        private playerTurnService: PlayerTurnService
    ) {}

    public async execute(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        const subcommand = intr.options.getSubcommand();

        // Note: Interaction is already deferred by CommandHandler based on deferType


        switch (subcommand) {
            case 'list':
                await this.handleListCommand(intr, _data);
                break;
            case 'show':
                await this.handleShowCommand(intr, _data);
                break;
            case 'join':
                await this.handleJoinCommand(intr, _data);
                break;
            case 'new':
                await this.handleNewCommand(intr, _data);
                break;
            default:
                await SimpleMessage.sendError(intr, 'Command not implemented yet.', {}, true);
                return;
        }
    }

    private async handleListCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        Logger.info(`[SeasonCommand] Executing /season list for user: ${intr.user.tag} (${intr.user.id})`);
        await intr.deferReply({ ephemeral: true }); // List is user-specific, should be ephemeral

        try {
            const discordUserId = intr.user.id;
            let player = await this.prisma.player.findUnique({ where: { discordUserId } });
            if (!player) { // Create a player record if one doesn't exist, useful for checking participation
                try {
                    player = await this.prisma.player.create({data: {discordUserId, name: intr.user.username}});
                    Logger.info(`Created player record for ${intr.user.tag} during /season list.`);
                } catch (e) {
                    Logger.error(`Failed to create player record for ${intr.user.tag} during /season list:`, e);
                    // Continue without player context if creation fails, they just won't see "already joined" status accurately.
                }
            }
            const playerId = player?.id;

            const seasons = await this.prisma.season.findMany({
                include: {
                    config: true,
                    _count: { select: { players: true } },
                    players: playerId ? { where: { playerId } } : false, // Include player's link to season if playerId is available
                    creator: { select: { name: true } }
                },
                orderBy: { createdAt: 'desc' },
            });

            if (seasons.length === 0) {
                await intr.editReply({ content: strings.messages.listSeasons.noSeasons || 'No seasons found.' });
                return;
            }

            // Filter out terminated seasons for regular users (admins can see them via admin commands)
            const visibleSeasons = seasons.filter(s => s.status !== 'TERMINATED');

            if (visibleSeasons.length === 0) {
                await intr.editReply({ content: 'No active seasons found.' });
                return;
            }

            // Categorize seasons
            const joinableSeasons = visibleSeasons.filter(s => {
                const isUserInSeason = playerId ? s.players.some(p => p.playerId === playerId) : false;
                const isSeasonFull = s.config.maxPlayers ? s._count.players >= s.config.maxPlayers : false;
                return (s.status === 'OPEN' || s.status === 'SETUP') && !isUserInSeason && !isSeasonFull;
            });

            const joinedSeasons = visibleSeasons.filter(s => {
                const isUserInSeason = playerId ? s.players.some(p => p.playerId === playerId) : false;
                return isUserInSeason;
            });

            const otherSeasons = visibleSeasons.filter(s => {
                const isUserInSeason = playerId ? s.players.some(p => p.playerId === playerId) : false;
                const isSeasonFull = s.config.maxPlayers ? s._count.players >= s.config.maxPlayers : false;
                const isJoinable = (s.status === 'OPEN' || s.status === 'SETUP') && !isUserInSeason && !isSeasonFull;
                return !isUserInSeason && !isJoinable;
            });

            // Format seasons with interactive buttons
            const formatSeasonWithButtons = (s: any): { content: string, components: ActionRowBuilder<ButtonBuilder>[] } => {
                const createdDate = new Date(s.createdAt).toISOString().split('T')[0];
                const creatorName = s.creator?.name || 'Unknown';
                const playerCount = s._count.players;
                const maxPlayers = s.config.maxPlayers || '∞';
                const seasonLine = `**${s.id}** - @${creatorName} ${createdDate} (${playerCount}/${maxPlayers})`;

                // Create buttons for this season
                const buttons: ButtonBuilder[] = [];
                
                // Always add Show button
                const showButton = new ButtonBuilder()
                    .setCustomId(`season_show_${s.id}`)
                    .setLabel('Show Details')
                    .setStyle(ButtonStyle.Secondary);
                buttons.push(showButton);

                // Conditionally add Join button
                const isUserInSeason = playerId ? s.players.some(p => p.playerId === playerId) : false;
                const isSeasonFull = s.config.maxPlayers ? s._count.players >= s.config.maxPlayers : false;
                const canJoin = (s.status === 'OPEN' || s.status === 'SETUP') && !isUserInSeason && !isSeasonFull;
                
                if (canJoin) {
                    const joinButton = new ButtonBuilder()
                        .setCustomId(`season_join_${s.id}`)
                        .setLabel('Join Season')
                        .setStyle(ButtonStyle.Primary);
                    buttons.push(joinButton);
                } else if (isUserInSeason) {
                    // Show disabled join button for seasons user is already in
                    const joinedButton = new ButtonBuilder()
                        .setCustomId(`season_joined_${s.id}`)
                        .setLabel('Already Joined')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true);
                    buttons.push(joinedButton);
                }

                const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
                
                return {
                    content: seasonLine,
                    components: [actionRow]
                };
            };

            // Build the response with interactive components
            const seasonEntries: { content: string, components: ActionRowBuilder<ButtonBuilder>[] }[] = [];
            let message = '';

            if (joinableSeasons.length > 0) {
                message += `**You can join:**\n`;
                joinableSeasons.forEach(season => {
                    const entry = formatSeasonWithButtons(season);
                    seasonEntries.push(entry);
                });
                message += '\n';
            }

            if (joinedSeasons.length > 0) {
                message += `**You've joined:**\n`;
                joinedSeasons.forEach(season => {
                    const entry = formatSeasonWithButtons(season);
                    seasonEntries.push(entry);
                });
                message += '\n';
            }

            if (otherSeasons.length > 0) {
                message += `**Other seasons:**\n`;
                otherSeasons.forEach(season => {
                    const entry = formatSeasonWithButtons(season);
                    seasonEntries.push(entry);
                });
            }

            // If no seasons at all, show a helpful message
            if (seasonEntries.length === 0) {
                await intr.editReply({ content: 'No seasons found. Use `/season new` to start a new season!' });
                return;
            }

            // Discord has a limit of 5 action rows per message, so we need to handle pagination
            // Implement proper pagination with navigation buttons
            const maxSeasonsPerPage = 4; // Reserve 1 row for navigation buttons
            
            if (seasonEntries.length <= maxSeasonsPerPage) {
                // All seasons fit on one page
                const allComponents = seasonEntries.flatMap(entry => entry.components);
                const fullContent = message + seasonEntries.map(entry => entry.content).join('\n');
                await intr.editReply({ content: fullContent, components: allComponents });
            } else {
                // Multiple pages needed - show first page with navigation
                const currentPage = 0;
                const totalPages = Math.ceil(seasonEntries.length / maxSeasonsPerPage);
                const startIndex = currentPage * maxSeasonsPerPage;
                const endIndex = Math.min(startIndex + maxSeasonsPerPage, seasonEntries.length);
                
                const currentPageSeasons = seasonEntries.slice(startIndex, endIndex);
                const seasonComponents = currentPageSeasons.flatMap(entry => entry.components);
                
                // Create navigation buttons
                const navigationRow = new ActionRowBuilder<ButtonBuilder>();
                
                const prevButton = new ButtonBuilder()
                    .setCustomId(`season_list_prev_${currentPage}_${intr.user.id}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0);
                
                const pageButton = new ButtonBuilder()
                    .setCustomId(`season_list_page_info_${currentPage}_${intr.user.id}`)
                    .setLabel(`Page ${currentPage + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);
                
                const nextButton = new ButtonBuilder()
                    .setCustomId(`season_list_next_${currentPage}_${intr.user.id}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage >= totalPages - 1);
                
                navigationRow.addComponents(prevButton, pageButton, nextButton);
                
                let fullContent = message + currentPageSeasons.map(entry => entry.content).join('\n');
                fullContent += `\n\n*Showing ${startIndex + 1}-${endIndex} of ${seasonEntries.length} seasons*`;
                
                const allComponents = [...seasonComponents, navigationRow];
                await intr.editReply({ content: fullContent, components: allComponents });
            }

        } catch (error) {
            Logger.error('Error in /season list command:', error);
            // Check if interaction has already been replied to or deferred
            if (intr.replied || intr.deferred) {
                await intr.editReply({ content: strings.messages.common.errorCriticalCommand || 'An error occurred while listing seasons.' }).catch(e => Logger.error('Failed to editReply on error in list command', e));
            } else {
                 await intr.reply({ content: strings.messages.common.errorCriticalCommand || 'An error occurred while listing seasons.', ephemeral: true }).catch(e => Logger.error('Failed to reply on error in list command', e));
            }
        }
    }

    private async handleShowCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        const seasonIdOption = intr.options.getString('season'); // Made optional
        Logger.info(`[SeasonCommand] Executing /season show for user: ${intr.user.tag} (${intr.user.id}), seasonIdOption: ${seasonIdOption}`);

        if (!seasonIdOption) {
            await intr.deferReply({ ephemeral: true }); // Selection menu is user-specific
            await this.sendSeasonSelectionMenu(intr, 'show');
            return;
        }
        
        await intr.deferReply({ ephemeral: false }); // Show command can be public
        const seasonId = seasonIdOption; // Use the validated/passed option

        try {
            const season = await this.seasonService.findSeasonById(seasonId); // Includes config and _count.players
            
            if (!season) {
                 await intr.editReply({ content: strings.messages.status.seasonNotFound.replace('{seasonId}', seasonId), embeds: [], components: [] });
                return;
            }

            let openUntilText = '';
            if (season.status === 'SETUP' && season.config.openDuration) {
                try {
                    // Dynamically import parseDuration, assuming it's available.
                    // Consider making datetime utils more readily available if frequently used.
                    const { parseDuration } = await import('../../utils/datetime.js');
                    const duration = parseDuration(season.config.openDuration);
                    if (duration) {
                        const openUntil = new Date(season.createdAt.getTime() + duration.as('milliseconds'));
                        openUntilText = `<t:${Math.floor(openUntil.getTime() / 1000)}:R>`; // Relative timestamp
                    }
                } catch (error) {
                    Logger.warn(`Failed to parse openDuration for season ${season.id}:`, error);
                    openUntilText = 'Unknown';
                }
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`Season Details: ${season.id}`)
                .setColor(0x0099FF) // Blue
                .addFields(
                    { name: 'Status', value: season.status, inline: true },
                    { name: 'Players', value: `${season._count.players} / ${season.config.maxPlayers || '∞'}`, inline: true }
                );

            if (season.status === 'SETUP' && openUntilText) {
                 embed.addFields({ name: 'Open Until', value: openUntilText, inline: true });
            }
             embed.addFields({ name: 'Created', value: `<t:${Math.floor(new Date(season.createdAt).getTime() / 1000)}:D>`, inline: true }); // Short date format

            let rulesDescription = '';
            rulesDescription += `**Open Duration:** ${season.config.openDuration || 'Default'}\n`;
            rulesDescription += `**Min Players:** ${season.config.minPlayers}\n`;
            rulesDescription += `**Max Players:** ${season.config.maxPlayers || 'Unlimited'}\n`;
            rulesDescription += `**Turn Pattern:** ${season.config.turnPattern || 'Default'}\n`;
            rulesDescription += `**Claim Timeout:** ${season.config.claimTimeout || 'Default'}\n`;
            rulesDescription += `**Writing Timeout:** ${season.config.writingTimeout || 'Default'}\n`;
            rulesDescription += `**Drawing Timeout:** ${season.config.drawingTimeout || 'Default'}`;
            
            embed.addFields({ name: '📜 Rules & Configuration', value: rulesDescription });

            // Fetch and list some players if needed (example, adjust as per requirements)
            const seasonPlayers = await this.prisma.playersOnSeasons.findMany({
                where: { seasonId: season.id },
                take: 10, // Limit to 10 players for the embed
                include: { player: true }
            });

            if (seasonPlayers.length > 0) {
                const playerList = seasonPlayers.map(sp => `• ${sp.player.name}`).join('\n');
                embed.addFields({ name: `Players (${seasonPlayers.length}${season._count.players > seasonPlayers.length ? ` of ${season._count.players}` : ''})`, value: playerList });
            } else {
                embed.addFields({ name: 'Players', value: 'No players have joined yet.'});
            }

            const dashboardComponents = await createDashboardComponents(season.id, intr.user, this.prisma);
            await intr.editReply({ embeds: [embed], components: dashboardComponents });
            
        } catch (error) {
            Logger.error(`Error in /season show command for season ${seasonId}:`, error);
            const errorMessage = strings.messages.status.genericError.replace('{seasonId}', seasonId).replace('{errorMessage}', (error instanceof Error ? error.message : 'Unknown error'));
            await intr.editReply({ content: errorMessage });
        }
    }

    private async handleJoinCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        const seasonIdOption = intr.options.getString('season'); // Made optional
        const discordUserId = intr.user.id;
        Logger.info(`[SeasonCommand] Executing /season join for user: ${intr.user.tag} (${discordUserId}), seasonIdOption: ${seasonIdOption}`);

        if (!seasonIdOption) {
            await intr.deferReply({ ephemeral: true }); // Selection menu is user-specific
            await this.sendSeasonSelectionMenu(intr, 'join');
            return;
        }
        
        await intr.deferReply({ ephemeral: true }); // Join actions are user-specific
        const seasonId = seasonIdOption; // Use the validated/passed option

        try {
            // Check if user has pending turns before allowing them to join a season
            const pendingCheck = await this.playerTurnService.checkPlayerPendingTurns(discordUserId);
            
            if (pendingCheck.error) {
                await intr.editReply({ content: 'Failed to check your turn status. Please try again.'});
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
                    intr,
                    `You have a pending turn waiting for you in ${gameType} game (${gameIdentifier}${creatorInfo}). Please complete your current turn before joining a new season.`,
                    {},
                    true
                );
                return;
            }

            const season = await this.seasonService.findSeasonById(seasonId);
            
            if (!season) {
                await SimpleMessage.sendError(
                    intr,
                    strings.messages.joinSeason.seasonNotFound,
                    { seasonId },
                    true
                );
                return;
            }
            
            const validJoinStatuses = ['OPEN'];
            if (!validJoinStatuses.includes(season.status)) {
                await SimpleMessage.sendError(
                    intr,
                    strings.messages.joinSeason.notOpen,
                    { seasonId, status: season.status },
                    true
                );
                return;
            }
            
            let player = await this.prisma.player.findUnique({
                where: { discordUserId }
            });
            
            if (!player) {
                try {
                    player = await this.prisma.player.create({
                        data: {
                            discordUserId,
                            name: intr.user.username,
                        }
                    });
                    
                    const result = await this.seasonService.addPlayerToSeason(player.id, seasonId);
                    
                    if (result.type === 'success') {
                        await intr.editReply({ content: strings.messages.joinSeason.success.replace('{seasonId}', seasonId) });
                    } else {
                        await intr.editReply({ content: strings.messages.joinSeason.genericError.replace('{seasonId}', seasonId).replace('{errorMessage}', result.key) });
                    }
                    
                } catch (error) {
                    Logger.error('Error creating player record:', error);
                    await intr.editReply({
                        content: strings.messages.joinSeason.genericError.replace('{seasonId}', seasonId).replace('{errorMessage}', (error instanceof Error ? error.message : 'Unknown error'))
                    });
                }
                return;
            }
            
            const result = await this.seasonService.addPlayerToSeason(player.id, seasonId);
            
            if (result.type === 'success') {
                await intr.editReply({ content: strings.messages.joinSeason.success.replace('{seasonId}', seasonId) });
            } else {
                await intr.editReply({ content: strings.messages.joinSeason.genericError.replace('{seasonId}', seasonId).replace('{errorMessage}', result.key) });
            }
            
        } catch (error) {
            Logger.error(`Error in /season join command for season ${seasonId}:`, error);
            await intr.editReply({
                content: strings.messages.joinSeason.genericError.replace('{seasonId}', seasonId).replace('{errorMessage}', (error instanceof Error ? error.message : 'Unknown error'))
            });
        }
    }

    async sendSeasonSelectionMenu(intr: ChatInputCommandInteraction, type: 'join' | 'show'): Promise<void> {
        // Assumes intr is already deferred by the calling method
        const discordUserId = intr.user.id;
        let seasonsToDisplay = [];
        let placeholder = '';
        let customId = '';
        let noSeasonsMessage = '';
        let promptMessage = '';

        if (type === 'join') {
            customId = 'season_select_join';
            placeholder = strings.messages.selectSeason.placeholderJoin || 'Select a season to join';
            noSeasonsMessage = strings.messages.selectSeason.noSeasonsJoin || 'No seasons are currently available for you to join.';
            promptMessage = strings.messages.selectSeason.promptJoin || 'Please select a season to join:';

            let player = await this.prisma.player.findUnique({ where: { discordUserId } });
            if (!player) { // Attempt to create player if they don't exist, as they need a player record to join
                try {
                    player = await this.prisma.player.create({ data: { discordUserId, name: intr.user.username }});
                    Logger.info(`Created player record for ${intr.user.username} in sendSeasonSelectionMenu (join type)`);
                } catch (e) {
                    Logger.error(`Failed to create player record for ${intr.user.username} in sendSeasonSelectionMenu (join):`, e);
                    await intr.editReply({ content: strings.messages.joinSeason.errorPlayerCreateFailed || 'Could not prepare your player record. Please try again.'});
                    return;
                }
            }
            const playerId = player.id;

            const allJoinableSeasons = await this.prisma.season.findMany({
                where: { status: { in: ['OPEN', 'SETUP'] } }, // Seasons that are generally joinable
                include: {
                    config: true,
                    _count: { select: { players: true } },
                    players: { where: { playerId } } // Check if current player is already in these seasons
                },
                orderBy: { createdAt: 'desc' },
                take: 25 // Discord select menu option limit
            });

            seasonsToDisplay = allJoinableSeasons.filter(season => {
                const isUserInSeason = season.players.length > 0;
                const isSeasonFull = season.config.maxPlayers ? season._count.players >= season.config.maxPlayers : false;
                return !isUserInSeason && !isSeasonFull;
            });

        } else { // type === 'show'
            customId = 'season_select_show';
            placeholder = strings.messages.selectSeason.placeholderShow || 'Select a season to view details';
            noSeasonsMessage = strings.messages.selectSeason.noSeasonsShow || 'No seasons found to display.';
            promptMessage = strings.messages.selectSeason.promptShow || 'Please select a season to view:';
            seasonsToDisplay = await this.prisma.season.findMany({
                include: { config: true, _count: { select: { players: true } } },
                orderBy: { createdAt: 'desc' },
                take: 25,
            });
        }

        if (seasonsToDisplay.length === 0) {
            await intr.editReply({ content: noSeasonsMessage });
            return;
        }

        const options = seasonsToDisplay.map(season => {
            let label = `S${season.id}`;
            if (season.name && season.name.length < 20) label += ` - ${season.name}`;
            label += ` (${season._count.players}/${season.config.maxPlayers || '∞'})`;
            if (label.length > 100) label = label.substring(0, 97) + '...';

            let description = `Status: ${season.status}`;
            if (new Date(season.createdAt).getFullYear() === new Date().getFullYear()){
                 description += ` | Created: ${new Date(season.createdAt).toLocaleDateString(undefined, {month:'short', day:'numeric'})}`;
            } else {
                 description += ` | Created: ${new Date(season.createdAt).toLocaleDateString()}`;
            }
            if (description.length > 100) description = description.substring(0, 97) + '...';

            return new StringSelectMenuOptionBuilder()
                .setLabel(label)
                .setValue(season.id.toString())
                .setDescription(description);
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder(placeholder)
            .addOptions(options);

        const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        await intr.editReply({
            content: promptMessage,
            components: [actionRow]
        });
    }

    private async handleNewCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        Logger.info(`[SeasonCommand] Executing /season new for user: ${intr.user.tag} (${intr.user.id})`);
        
        try {
            // Import the modal builder and utilities
            const { createSeasonCreationStep1Modal, generateAutoSeasonName } = await import('../../utils/modalBuilders.js');
            const { ConfigService } = await import('../../services/ConfigService.js');
            
            // Get guild ID for configuration lookup
            const guildId = intr.guildId;
            if (!guildId) {
                await intr.reply({ 
                    content: 'Season creation is only available in servers, not in direct messages.', 
                    ephemeral: true 
                });
                return;
            }
            
            // Get server default configuration
            const configService = new ConfigService(this.prisma);
            const defaultConfig = await configService.getGuildDefaultConfig(guildId);
            
            // Generate auto-generated season name
            const autoGeneratedName = generateAutoSeasonName();
            
            // Create and show the modal with defaults
            const modal = createSeasonCreationStep1Modal(defaultConfig, autoGeneratedName);
            
            await intr.showModal(modal);
            Logger.info(`[SeasonCommand] Displayed season creation modal with defaults for user: ${intr.user.tag}`);
        } catch (error) {
            Logger.error('Error showing season creation modal:', error);
            await intr.reply({ 
                content: 'Sorry, there was an error opening the season creation form. Please try again.', 
                ephemeral: true 
            });
        }
    }

    // Renamed from handleAutocomplete to match the Command interface used by CommandHandler
    public async autocomplete(interaction: AutocompleteInteraction<CacheType>, _option: AutocompleteFocusedOption): Promise<ApplicationCommandOptionChoiceData<string | number>[]> {
        const focusedOption = interaction.options.getFocused(true);
        const userInput = focusedOption.value.toLowerCase().trim();
        const subcommand = interaction.options.getSubcommand();

        if (focusedOption.name === 'season') {
            try {
                const discordUserId = interaction.user.id;
                
                // Get user's player record to check participation
                const player = await this.prisma.player.findUnique({ 
                    where: { discordUserId },
                    select: { id: true }
                });
                const playerId = player?.id;

                // Build base query with includes
                const baseInclude = {
                    _count: { select: { players: true } },
                    config: { select: { maxPlayers: true } },
                    creator: { select: { name: true } },
                    players: playerId ? { 
                        where: { playerId },
                        select: { playerId: true }
                    } : false
                };

                let seasons: any[] = [];

                if (userInput.length === 0) {
                    // No input - show most relevant seasons
                    if (subcommand === 'join') {
                        // For join: prioritize open/setup seasons user can join
                        seasons = await this.prisma.season.findMany({
                            where: {
                                status: { in: ['OPEN', 'SETUP'] },
                                // Exclude terminated seasons
                                NOT: { status: 'TERMINATED' }
                            },
                            include: baseInclude,
                            orderBy: [
                                { status: 'asc' }, // OPEN before SETUP
                                { createdAt: 'desc' }
                            ],
                            take: 25
                        });
                    } else {
                        // For show: show user's seasons first, then recent active ones
                        const userSeasons = playerId ? await this.prisma.season.findMany({
                            where: {
                                players: { some: { playerId } },
                                NOT: { status: 'TERMINATED' }
                            },
                            include: baseInclude,
                            orderBy: { createdAt: 'desc' },
                            take: 15
                        }) : [];

                        const otherSeasons = await this.prisma.season.findMany({
                            where: {
                                NOT: { 
                                    OR: [
                                        { status: 'TERMINATED' },
                                        ...(playerId ? [{ players: { some: { playerId } } }] : [])
                                    ]
                                }
                            },
                            include: baseInclude,
                            orderBy: { createdAt: 'desc' },
                            take: 25 - userSeasons.length
                        });

                        seasons = [...userSeasons, ...otherSeasons];
                    }
                } else {
                    // User typed something - search by creator name or season ID
                    const searchConditions = [];
                    
                    // Search by creator name (case insensitive)
                    searchConditions.push({
                        creator: {
                            name: {
                                contains: userInput,
                                mode: 'insensitive' as const
                            }
                        }
                    });

                    // If input looks like it could be a season ID (starts with common nanoid chars)
                    if (userInput.length >= 2) {
                        searchConditions.push({
                            id: {
                                contains: userInput,
                                mode: 'insensitive' as const
                            }
                        });
                    }

                    seasons = await this.prisma.season.findMany({
                        where: {
                            AND: [
                                { NOT: { status: 'TERMINATED' } },
                                { OR: searchConditions }
                            ]
                        },
                        include: baseInclude,
                        orderBy: [
                            { createdAt: 'desc' }
                        ],
                        take: 25
                    });
                }

                // Filter seasons based on command context
                if (subcommand === 'join') {
                    seasons = seasons.filter(season => {
                        const isUserInSeason = playerId && season.players?.some((p: any) => p.playerId === playerId);
                        const isSeasonFull = season.config.maxPlayers && season._count.players >= season.config.maxPlayers;
                        const isJoinable = ['OPEN', 'SETUP'].includes(season.status);
                        return isJoinable && !isUserInSeason && !isSeasonFull;
                    });
                }

                const formattedOptions = seasons.map(season => {
                    const creatorName = season.creator?.name || 'Unknown';
                    const playerCount = season._count.players;
                    const maxPlayers = season.config.maxPlayers || '∞';
                    const isUserInSeason = playerId && season.players?.some((p: any) => p.playerId === playerId);
                    
                    // Format: "S{shortId} - @{creator} ({players}/{max}) [{status}]"
                    const shortId = season.id.substring(0, 8); // First 8 chars of nanoid
                    let name = `S${shortId} - @${creatorName} (${playerCount}/${maxPlayers})`;
                    
                    // Add status indicator
                    const statusMap: Record<string, string> = {
                        'SETUP': '🔧',
                        'OPEN': '🟢', 
                        'ACTIVE': '🎮',
                        'COMPLETED': '✅',
                        'PAUSED': '⏸️'
                    };
                    const statusIcon = statusMap[season.status] || '❓';
                    name += ` ${statusIcon}`;
                    
                    // Add user participation indicator
                    if (isUserInSeason) {
                        name += ' 👤';
                    }

                    // Truncate if too long (Discord limit is 100 chars)
                    if (name.length > 97) {
                        name = name.substring(0, 94) + '...';
                    }

                    return {
                        name: name,
                        value: season.id
                    };
                });

                await interaction.respond(formattedOptions);
                return formattedOptions;
            } catch (error) {
                Logger.error('Error in season command autocomplete:', error);
                await interaction.respond([]); // Respond with empty array on error
                return [];
            }
        }
        return [];
    }
}

export default SeasonCommand;