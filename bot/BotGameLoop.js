/**
 * BotGameLoop - Automated poker playing using Play Advisor
 * 
 * This module:
 * 1. Detects when it's the bot's turn
 * 2. Parses the game state from the DOM
 * 3. Calls the Play Advisor API for recommendations
 * 4. Executes the recommended action
 * 5. Tracks results including default-fold events
 */

import { config } from './config.js';

// Play Advisor API URL (local dev or production)
// Use port 3001 for local advisor server (LocalAdvisorServer.js)
const ADVISOR_API = process.env.ADVISOR_API || 'http://localhost:3001/api/advise';

export class BotGameLoop {
  constructor(page, options = {}) {
    this.page = page;
    this.botName = options.botName || 'Bot';
    this.style = options.style || 'tag';  // rock, tag, or lag
    this.verbose = options.verbose ?? true;
    
    // Tracking
    this.handsPlayed = 0;
    this.handsWon = 0;
    this.totalProfit = 0;
    this.startingStack = options.startingStack || 1000;
    this.currentStack = this.startingStack;
    
    // Default fold tracking
    this.defaultFolds = 0;
    this.lowConfidenceActions = 0;
    
    // Hand history
    this.handHistory = [];
    
    // State
    this.isRunning = false;
    this.lastHandId = null;
  }

  log(msg) {
    if (this.verbose) {
      console.log(`[${this.botName}] ${msg}`);
    }
  }

  /**
   * Start the game loop
   */
  async start() {
    this.isRunning = true;
    this.log(`Starting game loop (style: ${this.style})`);
    
    while (this.isRunning) {
      try {
        // Check if it's our turn
        const isOurTurn = await this.isMyTurn();
        
        if (isOurTurn) {
          await this.playTurn();
        }
        
        // Wait before checking again
        await this.page.waitForTimeout(1000);
        
      } catch (error) {
        this.log(`Error in game loop: ${error.message}`);
        await this.page.waitForTimeout(2000);
      }
    }
  }

  /**
   * Stop the game loop
   */
  stop() {
    this.isRunning = false;
    this.log('Stopping game loop');
  }

  /**
   * Check if it's this bot's turn
   */
  async isMyTurn() {
    return await this.page.evaluate(() => {
      // Check for action buttons being visible and enabled
      const actionButtons = document.querySelectorAll('button.fold, button.check, button.call, button.raise');
      if (actionButtons.length === 0) return false;
      
      // Check if we're the active player
      const youPlayer = document.querySelector('.you-player');
      if (!youPlayer) return false;
      
      // Check for action signal/timer on our player
      const actionSignal = youPlayer.querySelector('.action-signal, .turn-timer');
      return actionSignal !== null || actionButtons.length > 0;
    });
  }

  /**
   * Play a single turn
   */
  async playTurn() {
    this.log('Our turn - analyzing...');
    
    // Parse game state
    const gameState = await this.parseGameState();
    
    if (!gameState.holeCards || gameState.holeCards.length === 0) {
      this.log('No hole cards detected, waiting...');
      return;
    }
    
    // Get recommendation from Play Advisor
    const recommendation = await this.getRecommendation(gameState);
    
    // Track low confidence / default actions
    if (recommendation.isDefault) {
      this.defaultFolds++;
      this.log(`DEFAULT FOLD - No guidance for this situation`);
    } else if (recommendation.confidence < 0.6) {
      this.lowConfidenceActions++;
      this.log(`Low confidence action: ${recommendation.confidence}`);
    }
    
    // Execute the action
    const result = await this.executeAction(recommendation, gameState);
    
    // Record hand
    this.recordHand(gameState, recommendation, result);
    
    this.log(`Action: ${recommendation.action} (confidence: ${recommendation.confidence})`);
  }

