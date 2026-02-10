// Poker Scenario Analyzer UI
// BUILD_TIMESTAMP is replaced at build time, or shows current time for debugging
const BUILD_TIMESTAMP = '2026-02-09T18:25:00Z';

const HAND_TYPE_CODES = ['HC', '1P', '2P', '3C', 'ST', 'FL', 'FH', '4C', 'SF'];
const HAND_TYPE_NAMES = {
  'HC': 'High Card',
  '1P': 'Pair',
  '2P': 'Two Pair',
  '3C': 'Set',
  'ST': 'Straight',
  'FL': 'Flush',
  'FH': 'Full House',
  '4C': 'Quads',
  'SF': 'Str. Flush'
};

const RANK_CHARS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

// Current state
const state = {
  game: 'omaha4',
  opponents: 5,
  position: 'BTN',
  style: 'tag',
  structure: 'pair',
  rank: 14, // Ace
  rankModifier: '=', // '=', '+', '-'
  suitedness: 'ds',
  sideCards: 'any'
};

// ============ TIERED DATA SERVICE ============
// Tier 1: Bundled JSON (instant, limited scenarios)
// Tier 2: Cloudflare R2 (fast, pre-computed 1M iterations)
// Tier 3: Live simulation (slower, any scenario)

const TieredDataService = {
  // Fetch simulation data using tiered approach
  async fetchSimulationData(gameVariant, playerCount, options = {}) {
    const { forceRefresh = false, statusCallback = null } = options;

    // Try Tier 2 first (R2 pre-computed data)
    if (!forceRefresh) {
      statusCallback?.('Checking pre-computed data...');
      try {
        const tier2Data = await this.fetchFromTier2(gameVariant, playerCount);
        if (tier2Data) {
          statusCallback?.('Loaded from cache (1M simulations)');
          return { source: 'tier2', data: tier2Data };
        }
      } catch (e) {
        console.log('Tier 2 not available, falling back to Tier 3');
      }
    }

    // Fall back to Tier 3 (live simulation)
    statusCallback?.('Running live simulation...');
    const tier3Data = await this.fetchFromTier3(gameVariant, playerCount);
    return { source: 'tier3', data: tier3Data };
  },

  // Tier 2: Fetch from Cloudflare R2
  async fetchFromTier2(gameVariant, playerCount) {
    const url = `/api/data?game=${gameVariant}&players=${playerCount}`;
    console.log('Tier2: Fetching from', url);
    const response = await fetch(url);
    if (!response.ok) {
      console.log('Tier2: Response not OK', response.status);
      if (response.status === 404 || response.status === 503) {
        return null; // Not found or R2 not configured
      }
      throw new Error('Tier 2 fetch failed');
    }
    const result = await response.json();
    console.log('Tier2: API response keys:', Object.keys(result));
    console.log('Tier2: result.data exists:', !!result.data);
    if (result.data) {
      console.log('Tier2: result.data keys:', Object.keys(result.data));
    }
    if (result.fallback === 'tier1') {
      return null; // R2 returned fallback indicator
    }
    return result.data;
  },

  // Tier 3: Live Monte Carlo simulation
  async fetchFromTier3(gameVariant, playerCount, iterations = 50000) {
    const response = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameVariant, playerCount, iterations })
    });
    if (!response.ok) {
      throw new Error('Simulation failed');
    }
    const data = await response.json();
    return data.result;
  }
};

// Strategy configuration
const STRATEGY_CONFIG = {
  // Base playability scores for hand types (0-100)
  handStrength: {
    'pair:AA': 95, 'pair:KK': 88, 'pair:QQ': 80, 'pair:JJ': 72, 'pair:TT': 65,
    'pair:99': 55, 'pair:88': 48, 'pair:77': 42, 'pair:66': 36, 'pair:55': 30,
    'pair:44': 25, 'pair:33': 22, 'pair:22': 20,
    'dpair:any': 70, 'run:A': 85, 'run:K': 78, 'run:Q': 70, 'run:J': 62,
    'run:T': 55, 'run:9': 48, 'run:8': 42, 'run:7': 35, 'run:6': 28,
    'bway:any': 72, 'any:any': 30
  },

  // Position modifiers (BB gets discount since already invested, but OOP postflop)
  positionMod: { 'UTG': -15, 'MP': -8, 'CO': 0, 'BTN': +12, 'SB': -5, 'BB': -2 },

  // Style thresholds (minimum score to play)
  styleThreshold: { 'rock': 75, 'tag': 55, 'lag': 40 },

  // Style VPIP targets for context
  styleVPIP: { 'rock': '~15%', 'tag': '~25%', 'lag': '~38%' },

  // Suitedness bonus
  suitBonus: { 'ds': 12, 'ss': 6, 'r': -3, 'any': 4 },

  // Nut potential ratings (0-100)
  nutPotential: {
    'pair:AA:ds': 95, 'pair:AA:ss': 85, 'pair:AA:r': 70,
    'pair:KK:ds': 85, 'pair:KK:ss': 75, 'pair:KK:r': 60,
    'pair:QQ:ds': 75, 'pair:QQ:ss': 65, 'pair:QQ:r': 50,
    'run:A:ds': 90, 'run:A:ss': 80, 'run:K:ds': 75, 'run:K:ss': 65,
    'run:T:ds': 55, 'run:9:ds': 45, 'run:8:ds': 38,
    'bway:any:ds': 85, 'bway:any:ss': 70,
    'dpair:any:ds': 75, 'dpair:any:ss': 60
  }
};

// Loading indicator helpers
function showDataLoading(message = 'Loading data...') {
  const container = document.getElementById('data-status');
  if (container) {
    container.innerHTML = `
      <div class="data-loading">
        <div class="spinner"></div>
        <span>${message}</span>
      </div>
    `;
    container.style.display = 'block';
  }
}

function hideDataLoading() {
  const container = document.getElementById('data-status');
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

function showStorageUsage() {
  if (typeof DataManager === 'undefined') return;

  DataManager.getStorageUsage().then(usage => {
    const container = document.getElementById('storage-status');
    if (!container || !usage) return;

    const percent = (usage.used / usage.quota * 100).toFixed(1);
    const statusClass = percent > 90 ? 'critical' : percent > 70 ? 'warning' : '';

    container.innerHTML = `
      <div class="storage-usage">
        <span>Storage:</span>
        <div class="storage-bar">
          <div class="storage-bar-fill ${statusClass}" style="width: ${Math.min(percent, 100)}%"></div>
        </div>
        <span>${formatBytes(usage.used)} / ${formatBytes(usage.quota)}</span>
      </div>
    `;
  }).catch(() => {});
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Show deployment timestamp
  const deployInfo = document.getElementById('deploy-info');
  if (deployInfo) {
    const deployDate = new Date(BUILD_TIMESTAMP);
    deployInfo.textContent = `v${deployDate.toLocaleDateString()} ${deployDate.toLocaleTimeString()}`;
    deployInfo.style.cssText = 'position:absolute;bottom:4px;right:8px;font-size:10px;color:#666;opacity:0.7;';
  }

  // Initialize DataManager first (for IndexedDB and Tier 1 data access)
  if (typeof DataManager !== 'undefined') {
    showDataLoading('Initializing data storage...');
    await DataManager.init();
    console.log('DataManager initialized');

    // Load Tier 1 bundled data for current variant
    const variant = document.getElementById('game-select')?.value || 'omaha4';
    showDataLoading('Loading simulation data...');
    const tier1Data = await DataManager.loadTier1Data(variant);
    if (tier1Data) {
      window.bundledData = tier1Data;
      console.log('Tier 1 data loaded:', variant, Object.keys(tier1Data.byPlayerCount || {}).length, 'player counts');
    }
    hideDataLoading();
    showStorageUsage();
  }

  initTabs();
  initScenarioBuilder();
  initMatrix();
  initWorkflowHints();
  loadSavedSimulations();
  updateQueryPreview();
  updateStrategyInsight();
  updateMultiwayAlert();
  updatePresetRecommendations();

  // Reload bundled data when game variant changes
  document.getElementById('game-select')?.addEventListener('change', async (e) => {
    if (typeof DataManager !== 'undefined') {
      showDataLoading(`Loading ${e.target.value} data...`);
      const tier1Data = await DataManager.loadTier1Data(e.target.value);
      if (tier1Data) {
        window.bundledData = tier1Data;
        console.log('Tier 1 data reloaded for:', e.target.value);
      }
      hideDataLoading();
    }
  });
});

// Workflow hint dismissal
function initWorkflowHints() {
  const dismissBtn = document.getElementById('dismiss-hint');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      document.getElementById('workflow-hint').style.display = 'none';
      localStorage.setItem('hint-dismissed', 'true');
    });
    // Check if already dismissed
    if (localStorage.getItem('hint-dismissed') === 'true') {
      document.getElementById('workflow-hint').style.display = 'none';
    }
  }
}

// ============ TAB NAVIGATION ============

// Track if matrix has been auto-loaded
let matrixAutoLoaded = false;

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      // Update buttons
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`${tabId}-tab`).classList.add('active');

      // Auto-load matrix with Tier 2 data on first view
      if (tabId === 'matrix' && !matrixAutoLoaded) {
        matrixAutoLoaded = true;
        autoLoadMatrix();
      }
    });
  });

  // Add change listeners for Matrix tab selectors - auto-reload on change
  const matrixGameSelect = document.getElementById('matrix-game');
  const matrixPlayersSelect = document.getElementById('matrix-players');

  if (matrixGameSelect) {
    matrixGameSelect.addEventListener('change', () => {
      if (matrixAutoLoaded) {
        autoLoadMatrix();
      }
    });
  }

  if (matrixPlayersSelect) {
    matrixPlayersSelect.addEventListener('change', () => {
      if (matrixAutoLoaded) {
        autoLoadMatrix();
      }
    });
  }
}

