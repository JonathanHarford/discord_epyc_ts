import { PrismaClient } from '../../prisma/generated/index.js';
import { GameService } from './game-service.js';
import { PlayerService } from './player-service.js';
import { ServerService } from './server-service.js';
import { UtilityService } from './utility-service.js';

/**
 * Main database service that provides access to all database operations
 */
export class DatabaseService {
    private prisma: PrismaClient;
    
    public games: GameService;
    public players: PlayerService;
    public servers: ServerService;
    public utils: UtilityService;

    constructor(client?: PrismaClient) {
        this.prisma = client || new PrismaClient();
        
        // Initialize services
        this.games = new GameService(this.prisma);
        this.players = new PlayerService(this.prisma);
        this.servers = new ServerService(this.prisma);
        this.utils = new UtilityService();
    }
} 