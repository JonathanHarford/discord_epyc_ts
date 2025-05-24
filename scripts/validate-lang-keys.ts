#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { Linguini, TypeMappers } from 'linguini';

interface TestResult {
  key: string;
  method: string;
  success: boolean;
  error?: string;
}

class LanguageKeyTester {
  private linguini: Linguini;
  private langDir: string;

  constructor(projectRoot: string = process.cwd()) {
    this.langDir = path.join(projectRoot, 'lang');
    this.linguini = new Linguini(this.langDir, 'lang');
  }

  /**
   * Get all language keys from all language files
   */
  private getAllKeysFromFiles(): string[] {
    const keys = new Set<string>();
    
    try {
      // Read all JSON files in the lang directory
      const langFiles = fs.readdirSync(this.langDir).filter(file => file.endsWith('.json'));
      
      for (const file of langFiles) {
        console.log(`📄 Reading keys from ${file}...`);
        const filePath = path.join(this.langDir, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // Extract all keys recursively
        this.extractKeysRecursively(content, '', keys);
      }
    } catch (error) {
      console.error(`❌ Error reading language files: ${error}`);
      throw error;
    }

    return Array.from(keys).sort();
  }

  /**
   * Recursively extract all keys from a nested object
   */
  private extractKeysRecursively(obj: any, prefix: string, keys: Set<string>) {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // It's a nested object, recurse
        this.extractKeysRecursively(value, fullKey, keys);
      } else {
        // It's a leaf value (string, number, array, etc.), add the key
        keys.add(fullKey);
      }
    }
  }

  /**
   * Test a single key with multiple Lang service methods
   * Returns true if ANY method succeeds, false if ALL methods fail
   */
  private testKey(key: string): { success: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Test with get (most common for display messages)
    try {
      this.linguini.get(key, 'en-US', TypeMappers.String);
      return { success: true, errors: [] }; // Success with get method
    } catch (error) {
      errors.push(`get: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Test with getRef (for reference data)
    try {
      this.linguini.getRef(key, 'en-US');
      return { success: true, errors: [] }; // Success with getRef method
    } catch (error) {
      errors.push(`getRef: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Test with getCom (for common data)
    try {
      this.linguini.getCom(key);
      return { success: true, errors: [] }; // Success with getCom method
    } catch (error) {
      errors.push(`getCom: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { success: false, errors };
  }

  /**
   * Test all language keys, failing at the first broken key
   */
  async testAllKeys(): Promise<void> {
    console.log('🚀 Starting runtime language key validation (fail-fast mode)...\n');
    
    // Get all keys from language files
    const allKeys = this.getAllKeysFromFiles();
    console.log(`🔍 Found ${allKeys.length} language keys to test\n`);

    let testedCount = 0;
    let passedCount = 0;

    // Test each key
    for (const key of allKeys) {
      testedCount++;
      const result = this.testKey(key);
      
      if (result.success) {
        passedCount++;
        
        // Show progress every 50 keys
        if (testedCount % 50 === 0) {
          console.log(`✅ Progress: ${testedCount}/${allKeys.length} keys tested (${passedCount} passed)`);
        }
      } else {
        // FAIL IMMEDIATELY on first broken key
        console.log(`\n❌ FIRST BROKEN KEY FOUND!`);
        console.log(`=`.repeat(60));
        console.log(`🔑 Key: ${key}`);
        console.log(`📊 Progress: ${testedCount}/${allKeys.length} keys tested before failure`);
        console.log(`✅ Passed: ${passedCount} keys`);
        console.log(`\n🚨 All methods failed for this key:`);
        result.errors.forEach(error => {
          console.log(`   • ${error}`);
        });
        
        console.log(`\n💡 Next steps:`);
        console.log(`   • Check if key '${key}' exists in your language files`);
        console.log(`   • Verify the key path is correct (no typos in nested structure)`);
        console.log(`   • Check if the key should be in refs/, common/, or main language file`);
        console.log(`   • Fix this key and run the script again`);
        
        console.log(`\n🚨 Exiting with error code due to broken key`);
        process.exit(1);
      }
    }

    // All keys passed!
    console.log(`\n🎉 SUCCESS! All ${allKeys.length} language keys are working!`);
    console.log(`✅ Every key can be loaded by at least one method`);
    console.log(`📊 Final stats: ${passedCount}/${testedCount} keys passed`);
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    
    if (args.includes('--help')) {
      console.log('Runtime Language Key Tester (Fail-Fast Mode)\n');
      console.log('Usage: tsx scripts/test-lang-keys.ts\n');
      console.log('This script tests every language key by actually trying to load it');
      console.log('using the Linguini library. It STOPS at the first broken key.\n');
      console.log('The script will:');
      console.log('• Find all keys in your language files');
      console.log('• Test each key with get(), getRef(), and getCom() methods');
      console.log('• STOP and report details at the first key that fails with all methods');
      console.log('• Exit with error code if any broken key is found');
      console.log('• Show success message if all keys work');
      return;
    }

    const tester = new LanguageKeyTester();
    await tester.testAllKeys();
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { LanguageKeyTester }; 