/**
 * PokerNow Play Advisor — Content Script
 *
 * Runs directly in the PokerNow.club page context.
 * Two modes:
 *   A1 (Auto-pilot): Reads game state → calls API → clicks buttons
 *   A2 (Advisory):   Reads game state → calls API → shows overlay panel
 *
 * Adapted from bot/GameStateParser.js and bot/ActionExecutor.js
 * DOM selectors verified from pokernow-bot reference implementations.
 */

// ============================================================
// 1. CONFIGURATION & STATE
// ============================================================

const DEFAULT_CONFIG = {
  mode: 'off',                    // 'off' | 'a1' | 'a2'
  heroStyle: 'tag',
  apiUrl: 'https://poker-simulator-gamma.vercel.app/api/advise',
  logHands: true
};

let CONFIG = { ...DEFAULT_CONFIG };

let extensionState = {
  isMyTurn: false,
  turnProcessing: false,          // Prevent double-processing
  currentGameState: null,
  currentRecommendation: null,
  overlayVisible: false,
  handsPlayed: 0,
  initialized: false,
  queuedAction: null              // Stored accept for when turn arrives
};

// Preflop hand quality thresholds by style for PLO
// PLO is much looser than hold'em — even TAGs play ~40% of hands
const PREFLOP_THRESHOLDS = {
  nit:  { playProb: 0.30, raiseProb: 0.70 },
  rock: { playProb: 0.35, raiseProb: 0.45 },
  reg:  { playProb: 0.40, raiseProb: 0.75 },
  tag:  { playProb: 0.45, raiseProb: 0.82 },
  lag:  { playProb: 0.55, raiseProb: 0.70 },
  fish: { playProb: 0.70, raiseProb: 0.25 }
};

// ============================================================
// 2. UTILITY FUNCTIONS
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function humanDelay() {
  return sleep(800 + Math.random() * 1700);
}

function log(...args) {
  console.log('[PlayAdvisor]', ...args);
}

function warn(...args) {
  console.warn('[PlayAdvisor]', ...args);
}

function err(...args) {
  console.error('[PlayAdvisor]', ...args);
}

