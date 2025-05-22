import { Message, User, Client, DMChannel, TextChannel } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DirectMessageHandler } from '../../src/events/direct-message-handler.js';
import { MessageHandler } from '../../src/events/message-handler.js';
import { TriggerHandler } from '../../src/events/index.js';

describe('MessageHandler', () => {
    let handler: MessageHandler;
    let mockUser: User;
    let mockClient: Client;
    let mockDMChannel: DMChannel;
    let mockTextChannel: TextChannel;
    let mockTriggerHandler: TriggerHandler;
    let mockDirectMessageHandler: DirectMessageHandler;

    beforeEach(() => {
        // Create mock handlers
        mockTriggerHandler = {
            process: vi.fn().mockResolvedValue(undefined),
        } as unknown as TriggerHandler;

        mockDirectMessageHandler = {
            process: vi.fn().mockResolvedValue(undefined),
        } as unknown as DirectMessageHandler;

        // Create handler instance
        handler = new MessageHandler(mockTriggerHandler, mockDirectMessageHandler);

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

        mockTextChannel = {
            type: 0, // Text Channel type
        } as unknown as TextChannel;
    });

    function createMockMessage(options: {
        isSystem?: boolean;
        authorId?: string;
        isDM?: boolean;
    } = {}): Message {
        return {
            id: '111222333',
            content: 'Test message',
            author: {
                ...mockUser,
                id: options.authorId || mockUser.id,
            },
            client: mockClient,
            channel: options.isDM ? mockDMChannel : mockTextChannel,
            system: options.isSystem || false,
        } as unknown as Message;
    }

    it('should ignore system messages', async () => {
        // Arrange
        const mockMessage = createMockMessage({ isSystem: true });

        // Act
        await handler.process(mockMessage);

        // Assert
        expect(mockDirectMessageHandler.process).not.toHaveBeenCalled();
        expect(mockTriggerHandler.process).not.toHaveBeenCalled();
    });

    it('should ignore messages from self', async () => {
        // Arrange
        const mockMessage = createMockMessage({ authorId: mockClient.user!.id });

        // Act
        await handler.process(mockMessage);

        // Assert
        expect(mockDirectMessageHandler.process).not.toHaveBeenCalled();
        expect(mockTriggerHandler.process).not.toHaveBeenCalled();
    });

    it('should route DMs to the DirectMessageHandler', async () => {
        // Arrange
        const mockMessage = createMockMessage({ isDM: true });

        // Act
        await handler.process(mockMessage);

        // Assert
        expect(mockDirectMessageHandler.process).toHaveBeenCalledWith(mockMessage);
        expect(mockTriggerHandler.process).not.toHaveBeenCalled();
    });

    it('should route regular channel messages to the TriggerHandler', async () => {
        // Arrange
        const mockMessage = createMockMessage({ isDM: false });

        // Act
        await handler.process(mockMessage);

        // Assert
        expect(mockDirectMessageHandler.process).not.toHaveBeenCalled();
        expect(mockTriggerHandler.process).toHaveBeenCalledWith(mockMessage);
    });
}); 