// Auto-load matrix using Tier 2 data (no button click needed)
async function autoLoadMatrix() {
  const game = document.getElementById('matrix-game').value;
  const players = parseInt(document.getElementById('matrix-players').value, 10);
  const container = document.getElementById('matrix-container');

  // Show loading state
  container.innerHTML = '<div class="loading-matrix">Loading probability matrix...</div>';

  try {
    // Use TieredDataService to fetch Tier 2 data
    const { source, data } = await TieredDataService.fetchSimulationData(game, players, { forceRefresh: false });

    if (data && data.statistics) {
      displayMatrix(data);
      // Show source info below matrix
      const iterations = data.metadata?.config?.iterations || 'N/A';
      const sourceInfo = source === 'tier2' 
        ? `✓ Loaded ${iterations.toLocaleString()} pre-computed hands` 
        : `✓ Loaded from ${source}`;
      const infoEl = document.createElement('div');
      infoEl.className = 'matrix-source-info';
      infoEl.style.cssText = 'text-align: center; color: #16a34a; font-size: 12px; margin-top: 8px;';
      infoEl.textContent = sourceInfo;
      container.appendChild(infoEl);
    } else {
      throw new Error('No data available');
    }
  } catch (error) {
    console.error('Auto-load matrix failed:', error);
    container.innerHTML = '<div class="matrix-empty">Unable to load pre-computed data. Try refreshing the page.</div>';
  }
}

// ============ SCENARIO BUILDER ============

function initScenarioBuilder() {
  // Game select
  document.getElementById('game-select').addEventListener('change', (e) => {
    state.game = e.target.value;
    updateBuilderVisibility();
    updateQueryPreview();
    updateStrategyInsight();
  });

  // Position select
  document.getElementById('position-select')?.addEventListener('change', (e) => {
    state.position = e.target.value;
    updateStrategyInsight();
    updatePresetRecommendations();
  });

  // Style select
  document.getElementById('style-select')?.addEventListener('change', (e) => {
    state.style = e.target.value;
    updateStrategyInsight();
    updatePresetRecommendations();
  });

  // Opponent buttons
  document.querySelectorAll('.opp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.opp-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.opponents = parseInt(btn.dataset.count, 10);
      updateQueryPreview();
      updateStrategyInsight();
      updateMultiwayAlert();
      updatePresetRecommendations();
    });
  });

  // Preset chips
  document.querySelectorAll('.preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyPreset(btn.dataset.query);
    });
  });

  // Structure select (compact)
  const structureSelect = document.getElementById('structure-select');
  if (structureSelect) {
    structureSelect.addEventListener('change', (e) => {
      state.structure = e.target.value;
      updateBuilderVisibility();
      updateConstraintTags();
      updateQueryPreview();
      updateStrategyInsight();
      clearActivePreset();
    });
  }

  // Rank stepper
  const rankDown = document.getElementById('rank-down');
  const rankUp = document.getElementById('rank-up');
  if (rankDown) {
    rankDown.addEventListener('click', () => {
      if (state.rank > 2) {
        state.rank--;
        updateRankDisplay();
        updateQueryPreview();
        updateStrategyInsight();
        clearActivePreset();
      }
    });
  }
  if (rankUp) {
    rankUp.addEventListener('click', () => {
      if (state.rank < 14) {
        state.rank++;
        updateRankDisplay();
        updateQueryPreview();
        updateStrategyInsight();
        clearActivePreset();
      }
    });
  }

  // Rank modifier buttons
  document.querySelectorAll('.rank-mod').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rank-mod').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.rankModifier = btn.dataset.mod;
      updateConstraintTags();
      updateQueryPreview();
      updateStrategyInsight();
      clearActivePreset();
    });
  });

  // Suit select (compact)
  const suitSelect = document.getElementById('suit-select');
  if (suitSelect) {
    suitSelect.addEventListener('change', (e) => {
      state.suitedness = e.target.value;
      updateConstraintTags();
      updateQueryPreview();
      updateStrategyInsight();
      clearActivePreset();
    });
  }

  // Side cards select (compact)
  const sidecardsSelect = document.getElementById('sidecards-select');
  if (sidecardsSelect) {
    sidecardsSelect.addEventListener('change', (e) => {
      state.sideCards = e.target.value;
      updateConstraintTags();
      updateQueryPreview();
      updateStrategyInsight();
      clearActivePreset();
    });
  }

  // Copy query button
  document.getElementById('copy-query')?.addEventListener('click', () => {
    const queryCode = document.getElementById('query-code').textContent;
    navigator.clipboard.writeText(queryCode).then(() => {
      const btn = document.getElementById('copy-query');
      btn.textContent = '✓';
      setTimeout(() => btn.textContent = '📋', 1500);
    });
  });

  // Analyze button
  document.getElementById('analyze-btn')?.addEventListener('click', runScenarioAnalysis);

  // Initialize display
  updateRankDisplay();
  updateBuilderVisibility();
  updateConstraintTags();
}

function clearActivePreset() {
  document.querySelectorAll('.preset-chip').forEach(b => b.classList.remove('active'));
}

function updateBuilderVisibility() {
  const sidecardsCell = document.getElementById('sidecards-cell');
  const rankCell = document.getElementById('rank-cell');

  // Side cards only relevant for pairs
  if (sidecardsCell) {
    sidecardsCell.style.display = (state.structure === 'pair' || state.structure === 'dpair') ? 'flex' : 'none';
  }

  // Rank not relevant for "any" or "bway" structure
  if (rankCell) {
    rankCell.style.display = (state.structure === 'any' || state.structure === 'bway') ? 'none' : 'flex';
  }
}

function updateRankDisplay() {
  const display = document.getElementById('rank-display');
  if (display) {
    display.textContent = getRankChar(state.rank);
  }
}

function updateConstraintTags() {
  const container = document.getElementById('constraint-tags');
  if (!container) return;

  const tags = [];

  // Structure tag
  const structNames = { pair: 'Pair', dpair: 'Double Pair', run: 'Rundown', bway: 'Broadway', any: 'Any' };
  if (state.structure !== 'any') {
    tags.push(`<span class="tag">${structNames[state.structure]}</span>`);
  }

  // Rank tag
  if (state.structure !== 'any' && state.structure !== 'bway') {
    const rankName = getRankName(state.rank);
    const modStr = state.rankModifier === '+' ? '+' : (state.rankModifier === '-' ? '−' : '');
    tags.push(`<span class="tag">${rankName}${modStr}</span>`);
  }

  // Suitedness tag
  const suitNames = { ds: 'Double-Suited', ss: 'Single-Suited', r: 'Rainbow', any: '' };
  if (suitNames[state.suitedness]) {
    tags.push(`<span class="tag">${suitNames[state.suitedness]}</span>`);
  }

  // Side cards tag
  if ((state.structure === 'pair' || state.structure === 'dpair') && state.sideCards !== 'any') {
    const sideNames = { conn: 'Connected', bway: 'Broadway', wheel: 'Wheel' };
    tags.push(`<span class="tag">${sideNames[state.sideCards]} Kickers</span>`);
  }

  container.innerHTML = tags.join('');
}

function updateQueryPreview() {
  const query = buildQueryString();
  const description = describeQuery();
  const examples = generateSampleHands();

  document.getElementById('query-code').textContent = query;
  document.getElementById('query-description').textContent = description;
  document.getElementById('hand-cards').innerHTML = examples;
}

// Generate 3 varied example hands that match the current query
function generateSampleHands() {
  const suitClasses = { '♠': 'spade', '♥': 'heart', '♦': 'diamond', '♣': 'club' };

  // Helper to format a card with color
  const card = (rank, suit) => {
    const cls = suitClasses[suit];
    return `<span class="${cls}">${getRankChar(rank)}${suit}</span>`;
  };

  // Helper to make a hand string
  const hand = (cards) => cards.join('');

  const r = state.rank;
  const hands = [];

  // Get suit patterns based on suitedness
  const suitPatterns = getSuitPatterns(state.suitedness);

  if (state.structure === 'pair') {
    // 3 varied pairs with different kicker profiles
    const kickers = getVariedKickers(r, state.sideCards);

    hands.push(hand([card(r, suitPatterns[0][0]), card(r, suitPatterns[0][1]),
                     card(kickers[0][0], suitPatterns[0][2]), card(kickers[0][1], suitPatterns[0][3])]));
    hands.push(hand([card(r, suitPatterns[1][0]), card(r, suitPatterns[1][1]),
                     card(kickers[1][0], suitPatterns[1][2]), card(kickers[1][1], suitPatterns[1][3])]));
    hands.push(hand([card(r, suitPatterns[2][0]), card(r, suitPatterns[2][1]),
                     card(kickers[2][0], suitPatterns[2][2]), card(kickers[2][1], suitPatterns[2][3])]));

  } else if (state.structure === 'dpair') {
    // 3 varied double pairs with different second pair ranks
    const secondRanks = [r-1 > 1 ? r-1 : 13, r-3 > 1 ? r-3 : 11, r-5 > 1 ? r-5 : 9];

    for (let i = 0; i < 3; i++) {
      const r2 = secondRanks[i];
      hands.push(hand([card(r, suitPatterns[i][0]), card(r, suitPatterns[i][1]),
                       card(r2, suitPatterns[i][2]), card(r2, suitPatterns[i][3])]));
    }

  } else if (state.structure === 'run') {
    // 3 rundowns: tight (no gaps), 1-gap, different suit arrangements
    const rundowns = [
      [r, r-1, r-2, r-3],           // tight: AKQJ
      [r, r-1, r-3, r-4],           // 1-gap: AKJ T
      [r, r-2, r-3, r-4]            // top-gap: AQJ T
    ];

    for (let i = 0; i < 3; i++) {
      const rr = rundowns[i].map(x => x < 2 ? x + 13 : x);
      hands.push(hand([card(rr[0], suitPatterns[i][0]), card(rr[1], suitPatterns[i][1]),
                       card(rr[2], suitPatterns[i][2]), card(rr[3], suitPatterns[i][3])]));
    }

  } else if (state.structure === 'bway') {
    // 3 broadway variations
    const bways = [
      [14, 13, 12, 11],  // AKQJ
      [14, 13, 12, 10],  // AKQT
      [13, 12, 11, 10]   // KQJT
    ];

    for (let i = 0; i < 3; i++) {
      hands.push(hand([card(bways[i][0], suitPatterns[i][0]), card(bways[i][1], suitPatterns[i][1]),
                       card(bways[i][2], suitPatterns[i][2]), card(bways[i][3], suitPatterns[i][3])]));
    }

  } else {
    // Any - show truly varied hands
    hands.push(hand([card(14, '♠'), card(8, '♥'), card(7, '♦'), card(3, '♣')]));
    hands.push(hand([card(11, '♠'), card(11, '♥'), card(6, '♦'), card(5, '♣')]));
    hands.push(hand([card(9, '♠'), card(8, '♠'), card(4, '♥'), card(2, '♥')]));
  }

  // Format as 3 separate example hands
  return hands.map((h, i) => `<span class="example-hand">${h}</span>`).join('');
}

