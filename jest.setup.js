/**
 * Jest setup file to configure test environment
 * This runs before each test file
 */

/**
 * Console log configuration for tests:
 *
 * - During development: All console logs including debug are shown
 * - During CI (CI=true): console.debug is suppressed for cleaner output
 * - Important logs (error, warn, info) are always shown
 *
 * Usage:
 * - `npm run test:ci` - Clean CI output (suppresses debug)
 * - `npm test` - Development mode (shows all logs)
 */

// Suppress console.debug logs during CI for cleaner output
// but allow debug logs during development
if (process.env.CI === 'true') {
  // Store the original console.debug method
  const originalDebug = console.debug;

  // Mock console.debug to be silent in CI
  console.debug = () => {
    // Do nothing - silences debug output
  };

  // Optionally restore console.debug if needed for specific tests
  global.__restoreConsoleDebug = () => {
    console.debug = originalDebug;
  };
}
