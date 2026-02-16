/**
 * ValidationTestRunner - Integrated test runner for Play Advisor validation
 *
 * This script:
 * 1. Joins bots to a PokerNow game using PlaywrightBotJoiner
 * 2. Attaches BotGameLoop with Play Advisor integration to each bot
 * 3. Runs until specified hands are played
 * 4. Outputs comprehensive statistics including default-fold tracking
 *
 * Usage:
 *   node ValidationTestRunner.js [gameUrl] [numBots] [targetHands]
 *   node ValidationTestRunner.js https://pokernow.com/games/xxx 3 50
 */

import { PlaywrightBotJoiner, OwnerAutomation } from './PlaywrightBotJoiner.js';
import { BotGameLoop } from './BotGameLoop.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default config
const DEFAULT_GAME_URL = null;  // null = create new game (fully unattended)
const DEFAULT_NUM_BOTS = 2;
const DEFAULT_TARGET_HANDS = 50;

// Style options for testing different strategies
const STYLES = ['rock', 'tag', 'lag'];

export class ValidationTestRunner {
  constructor(options = {}) {
    // Use null for unattended mode (creates new game)
    this.gameUrl = options.gameUrl !== undefined ? options.gameUrl : DEFAULT_GAME_URL;
    this.numBots = options.numBots || DEFAULT_NUM_BOTS;
    this.targetHands = options.targetHands || DEFAULT_TARGET_HANDS;
    this.styles = options.styles || ['tag']; // Default to TAG style
    this.verbose = options.verbose ?? true;
    this.advisorUrl = options.advisorUrl || 'http://localhost:3001/api/advise';

    this.joiner = null;
    this.ownerBot = null;  // For automated approvals
    this.gameLoops = [];
    this.startTime = null;
    this.isRunning = false;

    // Aggregate statistics
    this.stats = {
      totalHands: 0,
      totalDefaultFolds: 0,
      totalLowConfidence: 0,
      botStats: []
    };
  }

  log(msg) {
    if (this.verbose) {
      console.log(`[ValidationTest] ${msg}`);
    }
  }

