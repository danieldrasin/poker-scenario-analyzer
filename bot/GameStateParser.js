/**
 * Game State Parser
 *
 * Extracts game state from PokerNow DOM and converts to Play Advisor format
 */

import { config } from './config.js';

export class GameStateParser {
  constructor(browserController) {
    this.browser = browserController;
  }

  /**
   * Parse full game state from current page
   * @returns {Object} Game state in Play Advisor format
   */
  async parseGameState() {
    const state = await this.browser.evaluate(() => {
      const result = {
        holeCards: [],
        board: [],
        potSize: 0,
        toCall: 0,
        stackSize: 0,
        position: 'unknown',
        playersInHand: 0,
        villainActions: [],
        dealerSeat: -1,
        mySeat: -1,
        players: [],
        street: 'preflop',
        gameVariant: 'omaha4',
        availableActions: []
      };

      // ============================================================
      // HOLE CARDS (verified selector from pokernow-bot)
      // ============================================================
      const myCards = document.querySelectorAll('.you-player .card');
      myCards.forEach(card => {
        const cardValue = parseCard(card);
        if (cardValue) result.holeCards.push(cardValue);
      });

      // Detect game variant from hole card count
      if (result.holeCards.length === 5) {
        result.gameVariant = 'omaha5';
      } else if (result.holeCards.length === 6) {
        result.gameVariant = 'omaha6';
      } else if (result.holeCards.length === 2) {
        result.gameVariant = 'holdem'; // Not fully supported yet
      }

      // ============================================================
      // BOARD CARDS (verified selector from pokernow-bot)
      // ============================================================
      const boardCards = document.querySelectorAll('.table-cards .card');
      boardCards.forEach(card => {
        const cardValue = parseCard(card);
        if (cardValue) result.board.push(cardValue);
      });

      // Determine street from board card count
      if (result.board.length === 0) {
        result.street = 'preflop';
      } else if (result.board.length === 3) {
        result.street = 'flop';
      } else if (result.board.length === 4) {
        result.street = 'turn';
      } else if (result.board.length === 5) {
        result.street = 'river';
      }

      // ============================================================
      // POT SIZE (verified selectors from pokernow-bot)
      // ============================================================
      // Current pot (add-on shows current street contributions)
      const potAddOn = document.querySelector('.table-pot-size .add-on .chips-value');
      // Main pot (from previous streets)
      const potMain = document.querySelector('.table-pot-size .main-value .chips-value');

      let totalPot = 0;
      if (potMain) totalPot += parseChipValue(potMain.textContent);
      if (potAddOn) totalPot += parseChipValue(potAddOn.textContent);

      // Fallback to simpler selector
      if (totalPot === 0) {
        const potElement = document.querySelector('.table-pot-size');
        if (potElement) totalPot = parseChipValue(potElement.textContent);
      }
      result.potSize = totalPot;

      // ============================================================
      // PLAYERS AND POSITIONS (verified selectors from pokernow-bot/HUD)
      // ============================================================
      const playerElements = document.querySelectorAll('.table-player:not(.table-player-seat)');
      playerElements.forEach((player, index) => {
        // Check if this is us (verified: .you-player class on the player element)
        const isMe = player.classList.contains('you-player');

        // Dealer button (verified: .dealer-button-ctn inside player area)
        const isDealer = player.querySelector('.dealer-button-ctn') !== null;

        // Folded state
        const isFolded = player.classList.contains('folded');

        // Stack size (verified: .table-player-stack contains the chips)
        const stackEl = player.querySelector('.table-player-stack .chips-value');

        // Player name (verified: .table-player-name)
        const nameEl = player.querySelector('.table-player-name');

        // Current bet (look for bet display near player)
        const betEl = player.querySelector('.table-player-bet .chips-value');

        // Is it this player's turn? (verified: .action-signal)
        const hasActionSignal = player.querySelector('.action-signal') !== null;

        const playerInfo = {
          seat: index,
          name: nameEl ? nameEl.textContent.trim() : `Player${index}`,
          stack: stackEl ? parseChipValue(stackEl.textContent) : 0,
          currentBet: betEl ? parseChipValue(betEl.textContent) : 0,
          isMe: isMe,
          isDealer: isDealer,
          isFolded: isFolded,
          isActive: !isFolded && hasActionSignal
        };

        result.players.push(playerInfo);

        if (isMe) {
          result.mySeat = index;
          result.stackSize = playerInfo.stack;
        }

        if (isDealer) {
          result.dealerSeat = index;
        }
      });

      // Count active players
      result.playersInHand = result.players.filter(p => !p.isFolded).length;

      // ============================================================
      // TO CALL AMOUNT
      // ============================================================
      // Try to find from call button
      const callButton = document.querySelector('[data-action="call"], .call-button, button:contains("Call")');
      if (callButton) {
        const callText = callButton.textContent;
        const match = callText.match(/[\d,]+/);
        if (match) {
          result.toCall = parseChipValue(match[0]);
        }
      }

      // Or calculate from max bet - my bet
      if (result.toCall === 0) {
        const maxBet = Math.max(...result.players.map(p => p.currentBet));
        const myBet = result.players.find(p => p.isMe)?.currentBet || 0;
        result.toCall = maxBet - myBet;
      }

      // ============================================================
      // POSITION CALCULATION
      // ============================================================
      result.position = calculatePosition(
        result.mySeat,
        result.dealerSeat,
        result.players.filter(p => !p.isFolded).length
      );

      // ============================================================
      // AVAILABLE ACTIONS (verified selectors from pokernow-bot)
      // ============================================================
      // Check for specific button classes (verified from pokernow-bot)
      if (document.querySelector('button.fold')) result.availableActions.push('fold');
      if (document.querySelector('button.check')) result.availableActions.push('check');
      if (document.querySelector('button.call')) result.availableActions.push('call');
      if (document.querySelector('button.raise')) result.availableActions.push('raise');

      // Also check for bet (may show instead of raise preflop)
      const allButtons = document.querySelectorAll('button');
      allButtons.forEach(btn => {
        const text = btn.textContent.toLowerCase().trim();
        if (text === 'bet' && !result.availableActions.includes('bet')) {
          result.availableActions.push('bet');
        }
        if ((text.includes('all-in') || text.includes('all in')) &&
            !result.availableActions.includes('allin')) {
          result.availableActions.push('allin');
        }
      });

      return result;

      // ============================================================
      // HELPER FUNCTIONS (in page context)
      // ============================================================

      function parseCard(cardElement) {
        if (!cardElement) return null;

        // Pattern 1: PokerNow verified format - .value and .suit children (from pokernow-bot)
        const valueEl = cardElement.querySelector('.value');
        const suitEl = cardElement.querySelector('.suit');
        if (valueEl && suitEl) {
          let rank = valueEl.textContent.trim().toUpperCase();
          if (rank === '10') rank = 'T';
          let suit = suitEl.textContent.trim().toLowerCase();
          // Convert suit symbols to letters
          if (suit === '♠' || suit.includes('spade')) suit = 's';
          if (suit === '♥' || suit.includes('heart')) suit = 'h';
          if (suit === '♦' || suit.includes('diamond')) suit = 'd';
          if (suit === '♣' || suit.includes('club')) suit = 'c';
          if ('shdc'.includes(suit) && 'AKQJT98765432'.includes(rank)) {
            return rank + suit;
          }
        }

        // Pattern 2: Class-based (e.g., "card-As", "card-Kh")
        const classList = cardElement.className;
        const classMatch = classList.match(/card-([AKQJT2-9])([shdc])/i);
        if (classMatch) {
          return classMatch[1].toUpperCase() + classMatch[2].toLowerCase();
        }

        // Pattern 3: Data attribute
        const dataCard = cardElement.dataset.card || cardElement.dataset.value;
        if (dataCard) {
          return normalizeCard(dataCard);
        }

        // Pattern 4: Text content with rank and suit symbols
        const text = cardElement.textContent.trim();
        const textMatch = text.match(/([AKQJT2-9]|10)([♠♥♦♣shdc])/i);
        if (textMatch) {
          let rank = textMatch[1].toUpperCase();
          if (rank === '10') rank = 'T';
          let suit = textMatch[2].toLowerCase();
          if (suit === '♠') suit = 's';
          if (suit === '♥') suit = 'h';
          if (suit === '♦') suit = 'd';
          if (suit === '♣') suit = 'c';
          return rank + suit;
        }

        return null;
      }

      function normalizeCard(cardStr) {
        if (!cardStr || cardStr.length < 2) return null;
        let rank = cardStr[0].toUpperCase();
        if (cardStr.startsWith('10')) {
          rank = 'T';
          cardStr = 'T' + cardStr.slice(2);
        }
        let suit = cardStr[cardStr.length - 1].toLowerCase();
        if (suit === '♠') suit = 's';
        if (suit === '♥') suit = 'h';
        if (suit === '♦') suit = 'd';
        if (suit === '♣') suit = 'c';
        if (!'shdc'.includes(suit)) return null;
        if (!'AKQJT98765432'.includes(rank)) return null;
        return rank + suit;
      }

      function parseChipValue(text) {
        if (!text) return 0;
        // Remove currency symbols, commas, spaces
        const cleaned = text.replace(/[$,\s]/g, '').trim();
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
      }

      function calculatePosition(mySeat, dealerSeat, activePlayers) {
        if (mySeat < 0 || dealerSeat < 0) return 'unknown';

        // Simplified position calculation
        // In a 6-max game: BTN, SB, BB, UTG, MP, CO
        const positions = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'];
        const offset = (mySeat - dealerSeat + 10) % 10; // Assuming max 10 seats

        if (activePlayers <= 2) {
          return offset === 0 ? 'BTN' : 'BB';
        }

        if (activePlayers <= 6) {
          const posIndex = Math.min(offset, positions.length - 1);
          return positions[posIndex] || 'MP';
        }

        // For larger tables
        if (offset === 0) return 'BTN';
        if (offset === 1) return 'SB';
        if (offset === 2) return 'BB';
        if (offset === activePlayers - 1) return 'CO';
        if (offset <= 4) return 'EP';
        return 'MP';
      }
    });

    // Post-process the state
    return this.validateAndEnrich(state);
  }

