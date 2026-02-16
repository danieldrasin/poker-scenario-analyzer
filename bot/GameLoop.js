/**
 * Game Loop
 *
 * Main game loop that coordinates all bot components
 */

import { config } from './config.js';
import { BrowserController } from './BrowserController.js';
import { GameStateParser } from './GameStateParser.js';
import { ActionExecutor } from './ActionExecutor.js';
import { AdvisorClient } from './AdvisorClient.js';

export class GameLoop {
  constructor() {
    this.browser = new BrowserController();
    this.parser = new GameStateParser(this.browser);
    this.executor = new ActionExecutor(this.browser);
    this.advisor = new AdvisorClient();

    this.running = false;
    this.handsPlayed = 0;
    this.stats = {
      handsPlayed: 0,
      handsWon: 0,
      totalProfit: 0,
      actions: { fold: 0, check: 0, call: 0, bet: 0, raise: 0 }
    };
  }

  /**
   * Start the bot
   * @param {string} tableUrl - PokerNow table URL
   */
  async start(tableUrl) {
    console.log('====================================');
    console.log('  PokerNow Omaha Bot Starting');
    console.log('====================================');
    console.log('Table URL:', tableUrl);

    try {
      // Launch browser
      await this.browser.launch();

      // Navigate to table
      const connected = await this.browser.navigateToTable(tableUrl);
      if (!connected) {
        throw new Error('Failed to connect to table');
      }

      // Health check advisor
      console.log('Checking Play Advisor API...');
      const advisorOk = await this.advisor.healthCheck();
      if (!advisorOk) {
        console.warn('⚠️  Play Advisor API not responding - will use default actions');
      } else {
        console.log('✓ Play Advisor API connected');
      }

      // Start main loop
      this.running = true;
      await this.mainLoop();

    } catch (error) {
      console.error('Bot error:', error.message);
      throw error;
    } finally {
      await this.stop();
    }
  }

  /**
   * Main game loop
   */
  async mainLoop() {
    console.log('Entering main game loop...');
    console.log('Press Ctrl+C to stop\n');

    while (this.running) {
      try {
        // Check if we've hit max hands
        if (this.handsPlayed >= config.behavior.maxHandsPerSession) {
          console.log(`\nMax hands (${config.behavior.maxHandsPerSession}) reached. Taking a break.`);
          break;
        }

        // Wait for our turn
        const isOurTurn = await this.browser.waitForTurn(60000);

        if (!isOurTurn) {
          // Check if hand is over
          if (await this.parser.isHandOver()) {
            await this.handleHandEnd();
            continue;
          }

          // Still waiting...
          continue;
        }

        // It's our turn! Process the action
        await this.processAction();

      } catch (error) {
        console.error('Loop error:', error.message);

        // Take screenshot for debugging
        await this.browser.screenshot(`error-${Date.now()}.png`);

        // Wait before retrying
        await this.browser.sleep(2000);
      }
    }

    this.printStats();
  }

  /**
   * Process a single action when it's our turn
   */
  async processAction() {
    console.log('\n--- Our Turn ---');

    // Parse game state
    const gameState = await this.parser.parseGameState();

    if (!gameState.holeCards || gameState.holeCards.length === 0) {
      console.warn('No hole cards detected, skipping...');
      return;
    }

    console.log(`Street: ${gameState.street}`);
    console.log(`Position: ${gameState.position}`);
    console.log(`Hole Cards: ${gameState.holeCards.join(', ')}`);
    console.log(`Board: ${gameState.board.join(', ') || '(preflop)'}`);
    console.log(`Pot: ${gameState.potSize}, To Call: ${gameState.toCall}`);

    // Get recommendation from Play Advisor
    const recommendation = await this.advisor.getRecommendation(gameState);

    console.log(`\nRecommendation: ${recommendation.action.toUpperCase()}`);
    console.log(`Confidence: ${(recommendation.confidence * 100).toFixed(0)}%`);

    if (recommendation.reasoning && recommendation.reasoning.length > 0) {
      console.log(`Reasoning: ${recommendation.reasoning[0]}`);
    }

    // Check confidence threshold
    let actionToExecute = recommendation;
    if (!this.advisor.meetsConfidenceThreshold(recommendation)) {
      console.log('⚠️  Low confidence - using safe action');
      actionToExecute = this.advisor.getSafeAction(gameState);
    }

    // Execute the action
    const result = await this.executor.execute(actionToExecute, gameState);

    // Update stats
    this.stats.actions[actionToExecute.action] =
      (this.stats.actions[actionToExecute.action] || 0) + 1;

    // Log for feedback
    await this.advisor.logRecommendation(gameState, recommendation, result);

    if (result.success) {
      console.log(`✓ Action executed: ${result.action}`);
    } else {
      console.error(`✗ Action failed: ${result.error}`);
      // Fallback to default
      await this.executor.executeDefault();
    }
  }

  /**
   * Handle end of hand
   */
  async handleHandEnd() {
    this.handsPlayed++;
    this.stats.handsPlayed++;

    const winner = await this.parser.getWinnerInfo();

    if (winner) {
      console.log(`\nHand ${this.handsPlayed} complete. Winner: ${winner.name} (+${winner.amount})`);

      // Check if we won (simple name matching - could be improved)
      // In practice, you'd need to identify "our" player name
    }

    // Wait for next hand to start
    await this.browser.sleep(2000);
  }

  /**
   * Stop the bot
   */
  async stop() {
    console.log('\nStopping bot...');
    this.running = false;
    await this.browser.close();
    console.log('Bot stopped.');
  }

  /**
   * Print session statistics
   */
  printStats() {
    console.log('\n====================================');
    console.log('  Session Statistics');
    console.log('====================================');
    console.log(`Hands Played: ${this.stats.handsPlayed}`);
    console.log(`Actions:`);
    Object.entries(this.stats.actions).forEach(([action, count]) => {
      if (count > 0) {
        console.log(`  - ${action}: ${count}`);
      }
    });
    console.log('====================================\n');
  }
}

export default GameLoop;
