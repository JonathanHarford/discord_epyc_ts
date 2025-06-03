import { GameConfig, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { MessageHelpers, MessageInstruction } from '../messaging/index.js';
import { TurnPatternValidationError, validateTurnPattern } from '../utils/turn-pattern-validation.js';

export interface GameConfigUpdateOptions {
  turnPattern?: string;
  writingTimeout?: string;
  writingWarning?: string;
  drawingTimeout?: string;
  drawingWarning?: string;
  staleTimeout?: string;
  minTurns?: number;
  maxTurns?: number;
  returnCount?: number;
  returnCooldown?: number;
}

export class GameConfigService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Gets the default game configuration for a guild.
   * If no guild-specific default exists, returns the system defaults.
   * @param guildId The Discord guild ID
   * @returns The default GameConfig for the guild
   */
  async getGuildDefaultConfig(guildId: string): Promise<GameConfig> {
    console.log(`GameConfigService.getGuildDefaultConfig: Getting default config for guild ${guildId}`);
    
    try {
      // First, try to find a guild-specific default
      const guildDefault = await this.prisma.gameConfig.findUnique({
        where: { isGuildDefaultFor: guildId }
      });

      if (guildDefault) {
        console.log(`GameConfigService.getGuildDefaultConfig: Found guild-specific default for guild ${guildId}`);
        return guildDefault;
      }

      // If no guild-specific default, create one with system defaults
      console.log(`GameConfigService.getGuildDefaultConfig: No guild-specific default found, creating one for guild ${guildId}`);
      const newGuildDefault = await this.prisma.gameConfig.create({
        data: {
          isGuildDefaultFor: guildId,
          // All other fields will use their schema defaults
        }
      });

      return newGuildDefault;
    } catch (error) {
      console.error(`GameConfigService.getGuildDefaultConfig: Error getting config for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Updates the default game configuration for a guild.
   * @param guildId The Discord guild ID
   * @param updates The configuration updates to apply
   * @returns MessageInstruction indicating success or failure
   */
  async updateGuildDefaultConfig(guildId: string, updates: GameConfigUpdateOptions): Promise<MessageInstruction> {
    console.log(`GameConfigService.updateGuildDefaultConfig: Updating config for guild ${guildId}`, updates);

    try {
      // Validate the updates
      const validationResult = this.validateConfigUpdates(updates);
      if (!validationResult.isValid) {
        return MessageHelpers.embedMessage('error', 'messages.config.validationError', {
          field: validationResult.field,
          error: validationResult.error
        }, true);
      }

      // Get or create the guild default config
      let guildConfig = await this.prisma.gameConfig.findUnique({
        where: { isGuildDefaultFor: guildId }
      });

      if (!guildConfig) {
        // Create a new guild default config
        guildConfig = await this.prisma.gameConfig.create({
          data: {
            isGuildDefaultFor: guildId,
            ...updates
          }
        });
      } else {
        // Update the existing guild default config
        guildConfig = await this.prisma.gameConfig.update({
          where: { id: guildConfig.id },
          data: updates
        });
      }

      console.log(`GameConfigService.updateGuildDefaultConfig: Successfully updated config for guild ${guildId}`);
      return MessageHelpers.embedMessage('success', 'messages.config.updateSuccess', {
        guildId,
        updatedFields: Object.keys(updates).join(', ')
      }, true);

    } catch (error) {
      console.error(`GameConfigService.updateGuildDefaultConfig: Error updating config for guild ${guildId}:`, error);
      
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return MessageHelpers.embedMessage('error', 'messages.config.databaseError', {
          errorCode: error.code,
          message: error.message
        }, true);
      }

      return MessageHelpers.embedMessage('error', 'messages.config.unknownError', {
        message: error instanceof Error ? error.message : 'Unknown error'
      }, true);
    }
  }

  /**
   * Validates game configuration update options.
   * @param updates The configuration updates to validate
   * @returns Validation result with isValid flag and error details if invalid
   */
  private validateConfigUpdates(updates: GameConfigUpdateOptions): { isValid: boolean; field?: string; error?: string } {
    // Validate minTurns and maxTurns
    if (updates.minTurns !== undefined) {
      if (updates.minTurns < 1) {
        return { isValid: false, field: 'minTurns', error: 'Must be at least 1' };
      }
      if (updates.minTurns > 100) {
        return { isValid: false, field: 'minTurns', error: 'Must be 100 or less' };
      }
    }

    if (updates.maxTurns !== undefined) {
      if (updates.maxTurns !== null && updates.maxTurns < 1) {
        return { isValid: false, field: 'maxTurns', error: 'Must be at least 1 or null for unlimited' };
      }
      if (updates.maxTurns !== null && updates.maxTurns > 1000) {
        return { isValid: false, field: 'maxTurns', error: 'Must be 1000 or less' };
      }
    }

    // Validate that minTurns <= maxTurns if both are provided
    if (updates.minTurns !== undefined && updates.maxTurns !== undefined && updates.maxTurns !== null) {
      if (updates.minTurns > updates.maxTurns) {
        return { isValid: false, field: 'minTurns', error: 'Must be less than or equal to maxTurns' };
      }
    }

    // Validate return settings
    if (updates.returnCount !== undefined) {
      if (updates.returnCount !== null && updates.returnCount < 0) {
        return { isValid: false, field: 'returnCount', error: 'Must be 0 or greater, or null to disable returns' };
      }
      if (updates.returnCount !== null && updates.returnCount > 50) {
        return { isValid: false, field: 'returnCount', error: 'Must be 50 or less' };
      }
    }

    if (updates.returnCooldown !== undefined) {
      if (updates.returnCooldown !== null && updates.returnCooldown < 0) {
        return { isValid: false, field: 'returnCooldown', error: 'Must be 0 or greater, or null for no cooldown' };
      }
      if (updates.returnCooldown !== null && updates.returnCooldown > 100) {
        return { isValid: false, field: 'returnCooldown', error: 'Must be 100 or less' };
      }
    }

    // Validate timeout formats (basic validation - should be duration strings like "1d", "2h", etc.)
    const timeoutFields = ['writingTimeout', 'writingWarning', 'drawingTimeout', 'drawingWarning', 'staleTimeout'];
    for (const field of timeoutFields) {
      const value = updates[field as keyof GameConfigUpdateOptions] as string;
      if (value !== undefined && !this.isValidDurationString(value)) {
        return { isValid: false, field, error: 'Invalid duration format (use format like "1d", "2h", "30m")' };
      }
    }

    // Validate turnPattern using the new robust validation function
    if (updates.turnPattern !== undefined) {
      try {
        validateTurnPattern(updates.turnPattern);
      } catch (error) {
        if (error instanceof TurnPatternValidationError) {
          return { isValid: false, field: 'turnPattern', error: error.message };
        }
        return { isValid: false, field: 'turnPattern', error: 'Invalid turn pattern format' };
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
   * Formats a GameConfig object for display.
   * @param config The GameConfig to format
   * @returns Formatted configuration data for display
   */
  formatConfigForDisplay(config: GameConfig): Record<string, any> {
    return {
      turnPattern: config.turnPattern,
      writingTimeout: config.writingTimeout,
      writingWarning: config.writingWarning,
      drawingTimeout: config.drawingTimeout,
      drawingWarning: config.drawingWarning,
      staleTimeout: config.staleTimeout,
      minTurns: config.minTurns,
      maxTurns: config.maxTurns || 'unlimited',
      returnCount: config.returnCount || 'disabled',
      returnCooldown: config.returnCooldown || 'none',
      isGuildDefault: config.isGuildDefaultFor ? 'Yes' : 'No',
      lastUpdated: config.updatedAt.toISOString()
    };
  }
} 