  /**
   * Parse current game state from DOM
   */
  async parseGameState() {
    return await this.page.evaluate(() => {
      const state = {
        holeCards: [],
        board: [],
        potSize: 0,
        toCall: 0,
        stackSize: 0,
        position: 'unknown',
        playersInHand: 0,
        street: 'preflop',
        availableActions: []
      };

      // Parse hole cards
      const myCards = document.querySelectorAll('.you-player .card');
      myCards.forEach(card => {
        const parsed = parseCard(card);
        if (parsed) state.holeCards.push(parsed);
      });

      // Parse board cards
      const boardCards = document.querySelectorAll('.table-cards .card');
      boardCards.forEach(card => {
        const parsed = parseCard(card);
        if (parsed) state.board.push(parsed);
      });

      // Determine street
      if (state.board.length === 0) state.street = 'preflop';
      else if (state.board.length === 3) state.street = 'flop';
      else if (state.board.length === 4) state.street = 'turn';
      else if (state.board.length === 5) state.street = 'river';

      // Parse pot
      const potEl = document.querySelector('.table-pot-size .chips-value');
      if (potEl) state.potSize = parseFloat(potEl.textContent.replace(/[^0-9.]/g, '')) || 0;

      // Parse stack
      const stackEl = document.querySelector('.you-player .table-player-stack .chips-value');
      if (stackEl) state.stackSize = parseFloat(stackEl.textContent.replace(/[^0-9.]/g, '')) || 0;

      // Parse to call from call button
      const callBtn = document.querySelector('button.call');
      if (callBtn) {
        const match = callBtn.textContent.match(/[\d,]+/);
        if (match) state.toCall = parseFloat(match[0].replace(/,/g, '')) || 0;
      }

      // Count active players
      const players = document.querySelectorAll('.table-player:not(.folded)');
      state.playersInHand = players.length;

      // Parse available actions
      if (document.querySelector('button.fold')) state.availableActions.push('fold');
      if (document.querySelector('button.check')) state.availableActions.push('check');
      if (document.querySelector('button.call')) state.availableActions.push('call');
      if (document.querySelector('button.raise')) state.availableActions.push('raise');

      return state;

      // Helper to parse card element
      function parseCard(el) {
        if (!el) return null;
        const valueEl = el.querySelector('.value');
        const suitEl = el.querySelector('.suit');
        if (valueEl && suitEl) {
          let rank = valueEl.textContent.trim().toUpperCase();
          if (rank === '10') rank = 'T';
          let suit = suitEl.textContent.trim().toLowerCase();
          if (suit === '♠' || suit.includes('spade')) suit = 's';
          if (suit === '♥' || suit.includes('heart')) suit = 'h';
          if (suit === '♦' || suit.includes('diamond')) suit = 'd';
          if (suit === '♣' || suit.includes('club')) suit = 'c';
          return rank + suit;
        }
        return null;
      }
    });
  }

  /**
   * Get recommendation from Play Advisor API
   */
  async getRecommendation(gameState) {
    // Handle preflop separately - API requires board cards
    if (gameState.street === 'preflop' || gameState.board.length < 3) {
      return this.getPreflopRecommendation(gameState);
    }

    // Build request for postflop
    const request = {
      gameVariant: gameState.holeCards.length === 4 ? 'omaha4' :
                   gameState.holeCards.length === 5 ? 'omaha5' : 'omaha6',
      street: gameState.street,
      holeCards: gameState.holeCards,
      board: gameState.board,
      position: gameState.position,
      playersInHand: gameState.playersInHand,
      potSize: gameState.potSize,
      toCall: gameState.toCall,
      stackSize: gameState.stackSize,
      villainActions: []
    };

    try {
      const response = await fetch(ADVISOR_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        action: data.recommendation?.action || 'fold',
        confidence: parseFloat(data.recommendation?.confidence) / 100 || 0,
        sizing: data.recommendation?.sizing || null,
        reasoning: data.recommendation?.reasoning || {},
        isDefault: false
      };

    } catch (error) {
      this.log(`Advisor API error: ${error.message}`);

      // Default: check if possible, else fold
      const canCheck = gameState.availableActions.includes('check');
      return {
        action: canCheck ? 'check' : 'fold',
        confidence: 0,
        sizing: null,
        reasoning: { primary: 'API error - using safe default' },
        isDefault: true
      };
    }
  }

  /**
   * Simple preflop recommendations based on style
   * (Play Advisor API requires board cards, so preflop uses simple rules)
   */
  getPreflopRecommendation(gameState) {
    const { availableActions, toCall, potSize, stackSize, holeCards } = gameState;
    const canCheck = availableActions.includes('check');
    const canCall = availableActions.includes('call');

    // Get VPIP threshold based on style
    const vpipThresholds = {
      rock: 0.20,   // Play 20% of hands
      tag: 0.30,    // Play 30% of hands
      lag: 0.45     // Play 45% of hands
    };
    const threshold = vpipThresholds[this.style] || 0.30;

    // Simple hand strength estimate (higher = better starting hand)
    const handStrength = this.estimatePreflopStrength(holeCards);

    // Decide based on hand strength vs style threshold
    if (handStrength >= threshold) {
      // Good enough hand to play
      if (canCheck) {
        return { action: 'check', confidence: 0.7, isDefault: false,
                 reasoning: { primary: 'Preflop - checking with playable hand' } };
      } else if (canCall && toCall <= stackSize * 0.05) {
        // Call if it's less than 5% of stack
        return { action: 'call', confidence: 0.6, isDefault: false,
                 reasoning: { primary: 'Preflop - calling with playable hand' } };
      } else if (handStrength >= 0.8) {
        // Very strong hand - call even larger
        return { action: 'call', confidence: 0.7, isDefault: false,
                 reasoning: { primary: 'Preflop - calling with premium hand' } };
      }
    }

    // Default fold for preflop when hand doesn't meet threshold
    if (canCheck) {
      return { action: 'check', confidence: 0.5, isDefault: false,
               reasoning: { primary: 'Preflop - checking (free)' } };
    }

    // Track this as a "default fold" since we're not using real advisor
    return {
      action: 'fold',
      confidence: 0.4,
      isDefault: true,
      reasoning: { primary: 'Preflop fold - hand below threshold' }
    };
  }

