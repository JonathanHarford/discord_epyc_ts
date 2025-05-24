import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandInteraction, Message, User, Guild, TextChannel, Locale } from 'discord.js';
import { ErrorHandler, ErrorType, ErrorSeverity, ErrorInfo } from '../../src/utils/error-handler.js';
import { MessageAdapter } from '../../src/messaging/MessageAdapter.js';
import { ErrorEventBus, ErrorEventType } from '../../src/events/error-event-bus.js';
import { EventData } from '../../src/models/internal-models.js';

// Mock dependencies
vi.mock('../../src/messaging/MessageAdapter.js');
vi.mock('../../src/events/error-event-bus.js');
vi.mock('../../src/services/index.js', () => ({
    Logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn()
    }
}));

describe('ErrorHandler', () => {
    let mockInteraction: Partial<CommandInteraction>;
    let mockMessage: Partial<Message>;
    let mockEventData: EventData;
    let mockEventBus: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock interaction
        mockInteraction = {
            id: 'interaction-123',
            commandName: 'test-command',
            user: { id: 'user-123', tag: 'TestUser#1234' } as User,
            guild: { id: 'guild-123', name: 'Test Guild' } as Guild,
            channel: { id: 'channel-123' } as TextChannel,
            replied: false,
            deferred: false,
            valueOf: () => 'interaction-123'
        } as Partial<CommandInteraction>;

        // Mock message
        mockMessage = {
            id: 'message-123',
            author: { id: 'user-456', tag: 'DMUser#5678' } as User,
            channel: { id: 'dm-channel-123' } as any,
            client: { user: { id: 'bot-123' } } as any,
            reply: vi.fn().mockResolvedValue(undefined),
            valueOf: () => 'message-123'
        } as Partial<Message>;

        // Mock event data
        mockEventData = new EventData(Locale.EnglishUS, Locale.EnglishUS);

        // Mock event bus
        mockEventBus = {
            publishError: vi.fn()
        };
        vi.mocked(ErrorEventBus.getInstance).mockReturnValue(mockEventBus);

        // Mock MessageAdapter
        vi.mocked(MessageAdapter.safeProcessInstruction).mockResolvedValue(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Error Classification', () => {
        it('should classify database errors correctly', () => {
            const dbError = new Error('Prisma connection failed');
            dbError.name = 'PrismaClientKnownRequestError';

            const result = ErrorHandler['classifyError'](dbError);
            expect(result).toBe(ErrorType.DATABASE);
        });

        it('should classify Discord API errors correctly', () => {
            const discordError = new Error('Missing permissions');
            discordError.name = 'DiscordAPIError';

            const result = ErrorHandler['classifyError'](discordError);
            expect(result).toBe(ErrorType.DISCORD_API);
        });

        it('should classify validation errors correctly', () => {
            const validationError = new Error('Invalid input provided');

            const result = ErrorHandler['classifyError'](validationError);
            expect(result).toBe(ErrorType.VALIDATION);
        });

        it('should classify business logic errors correctly', () => {
            const businessError = new Error('Season not found');

            const result = ErrorHandler['classifyError'](businessError);
            expect(result).toBe(ErrorType.BUSINESS_LOGIC);
        });

        it('should classify permission errors correctly', () => {
            const permissionError = new Error('Unauthorized access');

            const result = ErrorHandler['classifyError'](permissionError);
            expect(result).toBe(ErrorType.PERMISSION);
        });

        it('should classify rate limit errors correctly', () => {
            const rateLimitError = new Error('Rate limit exceeded');

            const result = ErrorHandler['classifyError'](rateLimitError);
            expect(result).toBe(ErrorType.RATE_LIMIT);
        });

        it('should default to UNKNOWN for unrecognized errors', () => {
            const unknownError = new Error('Some random error');

            const result = ErrorHandler['classifyError'](unknownError);
            expect(result).toBe(ErrorType.UNKNOWN);
        });
    });

    describe('Error Severity Determination', () => {
        it('should assign LOW severity to validation errors', () => {
            const result = ErrorHandler['determineSeverity'](ErrorType.VALIDATION, new Error('test'));
            expect(result).toBe(ErrorSeverity.LOW);
        });

        it('should assign LOW severity to business logic errors', () => {
            const result = ErrorHandler['determineSeverity'](ErrorType.BUSINESS_LOGIC, new Error('test'));
            expect(result).toBe(ErrorSeverity.LOW);
        });

        it('should assign MEDIUM severity to permission errors', () => {
            const result = ErrorHandler['determineSeverity'](ErrorType.PERMISSION, new Error('test'));
            expect(result).toBe(ErrorSeverity.MEDIUM);
        });

        it('should assign HIGH severity to Discord API errors', () => {
            const result = ErrorHandler['determineSeverity'](ErrorType.DISCORD_API, new Error('test'));
            expect(result).toBe(ErrorSeverity.HIGH);
        });

        it('should assign CRITICAL severity to database errors', () => {
            const result = ErrorHandler['determineSeverity'](ErrorType.DATABASE, new Error('test'));
            expect(result).toBe(ErrorSeverity.CRITICAL);
        });
    });

    describe('Error Code Generation', () => {
        it('should generate unique error codes', () => {
            const code1 = ErrorHandler['generateErrorCode'](ErrorType.VALIDATION);
            const code2 = ErrorHandler['generateErrorCode'](ErrorType.VALIDATION);

            expect(code1).toMatch(/^VALIDATION_[A-Z0-9]+_[A-Z0-9]+$/);
            expect(code2).toMatch(/^VALIDATION_[A-Z0-9]+_[A-Z0-9]+$/);
            expect(code1).not.toBe(code2);
        });

        it('should include error type in the code', () => {
            const code = ErrorHandler['generateErrorCode'](ErrorType.DATABASE);
            expect(code).toMatch(/^DATABASE_/);
        });
    });

    describe('User Message Generation', () => {
        it('should generate appropriate message for validation errors', () => {
            const message = ErrorHandler['generateUserMessage'](ErrorType.VALIDATION, new Error('test'));
            expect(message).toBe('Please check your input and try again.');
        });

        it('should generate appropriate message for business logic errors', () => {
            const message = ErrorHandler['generateUserMessage'](ErrorType.BUSINESS_LOGIC, new Error('test'));
            expect(message).toBe('The requested operation cannot be completed. Please verify your request.');
        });

        it('should generate appropriate message for database errors', () => {
            const message = ErrorHandler['generateUserMessage'](ErrorType.DATABASE, new Error('test'));
            expect(message).toBe('A database error occurred. Please try again later.');
        });

        it('should generate generic message for unknown errors', () => {
            const message = ErrorHandler['generateUserMessage'](ErrorType.UNKNOWN, new Error('test'));
            expect(message).toBe('An unexpected error occurred. Please try again or contact support if the problem persists.');
        });
    });

    describe('handleCommandError', () => {
        it('should handle command errors with proper context', async () => {
            const error = new Error('Test command error');
            const context = { additionalInfo: 'test context' };

            await ErrorHandler.handleCommandError(
                error,
                mockInteraction as CommandInteraction,
                mockEventData,
                context
            );

            // Verify event bus was called
            expect(mockEventBus.publishError).toHaveBeenCalledWith(
                ErrorEventType.COMMAND_ERROR,
                expect.objectContaining({
                    type: ErrorType.UNKNOWN,
                    message: 'Test command error'
                }),
                expect.objectContaining({
                    interactionId: 'interaction-123',
                    commandName: 'test-command',
                    userId: 'user-123',
                    additionalInfo: 'test context'
                }),
                'user-123',
                'guild-123',
                'channel-123'
            );

            // Verify message was sent
            expect(MessageAdapter.safeProcessInstruction).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'error',
                    formatting: expect.objectContaining({
                        ephemeral: true,
                        embed: true
                    })
                }),
                mockInteraction,
                Locale.EnglishUS
            );
        });

        it('should handle ErrorInfo objects directly', async () => {
            const errorInfo: ErrorInfo = {
                type: ErrorType.VALIDATION,
                severity: ErrorSeverity.LOW,
                code: 'TEST_ERROR_123',
                message: 'Custom error message',
                userMessage: 'Custom user message',
                context: { custom: 'data' }
            };

            await ErrorHandler.handleCommandError(
                errorInfo,
                mockInteraction as CommandInteraction,
                mockEventData
            );

            expect(mockEventBus.publishError).toHaveBeenCalledWith(
                ErrorEventType.COMMAND_ERROR,
                expect.objectContaining({
                    type: ErrorType.VALIDATION,
                    code: 'TEST_ERROR_123',
                    message: 'Custom error message'
                }),
                expect.any(Object),
                'user-123',
                'guild-123',
                'channel-123'
            );
        });
    });

    describe('handleDMError', () => {
        it('should handle DM errors with proper context', async () => {
            const error = new Error('Test DM error');
            const context = { dmType: 'turn_submission' };

            await ErrorHandler.handleDMError(
                error,
                mockMessage as Message,
                context
            );

            // Verify event bus was called
            expect(mockEventBus.publishError).toHaveBeenCalledWith(
                ErrorEventType.DM_ERROR,
                expect.objectContaining({
                    type: ErrorType.UNKNOWN,
                    message: 'Test DM error'
                }),
                expect.objectContaining({
                    messageId: 'message-123',
                    userId: 'user-456',
                    channelId: 'dm-channel-123',
                    dmType: 'turn_submission'
                }),
                'user-456',
                undefined,
                'dm-channel-123'
            );

            // Verify message was sent via MessageAdapter
            expect(MessageAdapter.safeProcessInstruction).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'error',
                    formatting: expect.objectContaining({
                        dm: true,
                        embed: true
                    }),
                    context: expect.objectContaining({
                        userId: 'user-456'
                    })
                }),
                undefined,
                Locale.EnglishUS,
                mockMessage.client
            );
        });

        it('should fallback to direct reply if MessageAdapter fails', async () => {
            vi.mocked(MessageAdapter.safeProcessInstruction).mockResolvedValue(false);

            const error = new Error('Test DM error');
            await ErrorHandler.handleDMError(error, mockMessage as Message);

            expect(mockMessage.reply).toHaveBeenCalledWith(
                'An unexpected error occurred. Please try again or contact support if the problem persists.'
            );
        });
    });

    describe('createCustomError', () => {
        it('should create custom ErrorInfo with provided details', () => {
            const result = ErrorHandler.createCustomError(
                ErrorType.BUSINESS_LOGIC,
                'CUSTOM_ERROR_123',
                'Technical message',
                'User-friendly message',
                { customData: 'test' }
            );

            expect(result).toEqual({
                type: ErrorType.BUSINESS_LOGIC,
                severity: ErrorSeverity.LOW,
                code: 'CUSTOM_ERROR_123',
                message: 'Technical message',
                userMessage: 'User-friendly message',
                context: { customData: 'test' }
            });
        });
    });

    describe('wrapCommand', () => {
        it('should execute function normally when no error occurs', async () => {
            const mockFn = vi.fn().mockResolvedValue('success');
            const wrappedFn = ErrorHandler.wrapCommand(
                mockFn,
                mockInteraction as CommandInteraction,
                mockEventData
            );

            const result = await wrappedFn('arg1', 'arg2');

            expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
            expect(result).toBe('success');
            expect(mockEventBus.publishError).not.toHaveBeenCalled();
        });

        it('should handle errors when function throws', async () => {
            const mockFn = vi.fn().mockRejectedValue(new Error('Function error'));
            const wrappedFn = ErrorHandler.wrapCommand(
                mockFn,
                mockInteraction as CommandInteraction,
                mockEventData,
                { wrapperContext: 'test' }
            );

            const result = await wrappedFn('arg1');

            expect(mockFn).toHaveBeenCalledWith('arg1');
            expect(result).toBeUndefined();
            expect(mockEventBus.publishError).toHaveBeenCalledWith(
                ErrorEventType.COMMAND_ERROR,
                expect.objectContaining({
                    message: 'Function error'
                }),
                expect.objectContaining({
                    wrapperContext: 'test'
                }),
                'user-123',
                'guild-123',
                'channel-123'
            );
        });
    });

    describe('wrapDMHandler', () => {
        it('should execute function normally when no error occurs', async () => {
            const mockFn = vi.fn().mockResolvedValue('dm success');
            const wrappedFn = ErrorHandler.wrapDMHandler(
                mockFn,
                mockMessage as Message
            );

            const result = await wrappedFn('dmArg');

            expect(mockFn).toHaveBeenCalledWith('dmArg');
            expect(result).toBe('dm success');
            expect(mockEventBus.publishError).not.toHaveBeenCalled();
        });

        it('should handle errors when DM function throws', async () => {
            const mockFn = vi.fn().mockRejectedValue(new Error('DM error'));
            const wrappedFn = ErrorHandler.wrapDMHandler(
                mockFn,
                mockMessage as Message,
                { dmContext: 'ready_command' }
            );

            const result = await wrappedFn();

            expect(result).toBeUndefined();
            expect(mockEventBus.publishError).toHaveBeenCalledWith(
                ErrorEventType.DM_ERROR,
                expect.objectContaining({
                    message: 'DM error'
                }),
                expect.objectContaining({
                    dmContext: 'ready_command'
                }),
                'user-456',
                undefined,
                'dm-channel-123'
            );
        });
    });

    describe('Error Instruction Creation', () => {
        it('should create error instruction with proper structure', () => {
            const errorInfo: ErrorInfo = {
                type: ErrorType.VALIDATION,
                severity: ErrorSeverity.LOW,
                code: 'VAL_ERROR_123',
                message: 'Validation failed',
                userMessage: 'Please check your input',
                context: { field: 'username' }
            };

            const instruction = ErrorHandler.createErrorInstruction(errorInfo, true);

            expect(instruction).toEqual({
                type: 'error',
                key: 'errorEmbeds.validation',
                data: {
                    errorCode: 'VAL_ERROR_123',
                    message: 'Please check your input',
                    field: 'username'
                },
                formatting: {
                    ephemeral: true,
                    embed: true
                }
            });
        });

        it('should map error types to correct language keys', () => {
            const testCases = [
                { type: ErrorType.VALIDATION, expectedKey: 'errorEmbeds.validation' },
                { type: ErrorType.BUSINESS_LOGIC, expectedKey: 'errorEmbeds.businessLogic' },
                { type: ErrorType.DATABASE, expectedKey: 'errorEmbeds.database' },
                { type: ErrorType.DISCORD_API, expectedKey: 'errorEmbeds.discordApi' },
                { type: ErrorType.PERMISSION, expectedKey: 'errorEmbeds.permission' },
                { type: ErrorType.RATE_LIMIT, expectedKey: 'errorEmbeds.rateLimit' },
                { type: ErrorType.EXTERNAL_SERVICE, expectedKey: 'errorEmbeds.externalService' },
                { type: ErrorType.UNKNOWN, expectedKey: 'errorEmbeds.command' }
            ];

            testCases.forEach(({ type, expectedKey }) => {
                const key = ErrorHandler['getErrorMessageKey']({ type } as ErrorInfo);
                expect(key).toBe(expectedKey);
            });
        });
    });

    describe('Error Normalization', () => {
        it('should normalize Error objects to ErrorInfo', () => {
            const error = new Error('Test error message');
            const context = { source: 'test' };

            const result = ErrorHandler['normalizeError'](error, context);

            expect(result).toMatchObject({
                type: ErrorType.UNKNOWN,
                severity: ErrorSeverity.CRITICAL,
                message: 'Test error message',
                userMessage: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
                context: { source: 'test' },
                originalError: error
            });
            expect(result.code).toMatch(/^UNKNOWN_[A-Z0-9]+_[A-Z0-9]+$/);
        });

        it('should preserve ErrorInfo objects with additional context', () => {
            const errorInfo: ErrorInfo = {
                type: ErrorType.VALIDATION,
                severity: ErrorSeverity.LOW,
                code: 'EXISTING_CODE',
                message: 'Existing message',
                userMessage: 'Existing user message',
                context: { existing: 'data' }
            };

            const result = ErrorHandler['normalizeError'](errorInfo, { additional: 'context' });

            expect(result).toEqual({
                ...errorInfo,
                context: {
                    existing: 'data',
                    additional: 'context'
                }
            });
        });
    });
}); 