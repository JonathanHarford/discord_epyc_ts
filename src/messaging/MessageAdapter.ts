import { 
  ChatInputCommandInteraction, 
  UserContextMenuCommandInteraction,
  MessageContextMenuCommandInteraction,
  EmbedBuilder, 
  User, 
  TextChannel, 
  BaseMessageOptions,
  InteractionReplyOptions,
  InteractionEditReplyOptions,
  MessageCreateOptions,
  CommandInteraction
} from 'discord.js';
import { MessageInstruction } from '../types/MessageInstruction.js';
import { Lang } from '../services/lang.js';
import { Language } from '../models/enum-helpers/language.js';
import { MessageUtils } from '../utils/message-utils.js';

/**
 * Platform-agnostic message adapter that converts MessageInstruction objects
 * into Discord-specific message formats and handles delivery.
 */
export class MessageAdapter {
  
  /**
   * Process a MessageInstruction and send the appropriate Discord message
   * @param instruction The message instruction to process
   * @param interaction Optional Discord interaction for replies
   * @param langCode Language code for localization
   * @param discordClient Optional Discord client for DM sending
   * @returns Promise that resolves when message is sent
   */
  public static async processInstruction(
    instruction: MessageInstruction,
    interaction?: CommandInteraction,
    langCode: string = Language.Default,
    discordClient?: any // TODO: Type as Discord Client when available
  ): Promise<void> {
    const messageContent = this.generateMessageContent(instruction, langCode);
    
    if (instruction.formatting?.dm && instruction.context?.userId) {
      if (!discordClient) {
        throw new Error('Discord client required for DM sending');
      }
      await this.sendDirectMessage(instruction.context.userId, messageContent, instruction, discordClient);
    } else if (interaction) {
      await this.sendInteractionResponse(interaction, messageContent, instruction);
    } else {
      throw new Error('No valid delivery method specified for message instruction');
    }
  }

  /**
   * Generate the message content from a MessageInstruction
   * @param instruction The message instruction
   * @param langCode Language code for localization
   * @returns The formatted message content
   */
  public static generateMessageContent(
    instruction: MessageInstruction,
    langCode: string = Language.Default
  ): BaseMessageOptions {
    const text = Lang.getRef(instruction.key, langCode as any, instruction.data);
    
    if (instruction.formatting?.embed) {
      const embed = this.createEmbed(instruction, text);
      return { embeds: [embed] };
    }
    
    return { content: text };
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
    discordClient: any // TODO: Type as Discord Client when available
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
} 