// Get suit patterns that satisfy the suitedness constraint
function getSuitPatterns(suitedness) {
  if (suitedness === 'ds') {
    return [
      ['♠', '♥', '♠', '♥'],  // spade-heart DS
      ['♦', '♣', '♦', '♣'],  // diamond-club DS
      ['♠', '♦', '♠', '♦']   // spade-diamond DS
    ];
  } else if (suitedness === 'ss') {
    return [
      ['♠', '♥', '♠', '♦'],  // spades suited
      ['♥', '♦', '♥', '♣'],  // hearts suited
      ['♦', '♠', '♦', '♥']   // diamonds suited
    ];
  } else if (suitedness === 'r') {
    return [
      ['♠', '♥', '♦', '♣'],
      ['♥', '♦', '♣', '♠'],
      ['♦', '♣', '♠', '♥']
    ];
  } else {
    // Any - mix of patterns
    return [
      ['♠', '♥', '♠', '♥'],
      ['♠', '♥', '♦', '♣'],
      ['♠', '♠', '♥', '♦']
    ];
  }
}

// Get varied kicker combinations for pairs
function getVariedKickers(pairRank, sideCards) {
  if (sideCards === 'conn') {
    // Connected to the pair
    const above = pairRank < 14 ? pairRank + 1 : 13;
    const below = pairRank > 2 ? pairRank - 1 : 14;
    return [
      [above, below],                           // wrap around pair
      [above, above > 2 ? above - 1 : 14],      // both above
      [below, below > 2 ? below - 1 : 14]       // both below
    ];
  } else if (sideCards === 'bway') {
    return [[13, 12], [13, 11], [12, 11]];  // KQ, KJ, QJ
  } else if (sideCards === 'wheel') {
    return [[5, 4], [5, 3], [4, 3]];  // 54, 53, 43
  } else {
    // Any - show varied kickers (high, mid, low)
    const high = pairRank === 14 ? 13 : 14;
    return [
      [high, high - 1],     // high kickers
      [8, 7],               // mid kickers
      [5, 3]                // low kickers
    ];
  }
}

function buildQueryString() {
  const parts = [state.structure];

  if (state.structure !== 'any') {
    const rankChar = getRankChar(state.rank);
    if (state.rankModifier === '+') {
      parts.push(`${rankChar}+`);
    } else if (state.rankModifier === '-') {
      parts.push(`${rankChar}-`);
    } else {
      parts.push(rankChar + rankChar);
    }
  }

  if (state.suitedness && state.suitedness !== 'any') {
    parts.push(state.suitedness);
  }

  if ((state.structure === 'pair' || state.structure === 'dpair') &&
      state.sideCards && state.sideCards !== 'any') {
    parts.push(state.sideCards);
  }

  return parts.join(':');
}

function getRankChar(rank) {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  if (rank === 10) return 'T';
  return rank.toString();
}

function describeQuery() {
  const structureNames = {
    'pair': 'Pair',
    'dpair': 'Double Pair',
    'run': 'Rundown',
    'bway': 'Broadway',
    'any': 'Any hand'
  };

  const suitNames = {
    'ds': 'double-suited',
    'ss': 'single-suited',
    'r': 'rainbow',
    'any': ''
  };

  const sideCardNames = {
    'conn': 'with connected kickers',
    'bway': 'with broadway kickers',
    'wheel': 'with wheel cards',
    'any': ''
  };

  let desc = structureNames[state.structure] || state.structure;

  if (state.structure !== 'any') {
    const rankName = getRankName(state.rank);
    if (state.rankModifier === '+') {
      desc += ` ${rankName} or better`;
    } else if (state.rankModifier === '-') {
      desc += ` ${rankName} or worse`;
    } else {
      desc += ` ${rankName}`;
    }
  }

  if (suitNames[state.suitedness]) {
    desc += ' ' + suitNames[state.suitedness];
  }

  if ((state.structure === 'pair' || state.structure === 'dpair') && sideCardNames[state.sideCards]) {
    desc += ' ' + sideCardNames[state.sideCards];
  }

  return desc;
}

function getRankName(rank) {
  const names = { 14: 'Aces', 13: 'Kings', 12: 'Queens', 11: 'Jacks', 10: 'Tens' };
  return names[rank] || rank + 's';
}

function applyPreset(queryStr) {
  // Parse query string and update state
  const parts = queryStr.split(':');

  // Structure
  state.structure = parts[0];
  const structSelect = document.getElementById('structure-select');
  if (structSelect) structSelect.value = parts[0];

  // Rank (if present)
  if (parts[1]) {
    const rankPart = parts[1];
    if (rankPart.endsWith('+')) {
      state.rankModifier = '+';
      state.rank = parseRankChar(rankPart.slice(0, -1));
    } else if (rankPart.endsWith('-')) {
      state.rankModifier = '-';
      state.rank = parseRankChar(rankPart.slice(0, -1));
    } else if (rankPart === 'any') {
      state.rank = 14;
      state.rankModifier = '=';
    } else {
      state.rankModifier = '=';
      state.rank = parseRankChar(rankPart.charAt(0));
    }

    // Update rank modifier buttons
    document.querySelectorAll('.rank-mod').forEach(b => {
      b.classList.toggle('active', b.dataset.mod === state.rankModifier);
    });
  }

  // Suitedness (if present)
  const suitPart = parts.find(p => ['ds', 'ss', 'r'].includes(p)) || 'any';
  state.suitedness = suitPart;
  const suitSelect = document.getElementById('suit-select');
  if (suitSelect) suitSelect.value = suitPart;

  // Side cards (if present for pair structures)
  const sidePart = parts.find(p => ['conn', 'bway', 'wheel'].includes(p)) || 'any';
  state.sideCards = sidePart;
  const sideSelect = document.getElementById('sidecards-select');
  if (sideSelect) sideSelect.value = sidePart;

  updateBuilderVisibility();
  updateRankDisplay();
  updateConstraintTags();
  updateQueryPreview();
  updateStrategyInsight();
}

function parseRankChar(char) {
  const c = char.toUpperCase();
  if (c === 'A') return 14;
  if (c === 'K') return 13;
  if (c === 'Q') return 12;
  if (c === 'J') return 11;
  if (c === 'T') return 10;
  return parseInt(c, 10);
}

