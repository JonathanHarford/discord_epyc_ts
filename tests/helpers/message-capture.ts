import { BaseMessageOptions, CommandInteraction, TextChannel, User } from 'discord.js';
import { vi } from 'vitest';

import { MessageAdapter } from '../../src/messaging/MessageAdapter.js'; // Adjust path as needed
import { SimpleMessage } from '../../src/messaging/SimpleMessage.js'; // Added import
import { MessageUtils } from '../../src/utils/message-utils.js'; // Adjust path as needed

let capturedMessages: BaseMessageOptions[] = [];
let interactionSpy: ReturnType<typeof vi.spyOn> | undefined;
let dmSpy: ReturnType<typeof vi.spyOn> | undefined; // Spy for DMs via MessageUtils.send
let simpleMessageSpy: ReturnType<typeof vi.spyOn> | undefined; // Spy for SimpleMessage
let userSendSpy: ReturnType<typeof vi.spyOn> | undefined; // Spy for User.prototype.send

// Function to investigate and decide the best DM spy target.
// For now, let's assume MessageUtils.send is a good candidate if it's simpler.
// If MessageAdapter.sendDirectMessage itself is easy to spy on without complex client mocking, that's also fine.

export function startCapturingMessages() {
  capturedMessages = []; // Clear previous messages

  // Spy on interaction responses
  interactionSpy = vi.spyOn(MessageAdapter, 'sendInteractionResponse')
    .mockImplementation(async (_interaction: CommandInteraction, content: BaseMessageOptions) => {
      capturedMessages.push(content);
      return await Promise.resolve();
    });

  // Spy on direct messages
  // Option 1: Spying on MessageAdapter.sendDirectMessage
  // dmSpy = vi.spyOn(MessageAdapter, 'sendDirectMessage')
  //   .mockImplementation(async (_userId: string, content: BaseMessageOptions, _instruction, _client) => {
  //     capturedMessages.push(content);
  //     return Promise.resolve();
  //   });

  // Option 2: Spying on a utility if that's where the core DM logic is
  // Ensure MessageUtils.send is the correct target and its signature.
  // This is a placeholder, actual signature might differ.
  dmSpy = vi.spyOn(MessageUtils, 'send')
     .mockImplementation(async (_target: User | TextChannel, content: BaseMessageOptions) => {
       capturedMessages.push(content);
       // Mock a message object if the original method returns one
       return await Promise.resolve({ id: 'mock-message-id' } as any);
     });

  // Spy on SimpleMessage responses
  // Note: SimpleMessage.sendResponse is private, accessing via string key
  simpleMessageSpy = vi.spyOn(SimpleMessage as any, 'sendResponse')
    .mockImplementation(async (_interaction: CommandInteraction, content: BaseMessageOptions, _ephemeral?: boolean) => {
      capturedMessages.push(content);
      return await Promise.resolve();
    });

  // Spy on User.prototype.send for direct DMs
  userSendSpy = vi.spyOn(User.prototype, 'send')
    // Using 'any' for 'this' context if it's problematic, but usually, it infers correctly.
    // The function signature for User.send is (options: string | MessagePayload | MessageCreateOptions)
    // We are interested in capturing the options.
    .mockImplementation(async function (options: string | BaseMessageOptions) {
      if (typeof options === 'string') {
        capturedMessages.push({ content: options });
      } else {
        capturedMessages.push(options);
      }
      // Return a mock message or something that fulfills the promise type
      return await Promise.resolve({ id: 'mock-dm-message-id' } as any); 
    });
}

export function stopCapturingMessages() {
  interactionSpy?.mockRestore();
  dmSpy?.mockRestore();
  simpleMessageSpy?.mockRestore(); // Restore SimpleMessage spy
  userSendSpy?.mockRestore(); // Restore User.prototype.send spy
}

export function getCapturedMessages(): ReadonlyArray<BaseMessageOptions> {
  return capturedMessages;
}

export function clearCapturedMessages() {
  capturedMessages = [];
}
