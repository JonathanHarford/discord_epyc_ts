import { CommandInteraction, Locale, Message } from 'discord.js';

import { ErrorEventBus, ErrorEventType } from '../events/error-event-bus.js';
import { MessageAdapter } from '../messaging/MessageAdapter.js';
import { EventData } from '../models/internal-models.js';
import { Logger } from '../services/index.js';
import { MessageInstruction } from '../types/MessageInstruction.js';

/**
 * Enum for different error types to enable proper classification and handling
 */
export enum ErrorType {
    VALIDATION = 'VALIDATION',
    BUSINESS_LOGIC = 'BUSINESS_LOGIC',
    DATABASE = 'DATABASE',
    DISCORD_API = 'DISCORD_API',
    EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
    PERMISSION = 'PERMISSION',
    RATE_LIMIT = 'RATE_LIMIT',
    LOCALIZATION_ERROR = 'LOCALIZATION_ERROR',
    UNKNOWN = 'UNKNOWN'
}

/**
 * Enum for error severity levels
 */
export enum ErrorSeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

/**
 * Interface for structured error information
 */
export interface ErrorInfo {
    type: ErrorType;
    severity: ErrorSeverity;
    code: string;
    message: string;
    userMessage: string;
    context?: Record<string, any>;
    originalError?: Error;
}

/**
 * Standardized error handling utility for Discord bot commands and DM processing
 */
export class ErrorHandler {
    
    /**
     * Handle errors in command execution with standardized response
     * @param error The error that occurred
     * @param interaction The Discord interaction
     * @param data Event data for context
     * @param context Additional context information
     */
    public static async handleCommandError(
        error: Error | ErrorInfo,
        interaction: CommandInteraction,
        data: EventData,
        context?: Record<string, any>
    ): Promise<void> {
        const errorInfo = this.normalizeError(error, context);
        
        // Log the error with full context
        const errorContext = {
            interactionId: interaction.id,
            commandName: interaction.commandName,
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            ...context
        };
        
        this.logError(errorInfo, errorContext);
        
        // Publish error event to the event bus
        const eventBus = ErrorEventBus.getInstance();
        eventBus.publishError(
            ErrorEventType.COMMAND_ERROR,
            errorInfo,
            errorContext,
            interaction.user.id,
            interaction.guild?.id,
            interaction.channel?.id
        );

        // Send user-friendly error message
        const instruction = this.createErrorInstruction(errorInfo, true);
        
        // Use safe processing to handle any messaging errors
        const success = await MessageAdapter.safeProcessInstruction(instruction, interaction, data.lang);
        if (!success) {
            Logger.error('Failed to send error message to user via MessageAdapter');
        }
    }

    /**
     * Handle errors in DM processing with standardized response
     * @param error The error that occurred
     * @param message The Discord message
     * @param context Additional context information
     */
    public static async handleDMError(
        error: Error | ErrorInfo,
        message: Message,
        context?: Record<string, any>
    ): Promise<void> {
        const errorInfo = this.normalizeError(error, context);
        
        // Log the error with full context
        const errorContext = {
            messageId: message.id,
            userId: message.author.id,
            channelId: message.channel.id,
            ...context
        };
        
        this.logError(errorInfo, errorContext);
        
        // Publish error event to the event bus
        const eventBus = ErrorEventBus.getInstance();
        eventBus.publishError(
            ErrorEventType.DM_ERROR,
            errorInfo,
            errorContext,
            message.author.id,
            undefined, // No guild for DMs
            message.channel.id
        );

        // Send user-friendly error message via DM
        const instruction = this.createErrorInstruction(errorInfo, false);
        instruction.formatting = { ...instruction.formatting, dm: true };
        instruction.context = { userId: message.author.id };
        
        // Use safe processing for DM error messages
        const success = await MessageAdapter.safeProcessInstruction(
            instruction, 
            undefined, 
            Locale.EnglishUS, 
            message.client
        );
        
        if (!success) {
            // Fallback to simple reply if MessageAdapter fails
            try {
                await message.reply(errorInfo.userMessage);
            } catch (fallbackError) {
                Logger.error('Failed to send DM error message to user', fallbackError);
            }
        }
    }

