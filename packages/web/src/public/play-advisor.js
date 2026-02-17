// Play Advisor UI Module
// Real-time hand analysis with action recommendations
// Dual-mode: Live Table (speed) and Study (depth)

const PlayAdvisor = (function() {
  // ============ STATE ============
  const state = {
    mode: 'live', // 'live' or 'study'
    gameVariant: 'omaha4',
    heroStyle: 'reg',
    holeCards: [],
    boardCards: [],
    position: 'BTN',
    playersInHand: 3,
    potSize: 100,
    toCall: 0,
    stackSize: 1000,
    villainActions: [],
    lastResponse: null,
    isLoading: false,
    // Live mode specific
    liveCardTarget: 'hole', // 'hole' or 'board'
    liveNextSlot: 0 // next empty slot index
  };

  // Style options matching StyleProfiles.js
  const STYLE_OPTIONS = [
    { value: 'nit', label: 'Nit \u2014 20% VPIP', description: 'Ultra-tight, only premium hands' },
    { value: 'rock', label: 'Rock \u2014 20% VPIP', description: 'Tight-passive, prefers calling' },
    { value: 'reg', label: 'Reg \u2014 25% VPIP', description: 'Solid regular, balanced play' },
    { value: 'tag', label: 'TAG \u2014 28% VPIP', description: 'Tight-aggressive, classic winner' },
    { value: 'lag', label: 'LAG \u2014 35% VPIP', description: 'Loose-aggressive, max pressure' },
    { value: 'fish', label: 'Fish \u2014 50% VPIP', description: 'Loose-passive, recreational' },
  ];

  // Card constants
  const SUITS = ['s', 'h', 'd', 'c'];
  const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const SUIT_COLORS = { s: '#000', h: '#dc2626', d: '#2563eb', c: '#16a34a' };
  const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

  // ============ CARD SELECTION ============
  function getAllCards() {
    const cards = [];
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        cards.push(rank + suit);
      }
    }
    return cards;
  }

  function isCardSelected(card) {
    return state.holeCards.includes(card) || state.boardCards.includes(card);
  }

  function getMaxHoleCards() {
    const variants = { omaha4: 4, omaha5: 5, omaha6: 6 };
    return variants[state.gameVariant] || 4;
  }

  function toggleHoleCard(card) {
    if (state.boardCards.includes(card)) return; // Can't select board card as hole card

    const idx = state.holeCards.indexOf(card);
    if (idx >= 0) {
      state.holeCards.splice(idx, 1);
    } else if (state.holeCards.length < getMaxHoleCards()) {
      state.holeCards.push(card);
    }
    updateUI();
    autoAnalyze();
  }

  function toggleBoardCard(card) {
    if (state.holeCards.includes(card)) return; // Can't select hole card as board card

    const idx = state.boardCards.indexOf(card);
    if (idx >= 0) {
      state.boardCards.splice(idx, 1);
    } else if (state.boardCards.length < 5) {
      state.boardCards.push(card);
    }
    updateUI();
    autoAnalyze();
  }

  function clearHoleCards() {
    state.holeCards = [];
    updateUI();
    clearResults();
  }

  function clearBoardCards() {
    state.boardCards = [];
    updateUI();
    clearResults();
  }

  // ============ INPUT HANDLERS ============
  function updateGameVariant(variant) {
    state.gameVariant = variant;
    // Clear extra hole cards if switching to smaller variant
    const max = getMaxHoleCards();
    if (state.holeCards.length > max) {
      state.holeCards = state.holeCards.slice(0, max);
    }
    updateUI();
    autoAnalyze();
  }

  function updateHeroStyle(style) {
    state.heroStyle = style;
    autoAnalyze();
  }

  function updatePosition(position) {
    state.position = position;
    autoAnalyze();
  }

  function updatePlayersInHand(count) {
    state.playersInHand = parseInt(count) || 3;
    autoAnalyze();
  }

  function updatePotSize(value) {
    state.potSize = parseInt(value) || 0;
    autoAnalyze();
  }

  function updateToCall(value) {
    state.toCall = parseInt(value) || 0;
    autoAnalyze();
  }

  function updateStackSize(value) {
    state.stackSize = parseInt(value) || 0;
    autoAnalyze();
  }

  function addVillainAction(action) {
    state.villainActions.push(action);
    updateVillainActionsDisplay();
    autoAnalyze();
  }

  function clearVillainActions() {
    state.villainActions = [];
    updateVillainActionsDisplay();
    autoAnalyze();
  }

  // ============ MODE SWITCHING ============
  function switchMode(mode) {
    state.mode = mode;

    // Update mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Show/hide mode containers
    document.getElementById('live-mode')?.classList.toggle('active', mode === 'live');
    document.getElementById('study-mode')?.classList.toggle('active', mode === 'study');

    // Sync state between modes
    syncModeState(mode);
    updateUI();
  }

  function syncModeState(targetMode) {
    if (targetMode === 'live') {
      // Push state into live controls
      const liveGame = document.getElementById('live-game-select');
      const livePos = document.getElementById('live-position-select');
      const livePlayers = document.getElementById('live-players-select');
      const liveStyle = document.getElementById('live-style-select');
      const livePot = document.getElementById('live-pot');
      const liveCall = document.getElementById('live-call');
      const liveStack = document.getElementById('live-stack');

      if (liveGame) liveGame.value = state.gameVariant;
      if (livePos) livePos.value = state.position;
      if (livePlayers) livePlayers.value = String(state.playersInHand);
      if (liveStyle) liveStyle.value = state.heroStyle;
      if (livePot) livePot.value = state.potSize;
      if (liveCall) liveCall.value = state.toCall;
      if (liveStack) liveStack.value = state.stackSize;

      renderLiveCardPicker();
      renderLiveCardSlots();
      updateLiveResult();
    } else {
      // Push state into study controls
      const studyGame = document.getElementById('advisor-game-select');
      const studyStyle = document.getElementById('advisor-style-select');
      const studyPos = document.getElementById('advisor-position-select');
      const studyPlayers = document.getElementById('advisor-players-select');
      const studyPot = document.getElementById('advisor-pot-size');
      const studyCall = document.getElementById('advisor-to-call');
      const studyStack = document.getElementById('advisor-stack-size');

      if (studyGame) studyGame.value = state.gameVariant;
      if (studyStyle) studyStyle.value = state.heroStyle;
      if (studyPos) studyPos.value = state.position;
      if (studyPlayers) studyPlayers.value = String(state.playersInHand);
      if (studyPot) studyPot.value = state.potSize;
      if (studyCall) studyCall.value = state.toCall;
      if (studyStack) studyStack.value = state.stackSize;
    }
  }

  // ============ LIVE MODE RENDERING ============
  function renderLiveCardPicker() {
    const container = document.getElementById('live-card-picker');
    if (!container) return;

    // Render 4 rows (one per suit) × 13 columns (one per rank)
    let html = '';
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const card = rank + suit;
        const used = isCardSelected(card);
        const symbol = SUIT_SYMBOLS[suit];
        const color = SUIT_COLORS[suit];
        html += `<button class="live-pick-btn ${used ? 'used' : ''}" data-card="${card}" style="color: ${color}">${rank}${symbol}</button>`;
      }
    }
    container.innerHTML = html;
  }

  function renderLiveCardSlots() {
    const holeContainer = document.getElementById('live-hole-cards');
    const boardContainer = document.getElementById('live-board-cards');
    if (!holeContainer || !boardContainer) return;

    const maxHole = getMaxHoleCards();

    // Build hole slots
    let holeHtml = '';
    for (let i = 0; i < maxHole; i++) {
      if (state.holeCards[i]) {
        const card = state.holeCards[i];
        const suit = card[1];
        const rank = card[0];
        const symbol = SUIT_SYMBOLS[suit];
        const color = SUIT_COLORS[suit];
        holeHtml += `<div class="live-card-slot filled" data-slot="hole-${i}" style="color: ${color}">${rank}${symbol}</div>`;
      } else {
        const isTarget = state.liveCardTarget === 'hole' && i === state.holeCards.length;
        holeHtml += `<div class="live-card-slot empty ${isTarget ? 'active-target' : ''}" data-slot="hole-${i}">?</div>`;
      }
    }
    holeContainer.innerHTML = holeHtml;

    // Build board slots
    let boardHtml = '';
    for (let i = 0; i < 5; i++) {
      if (state.boardCards[i]) {
        const card = state.boardCards[i];
        const suit = card[1];
        const rank = card[0];
        const symbol = SUIT_SYMBOLS[suit];
        const color = SUIT_COLORS[suit];
        boardHtml += `<div class="live-card-slot board-slot filled" data-slot="board-${i}" style="color: ${color}">${rank}${symbol}</div>`;
      } else {
        const isTarget = state.liveCardTarget === 'board' && i === state.boardCards.length;
        boardHtml += `<div class="live-card-slot board-slot empty ${isTarget ? 'active-target' : ''}" data-slot="board-${i}">?</div>`;
      }
    }
    boardContainer.innerHTML = boardHtml;

    // Auto-switch target when hole cards are full
    if (state.liveCardTarget === 'hole' && state.holeCards.length >= maxHole) {
      state.liveCardTarget = 'board';
    }
  }

  function livePickCard(card) {
    if (isCardSelected(card)) return;

    if (state.liveCardTarget === 'hole') {
      const max = getMaxHoleCards();
      if (state.holeCards.length < max) {
        state.holeCards.push(card);
        // Auto-switch to board when hole is full
        if (state.holeCards.length >= max) {
          state.liveCardTarget = 'board';
        }
      }
    } else {
      if (state.boardCards.length < 5) {
        state.boardCards.push(card);
      }
    }

    renderLiveCardPicker();
    renderLiveCardSlots();
    autoAnalyze();

    // Update study mode UI as well (shared state)
    if (state.mode === 'live') {
      renderCardSelector();
      renderSelectedCards();
      updateAnalyzeButton();
    }
  }

  function liveClearHole() {
    state.holeCards = [];
    state.liveCardTarget = 'hole';
    state.lastResponse = null;
    renderLiveCardPicker();
    renderLiveCardSlots();
    updateLiveResult();
    // Sync study mode
    renderCardSelector();
    renderSelectedCards();
    clearResults();
  }

  function liveClearBoard() {
    state.boardCards = [];
    state.lastResponse = null;
    renderLiveCardPicker();
    renderLiveCardSlots();
    updateLiveResult();
    // Sync study mode
    renderCardSelector();
    renderSelectedCards();
    clearResults();
  }

  function liveNewHand() {
    state.holeCards = [];
    state.boardCards = [];
    state.villainActions = [];
    state.lastResponse = null;
    state.liveCardTarget = 'hole';
    renderLiveCardPicker();
    renderLiveCardSlots();
    updateLiveResult();
    // Sync study mode
    renderCardSelector();
    renderSelectedCards();
    updateVillainActionsDisplay();
    clearResults();
  }

  function updateLiveResult() {
    const container = document.getElementById('live-result');
    if (!container) return;

    if (!state.lastResponse) {
      const holeNeeded = getMaxHoleCards() - state.holeCards.length;
      const boardNeeded = Math.max(0, 3 - state.boardCards.length);
      let msg = 'Enter your cards to get a recommendation';
      if (state.holeCards.length > 0 && holeNeeded > 0) {
        msg = `Need ${holeNeeded} more hole card${holeNeeded > 1 ? 's' : ''}`;
      } else if (state.holeCards.length >= getMaxHoleCards() && boardNeeded > 0) {
        msg = `Need ${boardNeeded} more board card${boardNeeded > 1 ? 's' : ''}`;
      }
      container.innerHTML = `<div class="live-result-placeholder">${msg}</div>`;
      return;
    }

    const data = state.lastResponse;
    const rec = data.recommendation || {};
    const analysis = data.analysis || {};
    const action = (rec.action || 'check').toLowerCase();

    let html = '';

    // Hand name
    if (analysis.currentHand) {
      html += `<div class="live-result-hand">${analysis.currentHand.handStrength || analysis.currentHand.madeHand}${analysis.currentHand.isNuts ? ' 🔥' : ''}</div>`;
    }

    // BIG action badge
    html += `<div class="live-result-action ${action}">${action.toUpperCase()}</div>`;

    // Sizing
    if (rec.sizing && action !== 'fold' && action !== 'check') {
      html += `<div class="live-result-sizing">$${rec.sizing.optimal} (${rec.sizing.percentPot})</div>`;
    }

    // One-line reason
    if (rec.reasoning && rec.reasoning.primary) {
      html += `<div class="live-result-reason">${rec.reasoning.primary}</div>`;
    }

    // Equity pill
    if (analysis.equity) {
      const eq = parseFloat(analysis.equity.estimated) || 0;
      const eqColor = eq >= 60 ? 'var(--success)' : eq >= 40 ? 'var(--warning)' : 'var(--danger)';
      html += `<div class="live-result-equity"><span style="color:${eqColor}">Equity: ${analysis.equity.estimated}</span></div>`;
    }

    container.innerHTML = html;
  }

  // ============ API CALL ============
  let analyzeTimeout = null;

  function autoAnalyze() {
    // Debounce API calls
    if (analyzeTimeout) clearTimeout(analyzeTimeout);
    analyzeTimeout = setTimeout(() => {
      if (canAnalyze()) {
        analyze();
      }
    }, 300);
  }

  function canAnalyze() {
    return state.holeCards.length === getMaxHoleCards() && state.boardCards.length >= 3;
  }

  function getStreet() {
    if (state.boardCards.length === 3) return 'flop';
    if (state.boardCards.length === 4) return 'turn';
    if (state.boardCards.length === 5) return 'river';
    return 'flop';
  }

  async function analyze() {
    if (!canAnalyze()) {
      showMessage('Select your hole cards and at least 3 board cards');
      return;
    }

    state.isLoading = true;
    updateUI();

    const payload = {
      gameVariant: state.gameVariant,
      heroStyle: state.heroStyle,
      street: getStreet(),
      holeCards: state.holeCards,
      board: state.boardCards,
      position: state.position,
      playersInHand: state.playersInHand,
      potSize: state.potSize,
      toCall: state.toCall,
      stackSize: state.stackSize,
      villainActions: state.villainActions
    };

    try {
      const response = await fetch('/api/advise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        state.lastResponse = data;
        displayResults(data);
        updateLiveResult();
      } else {
        showError(data.error || 'Analysis failed');
      }
    } catch (err) {
      showError('Network error: ' + err.message);
    } finally {
      state.isLoading = false;
      updateUI();
    }
  }

  // ============ DISPLAY RESULTS ============
  function displayResults(data) {
    const resultsContainer = document.getElementById('advisor-results');
    if (!resultsContainer) return;

    const analysis = data.analysis || {};
    const recommendation = data.recommendation || {};
    const opponentRange = data.opponentRange || {};

    // Build HTML
    let html = '';

    // Hand Strength Card
    if (analysis.currentHand) {
      html += `
        <div class="advisor-card hand-strength-card">
          <div class="card-header">
            <span class="card-icon">🃏</span>
            <span class="card-title">Your Hand</span>
          </div>
          <div class="card-body">
            <div class="hand-name">${analysis.currentHand.handStrength || analysis.currentHand.madeHand}</div>
            ${analysis.currentHand.isNuts ? '<span class="nuts-badge">🔥 THE NUTS</span>' : ''}
          </div>
        </div>
      `;
    }

    // Equity Card
    if (analysis.equity) {
      const equityValue = parseFloat(analysis.equity.estimated) || 0;
      const equityColor = equityValue >= 60 ? 'var(--success)' :
                          equityValue >= 40 ? 'var(--warning)' : 'var(--danger)';
      html += `
        <div class="advisor-card equity-card">
          <div class="card-header">
            <span class="card-icon">📊</span>
            <span class="card-title">Equity</span>
          </div>
          <div class="card-body">
            <div class="equity-value" style="color: ${equityColor}">${analysis.equity.estimated}</div>
            <div class="equity-range">vs ${analysis.equity.vsRange || 'opponent range'}</div>
            ${analysis.equity.drawEquity ? `<div class="draw-equity">+ ${analysis.equity.drawEquity} draw equity</div>` : ''}
            <div class="equity-bar">
              <div class="equity-bar-fill" style="width: ${equityValue}%; background: ${equityColor}"></div>
            </div>
          </div>
        </div>
      `;
    }

    // Recommendation Card (Primary) with Feedback Buttons
    if (recommendation.action) {
      const actionColors = {
        fold: 'var(--danger)',
        call: 'var(--warning)',
        check: 'var(--secondary)',
        bet: 'var(--success)',
        raise: 'var(--primary)'
      };
      const actionColor = actionColors[recommendation.action] || 'var(--primary)';

      html += `
        <div class="advisor-card recommendation-card">
          <div class="card-header">
            <span class="card-icon">💡</span>
            <span class="card-title">Recommendation</span>
            <span class="confidence-badge">${recommendation.confidence} confident</span>
          </div>
          <div class="card-body">
            <div class="action-badge" style="background: ${actionColor}">${recommendation.action.toUpperCase()}</div>
            ${recommendation.sizing ? `
              <div class="sizing-info">
                <span class="sizing-optimal">$${recommendation.sizing.optimal}</span>
                <span class="sizing-percent">(${recommendation.sizing.percentPot})</span>
              </div>
            ` : ''}
            <div class="feedback-section">
              <span class="feedback-label">Was this helpful?</span>
              <div class="feedback-buttons">
                <button class="feedback-btn positive" data-rating="positive" title="Good recommendation">👍</button>
                <button class="feedback-btn negative" data-rating="negative" title="Bad recommendation">👎</button>
              </div>
              <div class="feedback-status" id="feedback-status"></div>
            </div>
          </div>
        </div>
      `;
    }

    // Reasoning Card
    if (recommendation.reasoning) {
      html += `
        <div class="advisor-card reasoning-card">
          <div class="card-header">
            <span class="card-icon">🧠</span>
            <span class="card-title">Why?</span>
          </div>
          <div class="card-body">
            <div class="reasoning-primary">${recommendation.reasoning.primary || ''}</div>
            <div class="reasoning-math">${recommendation.reasoning.math || ''}</div>
            <div class="reasoning-strategic">${recommendation.reasoning.strategic || ''}</div>
          </div>
        </div>
      `;
    }

    // Warnings Card
    if (recommendation.warnings && recommendation.warnings.length > 0) {
      html += `
        <div class="advisor-card warnings-card">
          <div class="card-header">
            <span class="card-icon">⚠️</span>
            <span class="card-title">Watch Out</span>
          </div>
          <div class="card-body">
            <ul class="warnings-list">
              ${recommendation.warnings.map(w => `<li>${w}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    }

    // Sizing Details Card
    if (recommendation.sizing) {
      html += `
        <div class="advisor-card sizing-card">
          <div class="card-header">
            <span class="card-icon">💰</span>
            <span class="card-title">Bet Sizing</span>
          </div>
          <div class="card-body">
            <div class="sizing-range">
              <span class="min">Min: $${recommendation.sizing.range.min}</span>
              <span class="optimal">Optimal: $${recommendation.sizing.optimal}</span>
              <span class="max">Max: $${recommendation.sizing.range.max}</span>
            </div>
            <div class="sizing-explanation">${recommendation.sizing.explanation || ''}</div>
            ${recommendation.sizing.commitment ? `
              <div class="commitment-info">
                <span class="spr">SPR: ${recommendation.sizing.commitment.currentSPR}</span>
                ${recommendation.sizing.commitment.isCommitting ? '<span class="committing">⚡ Committing</span>' : ''}
                ${recommendation.sizing.commitment.isAllIn ? '<span class="all-in">🔥 All-In</span>' : ''}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Alternatives Card
    if (recommendation.alternatives && recommendation.alternatives.length > 0) {
      html += `
        <div class="advisor-card alternatives-card">
          <div class="card-header">
            <span class="card-icon">🔄</span>
            <span class="card-title">Alternatives</span>
          </div>
          <div class="card-body">
            ${recommendation.alternatives.map(alt => `
              <div class="alternative">
                <span class="alt-action">${alt.action}</span>
                <span class="alt-tradeoff">${alt.tradeoff || ''}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Board Texture Card
    if (analysis.boardTexture) {
      html += `
        <div class="advisor-card texture-card">
          <div class="card-header">
            <span class="card-icon">🎯</span>
            <span class="card-title">Board Texture</span>
          </div>
          <div class="card-body">
            <div class="texture-category">${analysis.boardTexture.category}</div>
            <div class="texture-danger">Danger: ${analysis.boardTexture.dangerLevel}</div>
            <div class="texture-desc">${analysis.boardTexture.description || ''}</div>
          </div>
        </div>
      `;
    }

    // Latency info
    html += `
      <div class="latency-info">Analysis completed in ${data.latencyMs}ms</div>
    `;

    resultsContainer.innerHTML = html;
    resultsContainer.classList.add('has-results');
  }

  function clearResults() {
    const resultsContainer = document.getElementById('advisor-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = '<div class="advisor-placeholder">Select cards to get recommendations</div>';
      resultsContainer.classList.remove('has-results');
    }
    state.lastResponse = null;
  }

  function showError(message) {
    const resultsContainer = document.getElementById('advisor-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = `<div class="advisor-error">❌ ${message}</div>`;
    }
  }

  function showMessage(message) {
    const resultsContainer = document.getElementById('advisor-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = `<div class="advisor-placeholder">${message}</div>`;
    }
  }

  // ============ UI RENDERING ============
  function updateUI() {
    renderCardSelector();
    renderSelectedCards();
    updateVillainActionsDisplay();
    updateAnalyzeButton();
  }

  function renderCardSelector() {
    const container = document.getElementById('card-selector-grid');
    if (!container) return;

    let html = '';
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        const card = rank + suit;
        const selected = isCardSelected(card);
        const isHole = state.holeCards.includes(card);
        const isBoard = state.boardCards.includes(card);
        const symbol = SUIT_SYMBOLS[suit];
        const color = SUIT_COLORS[suit];

        html += `
          <button class="card-btn ${selected ? 'selected' : ''} ${isHole ? 'hole' : ''} ${isBoard ? 'board' : ''}"
                  data-card="${card}"
                  style="color: ${color}">
            <span class="card-rank">${rank}</span>
            <span class="card-suit">${symbol}</span>
          </button>
        `;
      }
    }
    container.innerHTML = html;
  }

  function renderSelectedCards() {
    // Hole cards display
    const holeCardsContainer = document.getElementById('selected-hole-cards');
    if (holeCardsContainer) {
      const maxCards = getMaxHoleCards();
      let html = '';
      for (let i = 0; i < maxCards; i++) {
        if (state.holeCards[i]) {
          const card = state.holeCards[i];
          const suit = card[1];
          const rank = card[0];
          const symbol = SUIT_SYMBOLS[suit];
          const color = SUIT_COLORS[suit];
          html += `<div class="selected-card" style="color: ${color}">${rank}${symbol}</div>`;
        } else {
          html += `<div class="selected-card empty">?</div>`;
        }
      }
      holeCardsContainer.innerHTML = html;
    }

    // Board cards display
    const boardCardsContainer = document.getElementById('selected-board-cards');
    if (boardCardsContainer) {
      let html = '';
      const labels = ['Flop', 'Flop', 'Flop', 'Turn', 'River'];
      for (let i = 0; i < 5; i++) {
        if (state.boardCards[i]) {
          const card = state.boardCards[i];
          const suit = card[1];
          const rank = card[0];
          const symbol = SUIT_SYMBOLS[suit];
          const color = SUIT_COLORS[suit];
          html += `<div class="selected-card board-slot" style="color: ${color}" title="${labels[i]}">${rank}${symbol}</div>`;
        } else {
          html += `<div class="selected-card board-slot empty" title="${labels[i]}">?</div>`;
        }
      }
      boardCardsContainer.innerHTML = html;
    }

    // Street indicator
    const streetIndicator = document.getElementById('street-indicator');
    if (streetIndicator) {
      streetIndicator.textContent = state.boardCards.length >= 3 ? getStreet().toUpperCase() : 'PREFLOP';
    }
  }

  function updateVillainActionsDisplay() {
    const container = document.getElementById('villain-actions-display');
    if (!container) return;

    if (state.villainActions.length === 0) {
      container.innerHTML = '<span class="no-actions">No actions yet</span>';
      return;
    }

    container.innerHTML = state.villainActions.map((action, i) =>
      `<span class="action-tag">${action}</span>`
    ).join(' → ');
  }

  function updateAnalyzeButton() {
    const btn = document.getElementById('advisor-analyze-btn');
    if (btn) {
      const canRun = canAnalyze();
      btn.disabled = !canRun || state.isLoading;
      // Update button text via inner span to preserve icon structure
      const textSpan = btn.querySelector('.btn-text');
      if (textSpan) {
        textSpan.textContent = state.isLoading ? 'Analyzing...' : 'Analyze Hand';
      }
    }
  }

  // ============ FEEDBACK SUBMISSION ============
  async function submitFeedback(rating) {
    if (!state.lastResponse || !state.lastResponse.recommendation) {
      console.error('No recommendation to provide feedback on');
      return;
    }

    const statusEl = document.getElementById('feedback-status');
    const feedbackBtns = document.querySelectorAll('.feedback-btn');

    // Disable buttons during submission
    feedbackBtns.forEach(btn => btn.disabled = true);
    if (statusEl) statusEl.textContent = 'Submitting...';

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          action: state.lastResponse.recommendation.action,
          context: {
            gameVariant: state.gameVariant,
            street: getStreet(),
            position: state.position,
            playersInHand: state.playersInHand,
            handType: state.lastResponse.analysis?.currentHand?.madeHand,
            equity: state.lastResponse.analysis?.equity?.estimated,
            potOdds: state.lastResponse.analysis?.potOdds?.toCall,
            spr: state.lastResponse.recommendation?.metadata?.sprZone,
            confidence: state.lastResponse.recommendation?.confidence,
            betType: state.lastResponse.recommendation?.betType,
            isNuts: state.lastResponse.analysis?.currentHand?.isNuts
          }
        })
      });

      if (response.ok) {
        if (statusEl) {
          statusEl.textContent = rating === 'positive' ? '✅ Thanks!' : '📝 Noted, we\'ll improve!';
          statusEl.className = 'feedback-status ' + rating;
        }
        // Mark buttons as used
        feedbackBtns.forEach(btn => {
          btn.classList.remove('selected');
          if (btn.dataset.rating === rating) {
            btn.classList.add('selected');
          }
        });
      } else {
        throw new Error('Failed to submit feedback');
      }
    } catch (err) {
      console.error('Feedback submission error:', err);
      if (statusEl) statusEl.textContent = '❌ Error submitting';
      feedbackBtns.forEach(btn => btn.disabled = false);
    }
  }

  // ============ EVENT BINDING ============
  function bindEvents() {
    // ---- MODE TOGGLE ----
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });

    // ---- LIVE MODE EVENTS ----
    // Live card picker
    const livePicker = document.getElementById('live-card-picker');
    if (livePicker) {
      livePicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.live-pick-btn');
        if (btn && !btn.classList.contains('used')) {
          livePickCard(btn.dataset.card);
        }
      });
    }

    // Live card slot clicks (to set target)
    document.getElementById('live-hole-cards')?.addEventListener('click', () => {
      state.liveCardTarget = 'hole';
      renderLiveCardSlots();
    });
    document.getElementById('live-board-cards')?.addEventListener('click', () => {
      state.liveCardTarget = 'board';
      renderLiveCardSlots();
    });

    // Live clear buttons
    document.getElementById('live-clear-hole')?.addEventListener('click', liveClearHole);
    document.getElementById('live-clear-board')?.addEventListener('click', liveClearBoard);
    document.getElementById('live-new-hand')?.addEventListener('click', liveNewHand);

    // Live settings
    document.getElementById('live-game-select')?.addEventListener('change', (e) => {
      updateGameVariant(e.target.value);
      renderLiveCardSlots();
      renderLiveCardPicker();
    });
    document.getElementById('live-position-select')?.addEventListener('change', (e) => updatePosition(e.target.value));
    document.getElementById('live-players-select')?.addEventListener('change', (e) => updatePlayersInHand(e.target.value));
    document.getElementById('live-style-select')?.addEventListener('change', (e) => updateHeroStyle(e.target.value));

    // Live spinner buttons
    document.querySelectorAll('.spin-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const delta = parseInt(btn.dataset.delta) || 0;
        const newVal = Math.max(0, (parseInt(target.value) || 0) + delta);
        target.value = newVal;
        // Update state based on which field
        if (btn.dataset.target === 'live-pot') updatePotSize(newVal);
        else if (btn.dataset.target === 'live-call') updateToCall(newVal);
        else if (btn.dataset.target === 'live-stack') updateStackSize(newVal);
      });
    });

    // Live spinner input changes
    document.getElementById('live-pot')?.addEventListener('input', (e) => updatePotSize(e.target.value));
    document.getElementById('live-call')?.addEventListener('input', (e) => updateToCall(e.target.value));
    document.getElementById('live-stack')?.addEventListener('input', (e) => updateStackSize(e.target.value));

    // ---- STUDY MODE EVENTS ----
    // Card selector - use event delegation
    const selectorGrid = document.getElementById('card-selector-grid');
    if (selectorGrid) {
      selectorGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.card-btn');
        if (!btn) return;

        const card = btn.dataset.card;
        const mode = document.querySelector('input[name="card-mode"]:checked')?.value || 'hole';

        if (mode === 'hole') {
          toggleHoleCard(card);
        } else {
          toggleBoardCard(card);
        }
        // Sync live mode
        renderLiveCardPicker();
        renderLiveCardSlots();
      });
    }

    // Clear buttons
    document.getElementById('clear-hole-cards')?.addEventListener('click', () => {
      clearHoleCards();
      renderLiveCardPicker();
      renderLiveCardSlots();
      updateLiveResult();
    });
    document.getElementById('clear-board-cards')?.addEventListener('click', () => {
      clearBoardCards();
      renderLiveCardPicker();
      renderLiveCardSlots();
      updateLiveResult();
    });

    // Input fields (study mode)
    document.getElementById('advisor-game-select')?.addEventListener('change', (e) => {
      updateGameVariant(e.target.value);
      renderLiveCardSlots();
      renderLiveCardPicker();
    });
    document.getElementById('advisor-style-select')?.addEventListener('change', (e) => updateHeroStyle(e.target.value));
    document.getElementById('advisor-position-select')?.addEventListener('change', (e) => updatePosition(e.target.value));
    document.getElementById('advisor-players-select')?.addEventListener('change', (e) => updatePlayersInHand(e.target.value));
    document.getElementById('advisor-pot-size')?.addEventListener('input', (e) => updatePotSize(e.target.value));
    document.getElementById('advisor-to-call')?.addEventListener('input', (e) => updateToCall(e.target.value));
    document.getElementById('advisor-stack-size')?.addEventListener('input', (e) => updateStackSize(e.target.value));

    // Villain action buttons
    document.querySelectorAll('.villain-action-btn').forEach(btn => {
      btn.addEventListener('click', () => addVillainAction(btn.dataset.action));
    });
    document.getElementById('clear-villain-actions')?.addEventListener('click', clearVillainActions);

    // Manual analyze button
    document.getElementById('advisor-analyze-btn')?.addEventListener('click', analyze);

    // Feedback buttons - use event delegation since they're dynamically created
    const resultsContainer = document.getElementById('advisor-results');
    if (resultsContainer) {
      resultsContainer.addEventListener('click', (e) => {
        const feedbackBtn = e.target.closest('.feedback-btn');
        if (feedbackBtn && !feedbackBtn.disabled) {
          submitFeedback(feedbackBtn.dataset.rating);
        }
      });
    }

    // ---- KEYBOARD SHORTCUTS (Live mode) ----
    document.addEventListener('keydown', (e) => {
      // Only handle shortcuts when advisor tab is active and live mode is on
      const advisorTab = document.getElementById('advisor-tab');
      if (!advisorTab?.classList.contains('active')) return;
      if (state.mode !== 'live') return;
      // Don't capture when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      // N = new hand
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        liveNewHand();
        return;
      }
      // H = switch target to hole
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        state.liveCardTarget = 'hole';
        renderLiveCardSlots();
        return;
      }
      // B = switch target to board
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        state.liveCardTarget = 'board';
        renderLiveCardSlots();
        return;
      }
      // Backspace = remove last card from current target
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (state.liveCardTarget === 'hole' && state.holeCards.length > 0) {
          state.holeCards.pop();
        } else if (state.liveCardTarget === 'board' && state.boardCards.length > 0) {
          state.boardCards.pop();
        }
        state.lastResponse = null;
        renderLiveCardPicker();
        renderLiveCardSlots();
        updateLiveResult();
        renderCardSelector();
        renderSelectedCards();
        autoAnalyze();
        return;
      }
    });
  }

  // ============ ANALYTICS ============
  let analyticsExpanded = false;

  function toggleAnalytics() {
    analyticsExpanded = !analyticsExpanded;
    const body = document.getElementById('analytics-body');
    const icon = document.querySelector('.analytics-toggle-icon');

    if (analyticsExpanded) {
      body.style.display = 'block';
      icon.textContent = '▲';
      loadAnalytics();
    } else {
      body.style.display = 'none';
      icon.textContent = '▼';
    }
  }

  async function loadAnalytics() {
    const container = document.getElementById('analytics-content');
    if (!container) return;

    container.innerHTML = '<p class="loading">Loading analytics...</p>';

    try {
      const response = await fetch('/api/feedback');
      if (!response.ok) throw new Error('Failed to load analytics');

      const stats = await response.json();

      if (stats.total === 0) {
        container.innerHTML = `
          <div class="analytics-empty">
            <p>No feedback collected yet.</p>
            <p class="hint">Use the 👍/👎 buttons on recommendations to help improve the advisor!</p>
          </div>
        `;
        return;
      }

      let html = `
        <div class="analytics-grid">
          <div class="analytics-stat">
            <span class="stat-value">${stats.total}</span>
            <span class="stat-label">Total Feedback</span>
          </div>
          <div class="analytics-stat positive">
            <span class="stat-value">${stats.positiveRate}%</span>
            <span class="stat-label">Approval Rate</span>
          </div>
          <div class="analytics-stat">
            <span class="stat-value">${stats.positive}</span>
            <span class="stat-label">👍 Positive</span>
          </div>
          <div class="analytics-stat">
            <span class="stat-value">${stats.negative}</span>
            <span class="stat-label">👎 Negative</span>
          </div>
        </div>
      `;

      // Action breakdown
      if (Object.keys(stats.byAction).length > 0) {
        html += '<h4>By Action</h4><div class="action-stats">';
        for (const [action, data] of Object.entries(stats.byAction)) {
          const barWidth = Math.min(100, data.positiveRate || 0);
          html += `
            <div class="action-stat-row">
              <span class="action-name">${action.toUpperCase()}</span>
              <div class="action-bar">
                <div class="action-bar-fill" style="width: ${barWidth}%"></div>
              </div>
              <span class="action-rate">${data.positiveRate || 0}%</span>
              <span class="action-count">(${data.total})</span>
            </div>
          `;
        }
        html += '</div>';
      }

      // Recent comments
      if (stats.recent && stats.recent.length > 0) {
        html += '<h4>Recent Comments</h4><div class="recent-comments">';
        for (const entry of stats.recent) {
          html += `
            <div class="comment ${entry.rating}">
              <span class="comment-icon">${entry.rating === 'positive' ? '👍' : '👎'}</span>
              <span class="comment-text">${entry.userComment}</span>
              <span class="comment-action">${entry.action}</span>
            </div>
          `;
        }
        html += '</div>';
      }

      container.innerHTML = html;

    } catch (err) {
      console.error('Failed to load analytics:', err);
      container.innerHTML = '<p class="error">Failed to load analytics</p>';
    }
  }

  // ============ INITIALIZATION ============
  function init() {
    bindEvents();
    updateUI();
    clearResults();

    // Initialize live mode
    renderLiveCardPicker();
    renderLiveCardSlots();
    updateLiveResult();

    // Analytics toggle
    document.getElementById('analytics-toggle')?.addEventListener('click', toggleAnalytics);

    console.log('Play Advisor initialized (dual-mode: Live Table + Study)');
  }

  // Public API
  return {
    init,
    analyze,
    state,
    clearResults,
    loadAnalytics,
    switchMode,
    liveNewHand
  };
})();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', PlayAdvisor.init);
} else {
  PlayAdvisor.init();
}

// Export for global access
window.PlayAdvisor = PlayAdvisor;