function parseChipValue(text) {
  if (!text) return 0;
  const cleaned = text.replace(/[$,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ============================================================
// 3. CARD PARSING (from GameStateParser.js)
// ============================================================

/**
 * Parse a card DOM element into string notation (e.g., "As", "Kh")
 * Supports 4 parsing patterns for resilience.
 */
function parseCard(cardElement) {
  if (!cardElement) return null;

  // Pattern 1 (PokerNow verified): CSS classes on .card-container
  // e.g. "card-container card-d card-s-2 flipped card-p1 med sub-suit small"
  // Suit: card-{d|h|c|s}  Rank: card-s-{rank}
  const classes = cardElement.className || '';
  const suitMatch = classes.match(/\bcard-([dhcs])\b/);
  const rankMatch = classes.match(/\bcard-s-(\w+)\b/);
  if (suitMatch && rankMatch) {
    let rank = rankMatch[1].toUpperCase();
    if (rank === '10') rank = 'T';
    const suit = suitMatch[1];
    if ('AKQJT98765432'.includes(rank) && 'dhcs'.includes(suit)) {
      return rank + suit;
    }
  }

  // Pattern 2: Child elements (.value + .suit) — fallback
  const valueEl = cardElement.querySelector('.value');
  const suitEl = cardElement.querySelector('.suit');
  if (valueEl && suitEl) {
    let rank = valueEl.textContent.trim().toUpperCase();
    if (rank === '10') rank = 'T';
    let suit = normalizeSuit(suitEl.textContent.trim());
    if (suit && 'AKQJT98765432'.includes(rank)) {
      return rank + suit;
    }
  }

  // Pattern 3: Data attribute
  const dataCard = cardElement.dataset.card || cardElement.dataset.value;
  if (dataCard) return normalizeCard(dataCard);

  return null;
}

function normalizeSuit(s) {
  if (!s) return null;
  s = s.toLowerCase().trim();
  if (s === '♠' || s === 'spade' || s === 'spades' || s === 's') return 's';
  if (s === '♥' || s === 'heart' || s === 'hearts' || s === 'h') return 'h';
  if (s === '♦' || s === 'diamond' || s === 'diamonds' || s === 'd') return 'd';
  if (s === '♣' || s === 'club' || s === 'clubs' || s === 'c') return 'c';
  return null;
}

function normalizeCard(cardStr) {
  if (!cardStr || cardStr.length < 2) return null;
  let rank = cardStr[0].toUpperCase();
  if (cardStr.startsWith('10')) {
    rank = 'T';
    cardStr = 'T' + cardStr.slice(2);
  }
  let suit = normalizeSuit(cardStr[cardStr.length - 1]);
  if (!suit) return null;
  if (!'AKQJT98765432'.includes(rank)) return null;
  return rank + suit;
}

// ============================================================
// 4. GAME STATE PARSER (from GameStateParser.js)
// ============================================================

/**
 * Parse the full game state from the PokerNow DOM.
 * Returns an object ready for the Play Advisor API.
 */
function parseGameState() {
  const result = {
    holeCards: [],
    board: [],
    potSize: 0,
    toCall: 0,
    stackSize: 0,
    position: 'unknown',
    playersInHand: 0,
    street: 'preflop',
    gameVariant: 'omaha4',
    availableActions: []
  };

  // --- Hole Cards ---
  // PokerNow uses .card-container inside .you-player, with .flipped for face-up cards
  const myCards = document.querySelectorAll('.you-player .card-container.flipped');
  myCards.forEach(card => {
    const cardValue = parseCard(card);
    if (cardValue) result.holeCards.push(cardValue);
  });
  // Fallback: try without .flipped filter
  if (result.holeCards.length === 0) {
    document.querySelectorAll('.you-player .card-container').forEach(card => {
      const cardValue = parseCard(card);
      if (cardValue) result.holeCards.push(cardValue);
    });
  }

  // Detect variant from hole card count
  if (result.holeCards.length === 5) result.gameVariant = 'omaha5';
  else if (result.holeCards.length === 6) result.gameVariant = 'omaha6';
  else if (result.holeCards.length === 2) result.gameVariant = 'holdem';

  // --- Board Cards ---
  const boardCards = document.querySelectorAll('.table-cards .card-container.flipped');
  boardCards.forEach(card => {
    const cardValue = parseCard(card);
    if (cardValue) result.board.push(cardValue);
  });

  // Determine street
  if (result.board.length === 0) result.street = 'preflop';
  else if (result.board.length === 3) result.street = 'flop';
  else if (result.board.length === 4) result.street = 'turn';
  else if (result.board.length === 5) result.street = 'river';

  // --- Pot Size ---
  result.potSize = parsePotSize();

  // --- Stack Size ---
  result.stackSize = parseMyStack();

  // --- To Call ---
  result.toCall = parseToCall();

  // --- Players & Position ---
  const playerInfo = parsePlayerInfo();
  result.position = playerInfo.position;
  result.playersInHand = playerInfo.playersInHand;

  // --- Available Actions ---
  result.availableActions = getAvailableActions();

  return result;
}

function parsePotSize() {
  // PokerNow: .table-pot-size contains "0total 7" or similar text
  // Try .chips-value inside pot area first
  const chipsEls = document.querySelectorAll('.table-pot-size .chips-value');
  if (chipsEls.length > 0) {
    let total = 0;
    chipsEls.forEach(el => { total += parseChipValue(el.textContent); });
    if (total > 0) return total;
  }

  // Fallback: extract all numbers from the pot text
  const potElement = document.querySelector('.table-pot-size');
  if (potElement) {
    const text = potElement.textContent.replace(/total/gi, ' ');
    const nums = text.match(/[\d,.]+/g);
    if (nums) {
      // Sum all numbers found (main pot + side pots)
      return nums.reduce((sum, n) => sum + parseChipValue(n), 0);
    }
  }
  return 0;
}

function parseMyStack() {
  // PokerNow: .you-player .table-player-stack contains the stack number
  const stackEl = document.querySelector('.you-player .table-player-stack');
  if (stackEl) return parseChipValue(stackEl.textContent);

  // Fallback: .chips-value inside you-player
  const chipsEl = document.querySelector('.you-player .chips-value');
  if (chipsEl) return parseChipValue(chipsEl.textContent);

  return 0;
}

function parseToCall() {
  // PokerNow: action buttons have classes like .action-button.call
  // Button text: "Call 2" → extract the number
  const callBtn = document.querySelector('.action-button.call');
  if (callBtn) {
    const match = callBtn.textContent.match(/[\d,.]+/);
    if (match) return parseChipValue(match[0]);
  }

  // Fallback: any button with "call" in text
  const allBtns = document.querySelectorAll('.action-buttons button');
  for (const btn of allBtns) {
    const text = btn.textContent.toLowerCase();
    if (text.includes('call')) {
      const match = btn.textContent.match(/[\d,.]+/);
      if (match) return parseChipValue(match[0]);
    }
  }

  // If check is available, toCall is 0
  if (document.querySelector('.action-button.check')) return 0;

  return 0;
}

function parsePlayerInfo() {
  // PokerNow: players are .table-player.table-player-{N}
  // Folded players have .fold class, offline have 'offline' in class
  // Dealer: .dealer-button-ctn.dealer-position-{N}
  // My seat: .you-player.table-player-{N}

  const playerElements = document.querySelectorAll('.table-player');
  let playersInHand = 0;
  let totalSeated = 0;

  playerElements.forEach(player => {
    // Skip empty seats (no name/link)
    if (!player.querySelector('a')) return;
    totalSeated++;
    // Count players NOT folded
    if (!player.classList.contains('fold')) {
      playersInHand++;
    }
  });

  // Get dealer and my seat numbers from class names
  const dealerEl = document.querySelector('.dealer-button-ctn');
  const dealerSeat = dealerEl?.className?.match(/dealer-position-(\d+)/)?.[1];
  const mySeat = document.querySelector('.you-player')?.className?.match(/table-player-(\d+)/)?.[1];

  const position = calculatePosition(
    parseInt(mySeat) || -1,
    parseInt(dealerSeat) || -1,
    totalSeated,
    playersInHand
  );

  return { position, playersInHand: Math.max(playersInHand, 2) };
}

function calculatePosition(mySeat, dealerSeat, totalPlayers, activePlayers) {
  if (mySeat < 0 || dealerSeat < 0) return 'unknown';

  // Seats are numbered 1-10, calculate offset from dealer
  const offset = ((mySeat - dealerSeat) + totalPlayers) % totalPlayers;

  if (offset === 0) return 'BTN';
  if (offset === 1) return 'SB';
  if (offset === 2) return 'BB';

  if (activePlayers <= 3) {
    return offset === 0 ? 'BTN' : offset === 1 ? 'SB' : 'BB';
  }

  // For more players, calculate relative position
  if (offset === activePlayers - 1) return 'CO';
  if (offset === activePlayers - 2) return 'HJ';
  if (offset <= 4) return 'EP';
  return 'MP';
}

function getAvailableActions() {
  // PokerNow: .action-button.fold, .action-button.check, .action-button.call, .action-button.raise
  const actions = [];
  if (document.querySelector('.action-button.fold')) actions.push('fold');
  if (document.querySelector('.action-button.check')) actions.push('check');
  if (document.querySelector('.action-button.call')) actions.push('call');
  if (document.querySelector('.action-button.raise')) actions.push('raise');

  // Also check for bet/all-in by button text
  document.querySelectorAll('.action-buttons button').forEach(btn => {
    const text = btn.textContent.toLowerCase().trim();
    if (text.includes('bet') && !actions.includes('bet')) actions.push('bet');
    if ((text.includes('all-in') || text.includes('all in')) && !actions.includes('allin')) actions.push('allin');
  });

  return actions;
}

// ============================================================
// 5. PREFLOP DECISION (local — API requires board cards)
// ============================================================

/**
 * Simple preflop decision based on hand quality and style.
 * The Play Advisor API needs >= 3 board cards, so preflop
 * decisions are made locally using a basic hand scoring approach.
 */
function makePreflopDecision(gameState) {
  const style = PREFLOP_THRESHOLDS[CONFIG.heroStyle] || PREFLOP_THRESHOLDS.reg;
  const cards = gameState.holeCards;

  if (cards.length < 4) {
    return { action: 'fold', confidence: 0.5, reasoning: { primary: 'Could not read cards' } };
  }

  // Simple PLO hand quality score (0-100)
  const score = scorePLOHand(cards);
  const threshold = 100 - (style.playProb * 100); // Higher playProb = lower threshold

  if (score < threshold) {
    return {
      action: 'fold',
      confidence: 0.7,
      reasoning: {
        primary: `Hand quality ${score.toFixed(0)} below ${CONFIG.heroStyle.toUpperCase()} threshold (${threshold.toFixed(0)}).`,
        strategic: 'Preflop fold — saving chips for better spots.'
      }
    };
  }

  // Should we raise or call?
  const raiseThreshold = threshold + (1 - style.raiseProb) * 20;
  const toCall = gameState.toCall;

  if (score >= raiseThreshold || (toCall === 0 && Math.random() < style.raiseProb)) {
    return {
      action: toCall > 0 ? 'raise' : 'bet',
      confidence: 0.65,
      sizing: { optimal: Math.max(gameState.potSize * 0.75, toCall * 2.5) },
      reasoning: {
        primary: `Strong hand (${score.toFixed(0)}) — raising for value.`,
        strategic: `${CONFIG.heroStyle.toUpperCase()} preflop aggression.`
      }
    };
  }

  return {
    action: 'call',
    confidence: 0.6,
    reasoning: {
      primary: `Playable hand (${score.toFixed(0)}) — calling to see flop.`,
      strategic: 'Set-mining / drawing potential.'
    }
  };
}

/**
 * Score a PLO hand 0-100 based on PLO-specific factors:
 * - High cards, pairs, suitedness (nut flush draws), connectivity, rundowns
 * PLO hands derive value from suitedness and connectivity more than hold'em.
 */
function scorePLOHand(cards) {
  let score = 0;
  const ranks = cards.map(c => {
    const r = c[0];
    if (r === 'A') return 14;
    if (r === 'K') return 13;
    if (r === 'Q') return 12;
    if (r === 'J') return 11;
    if (r === 'T') return 10;
    return parseInt(r) || 2;
  });
  const suits = cards.map(c => c[1]);

  // --- High card value (max ~25 for AAKK) ---
  const rankSum = ranks.reduce((a, b) => a + b, 0);
  score += (rankSum / (14 * cards.length)) * 25;

  // --- Pairs (set mining value, higher pairs worth more) ---
  const rankCounts = {};
  ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
  const pairs = Object.entries(rankCounts).filter(([_, c]) => c >= 2);
  if (pairs.length > 0) {
    const highPair = Math.max(...pairs.map(([r, _]) => parseInt(r)));
    score += 8 + highPair * 0.7; // ~18 for AA pair, ~12 for 88
    if (pairs.length >= 2) score += 5; // two pair = extra value
  }

  // --- Suitedness (critical in PLO — flush draws are huge) ---
  const suitCounts = {};
  suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
  const suitedPairs = Object.entries(suitCounts).filter(([_, c]) => c >= 2);

  if (suitedPairs.length >= 2) {
    // Double suited — premium in PLO
    score += 20;
  } else if (suitedPairs.length === 1) {
    const suitCount = suitedPairs[0][1];
    if (suitCount >= 3) {
      // Triple suited (3 of same suit) — strong flush draw equity
      score += 15;
    } else {
      // Single suited pair
      score += 10;
    }
  }

  // Nut flush draw bonus (ace-suited)
  const aceIndex = ranks.indexOf(14);
  if (aceIndex !== -1) {
    const aceSuit = suits[aceIndex];
    const aceSuitCount = suits.filter(s => s === aceSuit).length;
    if (aceSuitCount >= 2) score += 8; // Nut flush draw = big PLO equity
  }

  // --- Connectivity (rundowns are PLO gold) ---
  const sortedRanks = [...new Set(ranks)].sort((a, b) => a - b);
  // Also check A-low wraps (A-2-3-4, A-2-3-5)
  let maxRun = 1, run = 1;
  for (let i = 1; i < sortedRanks.length; i++) {
    const gap = sortedRanks[i] - sortedRanks[i-1];
    if (gap <= 2) {
      run++;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 1;
    }
  }
  // Wrap-around check: A can act as 1 for low straights
  if (ranks.includes(14)) {
    const lowRanks = sortedRanks.filter(r => r <= 5);
    if (lowRanks.length >= 2) maxRun = Math.max(maxRun, lowRanks.length + 1);
  }

  // Broadway rundowns (T-J-Q-K-A range) get extra value
  const broadwayCards = ranks.filter(r => r >= 10).length;
  if (maxRun >= 4) score += 20;       // 4-card rundown = premium
  else if (maxRun >= 3) score += 12;   // 3-card connected
  else if (maxRun >= 2) score += 5;    // 2-card connected
  if (broadwayCards >= 3) score += 5;  // Broadway heavy

  // --- Ace bonus ---
  if (ranks.includes(14)) score += 3;

  // --- Danglers penalty (one card disconnected from the rest) ---
  // In PLO, a "dangler" (card that doesn't connect) hurts hand value
  if (cards.length === 4 && maxRun <= 2) {
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    if (maxRank - minRank > 8 && pairs.length === 0) {
      score -= 5; // Wide gap with no pairs = dangler penalty
    }
  }

  // Cap at 100
  return Math.min(100, Math.max(0, score));
}

// ============================================================
// 6. PLAY ADVISOR API CLIENT
// ============================================================

async function getAdvisorRecommendation(gameState) {
  // Preflop: use local decision (API requires board cards)
  if (gameState.street === 'preflop' || gameState.board.length < 3) {
    log('Preflop — using local decision');
    return makePreflopDecision(gameState);
  }

  const request = {
    gameVariant: gameState.gameVariant,
    street: gameState.street,
    holeCards: gameState.holeCards,
    board: gameState.board,
    position: gameState.position,
    playersInHand: gameState.playersInHand,
    potSize: gameState.potSize,
    toCall: gameState.toCall,
    stackSize: gameState.stackSize,
    villainActions: [],
    heroStyle: CONFIG.heroStyle
  };

  try {
    // CONFIG.apiUrl already contains the full path (e.g. .../api/advise)
    log('Calling API:', CONFIG.apiUrl);
    const response = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    const rec = data.recommendation;

    if (!rec) {
      throw new Error('No recommendation in API response');
    }

    return {
      action: rec.action || 'fold',
      confidence: rec.confidence || '0%',
      betType: rec.betType || null,
      sizing: rec.sizing || null,
      reasoning: rec.reasoning || {},
      alternatives: rec.alternatives || [],
      warnings: rec.warnings || [],
      metadata: rec.metadata || {},
      analysis: data.analysis || null
    };
  } catch (error) {
    err('API call failed:', error.message);
    return {
      action: 'fold',
      confidence: '0%',
      reasoning: { primary: `API error: ${error.message}`, strategic: 'Defaulting to fold for safety.' },
      warnings: [`API error: ${error.message}`]
    };
  }
}

// ============================================================
// 7. ACTION EXECUTOR (from ActionExecutor.js)
// ============================================================

function clickButton(selector) {
  try {
    const button = document.querySelector(selector);
    if (!button) return false;
    button.click();
    return true;
  } catch (e) {
    return false;
  }
}

function clickButtonByText(searchText) {
  try {
    const buttons = document.querySelectorAll('button, .action-button, [role="button"]');
    for (const btn of buttons) {
      if (btn.textContent.toLowerCase().includes(searchText.toLowerCase())) {
        btn.click();
        return true;
      }
    }
  } catch (e) {
    // fall through
  }
  return false;
}

async function enterBetAmount(amount) {
  const inputSelectors = [
    '.raise-controller-form input[type="number"]',
    '.raise-controller-form input',
    '.game-action-bar input[type="number"]',
    '.action-buttons input[type="number"]',
    '.action-buttons input[type="text"]',
    'input[type="number"].bet-input',
    'input.bet-amount',
    'input[name="bet"]',
    'input[name="raise"]',
    '.bet-slider-input',
    'input.raise-input'
  ];

  for (const selector of inputSelectors) {
    try {
      const input = document.querySelector(selector);
      if (input) {
        // Clear and set value
        input.focus();
        input.value = '';
        input.value = Math.round(amount).toString();
        // Dispatch events so React/framework picks up the change
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(300);
        return true;
      }
    } catch (e) {
      // try next
    }
  }
  return false;
}

async function executeFold() {
  if (clickButton('.action-button.fold')) { log('Folded'); return { success: true, action: 'fold' }; }
  if (clickButtonByText('fold')) { log('Folded (text)'); return { success: true, action: 'fold' }; }
  err('Fold button not found');
  return { success: false, action: 'fold' };
}

async function executeCheck() {
  if (clickButton('.action-button.check')) { log('Checked'); return { success: true, action: 'check' }; }
  if (clickButtonByText('check')) { log('Checked (text)'); return { success: true, action: 'check' }; }
  err('Check button not found');
  return { success: false, action: 'check' };
}

async function executeCall() {
  if (clickButton('.action-button.call')) { log('Called'); return { success: true, action: 'call' }; }
  if (clickButtonByText('call')) { log('Called (text)'); return { success: true, action: 'call' }; }
  err('Call button not found');
  return { success: false, action: 'call' };
}

async function executeBet(amount, gameState) {
  const actualBet = Math.min(Math.round(amount), gameState.stackSize);
  log(`Betting ${actualBet}`);

  if (await enterBetAmount(actualBet)) {
    await sleep(200);
    if (clickButtonByText('bet') || clickButtonByText('confirm') ||
        clickButton('.raise-controller-form input[type="submit"]')) {
      return { success: true, action: 'bet', amount: actualBet };
    }
  }

  // Fallback: just click bet button (uses whatever default amount)
  if (clickButtonByText('bet')) {
    return { success: true, action: 'bet', amount: 'default' };
  }

  err('Could not execute bet');
  return { success: false, action: 'bet' };
}

async function executeRaise(amount, gameState) {
  const actualRaise = Math.min(Math.round(amount), gameState.stackSize);
  log(`Raising to ${actualRaise}`);

  if (await enterBetAmount(actualRaise)) {
    await sleep(200);
    if (clickButton('.raise-controller-form input[type="submit"]') ||
        clickButton('.action-button.raise') ||
        clickButtonByText('raise') ||
        clickButtonByText('confirm')) {
      return { success: true, action: 'raise', amount: actualRaise };
    }
  }

  // Fallback: just click raise button
  if (clickButton('.action-button.raise') || clickButtonByText('raise')) {
    return { success: true, action: 'raise', amount: 'default' };
  }

  err('Could not execute raise');
  return { success: false, action: 'raise' };
}

async function executeRecommendation(recommendation, gameState) {
  const { action, sizing } = recommendation;
  const available = gameState.availableActions || [];

  let result;
  switch (action) {
    case 'fold':
      result = await executeFold();
      break;

    case 'check':
      if (available.includes('check')) {
        result = await executeCheck();
      } else {
        log('Check not available, folding');
        result = await executeFold();
      }
      break;

    case 'call':
      if (available.includes('call')) {
        result = await executeCall();
      } else if (available.includes('check')) {
        log('Call not available, checking');
        result = await executeCheck();
      } else {
        log('Call not available, folding');
        result = await executeFold();
      }
      break;

    case 'bet':
      const betAmount = sizing?.optimal || gameState.potSize * 0.5 || 10;
      result = await executeBet(betAmount, gameState);
      break;

    case 'raise':
      const raiseAmount = sizing?.optimal || (gameState.toCall * 2.5) || 20;
      result = await executeRaise(raiseAmount, gameState);
      break;

    default:
      warn(`Unknown action: ${action}, folding`);
      result = await executeFold();
  }

  return result;
}

// ============================================================
// 8. OVERLAY PANEL (A2 Mode)
// ============================================================

function showOverlayPanel(gameState, recommendation) {
  // Remove existing overlay if present
  closeOverlayPanel();

  const panel = document.createElement('div');
  panel.id = 'pokernow-advisor-overlay';

  // Determine action color
  const actionColors = {
    fold: '#e74c3c',
    check: '#95a5a6',
    call: '#3498db',
    bet: '#27ae60',
    raise: '#f39c12'
  };
  const actionColor = actionColors[recommendation.action] || '#2c3e50';

  // Format reasoning
  const reasoning = recommendation.reasoning || {};
  const primary = reasoning.primary || 'No reasoning available';
  const strategic = reasoning.strategic || '';
  const math = reasoning.math || '';

  // Format confidence
  const confidence = typeof recommendation.confidence === 'string'
    ? recommendation.confidence
    : `${Math.round((recommendation.confidence || 0) * 100)}%`;

  // Format sizing
  let sizingText = '';
  if (recommendation.sizing) {
    const s = recommendation.sizing;
    sizingText = `Size: ${s.optimal || '?'} (${s.percentPot || '?'} pot)`;
  }

  // Format warnings
  const warnings = recommendation.warnings || [];

  panel.innerHTML = `
    <div class="advisor-header">
      <span class="advisor-title">Play Advisor</span>
      <span class="advisor-mode-badge">A2</span>
      <button class="advisor-close" id="advisor-close-btn">&times;</button>
    </div>
    <div class="advisor-body">
      <div class="advisor-action-row">
        <span class="advisor-action" style="color: ${actionColor}">
          ${recommendation.action.toUpperCase()}
        </span>
        <span class="advisor-confidence">${confidence}</span>
      </div>

      <div class="advisor-cards-row">
        <span class="advisor-label">Hand:</span>
        <span class="advisor-cards">${gameState.holeCards.join(' ')}</span>
      </div>
      ${gameState.board.length > 0 ? `
        <div class="advisor-cards-row">
          <span class="advisor-label">Board:</span>
          <span class="advisor-cards">${gameState.board.join(' ')}</span>
        </div>
      ` : ''}
      <div class="advisor-cards-row">
        <span class="advisor-label">Position:</span>
        <span>${gameState.position}</span>
        <span class="advisor-label" style="margin-left:12px">Players:</span>
        <span>${gameState.playersInHand}</span>
      </div>

      ${sizingText ? `<div class="advisor-sizing">${sizingText}</div>` : ''}

      <div class="advisor-reasoning">
        <div class="advisor-reason-primary">${primary}</div>
        ${math ? `<div class="advisor-reason-math">${math}</div>` : ''}
        ${strategic ? `<div class="advisor-reason-strategic">${strategic}</div>` : ''}
      </div>

      ${warnings.length > 0 ? `
        <div class="advisor-warnings">
          ${warnings.map(w => `<div class="advisor-warning-item">${w}</div>`).join('')}
        </div>
      ` : ''}

      <div class="advisor-btn-row">
        <button class="advisor-btn advisor-btn-accept" id="advisor-accept-btn">
          Accept ${recommendation.action.toUpperCase()}
        </button>
        <button class="advisor-btn advisor-btn-override" id="advisor-override-btn">
          Override
        </button>
      </div>
    </div>
  `;

  removeIdleBadge();
  document.body.appendChild(panel);
  extensionState.overlayVisible = true;

  // Wire up buttons
  document.getElementById('advisor-close-btn').addEventListener('click', () => {
    closeOverlayPanel();
  });

  document.getElementById('advisor-accept-btn').addEventListener('click', async () => {
    // Check if action buttons are actually present (i.e. it's really our turn)
    const actionButtonsPresent = document.querySelector('.action-button.fold') ||
                                  document.querySelector('.action-button.check') ||
                                  document.querySelector('.action-button.call') ||
                                  document.querySelector('.action-signal');

    if (!actionButtonsPresent) {
      // Not our turn yet — store the accepted recommendation and execute when turn comes
      log('Accept clicked but not our turn — queuing action');
      extensionState.queuedAction = { recommendation, gameState };
      closeOverlayPanel();
      updateIdleBadgeStatus(`Queued: ${recommendation.action.toUpperCase()}`);
      return;
    }

    closeOverlayPanel();
    await humanDelay();
    const result = await executeRecommendation(recommendation, gameState);
    logHand(gameState, recommendation, result, 'accepted');
  });

  document.getElementById('advisor-override-btn').addEventListener('click', () => {
    closeOverlayPanel();
    extensionState.queuedAction = null; // Clear any queued action
    log('User overriding recommendation');
    logHand(gameState, recommendation, { success: true, action: 'user_override' }, 'overridden');
  });
}

function closeOverlayPanel() {
  const existing = document.getElementById('pokernow-advisor-overlay');
  if (existing) existing.remove();
  extensionState.overlayVisible = false;
  // Restore idle badge
  showIdleBadge();
}

// ============================================================
// 9. HAND LOGGING
// ============================================================

function logHand(gameState, recommendation, executionResult, disposition) {
  if (!CONFIG.logHands) return;

  const entry = {
    timestamp: Date.now(),
    handNumber: extensionState.handsPlayed,
    disposition, // 'auto' | 'accepted' | 'overridden'
    gameState: {
      street: gameState.street,
      position: gameState.position,
      holeCards: gameState.holeCards,
      board: gameState.board,
      potSize: gameState.potSize,
      toCall: gameState.toCall,
      stackSize: gameState.stackSize,
      playersInHand: gameState.playersInHand,
      gameVariant: gameState.gameVariant
    },
    recommendation: {
      action: recommendation.action,
      confidence: recommendation.confidence,
      reasoning: recommendation.reasoning
    },
    execution: executionResult
  };

  // Send to background worker for persistent storage
  try {
    chrome.runtime.sendMessage({ type: 'LOG_HAND', data: entry }, (response) => {
      if (chrome.runtime.lastError) {
        warn('Log send failed:', chrome.runtime.lastError.message);
      }
    });
  } catch (e) {
    warn('Could not send log:', e.message);
  }
}

// ============================================================
// 10. MAIN GAME LOOP
// ============================================================

async function onMyTurn() {
  if (CONFIG.mode === 'off') return;
  if (extensionState.turnProcessing) {
    log('Already processing turn, skipping');
    return;
  }

  extensionState.turnProcessing = true;

  try {
    // Small delay to let DOM settle
    await sleep(300);

    // If there's a queued action from a previous Accept click, execute it now
    if (extensionState.queuedAction) {
      const queued = extensionState.queuedAction;
      extensionState.queuedAction = null;
      log(`Executing queued action: ${queued.recommendation.action}`);
      updateIdleBadgeStatus('Executing...');
      await humanDelay();
      const result = await executeRecommendation(queued.recommendation, queued.gameState);
      logHand(queued.gameState, queued.recommendation, result, 'accepted-queued');
      updateIdleBadgeStatus('Waiting...');
      return;
    }

    // Parse game state
    const gameState = parseGameState();
    extensionState.currentGameState = gameState;

    log(`Turn detected: ${gameState.street} | ${gameState.holeCards.join(' ')} | Board: ${gameState.board.join(' ')} | Pos: ${gameState.position} | Pot: ${gameState.potSize} | ToCall: ${gameState.toCall}`);

    if (gameState.holeCards.length < 2) {
      warn('Could not read hole cards, skipping');
      return;
    }

    // Get recommendation
    const recommendation = await getAdvisorRecommendation(gameState);
    extensionState.currentRecommendation = recommendation;

    log(`Recommendation: ${recommendation.action} (${recommendation.confidence})`);

    // Execute based on mode
    if (CONFIG.mode === 'a1') {
      // A1: Auto-pilot
      await humanDelay();
      const result = await executeRecommendation(recommendation, gameState);
      extensionState.handsPlayed++;
      logHand(gameState, recommendation, result, 'auto');
      log(`A1 executed: ${result.action} (${result.success ? 'OK' : 'FAILED'})`);

    } else if (CONFIG.mode === 'a2') {
      // A2: Show overlay, wait for user
      showOverlayPanel(gameState, recommendation);
      extensionState.handsPlayed++;
    }

  } catch (error) {
    err('Error in game loop:', error);
  } finally {
    extensionState.turnProcessing = false;
  }
}

// ============================================================
// 11. TURN DETECTION (MutationObserver)
// ============================================================

function setupTurnObserver() {
  log('Setting up turn observer...');

  const observer = new MutationObserver((mutations) => {
    // Check if it's our turn by looking for action signal
    const myPlayer = document.querySelector('.you-player');
    if (!myPlayer) return;

    const hasActionSignal = myPlayer.querySelector('.action-signal') ||
                            myPlayer.classList.contains('action-signal') ||
                            myPlayer.classList.contains('decision');

    // Also check if action buttons are visible (more reliable)
    const hasActionButtons = document.querySelector('.action-button.fold') ||
                             document.querySelector('.action-button.check') ||
                             document.querySelector('.action-button.call');

    const isMyTurn = !!(hasActionSignal || hasActionButtons);

    if (isMyTurn && !extensionState.isMyTurn) {
      extensionState.isMyTurn = true;
      updateIdleBadgeStatus('Your turn!');
      log('>>> MY TURN <<<');
      onMyTurn();
    } else if (!isMyTurn && extensionState.isMyTurn) {
      extensionState.isMyTurn = false;
      closeOverlayPanel(); // Clean up overlay when turn ends
      updateIdleBadgeStatus('Waiting...');
    }
  });

  // Observe the entire game area for changes
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });

  log('Turn observer active');
  return observer;
}

// ============================================================
// 12. MESSAGE HANDLING (from popup / background)
// ============================================================

function setupMessageListener() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case 'UPDATE_CONFIG':
        if (request.mode !== undefined) CONFIG.mode = request.mode;
        if (request.heroStyle !== undefined) CONFIG.heroStyle = request.heroStyle;
        if (request.apiUrl !== undefined) CONFIG.apiUrl = request.apiUrl;
        if (request.logHands !== undefined) CONFIG.logHands = request.logHands;
        log('Config updated:', CONFIG);
        sendResponse({ success: true });
        break;

      case 'GET_STATE':
        sendResponse({
          config: { ...CONFIG },
          state: {
            isMyTurn: extensionState.isMyTurn,
            handsPlayed: extensionState.handsPlayed,
            overlayVisible: extensionState.overlayVisible,
            currentRecommendation: extensionState.currentRecommendation
          }
        });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
    return true; // Keep channel open for async
  });
}

