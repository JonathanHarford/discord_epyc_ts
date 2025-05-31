import { 
    AutocompleteInteraction,
    ButtonInteraction, 
    ModalSubmitInteraction,
    StringSelectMenuInteraction
} from 'discord.js';

import { 
    AutocompleteHandler,
    ButtonHandler, 
    ModalHandler,
    SelectMenuHandler
} from './index.js';
import { ErrorEventBus, ErrorEventType } from '../events/error-event-bus.js';
import { Logger } from '../services/index.js';
import { ErrorInfo } from '../utils/error-handler.js';
import { ErrorHandler, ErrorSeverity, ErrorType } from '../utils/index.js';

/**
 * Configuration for retry behavior on transient failures
 */
interface RetryConfig {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
}

/**
 * Statistics for monitoring interaction handler performance and errors
 */
interface InteractionStats {
    totalHandled: number;
    totalErrors: number;
    errorsByType: Record<string, number>;
    retryAttempts: number;
    cacheHits: number;
    cacheMisses: number;
}

/**
 * Factory class for managing interaction handlers with improved routing, performance, and robust error handling
 */
export class InteractionHandlerFactory {
    private buttonHandlers: Map<string, ButtonHandler> = new Map();
    private selectMenuHandlers: Map<string, SelectMenuHandler> = new Map();
    private modalHandlers: Map<string, ModalHandler> = new Map();
    private autocompleteHandlers: Map<string, AutocompleteHandler> = new Map();

    // Optimized lookup caches for better performance
    private buttonCache: Map<string, ButtonHandler> = new Map();
    private selectMenuCache: Map<string, SelectMenuHandler> = new Map();
    private modalCache: Map<string, ModalHandler> = new Map();

    // Error handling and retry configuration
    private retryConfig: RetryConfig = {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 5000,
        backoffMultiplier: 2
    };

    // Statistics tracking
    private stats: InteractionStats = {
        totalHandled: 0,
        totalErrors: 0,
        errorsByType: {},
        retryAttempts: 0,
        cacheHits: 0,
        cacheMisses: 0
    };

    private errorEventBus = ErrorEventBus.getInstance();

    /**
     * Register a button handler
     */
    public registerButtonHandler(handler: ButtonHandler): void {
        this.validateHandler(handler);
        if (this.buttonHandlers.has(handler.customIdPrefix)) {
            Logger.warn(`Button handler with customIdPrefix ${handler.customIdPrefix} is being overwritten.`);
        }
        this.buttonHandlers.set(handler.customIdPrefix, handler);
        this.clearButtonCache(); // Clear cache when new handler is added
    }

    /**
     * Register a select menu handler
     */
    public registerSelectMenuHandler(handler: SelectMenuHandler): void {
        this.validateHandler(handler);
        if (this.selectMenuHandlers.has(handler.customIdPrefix)) {
            Logger.warn(`Select menu handler with customIdPrefix ${handler.customIdPrefix} is being overwritten.`);
        }
        this.selectMenuHandlers.set(handler.customIdPrefix, handler);
        this.clearSelectMenuCache();
    }

    /**
     * Register a modal handler
     */
    public registerModalHandler(handler: ModalHandler): void {
        this.validateHandler(handler);
        if (this.modalHandlers.has(handler.customIdPrefix)) {
            Logger.warn(`Modal handler with customIdPrefix ${handler.customIdPrefix} is being overwritten.`);
        }
        this.modalHandlers.set(handler.customIdPrefix, handler);
        this.clearModalCache();
    }

    /**
     * Register an autocomplete handler
     */
    public registerAutocompleteHandler(handler: AutocompleteHandler): void {
        this.validateHandler(handler);
        const key = handler.optionName 
            ? `${handler.commandName}:${handler.optionName}` 
            : handler.commandName;
        
        if (this.autocompleteHandlers.has(key)) {
            Logger.warn(`Autocomplete handler for ${key} is being overwritten.`);
        }
        this.autocompleteHandlers.set(key, handler);
    }

    /**
     * Find and execute button handler with enhanced error handling and retry logic
     */
    public async handleButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
        const customId = interaction.customId;
        const context = this.createInteractionContext(interaction, 'button');
        
