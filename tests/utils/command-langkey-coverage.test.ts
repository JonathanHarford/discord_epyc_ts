import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  checkCommandLangKeyCoverage, 
  validateLanguageKeys, 
  runLanguageValidation 
} from '../../src/utils/command-langkey-coverage.js';

// Mock the Lang service
vi.mock('../../src/services/lang.js', () => ({
  Lang: {
    getRef: vi.fn(),
    getEmbed: vi.fn(),
    getRefLocalizationMap: vi.fn().mockReturnValue({})
  }
}));

// Mock the Language enum
vi.mock('../../src/models/enum-helpers/language.js', () => ({
  Language: {
    Default: 'en-US'
  }
}));

// Import the mocked Lang service for manipulation in tests
import { Lang } from '../../src/services/lang.js';

describe('Language Key Coverage Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkCommandLangKeyCoverage', () => {
    it('should pass when all commands have corresponding LangKeys entries', () => {
      expect(() => checkCommandLangKeyCoverage()).not.toThrow();
    });
  });

  describe('validateLanguageKeys', () => {
    it('should pass when all required keys exist', () => {
      // Mock Lang.getRef to return valid values for all keys
      (Lang.getRef as any).mockImplementation((key: string) => {
        if (key.includes('displayEmbeds')) {
          return { title: 'Test Title', description: 'Test Description' };
        }
        return 'test-value';
      });

      // Mock Lang.getEmbed to return valid embeds
      (Lang.getEmbed as any).mockReturnValue({
        title: 'Test Embed',
        description: 'Test Description'
      });

      expect(() => validateLanguageKeys()).not.toThrow();
    });

    it('should fail when required keys are missing', () => {
      // Mock Lang.getRef to throw for missing keys
      (Lang.getRef as any).mockImplementation((key: string) => {
        if (key === 'chatCommands.admin') {
          throw new Error('Key not found');
        }
        return 'test-value';
      });

      expect(() => validateLanguageKeys()).toThrow('Language key validation failed');
    });

    it('should fail when embed keys are invalid', () => {
      // Mock Lang.getRef to return values but Lang.getEmbed to fail
      (Lang.getRef as any).mockReturnValue({ title: 'Test', description: 'Test' });
      (Lang.getEmbed as any).mockImplementation((key: string) => {
        if (key.includes('listSeasonsSuccess')) {
          throw new Error('Invalid embed structure');
        }
        return { title: 'Test', description: 'Test' };
      });

      expect(() => validateLanguageKeys()).toThrow('Language key validation failed');
    });
  });

  describe('runLanguageValidation', () => {
    it('should run all validation checks successfully', () => {
      // Mock successful validation
      (Lang.getRef as any).mockImplementation((key: string) => {
        if (key.includes('displayEmbeds')) {
          return { title: 'Test Title', description: 'Test Description' };
        }
        return 'test-value';
      });

      (Lang.getEmbed as any).mockReturnValue({
        title: 'Test Embed',
        description: 'Test Description'
      });

      expect(() => runLanguageValidation()).not.toThrow();
    });

    it('should fail if any validation step fails', () => {
      // Mock failed validation
      (Lang.getRef as any).mockImplementation((key: string) => {
        if (key === 'chatCommands.admin') {
          throw new Error('Missing key');
        }
        return 'test-value';
      });

      expect(() => runLanguageValidation()).toThrow('Language validation failed');
    });
  });
});

describe('Language Key Validation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect missing command names', () => {
    // Mock Lang.getRef to fail for command names specifically
    (Lang.getRef as any).mockImplementation((key: string) => {
      if (key.startsWith('chatCommands.')) {
        return null; // Simulate missing command name
      }
      return 'test-value';
    });

    expect(() => validateLanguageKeys()).toThrow();
  });

  it('should detect missing embed definitions', () => {
    // Mock valid basic keys but invalid embeds
    (Lang.getRef as any).mockReturnValue('test-value');
    (Lang.getEmbed as any).mockImplementation(() => {
      throw new Error('Embed not found');
    });

    expect(() => validateLanguageKeys()).toThrow();
  });
}); 