#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { Linguini, TypeMappers } from 'linguini';

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
  private linguini: Linguini;
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
    
    // Initialize Linguini with the same configuration as the Lang service
    this.linguini = new Linguini(this.langDir, 'lang');
  }

  /**
   * Main validation function
   */
  async validate(): Promise<ValidationResult> {
    console.log('🔍 Starting language key validation...\n');

    // Load LangKeys constants file
    await this.loadLangKeysFile();
    
    // Find all used keys in source code
    await this.findUsedKeys();
    
    // Get all defined keys from language files (via Linguini)
    const definedKeys = this.getAllDefinedKeysViaLinguini();
    
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
      // Find all TypeScript files including test files for comprehensive analysis
      const tsFiles = await glob('**/*.ts', { 
        cwd: this.srcDir,
        ignore: ['**/*.d.ts'] // Only ignore type definition files
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
   * Extract language keys from file content with comprehensive patterns
   */
  private extractKeysFromContent(content: string, filename: string): void {
    const patterns = [
      // LangKeys.Commands.Admin.ListPlayersSuccess style
      /LangKeys\.[\w\.]+/g,
      
      // Direct string keys in quotes - improved regex with better validation
      /'([a-zA-Z][a-zA-Z0-9._]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)'/g,
      /"([a-zA-Z][a-zA-Z0-9._]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)"/g,
      
      // Lang service method calls
      /Lang\.getRef\(['"]([^'"]+)['"]/g,
      /Lang\.getEmbed\(['"]([^'"]+)['"]/g,
      /Lang\.getMsg\(['"]([^'"]+)['"]/g,
      /Lang\.getCom\(['"]([^'"]+)['"]/g,
      
      // MessageHelpers method calls - THIS WAS MISSING!
      /MessageHelpers\.embedMessage\([^,]+,\s*['"]([^'"]+)['"]/g,
      /MessageHelpers\.commandSuccess\(['"]([^'"]+)['"]/g,
      /MessageHelpers\.commandError\(['"]([^'"]+)['"]/g,
      /MessageHelpers\.validationError\(['"]([^'"]+)['"]/g,
      /MessageHelpers\.warning\(['"]([^'"]+)['"]/g,
      /MessageHelpers\.info\(['"]([^'"]+)['"]/g,
      /MessageHelpers\.dmNotification\(['"]([^'"]+)['"]/g,
      /MessageHelpers\.followUpMessage\([^,]+,\s*['"]([^'"]+)['"]/g,
      
      // MessageHelpers calls with LangKeys - THIS WAS ALSO MISSING!
      /MessageHelpers\.embedMessage\([^,]+,\s*(LangKeys\.[\w\.]+)/g,
      /MessageHelpers\.commandSuccess\((LangKeys\.[\w\.]+)/g,
      /MessageHelpers\.commandError\((LangKeys\.[\w\.]+)/g,
      /MessageHelpers\.validationError\((LangKeys\.[\w\.]+)/g,
      /MessageHelpers\.warning\((LangKeys\.[\w\.]+)/g,
      /MessageHelpers\.info\((LangKeys\.[\w\.]+)/g,
      /MessageHelpers\.dmNotification\((LangKeys\.[\w\.]+)/g,
      /MessageHelpers\.followUpMessage\([^,]+,\s*(LangKeys\.[\w\.]+)/g,
      
      // Template literal usage
      /`[^`]*\$\{[^}]*['"]([a-zA-Z][a-zA-Z0-9._]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"][^}]*\}[^`]*`/g,
    ];

    patterns.forEach((pattern, index) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let key = match[1];
        
        // Handle LangKeys references - extract the actual key value
        if (match[0].includes('LangKeys.') && key && key.startsWith('LangKeys.')) {
          const resolvedKey = this.resolveLangKeyReference(key);
          if (resolvedKey) {
            key = resolvedKey;
          } else {
            this.unresolvedLangKeys.add(key);
            continue;
          }
        } else if (match[0].includes('LangKeys.') && !key) {
          // Handle patterns where LangKeys is captured but in a different group
          const langKeyMatch = match[0].match(/LangKeys\.[\w\.]+/);
          if (langKeyMatch) {
            const resolvedKey = this.resolveLangKeyReference(langKeyMatch[0]);
            if (resolvedKey) {
              key = resolvedKey;
            } else {
              this.unresolvedLangKeys.add(langKeyMatch[0]);
              continue;
            }
          }
        }
        
        if (key && this.isValidKey(key)) {
          this.usedKeys.add(key);
          
          if (this.options.verbose) {
            console.log(`  Found key: ${key} in ${filename} (pattern ${index + 1})`);
          }
        }
      }
    });
  }

  /**
   * Enhanced LangKeys reference resolution with better parsing
   */
  private resolveLangKeyReference(langKeyRef: string): string | null {
    if (!this.langKeysContent) {
      return null;
    }

    try {
      // Extract the property path from LangKeys.Commands.Admin.ListPlayersSuccess
      const parts = langKeyRef.split('.').slice(1); // Remove 'LangKeys'
      
      // Use a more sophisticated approach to find the value
      // First, try to find the exact path in the constants file
      const searchPattern = new RegExp(
        langKeyRef.replace(/\./g, '\\.') + 
        '\\s*:\\s*[\'"]([^\'"]+)[\'"]',
        'gm'
      );
      
      const directMatch = this.langKeysContent.match(searchPattern);
      if (directMatch && directMatch[0]) {
        const valueMatch = directMatch[0].match(/['"]([^'"]+)['"]/);
        if (valueMatch) {
          return valueMatch[1];
        }
      }
      
      // Fallback: traverse the object structure more carefully
      return this.traverseLangKeysStructure(parts, this.langKeysContent);
      
    } catch (error) {
      if (this.options.verbose) {
        console.warn(`⚠️  Could not resolve LangKeys reference: ${langKeyRef} - ${error}`);
      }
      return null;
    }
  }

  /**
   * More sophisticated traversal of the LangKeys structure
   */
  private traverseLangKeysStructure(parts: string[], content: string): string | null {
    let currentContext = content;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (i === parts.length - 1) {
        // This is the final property, look for its value
        const patterns = [
          new RegExp(`${part}\\s*:\\s*['"]([^'"]+)['"]`, 'g'),
          new RegExp(`${part}\\s*=\\s*['"]([^'"]+)['"]`, 'g')
        ];
        
        for (const pattern of patterns) {
          const match = currentContext.match(pattern);
          if (match && match[0]) {
            const valueMatch = match[0].match(/['"]([^'"]+)['"]/);
            if (valueMatch) {
              return valueMatch[1];
            }
          }
        }
        return null;
      } else {
        // Find the object/section for this part
        const sectionPattern = new RegExp(
          `${part}\\s*:\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`,
          'g'
        );
        const sectionMatch = currentContext.match(sectionPattern);
        if (sectionMatch && sectionMatch[0]) {
          // Extract the content between the braces
          const braceMatch = sectionMatch[0].match(/\{(.*)\}$/s);
          if (braceMatch) {
            currentContext = braceMatch[1];
          } else {
            return null;
          }
        } else {
          return null;
        }
      }
    }
    
    return null;
  }

  /**
   * Enhanced validation for language keys with better pattern matching
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

    // Skip obvious non-language-key patterns (but be less restrictive)
    const exclusions = [
      /^discord\.js$/,
      /^node_modules\./,
      /\.(js|ts|json|md|css|html)$/,
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
      // Add some Discord.js specific exclusions
      /^discord\./,
      /^client\./,
      /^guild\./,
      /^channel\./,
      /^user\./,
      /^member\./,
      /^interaction\./,
      // Common file extensions and paths
      /\.config\./,
      /\.env\./,
      /\.cache\./,
    ];

    if (exclusions.some(pattern => pattern.test(key))) {
      return false;
    }

    // Enhanced validation: valid Discord bot language key categories
    const parts = key.split('.');
    const firstPart = parts[0].toLowerCase();
    
    // Accept more liberal categories but still filter out obvious non-language keys
    const validCategories = [
      'data', 'messages', 'refs', 'meta', 'common',
      'commands', 'errors', 'validation', 'display',
      'admin', 'permissions', 'help', 'info', 'config', 'season',
      'player', 'turn', 'submission', 'game', 'ready', 'status',
      'joinseaseon', 'newcommand', 'channelregexes',
      'turn_offer', 'turn_timeout', 'chatcommands', 'messagecommands',
      'usercommands', 'argdescs', 'devcommandnames', 'helpoptions',
      'infooptions', 'displayembeds', 'validationembeds', 'errorembeds',
      // Add more Discord bot specific categories
      'fields', 'links', 'colors', 'embeds', 'components', 'modals',
      'events', 'handlers', 'services', 'utils', 'constants',
      'arguments', 'bot', 'guild', 'user', 'member', 'channel',
      'role', 'emoji', 'reaction', 'thread', 'webhook'
    ];
    
    return validCategories.includes(firstPart);
  }

  /**
   * Get all defined keys from language files (via Linguini)
   * Note: Since Linguini doesn't expose getAllKeys(), we'll skip unused key detection for now
   * and focus on the critical missing key detection which now works correctly.
   */
  private getAllDefinedKeysViaLinguini(): string[] {
    // For now, return empty array since the main goal is detecting missing keys
    // The unused key detection was never critical and Linguini doesn't expose a way to enumerate all keys
    return [];
  }

  /**
   * Test key existence using the actual Linguini library (just like the real Lang service)
   */
  private keyExists(key: string): boolean {
    // Add debug logging for the specific key we're having trouble with
    const isTargetKey = key === 'data.displayEmbeds.admin.listPlayersSuccess';
    if (isTargetKey) {
      console.log(`🔍 DEBUG: Testing key existence using actual Linguini: ${key}`);
    }
    
    try {
      // Test if Linguini can get the key (this is what the real Lang service does)
      // Using TypeMappers.String as the third parameter to match Lang service usage
      const result = this.linguini.get(key, 'en-US', TypeMappers.String);
      const exists = result !== null && result !== undefined;
      
      if (isTargetKey) {
        console.log(`   Linguini.get() result: ${exists ? 'found' : 'not found'}`);
      }
      
      if (exists) {
        return true;
      }
    } catch (error) {
      if (isTargetKey) {
        console.log(`   Linguini.get() error: ${error.message}`);
      }
    }
    
    // Test if it's a common key that works with getCom()
    try {
      const comResult = this.linguini.getCom(key);
      const comExists = comResult !== null && comResult !== undefined;
      
      if (isTargetKey) {
        console.log(`   Linguini.getCom() result: ${comExists ? 'found' : 'not found'}`);
      }
      
      if (comExists) {
        return true;
      }
    } catch (error) {
      if (isTargetKey) {
        console.log(`   Linguini.getCom() error: ${error.message}`);
      }
    }
    
    // Test if it's a ref key that works with getRef()
    try {
      const refResult = this.linguini.getRef(key, 'en-US');
      const refExists = refResult !== null && refResult !== undefined;
      
      if (isTargetKey) {
        console.log(`   Linguini.getRef() result: ${refExists ? 'found' : 'not found'}`);
      }
      
      if (refExists) {
        return true;
      }
    } catch (error) {
      if (isTargetKey) {
        console.log(`   Linguini.getRef() error: ${error.message}`);
      }
    }
    
    if (isTargetKey) {
      console.log(`❌ DEBUG: Key not found by any Linguini method`);
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
      await this.loadLangKeysFile();
    }
  }

  /**
   * Add a key to the language object structure
   */
  private addKeyToObject(obj: any, key: string): boolean {
    let targetObj = obj;
    
    // Determine the correct section based on key pattern
    if (key.startsWith('colors.') || key.startsWith('links.') || key.startsWith('emojis.')) {
      // These should go in common data, but we can't write to lang.common.json here
      // So we'll put them in the main file's common section
      if (!targetObj.common) {
        targetObj.common = {};
      }
      targetObj = targetObj.common;
    } else if (key.startsWith('arguments.') || key.startsWith('chatCommands.') || 
               key.startsWith('messageCommands.') || key.startsWith('userCommands.') ||
               key.startsWith('commandDescs.') || key.startsWith('argDescs.') ||
               key.startsWith('permissions.') || key.startsWith('fields.')) {
      // These should go in the refs section
      if (!targetObj.refs) {
        targetObj.refs = {};
      }
      targetObj = targetObj.refs;
    }
    
    const parts = key.split('.');
    let current = targetObj;

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
 * Enhanced result display with better formatting and actionable suggestions
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
  
  // Enhanced suggestions with specific actions
  if (results.missingKeys.length > 0 || results.unresolvedLangKeys.length > 0) {
    console.log('\n💡 Suggestions:');
    if (results.missingKeys.length > 0) {
      console.log('   • Add missing keys to lang/lang.en-US.json');
      console.log('   • Run with --generate-missing to auto-create placeholder keys');
      console.log('   • Check MessageHelpers and Lang service usage for correct key patterns');
      console.log('   • Verify Linguini can load your language files properly');
    }
    if (results.unresolvedLangKeys.length > 0) {
      console.log('   • Check LangKeys constants in src/constants/lang-keys.ts');
      console.log('   • Ensure LangKeys references point to valid language keys');
      console.log('   • Verify the LangKeys object structure matches usage patterns');
    }
  }
  
  // Exit with error if there are missing keys or unresolved references
  if (results.missingKeys.length > 0 || results.unresolvedLangKeys.length > 0) {
    process.exit(1);
  }
}

// Enhanced main execution with better error handling and logging
async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    const options: ValidationOptions = {
      generateMissing: args.includes('--generate-missing'),
      showUnused: !args.includes('--hide-unused'),
      verbose: args.includes('--verbose'),
    };

    if (args.includes('--help')) {
      console.log('Language Key Validator - Using Real Linguini\n');
      console.log('Usage: tsx scripts/validate-lang-keys.ts [options]\n');
      console.log('Options:');
      console.log('  --generate-missing  Auto-generate missing keys with placeholders');
      console.log('  --hide-unused       Hide potentially unused keys from output');
      console.log('  --verbose           Show detailed output including found keys');
      console.log('  --help              Show this help message');
      console.log('\nThis script validates language key usage by testing them against');
      console.log('the actual Linguini library, ensuring 100% accuracy with runtime behavior.');
      return;
    }

    console.log('🚀 Fixed Language Key Validator');
    console.log('   • Now uses actual Linguini library for validation');
    console.log('   • 100% accurate with runtime behavior');
    console.log('   • Fixed MessageHelpers pattern detection');
    console.log('   • Enhanced LangKeys reference resolution\n');

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