/**
 * Action Executor
 *
 * Converts Play Advisor recommendations into PokerNow UI actions
 */

import { config } from './config.js';

export class ActionExecutor {
  constructor(browserController) {
    this.browser = browserController;
  }

  /**
   * Execute a recommendation from Play Advisor
   * @param {Object} recommendation - Play Advisor recommendation
   * @param {Object} gameState - Current game state
   */
  async execute(recommendation, gameState) {
    const { action, sizing } = recommendation;
    const availableActions = gameState._raw?.availableActions || [];

    console.log(`Executing action: ${action}`);

    // Add human-like delay
    await this.browser.randomDelay();

    switch (action) {
      case 'fold':
        return await this.executeFold();

      case 'check':
        // Fall back to fold if check not available
        if (availableActions.includes('check')) {
          return await this.executeCheck();
        } else {
          console.log('Check not available, folding');
          return await this.executeFold();
        }

      case 'call':
        return await this.executeCall();

      case 'bet':
        if (sizing && sizing.optimal) {
          return await this.executeBet(sizing.optimal, gameState);
        }
        // If no sizing, use minimum bet
        return await this.executeBet(gameState.potSize * 0.5, gameState);

      case 'raise':
        if (sizing && sizing.optimal) {
          return await this.executeRaise(sizing.optimal, gameState);
        }
        // If no sizing, use 2.5x raise
        return await this.executeRaise(gameState.toCall * 2.5, gameState);

      default:
        console.warn(`Unknown action: ${action}, defaulting to fold`);
        return await this.executeFold();
    }
  }

  /**
   * Execute fold action (verified selector: button.fold)
   */
  async executeFold() {
    // Primary selector from pokernow-bot
    if (await this.clickButton('button.fold')) {
      console.log('Folded');
      return { success: true, action: 'fold' };
    }

    // Fallback: try finding button by text
    const clicked = await this.clickButtonByText('fold');
    if (clicked) {
      console.log('Folded (by text)');
      return { success: true, action: 'fold' };
    }

    console.error('Could not find fold button');
    return { success: false, action: 'fold', error: 'Button not found' };
  }

  /**
   * Execute check action (verified selector: button.check)
   */
  async executeCheck() {
    // Primary selector from pokernow-bot
    if (await this.clickButton('button.check')) {
      console.log('Checked');
      return { success: true, action: 'check' };
    }

    // Fallback: try finding button by text
    const clicked = await this.clickButtonByText('check');
    if (clicked) {
      console.log('Checked (by text)');
      return { success: true, action: 'check' };
    }

    console.error('Could not find check button');
    return { success: false, action: 'check', error: 'Button not found' };
  }

  /**
   * Execute call action (verified selector: button.call)
   */
  async executeCall() {
    // Primary selector from pokernow-bot
    if (await this.clickButton('button.call')) {
      console.log('Called');
      return { success: true, action: 'call' };
    }

    // Fallback: try finding button by text
    const clicked = await this.clickButtonByText('call');
    if (clicked) {
      console.log('Called (by text)');
      return { success: true, action: 'call' };
    }

    console.error('Could not find call button');
    return { success: false, action: 'call', error: 'Button not found' };
  }

  /**
   * Execute bet action with specific amount
   */
  async executeBet(amount, gameState) {
    // Round to nearest whole number
    const betAmount = Math.round(amount);

    // Cap at stack size
    const actualBet = Math.min(betAmount, gameState.stackSize);

    console.log(`Betting ${actualBet}`);

    // First, try to enter the amount in an input field
    const inputEntered = await this.enterBetAmount(actualBet);

    if (inputEntered) {
      // Click the bet/confirm button
      const betClicked = await this.clickButtonByText('bet') ||
                         await this.clickButtonByText('confirm') ||
                         await this.clickButton('.bet-confirm, .confirm-bet, .submit-bet');

      if (betClicked) {
        console.log(`Bet ${actualBet}`);
        return { success: true, action: 'bet', amount: actualBet };
      }
    }

    // Fallback: try using preset bet buttons
    const presetClicked = await this.usePresetBet(actualBet, gameState);
    if (presetClicked) {
      return { success: true, action: 'bet', amount: actualBet };
    }

    // Last resort: click generic bet button
    const genericBet = await this.clickButtonByText('bet');
    if (genericBet) {
      console.log('Bet (generic button)');
      return { success: true, action: 'bet', amount: 'unknown' };
    }

    console.error('Could not execute bet');
    return { success: false, action: 'bet', error: 'Could not enter bet amount' };
  }

