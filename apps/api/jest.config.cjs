/** Unit tests: *.spec.ts next to the code they test. */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!generated/**', '!main.ts'],
  coverageDirectory: '../coverage',
};
