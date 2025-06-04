import { Guild, ModalSubmitInteraction, User } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminSeasonConfigModalHandler, seasonConfigState } from '../../src/handlers/adminSeasonConfigModalHandler.js';
import { ConfigService } from '../../src/services/ConfigService.js';

// Mock the dependencies
vi.mock('../../src/lib/prisma.js', () => ({
    default: {}
}));

vi.mock('../../src/services/ConfigService.js');
vi.mock('../../src/services/logger.js', () => ({
    Logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

describe('AdminSeasonConfigModalHandler', () => {
    let handler: AdminSeasonConfigModalHandler;
    let mockInteraction: Partial<ModalSubmitInteraction>;
    let mockConfigService: any;

    beforeEach(() => {
        vi.clearAllMocks();
        seasonConfigState.clear();
        
        handler = new AdminSeasonConfigModalHandler();
        
        // Mock ConfigService
        mockConfigService = {
            updateGuildDefaultConfig: vi.fn().mockResolvedValue(undefined)
        };
        vi.mocked(ConfigService).mockImplementation(() => mockConfigService);

        // Create mock interaction
        mockInteraction = {
            customId: 'admin_season_config_step1',
            guild: { id: 'test-guild-id' } as Guild,
            user: { id: 'test-user-id', tag: 'TestUser#1234' } as User,
            fields: {
                getTextInputValue: vi.fn(),
                components: [],
                fields: [],
                getField: vi.fn()
            },
            reply: vi.fn().mockResolvedValue(undefined)
        } as any;
    });

    describe('Step 1 - Basic Settings', () => {
        it('should handle valid step 1 input correctly', async () => {
            // Setup mock field values
            const mockGetTextInputValue = mockInteraction.fields!.getTextInputValue as any;
            mockGetTextInputValue.mockImplementation((fieldId: string) => {
                switch (fieldId) {
                    case 'claimTimeoutInput': return '1d';
                    case 'writingTimeoutInput': return '8h';
                    case 'drawingTimeoutInput': return '2h';
                    case 'minPlayersInput': return '6';
                    case 'maxPlayersInput': return '20';
                    default: return '';
                }
            });

            await handler.execute(mockInteraction as ModalSubmitInteraction);

            // Verify state was stored
            const storedData = seasonConfigState.get('test-user-id');
            expect(storedData).toEqual({
                claimTimeout: '1d',
                writingTimeout: '8h',
                drawingTimeout: '2h',
                minPlayers: 6,
                maxPlayers: 20
            });

            // Verify reply was sent with continue button
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Step 1 Complete!'),
                    components: expect.arrayContaining([
                        expect.objectContaining({
                            components: expect.arrayContaining([
                                expect.objectContaining({
                                    data: expect.objectContaining({
                                        custom_id: 'season_config_continue_test-user-id'
                                    })
                                })
                            ])
                        })
                    ]),
                    ephemeral: true
                })
            );
        });

        it('should reject invalid min players', async () => {
            const mockGetTextInputValue = mockInteraction.fields!.getTextInputValue as any;
            mockGetTextInputValue.mockImplementation((fieldId: string) => {
                switch (fieldId) {
                    case 'claimTimeoutInput': return '1d';
                    case 'writingTimeoutInput': return '8h';
                    case 'drawingTimeoutInput': return '2h';
                    case 'minPlayersInput': return 'invalid';
                    case 'maxPlayersInput': return '20';
                    default: return '';
                }
            });

            await handler.execute(mockInteraction as ModalSubmitInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'Minimum players must be a positive number.',
                ephemeral: true
            });

            // Verify no state was stored
            expect(seasonConfigState.has('test-user-id')).toBe(false);
        });

        it('should reject max players less than or equal to min players', async () => {
            const mockGetTextInputValue = mockInteraction.fields!.getTextInputValue as any;
            mockGetTextInputValue.mockImplementation((fieldId: string) => {
                switch (fieldId) {
                    case 'claimTimeoutInput': return '1d';
                    case 'writingTimeoutInput': return '8h';
                    case 'drawingTimeoutInput': return '2h';
                    case 'minPlayersInput': return '10';
                    case 'maxPlayersInput': return '8';
                    default: return '';
                }
            });

            await handler.execute(mockInteraction as ModalSubmitInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'Maximum players must be greater than minimum players.',
                ephemeral: true
            });

            // Verify no state was stored
            expect(seasonConfigState.has('test-user-id')).toBe(false);
        });
    });

    describe('Step 2 - Advanced Settings', () => {
        beforeEach(() => {
            // Pre-populate step 1 data
            seasonConfigState.set('test-user-id', {
                claimTimeout: '1d',
                writingTimeout: '8h',
                drawingTimeout: '2h',
                minPlayers: 6,
                maxPlayers: 20
            });

            mockInteraction = {
                ...mockInteraction,
                customId: 'admin_season_config_step2'
            } as any;
        });

        it('should handle valid step 2 input correctly', async () => {
            const mockGetTextInputValue = mockInteraction.fields!.getTextInputValue as any;
            mockGetTextInputValue.mockImplementation((fieldId: string) => {
                switch (fieldId) {
                    case 'turnPatternInput': return 'writing,drawing';
                    case 'openDurationInput': return '7d';
                    case 'claimWarningInput': return '1h';
                    case 'writingWarningInput': return '5m';
                    case 'drawingWarningInput': return '10m';
                    default: return '';
                }
            });

            await handler.execute(mockInteraction as ModalSubmitInteraction);

            // Verify config service was called with complete config
            expect(mockConfigService.updateGuildDefaultConfig).toHaveBeenCalledWith('test-guild-id', {
                claimTimeout: '1d',
                writingTimeout: '8h',
                drawingTimeout: '2h',
                minPlayers: 6,
                maxPlayers: 20,
                turnPattern: 'writing,drawing',
                openDuration: '7d',
                claimWarning: '1h',
                writingWarning: '5m',
                drawingWarning: '10m'
            });

            // Verify state was cleaned up
            expect(seasonConfigState.has('test-user-id')).toBe(false);

            // Verify success reply
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('Season configuration updated successfully!'),
                ephemeral: true
            });
        });

        it('should handle missing step 1 data', async () => {
            seasonConfigState.delete('test-user-id'); // Remove step 1 data

            await handler.execute(mockInteraction as ModalSubmitInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'Configuration session expired. Please start over with `/admin season config`.',
                ephemeral: true
            });

            expect(mockConfigService.updateGuildDefaultConfig).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle missing guild', async () => {
            const noGuildInteraction = {
                ...mockInteraction,
                guild: null
            } as any;

            await handler.execute(noGuildInteraction as ModalSubmitInteraction);

            expect(noGuildInteraction.reply).toHaveBeenCalledWith({
                content: 'This command can only be used in a server.',
                ephemeral: true
            });
        });

        it('should handle unknown custom ID', async () => {
            const unknownIdInteraction = {
                ...mockInteraction,
                customId: 'unknown_custom_id'
            } as any;

            await handler.execute(unknownIdInteraction as ModalSubmitInteraction);

            expect(unknownIdInteraction.reply).toHaveBeenCalledWith({
                content: 'Sorry, this action isn\'t recognized.',
                ephemeral: true
            });
        });
    });
}); 