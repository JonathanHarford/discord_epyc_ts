import { Client, CommandInteraction, Guild, User } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageAdapter } from '../../src/messaging/MessageAdapter.js';
import { MessageInstruction } from '../../src/types/MessageInstruction.js';

// Mock Discord.js components
vi.mock('discord.js', async () => {
  const actual = await vi.importActual('discord.js');
  return {
    ...actual,
    EmbedBuilder: vi.fn().mockImplementation(() => ({
      setDescription: vi.fn().mockReturnThis(),
      setTimestamp: vi.fn().mockReturnThis(),
      setColor: vi.fn().mockReturnThis(),
      setTitle: vi.fn().mockReturnThis(),
    })),
  };
});

// Mock the strings module
vi.mock('../../src/lang/strings.js', () => ({
  strings: {
    messages: {
      test: {
        success: 'Test success message',
        error: 'Test error message',
        info: 'Test info message'
      }
    }
  },
  interpolate: vi.fn((str: string) => str)
}));

// Mock MessageUtils
vi.mock('../../src/utils/message-utils.js', () => ({
  MessageUtils: {
    send: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock ErrorEventBus and ErrorHandler
vi.mock('../../src/events/error-event-bus.js', () => ({
  ErrorEventBus: {
    getInstance: vi.fn(() => ({
      publishError: vi.fn()
    }))
  },
  ErrorEventType: {
    MESSAGE_ERROR: 'MESSAGE_ERROR'
  }
}));

vi.mock('../../src/utils/error-handler.js', () => ({
  ErrorHandler: {
    createCustomError: vi.fn()
  },
  ErrorType: {
    DISCORD_API: 'DISCORD_API',
    LOCALIZATION_ERROR: 'LOCALIZATION_ERROR'
  }
}));

describe('MessageAdapter - Ephemeral Preference (Task 71.1)', () => {
  let mockInteraction: CommandInteraction;
  let mockClient: Client;
  let mockGuild: Guild;
  let mockUser: User;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock objects
    mockUser = {
      id: 'user123'
    } as User;
    
    mockGuild = {
      id: 'guild123'
    } as Guild;
    
    mockInteraction = {
      guild: mockGuild,
      user: mockUser,
      replied: false,
      deferred: false,
      reply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined)
    } as unknown as CommandInteraction;
    
    mockClient = {
      users: {
        fetch: vi.fn().mockResolvedValue(mockUser)
      }
    } as unknown as Client;
  });

  describe('Ephemeral preference logic', () => {
    it('should prefer ephemeral over DM for error messages in guild context', async () => {
      const instruction: MessageInstruction = {
        type: 'error',
        key: 'messages.test.error',
        formatting: {
          dm: true,
          embed: true
        },
        context: {
          userId: 'user123',
          commandName: 'ready'
        }
      };

      await MessageAdapter.processInstruction(instruction, mockInteraction, 'en', mockClient);

      // Should call interaction.reply with ephemeral: true, not send DM
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          ephemeral: true
        })
      );
      expect(mockClient.users.fetch).not.toHaveBeenCalled();
    });

    it('should prefer ephemeral over DM for success messages in guild context', async () => {
      const instruction: MessageInstruction = {
        type: 'success',
        key: 'messages.test.success',
        formatting: {
          dm: true,
          embed: true
        },
        context: {
          userId: 'user123',
          commandName: 'season'
        }
      };

      await MessageAdapter.processInstruction(instruction, mockInteraction, 'en', mockClient);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          ephemeral: true
        })
      );
      expect(mockClient.users.fetch).not.toHaveBeenCalled();
    });

    it('should prefer ephemeral over DM for game-related commands', async () => {
      const gameCommands = ['ready', 'status', 'turn', 'game', 'season'];
      
      for (const command of gameCommands) {
        vi.clearAllMocks();
        
        const instruction: MessageInstruction = {
          type: 'info',
          key: 'messages.test.info',
          formatting: {
            dm: true
          },
          context: {
            userId: 'user123',
            commandName: command
          }
        };

        await MessageAdapter.processInstruction(instruction, mockInteraction, 'en', mockClient);

        expect(mockInteraction.reply).toHaveBeenCalledWith(
          expect.objectContaining({
            ephemeral: true
          })
        );
        expect(mockClient.users.fetch).not.toHaveBeenCalled();
      }
    });

    it('should fall back to DM when no interaction context is available', async () => {
      const instruction: MessageInstruction = {
        type: 'info',
        key: 'messages.test.info',
        formatting: {
          dm: true
        },
        context: {
          userId: 'user123'
        }
      };

      await MessageAdapter.processInstruction(instruction, undefined, 'en', mockClient);

      // Should send DM since no interaction context
      expect(mockClient.users.fetch).toHaveBeenCalledWith('user123');
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should fall back to DM when interaction is not in guild context', async () => {
      const dmInteraction = {
        ...mockInteraction,
        guild: null // DM context
      } as unknown as CommandInteraction;

      const instruction: MessageInstruction = {
        type: 'success',
        key: 'messages.test.success',
        formatting: {
          dm: true
        },
        context: {
          userId: 'user123',
          commandName: 'season'
        }
      };

      await MessageAdapter.processInstruction(instruction, dmInteraction, 'en', mockClient);

      // Should send DM since not in guild context
      expect(mockClient.users.fetch).toHaveBeenCalledWith('user123');
      expect(dmInteraction.reply).not.toHaveBeenCalled();
    });

    it('should respect original ephemeral setting when not requesting DM', async () => {
      const instruction: MessageInstruction = {
        type: 'success',
        key: 'messages.test.success',
        formatting: {
          ephemeral: false, // Explicitly not ephemeral
          embed: true
        }
      };

      await MessageAdapter.processInstruction(instruction, mockInteraction, 'en', mockClient);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          ephemeral: false
        })
      );
    });

    it('should handle missing Discord client gracefully when DM fallback is needed', async () => {
      const instruction: MessageInstruction = {
        type: 'info',
        key: 'messages.test.info',
        formatting: {
          dm: true
        },
        context: {
          userId: 'user123'
        }
      };

      // Should throw error when no client provided for DM
      await expect(
        MessageAdapter.processInstruction(instruction, undefined, 'en', undefined)
      ).rejects.toThrow('Discord client required for DM sending');
    });
  });

  describe('shouldPreferEphemeral method', () => {
    it('should return true for error messages in guild context', () => {
      const instruction: MessageInstruction = {
        type: 'error',
        key: 'test.key'
      };

      // Access private method for testing
      const result = (MessageAdapter as any).shouldPreferEphemeral(instruction, mockInteraction);
      expect(result).toBe(true);
    });

    it('should return true for game-related commands in guild context', () => {
      const instruction: MessageInstruction = {
        type: 'info',
        key: 'test.key',
        context: {
          commandName: 'season_join'
        }
      };

      const result = (MessageAdapter as any).shouldPreferEphemeral(instruction, mockInteraction);
      expect(result).toBe(true);
    });

    it('should return false for non-guild context', () => {
      const dmInteraction = {
        ...mockInteraction,
        guild: null
      } as unknown as CommandInteraction;

      const instruction: MessageInstruction = {
        type: 'error',
        key: 'test.key'
      };

      const result = (MessageAdapter as any).shouldPreferEphemeral(instruction, dmInteraction);
      expect(result).toBe(false);
    });
  });
}); 