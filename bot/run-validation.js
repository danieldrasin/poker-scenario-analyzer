#!/usr/bin/env node
/**
 * Simple runner for ValidationTestRunner
 * Usage: node run-validation.js [gameUrl] [numBots] [targetHands]
 * 
 * For unattended mode (creates new game): node run-validation.js "" 2 10
 * For existing game: node run-validation.js https://pokernow.com/games/xxx 2 10
 */

import { ValidationTestRunner } from './ValidationTestRunner.js';

const gameUrl = process.argv[2] || null;  // null = create new game
const numBots = parseInt(process.argv[3]) || 2;
const targetHands = parseInt(process.argv[4]) || 10;

console.log('=== Unattended Validation Test ===');
console.log(`Game URL: ${gameUrl || '(will create new game)'}`);
console.log(`Bots: ${numBots}`);
console.log(`Target Hands: ${targetHands}`);
console.log('');

const runner = new ValidationTestRunner({
  gameUrl,
  numBots,
  targetHands,
  styles: ['tag'],
  verbose: true
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await runner.cleanup();
  process.exit(0);
});

runner.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