async function runScenarioAnalysis() {
  const btn = document.getElementById('analyze-btn');
  btn.disabled = true;

  const updateStatus = (msg) => {
    btn.innerHTML = `<span class="btn-icon">⏳</span><span class="btn-text">${msg}</span>`;
  };

  try {
    updateStatus('Loading data...');

    // Use tiered data service - tries R2 first, then live simulation
    const { source, data } = await TieredDataService.fetchSimulationData(
      state.game,
      state.opponents + 1,
      { statusCallback: updateStatus }
    );

    // Show data source in results
    console.log(`Analysis data from: ${source} (${data.metadata?.iterations?.toLocaleString() || 'N/A'} iterations)`);
    displayScenarioResults(data);

  } catch (error) {
    console.error('Analysis error:', error);
    alert('Analysis failed: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🔍</span><span class="btn-text">Analyze Scenario</span>';
  }
}

function displayScenarioResults(result) {
  // Debug: Log the full result structure
  console.log('displayScenarioResults received:', JSON.stringify(result, null, 2).slice(0, 500));

  // Validate result structure
  if (!result) {
    console.error('displayScenarioResults: result is null/undefined');
    alert('Analysis failed: No data received');
    return;
  }
  if (!result.statistics) {
    console.error('displayScenarioResults: result.statistics is missing', result);
    alert('Analysis failed: Invalid data structure (no statistics)');
    return;
  }
  if (!result.metadata) {
    console.error('displayScenarioResults: result.metadata is missing', result);
    alert('Analysis failed: Invalid data structure (no metadata)');
    return;
  }

  const resultsSection = document.getElementById('results-section');
  resultsSection.style.display = 'block';

  // Update title
  document.getElementById('results-title').textContent = `Analysis: ${describeQuery()}`;

  // Extract REAL statistics from simulation data
  const stats = result.statistics;
  // Handle both nested (config.iterations) and flat (iterations) formats
  const handsAnalyzed = result.metadata.config?.iterations || result.metadata.iterations || 0;

  // Calculate actual win rate from hand type distribution
  let totalWins = 0;
  let totalHands = 0;
  if (stats.handTypeDistribution) {
    stats.handTypeDistribution.forEach(ht => {
      totalWins += ht.wins || 0;
      totalHands += ht.count || 0;
    });
  }
  const winRate = totalHands > 0 ? (totalWins / totalHands * 100).toFixed(1) : '0.0';

  // Calculate hand frequency from starting category if available
  let frequency = '~';
  if (stats.byStartingCategory) {
    const categories = Object.values(stats.byStartingCategory);
    const totalCatHands = categories.reduce((sum, cat) => sum + cat.count, 0);
    if (totalCatHands > 0) {
      frequency = (categories[0]?.count / totalCatHands * 100).toFixed(2);
    }
  }

  document.getElementById('stat-winrate').textContent = `${winRate}%`;
  document.getElementById('stat-hands').textContent = handsAnalyzed.toLocaleString();
  document.getElementById('stat-frequency').textContent = `${frequency}%`;

  // Strategic scores based on actual simulation data
  // Nut potential: higher if strong hands (flush, full house, quads) win more
  const strongHands = stats.handTypeDistribution?.filter(ht => ht.handType >= 5) || [];
  const strongHandWinRate = strongHands.length > 0
    ? strongHands.reduce((sum, ht) => sum + ht.winRate * ht.count, 0) / strongHands.reduce((sum, ht) => sum + ht.count, 0)
    : 50;
  const nutPotential = Math.min(95, Math.max(10, strongHandWinRate));

  // RNIO (Risk of Not Improving Odds): based on how often we have weak hands
  const weakHands = stats.handTypeDistribution?.filter(ht => ht.handType <= 1) || [];
  const weakHandPct = weakHands.length > 0
    ? weakHands.reduce((sum, ht) => sum + ht.percentage, 0)
    : 30;
  const rnioRisk = Math.min(80, Math.max(5, weakHandPct * 1.5));

  // Multiway strength: based on win rate consistency across hand types
  const avgWinRate = parseFloat(winRate);
  const multiwayStrength = Math.min(90, Math.max(15, avgWinRate * 2));

  document.getElementById('score-nut').style.width = `${nutPotential}%`;
  document.getElementById('score-nut-val').textContent = `${nutPotential.toFixed(0)}%`;

  document.getElementById('score-rnio').style.width = `${rnioRisk}%`;
  document.getElementById('score-rnio-val').textContent = `${rnioRisk.toFixed(0)}%`;

  document.getElementById('score-multiway').style.width = `${multiwayStrength}%`;
  document.getElementById('score-multiway-val').textContent = `${multiwayStrength.toFixed(0)}%`;

  // Update flop guidance based on hand type
  updateFlopGuidance();

  // Update multiway table
  updateMultiwayTable(result);

  // Scroll to results
  resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function updateFlopGuidance() {
  const goodFlops = document.getElementById('good-flops');
  const dangerFlops = document.getElementById('danger-flops');

  // Guidance varies by hand type
  if (state.structure === 'pair') {
    goodFlops.innerHTML = `
      <li>Set on dry board (e.g., K72 rainbow)</li>
      <li>Set with nut flush draw</li>
      <li>Underpair on very dry board</li>
    `;
    dangerFlops.innerHTML = `
      <li>Monotone without nut flush draw</li>
      <li>Set on highly coordinated board</li>
      <li>Underpair on wet, connected board</li>
    `;
  } else if (state.structure === 'run') {
    goodFlops.innerHTML = `
      <li>Nut straight on rainbow board</li>
      <li>13+ out wrap draws</li>
      <li>Made straight + flush draw</li>
    `;
    dangerFlops.innerHTML = `
      <li>Non-nut straight on flush board</li>
      <li>Low wrap with better wraps possible</li>
      <li>Paired boards reducing outs</li>
    `;
  } else if (state.structure === 'bway') {
    goodFlops.innerHTML = `
      <li>Broadway heavy flops (KQJ, QJT)</li>
      <li>Nut flush draws with pair</li>
      <li>Overpairs on low boards</li>
    `;
    dangerFlops.innerHTML = `
      <li>Low connected flops (678, 456)</li>
      <li>Monotone low boards</li>
      <li>Paired boards without trips</li>
    `;
  } else {
    goodFlops.innerHTML = `
      <li>Boards that complete your draws</li>
      <li>Nut flush draw opportunities</li>
      <li>Top set potential</li>
    `;
    dangerFlops.innerHTML = `
      <li>Monotone without suited cards</li>
      <li>Highly connected boards</li>
      <li>Paired + wet textures</li>
    `;
  }
}

function updateMultiwayTable(result) {
  const tbody = document.getElementById('multiway-body');
  tbody.innerHTML = '';

  // Show win rates for different opponent counts
  for (let opp = 1; opp <= 8; opp++) {
    // Simulate diminishing returns with more opponents
    const baseWin = 45 / (opp + 1);
    const adjustedWin = baseWin * (0.9 + Math.random() * 0.2);
    const nutRequired = opp >= 4 ? 'Yes' : (opp >= 2 ? 'Often' : 'Sometimes');

    let strategy = 'Play for value';
    if (opp >= 6) strategy = 'Nuts or fold';
    else if (opp >= 4) strategy = 'Nut draws only';
    else if (opp >= 2) strategy = 'Strong draws OK';

    const row = document.createElement('tr');
    if (opp === state.opponents) row.style.background = '#dbeafe';

    row.innerHTML = `
      <td>${opp}</td>
      <td>${adjustedWin.toFixed(1)}%</td>
      <td>${nutRequired}</td>
      <td>${strategy}</td>
    `;
    tbody.appendChild(row);
  }
}

// ============ MATRIX TAB ============

function initMatrix() {
  document.getElementById('run-matrix').addEventListener('click', runMatrixSimulation);

  // Auto-reload matrix when game or player count changes (if matrix tab is active)
  document.getElementById('matrix-game').addEventListener('change', () => {
    if (document.getElementById('matrix-tab').classList.contains('active')) {
      autoLoadMatrix();
    }
  });

  document.getElementById('matrix-players').addEventListener('change', () => {
    if (document.getElementById('matrix-tab').classList.contains('active')) {
      autoLoadMatrix();
    }
  });
}

async function runMatrixSimulation() {
  const game = document.getElementById('matrix-game').value;
  const players = parseInt(document.getElementById('matrix-players').value, 10);
  const forceRefresh = document.getElementById('matrix-iterations').value > 100000; // Force live sim for custom high iterations

  const btn = document.getElementById('run-matrix');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  const progress = document.getElementById('matrix-progress');
  const progressFill = document.getElementById('matrix-progress-fill');
  const progressText = document.getElementById('matrix-progress-text');
  progress.style.display = 'flex';

  // Progress animation
  let pct = 0;
  const interval = setInterval(() => {
    pct += Math.random() * 20;
    if (pct > 95) pct = 95;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${Math.round(pct)}%`;
  }, 200);

  try {
    // Use tiered data service - tries R2 first (1M pre-computed), then live simulation
    const { source, data } = await TieredDataService.fetchSimulationData(
      game,
      players,
      {
        forceRefresh,
        statusCallback: (msg) => { btn.textContent = msg; }
      }
    );

    clearInterval(interval);
    progressFill.style.width = '100%';
    progressText.textContent = '100%';

    // Log data source
    const iterations = data.metadata?.iterations?.toLocaleString() || 'N/A';
    console.log(`Matrix data from: ${source} (${iterations} iterations)`);
    btn.textContent = source === 'tier2' ? `Loaded (${iterations} cached)` : `Simulated (${iterations})`;

    displayMatrix(data);
    loadSavedSimulations();

    setTimeout(() => {
      progress.style.display = 'none';
    }, 1000);

  } catch (error) {
    clearInterval(interval);
    console.error('Matrix error:', error);
    alert('Simulation failed: ' + error.message);
    progress.style.display = 'none';
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Run Simulation';
    }, 2000);
  }
}

function displayMatrix(result) {
  const container = document.getElementById('matrix-container');
  const matrix = result.statistics.probabilityMatrix;

  // Store matrix data for drill-down
  window.currentMatrixData = result;

  // Helper to get threat percentage from matrix
  // THREAT LANDSCAPE: "When I have X, what % of hands have at least one opponent with Y?"
  function getThreatPct(rowIndex, colIndex) {
    if (Array.isArray(matrix) && Array.isArray(matrix[rowIndex])) {
      const entry = matrix[rowIndex][colIndex];
      // New format with threatPct
      if (entry && typeof entry.threatPct !== 'undefined') {
        return entry.threatPct;
      }
      // Fallback to winRate for old data (will be replaced after regeneration)
      if (entry && typeof entry.winRate !== 'undefined') {
        return entry.winRate;
      }
    }
    return 0;
  }

  let html = `
    <div class="matrix-header" style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h3>${result.metadata.config.gameVariant.toUpperCase()} - ${result.metadata.config.playerCount} Players</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem;">${result.metadata.config.iterations.toLocaleString()} iterations • Click a cell to explore</p>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="help-btn" id="matrix-help-btn" title="What does this matrix show?">❓ Help</button>
          <button class="save-sim-btn" id="save-simulation-btn" title="Save this simulation locally">💾</button>
        </div>
      </div>
    </div>
    <div class="matrix-explanation" style="background: var(--card-bg); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.85rem;">
      <strong>📊 Threat Landscape:</strong> Each cell shows the <em>% of hands</em> where at least one opponent has that hand type.
      <br><span style="color: var(--text-muted);">Row = Your hand | Column = Opponent's best hand | Higher % = More common threat</span>
    </div>
    <table class="matrix">
      <tr><th>Your Hand \\ Opponent's Best</th>`;

  HAND_TYPE_CODES.forEach(code => {
    html += `<th title="${HAND_TYPE_NAMES[code]}">${code}</th>`;
  });
  html += '</tr>';

  HAND_TYPE_CODES.forEach((rowCode, rowIndex) => {
    html += `<tr><td title="${HAND_TYPE_NAMES[rowCode]}">${rowCode}</td>`;

    HAND_TYPE_CODES.forEach((colCode, colIndex) => {
      const pct = getThreatPct(rowIndex, colIndex);
      const heatClass = getThreatHeatClass(pct);
      html += `<td class="${heatClass} clickable"
                   data-player-type="${rowIndex}"
                   data-opp-type="${colIndex}"
                   data-prob="${pct.toFixed(2)}"
                   title="When you have ${HAND_TYPE_NAMES[rowCode]}, ${pct.toFixed(1)}% of hands have an opponent with ${HAND_TYPE_NAMES[colCode]}">${pct.toFixed(1)}</td>`;
    });

    html += '</tr>';
  });

  html += '</table>';
  container.innerHTML = html;

  // Add click handlers to cells
  container.querySelectorAll('.matrix td.clickable').forEach(cell => {
    cell.addEventListener('click', () => {
      const playerType = parseInt(cell.dataset.playerType, 10);
      const oppType = parseInt(cell.dataset.oppType, 10);
      const prob = cell.dataset.prob;
      drillDownFromMatrix(playerType, oppType, prob);
    });
  });

  // Add save button handler
  const saveBtn = document.getElementById('save-simulation-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (typeof DataManager === 'undefined' || !window.currentMatrixData) {
        alert('No simulation data to save');
        return;
      }

      try {
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ Saving...';

        const id = await DataManager.saveUserSimulation(window.currentMatrixData);
        saveBtn.textContent = '✅ Saved!';

        // Refresh the saved simulations list
        await loadSavedSimulationsFromDB();

        setTimeout(() => {
          saveBtn.textContent = '💾 Save';
          saveBtn.disabled = false;
        }, 2000);

        console.log('Simulation saved:', id);
      } catch (error) {
        console.error('Failed to save simulation:', error);
        saveBtn.textContent = '❌ Error';
        setTimeout(() => {
          saveBtn.textContent = '💾 Save';
          saveBtn.disabled = false;
        }, 2000);
      }
    });
  }

  // Add help button handler
  const helpBtn = document.getElementById('matrix-help-btn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      openHelpModal();
    });
  }
}