  /**
   * Estimate preflop hand strength (0-1 scale)
   * Very simple heuristic for Omaha hands
   */
  estimatePreflopStrength(cards) {
    if (!cards || cards.length < 4) return 0.3;

    let score = 0;
    const ranks = cards.map(c => c[0].toUpperCase());
    const suits = cards.map(c => c[1]?.toLowerCase() || '?');

    // High cards
    const highCards = ['A', 'K', 'Q', 'J', 'T'];
    for (const r of ranks) {
      if (r === 'A') score += 0.15;
      else if (r === 'K') score += 0.12;
      else if (r === 'Q') score += 0.08;
      else if (r === 'J') score += 0.05;
      else if (r === 'T') score += 0.03;
    }

    // Pairs
    const rankCounts = {};
    for (const r of ranks) {
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    }
    for (const count of Object.values(rankCounts)) {
      if (count >= 2) score += 0.10;
    }

    // Suited cards (flush potential)
    const suitCounts = {};
    for (const s of suits) {
      suitCounts[s] = (suitCounts[s] || 0) + 1;
    }
    for (const count of Object.values(suitCounts)) {
      if (count >= 2) score += 0.05;
      if (count >= 3) score += 0.08;
    }

    // Connectedness (rundowns)
    const rankValues = ranks.map(r =>
      r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 :
      r === 'J' ? 11 : r === 'T' ? 10 : parseInt(r) || 0
    ).sort((a, b) => b - a);

    const gaps = [];
    for (let i = 1; i < rankValues.length; i++) {
      gaps.push(rankValues[i-1] - rankValues[i]);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avgGap <= 1.5) score += 0.10; // Connected
    if (avgGap <= 2.5) score += 0.05; // Somewhat connected

    return Math.min(1, score);
  }

  /**
   * Execute an action
   */
  async executeAction(recommendation, gameState) {
    const { action, sizing } = recommendation;
    
    try {
      switch (action) {
        case 'fold':
          await this.clickAction('fold');
          break;
          
        case 'check':
          await this.clickAction('check');
          break;
          
        case 'call':
          await this.clickAction('call');
          break;
          
        case 'bet':
        case 'raise':
          // Try to set amount if sizing provided
          if (sizing?.optimal) {
            await this.setBetAmount(sizing.optimal);
          }
          await this.clickAction(action);
          break;
          
        default:
          this.log(`Unknown action: ${action}, folding`);
          await this.clickAction('fold');
      }
      
      return { success: true, action };
      
    } catch (error) {
      this.log(`Failed to execute ${action}: ${error.message}`);
      
      // Try fold as fallback
      try {
        await this.clickAction('fold');
        return { success: true, action: 'fold', fallback: true };
      } catch (e) {
        return { success: false, action, error: error.message };
      }
    }
  }

  /**
   * Click an action button
   */
  async clickAction(action) {
    // Try class-based selector first
    const classSelector = `button.${action}`;
    let btn = await this.page.$(classSelector);
    
    if (btn) {
      await btn.click({ force: true });
      return;
    }
    
    // Try text-based selector
    const textSelector = `button:has-text("${action.toUpperCase()}")`;
    btn = await this.page.$(textSelector);
    
    if (btn) {
      await btn.click({ force: true });
      return;
    }
    
    throw new Error(`Button not found: ${action}`);
  }

  /**
   * Set bet/raise amount
   */
  async setBetAmount(amount) {
    const input = await this.page.$('input[type="number"], input.bet-input, input.raise-input');
    if (input) {
      await input.fill(String(Math.round(amount)));
    }
  }

  /**
   * Record a hand for tracking
   */
  recordHand(gameState, recommendation, result) {
    const hand = {
      timestamp: Date.now(),
      handNumber: ++this.handsPlayed,
      street: gameState.street,
      holeCards: gameState.holeCards,
      board: gameState.board,
      potSize: gameState.potSize,
      action: recommendation.action,
      confidence: recommendation.confidence,
      isDefault: recommendation.isDefault,
      success: result.success
    };
    
    this.handHistory.push(hand);
    
    // Update stack tracking
    this.currentStack = gameState.stackSize;
  }

  /**
   * Get current statistics
   */
  getStats() {
    const profit = this.currentStack - this.startingStack;
    const bb = 20; // Assume 10/20 blinds
    const bb100 = this.handsPlayed > 0 ? (profit / bb) / (this.handsPlayed / 100) : 0;
    
    return {
      botName: this.botName,
      style: this.style,
      handsPlayed: this.handsPlayed,
      startingStack: this.startingStack,
      currentStack: this.currentStack,
      profit: profit,
      bb100: bb100.toFixed(2),
      defaultFolds: this.defaultFolds,
      lowConfidenceActions: this.lowConfidenceActions,
      defaultFoldRate: this.handsPlayed > 0 ? 
        ((this.defaultFolds / this.handsPlayed) * 100).toFixed(1) + '%' : '0%'
    };
  }

  /**
   * Export hand history to JSON
   */
  exportHistory() {
    return {
      bot: this.botName,
      style: this.style,
      stats: this.getStats(),
      hands: this.handHistory
    };
  }
}

export default BotGameLoop;