  /**
   * Execute raise action with specific amount
   * Verified selectors: button.raise, .raise-controller-form input[type="submit"]
   */
  async executeRaise(amount, gameState) {
    // Raise amount is total, not additional
    const raiseAmount = Math.round(amount);
    const actualRaise = Math.min(raiseAmount, gameState.stackSize);

    console.log(`Raising to ${actualRaise}`);

    // First, try to enter the amount
    const inputEntered = await this.enterBetAmount(actualRaise);

    if (inputEntered) {
      // Click raise/confirm button (verified: .raise-controller-form input[type="submit"])
      const raiseClicked = await this.clickButton('.raise-controller-form input[type="submit"]') ||
                           await this.clickButton('button.raise');

      if (raiseClicked) {
        console.log(`Raised to ${actualRaise}`);
        return { success: true, action: 'raise', amount: actualRaise };
      }
    }

    // Fallback: try preset buttons (verified: .default-bet-buttons button)
    const presetClicked = await this.usePresetBet(actualRaise, gameState);
    if (presetClicked) {
      return { success: true, action: 'raise', amount: actualRaise };
    }

    // Last resort: just click raise button
    const genericRaise = await this.clickButton('button.raise');
    if (genericRaise) {
      console.log('Raised (generic button)');
      return { success: true, action: 'raise', amount: 'unknown' };
    }

    console.error('Could not execute raise');
    return { success: false, action: 'raise', error: 'Could not enter raise amount' };
  }

  /**
   * Enter bet amount into input field
   */
  async enterBetAmount(amount) {
    const inputSelectors = [
      'input[type="number"].bet-input',
      'input.bet-amount',
      'input[name="bet"]',
      'input[name="raise"]',
      '.bet-slider-input',
      'input.raise-input'
    ];

    for (const selector of inputSelectors) {
      try {
        const success = await this.browser.evaluate((sel, amt) => {
          const input = document.querySelector(sel);
          if (input) {
            input.value = '';
            input.value = amt.toString();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        }, selector, amount);

        if (success) {
          await this.browser.sleep(config.timing.betInputDelay);
          return true;
        }
      } catch (e) {
        // Try next selector
      }
    }

    return false;
  }

  /**
   * Try to use preset bet buttons (pot, 1/2 pot, etc.)
   * Verified selector: .default-bet-buttons button
   */
  async usePresetBet(targetAmount, gameState) {
    const pot = gameState.potSize || 0;

    // Calculate which preset is closest
    const presets = [
      { ratio: 0.5, text: '1/2', keywords: ['1/2', 'half', '50%'] },
      { ratio: 0.75, text: '3/4', keywords: ['3/4', '75%'] },
      { ratio: 1.0, text: 'pot', keywords: ['pot', '100%'] },
      { ratio: 2.0, text: '2x', keywords: ['2x', 'double'] }
    ];

    // Find closest preset
    let closest = presets[0];
    let closestDiff = Math.abs(pot * presets[0].ratio - targetAmount);

    for (const preset of presets) {
      const diff = Math.abs(pot * preset.ratio - targetAmount);
      if (diff < closestDiff) {
        closest = preset;
        closestDiff = diff;
      }
    }

    // Try clicking preset buttons using verified selector
    const clicked = await this.browser.evaluate((keywords) => {
      const buttons = document.querySelectorAll('.default-bet-buttons button');
      for (const btn of buttons) {
        const text = btn.textContent.toLowerCase();
        for (const keyword of keywords) {
          if (text.includes(keyword.toLowerCase())) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    }, closest.keywords);

    if (clicked) return true;

    // Fallback: try by text
    if (await this.clickButtonByText(closest.text)) {
      return true;
    }

    return false;
  }

  /**
   * Click a button by selector
   */
  async clickButton(selector) {
    try {
      return await this.browser.click(selector);
    } catch (e) {
      return false;
    }
  }

  /**
   * Click a button by text content
   */
  async clickButtonByText(text) {
    return await this.browser.evaluate((searchText) => {
      const buttons = document.querySelectorAll('button, .action-button, [role="button"]');
      for (const btn of buttons) {
        if (btn.textContent.toLowerCase().includes(searchText.toLowerCase())) {
          btn.click();
          return true;
        }
      }
      return false;
    }, text);
  }

  /**
   * Execute default action (usually fold)
   */
  async executeDefault() {
    console.log('Executing default action (fold)');
    return await this.executeFold();
  }
}

export default ActionExecutor;