    /**
     * Create a standardized error instruction for messaging
     * @param errorInfo The error information
     * @param ephemeral Whether the message should be ephemeral
     * @returns MessageInstruction for the error
     */
    public static createErrorInstruction(
        errorInfo: ErrorInfo,
        ephemeral: boolean = true
    ): MessageInstruction {
        return {
            type: 'error',
            key: this.getErrorMessageKey(errorInfo),
            data: {
                errorCode: errorInfo.code,
                message: errorInfo.userMessage,
                ...errorInfo.context
            },
            formatting: {
                ephemeral,
                embed: true
            }
        };
    }

    /**
     * Normalize different error types into a standardized ErrorInfo structure
     * @param error The error to normalize
     * @param context Additional context
     * @returns Normalized ErrorInfo
     */
    private static normalizeError(
        error: Error | ErrorInfo,
        context?: Record<string, any>
    ): ErrorInfo {
        if (this.isErrorInfo(error)) {
            return {
                ...error,
                context: { ...error.context, ...context }
            };
        }

        // Classify the error based on its properties
        const errorType = this.classifyError(error);
        const severity = this.determineSeverity(errorType, error);
        
        return {
            type: errorType,
            severity,
            code: this.generateErrorCode(errorType),
            message: error.message,
            userMessage: this.generateUserMessage(errorType, error),
            context,
            originalError: error
        };
    }

    /**
     * Type guard to check if an object is ErrorInfo
     */
    private static isErrorInfo(obj: unknown): obj is ErrorInfo {
        return obj && typeof obj === 'object' && 'type' in obj && 'severity' in obj;
    }

    /**
     * Classify an error based on its type and message
     * @param error The error to classify
     * @returns ErrorType classification
     */
    private static classifyError(error: Error): ErrorType {
        const message = error.message.toLowerCase();
        const name = error.name.toLowerCase();

        // Database errors
        if (name.includes('prisma') || message.includes('database') || message.includes('connection')) {
            return ErrorType.DATABASE;
        }

        // Discord API errors
        if (name.includes('discord') || message.includes('missing permissions') || message.includes('unknown')) {
            return ErrorType.DISCORD_API;
        }

        // Validation errors
        if (message.includes('invalid') || message.includes('required') || message.includes('validation')) {
            return ErrorType.VALIDATION;
        }

        // Permission errors
        if (message.includes('permission') || message.includes('unauthorized') || message.includes('forbidden')) {
            return ErrorType.PERMISSION;
        }

        // Rate limit errors
        if (message.includes('rate limit') || message.includes('too many requests')) {
            return ErrorType.RATE_LIMIT;
        }

        // Business logic errors (season not found, etc.)
        if (message.includes('not found') || message.includes('invalid status') || message.includes('already exists')) {
            return ErrorType.BUSINESS_LOGIC;
        }

        return ErrorType.UNKNOWN;
    }

    /**
     * Determine error severity based on type and error details
     * @param type The error type
     * @param error The original error
     * @returns ErrorSeverity level
     */
    private static determineSeverity(type: ErrorType, _error: Error): ErrorSeverity {
        switch (type) {
            case ErrorType.VALIDATION:
            case ErrorType.BUSINESS_LOGIC:
                return ErrorSeverity.LOW;
            case ErrorType.PERMISSION:
            case ErrorType.RATE_LIMIT:
                return ErrorSeverity.MEDIUM;
            case ErrorType.DISCORD_API:
            case ErrorType.EXTERNAL_SERVICE:
                return ErrorSeverity.HIGH;
            case ErrorType.DATABASE:
            case ErrorType.UNKNOWN:
                return ErrorSeverity.CRITICAL;
            default:
                return ErrorSeverity.MEDIUM;
        }
    }

