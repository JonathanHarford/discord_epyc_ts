#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

interface ValidationResult {
  missingKeys: string[];
  extraKeys: string[];
  usedKeys: string[];
  definedKeys: string[];
  duplicateKeys: string[];
  unresolvedLangKeys: string[];
}

interface LanguageStructure {
  [key: string]: any;
}

interface ValidationOptions {
  generateMissing?: boolean;
  showUnused?: boolean;
  verbose?: boolean;
  outputFile?: string;
}

class LanguageKeyValidator {
  private langDir: string;
  private srcDir: string;
  private languageData: LanguageStructure = {};
  private usedKeys: Set<string> = new Set();
  private langKeysContent: string = '';
  private unresolvedLangKeys: Set<string> = new Set();
  private options: ValidationOptions;

  constructor(projectRoot: string = process.cwd(), options: ValidationOptions = {}) {
    this.langDir = path.join(projectRoot, 'lang');
    this.srcDir = path.join(projectRoot, 'src');
    this.options = {
      showUnused: true,
      verbose: false,
      ...options
    };
  }

  /**
   * Main validation function
   */
  async validate(): Promise<ValidationResult> {
    console.log('🔍 Starting language key validation...\n');

    // Load language files
    await this.loadLanguageFiles();
    
    // Load LangKeys constants file
    await this.loadLangKeysFile();
    
    // Find all used keys in source code
    await this.findUsedKeys();
    
    // Get all defined keys from language files
    const definedKeys = this.getAllDefinedKeys();
    
    // Perform analysis
    const usedKeysArray = Array.from(this.usedKeys);
    const missingKeys = usedKeysArray.filter(key => !this.keyExists(key));
    const extraKeys = this.options.showUnused ? 
      definedKeys.filter(key => !this.usedKeys.has(key)) : [];
    const duplicateKeys = this.findDuplicateKeys();
    const unresolvedLangKeys = Array.from(this.unresolvedLangKeys);

    const result: ValidationResult = {
      missingKeys,
      extraKeys,
      usedKeys: usedKeysArray,
      definedKeys,
      duplicateKeys,
      unresolvedLangKeys
    };

    // Generate missing keys if requested
    if (this.options.generateMissing && missingKeys.length > 0) {
      await this.generateMissingKeys(missingKeys);
    }

    return result;
  }