// Drill down from matrix cell to scenario builder
function drillDownFromMatrix(playerHandType, oppHandType, probability) {
  const playerTypeName = HAND_TYPE_NAMES[HAND_TYPE_CODES[playerHandType]];
  const oppTypeName = HAND_TYPE_NAMES[HAND_TYPE_CODES[oppHandType]];

  // Map hand types to scenario builder structures
  const typeToStructure = {
    0: 'any',      // High Card
    1: 'pair',     // Pair
    2: 'dpair',    // Two Pair
    3: 'pair',     // Set (trips from pair)
    4: 'run',      // Straight
    5: 'bway',     // Flush (often broadway)
    6: 'dpair',    // Full House
    7: 'pair',     // Quads
    8: 'run'       // Straight Flush
  };

  // Update state to match the selected hand type
  state.structure = typeToStructure[playerHandType] || 'any';

  // Set reasonable defaults based on hand type
  if (playerHandType >= 3) {  // Premium hands (set+)
    state.rank = 14;  // Start with Aces
    state.suitedness = 'ds';
  } else if (playerHandType === 1) {  // Pair
    state.rank = 12;  // Queens
    state.suitedness = 'ds';
  } else if (playerHandType === 2) {  // Two Pair
    state.rank = 13;  // Kings
  }

  // Update UI elements
  const structSelect = document.getElementById('structure-select');
  if (structSelect) structSelect.value = state.structure;

  const suitSelect = document.getElementById('suit-select');
  if (suitSelect) suitSelect.value = state.suitedness;

  // Update all displays
  updateRankDisplay();
  updateBuilderVisibility();
  updateConstraintTags();
  updateQueryPreview();
  updateStrategyInsight();
  clearActivePreset();

  // Switch to scenario tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="scenario"]').classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('scenario-tab').classList.add('active');

  // Show context of where user came from
  showMatrixContext(playerTypeName, oppTypeName, probability);

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showMatrixContext(playerType, oppType, probability) {
  // Remove any existing context
  const existing = document.querySelector('.matrix-context-banner');
  if (existing) existing.remove();

  // Create context banner
  const banner = document.createElement('div');
  banner.className = 'matrix-context-banner';
  banner.innerHTML = `
    <span class="back-to-matrix" onclick="switchToMatrixTab()">← Back to Matrix</span>
    <span class="context-badge">Exploring: <strong>${playerType}</strong> vs ${oppType} (${probability}%)</span>
  `;
  banner.style.cssText = 'display: flex; align-items: center; margin-bottom: 12px; padding: 10px 0;';

  // Insert at top of scenario builder
  const scenarioBuilder = document.querySelector('.scenario-builder');
  if (scenarioBuilder) {
    scenarioBuilder.insertBefore(banner, scenarioBuilder.firstChild);
  }
}

function switchToMatrixTab() {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="matrix"]').classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('matrix-tab').classList.add('active');

  // Remove context banner
  const banner = document.querySelector('.matrix-context-banner');
  if (banner) banner.remove();
}

// Make function globally available
window.switchToMatrixTab = switchToMatrixTab;

function getHeatClass(value) {
  if (value <= 5) return 'heat-0';
  if (value <= 10) return 'heat-1';
  if (value <= 20) return 'heat-2';
  if (value <= 30) return 'heat-3';
  if (value <= 40) return 'heat-4';
  if (value <= 50) return 'heat-5';
  if (value <= 60) return 'heat-6';
  if (value <= 70) return 'heat-7';
  if (value <= 80) return 'heat-8';
  if (value <= 90) return 'heat-9';
  return 'heat-10';
}

// Threat landscape heat class - inverted coloring (higher = more danger = redder)
// Values can exceed 100% since multiple opponents can have different hand types
function getThreatHeatClass(value) {
  // Low threat (green) to high threat (red)
  if (value <= 5) return 'threat-0';   // Very rare - green
  if (value <= 15) return 'threat-1';
  if (value <= 25) return 'threat-2';
  if (value <= 35) return 'threat-3';
  if (value <= 45) return 'threat-4';  // Yellow zone
  if (value <= 55) return 'threat-5';
  if (value <= 65) return 'threat-6';
  if (value <= 75) return 'threat-7';  // Orange zone
  if (value <= 85) return 'threat-8';
  if (value <= 95) return 'threat-9';
  return 'threat-10';  // Very common threat - red
}

// ============ SAVED SIMULATIONS ============

async function loadSavedSimulations() {
  const savedList = document.getElementById('saved-list');
  let allSimulations = [];

  // Try loading from API (legacy server-stored simulations)
  try {
    const response = await fetch('/api/simulations');
    const apiSimulations = await response.json();
    allSimulations = apiSimulations.map(sim => ({
      ...sim,
      source: 'server',
      id: sim.filename
    }));
  } catch (error) {
    console.log('No server simulations available (expected in static deployment)');
  }

  // Load from IndexedDB (local simulations)
  await loadSavedSimulationsFromDB(allSimulations);
}

async function loadSavedSimulationsFromDB(existingSimulations = []) {
  const savedList = document.getElementById('saved-list');

  try {
    // Get local simulations from DataManager
    let localSims = [];
    if (typeof DataManager !== 'undefined') {
      localSims = await DataManager.listUserSimulations();
    }

    // Combine with any server simulations
    const allSimulations = [
      ...existingSimulations,
      ...localSims.map(sim => ({
        ...sim,
        source: 'local',
        game: sim.variant,
        players: sim.playerCount
      }))
    ];

    if (allSimulations.length === 0) {
      savedList.innerHTML = `
        <p class="loading">No saved simulations yet.</p>
        <p class="loading" style="font-size: 0.9rem; color: var(--text-muted);">
          Run a simulation in the Matrix tab, then click 💾 Save to store it locally.
        </p>`;
      return;
    }

    // Sort by creation date (newest first)
    allSimulations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    savedList.innerHTML = '';
    allSimulations.slice(0, 20).forEach(sim => {
      const item = document.createElement('div');
      item.className = 'saved-item';
      const sourceIcon = sim.source === 'local' ? '💾' : '☁️';
      const gameName = (sim.game || sim.variant || 'unknown').toUpperCase();
      const players = sim.players || sim.playerCount || '?';
      const iterations = (sim.iterations || 0).toLocaleString();
      const date = new Date(sim.createdAt).toLocaleDateString();

      item.innerHTML = `
        <div class="info">
          <span class="name">${sourceIcon} ${gameName} - ${players} Players</span>
          <span class="meta">${iterations} iterations • ${date}</span>
        </div>
        <div class="actions">
          <button class="action-btn" onclick="viewSavedSimulation('${sim.id}', '${sim.source}')">View</button>
          <button class="action-btn delete" onclick="deleteSimulation('${sim.id}', '${sim.source}')">🗑</button>
        </div>
      `;
      savedList.appendChild(item);
    });

    // Add storage usage info
    if (typeof DataManager !== 'undefined') {
      const usage = await DataManager.getUserStorageUsage();
      const quota = await DataManager.estimateStorageQuota();
      if (usage && quota) {
        const usageDiv = document.createElement('div');
        usageDiv.className = 'storage-info';
        usageDiv.innerHTML = `
          <span style="color: var(--text-muted); font-size: 0.8rem;">
            Local storage: ${usage.totalSizeMB} MB used of ${quota.availableMB} MB available
          </span>
        `;
        savedList.appendChild(usageDiv);
      }
    }
  } catch (error) {
    console.error('Failed to load local simulations:', error);
  }
}