    /**
     * Generate a unique error code for tracking
     * @param type The error type
     * @returns Error code string
     */
    private static generateErrorCode(type: ErrorType): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 5);
        return `${type}_${timestamp}_${random}`.toUpperCase();
    }

    /**
     * Generate a user-friendly error message
     * @param type The error type
     * @param error The original error
     * @returns User-friendly message
     */
    private static generateUserMessage(type: ErrorType, _error: Error): string {
        switch (type) {
            case ErrorType.VALIDATION:
                return 'Please check your input and try again.';
            case ErrorType.BUSINESS_LOGIC:
                return 'The requested operation cannot be completed. Please verify your request.';
            case ErrorType.DATABASE:
                return 'A database error occurred. Please try again later.';
            case ErrorType.DISCORD_API:
                return 'A Discord API error occurred. Please try again.';
            case ErrorType.PERMISSION:
                return 'You do not have permission to perform this action.';
            case ErrorType.RATE_LIMIT:
                return 'You are sending commands too quickly. Please wait a moment and try again.';
            case ErrorType.EXTERNAL_SERVICE:
                return 'An external service is currently unavailable. Please try again later.';
            default:
                return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
        }
    }

    /**
     * Get the appropriate language key for the error message
     * @param errorInfo The error information
     * @returns Language key string
     */
    private static getErrorMessageKey(errorInfo: ErrorInfo): string {
        const baseKey = 'errorEmbeds';
        
        switch (errorInfo.type) {
            case ErrorType.VALIDATION:
                return `${baseKey}.validation`;
            case ErrorType.BUSINESS_LOGIC:
                return `${baseKey}.businessLogic`;
            case ErrorType.DATABASE:
                return `${baseKey}.database`;
            case ErrorType.DISCORD_API:
                return `${baseKey}.discordApi`;
            case ErrorType.PERMISSION:
                return `${baseKey}.permission`;
            case ErrorType.RATE_LIMIT:
                return `${baseKey}.rateLimit`;
            case ErrorType.EXTERNAL_SERVICE:
                return `${baseKey}.externalService`;
            default:
                return `${baseKey}.command`;
        }
    }

    /**
     * Log error with appropriate level and context
     * @param errorInfo The error information
     * @param context Additional logging context
     */
    private static logError(errorInfo: ErrorInfo, context: Record<string, any>): void {
        const logMessage = `[${errorInfo.type}] ${errorInfo.message} (Code: ${errorInfo.code})`;
        const logContext = {
            ...context,
            errorType: errorInfo.type,
            severity: errorInfo.severity,
            errorCode: errorInfo.code,
            userMessage: errorInfo.userMessage
        };

        switch (errorInfo.severity) {
            case ErrorSeverity.LOW:
                Logger.warn(logMessage, logContext);
                break;
            case ErrorSeverity.MEDIUM:
                Logger.warn(logMessage, logContext);
                break;
            case ErrorSeverity.HIGH:
                Logger.error(logMessage, errorInfo.originalError || logContext);
                break;
            case ErrorSeverity.CRITICAL:
                Logger.error(logMessage, errorInfo.originalError || logContext);
                break;
        }
    }

    /**
     * Create a custom ErrorInfo for specific business logic errors
     * @param type Error type
     * @param code Custom error code
     * @param message Technical message
     * @param userMessage User-friendly message
     * @param context Additional context
     * @returns ErrorInfo object
     */
    public static createCustomError(
        type: ErrorType,
        code: string,
        message: string,
        userMessage: string,
        context?: Record<string, any>
    ): ErrorInfo {
        return {
            type,
            severity: this.determineSeverity(type, new Error(message)),
            code,
            message,
            userMessage,
            context
        };
    }

    /**
     * Wrap a function with error handling
     * @param fn Function to wrap
     * @param interaction Discord interaction for error reporting
     * @param data Event data
     * @param context Additional context
     * @returns Wrapped function
     */
    // Using any[] for generic function arguments to support wrapping functions with varying parameter types
    public static wrapCommand<T extends any[], R>(
        fn: (...args: T) => Promise<R>,
        interaction: CommandInteraction,
        data: EventData,
        context?: Record<string, any>
    ): (...args: T) => Promise<R | void> {
        return async (...args: T): Promise<R | void> => {
            try {
                return await fn(...args);
            } catch (error) {
                await this.handleCommandError(
                    error instanceof Error ? error : new Error(String(error)),
                    interaction,
                    data,
                    context
                );
            }
        };
    }

    /**
     * Wrap a DM handler function with error handling
     * @param fn Function to wrap
     * @param message Discord message for error reporting
     * @param context Additional context
     * @returns Wrapped function
     */
    // Using any[] for generic function arguments to support wrapping functions with varying parameter types
    public static wrapDMHandler<T extends any[], R>(
        fn: (...args: T) => Promise<R>,
        message: Message,
        context?: Record<string, any>
    ): (...args: T) => Promise<R | void> {
        return async (...args: T): Promise<R | void> => {
            try {
                return await fn(...args);
            } catch (error) {
                await this.handleDMError(
                    error instanceof Error ? error : new Error(String(error)),
                    message,
                    context
                );
            }
        };
    }
} 