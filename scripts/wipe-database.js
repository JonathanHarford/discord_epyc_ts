#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables
config();

const prisma = new PrismaClient();

async function wipeDatabase() {
    console.log('🗑️  Starting database wipe...');
    
    try {
        // Disable foreign key constraints temporarily for PostgreSQL
        await prisma.$executeRaw`SET session_replication_role = replica;`;
        
        console.log('📋 Deleting all data from tables...');
        
        // Delete in order to respect foreign key constraints
        // Start with dependent tables first
        await prisma.turn.deleteMany();
        console.log('   ✅ Turns deleted');
        
        await prisma.game.deleteMany();
        console.log('   ✅ Games deleted');
        
        await prisma.playersOnSeasons.deleteMany();
        console.log('   ✅ PlayersOnSeasons deleted');
        
        await prisma.season.deleteMany();
        console.log('   ✅ Seasons deleted');
        
        await prisma.player.deleteMany();
        console.log('   ✅ Players deleted');
        
        await prisma.seasonConfig.deleteMany();
        console.log('   ✅ SeasonConfigs deleted');
        
        await prisma.gameConfig.deleteMany();
        console.log('   ✅ GameConfigs deleted');
        
        await prisma.scheduledJob.deleteMany();
        console.log('   ✅ ScheduledJobs deleted');
        
        await prisma.channelConfig.deleteMany();
        console.log('   ✅ ChannelConfigs deleted');
        
        // Re-enable foreign key constraints
        await prisma.$executeRaw`SET session_replication_role = DEFAULT;`;
        
        console.log('✨ Database wipe completed successfully!');
        console.log('📊 All tables are now empty but schema structure is preserved.');
        
    } catch (error) {
        console.error('❌ Error wiping database:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    wipeDatabase().catch((error) => {
        console.error('❌ Unhandled error:', error);
        process.exit(1);
    });
}

export { wipeDatabase }; 