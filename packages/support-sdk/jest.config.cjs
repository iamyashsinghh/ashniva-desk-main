/**
 * Unit tests for the SDK.
 *
 * `testEnvironment: node`, deliberately. The parts worth testing — the contract's bounds, the
 * validation, the client's session handling and the widget's states — touch no DOM, and the two
 * files that do (`vanilla.ts`, `attachments.ts`) are thin adapters over browser APIs that a jsdom
 * shim would not exercise honestly anyway. Keeping the environment plain also keeps `jsdom` out of
 * the dependency tree of a package customers install.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.test.ts'],
};
