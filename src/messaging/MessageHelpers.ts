import { MessageInstruction } from '../types/MessageInstruction.js';

/**
 * Helper functions for creating common message instruction patterns
 */
export class MessageHelpers {
  
  /**
   * Create a success message for command completion
   * @param key Language key
   * @param data Placeholder data
   * @param ephemeral Whether the message should be ephemeral
   * @returns MessageInstruction
   */
  public static commandSuccess(
    key: string,
    data?: Record<string, any>,
    ephemeral: boolean = false
  ): MessageInstruction {
    return {
      type: 'success',
      key,
      data,
      formatting: { ephemeral }
    };
  }

  /**
   * Create an error message for command failure
   * @param key Language key
   * @param data Placeholder data
   * @param ephemeral Whether the message should be ephemeral
   * @returns MessageInstruction
   */
  public static commandError(
    key: string,
    data?: Record<string, any>,
    ephemeral: boolean = true
  ): MessageInstruction {
    return {
      type: 'error',
      key,
      data,
      formatting: { ephemeral }
    };
  }

  /**
   * Create a DM notification message
   * @param key Language key
   * @param userId Target user ID
   * @param data Placeholder data
   * @returns MessageInstruction
   */
  public static dmNotification(
    key: string,
    userId: string,
    data?: Record<string, any>
  ): MessageInstruction {
    return {
      type: 'info',
      key,
      data,
      formatting: { dm: true },
      context: { userId }
    };
  }

  /**
   * Create an embed message
   * @param type Message type
   * @param key Language key
   * @param data Placeholder data
   * @param ephemeral Whether the message should be ephemeral
   * @returns MessageInstruction
   */
  public static embedMessage(
    type: MessageInstruction['type'],
    key: string,
    data?: Record<string, any>,
    ephemeral: boolean = false
  ): MessageInstruction {
    return {
      type,
      key,
      data,
      formatting: { embed: true, ephemeral }
    };
  }

  /**
   * Create a follow-up message
   * @param type Message type
   * @param key Language key
   * @param data Placeholder data
   * @param ephemeral Whether the message should be ephemeral
   * @returns MessageInstruction
   */
  public static followUpMessage(
    type: MessageInstruction['type'],
    key: string,
    data?: Record<string, any>,
    ephemeral: boolean = false
  ): MessageInstruction {
    return {
      type,
      key,
      data,
      formatting: { followUp: true, ephemeral }
    };
  }

  /**
   * Create a validation error message
   * @param key Language key
   * @param data Placeholder data
   * @returns MessageInstruction
   */
  public static validationError(
    key: string,
    data?: Record<string, any>
  ): MessageInstruction {
    return {
      type: 'error',
      key,
      data,
      formatting: { ephemeral: true }
    };
  }

  /**
   * Create a warning message
   * @param key Language key
   * @param data Placeholder data
   * @param ephemeral Whether the message should be ephemeral
   * @returns MessageInstruction
   */
  public static warning(
    key: string,
    data?: Record<string, any>,
    ephemeral: boolean = false
  ): MessageInstruction {
    return {
      type: 'warning',
      key,
      data,
      formatting: { ephemeral }
    };
  }

  /**
   * Create an info message
   * @param key Language key
   * @param data Placeholder data
   * @param ephemeral Whether the message should be ephemeral
   * @returns MessageInstruction
   */
  public static info(
    key: string,
    data?: Record<string, any>,
    ephemeral: boolean = false
  ): MessageInstruction {
    return {
      type: 'info',
      key,
      data,
      formatting: { ephemeral }
    };
  }
} 