  /**
   * Run the validation test
   */
  async run() {
    this.startTime = Date.now();
    this.isRunning = true;

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║       Play Advisor Validation Test Runner                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\nGame URL: ${this.gameUrl}`);
    console.log(`Bots: ${this.numBots}`);
    console.log(`Target Hands: ${this.targetHands}`);
    console.log(`Styles: ${this.styles.join(', ')}`);
    console.log(`Advisor API: ${this.advisorUrl}\n`);

    try {
      // Step 1: Initialize owner automation (for unattended approvals)
      this.log('Step 1: Initializing owner automation...');
      this.ownerBot = new OwnerAutomation(this.gameUrl, {
        headless: false,
        verbose: true,
        minPlayers: this.numBots,
        autoStart: true
      });
      await this.ownerBot.initialize();
      await this.ownerBot.joinAsOwner();
      
      // Get the actual game URL (might be new if none was provided)
      const actualGameUrl = this.ownerBot.getGameUrl();
      if (actualGameUrl !== this.gameUrl) {
        this.log(`Using game URL: ${actualGameUrl}`);
        this.gameUrl = actualGameUrl;
      }
      this.log('Owner bot ready for auto-approvals');

      // Step 1b: Initialize bot joiner with the actual game URL
      this.log('Step 1b: Initializing bot joiner...');
      this.joiner = new PlaywrightBotJoiner(this.gameUrl, {
        headless: false,
        stackSize: 1000,
        verbose: true
      });
      await this.joiner.initialize();

      // Step 2: Join bots to the game
      // Use unique suffix to avoid name conflicts with existing players
      const suffix = Date.now().toString().slice(-4);
      this.log('Step 2: Joining bots to the game...');
      for (let i = 0; i < this.numBots; i++) {
        const botName = `TestBot${i + 1}_${suffix}`;
        const style = this.styles[i % this.styles.length];

        this.log(`Joining ${botName} with style: ${style}`);
        const bot = await this.joiner.joinBot(botName);

        // Create game loop for this bot
        const gameLoop = new BotGameLoop(bot.page, {
          botName,
          style,
          startingStack: 1000,
          verbose: true
        });

        this.gameLoops.push({ bot, gameLoop, style });

        // Wait between joins
        await this.sleep(2000);
      }

      // Step 3: Auto-approve bots using owner automation
      this.log('\nStep 3: Auto-approving bots...');
      
      // Start the approval loop in background
      const approvalPromise = this.ownerBot.startApprovalLoop(this.numBots, 180000);
      
      // Wait for approvals to complete
      const approved = await approvalPromise;
      if (!approved) {
        throw new Error('Failed to approve all bots');
      }
      
      this.log('All bots approved and game started!');
      
      // Wait for bots to be seated after approval
      await this.waitForAllBotsSeated(30000); // 30 seconds after approval

      // Step 4: Start game loops
      this.log('Step 4: Starting game loops...');
      await this.startAllGameLoops();

      // Step 5: Monitor progress
      this.log('Step 5: Running validation test...\n');
      await this.monitorProgress();

      // Step 6: Output results
      await this.outputResults();

    } catch (error) {
      console.error('Test error:', error);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Wait for all bots to be seated
   */
  async waitForAllBotsSeated(timeoutMs = 60000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      let allSeated = true;

      for (const { bot } of this.gameLoops) {
        // Check if bot's page shows them seated
        const seated = await bot.page.$('.you-player').catch(() => null);
        if (!seated) {
          allSeated = false;
          break;
        }
      }

      if (allSeated) {
        this.log('All bots are seated!');
        return true;
      }

      await this.sleep(2000);
    }

    throw new Error('Timeout waiting for bot approval');
  }

  /**
   * Start all bot game loops concurrently
   */
  async startAllGameLoops() {
    // Start each game loop (they run asynchronously)
    for (const { gameLoop, bot } of this.gameLoops) {
      this.log(`Starting game loop for ${bot.name}`);

      // Don't await - let them run concurrently
      gameLoop.start().catch(err => {
        this.log(`Game loop error for ${bot.name}: ${err.message}`);
      });
    }

    this.log('All game loops started');
  }

  /**
   * Monitor progress and stop when target is reached
   */
  async monitorProgress() {
    let lastLogTime = Date.now();
    const LOG_INTERVAL = 10000; // Log every 10 seconds

    while (this.isRunning) {
      // Collect stats from all loops
      let totalHands = 0;
      let totalDefaultFolds = 0;
      let totalLowConfidence = 0;

      for (const { gameLoop, style } of this.gameLoops) {
        const stats = gameLoop.getStats();
        totalHands += stats.handsPlayed;
        totalDefaultFolds += stats.defaultFolds;
        totalLowConfidence += stats.lowConfidenceActions;
      }

      // Log progress periodically
      if (Date.now() - lastLogTime > LOG_INTERVAL) {
        const elapsed = Math.round((Date.now() - this.startTime) / 1000);
        console.log(`[${elapsed}s] Hands: ${totalHands}/${this.targetHands} | Default Folds: ${totalDefaultFolds} | Low Confidence: ${totalLowConfidence}`);
        lastLogTime = Date.now();
      }

      // Check if target reached
      if (totalHands >= this.targetHands) {
        this.log(`Target hands reached: ${totalHands}`);
        this.isRunning = false;

        // Stop all game loops
        for (const { gameLoop } of this.gameLoops) {
          gameLoop.stop();
        }
        break;
      }

      await this.sleep(1000);
    }
  }

  /**
   * Output final results
   */
  async outputResults() {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                 VALIDATION TEST RESULTS                  ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    console.log(`Duration: ${elapsed} seconds`);
    console.log(`Advisor API: ${this.advisorUrl}\n`);

    // Per-bot stats
    console.log('=== Per-Bot Statistics ===\n');

    let allStats = [];
    for (const { gameLoop, style } of this.gameLoops) {
      const stats = gameLoop.getStats();
      allStats.push(stats);

      console.log(`${stats.botName} (${style}):`);
      console.log(`  Hands Played:      ${stats.handsPlayed}`);
      console.log(`  Starting Stack:    ${stats.startingStack}`);
      console.log(`  Current Stack:     ${stats.currentStack}`);
      console.log(`  Profit/Loss:       ${stats.profit > 0 ? '+' : ''}${stats.profit}`);
      console.log(`  BB/100:            ${stats.bb100}`);
      console.log(`  Default Folds:     ${stats.defaultFolds} (${stats.defaultFoldRate})`);
      console.log(`  Low Confidence:    ${stats.lowConfidenceActions}\n`);
    }

    // Aggregate stats
    console.log('=== Aggregate Statistics ===\n');

    const totalHands = allStats.reduce((sum, s) => sum + s.handsPlayed, 0);
    const totalDefaultFolds = allStats.reduce((sum, s) => sum + s.defaultFolds, 0);
    const totalLowConfidence = allStats.reduce((sum, s) => sum + s.lowConfidenceActions, 0);
    const totalProfit = allStats.reduce((sum, s) => sum + s.profit, 0);

    const defaultFoldRate = totalHands > 0 ? ((totalDefaultFolds / totalHands) * 100).toFixed(1) : '0';
    const lowConfidenceRate = totalHands > 0 ? ((totalLowConfidence / totalHands) * 100).toFixed(1) : '0';

    console.log(`Total Hands:         ${totalHands}`);
    console.log(`Total Profit/Loss:   ${totalProfit > 0 ? '+' : ''}${totalProfit}`);
    console.log(`Default Fold Rate:   ${defaultFoldRate}%`);
    console.log(`Low Confidence Rate: ${lowConfidenceRate}%`);

    // Save results to file
    const resultsPath = join(__dirname, 'validation-results.json');
    const results = {
      timestamp: new Date().toISOString(),
      duration: elapsed,
      config: {
        gameUrl: this.gameUrl,
        numBots: this.numBots,
        targetHands: this.targetHands,
        styles: this.styles,
        advisorUrl: this.advisorUrl
      },
      aggregate: {
        totalHands,
        totalDefaultFolds,
        totalLowConfidence,
        totalProfit,
        defaultFoldRate: parseFloat(defaultFoldRate),
        lowConfidenceRate: parseFloat(lowConfidenceRate)
      },
      bots: allStats,
      handHistory: this.gameLoops.map(({ gameLoop }) => gameLoop.exportHistory())
    };

    writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${resultsPath}`);

