import { PrismaClient } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';

import { ServerContextService } from '../utils/server-context.js';

export interface GuidanceContext {
  turnId?: string;
  gameId?: string;
  guildId?: string;
  channelId?: string;
  serverName?: string;
}

export interface GuidanceOptions {
  includeEmoji?: boolean;
  includeExplanation?: boolean;
  actionType?: 'ready' | 'submit' | 'play' | 'general';
  contentType?: 'text' | 'image';
  fallbackMessage?: string;
}

export interface GuidanceResult {
  message: string;
  hasSpecificChannel: boolean;
  hasServerInfo: boolean;
  contextLevel: 'specific' | 'server' | 'fallback';
}

/**
 * Centralized service for generating consistent user guidance messages
 * that direct users to the correct server/channel for interactions
 */
export class NotificationGuidanceService {
  private prisma: PrismaClient;
  private discordClient: DiscordClient;
  private serverContextService: ServerContextService;

  constructor(prisma: PrismaClient, discordClient: DiscordClient) {
    this.prisma = prisma;
    this.discordClient = discordClient;
    this.serverContextService = new ServerContextService(prisma, discordClient);
  }

  /**
   * Generate guidance message for turn-related actions
   */
  async generateTurnGuidance(
    turnId: string,
    options: GuidanceOptions = {}
  ): Promise<GuidanceResult> {
    try {
      const serverContext = await this.serverContextService.getTurnServerContext(turnId);
      const context: GuidanceContext = {
        turnId,
        guildId: serverContext.guildId,
        channelId: serverContext.channelId,
        serverName: serverContext.serverName
      };

      return this.buildGuidanceMessage(context, options);
    } catch (error) {
      console.error(`NotificationGuidanceService: Error generating turn guidance for ${turnId}:`, error);
      return this.buildFallbackGuidance(options);
    }
  }

  /**
   * Generate guidance message for game-related actions
   */
  async generateGameGuidance(
    gameId: string,
    options: GuidanceOptions = {}
  ): Promise<GuidanceResult> {
    try {
      const serverContext = await this.serverContextService.getGameServerContext(gameId);
      const context: GuidanceContext = {
        gameId,
        guildId: serverContext.guildId,
        channelId: serverContext.channelId,
        serverName: serverContext.serverName
      };

      return this.buildGuidanceMessage(context, options);
    } catch (error) {
      console.error(`NotificationGuidanceService: Error generating game guidance for ${gameId}:`, error);
      return this.buildFallbackGuidance(options);
    }
  }

  /**
   * Generate guidance message with explicit context
   */
  generateContextualGuidance(
    context: GuidanceContext,
    options: GuidanceOptions = {}
  ): GuidanceResult {
    return this.buildGuidanceMessage(context, options);
  }

  /**
   * Build the actual guidance message based on context and options
   */
  private buildGuidanceMessage(
    context: GuidanceContext,
    options: GuidanceOptions
  ): GuidanceResult {
    const {
      includeEmoji = true,
      includeExplanation = true,
      actionType = 'general',
      contentType,
      fallbackMessage
    } = options;

    // Determine context level
    let contextLevel: 'specific' | 'server' | 'fallback';
    let hasSpecificChannel = false;
    let hasServerInfo = false;

    if (context.channelId && context.guildId) {
      contextLevel = 'specific';
      hasSpecificChannel = true;
      hasServerInfo = true;
    } else if (context.guildId || context.serverName) {
      contextLevel = 'server';
      hasServerInfo = true;
    } else {
      contextLevel = 'fallback';
    }

    // Build message components
    const emoji = includeEmoji ? this.getActionEmoji(actionType, contentType) : '';
    const title = this.getActionTitle(actionType, contentType);
    const direction = this.buildDirectionText(context, actionType);
    const explanation = includeExplanation ? this.getExplanationText() : '';

    // Combine components
    let message = '';
    if (emoji && title) {
      message += `${emoji} **${title}**\n\n`;
    }
    
    message += direction;
    
    if (explanation) {
      message += `\n\n${explanation}`;
    }

    // Use fallback if provided and context is insufficient
    if (contextLevel === 'fallback' && fallbackMessage) {
      message = fallbackMessage;
    }

    return {
      message,
      hasSpecificChannel,
      hasServerInfo,
      contextLevel
    };
  }

  /**
   * Build fallback guidance when context is unavailable
   */
  private buildFallbackGuidance(options: GuidanceOptions): GuidanceResult {
    const {
      includeEmoji = true,
      actionType = 'general',
      contentType,
      fallbackMessage
    } = options;

    if (fallbackMessage) {
      return {
        message: fallbackMessage,
        hasSpecificChannel: false,
        hasServerInfo: false,
        contextLevel: 'fallback'
      };
    }

    const emoji = includeEmoji ? this.getActionEmoji(actionType, contentType) : '';
    const title = this.getActionTitle(actionType, contentType);
    const direction = this.buildFallbackDirectionText(actionType);
    const explanation = this.getExplanationText();

    let message = '';
    if (emoji && title) {
      message += `${emoji} **${title}**\n\n`;
    }
    
    message += direction;
    message += `\n\n${explanation}`;

    return {
      message,
      hasSpecificChannel: false,
      hasServerInfo: false,
      contextLevel: 'fallback'
    };
  }