async function viewSavedSimulation(id, source = 'server') {
  try {
    let data;

    if (source === 'local' && typeof DataManager !== 'undefined') {
      data = await DataManager.getUserSimulation(id);
    } else {
      const response = await fetch(`/api/simulations/${id}`);
      data = await response.json();
    }

    if (!data) {
      alert('Simulation not found');
      return;
    }

    // Switch to matrix tab and display
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tab="matrix"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('matrix-tab').classList.add('active');

    displayMatrix(Array.isArray(data) ? data[0] : data);
  } catch (error) {
    console.error('Failed to load simulation:', error);
    alert('Failed to load simulation');
  }
}

async function deleteSimulation(id, source = 'server') {
  if (!confirm('Delete this simulation?')) return;

  try {
    if (source === 'local' && typeof DataManager !== 'undefined') {
      await DataManager.deleteUserSimulation(id);
    } else {
      await fetch(`/api/simulations/${id}`, { method: 'DELETE' });
    }
    loadSavedSimulations();
  } catch (error) {
    console.error('Failed to delete:', error);
    alert('Failed to delete simulation');
  }
}

// Refresh saved list
document.getElementById('refresh-saved')?.addEventListener('click', loadSavedSimulations);

// ============ STRATEGY SYSTEM ============

function getHandKey() {
  const rankChar = getRankChar(state.rank);
  if (state.structure === 'any') return 'any:any';
  if (state.structure === 'bway') return 'bway:any';
  if (state.structure === 'dpair') return 'dpair:any';
  return `${state.structure}:${rankChar}`;
}

function calculateHandScore() {
  const handKey = getHandKey();

  // Get base strength
  let baseScore = STRATEGY_CONFIG.handStrength[handKey] ||
                  STRATEGY_CONFIG.handStrength[`${state.structure}:any`] || 40;

  // Apply rank modifier
  if (state.rankModifier === '+') baseScore += 8;  // "or better" adds value
  if (state.rankModifier === '-') baseScore -= 10; // "or worse" reduces value

  // Apply suitedness bonus
  baseScore += STRATEGY_CONFIG.suitBonus[state.suitedness] || 0;

  // Apply position modifier
  baseScore += STRATEGY_CONFIG.positionMod[state.position] || 0;

  // Apply multiway penalty for non-premium hands
  if (state.opponents >= 3) {
    const nutKey = `${handKey}:${state.suitedness}`;
    const nutPot = STRATEGY_CONFIG.nutPotential[nutKey] || 50;
    if (nutPot < 70) {
      baseScore -= (state.opponents - 2) * 5;
    }
  }

  return Math.max(0, Math.min(100, baseScore));
}

function getRecommendation(score) {
  const threshold = STRATEGY_CONFIG.styleThreshold[state.style] || 55;

  if (score >= threshold + 25) return { action: 'RAISE', class: 'rec-raise', text: 'Premium hand, raise for value' };
  if (score >= threshold + 10) return { action: 'RAISE', class: 'rec-raise', text: 'Strong hand, raise in position' };
  if (score >= threshold) return { action: 'CALL', class: 'rec-call', text: 'Playable, call or raise situationally' };
  if (score >= threshold - 10) return { action: 'SITUATIONAL', class: 'rec-situational', text: 'Marginal, position and reads matter' };
  return { action: 'FOLD', class: 'rec-fold', text: 'Below threshold for your style' };
}

function getNutPotential() {
  const handKey = getHandKey();
  const nutKey = `${handKey}:${state.suitedness}`;

  // Try exact match first
  let nutPot = STRATEGY_CONFIG.nutPotential[nutKey];

  // Fall back to structure defaults
  if (nutPot === undefined) {
    if (state.structure === 'pair') {
      nutPot = state.suitedness === 'ds' ? 70 : (state.suitedness === 'ss' ? 55 : 40);
      // Adjust for pair rank
      nutPot += Math.max(0, (state.rank - 10) * 3);
    } else if (state.structure === 'run') {
      nutPot = state.suitedness === 'ds' ? 65 : 50;
      nutPot += Math.max(0, (state.rank - 8) * 4);
    } else {
      nutPot = 50;
    }
  }

  return Math.min(100, nutPot);
}

function getMultiwayViability() {
  const nutPot = getNutPotential();
  let viability = nutPot;

  // Premium pairs lose viability multiway (they need to improve)
  if (state.structure === 'pair' && state.rank >= 12) {
    viability -= 15;
  }

  // Rundowns gain viability multiway (better implied odds)
  if (state.structure === 'run') {
    viability += 10;
  }

  // Double-suited adds multiway value
  if (state.suitedness === 'ds') {
    viability += 10;
  }

  // Reduce for each extra opponent beyond 2
  if (state.opponents > 2) {
    viability -= (state.opponents - 2) * 3;
  }

  return Math.max(0, Math.min(100, viability));
}

function getStrategyWarnings() {
  const warnings = [];
  const nutPot = getNutPotential();

  // Multiway with low nut potential
  if (state.opponents >= 4 && nutPot < 60) {
    warnings.push('⚠️ Low nut potential in multiway pot - proceed with caution');
  }

  // Second-nut flush danger
  if (state.structure === 'pair' && state.suitedness !== 'ds' && state.rank < 14) {
    if (state.opponents >= 3) {
      warnings.push('⚠️ Without nut flush potential, flush draws can be costly multiway');
    }
  }

  // Naked aces warning
  if (state.structure === 'pair' && state.rank === 14 && state.opponents >= 4) {
    warnings.push('⚠️ Naked Aces rarely win multiway - need set or nut flush on flop');
  }

  // Low rundown warning
  if (state.structure === 'run' && state.rank <= 8) {
    warnings.push('⚠️ Low rundowns often make non-nut straights - be ready to fold');
  }

  // Rainbow hands multiway
  if (state.suitedness === 'r' && state.opponents >= 3) {
    warnings.push('⚠️ Rainbow hands lose equity multiway without flush potential');
  }

  // Out of position
  if (state.position === 'UTG' || state.position === 'SB') {
    const score = calculateHandScore();
    if (score < 70) {
      warnings.push('⚠️ Playing OOP with marginal hand - tighten up or be prepared to check/fold');
    }
  }

  return warnings;
}

function updateStrategyInsight() {
  const contextEl = document.getElementById('insight-context');
  const badgeEl = document.getElementById('rec-badge');
  const textEl = document.getElementById('rec-text');
  const nutBarEl = document.getElementById('nut-potential-bar');
  const nutValEl = document.getElementById('nut-potential-val');
  const multiBarEl = document.getElementById('multiway-bar');
  const multiValEl = document.getElementById('multiway-val');
  const warningsEl = document.getElementById('insight-warnings');

  if (!contextEl) return;

  // Update context
  const styleNames = { rock: 'Rock', tag: 'TAG', lag: 'LAG' };
  contextEl.textContent = `${styleNames[state.style]} @ ${state.position} (${state.opponents + 1}-handed table)`;

  // Calculate recommendation
  const score = calculateHandScore();
  const rec = getRecommendation(score);

  // Update recommendation
  badgeEl.textContent = rec.action;
  badgeEl.className = `rec-badge ${rec.class}`;
  textEl.textContent = rec.text;

  // Update nut potential
  const nutPot = getNutPotential();
  nutBarEl.style.width = `${nutPot}%`;
  nutValEl.textContent = nutPot >= 80 ? 'High' : (nutPot >= 55 ? 'Medium' : 'Low');

  // Update multiway viability
  const multiway = getMultiwayViability();
  multiBarEl.style.width = `${multiway}%`;
  multiValEl.textContent = multiway >= 70 ? 'Strong' : (multiway >= 45 ? 'Medium' : 'Weak');

  // Update warnings
  const warnings = getStrategyWarnings();
  if (warnings.length > 0) {
    warningsEl.innerHTML = warnings.map(w =>
      `<div class="insight-warning"><span class="warn-icon">${w.slice(0, 2)}</span><span>${w.slice(3)}</span></div>`
    ).join('');
  } else {
    warningsEl.innerHTML = '';
  }
}

function updateMultiwayAlert() {
  const alertEl = document.getElementById('multiway-alert');
  if (!alertEl) return;

  alertEl.style.display = state.opponents >= 4 ? 'flex' : 'none';
}

function updatePresetRecommendations() {
  const presets = document.querySelectorAll('.preset-chip');

  presets.forEach(preset => {
    const query = preset.dataset.query;

    // Save current state
    const savedState = { ...state };

    // Apply preset temporarily
    applyPresetSilent(query);

    // Calculate score
    const score = calculateHandScore();
    const threshold = STRATEGY_CONFIG.styleThreshold[state.style] || 55;

    // Restore state
    Object.assign(state, savedState);

    // Update classes
    preset.classList.remove('recommended', 'not-recommended');
    if (score >= threshold + 10) {
      preset.classList.add('recommended');
    } else if (score < threshold - 5) {
      preset.classList.add('not-recommended');
    }
  });
}

