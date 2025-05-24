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
}

interface LanguageStructure {
  [key: string]: any;
}

class LanguageKeyValidator {
  private langDir: string;
  private srcDir: string;
  private languageData: LanguageStructure = {};
  private usedKeys: Set<string> = new Set();

  constructor(projectRoot: string = process.cwd()) {
    this.langDir = path.join(projectRoot, 'lang');
    this.srcDir = path.join(projectRoot, 'src');
  }

  /**
   * Main validation function
   */
  async validate(): Promise<ValidationResult> {
    console.log('🔍 Starting language key validation...\n');

    // Load language files
    await this.loadLanguageFiles();
    
    // Find all used keys in source code
    await this.findUsedKeys();
    
    // Get all defined keys from language files
    const definedKeys = this.getAllDefinedKeys();
    
    // Perform analysis
    const usedKeysArray = Array.from(this.usedKeys);
    const missingKeys = usedKeysArray.filter(key => !this.keyExists(key));
    const extraKeys = definedKeys.filter(key => !this.usedKeys.has(key));
    const duplicateKeys = this.findDuplicateKeys();

    return {
      missingKeys,
      extraKeys,
      usedKeys: usedKeysArray,
      definedKeys,
      duplicateKeys
    };
  }

  /**
   * Load all language JSON files
   */
  private async loadLanguageFiles(): Promise<void> {
    try {
      const langFiles = await glob('*.json', { cwd: this.langDir });
      
      for (const file of langFiles) {
        const filePath = path.join(this.langDir, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // Merge all language files (for now we'll use en-US as primary)
        if (file === 'lang.en-US.json') {
          this.languageData = content;
        }
      }
      
      console.log(`📚 Loaded ${langFiles.length} language files`);
    } catch (error) {
      console.error('❌ Error loading language files:', error);
      throw error;
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
        ignore: ['**/*.test.ts', '**/*.spec.ts']
      });

      console.log(`📁 Scanning ${tsFiles.length} TypeScript files for key usage...\n`);

      for (const file of tsFiles) {
        const filePath = path.join(this.srcDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Find keys in various patterns
        this.extractKeysFromContent(content, file);
      }

      console.log(`🔑 Found ${this.usedKeys.size} unique key references\n`);
    } catch (error) {
      console.error('❌ Error scanning source files:', error);
      throw error;
    }
  }

  /**
   * Extract language keys from file content
   */
  private extractKeysFromContent(content: string, filename: string): void {
    const patterns = [
      // LangKeys.Commands.Admin.ListPlayersSuccess style
      /LangKeys\.[\w\.]+/g,
      
      // Direct string keys in quotes
      /'([a-zA-Z][a-zA-Z0-9._]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*?)'/g,
      /"([a-zA-Z][a-zA-Z0-9._]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*?)"/g,
      
      // Lang.getRef() calls
      /Lang\.getRef\(['"]([^'"]+)['"]/g,
      /Lang\.getEmbed\(['"]([^'"]+)['"]/g,
      
      // MessageHelpers.embedMessage calls
      /embedMessage\([^,]+,\s*['"]([^'"]+)['"]/g,
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let key = match[1];
        
        // Handle LangKeys references - extract the actual key value
        if (match[0].startsWith('LangKeys.')) {
          key = this.resolveLangKeyReference(match[0]);
        }
        
        if (key && this.isValidKey(key)) {
          this.usedKeys.add(key);
        }
      }
    });
  }

  /**
   * Resolve LangKeys.* references to actual key strings by parsing the constants file
   */
  private resolveLangKeyReference(langKeyRef: string): string | null {
    try {
      const constantsFile = path.join(this.srcDir, 'constants', 'lang-keys.ts');
      
      if (!fs.existsSync(constantsFile)) {
        return null;
      }
      
      const content = fs.readFileSync(constantsFile, 'utf-8');
      
      // Extract the property path from LangKeys.Commands.Admin.ListPlayersSuccess
      const parts = langKeyRef.split('.').slice(1); // Remove 'LangKeys'
      
      // Find the property in the nested structure
      let currentMatch = content;
      for (const part of parts) {
        const regex = new RegExp(`${part}:\\s*['"]([^'"]+)['"]`);
        const match = currentMatch.match(regex);
        if (match) {
          return match[1];
        }
        
        // Look for nested object
        const nestedRegex = new RegExp(`${part}:\\s*{([^}]+)}`);
        const nestedMatch = currentMatch.match(nestedRegex);
        if (nestedMatch) {
          currentMatch = nestedMatch[1];
        } else {
          return null;
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`⚠️  Could not resolve LangKeys reference: ${langKeyRef}`);
      return null;
    }
  }

  /**
   * Check if a string is a valid language key pattern
   */
  private isValidKey(key: string): boolean {
    // Must start with a letter and contain only letters, numbers, dots, and underscores
    return /^[a-zA-Z][a-zA-Z0-9._]*$/.test(key) && 
           key.includes('.') && 
           !key.startsWith('.') && 
           !key.endsWith('.');
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
      } else {
        // This is a leaf node
        keys.push(fullKey);
      }
    }
    
    return keys;
  }

  /**
   * Check if a key exists in the language data
   */
  private keyExists(key: string): boolean {
    const parts = key.split('.');
    let current = this.languageData;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Find duplicate key definitions across different language files
   */
  private findDuplicateKeys(): string[] {
    // For now, we'll skip this as we only have one main language file
    // This would be useful when we have multiple language files to compare
    return [];
  }
}

/**
 * Format and display validation results
 */
function displayResults(results: ValidationResult): void {
  console.log('📊 VALIDATION RESULTS');
  console.log('='.repeat(50));
  
  if (results.missingKeys.length === 0) {
    console.log('✅ All language keys are valid!');
  } else {
    console.log(`❌ Found ${results.missingKeys.length} missing keys:`);
    results.missingKeys.forEach(key => {
      console.log(`   • ${key}`);
    });
  }
  
  console.log();
  
  if (results.extraKeys.length > 0) {
    console.log(`⚠️  Found ${results.extraKeys.length} potentially unused keys:`);
    results.extraKeys.slice(0, 10).forEach(key => {
      console.log(`   • ${key}`);
    });
    if (results.extraKeys.length > 10) {
      console.log(`   ... and ${results.extraKeys.length - 10} more`);
    }
  }
  
  console.log();
  console.log(`📈 Summary:`);
  console.log(`   • Used keys: ${results.usedKeys.length}`);
  console.log(`   • Defined keys: ${results.definedKeys.length}`);
  console.log(`   • Missing keys: ${results.missingKeys.length}`);
  console.log(`   • Potentially unused keys: ${results.extraKeys.length}`);
  
  // Exit with error if there are missing keys
  if (results.missingKeys.length > 0) {
    console.log('\n💡 Tip: Check the key names for typos or add missing keys to lang/lang.en-US.json');
    process.exit(1);
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    const validator = new LanguageKeyValidator();
    const results = await validator.validate();
    displayResults(results);
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