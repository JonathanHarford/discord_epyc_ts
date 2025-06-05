import { ChatInputCommandInteraction, Client } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { ReadyCommand } from '../../../src/commands/chat/ready-command.js';
import { EventData } from '../../../src/models/internal-models.js';

describe('ReadyCommand', () => {
    it('should be properly instantiated', () => {
        const command = new ReadyCommand();
        
        expect(command.names).toEqual(['ready']);
        expect(command.deferType).toBe('HIDDEN');
        expect(command.requireClientPerms).toEqual([]);
    });

    it('should have execute method', () => {
        const command = new ReadyCommand();
        
        expect(typeof command.execute).toBe('function');
    });

    it('should handle missing player gracefully', async () => {
        const command = new ReadyCommand();
        
        // Mock interaction
        const mockInteraction = {
            user: { id: 'test-user-id', tag: 'TestUser#1234' },
            guild: { id: 'test-guild-id' },
            client: {} as Client,
            editReply: vi.fn().mockResolvedValue(undefined)
        } as unknown as ChatInputCommandInteraction;

        const mockEventData = {} as EventData;

        // Execute command - should handle missing player gracefully
        await expect(command.execute(mockInteraction, mockEventData)).resolves.not.toThrow();
        
        // Should call editReply with player not found message
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: expect.stringContaining('not found') // Assuming the string contains "not found"
        });
    });
}); 