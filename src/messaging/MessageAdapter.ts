import { 
  BaseMessageOptions, 
  Client,
  CommandInteraction, 
  EmbedBuilder, 
  InteractionEditReplyOptions, 
  InteractionReplyOptions
} from 'discord.js';

import { ErrorEventBus, ErrorEventType } from '../events/error-event-bus.js';
import { interpolate, strings } from '../lang/strings.js';
import { MessageInstruction } from '../types/MessageInstruction.js';
import { ErrorHandler, ErrorType } from '../utils/error-handler.js';
import { MessageUtils } from '../utils/message-utils.js';

/**
 * Platform-agnostic message adapter that converts MessageInstruction objects
 * into Discord-specific message formats and handles delivery.
 */
export class MessageAdapter {
  
  /**
   * Process a MessageInstruction and send the appropriate Discord message
   * Prefers ephemeral messages over DMs when interaction context is available (Task 71.1)
   * @param instruction The message instruction to process
   * @param interaction Optional Discord interaction for replies
   * @param langCode Language code for localization (deprecated, always uses 'en')
   * @param discordClient Optional Discord client for DM sending
   * @returns Promise that resolves when message is sent
   */
  public static async processInstruction(
    instruction: MessageInstruction,
    interaction?: CommandInteraction,
    langCode: string = 'en',
    discordClient?: Client // Discord Client instance for DM sending
  ): Promise<void> {
    const messageContent = this.generateMessageContent(instruction, langCode);
    
    if (instruction.formatting?.dm && instruction.context?.userId) {
      if (interaction && this.shouldPreferEphemeral(instruction, interaction)) {
        const ephemeralInstruction = {
          ...instruction,
          formatting: {
            ...instruction.formatting,
            dm: false,
            ephemeral: true
          }
        };
        await this.sendInteractionResponse(interaction, messageContent, ephemeralInstruction);
      } else {
        if (!discordClient) {
          throw new Error('Discord client required for DM sending');
        }
        await this.sendDirectMessage(instruction.context.userId, messageContent, instruction, discordClient);
      }
    } else if (interaction) {
      await this.sendInteractionResponse(interaction, messageContent, instruction);
    } else {
      throw new Error('No valid delivery method specified for message instruction');
    }
  }

