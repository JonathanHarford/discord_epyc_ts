import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InfoCommand } from '../../../src/commands/chat/info-command';
import { TestHarness } from '../../harness/harness';
import { SimpleMessage } from '../../../src/messaging/SimpleMessage';

vi.mock('../../../src/messaging/SimpleMessage');

describe('InfoCommand', () => {
    let harness: TestHarness;
    let command: InfoCommand;

    beforeEach(() => {
        command = new InfoCommand();
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

    it('should reply with an embed for "translate" option', async () => {
        harness.withChatInputCommand({
            options: {
                getString: () => 'translate',
            },
        });

        await harness.run();

        expect(SimpleMessage.sendEmbed).toHaveBeenCalled();
    });

    it('should reply with an embed for default option', async () => {
        harness.withChatInputCommand({
            options: {
                getString: () => 'some-other-option',
            },
        });

        await harness.run();

        expect(SimpleMessage.sendEmbed).toHaveBeenCalled();
    });
});
