export interface MessageInstruction {
  type: 'success' | 'error';
  key: string; // Language key for the Lang service
  data?: Record<string, any>; // Placeholder data for the language string
} 