  /**
   * Get appropriate emoji for action type
   */
  private getActionEmoji(actionType: string, contentType?: string): string {
    switch (actionType) {
      case 'ready':
        return '🎨';
      case 'submit':
        return contentType === 'image' ? '🖼️' : '✍️';
      case 'play':
        return '🎮';
      default:
        return '🎨';
    }
  }

  /**
   * Get appropriate title for action type
   */
  private getActionTitle(actionType: string, contentType?: string): string {
    switch (actionType) {
      case 'ready':
        return 'Ready commands have moved to a better system!';
      case 'submit':
        if (contentType === 'image') {
          return 'Image submissions have moved to a better system!';
        } else if (contentType === 'text') {
          return 'Text submissions have moved to a better system!';
        }
        return 'Turn submissions have moved to a better system!';
      case 'play':
        return 'Your turn is ready!';
      default:
        return 'Game interactions have moved to a better system!';
    }
  }

  /**
   * Build direction text based on context
   */
  private buildDirectionText(context: GuidanceContext, actionType: string): string {
    if (context.channelId && context.guildId) {
      // Specific channel guidance
      return `👉 **Go to <#${context.channelId}> in ${context.serverName}** and ${this.getActionInstruction(actionType)}`;
    } else if (context.guildId || context.serverName) {
      // Server-level guidance
      const serverRef = context.serverName || 'the game server';
      return `👉 **Go to ${serverRef}** and ${this.getActionInstruction(actionType)}`;
    } else {
      // Fallback guidance
      return this.buildFallbackDirectionText(actionType);
    }
  }

  /**
   * Build fallback direction text when no context is available
   */
  private buildFallbackDirectionText(actionType: string): string {
    return `👉 **Go to the game server** and ${this.getActionInstruction(actionType)}`;
  }

  /**
   * Get specific action instruction
   */
  private getActionInstruction(actionType: string): string {
    switch (actionType) {
      case 'ready':
        return 'use `/ready` to claim your turn.';
      case 'submit':
        return 'use `/ready` to claim your turn, then click the **"Submit Turn"** button.';
      case 'play':
        return 'use `/game play` to continue!';
      default:
        return 'use the appropriate slash commands.';
    }
  }

  /**
   * Get explanation text about the new system
   */
  private getExplanationText(): string {
    return '_DM-based commands have moved to slash commands and buttons for better privacy and user experience._';
  }

  /**
   * Generate a simple ping message for notifications
   */
  async generatePingMessage(
    gameId: string,
    turnNumber: number,
    turnType: string,
    options: { includeGameId?: boolean } = {}
  ): Promise<GuidanceResult> {
    try {
      const serverContext = await this.serverContextService.getGameServerContext(gameId);
      
      let pingMessage: string;
      let contextLevel: 'specific' | 'server' | 'fallback';
      let hasSpecificChannel = false;
      let hasServerInfo = false;

      if (serverContext.channelId && serverContext.guildId) {
        // Specific channel ping
        pingMessage = `🎮 **Your turn is ready!** 🎮

**${options.includeGameId ? `Game: ${gameId}\n` : ''}Turn:** #${turnNumber} (${turnType})

👉 **Go to <#${serverContext.channelId}> in ${serverContext.serverName} and use \`/game play\` to continue!**

_This is a quick ping - all interactions happen in the game channel._`;
        contextLevel = 'specific';
        hasSpecificChannel = true;
        hasServerInfo = true;
      } else if (serverContext.guildId) {
        // Server-level ping
        pingMessage = `🎮 **Your turn is ready!** 🎮

**${options.includeGameId ? `Game: ${gameId}\n` : ''}Turn:** #${turnNumber} (${turnType})

👉 **Go to ${serverContext.serverName} and use \`/game play\` to continue!**

_This is a quick ping - all interactions happen in the game server._`;
        contextLevel = 'server';
        hasServerInfo = true;
      } else {
        // Fallback ping
        pingMessage = `🎮 **Your turn is ready!** 🎮

**${options.includeGameId ? `Game: ${gameId}\n` : ''}Turn:** #${turnNumber} (${turnType})

👉 **Use \`/game play\` in the game server to continue!**

_This is a quick ping - all interactions happen in the game server._`;
        contextLevel = 'fallback';
      }

      return {
        message: pingMessage,
        hasSpecificChannel,
        hasServerInfo,
        contextLevel
      };
    } catch (error) {
      console.error(`NotificationGuidanceService: Error generating ping message for game ${gameId}:`, error);
      
      // Fallback ping message
      const fallbackPing = `🎮 **Your turn is ready!** 🎮

**${options.includeGameId ? `Game: ${gameId}\n` : ''}Turn:** #${turnNumber} (${turnType})

👉 **Use \`/game play\` in the game server to continue!**

_This is a quick ping - all interactions happen in the game server._`;

      return {
        message: fallbackPing,
        hasSpecificChannel: false,
        hasServerInfo: false,
        contextLevel: 'fallback'
      };
    }
  }
} 