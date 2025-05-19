import { LangKeys } from '../constants/lang-keys.js';
// Import all chat commands
import * as ChatCommands from '../commands/chat/index.js';

/**
 * Checks that every exported chat command has a corresponding entry in LangKeys.Commands.
 * Throws an error if any command is missing its language key constants.
 */
export function checkCommandLangKeyCoverage(): void {
  const missing: string[] = [];
  for (const [exportName, CommandClass] of Object.entries(ChatCommands)) {
    // Only check classes (not default exports or unrelated exports)
    if (typeof CommandClass !== 'function') continue;
    // Derive the expected LangKeys.Commands property name
    // Convention: <Something>Command -> <Something>
    const match = exportName.match(/^(.*)Command$/);
    if (!match) continue;
    const langKeyName = match[1];
    if (!Object.prototype.hasOwnProperty.call(LangKeys.Commands, langKeyName)) {
      missing.push(langKeyName);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing LangKeys.Commands entries for the following commands: ${missing.join(', ')}.\n` +
      'Please add a corresponding object to LangKeys.Commands in lang-keys.ts.'
    );
  }
} 