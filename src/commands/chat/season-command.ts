import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { strings } from '../../lang/strings.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { EventData } from '../../models/internal-models.js';
import { PlayerTurnService } from '../../services/PlayerTurnService.js';
import { NewSeasonOptions, SeasonService } from '../../services/SeasonService.js';
import { MessageInstruction } from '../../types/MessageInstruction.js';
import { Command, CommandDeferType } from '../index.js';

export class SeasonCommand implements Command {
    public names = [strings.chatCommands.season];
    public cooldown = new RateLimiter(1, 5000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = [];

    constructor(
        private prisma: any, // Keep this as it's used in the constructor
        private seasonService: SeasonService,
        private playerTurnService: PlayerTurnService
    ) {}

    public async execute(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        const subcommand = intr.options.getSubcommand();

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
        console.log(`[SeasonCommand] Executing /season list command for user: ${intr.user.id}, username: ${intr.user.username}`);
        
        try {
            // Get the player record for this user
            const player = await this.prisma.player.findUnique({
                where: { discordUserId: intr.user.id }
            });

            // Get all open seasons (public)
            const openSeasons = await this.prisma.season.findMany({
                where: { 
                    status: 'OPEN'
                },
                include: {
                    config: true,
                    _count: {
                        select: { players: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            // Get seasons the user is participating in (if they have a player record)
            const userSeasons = player ? await this.prisma.season.findMany({
                where: {
                    players: {
                        some: {
                            playerId: player.id
                        }
                    },
                    status: { not: 'TERMINATED' } // Exclude terminated seasons
                },
                include: {
                    config: true,
                    _count: {
                        select: { players: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }) : [];

            // Format open seasons
            const openSeasonsText = openSeasons.length === 0 
                ? 'No open seasons available to join.'
                : openSeasons.map(season => {
                    const createdDate = new Date(season.createdAt).toISOString().split('T')[0];
                    return `**${season.id}** (${createdDate}) - ${season._count.players}/${season.config.minPlayers}-${season.config.maxPlayers} players`;
                }).join('\n');

            // Format user's seasons (exclude duplicates that are already in open seasons)
            const userSeasonsFiltered = userSeasons.filter(season => 
                !openSeasons.some(openSeason => openSeason.id === season.id)
            );
            
            const userSeasonsText = userSeasonsFiltered.length === 0 
                ? (player ? 'You are not participating in any other seasons.' : 'You are not participating in any seasons.')
                : userSeasonsFiltered.map(season => {
                    const createdDate = new Date(season.createdAt).toISOString().split('T')[0];
                    return `**${season.id}** (${createdDate}) - ${season.status} - ${season._count.players}/${season.config.minPlayers}-${season.config.maxPlayers} players`;
                }).join('\n');

            // Create the response message
            let message = `**Available Seasons**\n\n**🟢 Open Seasons (Join with \`/season join\`):**\n${openSeasonsText}`;
            
            if (player && (userSeasonsFiltered.length > 0 || userSeasons.some(s => openSeasons.some(os => os.id === s.id)))) {
                message += `\n\n**📋 Your Seasons:**\n${userSeasonsText}`;
                
                // Add note about open seasons user is already in
                const userOpenSeasons = userSeasons.filter(season => 
                    openSeasons.some(openSeason => openSeason.id === season.id)
                );
                if (userOpenSeasons.length > 0) {
                    message += `\n\n*You are already participating in ${userOpenSeasons.length} of the open season${userOpenSeasons.length > 1 ? 's' : ''} listed above.*`;
                }
            }

            await SimpleMessage.sendInfo(intr, message, {}, false); // Not ephemeral, so others can see available seasons
        } catch (error) {
            console.error('Error in /season list command:', error);
            await SimpleMessage.sendError(intr, strings.messages.common.errorCriticalCommand, {}, true);
        }
    }

    private async handleShowCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        console.log(`[SeasonCommand] Executing /season show command for user: ${intr.user.id}, username: ${intr.user.username}`);
        const seasonId = intr.options.getString('season', true);
        console.log(`[SeasonCommand] Received season: ${seasonId}`);

        try {
            // Get season details including config and player count
            const season = await this.seasonService.findSeasonById(seasonId);
            
            if (!season) {
                await SimpleMessage.sendError(intr, strings.messages.status.seasonNotFound, { seasonId }, true);
                return;
            }

            // Get all games for this season with their turns
            const games = await this.prisma.game.findMany({
                where: { seasonId },
                include: {
                    turns: {
                        orderBy: { turnNumber: 'asc' },
                        include: {
                            player: {
                                select: { name: true, discordUserId: true }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'asc' }
            });

            // Calculate status information
            const gameDetails = games.map(game => {
                const turns = game.turns;
                const pendingTurns = turns.filter(turn => turn.status === 'PENDING').length;
                const offeredTurns = turns.filter(turn => turn.status === 'OFFERED').length;
                const completedTurns = turns.filter(turn => turn.status === 'COMPLETED').length;
                const totalTurns = turns.length;
                
                // Find current turn (most recent non-completed turn)
                const currentTurn = turns.find(turn => 
                    turn.status === 'PENDING' || turn.status === 'OFFERED'
                );

                let gameInfo = `**Game ${game.id}** (${game.status})\n`;
                gameInfo += `Turns: ${completedTurns}/${totalTurns} completed`;
                if (pendingTurns > 0) gameInfo += `, ${pendingTurns} pending`;
                if (offeredTurns > 0) gameInfo += `, ${offeredTurns} offered`;
                
                if (currentTurn) {
                    gameInfo += `\nCurrent: Turn ${currentTurn.turnNumber} (${currentTurn.type}) - ${currentTurn.player?.name || 'Unknown'} (${currentTurn.status})`;
                }
                
                return gameInfo;
            }).join('\n\n');

            // Calculate completion percentage for active/pending seasons
            let pcComplete = '';
            if (season.status === 'ACTIVE' || season.status === 'PENDING') {
                // Get all turns for this season
                const allTurns = await this.prisma.turn.findMany({
                    where: {
                        game: {
                            seasonId: season.id
                        }
                    }
                });
                
                const completedTurns = allTurns.filter(turn => turn.status === 'COMPLETED').length;
                const totalTurns = allTurns.length;
                
                if (totalTurns > 0) {
                    const percentage = Math.round((completedTurns / totalTurns) * 100);
                    pcComplete = `(${percentage}%)`;
                }
            }

            await SimpleMessage.sendEmbed(intr, strings.embeds.seasonStatus, {
                seasonId: season.id,
                seasonStatus: season.status,
                pcComplete: pcComplete,
                playerCount: season._count.players,
                minPlayers: season.config.minPlayers,
                maxPlayers: season.config.maxPlayers,
                gameCount: games.length,
                gameDetails: gameDetails || 'No games found'
            }, false, 'info'); // Not ephemeral, so others can see the status
            
        } catch (error) {
            console.error('Error in /season show command:', error);
            await SimpleMessage.sendError(intr, strings.messages.status.genericError, { 
                seasonId, 
                errorMessage: error instanceof Error ? error.message : 'Unknown error' 
            }, true);
        }
    }

    private async handleJoinCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        console.log(`[SeasonCommand] Executing /season join command for user: ${intr.user.id}, username: ${intr.user.username}`);
        const seasonId = intr.options.getString('season', true);
        const discordUserId = intr.user.id;
        console.log(`[SeasonCommand] Received season: ${seasonId}, discordUserId: ${discordUserId}`);

        try {
            // Check if user has pending turns before allowing them to join a season
            const pendingCheck = await this.playerTurnService.checkPlayerPendingTurns(discordUserId);
            
            if (pendingCheck.error) {
                await SimpleMessage.sendError(intr, 'Failed to check your turn status. Please try again.', {}, true);
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
                        await SimpleMessage.sendSuccess(
                            intr,
                            strings.messages.joinSeason.success,
                            { ...result.data, seasonId },
                            false
                        );
                    } else {
                        await SimpleMessage.sendError(
                            intr,
                            strings.messages.joinSeason.genericError,
                            { seasonId, errorMessage: result.key },
                            true
                        );
                    }
                    
                } catch (error) {
                    console.error('Error creating player record:', error);
                    await SimpleMessage.sendError(
                        intr,
                        strings.messages.joinSeason.genericError,
                        {
                            seasonId,
                            errorMessage: error instanceof Error ? error.message : 'Unknown error'
                        },
                        true
                    );
                }
                return;
            }
            
            const result = await this.seasonService.addPlayerToSeason(player.id, seasonId);
            
            if (result.type === 'success') {
                await SimpleMessage.sendSuccess(
                    intr,
                    strings.messages.joinSeason.success,
                    { ...result.data, seasonId },
                    false
                );
            } else {
                await SimpleMessage.sendError(
                    intr,
                    strings.messages.joinSeason.genericError,
                    { seasonId, errorMessage: result.key },
                    true
                );
            }
            
        } catch (error) {
            console.error('Error in /season join command:', error);
            await SimpleMessage.sendError(
                intr,
                strings.messages.joinSeason.genericError,
                { 
                    seasonId, 
                    errorMessage: error instanceof Error ? error.message : 'Unknown error' 
                },
                true
            );
        }
    }

    private async handleNewCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        console.log(`[SeasonCommand] Executing /season new command for user: ${intr.user.id}, username: ${intr.user.username}`);
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
                console.log(`New player record created for ${discordUserName} (ID: ${playerRecord.id}) during /season new command.`);
            } catch (playerCreateError) {
                console.error(`Failed to create player record for ${discordUserName} (Discord ID: ${discordUserId}):`, playerCreateError);
                
                await SimpleMessage.sendError(
                    intr,
                    strings.messages.newSeason.errorPlayerCreateFailed,
                    { discordId: discordUserId }
                );
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

            if (instruction.type === 'success') {
                // Send success message with user mention
                await SimpleMessage.sendSuccess(
                    intr,
                    strings.messages.newSeason.createSuccessChannel,
                    { 
                        ...instruction.data, 
                        mentionUser: intr.user.toString() 
                    }
                );
            } else {
                // Handle different error types
                let errorMessage: string;
                
                if (instruction.key === 'season_create_error_creator_player_not_found') {
                    errorMessage = strings.messages.newSeason.errorCreatorNotFound;
                } else if (instruction.key === 'season_create_error_min_max_players') {
                    errorMessage = strings.messages.newSeason.errorMinMaxPlayers;
                } else if (instruction.key === 'season_create_error_prisma_unique_constraint' || instruction.key === 'season_create_error_prisma') {
                    errorMessage = strings.messages.newSeason.errorDatabase;
                } else if (instruction.key === 'season_create_error_unknown') {
                    errorMessage = strings.messages.newSeason.errorUnknownService;
                } else {
                    errorMessage = strings.messages.newSeason.errorGenericService;
                }
                
                await SimpleMessage.sendError(intr, errorMessage, instruction.data);
            }
        } catch (error) {
            console.error('Critical error in /season new command processing:', error);
            await SimpleMessage.sendError(intr, strings.messages.common.errorCriticalCommand);
        }
    }
}

export default SeasonCommand; 