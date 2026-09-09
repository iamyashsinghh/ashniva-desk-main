import globals from 'globals';

/** Additional settings for Node.js / NestJS workspaces. */
export const nodeConfig = [
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        // NestJS injects constructor parameters from decorator metadata, so those imports are
        // runtime values. These flags tell consistent-type-imports not to turn them into type-only imports.
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
    rules: {
      // NestJS relies on classes and decorators; empty constructors are common for DI.
      '@typescript-eslint/no-empty-function': 'off',
      // NestJS modules are often empty in Phase 0 (module boundaries only).
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