    // Key insights
    console.log('\n=== Key Insights ===\n');

    if (parseFloat(defaultFoldRate) > 20) {
      console.log('⚠️  HIGH DEFAULT FOLD RATE: The advisor lacks guidance for many situations.');
      console.log('    Consider expanding the strategy rules or adding more hand categories.\n');
    } else if (parseFloat(defaultFoldRate) > 10) {
      console.log('⚡ MODERATE DEFAULT FOLD RATE: Some gaps in advisor coverage.');
      console.log('    Review hand history to identify missing patterns.\n');
    } else {
      console.log('✅ LOW DEFAULT FOLD RATE: Good advisor coverage.\n');
    }

    if (parseFloat(lowConfidenceRate) > 30) {
      console.log('⚠️  HIGH LOW-CONFIDENCE RATE: Many marginal decisions.');
      console.log('    Consider tuning confidence thresholds or adding more context.\n');
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.isRunning = false;

    // Stop all game loops
    for (const { gameLoop } of this.gameLoops) {
      try {
        gameLoop.stop();
      } catch (e) {}
    }

    // Close owner automation
    if (this.ownerBot) {
      await this.ownerBot.cleanup();
    }

    // Close bot browsers
    if (this.joiner) {
      await this.joiner.cleanup();
    }

    this.log('Cleanup complete');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI entry point
async function main() {
  const gameUrl = process.argv[2] || DEFAULT_GAME_URL;
  const numBots = parseInt(process.argv[3]) || DEFAULT_NUM_BOTS;
  const targetHands = parseInt(process.argv[4]) || DEFAULT_TARGET_HANDS;

  const runner = new ValidationTestRunner({
    gameUrl,
    numBots,
    targetHands,
    styles: ['tag'],  // Can add ['rock', 'tag', 'lag'] for multi-style testing
    verbose: true
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived interrupt, shutting down...');
    await runner.cleanup();
    process.exit(0);
  });

  await runner.run();
}

export default ValidationTestRunner;

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