  /**
   * Determine if ephemeral messages should be preferred over DMs
   * @param instruction The message instruction
   * @param interaction The Discord interaction
   * @returns True if ephemeral should be preferred
   */
  private static shouldPreferEphemeral(
    instruction: MessageInstruction,
    interaction: CommandInteraction
  ): boolean {
    if (interaction.guild) {
      if (instruction.type === 'error' || instruction.type === 'info' || instruction.type === 'warning') {
        return true;
      }
      
      const gameRelatedCommands = ['ready', 'status', 'turn', 'game', 'season'];
      if (instruction.context?.commandName && 
          gameRelatedCommands.some(cmd => instruction.context!.commandName!.includes(cmd))) {
        return true;
      }
      
      if (instruction.type === 'success') {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Generate the message content from a MessageInstruction
   * @param instruction The message instruction
   * @param langCode Language code for localization (deprecated, always uses 'en')
   * @returns The formatted message content
   */
  public static generateMessageContent(
    instruction: MessageInstruction,
    langCode: string = 'en'
  ): BaseMessageOptions {
    if (instruction.formatting?.embed) {
      // Try to get the string from the new strings system
      try {
        const text = this.getStringFromKey(instruction.key, instruction.data);
        const embed = this.createEmbed(instruction, text);
        return { embeds: [embed] };
      } catch (error) {
        // Enhanced logging for embed processing failures
        console.error(`[MessageAdapter] Failed to get string for key '${instruction.key}':`, {
          key: instruction.key,
          langCode,
          data: instruction.data,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
        });
        
        // Log the error and emit an error event for monitoring
        const errorInfo = ErrorHandler.createCustomError(
          ErrorType.LOCALIZATION_ERROR,
          'LOCALIZATION_FAILURE',
          `Failed to load language key: ${instruction.key}`,
          'An error occurred while processing your request. Please try again later.',
          { key: instruction.key, instruction }
        );
        
        const eventBus = ErrorEventBus.getInstance();
        eventBus.publishError(
          ErrorEventType.MESSAGE_ERROR,
          errorInfo,
          { source: 'MessageAdapter.generateMessageContent', key: instruction.key }
        );
        
        // Last resort: create a basic error embed with generic message
        const embed = this.createEmbed(instruction, 'An error occurred while processing your request. Please try again later.');
        return { embeds: [embed] };
      }
    }
    
    const text = this.getStringFromKey(instruction.key, instruction.data);
    return { content: text };
  }

  /**
   * Get a string from the new strings system using a key
   * @param key The string key (e.g., 'messages.admin.success')
   * @param data Variables for interpolation
   * @returns The interpolated string
   */
  private static getStringFromKey(key: string, data?: Record<string, unknown>): string {
    // Navigate through the strings object using the key path
    const keyParts = key.split('.');
    let value: unknown = strings;
    
    for (const part of keyParts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        throw new Error(`String key not found: ${key}`);
      }
    }
    
    if (typeof value !== 'string') {
      throw new Error(`String key does not resolve to a string: ${key}`);
    }
    
    return data ? interpolate(value, data) : value;
  }

  /**
   * Create an embed based on the message instruction
   * @param instruction The message instruction
   * @param text The localized text content
   * @returns EmbedBuilder instance
   */
  private static createEmbed(instruction: MessageInstruction, text: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setDescription(text)
      .setTimestamp();

    // Set color based on message type
    switch (instruction.type) {
      case 'success':
        embed.setColor(0x00ff00); // Green
        break;
      case 'error':
        embed.setColor(0xff0000); // Red
        break;
      case 'warning':
        embed.setColor(0xffaa00); // Orange
        break;
      case 'info':
        embed.setColor(0x0099ff); // Blue
        break;
      default:
        embed.setColor(0x808080); // Gray
    }

    // Add title if specified in data
    if (instruction.data?.title) {
      embed.setTitle(instruction.data.title);
    }

    return embed;
  }

  /**
   * Send a direct message to a user
   * @param userId Discord user ID
   * @param content Message content
   * @param instruction Original instruction for context
   * @param discordClient Discord client instance
   */
  private static async sendDirectMessage(
    userId: string,
    content: BaseMessageOptions,
    instruction: MessageInstruction,
    discordClient: Client // Discord Client instance for DM sending
  ): Promise<void> {
    try {
      const user = await discordClient.users.fetch(userId);
      await MessageUtils.send(user, content);
      console.log(`[MessageAdapter] Successfully sent DM to user ${userId}`);
    } catch (error) {
      console.error(`[MessageAdapter] Failed to send DM to user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Send a response via Discord interaction
   * @param interaction The Discord interaction
   * @param content Message content
   * @param instruction Original instruction for context
   */
  private static async sendInteractionResponse(
    interaction: CommandInteraction,
    content: BaseMessageOptions,
    instruction: MessageInstruction
  ): Promise<void> {
    const options: InteractionReplyOptions = {
      ...content,
      ephemeral: instruction.formatting?.ephemeral ?? false
    };

    try {
      if (instruction.formatting?.followUp) {
        await interaction.followUp(options);
      } else if (interaction.replied || interaction.deferred) {
        await interaction.editReply(options as InteractionEditReplyOptions);
      } else {
        await interaction.reply(options);
      }
    } catch (error) {
      console.error('[MessageAdapter] Failed to send interaction response:', error);
      
      // Try a fallback approach for critical errors
      if (instruction.type === 'error' && !interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content: 'An error occurred while processing your request.',
            ephemeral: true
          });
        } catch (fallbackError) {
          console.error('[MessageAdapter] Fallback response also failed:', fallbackError);
        }
      }
      
      throw error;
    }
  }

  /**
   * Validate a MessageInstruction for completeness
   * @param instruction The instruction to validate
   * @returns True if valid, throws error if invalid
   */
  public static validateInstruction(instruction: MessageInstruction): boolean {
    if (!instruction.key) {
      throw new Error('MessageInstruction must have a language key');
    }

    if (instruction.formatting?.dm && !instruction.context?.userId) {
      throw new Error('DM instructions must specify a target userId in context');
    }

    return true;
  }

  /**
   * Create a standardized success instruction
   * @param key Language key
   * @param data Placeholder data
   * @param formatting Optional formatting options
   * @returns MessageInstruction
   */
  public static createSuccessInstruction(
    key: string,
    data?: Record<string, any>,
    formatting?: MessageInstruction['formatting']
  ): MessageInstruction {
    return {
      type: 'success',
      key,
      data,
      formatting
    };
  }

  /**
   * Create a standardized error instruction
   * @param key Language key
   * @param data Placeholder data
   * @param formatting Optional formatting options
   * @returns MessageInstruction
   */
  public static createErrorInstruction(
    key: string,
    data?: Record<string, any>,
    formatting?: MessageInstruction['formatting']
  ): MessageInstruction {
    return {
      type: 'error',
      key,
      data,
      formatting
    };
  }

  /**
   * Handle errors that occur during message processing
   * @param error The error that occurred
   * @param interaction Optional interaction for error reporting
   * @param context Additional context
   */
  public static async handleMessageError(
    error: Error,
    interaction?: CommandInteraction,
    context?: Record<string, any>
  ): Promise<void> {
    console.error('[MessageAdapter] Message processing error:', error, context);
    
    // Create error info and publish to event bus
    const errorInfo = ErrorHandler.createCustomError(
      ErrorType.DISCORD_API,
      'MESSAGE_ADAPTER_ERROR',
      error.message,
      'There was an error processing your message. Please try again.',
      context
    );
    
    const eventBus = ErrorEventBus.getInstance();
    eventBus.publishError(
      ErrorEventType.MESSAGE_ERROR,
      errorInfo,
      { source: 'MessageAdapter', ...context },
      interaction?.user.id,
      interaction?.guild?.id,
      interaction?.channel?.id
    );
    
    if (interaction && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: 'Sorry, there was an error processing your message. Please try again.',
          ephemeral: true
        });
      } catch (replyError) {
        console.error('[MessageAdapter] Failed to send error reply:', replyError);
      }
    }
  }

  /**
   * Safely process a message instruction with error handling
   * @param instruction The message instruction to process
   * @param interaction Optional Discord interaction for replies
   * @param langCode Language code for localization
   * @param discordClient Optional Discord client for DM sending
   * @returns Promise that resolves when message is sent
   */
  public static async safeProcessInstruction(
    instruction: MessageInstruction,
    interaction?: CommandInteraction,
    langCode: string = 'en',
    discordClient?: Client // Discord Client instance for DM sending
  ): Promise<boolean> {
    try {
      await this.processInstruction(instruction, interaction, langCode, discordClient);
      return true;
    } catch (error) {
      await this.handleMessageError(error instanceof Error ? error : new Error(String(error)), interaction, {
        instructionType: instruction.type,
        instructionKey: instruction.key
      });
      return false;
    }
  }
} 