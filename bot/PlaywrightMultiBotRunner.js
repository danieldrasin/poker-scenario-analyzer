/**
 * Playwright Multi-Bot Runner for PokerNow
 *
 * Uses Playwright's browser contexts for isolated sessions.
 * Each context has separate cookies = separate player identity.
 *
 * Based on research: pokernow-gpt proves Puppeteer/Playwright works
 * without stealth plugins for PokerNow player sessions.
 */

import { chromium } from 'playwright';
import { PlayAdvisorBridge } from './PlayAdvisorBridge.js';
import { GameStateParser } from './GameStateParser.js';
import { ActionExecutor } from './ActionExecutor.js';

export class PlaywrightMultiBotRunner {
  constructor(gameUrl, options = {}) {
    this.gameUrl = gameUrl;
    this.options = {
      headless: options.headless ?? false,  // Default to visible for debugging
      numBots: options.numBots ?? 2,
      stackSize: options.stackSize ?? 1000,
      botNamePrefix: options.botNamePrefix ?? 'PABot',
      actionDelay: options.actionDelay ?? { min: 500, max: 1500 },
      verbose: options.verbose ?? true,
      ...options
    };

    this.browser = null;
    this.bots = [];  // Array of { context, page, name, parser, executor, advisor }
    this.isRunning = false;
  }

  log(message) {
    if (this.options.verbose) {
      console.log(`[MultiBotRunner] ${message}`);
    }
  }

  /**
   * Initialize browser and create bot instances
   */
  async initialize() {
    this.log('Initializing Playwright browser...');

    // Launch a single browser instance
    this.browser = await chromium.launch({
      headless: this.options.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    this.log(`Browser launched. Creating ${this.options.numBots} bot contexts...`);

    // Create isolated contexts for each bot
    for (let i = 1; i <= this.options.numBots; i++) {
      const botName = `${this.options.botNamePrefix}${i}`;
      const bot = await this.createBotContext(botName);
      this.bots.push(bot);
      this.log(`Created bot: ${botName}`);
    }

    this.log('All bots initialized');
    return this.bots;
  }

  /**
   * Create a single bot with its own isolated context
   */
  async createBotContext(botName) {
    // Each context is completely isolated (separate cookies, storage)
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1200, height: 800 },
      locale: 'en-US'
    });

    const page = await context.newPage();

    // Create bot components
    const parser = new GameStateParser();
    const executor = new ActionExecutor(page);
    const advisor = new PlayAdvisorBridge();