        return await this.executeWithErrorHandling(
            async () => {
                // Check cache first
                if (this.buttonCache.has(customId)) {
                    const handler = this.buttonCache.get(customId)!;
                    this.stats.cacheHits++;
                    await handler.execute(interaction);
                    return true;
                }

                this.stats.cacheMisses++;

                // Find handler by prefix matching
                for (const [prefix, handler] of this.buttonHandlers) {
                    if (customId.startsWith(prefix)) {
                        this.buttonCache.set(customId, handler); // Cache for future use
                        await handler.execute(interaction);
                        return true;
                    }
                }

                return false; // No handler found
            },
            interaction,
            context,
            'button'
        );
    }

    /**
     * Find and execute select menu handler with enhanced error handling
     */
    public async handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<boolean> {
        const customId = interaction.customId;
        const context = this.createInteractionContext(interaction, 'selectMenu');
        
        return await this.executeWithErrorHandling(
            async () => {
                // Check cache first
                if (this.selectMenuCache.has(customId)) {
                    const handler = this.selectMenuCache.get(customId)!;
                    this.stats.cacheHits++;
                    await handler.execute(interaction);
                    return true;
                }

                this.stats.cacheMisses++;

                // Find handler by prefix matching
                for (const [prefix, handler] of this.selectMenuHandlers) {
                    if (customId.startsWith(prefix)) {
                        this.selectMenuCache.set(customId, handler); // Cache for future use
                        await handler.execute(interaction);
                        return true;
                    }
                }

                return false; // No handler found
            },
            interaction,
            context,
            'selectMenu'
        );
    }

    /**
     * Find and execute modal handler with enhanced error handling
     */
    public async handleModalInteraction(interaction: ModalSubmitInteraction): Promise<boolean> {
        const customId = interaction.customId;
        const context = this.createInteractionContext(interaction, 'modal');
        
        return await this.executeWithErrorHandling(
            async () => {
                // Check cache first
                if (this.modalCache.has(customId)) {
                    const handler = this.modalCache.get(customId)!;
                    this.stats.cacheHits++;
                    await handler.execute(interaction);
                    return true;
                }

                this.stats.cacheMisses++;

                // Find handler by prefix matching
                for (const [prefix, handler] of this.modalHandlers) {
                    if (customId.startsWith(prefix)) {
                        this.modalCache.set(customId, handler); // Cache for future use
                        await handler.execute(interaction);
                        return true;
                    }
                }

                return false; // No handler found
            },
            interaction,
            context,
            'modal'
        );
    }

    /**
     * Find and execute autocomplete handler with enhanced error handling
     */
    public async handleAutocompleteInteraction(interaction: AutocompleteInteraction): Promise<boolean> {
        const context = this.createInteractionContext(interaction, 'autocomplete');
        
        return await this.executeWithErrorHandling(
            async () => {
                const focusedOption = interaction.options.getFocused(true);
                const commandName = interaction.commandName;
                const optionName = focusedOption.name;

                // Try specific command:option combination first
                const specificKey = `${commandName}:${optionName}`;
                if (this.autocompleteHandlers.has(specificKey)) {
                    const handler = this.autocompleteHandlers.get(specificKey)!;
                    await handler.execute(interaction);
                    return true;
                }

                // Fall back to command-only handler
                if (this.autocompleteHandlers.has(commandName)) {
                    const handler = this.autocompleteHandlers.get(commandName)!;
                    await handler.execute(interaction);
                    return true;
                }

                return false; // No handler found
            },
            interaction,
            context,
            'autocomplete'
        );
    }

    /**
     * Execute handler function with comprehensive error handling, retry logic, and graceful degradation
     */
    private async executeWithErrorHandling<T extends ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction | AutocompleteInteraction>(
        handlerFn: () => Promise<boolean>,
        interaction: T,
        context: Record<string, any>,
        interactionType: string
    ): Promise<boolean> {
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
            try {
                this.stats.totalHandled++;
                const result = await handlerFn();
                
                if (attempt > 1) {
                    Logger.info(`${interactionType} interaction succeeded on attempt ${attempt}`, context);
                }
                
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                this.stats.totalErrors++;
                
                if (attempt > 1) {
                    this.stats.retryAttempts++;
                }

                // Classify the error to determine if retry is appropriate
                const errorInfo = this.classifyInteractionError(lastError, interactionType, context);
                
                // Update error statistics
                this.stats.errorsByType[errorInfo.type] = (this.stats.errorsByType[errorInfo.type] || 0) + 1;

                // Log the error with detailed context
                this.logInteractionError(errorInfo, attempt, context);

                // Publish error event for monitoring
                this.publishErrorEvent(errorInfo, interaction, context);

                // Determine if we should retry
                const shouldRetry = this.shouldRetryError(errorInfo, attempt);
                
                if (!shouldRetry || attempt === this.retryConfig.maxAttempts) {
                    // Final attempt failed or error is not retryable
                    await this.handleFinalError(errorInfo, interaction, interactionType, attempt);
                    throw lastError; // Re-throw to allow higher-level handling
                }

                // Wait before retry with exponential backoff
                if (attempt < this.retryConfig.maxAttempts) {
                    const delay = this.calculateRetryDelay(attempt);
                    Logger.info(`Retrying ${interactionType} interaction in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxAttempts})`, context);
                    await this.sleep(delay);
                }
            }
        }

        // This should never be reached, but included for type safety
        throw lastError || new Error('Unknown error in interaction handling');
    }

    /**
     * Create detailed context information for an interaction
     */
    private createInteractionContext(
        interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction | AutocompleteInteraction,
        type: string
    ): Record<string, any> {
        const baseContext = {
            interactionId: interaction.id,
            interactionType: type,
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            guildId: interaction.guild?.id,
            guildName: interaction.guild?.name,
            channelId: interaction.channel?.id,
            timestamp: new Date().toISOString()
        };

        // Add type-specific context
        if ('customId' in interaction) {
            return {
                ...baseContext,
                customId: interaction.customId
            };
        }

        if (interaction.isAutocomplete()) {
            const focusedOption = interaction.options.getFocused(true);
            return {
                ...baseContext,
                commandName: interaction.commandName,
                optionName: focusedOption.name,
                optionValue: focusedOption.value
            };
        }

        return baseContext;
    }

    /**
     * Classify interaction errors for appropriate handling
     */
    private classifyInteractionError(error: Error, interactionType: string, context: Record<string, any>): ErrorInfo {
        const message = error.message.toLowerCase();
        const name = error.name.toLowerCase();

        // Discord API specific errors
        if (name.includes('discord') || message.includes('interaction has already been acknowledged') || 
            message.includes('unknown interaction') || message.includes('interaction token is invalid')) {
            return ErrorHandler.createCustomError(
                ErrorType.DISCORD_API,
                `INTERACTION_${interactionType.toUpperCase()}_DISCORD_API_ERROR`,
                error.message,
                'There was a problem communicating with Discord. Please try again.',
                { ...context, originalError: error.name }
            );
        }

        // Permission errors
        if (message.includes('missing permissions') || message.includes('forbidden') || message.includes('unauthorized')) {
            return ErrorHandler.createCustomError(
                ErrorType.PERMISSION,
                `INTERACTION_${interactionType.toUpperCase()}_PERMISSION_ERROR`,
                error.message,
                'You do not have permission to perform this action.',
                { ...context, originalError: error.name }
            );
        }

        // Rate limit errors
        if (message.includes('rate limit') || message.includes('too many requests')) {
            return ErrorHandler.createCustomError(
                ErrorType.RATE_LIMIT,
                `INTERACTION_${interactionType.toUpperCase()}_RATE_LIMIT_ERROR`,
                error.message,
                'You are performing actions too quickly. Please wait a moment and try again.',
                { ...context, originalError: error.name }
            );
        }

        // Validation errors (malformed customId, invalid options, etc.)
        if (message.includes('invalid') || message.includes('malformed') || message.includes('required')) {
            return ErrorHandler.createCustomError(
                ErrorType.VALIDATION,
                `INTERACTION_${interactionType.toUpperCase()}_VALIDATION_ERROR`,
                error.message,
                'The interaction data is invalid. Please try again or contact support.',
                { ...context, originalError: error.name }
            );
        }

        // Database/service errors
        if (message.includes('database') || message.includes('connection') || name.includes('prisma')) {
            return ErrorHandler.createCustomError(
                ErrorType.DATABASE,
                `INTERACTION_${interactionType.toUpperCase()}_DATABASE_ERROR`,
                error.message,
                'A database error occurred. Please try again later.',
                { ...context, originalError: error.name }
            );
        }

        // Default to unknown error
        return ErrorHandler.createCustomError(
            ErrorType.UNKNOWN,
            `INTERACTION_${interactionType.toUpperCase()}_UNKNOWN_ERROR`,
            error.message,
            'An unexpected error occurred. Please try again or contact support if the problem persists.',
            { ...context, originalError: error.name }
        );
    }

    /**
     * Determine if an error should trigger a retry
     */
    private shouldRetryError(errorInfo: ErrorInfo, attempt: number): boolean {
        if (attempt >= this.retryConfig.maxAttempts) {
            return false;
        }

        // Don't retry certain error types
        const nonRetryableTypes = [
            ErrorType.PERMISSION,
            ErrorType.VALIDATION,
            ErrorType.BUSINESS_LOGIC
        ];

        if (nonRetryableTypes.includes(errorInfo.type)) {
            return false;
        }

        // Retry transient errors
        const retryableTypes = [
            ErrorType.DISCORD_API,
            ErrorType.RATE_LIMIT,
            ErrorType.DATABASE,
            ErrorType.EXTERNAL_SERVICE,
            ErrorType.UNKNOWN
        ];

        return retryableTypes.includes(errorInfo.type);
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    private calculateRetryDelay(attempt: number): number {
        const delay = this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
        return Math.min(delay, this.retryConfig.maxDelayMs);
    }

    /**
     * Sleep for specified milliseconds
     */
    private async sleep(ms: number): Promise<void> {
        return await new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log interaction errors with appropriate detail level
     */
    private logInteractionError(errorInfo: ErrorInfo, attempt: number, context: Record<string, any>): void {
        const logMessage = `[${errorInfo.type}] ${errorInfo.message} (Code: ${errorInfo.code}, Attempt: ${attempt})`;
        const logContext = {
            ...context,
            errorType: errorInfo.type,
            severity: errorInfo.severity,
            errorCode: errorInfo.code,
            attempt,
            maxAttempts: this.retryConfig.maxAttempts
        };

                 switch (errorInfo.severity) {
             case ErrorSeverity.LOW:
                 Logger.info(logMessage, logContext);
                 break;
            case ErrorSeverity.MEDIUM:
                Logger.warn(logMessage, logContext);
                break;
            case ErrorSeverity.HIGH:
            case ErrorSeverity.CRITICAL:
                Logger.error(logMessage, errorInfo.originalError || logContext);
                break;
        }
    }

    /**
     * Publish error events for monitoring and alerting
     */
    private publishErrorEvent(
        errorInfo: ErrorInfo,
        interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction | AutocompleteInteraction,
        context: Record<string, any>
    ): void {
        this.errorEventBus.publishError(
            ErrorEventType.SERVICE_ERROR, // Using SERVICE_ERROR for interaction handling errors
            errorInfo,
            context,
            interaction.user.id,
            interaction.guild?.id,
            interaction.channel?.id
        );
    }

    /**
     * Handle final error after all retry attempts have failed
     */
    private async handleFinalError(
        errorInfo: ErrorInfo,
        interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction | AutocompleteInteraction,
        interactionType: string,
        finalAttempt: number
    ): Promise<void> {
        Logger.error(`Final ${interactionType} interaction error after ${finalAttempt} attempts`, {
            errorCode: errorInfo.code,
            errorType: errorInfo.type,
            interactionId: interaction.id,
            userId: interaction.user.id
        });

        // Attempt to provide user feedback if interaction is still repliable
        return await this.sendErrorResponse(interaction, errorInfo, interactionType);
    }

    /**
     * Send appropriate error response to user based on interaction type
     */
    private async sendErrorResponse(
        interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction | AutocompleteInteraction,
        errorInfo: ErrorInfo,
        interactionType: string
    ): Promise<void> {
        try {
            if (interaction.isAutocomplete()) {
                // For autocomplete, respond with empty choices on error to prevent Discord timeout
                if (!interaction.responded) {
                    await interaction.respond([]);
                }
            } else if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                // For other interactions, send user-friendly error message
                await interaction.reply({ 
                    content: errorInfo.userMessage, 
                    ephemeral: true 
                });
            } else if (interaction.isRepliable() && (interaction.replied || interaction.deferred)) {
                // If already replied/deferred, try to edit the reply
                await interaction.editReply({ 
                    content: errorInfo.userMessage
                });
            }
        } catch (responseError) {
            Logger.error(`Failed to send error response for ${interactionType} interaction:`, {
                originalError: errorInfo.code,
                responseError: responseError instanceof Error ? responseError.message : String(responseError),
                interactionId: interaction.id
            });
        }
    }

    /**
     * Get comprehensive statistics about registered handlers and performance
     */
    public getStats(): {
        buttonHandlers: number;
        selectMenuHandlers: number;
        modalHandlers: number;
        autocompleteHandlers: number;
        cacheSize: {
            buttons: number;
            selectMenus: number;
            modals: number;
        };
        performance: InteractionStats;
        retryConfig: RetryConfig;
    } {
        return {
            buttonHandlers: this.buttonHandlers.size,
            selectMenuHandlers: this.selectMenuHandlers.size,
            modalHandlers: this.modalHandlers.size,
            autocompleteHandlers: this.autocompleteHandlers.size,
            cacheSize: {
                buttons: this.buttonCache.size,
                selectMenus: this.selectMenuCache.size,
                modals: this.modalCache.size,
            },
            performance: { ...this.stats },
            retryConfig: { ...this.retryConfig }
        };
    }

    /**
     * Reset performance statistics (useful for monitoring periods)
     */
    public resetStats(): void {
        this.stats = {
            totalHandled: 0,
            totalErrors: 0,
            errorsByType: {},
            retryAttempts: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * Update retry configuration
     */
    public updateRetryConfig(config: Partial<RetryConfig>): void {
        this.retryConfig = { ...this.retryConfig, ...config };
        Logger.info('Interaction handler retry configuration updated', this.retryConfig);
    }

    /**
     * Clear all caches (useful for testing or when handlers change)
     */
    public clearAllCaches(): void {
        this.clearButtonCache();
        this.clearSelectMenuCache();
        this.clearModalCache();
    }

    private clearButtonCache(): void {
        this.buttonCache.clear();
    }

    private clearSelectMenuCache(): void {
        this.selectMenuCache.clear();
    }

    private clearModalCache(): void {
        this.modalCache.clear();
    }

    /**
     * Validate handler registration to prevent common issues
     */
    private validateHandler(handler: { customIdPrefix?: string; commandName?: string }): void {
        if ('customIdPrefix' in handler) {
            if (handler.customIdPrefix === undefined || handler.customIdPrefix === null) {
                throw new Error('Handler customIdPrefix cannot be undefined or null');
            }
            if (handler.customIdPrefix.length === 0) {
                throw new Error('Handler customIdPrefix cannot be empty');
            }
            if (handler.customIdPrefix.includes(' ')) {
                Logger.warn(`Handler customIdPrefix "${handler.customIdPrefix}" contains spaces, which may cause routing issues`);
            }
        }
        
        if ('commandName' in handler) {
            if (handler.commandName === undefined || handler.commandName === null) {
                throw new Error('Handler commandName cannot be undefined or null');
            }
            if (handler.commandName.length === 0) {
                throw new Error('Handler commandName cannot be empty');
            }
        }
    }

    /**
     * Get detailed handler information for debugging
     */
    public getHandlerInfo(): {
        buttons: string[];
        selectMenus: string[];
        modals: string[];
        autocomplete: string[];
    } {
        return {
            buttons: Array.from(this.buttonHandlers.keys()),
            selectMenus: Array.from(this.selectMenuHandlers.keys()),
            modals: Array.from(this.modalHandlers.keys()),
            autocomplete: Array.from(this.autocompleteHandlers.keys()),
        };
    }

    /**
     * Health check method for monitoring
     */
    public getHealthStatus(): {
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: {
            totalHandlers: number;
            errorRate: number;
            cacheEfficiency: number;
            lastError?: string;
        };
    } {
        const totalHandlers = this.buttonHandlers.size + this.selectMenuHandlers.size + 
                             this.modalHandlers.size + this.autocompleteHandlers.size;
        
        const errorRate = this.stats.totalHandled > 0 ? 
                         (this.stats.totalErrors / this.stats.totalHandled) * 100 : 0;
        
        const totalCacheRequests = this.stats.cacheHits + this.stats.cacheMisses;
        const cacheEfficiency = totalCacheRequests > 0 ? 
                               (this.stats.cacheHits / totalCacheRequests) * 100 : 100; // Default to 100% when no cache requests

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        
        if (errorRate > 50) {
            status = 'unhealthy';
        } else if (errorRate > 10 || (totalCacheRequests > 0 && cacheEfficiency < 50)) {
            status = 'degraded';
        }

        return {
            status,
            details: {
                totalHandlers,
                errorRate: Math.round(errorRate * 100) / 100,
                cacheEfficiency: Math.round(cacheEfficiency * 100) / 100,
                lastError: Object.keys(this.stats.errorsByType).length > 0 ? 
                          Object.keys(this.stats.errorsByType)[0] : undefined
            }
        };
    }
} 