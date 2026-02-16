#!/usr/bin/env node
/**
 * Run validation test with an EXISTING game
 * 
 * This script joins bots to an existing game. It requires:
 * 1. The game owner to approve bots (can be done by Claude in Chrome)
 * 2. The game owner to click START GAME
 * 
 * Usage: node run-with-existing-game.js <gameUrl> [numBots] [targetHands]
 * Example: node run-with-existing-game.js https://pokernow.com/games/xxx 2 20
 */

import { PlaywrightBotJoiner } from './PlaywrightBotJoiner.js';
import { BotGameLoop } from './BotGameLoop.js';

const gameUrl = process.argv[2];
const numBots = parseInt(process.argv[3]) || 2;
const targetHands = parseInt(process.argv[4]) || 20;

if (!gameUrl || !gameUrl.includes('/games/')) {
  console.error('ERROR: Please provide a valid PokerNow game URL');
  console.error('Usage: node run-with-existing-game.js <gameUrl> [numBots] [targetHands]');
  process.exit(1);
}

console.log('=== Validation Test (Existing Game) ===');
console.log(`Game URL: ${gameUrl}`);
console.log(`Bots: ${numBots}`);
console.log(`Target Hands: ${targetHands}`);
console.log('');
console.log('NOTE: Please have the game owner approve bots when prompted.');
console.log('');

async function run() {
  const joiner = new PlaywrightBotJoiner(gameUrl, {
    headless: false,
    stackSize: 1000,
    verbose: true
  });

  const gameLoops = [];
  const suffix = Date.now().toString().slice(-4);

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    for (const gl of gameLoops) gl.gameLoop.stop();
    await joiner.cleanup();
    process.exit(0);
  });

  try {
    await joiner.initialize();

    // Join bots
    for (let i = 0; i < numBots; i++) {
      const botName = `TestBot${i + 1}_${suffix}`;
      console.log(`\nJoining ${botName}...`);
      
      const bot = await joiner.joinBot(botName);
      
      const gameLoop = new BotGameLoop(bot.page, {
        botName,
        style: 'tag',
        startingStack: 1000,
        verbose: true
      });
      
      gameLoops.push({ bot, gameLoop });
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n===========================================');
    console.log('BOTS JOINED - WAITING FOR OWNER APPROVAL');
    console.log('===========================================\n');
    console.log('Please approve the bots in the PokerNow owner window.');
    console.log('Then click START GAME when ready.\n');

    // Wait for bots to be seated (approved)
    let seatedCount = 0;
    const startWait = Date.now();
    const maxWait = 300000; // 5 minutes

    while (seatedCount < numBots && Date.now() - startWait < maxWait) {
      seatedCount = 0;
      for (const { bot } of gameLoops) {
        const seated = await bot.page.$('.you-player').catch(() => null);
        if (seated) seatedCount++;
      }
      
      if (seatedCount < numBots) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (seatedCount < numBots) {
      throw new Error('Timeout waiting for bot approval');
    }

    console.log('\n=== All bots seated! Starting game loops... ===\n');

    // Start game loops
    for (const { gameLoop, bot } of gameLoops) {
      console.log(`Starting game loop for ${bot.name}`);
      gameLoop.start().catch(err => {
        console.log(`Game loop error for ${bot.name}: ${err.message}`);
      });
    }

    // Monitor progress
    let totalHands = 0;
    while (totalHands < targetHands) {
      totalHands = 0;
      for (const { gameLoop } of gameLoops) {
        totalHands += gameLoop.getStats().handsPlayed;
      }
      
      const elapsed = Math.round((Date.now() - startWait) / 1000);
      console.log(`[${elapsed}s] Hands: ${totalHands}/${targetHands}`);
      
      await new Promise(r => setTimeout(r, 10000));
    }

    // Output results
    console.log('\n=== RESULTS ===\n');
    for (const { gameLoop } of gameLoops) {
      const stats = gameLoop.getStats();
      console.log(`${stats.botName}:`);
      console.log(`  Hands: ${stats.handsPlayed}`);
      console.log(`  Default Folds: ${stats.defaultFolds} (${stats.defaultFoldRate})`);
      console.log(`  Profit: ${stats.profit}`);
      console.log('');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    for (const gl of gameLoops) gl.gameLoop.stop();
    await joiner.cleanup();
  }
}

run();