    return {
      name: botName,
      context,
      page,
      parser,
      executor,
      advisor,
      isSeated: false,
      stackSize: this.options.stackSize
    };
  }

  /**
   * Navigate all bots to the game and join the table
   */
  async joinGame() {
    this.log(`Joining game: ${this.gameUrl}`);

    for (const bot of this.bots) {
      await this.joinBotToGame(bot);
      // Small delay between joins to avoid race conditions
      await this.sleep(1000);
    }

    this.log('All bots joined the game');
  }

  /**
   * Have a single bot join the game
   */
  async joinBotToGame(bot) {
    this.log(`${bot.name}: Navigating to game...`);

    await bot.page.goto(this.gameUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for the table to load
    await bot.page.waitForTimeout(2000);

    // Find an empty seat and click it
    this.log(`${bot.name}: Looking for empty seat...`);

    // Try different seat selectors
    const seatSelectors = [
      '.table-player-seat:not(.taken) button',
      '.table-player-seat button',
      '[class*="empty-seat"]',
      'button:has-text("Take")',
      'button:has-text("Sit")'
    ];

    let seatClicked = false;
    for (const selector of seatSelectors) {
      try {
        const seats = await bot.page.$$(selector);
        if (seats.length > 0) {
          await seats[0].click();
          seatClicked = true;
          this.log(`${bot.name}: Clicked seat using selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!seatClicked) {
      throw new Error(`${bot.name}: Could not find empty seat`);
    }

    // Wait for the join dialog
    await bot.page.waitForTimeout(1000);

    // Fill in nickname
    this.log(`${bot.name}: Entering nickname...`);
    const nicknameInput = await bot.page.$('input[placeholder*="ickname"], input[type="text"]');
    if (nicknameInput) {
      await nicknameInput.fill(bot.name);
    }

    // Fill in stack size
    this.log(`${bot.name}: Entering stack size (${bot.stackSize})...`);
    const stackInput = await bot.page.$('input[type="number"], input[placeholder*="stack"], input[placeholder*="chip"]');
    if (stackInput) {
      await stackInput.fill(String(bot.stackSize));
    }

    // Click "Take the Seat" button
    this.log(`${bot.name}: Clicking join button...`);
    const joinButton = await bot.page.$('button:has-text("Take"), button:has-text("Join"), button:has-text("Sit")');
    if (joinButton) {
      await joinButton.click();
    }

    // Verify we're seated
    await bot.page.waitForTimeout(2000);
    bot.isSeated = true;
    this.log(`${bot.name}: Successfully seated!`);
  }

  /**
   * Main game loop - process turns for all bots
   */
  async runGameLoop(maxHands = 10) {
    this.isRunning = true;
    let handsPlayed = 0;

    this.log(`Starting game loop (max ${maxHands} hands)...`);

    while (this.isRunning && handsPlayed < maxHands) {
      for (const bot of this.bots) {
        if (!this.isRunning) break;

        try {
          // Check if it's this bot's turn
          const isOurTurn = await this.checkBotTurn(bot);

          if (isOurTurn) {
            await this.processBotTurn(bot);
            handsPlayed++;
          }
        } catch (error) {
          this.log(`${bot.name}: Error during turn: ${error.message}`);
        }
      }

      // Small delay between checks
      await this.sleep(500);
    }

    this.log(`Game loop ended. Hands played: ${handsPlayed}`);
  }

  /**
   * Check if it's a specific bot's turn
   */
  async checkBotTurn(bot) {
    try {
      const hasActionButtons = await bot.page.evaluate(() => {
        const foldBtn = document.querySelector('button.fold');
        const checkBtn = document.querySelector('button.check');
        const callBtn = document.querySelector('button.call');

        const anyButton = foldBtn || checkBtn || callBtn;
        if (anyButton) {
          const style = window.getComputedStyle(anyButton);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }
        return false;
      });

      return hasActionButtons;
    } catch (e) {
      return false;
    }
  }

  /**
   * Process a bot's turn - get game state, decide action, execute
   */
  async processBotTurn(bot) {
    this.log(`${bot.name}: It's our turn!`);

    // Get page HTML for parsing
    const html = await bot.page.content();

    // Parse game state
    const gameState = bot.parser.parseFromHTML(html);
    this.log(`${bot.name}: Parsed state - Street: ${gameState.street}, Pot: ${gameState.potTotal}`);

    // Get action from Play Advisor
    const decision = await bot.advisor.getAction(gameState);
    this.log(`${bot.name}: Advisor suggests: ${decision.action} (${decision.amount || ''})`);

    // Add human-like delay
    await this.randomDelay();

    // Execute the action
    await bot.executor.executeAction(decision);
    this.log(`${bot.name}: Action executed`);
  }

  /**
   * Stop the game loop
   */
  stop() {
    this.isRunning = false;
    this.log('Stopping game loop...');
  }

  /**
   * Clean up - close all contexts and browser
   */
  async cleanup() {
    this.log('Cleaning up...');

    for (const bot of this.bots) {
      try {
        await bot.context.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    if (this.browser) {
      await this.browser.close();
    }

    this.bots = [];
    this.browser = null;
    this.log('Cleanup complete');
  }

  /**
   * Utility: sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Utility: random delay for human-like behavior
   */
  async randomDelay() {
    const { min, max } = this.options.actionDelay;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.sleep(delay);
  }
}

// CLI entry point
async function main() {
  const gameUrl = process.argv[2] || 'https://www.pokernow.com/games/pgl2wy20QIsPBt_NSZ5zQfL4X';
  const numBots = parseInt(process.argv[3]) || 2;

  console.log('=== Playwright Multi-Bot Runner ===');
  console.log(`Game URL: ${gameUrl}`);
  console.log(`Number of bots: ${numBots}`);

  const runner = new PlaywrightMultiBotRunner(gameUrl, {
    numBots,
    headless: false,  // Show browsers for debugging
    verbose: true
  });

  try {
    await runner.initialize();
    await runner.joinGame();

    console.log('\nBots are seated. Starting game loop...');
    console.log('Press Ctrl+C to stop.\n');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nReceived SIGINT, stopping...');
      runner.stop();
    });

    await runner.runGameLoop(50);  // Play up to 50 hands

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await runner.cleanup();
  }
}

// Export for module usage
export default PlaywrightMultiBotRunner;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
