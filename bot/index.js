#!/usr/bin/env node

/**
 * PokerNow Omaha Bot
 *
 * Entry point for the poker bot that plays Omaha on PokerNow.club
 *
 * Usage:
 *   node bot/index.js <table-url>
 *
 * Example:
 *   node bot/index.js https://www.pokernow.club/games/abc123
 *
 * Environment Variables:
 *   CHROME_PATH   - Path to Chrome executable
 *   ADVISOR_URL   - Play Advisor API URL (default: http://localhost:3000)
 *
 * Requirements:
 *   1. Chrome browser installed
 *   2. Play Advisor server running (npm run start:web)
 *   3. A PokerNow.club table URL
 */

import { GameLoop } from './GameLoop.js';
import { config } from './config.js';

// ============================================================
// MAIN
// ============================================================

async function main() {
  // Get table URL from command line
  const tableUrl = process.argv[2];

  if (!tableUrl) {
    printUsage();
    process.exit(1);
  }

  // Validate URL
  if (!tableUrl.includes('pokernow.club')) {
    console.error('Error: URL must be a PokerNow.club game URL');
    console.error('Example: https://www.pokernow.club/games/abc123');
    process.exit(1);
  }

  // Print configuration
  console.log('\n🃏 PokerNow Omaha Bot');
  console.log('====================\n');
  console.log('Configuration:');
  console.log(`  Chrome: ${config.browser.executablePath}`);
  console.log(`  Advisor: ${config.advisor.baseUrl}`);
  console.log(`  Headless: ${config.browser.headless}`);
  console.log(`  Max Hands: ${config.behavior.maxHandsPerSession}`);
  console.log('');

  // Set up graceful shutdown
  const gameLoop = new GameLoop();

  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT, shutting down...');
    await gameLoop.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nReceived SIGTERM, shutting down...');
    await gameLoop.stop();
    process.exit(0);
  });

  // Start the bot
  try {
    await gameLoop.start(tableUrl);
  } catch (error) {
    console.error('\nFatal error:', error.message);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
🃏 PokerNow Omaha Bot
====================

Usage:
  node bot/index.js <pokernow-table-url>

Example:
  node bot/index.js https://www.pokernow.club/games/pgl_abc123

Steps:
  1. Go to https://www.pokernow.club/start-game
  2. Create an Omaha game (PLO 4-card or 5-card)
  3. Copy the game URL
  4. Make sure Play Advisor is running: npm run start:web
  5. Run the bot with the URL

Environment Variables:
  CHROME_PATH   Path to Chrome/Chromium executable
                Default: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome

  ADVISOR_URL   Play Advisor API URL
                Default: http://localhost:3000

For more information, see: POKERNOW_BOT_PLAN.md
`);
}

// Run main
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
