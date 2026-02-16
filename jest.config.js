/**
 * Jest Configuration for Play Advisor Unit Tests
 *
 * Configured for ES Modules support.
 * Run: npm run test:unit
 */

export default {
  // Use ESM
  testEnvironment: 'node',
  transform: {},

  // Test file patterns
  testMatch: [
    '**/api/**/*.test.js',
    '**/packages/**/src/**/*.test.js',
    '**/packages/**/src/**/*.test.ts'
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/e2e/'  // E2E tests use Playwright, not Jest
  ],

  // Coverage settings
  collectCoverageFrom: [
    'api/**/*.js',
    'api/lib/**/*.js',
    '!api/**/*.test.js',
    '!**/node_modules/**'
  ],

  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Module resolution for ESM
  moduleFileExtensions: ['js', 'mjs', 'ts', 'json'],

  // Verbose output
  verbose: true,

  // Test timeout
  testTimeout: 10000
};
