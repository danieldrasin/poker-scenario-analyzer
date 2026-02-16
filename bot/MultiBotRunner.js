/**
 * Multi-Bot Runner
 *
 * Launches multiple bot instances with isolated browser profiles
 * for testing bot-vs-bot on PokerNow
 */

import puppeteer from 'puppeteer-core';
import { config } from './config.js';
import { GameStateParser } from './GameStateParser.js';
import { ActionExecutor } from './ActionExecutor.js';
import { AdvisorClient } from './AdvisorClient.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

export class MultiBotRunner {
  constructor(tableUrl, numBots = 2) {
    this.tableUrl = tableUrl;
    this.numBots = numBots;
    this.bots = [];
    this.running = false;
  }

  /**
   * Launch multiple bot instances
   */
  async launch() {
    console.log(`\n🤖 Launching ${this.numBots} bot instances...`);
    console.log(`📍 Table URL: ${this.tableUrl}\n`);

    for (let i = 0; i < this.numBots; i++) {
      const bot = await this.createBotInstance(i);
      this.bots.push(bot);

      // Stagger launches to avoid overwhelming the page
      await this.sleep(2000);
    }

    console.log(`\n✅ All ${this.numBots} bots launched successfully!\n`);
    return this.bots;
  }

  /**
   * Create a single bot instance with isolated profile
   */
  async createBotInstance(index) {
    const botName = `Bot_${index + 1}`;
    const userDataDir = path.join(os.tmpdir(), `pokernow-bot-${index}`);

    // Ensure clean profile directory
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(userDataDir, { recursive: true });

    console.log(`🚀 Starting ${botName}...`);

    const browser = await puppeteer.launch({
      executablePath: config.browser.executablePath,
      headless: false, // Keep visible for testing
      userDataDir: userDataDir,
      args: [
        ...config.browser.args,
        `--window-position=${100 + index * 400},${100 + index * 50}`,
        `--window-size=800,600`
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });

    // Navigate to table
    console.log(`   ${botName}: Navigating to table...`);
    await page.goto(this.tableUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for table to load
    await page.waitForSelector('.table-player', { timeout: 15000 }).catch(() => {
      console.log(`   ${botName}: Waiting for game elements...`);
    });

    // Enter nickname if prompted
    await this.enterNickname(page, botName);

    // Take a seat if needed
    await this.takeSeat(page, botName);

    console.log(`   ✓ ${botName}: Ready!`);

    return {
      name: botName,
      browser,
      page,
      userDataDir,
      parser: null, // Will be initialized when game starts
      executor: null,
      advisor: new AdvisorClient()
    };
  }

  /**
   * Enter nickname if the join dialog is shown
   */
  async enterNickname(page, botName) {
    try {
      const nicknameInput = await page.$('input[placeholder*="ickname"], input[type="text"]');
      if (nicknameInput) {
        await nicknameInput.click({ clickCount: 3 });
        await nicknameInput.type(botName);

        // Click join/enter button
        const joinBtn = await page.$('button[type="submit"], button:has-text("Join"), button:has-text("Enter")');
        if (joinBtn) {
          await joinBtn.click();
          await this.sleep(1000);
        }
        console.log(`   ${botName}: Entered nickname`);
      }
    } catch (e) {
      // Nickname entry not needed
    }
  }

  /**
   * Take an available seat at the table
   */
  async takeSeat(page, botName) {
    try {
      // Look for "Sit" or "Take Seat" button
      const seatButtons = await page.$$('.table-player-seat button, button:has-text("Sit")');

      for (const btn of seatButtons) {
        const isVisible = await btn.isIntersectingViewport();
        if (isVisible) {
          await btn.click();
          console.log(`   ${botName}: Took a seat`);
          await this.sleep(500);
          return;
        }
      }
    } catch (e) {
      // May already be seated
    }
  }

  /**
   * Run the main game loop for all bots
   */
  async runGameLoop() {
    this.running = true;
    console.log('\n🎮 Starting game loop for all bots...\n');
    console.log('Press Ctrl+C to stop\n');

    while (this.running) {
      for (const bot of this.bots) {
        try {
          await this.processBotTurn(bot);
        } catch (error) {
          console.error(`${bot.name} error:`, error.message);
        }
      }

      // Short delay between checking all bots
      await this.sleep(config.timing.turnCheckInterval);
    }
  }

  /**
   * Process a single bot's turn if it's their action
   */
  async processBotTurn(bot) {
    const { page, name } = bot;

    // Check if it's this bot's turn
    const isOurTurn = await page.evaluate(() => {
      const actionSignal = document.querySelector('.you-player .action-signal');
      if (actionSignal) {
        const style = window.getComputedStyle(actionSignal);
        return style.display !== 'none';
      }
      // Fallback: check for action buttons
      const btn = document.querySelector('button.fold, button.check, button.call');
      return btn !== null;
    });

    if (!isOurTurn) return;

    console.log(`\n🎯 ${name}: It's my turn!`);

    // Parse game state
    const gameState = await this.parseGameState(bot);
    if (!gameState || gameState.holeCards.length === 0) {
      console.log(`   ${name}: Waiting for cards...`);
      return;
    }

    console.log(`   ${name}: Cards: ${gameState.holeCards.join(' ')}`);
    console.log(`   ${name}: Board: ${gameState.board.join(' ') || '(preflop)'}`);
    console.log(`   ${name}: Pot: ${gameState.potSize}, To Call: ${gameState.toCall}`);

    // Get recommendation from Play Advisor
    let action = 'check';
    let amount = 0;

    try {
      const recommendation = await bot.advisor.getRecommendation(gameState);
      if (recommendation && recommendation.action) {
        action = recommendation.action;
        amount = recommendation.sizing?.optimal || 0;
        console.log(`   ${name}: Advisor says: ${action}${amount ? ` ${amount}` : ''}`);
      }
    } catch (e) {
      console.log(`   ${name}: Advisor unavailable, defaulting to check/fold`);
      action = gameState._raw?.availableActions?.includes('check') ? 'check' : 'fold';
    }

    // Execute the action
    await this.executeAction(bot, action, amount, gameState);

    // Random delay for human-like behavior
    const delay = Math.random() * 1500 + 500;
    await this.sleep(delay);
  }

  /**
   * Parse game state for a bot
   */
  async parseGameState(bot) {
    return await bot.page.evaluate(() => {
      const result = {
        holeCards: [],
        board: [],
        potSize: 0,
        toCall: 0,
        stackSize: 0,
        position: 'MP',
        playersInHand: 2,
        gameVariant: 'omaha4',
        street: 'preflop',
        _raw: { availableActions: [] }
      };

      // Parse hole cards
      document.querySelectorAll('.you-player .card').forEach(card => {
        const valueEl = card.querySelector('.value');
        const suitEl = card.querySelector('.suit');
        if (valueEl && suitEl) {
          let rank = valueEl.textContent.trim().toUpperCase();
          if (rank === '10') rank = 'T';
          let suit = suitEl.textContent.trim();
          if (suit === '♠') suit = 's';
          if (suit === '♥') suit = 'h';
          if (suit === '♦') suit = 'd';
          if (suit === '♣') suit = 'c';
          if (rank && suit) result.holeCards.push(rank + suit);
        }
      });

      // Detect variant
      if (result.holeCards.length === 5) result.gameVariant = 'omaha5';
      else if (result.holeCards.length === 2) result.gameVariant = 'holdem';

      // Parse board
      document.querySelectorAll('.table-cards .card').forEach(card => {
        const valueEl = card.querySelector('.value');
        const suitEl = card.querySelector('.suit');
        if (valueEl && suitEl) {
          let rank = valueEl.textContent.trim().toUpperCase();
          if (rank === '10') rank = 'T';
          let suit = suitEl.textContent.trim();
          if (suit === '♠') suit = 's';
          if (suit === '♥') suit = 'h';
          if (suit === '♦') suit = 'd';
          if (suit === '♣') suit = 'c';
          if (rank && suit) result.board.push(rank + suit);
        }
      });

      // Street
      if (result.board.length === 0) result.street = 'preflop';
      else if (result.board.length === 3) result.street = 'flop';
      else if (result.board.length === 4) result.street = 'turn';
      else if (result.board.length === 5) result.street = 'river';

      // Pot size
      const potEl = document.querySelector('.table-pot-size');
      if (potEl) {
        const text = potEl.textContent.replace(/[^0-9.]/g, '');
        result.potSize = parseFloat(text) || 0;
      }

      // Stack size
      const stackEl = document.querySelector('.you-player .table-player-stack .chips-value');
      if (stackEl) {
        result.stackSize = parseFloat(stackEl.textContent.replace(/[^0-9.]/g, '')) || 0;
      }

      // Available actions
      if (document.querySelector('button.fold')) result._raw.availableActions.push('fold');
      if (document.querySelector('button.check')) result._raw.availableActions.push('check');
      if (document.querySelector('button.call')) result._raw.availableActions.push('call');
      if (document.querySelector('button.raise')) result._raw.availableActions.push('raise');

      // To call (from call button text)
      const callBtn = document.querySelector('button.call');
      if (callBtn) {
        const match = callBtn.textContent.match(/[\d,]+/);
        if (match) result.toCall = parseFloat(match[0].replace(',', '')) || 0;
      }

      return result;
    });
  }

  /**
   * Execute an action for a bot
   */
  async executeAction(bot, action, amount, gameState) {
    const { page, name } = bot;

    try {
      switch (action.toLowerCase()) {
        case 'fold':
          await page.click('button.fold');
          console.log(`   ${name}: FOLDED`);
          break;

        case 'check':
          await page.click('button.check');
          console.log(`   ${name}: CHECKED`);
          break;

        case 'call':
          await page.click('button.call');
          console.log(`   ${name}: CALLED`);
          break;

        case 'raise':
        case 'bet':
          // Try to enter amount and raise
          const raiseInput = await page.$('.raise-controller-form input[type="number"], .raise-input');
          if (raiseInput && amount > 0) {
            await raiseInput.click({ clickCount: 3 });
            await raiseInput.type(String(Math.round(amount)));
          }
          const raiseBtn = await page.$('button.raise, .raise-controller-form input[type="submit"]');
          if (raiseBtn) {
            await raiseBtn.click();
            console.log(`   ${name}: RAISED to ${amount}`);
          }
          break;

        default:
          // Default to check if available, else fold
          const checkBtn = await page.$('button.check');
          if (checkBtn) {
            await checkBtn.click();
            console.log(`   ${name}: CHECKED (default)`);
          } else {
            const foldBtn = await page.$('button.fold');
            if (foldBtn) {
              await foldBtn.click();
              console.log(`   ${name}: FOLDED (default)`);
            }
          }
      }
    } catch (e) {
      console.error(`   ${name}: Action failed - ${e.message}`);
    }
  }

  /**
   * Stop all bots
   */
  async stop() {
    this.running = false;
    console.log('\n🛑 Stopping all bots...');

    for (const bot of this.bots) {
      try {
        await bot.browser.close();
        // Clean up profile directory
        if (fs.existsSync(bot.userDataDir)) {
          fs.rmSync(bot.userDataDir, { recursive: true, force: true });
        }
        console.log(`   ✓ ${bot.name} stopped`);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    this.bots = [];
    console.log('\n👋 All bots stopped\n');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║              PokerNow Multi-Bot Testing Runner                  ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  Usage: node bot/MultiBotRunner.js <table-url> [num-bots]       ║
║                                                                 ║
║  Arguments:                                                     ║
║    table-url   PokerNow game URL                                ║
║    num-bots    Number of bots to launch (default: 2)            ║
║                                                                 ║
║  Example:                                                       ║
║    node bot/MultiBotRunner.js https://pokernow.club/games/xxx 3 ║
║                                                                 ║
║  Setup:                                                         ║
║    1. Create a game manually at pokernow.club/start-game        ║
║    2. Copy the game URL                                         ║
║    3. Run this script with the URL                              ║
║    4. Bots will join and play against each other                ║
║                                                                 ║
║  Requirements:                                                  ║
║    - Play Advisor server running (npm run start:web)            ║
║    - Chrome installed                                           ║
║                                                                 ║
╚════════════════════════════════════════════════════════════════╝
    `);
    process.exit(0);
  }

  const tableUrl = args[0];
  const numBots = parseInt(args[1]) || 2;

  // Validate URL
  if (!tableUrl.includes('pokernow')) {
    console.error('❌ Error: Please provide a valid PokerNow table URL');
    process.exit(1);
  }

  const runner = new MultiBotRunner(tableUrl, numBots);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await runner.stop();
    process.exit(0);
  });

  try {
    await runner.launch();
    await runner.runGameLoop();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await runner.stop();
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1].includes('MultiBotRunner')) {
  main();
}

export default MultiBotRunner;
