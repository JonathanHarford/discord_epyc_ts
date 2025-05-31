import { 
    AutocompleteInteraction,
    ButtonInteraction, 
    ModalSubmitInteraction,
    StringSelectMenuInteraction
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorEventBus, ErrorEventType } from '../../src/events/error-event-bus.js';
import { 
    AutocompleteHandler,
    ButtonHandler,
    InteractionHandlerFactory,
    ModalHandler,
    SelectMenuHandler
} from '../../src/handlers/index.js';
import { Logger } from '../../src/services/index.js';
import { ErrorType } from '../../src/utils/index.js';

// Mock the Logger service
vi.mock('../../src/services/index.js', () => ({
    Logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

// Mock the ErrorEventBus
vi.mock('../../src/events/error-event-bus.js', () => ({
    ErrorEventBus: {
        getInstance: vi.fn(() => ({
            publishError: vi.fn()
        }))
    },
    ErrorEventType: {
        SERVICE_ERROR: 'service_error'
    }
}));

describe('InteractionHandlerFactory - Enhanced Error Handling', () => {
    let factory: InteractionHandlerFactory;
    let mockButtonHandler: ButtonHandler & { execute: ReturnType<typeof vi.fn> };
    let mockSelectMenuHandler: SelectMenuHandler & { execute: ReturnType<typeof vi.fn> };
    let mockModalHandler: ModalHandler & { execute: ReturnType<typeof vi.fn> };
    let mockAutocompleteHandler: AutocompleteHandler & { execute: ReturnType<typeof vi.fn> };
    let mockErrorEventBus: any;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Mock error event bus BEFORE creating the factory
        mockErrorEventBus = {
            publishError: vi.fn()
        };
        vi.mocked(ErrorEventBus.getInstance).mockReturnValue(mockErrorEventBus);
        
        factory = new InteractionHandlerFactory();

        // Create mock handlers with spy functions that can be easily mocked
        mockButtonHandler = {
            customIdPrefix: 'test_button',
            execute: vi.fn().mockResolvedValue(undefined)
        } as any;

        mockSelectMenuHandler = {
            customIdPrefix: 'test_select',
            execute: vi.fn().mockResolvedValue(undefined)
        } as any;

        mockModalHandler = {
            customIdPrefix: 'test_modal',
            execute: vi.fn().mockResolvedValue(undefined)
        } as any;

        mockAutocompleteHandler = {
            commandName: 'test_command',
            execute: vi.fn().mockResolvedValue(undefined)
        } as any;

        // Register handlers
        factory.registerButtonHandler(mockButtonHandler);
        factory.registerSelectMenuHandler(mockSelectMenuHandler);
        factory.registerModalHandler(mockModalHandler);
        factory.registerAutocompleteHandler(mockAutocompleteHandler);
    });

    describe('Error Classification and Handling', () => {
        it('should classify Discord API errors correctly', async () => {
            const mockInteraction = createMockButtonInteraction('test_button_123');
            const discordError = new Error('Interaction has already been acknowledged');
            discordError.name = 'DiscordAPIError';
            
            mockButtonHandler.execute.mockRejectedValue(discordError);

            // The error should be thrown after retries, but events should be published
            await expect(factory.handleButtonInteraction(mockInteraction)).rejects.toThrow();

            // Should have published error event with correct classification
            expect(mockErrorEventBus.publishError).toHaveBeenCalledWith(
                ErrorEventType.SERVICE_ERROR,
                expect.objectContaining({
                    type: ErrorType.DISCORD_API
                }),
                expect.any(Object),
                'user-123',
                'guild-123',
                'channel-123'
            );
        });

        it('should classify permission errors correctly', async () => {
            const mockInteraction = createMockButtonInteraction('test_button_456');
            const permissionError = new Error('Missing permissions');
            
            mockButtonHandler.execute.mockRejectedValue(permissionError);

            // Permission errors should not retry and should throw immediately
            await expect(factory.handleButtonInteraction(mockInteraction)).rejects.toThrow();

            expect(mockErrorEventBus.publishError).toHaveBeenCalledWith(
                ErrorEventType.SERVICE_ERROR,
                expect.objectContaining({
                    type: ErrorType.PERMISSION
                }),
                expect.any(Object),
                'user-123',
                'guild-123',
                'channel-123'
            );
        });

        it('should classify rate limit errors correctly', async () => {
            const mockInteraction = createMockSelectMenuInteraction('test_select_789');
            const rateLimitError = new Error('Rate limit exceeded');
            
            mockSelectMenuHandler.execute.mockRejectedValue(rateLimitError);

            await expect(factory.handleSelectMenuInteraction(mockInteraction)).rejects.toThrow();

            expect(mockErrorEventBus.publishError).toHaveBeenCalledWith(
                ErrorEventType.SERVICE_ERROR,
                expect.objectContaining({
                    type: ErrorType.RATE_LIMIT
                }),
                expect.any(Object),
                'user-123',
                'guild-123',
                'channel-123'
            );
        });

        it('should classify database errors correctly', async () => {
            const mockInteraction = createMockModalInteraction('test_modal_abc');
            const dbError = new Error('Database connection failed');
            dbError.name = 'PrismaClientKnownRequestError';
            
            mockModalHandler.execute.mockRejectedValue(dbError);

            await expect(factory.handleModalInteraction(mockInteraction)).rejects.toThrow();

            expect(mockErrorEventBus.publishError).toHaveBeenCalledWith(
                ErrorEventType.SERVICE_ERROR,
                expect.objectContaining({
                    type: ErrorType.DATABASE
                }),
                expect.any(Object),
                'user-123',
                'guild-123',
                'channel-123'
            );
        });
    });

    describe('Retry Logic', () => {
        it('should retry transient errors up to max attempts', async () => {
            const mockInteraction = createMockButtonInteraction('test_button_retry');
            const transientError = new Error('Temporary service unavailable');
            
            // Fail first two attempts, succeed on third
            mockButtonHandler.execute
                .mockRejectedValueOnce(transientError)
                .mockRejectedValueOnce(transientError)
                .mockResolvedValueOnce(undefined);

            const result = await factory.handleButtonInteraction(mockInteraction);
            
            expect(result).toBe(true);
            expect(mockButtonHandler.execute).toHaveBeenCalledTimes(3);
            
            // Should have published error events for the failed attempts
            expect(mockErrorEventBus.publishError).toHaveBeenCalledTimes(2);
        });

        it('should not retry non-retryable errors', async () => {
            const mockInteraction = createMockButtonInteraction('test_button_no_retry');
            const validationError = new Error('Invalid customId format');
            
            mockButtonHandler.execute.mockRejectedValue(validationError);

            await expect(factory.handleButtonInteraction(mockInteraction)).rejects.toThrow();
            
            // Should only attempt once for validation errors
            expect(mockButtonHandler.execute).toHaveBeenCalledTimes(1);
            expect(mockErrorEventBus.publishError).toHaveBeenCalledTimes(1);
        });

        it('should respect max retry attempts', async () => {
            const mockInteraction = createMockButtonInteraction('test_button_max_retry');
            const retryableError = new Error('Service temporarily unavailable');
            
            mockButtonHandler.execute.mockRejectedValue(retryableError);

            await expect(factory.handleButtonInteraction(mockInteraction)).rejects.toThrow();
            
            // Should attempt 3 times (default max attempts)
            expect(mockButtonHandler.execute).toHaveBeenCalledTimes(3);
            expect(mockErrorEventBus.publishError).toHaveBeenCalledTimes(3);
        });

        it('should use exponential backoff for retry delays', async () => {
            const mockInteraction = createMockButtonInteraction('test_button_backoff');
            const retryableError = new Error('Temporary failure');
            
            mockButtonHandler.execute.mockRejectedValue(retryableError);

            const startTime = Date.now();
            await expect(factory.handleButtonInteraction(mockInteraction)).rejects.toThrow();
            const endTime = Date.now();
            
            // Should have taken at least the minimum delay time for retries
            // Base delay: 100ms, backoff multiplier: 2
            // Expected delays: 100ms, 200ms = 300ms minimum
            expect(endTime - startTime).toBeGreaterThan(250); // Allow some tolerance
        });
    });

    describe('Graceful Degradation', () => {
        it('should provide appropriate error responses for button interactions', async () => {
            const mockInteraction = createMockButtonInteraction('test_button_error_response');
            mockInteraction.reply = vi.fn().mockResolvedValue(undefined);
            
            const error = new Error('Handler execution failed');
            mockButtonHandler.execute.mockRejectedValue(error);

            await expect(factory.handleButtonInteraction(mockInteraction)).rejects.toThrow();

            // Should attempt to send error response to user
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('unexpected error occurred'),
                ephemeral: true
            });
        });

        it('should handle autocomplete errors with empty response', async () => {
            const mockInteraction = createMockAutocompleteInteraction('test_command');
            mockInteraction.respond = vi.fn().mockResolvedValue(undefined);
            
            const error = new Error('Autocomplete failed');
            mockAutocompleteHandler.execute.mockRejectedValue(error);

            await expect(factory.handleAutocompleteInteraction(mockInteraction)).rejects.toThrow();

            // Should respond with empty array for autocomplete errors
            expect(mockInteraction.respond).toHaveBeenCalledWith([]);
        });

        it('should handle already replied interactions gracefully', async () => {
            const mockInteraction = createMockButtonInteraction('test_button_already_replied');
            mockInteraction.replied = true;
            mockInteraction.editReply = vi.fn().mockResolvedValue(undefined);
            
            const error = new Error('Post-reply error');
            mockButtonHandler.execute.mockRejectedValue(error);

            await expect(factory.handleButtonInteraction(mockInteraction)).rejects.toThrow();

            // Should use editReply for already replied interactions
            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('unexpected error occurred')
            });
        });
    });

    describe('Performance Monitoring', () => {
        it('should track cache hits and misses', async () => {
            const mockInteraction1 = createMockButtonInteraction('test_button_cache1');
            const mockInteraction2 = createMockButtonInteraction('test_button_cache1'); // Same customId
            
            await factory.handleButtonInteraction(mockInteraction1);
            await factory.handleButtonInteraction(mockInteraction2);
            
            const stats = factory.getStats();
            expect(stats.performance.cacheHits).toBe(1); // Second call should be cache hit
            expect(stats.performance.cacheMisses).toBe(1); // First call should be cache miss
        });

        it('should track error statistics', async () => {
            const mockInteraction = createMockButtonInteraction('test_button_stats');
            const error = new Error('Test error for stats');
            
            mockButtonHandler.execute = vi.fn().mockRejectedValue(error);

            await expect(factory.handleButtonInteraction(mockInteraction)).rejects.toThrow();
            
            const stats = factory.getStats();
            expect(stats.performance.totalErrors).toBeGreaterThan(0);
            expect(stats.performance.errorsByType).toHaveProperty(ErrorType.UNKNOWN);
        });

        it('should provide health status based on error rates', async () => {
            // Reset stats to ensure clean state
            factory.resetStats();
            
            // Start with healthy status
            let health = factory.getHealthStatus();
            expect(health.status).toBe('healthy');
            
            // Simulate many errors to trigger unhealthy status
            const error = new Error('Health test error');
            mockButtonHandler.execute = vi.fn().mockRejectedValue(error);
            
            // Generate enough errors to exceed threshold
            for (let i = 0; i < 10; i++) {
                try {
                    await factory.handleButtonInteraction(createMockButtonInteraction(`test_button_health_${i}`));
                } catch (_e) {
                    // Expected to throw
                }
            }
            
            health = factory.getHealthStatus();
            expect(health.status).toBe('unhealthy');
            expect(health.details.errorRate).toBeGreaterThan(50);
        });
    });

    describe('Configuration Management', () => {
        it('should allow updating retry configuration', () => {
            const newConfig = {
                maxAttempts: 5,
                baseDelayMs: 200
            };
            
            factory.updateRetryConfig(newConfig);
            
            const stats = factory.getStats();
            expect(stats.retryConfig.maxAttempts).toBe(5);
            expect(stats.retryConfig.baseDelayMs).toBe(200);
        });

        it('should reset statistics when requested', () => {
            // Generate some stats first
            const _mockInteraction = createMockButtonInteraction('test_button_reset');
            factory.handleButtonInteraction(_mockInteraction);
            
            factory.resetStats();
            
            const stats = factory.getStats();
            expect(stats.performance.totalHandled).toBe(0);
            expect(stats.performance.totalErrors).toBe(0);
        });
    });

    describe('Handler Registration Validation', () => {
        it('should validate handler customIdPrefix', () => {
            const invalidHandler = {
                customIdPrefix: '',
                execute: vi.fn()
            } as any;

            expect(() => factory.registerButtonHandler(invalidHandler)).toThrow('Handler customIdPrefix cannot be empty');
        });

        it('should warn about handlers with spaces in customIdPrefix', () => {
            const handlerWithSpaces = {
                customIdPrefix: 'test button',
                execute: vi.fn()
            } as any;

            factory.registerButtonHandler(handlerWithSpaces);

            expect(Logger.warn).toHaveBeenCalledWith(
                'Handler customIdPrefix "test button" contains spaces, which may cause routing issues'
            );
        });
    });

    describe('Unhandled Interactions', () => {
        it('should return false for unhandled button interactions', async () => {
            const mockInteraction = createMockButtonInteraction('unhandled_button');
            
            const result = await factory.handleButtonInteraction(mockInteraction);
            
            expect(result).toBe(false);
        });

        it('should return false for unhandled select menu interactions', async () => {
            const mockInteraction = createMockSelectMenuInteraction('unhandled_select');
            
            const result = await factory.handleSelectMenuInteraction(mockInteraction);
            
            expect(result).toBe(false);
        });

        it('should return false for unhandled modal interactions', async () => {
            const mockInteraction = createMockModalInteraction('unhandled_modal');
            
            const result = await factory.handleModalInteraction(mockInteraction);
            
            expect(result).toBe(false);
        });

        it('should return false for unhandled autocomplete interactions', async () => {
            const mockInteraction = createMockAutocompleteInteraction('unhandled_command');
            
            const result = await factory.handleAutocompleteInteraction(mockInteraction);
            
            expect(result).toBe(false);
        });
    });
});

