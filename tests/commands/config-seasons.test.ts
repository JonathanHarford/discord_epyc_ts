import { describe, it, expect, vi } from 'vitest';
import { ConfigCommand } from '../../src/commands/chat/config-command.js';

describe('ConfigCommand - Season Settings', () => {
    // Create a class that exposes the private methods for testing
    class TestConfigCommand extends ConfigCommand {
        formatSettingsForTest(settings: any): string {
            return this['formatSeasonSettings'](settings);
        }
    }
    
    // Only test the pure formatting function which doesn't require mocks
    describe('formatSeasonSettings', () => {
        it('should format season settings correctly', () => {
            const command = new TestConfigCommand();
            
            const settings = {
                openDuration: '7d',
                minPlayers: 3,
                maxPlayers: 10
            };
            
            const formatted = command.formatSettingsForTest(settings);
            
            expect(formatted).toContain('**Default season settings:**');
            expect(formatted).toContain('open_duration: 7d');
            expect(formatted).toContain('min_players: 3');
            expect(formatted).toContain('max_players: 10');
        });
        
        it('should format null maxPlayers as "none"', () => {
            const command = new TestConfigCommand();
            
            const settings = {
                openDuration: '7d',
                minPlayers: 3,
                maxPlayers: null
            };
            
            const formatted = command.formatSettingsForTest(settings);
            
            expect(formatted).toContain('**Default season settings:**');
            expect(formatted).toContain('open_duration: 7d');
            expect(formatted).toContain('min_players: 3');
            expect(formatted).toContain('max_players: none');
        });
        
        it('should handle missing values', () => {
            const command = new TestConfigCommand();
            
            const settings = {
                openDuration: '7d'
                // Missing minPlayers and maxPlayers
            };
            
            const formatted = command.formatSettingsForTest(settings);
            
            expect(formatted).toContain('**Default season settings:**');
            expect(formatted).toContain('open_duration: 7d');
            // Should not throw errors for missing properties
        });
    });
}); 