import { PrismaClient, SeasonConfig, Prisma } from '@prisma/client';
import { MessageInstruction } from '../types/MessageInstruction.js';
import { MessageHelpers } from '../messaging/MessageHelpers.js';
import { LangKeys } from '../constants/lang-keys.js';

export interface ConfigUpdateOptions {
  turnPattern?: string;
  claimTimeout?: string;
  writingTimeout?: string;
  writingWarning?: string;
  drawingTimeout?: string;
  drawingWarning?: string;
  openDuration?: string;
  minPlayers?: number;
  maxPlayers?: number;
}

export class ConfigService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Gets the default season configuration for a guild.
   * If no guild-specific default exists, returns the system defaults.
   * @param guildId The Discord guild ID
   * @returns The default SeasonConfig for the guild
   */
  async getGuildDefaultConfig(guildId: string): Promise<SeasonConfig> {
    console.log(`ConfigService.getGuildDefaultConfig: Getting default config for guild ${guildId}`);
    
    try {
      // First, try to find a guild-specific default
      const guildDefault = await this.prisma.seasonConfig.findUnique({
        where: { isGuildDefaultFor: guildId }
      });

      if (guildDefault) {
        console.log(`ConfigService.getGuildDefaultConfig: Found guild-specific default for guild ${guildId}`);
        return guildDefault;
      }

      // If no guild-specific default, create one with system defaults
      console.log(`ConfigService.getGuildDefaultConfig: No guild-specific default found, creating one for guild ${guildId}`);
      const newGuildDefault = await this.prisma.seasonConfig.create({
        data: {
          isGuildDefaultFor: guildId,
          // All other fields will use their schema defaults
        }
      });

      return newGuildDefault;
    } catch (error) {
      console.error(`ConfigService.getGuildDefaultConfig: Error getting config for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Updates the default season configuration for a guild.
   * @param guildId The Discord guild ID
   * @param updates The configuration updates to apply
   * @returns MessageInstruction indicating success or failure
   */
  async updateGuildDefaultConfig(guildId: string, updates: ConfigUpdateOptions): Promise<MessageInstruction> {
    console.log(`ConfigService.updateGuildDefaultConfig: Updating config for guild ${guildId}`, updates);

    try {
      // Validate the updates
      const validationResult = this.validateConfigUpdates(updates);
      if (!validationResult.isValid) {
        return MessageHelpers.embedMessage('error', LangKeys.Commands.Config.ValidationError, {
          field: validationResult.field,
          error: validationResult.error
        }, true);
      }

      // Get or create the guild default config
      let guildConfig = await this.prisma.seasonConfig.findUnique({
        where: { isGuildDefaultFor: guildId }
      });

      if (!guildConfig) {
        // Create a new guild default config
        guildConfig = await this.prisma.seasonConfig.create({
          data: {
            isGuildDefaultFor: guildId,
            ...updates
          }
        });
      } else {
        // Update the existing guild default config
        guildConfig = await this.prisma.seasonConfig.update({
          where: { id: guildConfig.id },
          data: updates
        });
      }

      console.log(`ConfigService.updateGuildDefaultConfig: Successfully updated config for guild ${guildId}`);
      return MessageHelpers.embedMessage('success', LangKeys.Commands.Config.UpdateSuccess, {
        guildId,
        updatedFields: Object.keys(updates).join(', ')
      }, true);

    } catch (error) {
      console.error(`ConfigService.updateGuildDefaultConfig: Error updating config for guild ${guildId}:`, error);
      
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return MessageHelpers.embedMessage('error', LangKeys.Commands.Config.DatabaseError, {
          errorCode: error.code,
          message: error.message
        }, true);
      }

      return MessageHelpers.embedMessage('error', LangKeys.Commands.Config.UnknownError, {
        message: error instanceof Error ? error.message : 'Unknown error'
      }, true);
    }
  }

  /**
   * Validates configuration update options.
   * @param updates The configuration updates to validate
   * @returns Validation result with isValid flag and error details if invalid
   */
  private validateConfigUpdates(updates: ConfigUpdateOptions): { isValid: boolean; field?: string; error?: string } {
    // Validate minPlayers and maxPlayers
    if (updates.minPlayers !== undefined) {
      if (updates.minPlayers < 1) {
        return { isValid: false, field: 'minPlayers', error: 'Must be at least 1' };
      }
      if (updates.minPlayers > 100) {
        return { isValid: false, field: 'minPlayers', error: 'Must be 100 or less' };
      }
    }

    if (updates.maxPlayers !== undefined) {
      if (updates.maxPlayers < 1) {
        return { isValid: false, field: 'maxPlayers', error: 'Must be at least 1' };
      }
      if (updates.maxPlayers > 100) {
        return { isValid: false, field: 'maxPlayers', error: 'Must be 100 or less' };
      }
    }

    // Validate that minPlayers <= maxPlayers if both are provided
    if (updates.minPlayers !== undefined && updates.maxPlayers !== undefined) {
      if (updates.minPlayers > updates.maxPlayers) {
        return { isValid: false, field: 'minPlayers', error: 'Must be less than or equal to maxPlayers' };
      }
    }

    // Validate timeout formats (basic validation - should be duration strings like "1d", "2h", etc.)
    const timeoutFields = ['claimTimeout', 'writingTimeout', 'writingWarning', 'drawingTimeout', 'drawingWarning', 'openDuration'];
    for (const field of timeoutFields) {
      const value = updates[field as keyof ConfigUpdateOptions] as string;
      if (value !== undefined && !this.isValidDurationString(value)) {
        return { isValid: false, field, error: 'Invalid duration format (use format like "1d", "2h", "30m")' };
      }
    }

    // Validate turnPattern
    if (updates.turnPattern !== undefined) {
      const validPatterns = /^(writing|drawing)(,(writing|drawing))*$/;
      if (!validPatterns.test(updates.turnPattern)) {
        return { isValid: false, field: 'turnPattern', error: 'Must be comma-separated list of "writing" and "drawing"' };
      }
    }

    return { isValid: true };
  }

  /**
   * Basic validation for duration strings.
   * @param duration The duration string to validate
   * @returns True if the duration string appears valid
   */
  private isValidDurationString(duration: string): boolean {
    // Basic regex for duration strings like "1d", "2h", "30m", "45s"
    const durationRegex = /^\d+[dhms]$/;
    return durationRegex.test(duration);
  }

  /**
   * Formats a SeasonConfig object for display.
   * @param config The SeasonConfig to format
   * @returns Formatted configuration data for display
   */
  formatConfigForDisplay(config: SeasonConfig): Record<string, any> {
    return {
      turnPattern: config.turnPattern,
      claimTimeout: config.claimTimeout,
      writingTimeout: config.writingTimeout,
      writingWarning: config.writingWarning,
      drawingTimeout: config.drawingTimeout,
      drawingWarning: config.drawingWarning,
      openDuration: config.openDuration,
      minPlayers: config.minPlayers,
      maxPlayers: config.maxPlayers,
      isGuildDefault: config.isGuildDefaultFor ? 'Yes' : 'No',
      lastUpdated: config.updatedAt.toISOString()
    };
  }
} 