// Helper functions to create mock interactions
function createMockButtonInteraction(customId: string): ButtonInteraction {
    return {
        id: 'interaction-123',
        customId,
        user: { id: 'user-123', tag: 'TestUser#1234' },
        guild: { id: 'guild-123', name: 'Test Guild' },
        channel: { id: 'channel-123' },
        isRepliable: () => true,
        isAutocomplete: () => false,
        replied: false,
        deferred: false,
        reply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined)
    } as any;
}

function createMockSelectMenuInteraction(customId: string): StringSelectMenuInteraction {
    return {
        id: 'interaction-123',
        customId,
        user: { id: 'user-123', tag: 'TestUser#1234' },
        guild: { id: 'guild-123', name: 'Test Guild' },
        channel: { id: 'channel-123' },
        isRepliable: () => true,
        isAutocomplete: () => false,
        replied: false,
        deferred: false,
        reply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined)
    } as any;
}

function createMockModalInteraction(customId: string): ModalSubmitInteraction {
    return {
        id: 'interaction-123',
        customId,
        user: { id: 'user-123', tag: 'TestUser#1234' },
        guild: { id: 'guild-123', name: 'Test Guild' },
        channel: { id: 'channel-123' },
        isRepliable: () => true,
        isAutocomplete: () => false,
        replied: false,
        deferred: false,
        reply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined)
    } as any;
}

function createMockAutocompleteInteraction(commandName: string): AutocompleteInteraction {
    return {
        id: 'interaction-123',
        commandName,
        user: { id: 'user-123', tag: 'TestUser#1234' },
        guild: { id: 'guild-123', name: 'Test Guild' },
        channel: { id: 'channel-123' },
        isAutocomplete: () => true,
        responded: false,
        respond: vi.fn().mockResolvedValue(undefined),
        options: {
            getFocused: () => ({ name: 'test_option', value: 'test_value' })
        }
    } as any;
} 