// ============================================================
// 13. INITIALIZATION
// ============================================================

async function initialize() {
  // Guard against multiple script injections (SPA re-injection, extension reload, etc.)
  if (window.__playAdvisorInitialized) {
    return;
  }
  window.__playAdvisorInitialized = true;

  log('Initializing on', window.location.href);

  // Load saved config
  try {
    const stored = await chrome.storage.sync.get(['mode', 'heroStyle', 'apiUrl', 'logHands']);
    CONFIG.mode = stored.mode || DEFAULT_CONFIG.mode;
    CONFIG.heroStyle = stored.heroStyle || DEFAULT_CONFIG.heroStyle;
    CONFIG.apiUrl = stored.apiUrl || DEFAULT_CONFIG.apiUrl;
    CONFIG.logHands = stored.logHands !== undefined ? stored.logHands : DEFAULT_CONFIG.logHands;
  } catch (e) {
    warn('Could not load saved config, using defaults');
  }

  log('Config:', CONFIG);

  // Setup listeners
  setupMessageListener();
  setupTurnObserver();

  // Show persistent idle badge so user knows extension is active
  showIdleBadge();

  extensionState.initialized = true;
  log('Ready. Mode:', CONFIG.mode, '| Style:', CONFIG.heroStyle);
}

// ============================================================
// PERSISTENT IDLE BADGE
// ============================================================

function showIdleBadge() {
  // Don't show if mode is off
  if (CONFIG.mode === 'off') {
    removeIdleBadge();
    return;
  }

  // Don't show if full overlay is visible
  if (extensionState.overlayVisible) return;

  // Don't create duplicate
  if (document.getElementById('pokernow-advisor-idle')) return;

  const badge = document.createElement('div');
  badge.id = 'pokernow-advisor-idle';
  badge.innerHTML = `
    <span class="advisor-idle-dot"></span>
    <span class="advisor-idle-text">Play Advisor</span>
    <span class="advisor-idle-mode">${CONFIG.mode === 'a1' ? 'A1' : 'A2'}</span>
    <span class="advisor-idle-style">${CONFIG.heroStyle.toUpperCase()}</span>
    <span class="advisor-idle-status">Waiting...</span>
  `;
  document.body.appendChild(badge);
}

function removeIdleBadge() {
  const badge = document.getElementById('pokernow-advisor-idle');
  if (badge) badge.remove();
}

function updateIdleBadgeStatus(text) {
  const status = document.querySelector('#pokernow-advisor-idle .advisor-idle-status');
  if (status) status.textContent = text;
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