  /**
   * Validate and enrich parsed state
   */
  validateAndEnrich(state) {
    // Ensure we have hole cards
    if (!state.holeCards || state.holeCards.length === 0) {
      console.warn('No hole cards detected');
    }

    // Ensure minimum required fields
    const enriched = {
      gameVariant: state.gameVariant || 'omaha4',
      street: state.street || 'preflop',
      holeCards: state.holeCards || [],
      board: state.board || [],
      position: state.position || 'MP',
      playersInHand: state.playersInHand || 2,
      potSize: state.potSize || 0,
      toCall: state.toCall || 0,
      stackSize: state.stackSize || 0,
      villainActions: state.villainActions || [],
      // Internal tracking (not sent to advisor)
      _raw: {
        availableActions: state.availableActions || [],
        players: state.players || [],
        mySeat: state.mySeat,
        dealerSeat: state.dealerSeat
      }
    };

    // Log parsed state if verbose
    if (config.behavior.logGameState) {
      console.log('Parsed game state:', JSON.stringify(enriched, null, 2));
    }

    return enriched;
  }

  /**
   * Get villain actions from game log (if available)
   */
  async parseVillainActions() {
    return await this.browser.evaluate(() => {
      const actions = [];
      const logEntries = document.querySelectorAll('.game-log-entry, .action-log-entry');

      logEntries.forEach(entry => {
        const text = entry.textContent.toLowerCase();
        if (text.includes('raise')) actions.push('raise');
        else if (text.includes('bet')) actions.push('bet');
        else if (text.includes('call')) actions.push('call');
        else if (text.includes('check')) actions.push('check');
        // Don't track folds as villain actions
      });

      // Return last few actions (current betting round)
      return actions.slice(-5);
    }) || [];
  }

  /**
   * Check if hand is over
   */
  async isHandOver() {
    return await this.browser.evaluate(() => {
      // Check for winner display
      const winner = document.querySelector('.winner-display, .showdown-winner, .hand-winner');
      if (winner) return true;

      // Check for "new hand" button
      const newHandBtn = document.querySelector('.new-hand-button, .start-new-hand');
      if (newHandBtn) return true;

      return false;
    });
  }

  /**
   * Get winner info (for tracking)
   */
  async getWinnerInfo() {
    return await this.browser.evaluate(() => {
      const winnerEl = document.querySelector('.winner-display, .showdown-winner');
      if (!winnerEl) return null;

      return {
        name: winnerEl.querySelector('.winner-name, .player-name')?.textContent || 'Unknown',
        amount: parseFloat(winnerEl.textContent.replace(/[^0-9.]/g, '')) || 0
      };
    });
  }
}

export default GameStateParser;
