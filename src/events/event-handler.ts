export interface EventHandler {
    // Using any[] for args because different Discord events have varying argument structures
    // (e.g., messageCreate has Message, interactionCreate has Interaction, etc.)
    // This generic interface needs to accommodate all event types
    process(...args: any[]): Promise<void>;
}
