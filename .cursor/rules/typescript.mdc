---
description: TypeScript
globs: **/*.ts
alwaysApply: false
---
- **Strict TypeScript**: Use TypeScript with strict mode enabled for enhanced type safety. Avoid using `any` types.
- **Comments**: Use comments to explain "why" behind the code. Never delete comments -- even commented-out code -- unless you are certain they are incorrect or useless.
- **Function definitions**: Prefer arrow functions for function definitions.
- **Relative Imports**: Always include the `.js` extension for relative imports.
  - **Reason**: This is required for Node.js ES Module resolution to work correctly after TypeScript compilation.
  ```typescript
  // ✅ DO:
  import { AnotherModule } from './another-module.js';

  // ❌ DON'T:
  import { AnotherModule } from './another-module';
  ```