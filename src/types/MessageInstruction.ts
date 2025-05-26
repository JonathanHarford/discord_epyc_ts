export interface MessageInstruction {
  type: 'success' | 'error' | 'info' | 'warning';
  key: string; // Language key for the Lang service
  // Using any for data values because they can be strings, numbers, booleans, or complex objects
  // that get interpolated into language strings. The flexibility is needed for various message types.
  data?: Record<string, any>; // Placeholder data for the language string
  
  // Platform-specific formatting options
  formatting?: {
    ephemeral?: boolean; // For Discord interactions
    embed?: boolean; // Whether to format as an embed
    dm?: boolean; // Whether this should be sent as a DM
    channel?: string; // Specific channel ID for posting
    followUp?: boolean; // Whether this is a follow-up message
  };
  
  // Additional message context
  context?: {
    commandName?: string; // The command that generated this message
    userId?: string; // Target user for DMs
    guildId?: string; // Guild context
  };
} 