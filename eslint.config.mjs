// Single ESLint configuration for the whole monorepo.
// Presets live in packages/config/eslint so every workspace shares the same rules.
import { baseConfig } from '@ashniva/config/eslint/base';
import { browserConfig } from '@ashniva/config/eslint/browser';
import { nodeConfig } from '@ashniva/config/eslint/node';
import { reactConfig } from '@ashniva/config/eslint/react';
import { reactNativeConfig } from '@ashniva/config/eslint/react-native';

export default [
  {
    ignores: [
      '**/node_modules/**',
      // Claude Code's agent worktrees are full checkouts of this repository living inside it.
      // Linting them lints a second copy of everything, including its build output.
      '.claude/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'apps/api/src/generated/**',
      'docs/design-reference/**',
      '**/*.config.{js,mjs,cjs,ts}',
      'apps/web/vite.config.ts',
      'apps/mobile/jest.setup.js',
      'apps/mobile/index.js',
      'apps/api/prisma.config.ts',
    ],
  },
  ...baseConfig,
  ...nodeConfig.map((config) => ({
    ...config,
    files: ['apps/api/**/*.ts', 'packages/types/**/*.ts'],
  })),
  // The embeddable SDK runs in a customer's browser: browser globals only, and deliberately no
  // Node ones, so a `process.env` or a `Buffer` fails here rather than in their bundler.
  ...browserConfig.map((config) => ({
    ...config,
    files: ['packages/support-sdk/**/*.ts'],
  })),
  ...reactConfig.map((config) => ({
    ...config,
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
  })),
  ...reactNativeConfig.map((config) => ({
    ...config,
    files: ['apps/mobile/**/*.{ts,tsx}'],
  })),
];
