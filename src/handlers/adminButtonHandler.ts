import { ButtonInteraction, CacheType } from 'discord.js';
import { createRequire } from 'node:module';

import { ButtonHandler } from './buttonHandler.js';
import { strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js';
import { GameService } from '../services/GameService.js';
import { Logger } from '../services/index.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { SeasonService } from '../services/SeasonService.js';
import { SeasonTurnService } from '../services/SeasonTurnService.js';

const require = createRequire(import.meta.url);
let Config = require('../../config/config.json');

export class AdminButtonHandler implements ButtonHandler {
    customIdPrefix = 'admin_';

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        // Check if user has admin permissions
        if (!Config.developers.includes(interaction.user.id)) {
            await interaction.reply({ 
                content: strings.messages.admin.notAdmin, 
                ephemeral: true 
            });
            return;
        }

        const parts = interaction.customId.substring(this.customIdPrefix.length).split('_');
        const category = parts[0]; // e.g., 'season'
        const action = parts[1]; // e.g., 'terminate'
        const targetId = parts[2]; // e.g., season ID

        Logger.info(`AdminButtonHandler: User ${interaction.user.tag} (${interaction.user.id}) triggered ${category} ${action} for ${targetId}`);

        if (!targetId) {
            await interaction.reply({ 
                content: 'Could not determine the target for this action.', 
                ephemeral: true 
            });
            return;
        }

        switch (category) {
            case 'season':
                await this.handleSeasonAction(interaction, action, targetId);
                break;
            default:
                Logger.warn(`AdminButtonHandler: Unknown category '${category}' for action '${action}'`);
                await interaction.reply({ 
                    content: 'This action is not recognized.', 
                    ephemeral: true 
                });
        }
    }

    private async handleSeasonAction(interaction: ButtonInteraction<CacheType>, action: string, seasonId: string): Promise<void> {
        switch (action) {
            case 'terminate':
                await this.handleSeasonTerminate(interaction, seasonId);
                break;
            default:
                Logger.warn(`AdminButtonHandler: Unknown season action '${action}' for season ${seasonId}`);
                await interaction.reply({ 
                    content: 'This season action is not recognized.', 
                    ephemeral: true 
                });
        }
    }

    private async handleSeasonTerminate(interaction: ButtonInteraction<CacheType>, seasonId: string): Promise<void> {
        try {
            // Create service instances
            const schedulerService = new SchedulerService(prisma);
            const gameService = new GameService(prisma);
            const turnService = new SeasonTurnService(prisma, interaction.client, schedulerService);
            const seasonService = new SeasonService(prisma, turnService, schedulerService, gameService);

            const result = await seasonService.terminateSeason(seasonId);

            // Convert MessageInstruction to appropriate response
            if (result.type === 'success') {
                const content = this.getStringFromKey(result.key, result.data);
                await interaction.reply({ 
                    content: `✅ ${content}`, 
                    ephemeral: true 
                });
            } else {
                const content = this.getStringFromKey(result.key, result.data);
                await interaction.reply({ 
                    content: `❌ ${content}`, 
                    ephemeral: true 
                });
            }

        } catch (error) {
            Logger.error(`AdminButtonHandler: Error terminating season ${seasonId}:`, error);
            await interaction.reply({ 
                content: 'An error occurred while terminating the season. Please try again.', 
                ephemeral: true 
            });
        }
    }

    private getStringFromKey(key: string, data?: Record<string, unknown>): string {
        // Simple string replacement logic similar to admin-command.ts
        const parts = key.split('.');
        let current: any = strings;
        
        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return key; // Fallback to key if not found
            }
        }
        
        if (typeof current === 'string' && data) {
            let result = current;
            for (const [placeholder, value] of Object.entries(data)) {
                result = result.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), String(value));
            }
            return result;
        }
        
        return typeof current === 'string' ? current : key;
    }
} 