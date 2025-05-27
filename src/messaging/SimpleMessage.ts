import { 
  BaseMessageOptions, 
  ChatInputCommandInteraction,
  CommandInteraction,
  EmbedBuilder, 
  MessageContextMenuCommandInteraction,
  resolveColor,
  UserContextMenuCommandInteraction
} from 'discord.js';

import { interpolate, strings } from '../lang/strings.js';

export type MessageType = 'success' | 'error' | 'info' | 'warning';

// Type for embed field data from language strings
interface EmbedFieldData {
  readonly name: string;
  readonly value: string;
  readonly inline?: boolean;
}

// Type for embed data from language strings
interface EmbedData {
  readonly title?: string;
  readonly description?: string;
  readonly fields?: readonly EmbedFieldData[];
  readonly color?: string;
}

export interface SimpleMessageOptions {
  content?: string;
  embed?: EmbedData; // Direct embed data from strings.embeds
  variables?: Record<string, unknown>;
  ephemeral?: boolean;
  type?: MessageType;
}

/**
 * Simple message system that works directly with strings
 * No more complex language layer - just direct string access
 */
export class SimpleMessage {
  
  /**
   * Send a simple text message
   */
  static async sendText(
    interaction: CommandInteraction,
    text: string,
    variables?: Record<string, unknown>,
    ephemeral: boolean = false
  ): Promise<void> {
    const content = variables ? interpolate(text, variables) : text;
    
    const options: BaseMessageOptions = { content };
    
    await this.sendResponse(interaction, options, ephemeral);
  }

  /**
   * Send an embed message using embed data from strings
   */
  static async sendEmbed(
    interaction: CommandInteraction,
    embedData: EmbedData,
    variables?: Record<string, unknown>,
    ephemeral: boolean = false,
    type: MessageType = 'info'
  ): Promise<void> {
    const embed = this.createEmbed(embedData, variables, type);
    const options: BaseMessageOptions = { embeds: [embed] };
    
    await this.sendResponse(interaction, options, ephemeral);
  }

  /**
   * Send a success message
   */
  static async sendSuccess(
    interaction: CommandInteraction,
    text: string,
    variables?: Record<string, unknown>,
    ephemeral: boolean = false
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setDescription(variables ? interpolate(text, variables) : text)
      .setColor(resolveColor(strings.colors.success))
      .setTimestamp();
      
    await this.sendResponse(interaction, { embeds: [embed] }, ephemeral);
  }

  /**
   * Send an error message
   */
  static async sendError(
    interaction: CommandInteraction,
    text: string,
    variables?: Record<string, unknown>,
    ephemeral: boolean = true
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setDescription(variables ? interpolate(text, variables) : text)
      .setColor(resolveColor(strings.colors.error))
      .setTimestamp();
      
    await this.sendResponse(interaction, { embeds: [embed] }, ephemeral);
  }

  /**
   * Send a warning message
   */
  static async sendWarning(
    interaction: CommandInteraction,
    text: string,
    variables?: Record<string, unknown>,
    ephemeral: boolean = false
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setDescription(variables ? interpolate(text, variables) : text)
      .setColor(resolveColor(strings.colors.warning))
      .setTimestamp();
      
    await this.sendResponse(interaction, { embeds: [embed] }, ephemeral);
  }

  /**
   * Send an info message
   */
  static async sendInfo(
    interaction: CommandInteraction,
    text: string,
    variables?: Record<string, unknown>,
    ephemeral: boolean = false
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setDescription(variables ? interpolate(text, variables) : text)
      .setColor(resolveColor(strings.colors.default))
      .setTimestamp();
      
    await this.sendResponse(interaction, { embeds: [embed] }, ephemeral);
  }

  /**
   * Create an embed from embed data
   */
  private static createEmbed(
    embedData: EmbedData,
    variables?: Record<string, unknown>,
    type: MessageType = 'info'
  ): EmbedBuilder {
    const embed = new EmbedBuilder();

    // Set color based on type
    switch (type) {
      case 'success':
        embed.setColor(resolveColor(strings.colors.success));
        break;
      case 'error':
        embed.setColor(resolveColor(strings.colors.error));
        break;
      case 'warning':
        embed.setColor(resolveColor(strings.colors.warning));
        break;
      default:
        embed.setColor(resolveColor(strings.colors.default));
    }

    // Process title
    if (embedData.title) {
      const title = variables ? interpolate(embedData.title, variables) : embedData.title;
      embed.setTitle(title);
    }

    // Process description
    if (embedData.description) {
      const description = variables ? interpolate(embedData.description, variables) : embedData.description;
      embed.setDescription(description);
    }

    // Process fields
    if (embedData.fields && Array.isArray(embedData.fields)) {
      const processedFields = embedData.fields.map((field: EmbedFieldData) => ({
        name: variables ? interpolate(field.name, variables) : field.name,
        value: variables ? interpolate(field.value, variables) : field.value,
        inline: field.inline || false
      }));
      embed.addFields(processedFields);
    }

    // Always add timestamp
    embed.setTimestamp();

    return embed;
  }

  /**
   * Send the actual response to Discord
   */
  private static async sendResponse(
    interaction: CommandInteraction,
    options: BaseMessageOptions,
    ephemeral: boolean = false
  ): Promise<void> {
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(options);
      } else {
        await interaction.reply({ ...options, ephemeral });
      }
    } catch (error) {
      console.error('[SimpleMessage] Failed to send message:', error);
      
      // Try to send a fallback error message
      try {
        const fallbackEmbed = new EmbedBuilder()
          .setDescription('An error occurred while processing your request.')
          .setColor(resolveColor(strings.colors.error))
          .setTimestamp();
          
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ embeds: [fallbackEmbed] });
        } else {
          await interaction.reply({ embeds: [fallbackEmbed], ephemeral: true });
        }
      } catch (fallbackError) {
        console.error('[SimpleMessage] Failed to send fallback message:', fallbackError);
      }
    }
  }
} 