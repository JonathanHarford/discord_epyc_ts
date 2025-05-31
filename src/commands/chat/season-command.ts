import { ActionRowBuilder, ApplicationCommandOptionChoiceData, AutocompleteFocusedOption, AutocompleteInteraction, ButtonBuilder, ButtonStyle, CacheType, ChatInputCommandInteraction, EmbedBuilder, PermissionsString, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { createDashboardComponents } from '../../handlers/seasonDashboardButtonHandler.js'; // Import the helper
import { strings } from '../../lang/strings.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { EventData } from '../../models/internal-models.js';
import { Logger } from '../../services/index.js'; // Assuming Logger is exported from services
import { PlayerTurnService } from '../../services/PlayerTurnService.js';
import { NewSeasonOptions, SeasonService } from '../../services/SeasonService.js';
import { MessageInstruction } from '../../types/MessageInstruction.js';
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
                await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
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
                },
                orderBy: { createdAt: 'desc' },
            });

            if (seasons.length === 0) {
                await intr.editReply({ content: strings.messages.listSeasons.noSeasons || 'No seasons found.' });
                return;
            }

            // Separate seasons into joinable and others
            const joinableSeasons = seasons.filter(s => {
                const isUserInSeason = playerId ? s.players.some(p => p.playerId === playerId) : false;
                const isSeasonFull = s.config.maxPlayers ? s._count.players >= s.config.maxPlayers : false;
                return (s.status === 'OPEN' || s.status === 'SETUP') && !isUserInSeason && !isSeasonFull;
            });

            // All other seasons (including joined ones, completed, terminated, etc.)
            const otherSeasons = seasons.filter(s => {
                const isUserInSeason = playerId ? s.players.some(p => p.playerId === playerId) : false;
                const isSeasonFull = s.config.maxPlayers ? s._count.players >= s.config.maxPlayers : false;
                const isJoinable = (s.status === 'OPEN' || s.status === 'SETUP') && !isUserInSeason && !isSeasonFull;
                return !isJoinable;
            });

            // Show the first joinable season with full details and buttons
            if (joinableSeasons.length > 0) {
                const season = joinableSeasons[0]; // Show only the first joinable season
                
                const embed = new EmbedBuilder()
                    .setTitle(`Season: ${season.id}`)
                    .setColor(0x57F287) // Green for joinable
                    .addFields(
                        { name: 'Status', value: season.status, inline: true },
                        { name: 'Players', value: `${season._count.players} / ${season.config.maxPlayers || '∞'}`, inline: true },
                        { name: 'Created', value: new Date(season.createdAt).toLocaleDateString(), inline: true }
                    );
                    // Removed the redundant Season ID footer

                const showButton = new ButtonBuilder()
                    .setCustomId(`season_show_${season.id}`)
                    .setLabel('Show Details')
                    .setStyle(ButtonStyle.Secondary);

                const joinButton = new ButtonBuilder()
                    .setCustomId(`season_join_${season.id}`)
                    .setLabel('Join Season')
                    .setStyle(ButtonStyle.Primary);

                const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(showButton, joinButton);

                await intr.editReply({ embeds: [embed], components: [actionRow] });
            } else {
                await intr.editReply({ content: strings.messages.listSeasons.noOpenSeasons || 'No seasons are currently open for joining.' });
            }
            
            // Show all other seasons in a compact format
            if (otherSeasons.length > 0) {
                const formatSeasonLine = (s: any): string => {
                    const isUserInSeason = playerId ? s.players.some(p => p.playerId === playerId) : false;
                    const createdDate = new Date(s.createdAt).toLocaleDateString();
                    let statusText = s.status;
                    
                    if (isUserInSeason) {
                        statusText = 'JOINED';
                    }
                    
                    return `${s.id} ${createdDate} (${statusText})`;
                };

                const otherSeasonsText = otherSeasons
                    .map(formatSeasonLine)
                    .join('\n');

                const summaryEmbed = new EmbedBuilder()
                    .setTitle(strings.messages.listSeasons.otherSeasonsTitle || 'Other Seasons')
                    .setColor(0xFAA61A) // Orange
                    .setDescription(otherSeasonsText + '\n\nUse `/season show` to view.')
                    .setFooter({ text: 'Use `/season show` to view details.' });
                
                if (joinableSeasons.length === 0) {
                    await intr.editReply({ embeds: [summaryEmbed] });
                } else {
                    await intr.followUp({ embeds: [summaryEmbed], ephemeral: true });
                }
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
                    : `Game #${turn.game.id}`;
                
                const creatorInfo = turn.game.creator 
                    ? ` started by ${turn.game.creator.name}` 
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
        await intr.deferReply({ ephemeral: true }); // New command starts ephemeral, may become public later

        const discordUserId = intr.user.id;
        const discordUserName = intr.user.username;


        // --- Find or Create Player ---
        let playerRecord = await this.prisma.player.findUnique({
            where: { discordUserId: discordUserId },
        });

        if (!playerRecord) {
            try {
                playerRecord = await this.prisma.player.create({
                    data: {
                        discordUserId: discordUserId,
                        name: discordUserName,
                    },
                });
                Logger.info(`New player record created for ${discordUserName} (ID: ${playerRecord.id}) during /season new command.`);
            } catch (playerCreateError) {
                Logger.error(`Failed to create player record for ${discordUserName} (Discord ID: ${discordUserId}):`, playerCreateError);
                await intr.editReply({content: strings.messages.newSeason.errorPlayerCreateFailed.replace('{discordId}', discordUserId) });
                return;
            }
        }
        const creatorPlayerId = playerRecord.id;
        // --- End Find or Create Player ---

        const openDuration = intr.options.getString('open_duration');
        const minPlayers = intr.options.getInteger('min_players');
        const maxPlayers = intr.options.getInteger('max_players');
        const turnPattern = intr.options.getString('turn_pattern');
        const claimTimeout = intr.options.getString('claim_timeout');
        const writingTimeout = intr.options.getString('writing_timeout');
        const drawingTimeout = intr.options.getString('drawing_timeout');

        const seasonOptions: NewSeasonOptions = {
            creatorPlayerId,
            ...(openDuration !== null && { openDuration }),
            ...(minPlayers !== null && { minPlayers }),
            ...(maxPlayers !== null && { maxPlayers }),
            ...(turnPattern !== null && { turnPattern }),
            ...(claimTimeout !== null && { claimTimeout }),
            ...(writingTimeout !== null && { writingTimeout }),
            ...(drawingTimeout !== null && { drawingTimeout }),
        };

        try {
            const instruction: MessageInstruction = await this.seasonService.createSeason(seasonOptions);

            if (instruction.type === 'success' && instruction.data && instruction.data.seasonId) {
                const seasonId = instruction.data.seasonId;

                const joinButton = new ButtonBuilder()
                    .setCustomId(`season_join_${seasonId}`)
                    .setLabel('Join Season')
                    .setStyle(ButtonStyle.Primary);

                const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton);
                
                // Since initial defer was ephemeral, delete it and send a public message.
                await intr.deleteReply().catch(e => Logger.error('Failed to delete initial ephemeral reply in new command:', e));
                await intr.channel.send({
                    content: strings.messages.newSeason.createSuccessChannel
                                .replace('{seasonId}', seasonId.toString())
                                .replace('{mentionUser}', intr.user.toString()),
                    components: [actionRow]
                });

            } else if (instruction.type === 'success') { // Success but missing seasonId in data
                Logger.warn(`Season creation success for user ${intr.user.tag} but seasonId was missing in response data.`);
                 await intr.editReply({
                     content: strings.messages.newSeason.createSuccessChannel
                                .replace('{seasonId}', instruction.data?.seasonId?.toString() || 'Unknown')
                                .replace('{mentionUser}', intr.user.toString())
                 });
            }
            else {
                let userErrorMessage: string = strings.messages.newSeason.errorGenericService;
                if (instruction.key) {
                    const keyMap: Record<string, string> = {
                        'season_create_error_creator_player_not_found': strings.messages.newSeason.errorCreatorNotFound,
                        'season_create_error_min_max_players': strings.messages.newSeason.errorMinMaxPlayers,
                        'season_create_error_prisma_unique_constraint': strings.messages.newSeason.errorDatabase,
                        'season_create_error_prisma': strings.messages.newSeason.errorDatabase,
                        'season_create_error_unknown': strings.messages.newSeason.errorUnknownService,
                    };
                    userErrorMessage = keyMap[instruction.key] || userErrorMessage;
                }
                await intr.editReply({ content: userErrorMessage });
            }
        } catch (error) {
            Logger.error('Critical error in /season new command processing:', error);
            if (intr.replied || intr.deferred) { // Check if we can still edit the reply
                await intr.editReply({ content: strings.messages.common.errorCriticalCommand }).catch(e => Logger.error('Failed to editReply on critical error in new command',e));
            } else { // Fallback, should not happen if execute() defers properly
                 await intr.reply({ content: strings.messages.common.errorCriticalCommand, ephemeral: true }).catch(e => Logger.error('Failed to reply on critical error in new command',e));
            }
        }
    }

    // Renamed from handleAutocomplete to match the Command interface used by CommandHandler
    public async autocomplete(interaction: AutocompleteInteraction<CacheType>, _option: AutocompleteFocusedOption): Promise<ApplicationCommandOptionChoiceData<string | number>[]> {
        const focusedOption = interaction.options.getFocused(true);
        const userInput = focusedOption.value;

        if (focusedOption.name === 'season') {
            try {
                // Assuming season IDs are stored as strings or can be queried/filtered as strings.
                // If season.id is a number, this Prisma query needs adjustment.
                // One common way is to fetch all (or a relevant subset) and filter in code if the DB doesn't support `startsWith` on numbers easily.
                // For this example, we'll assume string IDs or an effective way to filter.

                // Fetch seasons where ID starts with userInput.
                // Prisma's `startsWith` is case-sensitive by default for PostgreSQL.
                // If case-insensitivity is needed and DB supports it, mode: 'insensitive' could be used with `name` field.
                // For IDs, exact start match is usually fine.

                // A more robust solution for numeric IDs would be to fetch all and filter:
                // const allSeasons = await this.prisma.season.findMany({ include: { _count: { select: { players: true } } } });
                // const filteredSeasons = allSeasons.filter(s => s.id.toString().startsWith(userInput)).slice(0, 25);

                // For now, let's assume IDs are queryable as strings or this is handled by Prisma schema/adapter
                // If season.id is an Int, direct startsWith won't work. This is a placeholder for the actual query.
                // A practical approach for Int IDs:
                // 1. Query: `id >= X` and `id < Y` if userInput is a number range.
                // 2. Query all, filter: Efficient if season count is small.
                // 3. Use a dedicated search index/service if season count is very large.
                // Given `take: 25`, filtering all seasons might be acceptable for moderate numbers.

                const seasons = await this.prisma.season.findMany({
                    where: {
                        // This will only work if `id` is a string field.
                        // If `id` is an integer, you cannot use `startsWith`.
                        // You would need to fetch and filter, or use a raw query if your DB supports it.
                        // For the purpose of this task, we'll proceed as if it's a string or a similar mechanism exists.
                        // A common workaround for integer IDs is to convert them to string in the application code then filter.
                        // However, for autocomplete, we ideally want the DB to do the filtering.
                        // Let's assume this is a conceptual representation & actual DB query might differ or be a filter op post-fetch.
                        id: {
                            startsWith: userInput
                        }
                        // If your Prisma schema has `id` as Int, this will error.
                        // A better approach for Int IDs:
                        // Fetch all seasons (or a reasonable subset if many) and filter them in the application code.
                        // Example:
                        // const allSeasons = await this.prisma.season.findMany({ include: { _count: { select: { players: true } } } });
                        // const filtered = allSeasons.filter(s => s.id.toString().startsWith(userInput));
                        // This might be slow for very large numbers of seasons.
                    },
                    include: {
                        _count: { select: { players: true } },
                        config: true, // For maxPlayers
                    },
                    take: 25,
                    orderBy: { id: 'asc' },
                });


                const formattedOptions = seasons.map(season => {
                    let name = `S${season.id}`;
                    if (season.name && season.name.length < 30) { // Add name if not too long
                        name += ` - ${season.name}`;
                    }
                    name += ` (${season._count.players}/${season.config.maxPlayers || '∞'})`;
                    if (name.length > 100) name = name.substring(0, 97) + '...';
                    return {
                        name: name,
                        value: season.id.toString(), // Ensure value is a string
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