  /**
   * Load all language JSON files
   */
  private async loadLanguageFiles(): Promise<void> {
    try {
      const langFiles = await glob('*.json', { cwd: this.langDir });
      
      let commonData = {};
      let langData = {};
      
      for (const file of langFiles) {
        const filePath = path.join(this.langDir, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        if (file === 'lang.common.json') {
          commonData = content;
        } else if (file === 'lang.en-US.json') {
          langData = content;
        }
      }
      
      // Merge common and language-specific data properly
      // Combine common data from both sources instead of overwriting
      this.languageData = {
        ...langData,
        common: {
          ...commonData,
          ...(langData as any).common || {}
        }
      };
      
      console.log(`📚 Loaded ${langFiles.length} language files`);
    } catch (error) {
      console.error('❌ Error loading language files:', error);
      throw error;
    }
  }

  /**
   * Load and cache the LangKeys constants file content
   */
  private async loadLangKeysFile(): Promise<void> {
    try {
      const constantsFile = path.join(this.srcDir, 'constants', 'lang-keys.ts');
      
      if (fs.existsSync(constantsFile)) {
        this.langKeysContent = fs.readFileSync(constantsFile, 'utf-8');
        console.log('📋 Loaded LangKeys constants file');
      } else {
        console.warn('⚠️  LangKeys constants file not found');
      }
    } catch (error) {
      console.warn(`⚠️  Could not load LangKeys file: ${error}`);
    }
  }

  /**
   * Find all language keys used in source code
   */
  private async findUsedKeys(): Promise<void> {
    try {
      // Find all TypeScript files
      const tsFiles = await glob('**/*.ts', { 
        cwd: this.srcDir,
        ignore: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts']
      });

      console.log(`📁 Scanning ${tsFiles.length} TypeScript files for key usage...\n`);

      for (const file of tsFiles) {
        const filePath = path.join(this.srcDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Find keys in various patterns
        this.extractKeysFromContent(content, file);
      }

      console.log(`🔑 Found ${this.usedKeys.size} unique key references`);
      if (this.unresolvedLangKeys.size > 0) {
        console.log(`⚠️  ${this.unresolvedLangKeys.size} LangKeys references could not be resolved`);
      }
      console.log();
    } catch (error) {
      console.error('❌ Error scanning source files:', error);
      throw error;
    }
  }

  /**
   * Extract language keys from file content with improved patterns
   */
  private extractKeysFromContent(content: string, filename: string): void {
    const patterns = [
      // LangKeys.Commands.Admin.ListPlayersSuccess style
      /LangKeys\.[\w\.]+/g,
      
      // Direct string keys in quotes - improved regex
      /'([a-zA-Z][a-zA-Z0-9._]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)'/g,
      /"([a-zA-Z][a-zA-Z0-9._]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)"/g,
      
      // Lang service method calls
      /Lang\.getRef\(['"]([^'"]+)['"]/g,
      /Lang\.getEmbed\(['"]([^'"]+)['"]/g,
      /Lang\.getMsg\(['"]([^'"]+)['"]/g,
      
      // MessageHelpers.embedMessage calls
      /embedMessage\([^,]+,\s*['"]([^'"]+)['"]/g,
      
      // Template literal usage
      /`[^`]*\$\{[^}]*['"]([a-zA-Z][a-zA-Z0-9._]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"][^}]*\}[^`]*`/g,
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let key = match[1];
        
        // Handle LangKeys references - extract the actual key value
        if (match[0].startsWith('LangKeys.')) {
          const resolvedKey = this.resolveLangKeyReference(match[0]);
          if (resolvedKey) {
            key = resolvedKey;
          } else {
            this.unresolvedLangKeys.add(match[0]);
            continue;
          }
        }
        
        if (key && this.isValidKey(key)) {
          this.usedKeys.add(key);
          
          if (this.options.verbose) {
            console.log(`  Found key: ${key} in ${filename}`);
          }
        }
      }
    });
  }

  /**
   * Improved LangKeys reference resolution
   */
  private resolveLangKeyReference(langKeyRef: string): string | null {
    if (!this.langKeysContent) {
      return null;
    }

    try {
      // Extract the property path from LangKeys.Commands.Admin.ListPlayersSuccess
      const parts = langKeyRef.split('.').slice(1); // Remove 'LangKeys'
      
      // Create a regex to find the nested property more accurately
      let searchContext = this.langKeysContent;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        if (i === parts.length - 1) {
          // This is the final property, look for its value
          const regex = new RegExp(`${part}:\\s*['"]([^'"]+)['"]`);
          const match = searchContext.match(regex);
          if (match) {
            return match[1];
          }
        } else {
          // This is an intermediate object, find its content
          const objectRegex = new RegExp(`${part}:\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`);
          const match = searchContext.match(objectRegex);
          if (match) {
            searchContext = match[1];
          } else {
            return null;
          }
        }
      }
      
      return null;
    } catch (error) {
      if (this.options.verbose) {
        console.warn(`⚠️  Could not resolve LangKeys reference: ${langKeyRef} - ${error}`);
      }
      return null;
    }
  }

  /**
   * Improved validation for language keys
   */
  private isValidKey(key: string): boolean {
    // Must start with a letter and contain only letters, numbers, dots, and underscores
    if (!/^[a-zA-Z][a-zA-Z0-9._]*$/.test(key)) {
      return false;
    }

    // Must contain at least one dot and not start/end with dots
    if (!key.includes('.') || key.startsWith('.') || key.endsWith('.')) {
      return false;
    }

    // Skip obvious non-language-key patterns
    const exclusions = [
      /^discord\.js$/,
      /^discord\.js-rate-limiter$/,
      /\.(js|ts|json|md)$/,
      /^console\./,
      /^process\./,
      /^window\./,
      /^document\./,
      /^global\./,
      /^module\./,
      /^exports\./,
      /^require\./,
      /^import\./,
      /^__dirname$/,
      /^__filename$/,
    ];

    if (exclusions.some(pattern => pattern.test(key))) {
      return false;
    }

    // Valid Discord bot language key categories (from analyzing the codebase)
    const parts = key.split('.');
    const firstPart = parts[0].toLowerCase();
    
    const validCategories = [
      'data', 'messages', 'refs', 'meta', 'common',
      'commands', 'errors', 'validation', 'display',
      'admin', 'permissions', 'help', 'info', 'config', 'season',
      'player', 'turn', 'submission', 'game', 'ready', 'status',
      'joinseaseon', 'newcommand', 'channelregexes',
      'turn_offer', 'turn_timeout', 'chatcommands', 'messagecommands',
      'usercommands', 'argdescs', 'devcommandnames', 'helpoptions',
      'infooptions', 'displayembeds', 'validationembeds', 'errorembeds'
    ];
    
    return validCategories.includes(firstPart);
  }

  /**
   * Get all defined keys from language files recursively
   */
  private getAllDefinedKeys(obj: any = this.languageData, prefix: string = ''): string[] {
    const keys: string[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursive for nested objects
        keys.push(...this.getAllDefinedKeys(value, fullKey));
      } else if (typeof value === 'string' || Array.isArray(value)) {
        // This is a leaf node (string or array)
        keys.push(fullKey);
      }
    }
    
    return keys;
  }

  /**
   * Improved key existence checking
   */
  private keyExists(key: string): boolean {
    return this.keyExistsRecursive(key, this.languageData);
  }
  
  /**
   * Recursive key existence check with support for dotted keys
   */
  private keyExistsRecursive(key: string, obj: any, depth: number = 0): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    const parts = key.split('.');
    
    // Try exact match first
    if (parts.length === 1) {
      return parts[0] in obj;
    }

    const [firstPart, ...remainingParts] = parts;
    const remainingKey = remainingParts.join('.');

    // Try direct navigation
    if (firstPart in obj) {
      return this.keyExistsRecursive(remainingKey, obj[firstPart], depth + 1);
    }

    // Try combinations for keys with dots in their names
    for (let i = 1; i < parts.length; i++) {
      const combinedKey = parts.slice(0, i + 1).join('.');
      const restKey = parts.slice(i + 1).join('.');
      
      if (combinedKey in obj) {
        if (restKey === '') {
          return true; // Exact match
        }
        return this.keyExistsRecursive(restKey, obj[combinedKey], depth + 1);
      }
    }

    return false;
  }

  /**
   * Find duplicate key definitions
   */
  private findDuplicateKeys(): string[] {
    // For now, we'll keep this simple since we're primarily using one language file
    // This could be expanded when we have multiple language files to compare
    return [];
  }

  /**
   * Generate missing keys and add them to the language file
   */
  private async generateMissingKeys(missingKeys: string[]): Promise<void> {
    console.log(`🔧 Generating ${missingKeys.length} missing keys...\n`);

    const langFilePath = path.join(this.langDir, 'lang.en-US.json');
    let langData = JSON.parse(fs.readFileSync(langFilePath, 'utf-8'));

    const generatedKeys: string[] = [];

    for (const key of missingKeys) {
      if (this.addKeyToObject(langData, key)) {
        generatedKeys.push(key);
      }
    }

    if (generatedKeys.length > 0) {
      // Write back to file with proper formatting
      fs.writeFileSync(langFilePath, JSON.stringify(langData, null, 4));
      console.log(`✅ Generated ${generatedKeys.length} missing keys and added them to lang.en-US.json`);
      
      // Reload language data to reflect the changes
      await this.loadLanguageFiles();
    }
  }

  /**
   * Add a key to the language object structure
   */
  private addKeyToObject(obj: any, key: string): boolean {
    const parts = key.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    const finalKey = parts[parts.length - 1];
    if (!(finalKey in current)) {
      // Generate a placeholder value based on the key
      current[finalKey] = this.generatePlaceholderValue(key);
      return true;
    }

    return false;
  }

  /**
   * Generate a placeholder value for a missing key
   */
  private generatePlaceholderValue(key: string): string {
    const parts = key.split('.');
    const lastPart = parts[parts.length - 1];
    
    // Convert camelCase to readable text
    const readable = lastPart
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
    
    return `TODO: ${readable} (key: ${key})`;
  }
}

/**
 * Enhanced result display with better formatting and suggestions
 */
function displayResults(results: ValidationResult, options: ValidationOptions = {}): void {
  console.log('📊 VALIDATION RESULTS');
  console.log('='.repeat(60));
  
  // Missing keys section
  if (results.missingKeys.length === 0) {
    console.log('✅ All referenced language keys exist!');
  } else {
    console.log(`❌ Found ${results.missingKeys.length} missing language keys:\n`);
    
    // Group missing keys by category for better readability
    const keysByCategory = new Map<string, string[]>();
    
    results.missingKeys.forEach(key => {
      const category = key.split('.')[0];
      if (!keysByCategory.has(category)) {
        keysByCategory.set(category, []);
      }
      keysByCategory.get(category)!.push(key);
    });

    keysByCategory.forEach((keys, category) => {
      console.log(`   📁 ${category}:`);
      keys.forEach(key => {
        console.log(`      • ${key}`);
      });
      console.log();
    });
  }
  
  // Unresolved LangKeys references
  if (results.unresolvedLangKeys.length > 0) {
    console.log(`⚠️  Found ${results.unresolvedLangKeys.length} unresolved LangKeys references:`);
    results.unresolvedLangKeys.slice(0, 10).forEach(ref => {
      console.log(`   • ${ref}`);
    });
    if (results.unresolvedLangKeys.length > 10) {
      console.log(`   ... and ${results.unresolvedLangKeys.length - 10} more`);
    }
    console.log();
  }
  
  // Unused keys section (optional)
  if (options.showUnused && results.extraKeys.length > 0) {
    console.log(`📦 Found ${results.extraKeys.length} potentially unused keys:`);
    results.extraKeys.slice(0, 15).forEach(key => {
      console.log(`   • ${key}`);
    });
    if (results.extraKeys.length > 15) {
      console.log(`   ... and ${results.extraKeys.length - 15} more`);
    }
    console.log();
  }
  
  console.log(`📈 Summary:`);
  console.log(`   • Used keys: ${results.usedKeys.length}`);
  console.log(`   • Defined keys: ${results.definedKeys.length}`);
  console.log(`   • Missing keys: ${results.missingKeys.length}`);
  console.log(`   • Unresolved LangKeys: ${results.unresolvedLangKeys.length}`);
  if (options.showUnused) {
    console.log(`   • Potentially unused keys: ${results.extraKeys.length}`);
  }
  
  // Suggestions
  if (results.missingKeys.length > 0 || results.unresolvedLangKeys.length > 0) {
    console.log('\n💡 Suggestions:');
    if (results.missingKeys.length > 0) {
      console.log('   • Add missing keys to lang/lang.en-US.json');
      console.log('   • Run with --generate-missing to auto-create placeholder keys');
    }
    if (results.unresolvedLangKeys.length > 0) {
      console.log('   • Check LangKeys constants in src/constants/lang-keys.ts');
      console.log('   • Ensure LangKeys references point to valid language keys');
    }
  }
  
  // Exit with error if there are missing keys or unresolved references
  if (results.missingKeys.length > 0 || results.unresolvedLangKeys.length > 0) {
    process.exit(1);
  }
}

// Enhanced main execution with command line options
async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    const options: ValidationOptions = {
      generateMissing: args.includes('--generate-missing'),
      showUnused: !args.includes('--hide-unused'),
      verbose: args.includes('--verbose'),
    };

    if (args.includes('--help')) {
      console.log('Language Key Validator\n');
      console.log('Usage: tsx scripts/validate-lang-keys.ts [options]\n');
      console.log('Options:');
      console.log('  --generate-missing  Auto-generate missing keys with placeholders');
      console.log('  --hide-unused       Hide potentially unused keys from output');
      console.log('  --verbose           Show detailed output');
      console.log('  --help              Show this help message');
      return;
    }

    const validator = new LanguageKeyValidator(process.cwd(), options);
    const results = await validator.validate();
    displayResults(results, options);
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { LanguageKeyValidator }; 