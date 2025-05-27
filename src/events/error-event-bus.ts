import { EventEmitter } from 'node:events';

import { Logger } from '../services/index.js';
import { ErrorInfo } from '../utils/error-handler.js';

/**
 * Error event types that can be published on the event bus
 */
export enum ErrorEventType {
    COMMAND_ERROR = 'command_error',
    DM_ERROR = 'dm_error',
    MESSAGE_ERROR = 'message_error',
    SERVICE_ERROR = 'service_error',
    CRITICAL_ERROR = 'critical_error'
}

/**
 * Interface for error event data
 */
export interface ErrorEvent {
    type: ErrorEventType;
    errorInfo: ErrorInfo;
    context: Record<string, any>;
    timestamp: Date;
    userId?: string;
    guildId?: string;
    channelId?: string;
}

/**
 * Simple event bus for error handling and monitoring
 */
export class ErrorEventBus {
    private static instance: ErrorEventBus;
    private emitter: EventEmitter;

    private constructor() {
        this.emitter = new EventEmitter();
        this.setupDefaultHandlers();
    }

    /**
     * Get the singleton instance of the error event bus
     */
    public static getInstance(): ErrorEventBus {
        if (!ErrorEventBus.instance) {
            ErrorEventBus.instance = new ErrorEventBus();
        }
        return ErrorEventBus.instance;
    }

    /**
     * Publish an error event to the bus
     * @param event The error event to publish
     */
    public publish(event: ErrorEvent): void {
        this.emitter.emit(event.type, event);
        this.emitter.emit('error_event', event); // Generic error event
    }

    /**
     * Subscribe to a specific error event type
     * @param eventType The error event type to listen for
     * @param handler The handler function
     */
    public subscribe(eventType: ErrorEventType | 'error_event', handler: (event: ErrorEvent) => void): void {
        this.emitter.on(eventType, handler);
    }

    /**
     * Unsubscribe from an error event type
     * @param eventType The error event type to stop listening for
     * @param handler The handler function to remove
     */
    public unsubscribe(eventType: ErrorEventType | 'error_event', handler: (event: ErrorEvent) => void): void {
        this.emitter.off(eventType, handler);
    }

    /**
     * Create and publish an error event
     * @param type The error event type
     * @param errorInfo The error information
     * @param context Additional context
     * @param userId Optional user ID
     * @param guildId Optional guild ID
     * @param channelId Optional channel ID
     */
    public publishError(
        type: ErrorEventType,
        errorInfo: ErrorInfo,
        context: Record<string, any>,
        userId?: string,
        guildId?: string,
        channelId?: string
    ): void {
        const event: ErrorEvent = {
            type,
            errorInfo,
            context,
            timestamp: new Date(),
            userId,
            guildId,
            channelId
        };

        this.publish(event);
    }

    /**
     * Setup default error event handlers
     */
    private setupDefaultHandlers(): void {
        // Log all error events
        this.subscribe('error_event', (event: ErrorEvent) => {
            const logMessage = `[${event.type}] ${event.errorInfo.message} (Code: ${event.errorInfo.code})`;
            const logContext = {
                ...event.context,
                errorType: event.errorInfo.type,
                severity: event.errorInfo.severity,
                userId: event.userId,
                guildId: event.guildId,
                channelId: event.channelId,
                timestamp: event.timestamp
            };

            switch (event.errorInfo.severity) {
                case 'LOW':
                    Logger.warn(logMessage, logContext);
                    break;
                case 'MEDIUM':
                    Logger.warn(logMessage, logContext);
                    break;
                case 'HIGH':
                    Logger.error(logMessage, event.errorInfo.originalError || logContext);
                    break;
                case 'CRITICAL':
                    Logger.error(logMessage, event.errorInfo.originalError || logContext);
                    break;
            }
        });

        // Handle critical errors with special attention
        this.subscribe(ErrorEventType.CRITICAL_ERROR, (event: ErrorEvent) => {
            Logger.error(`CRITICAL ERROR DETECTED: ${event.errorInfo.message}`, {
                errorCode: event.errorInfo.code,
                context: event.context,
                originalError: event.errorInfo.originalError
            });
            
            // Could add additional critical error handling here:
            // - Send alerts to monitoring systems
            // - Notify administrators
            // - Trigger failsafe mechanisms
        });
    }

    /**
     * Get error statistics for monitoring
     * @returns Basic error statistics
     */
    public getStats(): { totalListeners: number; eventTypes: string[] } {
        return {
            totalListeners: this.emitter.listenerCount('error_event'),
            eventTypes: this.emitter.eventNames() as string[]
        };
    }

    /**
     * Clear all event listeners (useful for testing)
     */
    public clearAllListeners(): void {
        this.emitter.removeAllListeners();
        this.setupDefaultHandlers();
    }
} 