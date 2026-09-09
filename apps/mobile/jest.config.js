/**
 * jest-expo transforms the React Native and Expo packages, which ship untranspiled ESM that a
 * default jest cannot parse.
 *
 * The `\.pnpm` alternative in the ignore pattern is load-bearing. pnpm stores packages at
 * `node_modules/.pnpm/<name>@<version>/node_modules/<name>`, and jest tests the pattern at every
 * `node_modules/` in the path — so without it, `node_modules/.pnpm/` matches the ignore rule and
 * every React Native package is left untransformed, whatever the rest of the list says.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  /**
   * Longer than jest's five-second default, and longer than the library's query timeout set in
   * `jest.setup.js`.
   *
   * The first render of the first suite has to transform and load React Native's module graph,
   * which on a CI runner takes several seconds. The ordering matters as much as the number: with
   * the query timeout above this one, jest kills the test while the query is still waiting and
   * reports "Exceeded timeout" — which says nothing about what was not found.
   */
  testTimeout: 30_000,
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm|(jest-)?react-native.*|@react-native.*|expo.*|@expo.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base)/)',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
};