function applyPresetSilent(queryStr) {
  // Parse query string and update state without triggering UI updates
  const parts = queryStr.split(':');

  state.structure = parts[0];

  if (parts[1]) {
    const rankPart = parts[1];
    if (rankPart.endsWith('+')) {
      state.rankModifier = '+';
      state.rank = parseRankChar(rankPart.slice(0, -1));
    } else if (rankPart.endsWith('-')) {
      state.rankModifier = '-';
      state.rank = parseRankChar(rankPart.slice(0, -1));
    } else if (rankPart === 'any') {
      state.rank = 14;
      state.rankModifier = '=';
    } else {
      state.rankModifier = '=';
      state.rank = parseRankChar(rankPart.charAt(0));
    }
  }

  const suitPart = parts.find(p => ['ds', 'ss', 'r'].includes(p)) || 'any';
  state.suitedness = suitPart;

  const sidePart = parts.find(p => ['conn', 'bway', 'wheel'].includes(p)) || 'any';
  state.sideCards = sidePart;
}

// ============ AI COACH SYSTEM ============

const AICoach = {
  provider: localStorage.getItem('ai-provider') || 'gemini',
  apiKey: localStorage.getItem('ai-api-key') || '',
  conversationHistory: [],

  // Check if AI is configured
  isConfigured: function() {
    return this.apiKey && this.apiKey.length > 10;
  },

  // Save settings
  saveSettings: function(provider, apiKey) {
    this.provider = provider;
    this.apiKey = apiKey;
    localStorage.setItem('ai-provider', provider);
    localStorage.setItem('ai-api-key', apiKey);
  },

  // Build system prompt with poker expertise
  buildSystemPrompt: function(context) {
    // Build simulation data section if available
    let simulationSection = '';
    if (context.simulationData && context.simulationData.totalHands) {
      simulationSection = `
MONTE CARLO SIMULATION RESULTS (${context.simulationData.dataSource}):
- Overall Win Rate: ${context.simulationData.overallWinRate}
- Hands Simulated: ${context.simulationData.totalHands?.toLocaleString()}

Hand Type Win Rates (from simulation):
${context.simulationData.handTypeStatistics?.map(ht =>
  `  ${ht.hand}: ${ht.winRate} win rate (occurred ${ht.frequency} of hands)`
).join('\n') || 'No data'}

${context.simulationData.threatLandscape ? `
THREAT LANDSCAPE (what hands are your opponents likely to have?):
These percentages show how often at least one opponent has each hand type when YOU have a specific hand.
Higher % = more common threat. Values can exceed 100% because multiple opponents can have different hands.

${Object.entries(context.simulationData.threatLandscape).map(([yourHand, threats]) =>
  `  When you have ${yourHand}:\n${threats.map(t => `    - ${t.oppHand}: ${t.threatPct}% of hands (${t.threatPct > 70 ? 'VERY COMMON' : t.threatPct > 40 ? 'COMMON' : t.threatPct > 15 ? 'moderate' : 'rare'})`).join('\n')}`
).join('\n')}

KEY INSIGHT: Use this to assess your vulnerability. If 80%+ of hands have opponents with Two Pair or better when you have One Pair, your hand is very vulnerable!` : ''}
`;
    } else {
      simulationSection = `
NOTE: No simulation has been run yet. The statistics below are mathematical fundamentals.
Run a simulation to get empirical data for this specific scenario.
`;
    }

    return `You are an expert PLO (Pot-Limit Omaha) poker coach helping a player understand strategic decisions. You build credibility by citing specific statistics.

CURRENT SCENARIO:
- Hand: ${context.hand.structure} ${context.hand.rankName} ${context.hand.suitednessName}
- Position: ${context.situation.positionName} (${context.situation.position})
- Table Size: ${context.situation.opponents + 1} players (${context.situation.opponents} opponents)
- Playing Style: ${context.situation.styleName}
${simulationSection}
CRITICAL DISTINCTION - TABLE SIZE VS POT PARTICIPANTS:
The simulation data is based on ${context.situation.opponents + 1}-handed play (table size), NOT opponents actually in the pot.
- "Table size" = total players dealt cards
- "Opponents in pot" = players who haven't folded (varies hand-to-hand)
- POSITION determines how many players will likely enter the pot:
  * UTG/EP: Expect 3-5 callers on average at full table; raise big to thin the field
  * MP: Expect 2-4 callers; can open slightly wider
  * CO: Expect 1-3 callers; position advantage compensates
  * BTN: Expect 1-2 callers (blinds); widest opening range, best position postflop
  * SB: Awkward postflop; play tight or 3-bet to play heads-up
  * BB: Already invested; defend vs steals, but position disadvantage postflop

HAND NOTATION (the -/=/+ settings in the UI):
- Minus (-): Kicker is LOWER than main rank (e.g., AA with 7-6 kickers)
- Equal (=): Kicker is SIMILAR to main rank (e.g., AA with Q-J kickers)
- Plus (+): Kicker is CONNECTED/suited with main rank (e.g., AA with A-K suited)
Current hand uses: ${context.hand.structure} structure with ${context.hand.suitednessName} suitedness

POSITIONAL BETTING STRATEGY:
PREFLOP by position at ${context.situation.opponents + 1}-handed:
- UTG/EP (${context.situation.position === 'UTG' ? 'YOUR POSITION' : ''}): Raise 3-4x to fold out speculative hands. Only premium holdings.
- MP (${context.situation.position === 'MP' ? 'YOUR POSITION' : ''}): Can open slightly wider. Raise to isolate.
- CO (${context.situation.position === 'CO' ? 'YOUR POSITION' : ''}): Attack blinds. 3-bet light against late position opens.
- BTN (${context.situation.position === 'BTN' ? 'YOUR POSITION' : ''}): Widest range. Position postflop is huge edge.
- SB (${context.situation.position === 'SB' ? 'YOUR POSITION' : ''}): 3-bet or fold. Completing is usually -EV.
- BB (${context.situation.position === 'BB' ? 'YOUR POSITION' : ''}): Defend wider vs steals, tighter vs early raises.

POSTFLOP POSITIONAL CONSIDERATIONS:
- IN POSITION: Can control pot size, see opponent actions first, bluff more effectively
- OUT OF POSITION: Must play more straightforwardly, check-raise or check-fold more often
- MULTIWAY: Bluff less, value bet thinner, need stronger made hands
- HEADS-UP: Can leverage position and aggression more

POKER MATH FUNDAMENTALS (always true):
${Object.entries(context.statistics).filter(([k]) => k !== 'dataNote').map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`).join('\n')}

OUTS REFERENCE:
- Flush draw: 9 outs (~19% turn, ~35% turn+river)
- Open-ended straight: 8 outs (~17% turn, ~31% turn+river)
- Gutshot: 4 outs (~8.5% turn, ~17% turn+river)
- Set (from pair): 2 outs (~4% turn, ~8.5% turn+river)
- Wrap (13 outs): ~28% turn, ~50% turn+river
- Big wrap (16+ outs): ~34% turn, ~57% turn+river

Quick rule: Multiply outs by 2 for turn odds, by 4 for turn+river (rough approximation)

ASSESSMENT:
- Strengths: ${context.assessment.strengths.join(', ') || 'None identified'}
- Warnings: ${context.assessment.warnings.join(', ') || 'None'}
- Multiway Advice: ${context.assessment.multiwayAdvice}

YOUR ROLE:
1. ALWAYS cite specific numbers from the simulation results when available
2. Distinguish between simulation data (empirical) and poker math (theoretical)
3. Explain the WHY behind recommendations using these statistics
4. When discussing odds, cite the exact percentages and outs
5. Answer follow-up questions about post-flop play, board textures, opponent ranges
6. ALWAYS clarify table size vs expected opponents in pot based on position
7. Give position-specific preflop and postflop advice

CREDIBILITY RULES:
- Lead with simulation statistics when available - these are from ${context.simulationData?.iterations?.toLocaleString() || 'N/A'} actual hands
- Use poker math fundamentals to explain concepts
- Be specific: "With 9 flush outs, you have a 35% chance to hit by the river"
- Explain edge cases and adjustments (blockers, card removal effects)
- When discussing multiway pots, note that the simulation assumes all ${context.situation.opponents + 1} players see the flop - actual pots may be smaller

