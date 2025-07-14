import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HelpCommand } from '../../../src/commands/chat/help-command';
import { TestHarness } from '../../harness/harness';
import { SimpleMessage } from '../../../src/messaging/SimpleMessage';

vi.mock('../../../src/messaging/SimpleMessage');

describe('HelpCommand', () => {
    let harness: TestHarness;
    let command: HelpCommand;

    beforeEach(() => {
        command = new HelpCommand();
        harness = new TestHarness(command);
        vi.clearAllMocks();
    });

    it('should reply with an embed for "about" option', async () => {
        harness.withChatInputCommand({
            options: {
                getString: () => 'about',
            },
        });

        await harness.run();

        expect(SimpleMessage.sendEmbed).toHaveBeenCalled();
    });

    it('should reply with an embed for "commands" option', async () => {
        harness.withChatInputCommand({
            options: {
                getString: () => 'commands',
            },
        });

        await harness.run();

        expect(SimpleMessage.sendEmbed).toHaveBeenCalled();
    });
});
