import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

/** Additional settings for React workspaces (web app and UI package). */
export const reactConfig = [
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Components over ~250 lines should be split — this warns, it does not block.
      'max-lines': ['warn', { max: 250, skipBlankLines: true, skipComments: true }],
    },
  },
];

/**
 * React Native.
 *
 * The same React rules without the jsx-a11y set: those check DOM attributes (`alt`, `role` as
 * an HTML role, `onClick` on a div) that do not exist in React Native, and every one of them
 * either never fires or fires wrongly. Native accessibility is `accessibilityLabel`,
 * `accessibilityRole` and `accessibilityHint`, which those rules do not know about.
 */
export const reactNativeConfig = [
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        __DEV__: 'readonly',
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'max-lines': ['warn', { max: 250, skipBlankLines: true, skipComments: true }],
    },
  },
];
