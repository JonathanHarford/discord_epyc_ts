import { Message, User, Client, DMChannel } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DirectMessageHandler, DMContextType } from '../../src/events/direct-message-handler.js';
import { Logger } from '../../src/services/index.js';

// Mock the Logger
vi.mock('../../src/services/index.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

describe('DirectMessageHandler', () => {
    let handler: DirectMessageHandler;
    let mockMessage: Message;
    let mockUser: User;
    let mockClient: Client;
    let mockDMChannel: DMChannel;

    beforeEach(() => {
        // Reset mocks
        vi.resetAllMocks();

        // Create handler instance
        handler = new DirectMessageHandler();

        // Create mock objects
        mockUser = {
            id: '123456789',
            tag: 'testuser#1234',
            bot: false,
        } as unknown as User;

        mockClient = {
            user: {
                id: '987654321',
            },
        } as unknown as Client;

        mockDMChannel = {
            type: 1, // DM Channel type
        } as unknown as DMChannel;

        // Create mock message
        mockMessage = {
            id: '111222333',
            content: '',
            author: mockUser,
            client: mockClient,
            channel: mockDMChannel,
            attachments: {
                size: 0,
            },
            reply: vi.fn().mockResolvedValue(undefined),
        } as unknown as Message;
    });

    describe('process', () => {
        it('should process a DM with /ready command', async () => {
            // Arrange
            mockMessage.content = '/ready';

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Routing DM'));
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Received /ready command'));
            expect(mockMessage.reply).toHaveBeenCalled();
        });

        it('should process a DM with text content as turn submission', async () => {
            // Arrange
            mockMessage.content = 'This is my turn submission';

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Routing DM'));
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('potential turn submission'));
            expect(mockMessage.reply).toHaveBeenCalled();
        });

        it('should process a DM with attachment as turn submission', async () => {
            // Arrange
            mockMessage.content = '';
            mockMessage.attachments = {
                size: 1,
            } as any;

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Routing DM'));
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('potential turn submission'));
            expect(mockMessage.reply).toHaveBeenCalled();
        });

        it('should process an empty DM as other', async () => {
            // Arrange
            mockMessage.content = '';

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Routing DM'));
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('unrecognized DM'));
            expect(mockMessage.reply).toHaveBeenCalled();
        });

        it('should handle errors during processing', async () => {
            // Arrange
            mockMessage.reply = vi.fn().mockRejectedValue(new Error('Test error'));

            // Act
            await handler.process(mockMessage);

            // Assert
            expect(Logger.error).toHaveBeenCalled();
        });
    });
}); 