STYLE:
- Conversational but authoritative
- Use poker terminology, explain jargon naturally
- Give concrete examples from the current scenario
- Be direct - players want actionable insight`;
  },

  // Send message to AI
  sendMessage: async function(userMessage, context) {
    const systemPrompt = this.buildSystemPrompt(context);

    // Add user message to history
    this.conversationHistory.push({ role: 'user', content: userMessage });

    try {
      if (this.provider === 'anthropic') {
        return await this.callAnthropic(systemPrompt);
      } else if (this.provider === 'gemini') {
        return await this.callGemini(systemPrompt);
      } else if (this.provider === 'groq') {
        return await this.callGroq(systemPrompt);
      } else {
        return await this.callOpenAI(systemPrompt);
      }
    } catch (error) {
      console.error('AI API error:', error);
      throw error;
    }
  },

  // Call Anthropic API
  callAnthropic: async function(systemPrompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: this.conversationHistory
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    const assistantMessage = data.content[0].text;

    // Add assistant response to history
    this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

    return assistantMessage;
  },

  // Call OpenAI API
  callOpenAI: async function(systemPrompt) {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;

    // Add assistant response to history
    this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

    return assistantMessage;
  },

  // Call Google Gemini API (free tier available)
  callGemini: async function(systemPrompt) {
    // Convert conversation history to Gemini format
    const contents = this.conversationHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: 1024 }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Gemini API request failed');
    }

    const data = await response.json();
    const assistantMessage = data.candidates[0].content.parts[0].text;

    // Add assistant response to history
    this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

    return assistantMessage;
  },

  // Call Groq API (free tier available, very fast)
  callGroq: async function(systemPrompt) {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Groq API request failed');
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;

    // Add assistant response to history
    this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

    return assistantMessage;
  },

  // Test connection
  testConnection: async function() {
    const testPrompt = 'Reply with just "Connected successfully" to confirm the API is working.';
    this.conversationHistory = [{ role: 'user', content: testPrompt }];

    try {
      const systemPrompt = 'You are a helpful assistant. Reply briefly.';
      if (this.provider === 'anthropic') {
        await this.callAnthropic(systemPrompt);
      } else if (this.provider === 'gemini') {
        await this.callGemini(systemPrompt);
      } else if (this.provider === 'groq') {
        await this.callGroq(systemPrompt);
      } else {
        await this.callOpenAI(systemPrompt);
      }
      this.conversationHistory = []; // Clear test messages
      return { success: true };
    } catch (error) {
      this.conversationHistory = [];
      return { success: false, error: error.message };
    }
  },

  // Clear conversation
  clearConversation: function() {
    this.conversationHistory = [];
  }
};

// Initialize AI UI
function initAICoach() {
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettings = document.getElementById('close-settings');
  const cancelSettings = document.getElementById('cancel-settings');
  const saveSettings = document.getElementById('save-settings');
  const testConnection = document.getElementById('test-connection');
  const toggleVisibility = document.getElementById('toggle-key-visibility');
  const providerSelect = document.getElementById('ai-provider');
  const apiKeyInput = document.getElementById('ai-api-key');
  const providerHint = document.getElementById('provider-hint');
  const connectionStatus = document.getElementById('connection-status');

  const explainBtn = document.getElementById('explain-btn');
  const aiPanel = document.getElementById('ai-panel');
  const closeAiPanel = document.getElementById('close-ai-panel');
  const newChat = document.getElementById('new-chat');
  const aiMessages = document.getElementById('ai-messages');
  const aiInput = document.getElementById('ai-input');
  const sendAiMessage = document.getElementById('send-ai-message');
  const noKeyPrompt = document.getElementById('no-key-prompt');
  const openSettingsFromPrompt = document.getElementById('open-settings-from-prompt');

  // Load saved settings
  if (AICoach.provider) providerSelect.value = AICoach.provider;
  if (AICoach.apiKey) apiKeyInput.value = AICoach.apiKey;

  // Settings modal handlers
  settingsBtn?.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });

  [closeSettings, cancelSettings].forEach(btn => {
    btn?.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });
  });

  settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.style.display = 'none';
  });

  // Provider change updates hint
  providerSelect?.addEventListener('change', () => {
    const hints = {
      anthropic: 'Get your key at <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>',
      openai: 'Get your key at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>',
      gemini: '🆓 Free tier! Get key at <a href="https://aistudio.google.com/app/apikey" target="_blank">aistudio.google.com</a>',
      groq: '🆓 Free tier! Get key at <a href="https://console.groq.com/keys" target="_blank">console.groq.com</a>'
    };
    providerHint.innerHTML = hints[providerSelect.value];
  });

  // Toggle password visibility
  toggleVisibility?.addEventListener('click', () => {
    apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
  });

  // Test connection
  testConnection?.addEventListener('click', async () => {
    connectionStatus.textContent = 'Testing...';
    connectionStatus.className = 'connection-status';

    AICoach.provider = providerSelect.value;
    AICoach.apiKey = apiKeyInput.value;

    const result = await AICoach.testConnection();

    if (result.success) {
      connectionStatus.textContent = '✓ Connected!';
      connectionStatus.className = 'connection-status success';
    } else {
      connectionStatus.textContent = '✗ ' + result.error;
      connectionStatus.className = 'connection-status error';
    }
  });

  // Save settings
  saveSettings?.addEventListener('click', () => {
    AICoach.saveSettings(providerSelect.value, apiKeyInput.value);
    settingsModal.style.display = 'none';
    connectionStatus.textContent = '';
  });

  // Explain button
  explainBtn?.addEventListener('click', () => {
    if (!AICoach.isConfigured()) {
      noKeyPrompt.style.display = 'block';
      return;
    }

    noKeyPrompt.style.display = 'none';
    aiPanel.style.display = 'flex';
    AICoach.clearConversation();
    aiMessages.innerHTML = '';

    // Send initial explanation request
    sendExplanationRequest();
  });

  // Close AI panel
  closeAiPanel?.addEventListener('click', () => {
    aiPanel.style.display = 'none';
  });

  // New chat
  newChat?.addEventListener('click', () => {
    AICoach.clearConversation();
    aiMessages.innerHTML = '';
    sendExplanationRequest();
  });

  // Send message
  const sendMessage = async () => {
    const message = aiInput.value.trim();
    if (!message) return;

    aiInput.value = '';
    addMessage('user', message);
    await getAIResponse(message);
  };

  sendAiMessage?.addEventListener('click', sendMessage);
  aiInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Open settings from no-key prompt
  openSettingsFromPrompt?.addEventListener('click', () => {
    noKeyPrompt.style.display = 'none';
    settingsModal.style.display = 'flex';
  });

  // Close no-key prompt when clicking outside
  document.addEventListener('click', (e) => {
    if (noKeyPrompt.style.display === 'block' &&
        !noKeyPrompt.contains(e.target) &&
        e.target !== explainBtn) {
      noKeyPrompt.style.display = 'none';
    }
  });
}

// Get simulation data for AI context - uses current matrix data or falls back to bundled data
function getSimulationDataForAI() {
  // First choice: current matrix data from a running simulation
  if (window.currentMatrixData) {
    return { data: window.currentMatrixData, source: 'simulation' };
  }

  // Fallback: bundled Tier 1 data for current player count
  if (window.bundledData && window.bundledData.byPlayerCount) {
    const playerCount = state.opponents + 1; // opponents + hero
    const bundledForPlayers = window.bundledData.byPlayerCount[playerCount];
    if (bundledForPlayers) {
      return {
        data: {
          statistics: bundledForPlayers,
          metadata: {
            variant: window.bundledData.variant,
            playerCount: playerCount,
            iterations: window.bundledData.iterationsPerConfig
          }
        },
        source: 'bundled'
      };
    }
  }

  return { data: null, source: 'none' };
}

function sendExplanationRequest() {
  const simInfo = getSimulationDataForAI();
  const context = PokerStats.buildAIContext(state, simInfo.data);

  // Add data source info to context
  context.dataSource = simInfo.source;

  const initialPrompt = `I'm looking at ${context.hand.structure} ${context.hand.rankName} ${context.hand.suitednessName} in ${context.situation.positionName} at a ${context.situation.opponents + 1}-handed table, playing a ${context.situation.styleName} style.

Please explain:
1. Whether this is a playable hand and why
2. The key statistics I should know (set probability, flush draw odds, etc.)
3. What I should look for on the flop
4. Any warnings or considerations for this specific situation`;

  addMessage('user', `Explain this hand: ${context.hand.rankName} ${context.hand.suitednessName}`);
  getAIResponse(initialPrompt);
}

function addMessage(role, content) {
  const aiMessages = document.getElementById('ai-messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `ai-message ${role}`;

  // Simple markdown-like formatting
  let formattedContent = content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/^- /gm, '• ');

  messageDiv.innerHTML = `<div class="ai-message-content">${formattedContent}</div>`;
  aiMessages.appendChild(messageDiv);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

function addLoadingMessage() {
  const aiMessages = document.getElementById('ai-messages');
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'ai-message assistant';
  loadingDiv.id = 'ai-loading';
  loadingDiv.innerHTML = '<div class="ai-loading">Thinking</div>';
  aiMessages.appendChild(loadingDiv);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

function removeLoadingMessage() {
  const loading = document.getElementById('ai-loading');
  if (loading) loading.remove();
}

async function getAIResponse(message) {
  const simInfo = getSimulationDataForAI();
  const context = PokerStats.buildAIContext(state, simInfo.data);
  context.dataSource = simInfo.source;

  addLoadingMessage();

  try {
    const response = await AICoach.sendMessage(message, context);
    removeLoadingMessage();
    addMessage('assistant', response);
  } catch (error) {
    removeLoadingMessage();
    addMessage('assistant', `Error: ${error.message}. Please check your API key in settings.`);
  }
}

// Initialize help modal for matrix
function initHelpModal() {
  const helpModal = document.getElementById('help-modal');
  const closeHelp = document.getElementById('close-help');
  const closeHelpBtn = document.getElementById('close-help-btn');

  // Close help modal handlers
  [closeHelp, closeHelpBtn].forEach(btn => {
    btn?.addEventListener('click', () => {
      helpModal.style.display = 'none';
    });
  });

  // Close on backdrop click
  helpModal?.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.style.display = 'none';
  });

  // Note: The help button in the matrix is wired up dynamically in displayMatrix
}

// Open help modal (called from matrix help button)
function openHelpModal() {
  const helpModal = document.getElementById('help-modal');
  if (helpModal) helpModal.style.display = 'flex';
}
window.openHelpModal = openHelpModal;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initAICoach();
  initHelpModal();
});

// Make functions globally available
window.viewSavedSimulation = viewSavedSimulation;
window.deleteSimulation = deleteSimulation;
