/**
 * Simple bot runner script
 */

import { PlaywrightBotJoiner } from './PlaywrightBotJoiner.js';

const GAME_URL = 'https://www.pokernow.com/games/pgl2wy20QIsPBt_NSZ5zQfL4X';

async function main() {
  console.log('=== Starting Bot Runner ===');
  console.log(`Game: ${GAME_URL}`);
  console.log('');

  const joiner = new PlaywrightBotJoiner(GAME_URL, {
    headless: false,
    verbose: true,
    stackSize: 1000
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await joiner.cleanup();
    process.exit(0);
  });

  try {
    await joiner.initialize();

    // Join 2 bots
    console.log('\n--- Joining Bot1 ---');
    await joiner.joinBot('Bot1');

    console.log('\n--- Joining Bot2 ---');
    await joiner.joinBot('Bot2');

    console.log('\n=== Bot Status ===');
    for (const bot of joiner.bots) {
      console.log(`${bot.name}: ${bot.status || 'unknown'} ${bot.error ? '(Error: ' + bot.error + ')' : ''}`);
    }

    console.log('\nBots are running. Press Ctrl+C to stop.');
    console.log('Approve any pending bots from the owner browser.\n');

    // Keep alive
    await joiner.keepAlive();

  } catch (error) {
    console.error('Fatal error:', error);
    await joiner.cleanup();
    process.exit(1);
  }
}

main();
