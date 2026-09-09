import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Rules shared by every TypeScript workspace.
 * The goal is readable, explicit code — not the shortest code.
 */
export const baseConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      // `any` hides bugs. When it is unavoidable, add a comment: // any: <reason>
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-nested-ternary': 'error',
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*.e2e-spec.ts'],
    rules: {
      'max-lines': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
];
