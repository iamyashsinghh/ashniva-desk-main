import globals from 'globals';

/**
 * Settings for code that runs in a customer's browser rather than in ours.
 *
 * Only `globals.browser`: no Node globals at all, so a `process.env` or a `Buffer` that slips into
 * the embeddable SDK fails the lint here rather than the customer's bundler. That is the whole
 * reason browser code gets a preset of its own instead of borrowing the Node one.
 */
export const browserConfig = [
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
