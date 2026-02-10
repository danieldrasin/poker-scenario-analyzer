// Poker Statistics Module
// Provides encyclopedic odds calculations for AI credibility

const PokerStats = {

  // ============ CONSTANTS ============

  DECK_SIZE: 52,
  OMAHA_HOLE_CARDS: 4,
  FLOP_CARDS: 3,

  // Combinatorics helper
  combinations: function(n, r) {
    if (r > n || r < 0) return 0;
    if (r === 0 || r === n) return 1;
    let result = 1;
    for (let i = 0; i < r; i++) {
      result = result * (n - i) / (i + 1);
    }
    return Math.round(result);
  },

  // ============ SET/TRIPS PROBABILITIES ============

  // Probability of flopping a set with a pocket pair
  setProbability: function() {
    // With a pair (2 cards of same rank), 2 remaining cards of that rank in deck
    // After dealing 4 hole cards, 48 cards remain
    // Need exactly 1 of our 2 outs on the flop (3 cards)

    // P(at least one of our 2 outs in 3 cards from 48)
    // = 1 - P(none of our outs)
    // = 1 - C(46,3) / C(48,3)

    const noSet = this.combinations(46, 3) / this.combinations(48, 3);
    return {
      probability: (1 - noSet) * 100,
      outs: 2,
      description: "Probability of flopping at least one more of your pair rank",
      calculation: "1 - C(46,3)/C(48,3) = 1 - 15180/17296"
    };
  },

  // ============ FLUSH DRAW PROBABILITIES ============

  // Probability of flopping a flush draw (4 to a flush) with suited cards
  flushDrawProbability: function(suitedCards) {
    // suitedCards: number of cards of same suit in hand (2 for single-suited, etc.)
    // Remaining cards of that suit: 13 - suitedCards
    // Need exactly 2 of that suit on flop for a flush draw

    const remaining = 48; // cards after 4 hole cards dealt
    const suitRemaining = 13 - suitedCards;
    const nonSuit = remaining - suitRemaining;

    // P(exactly 2 of suit in 3 cards)
    const exactly2 = (this.combinations(suitRemaining, 2) * this.combinations(nonSuit, 1)) /
                     this.combinations(remaining, 3);

    return {
      probability: exactly2 * 100,
      suitedCards: suitedCards,
      outsToFlush: suitRemaining,
      description: `Probability of flopping exactly 2 more of your suit (giving flush draw)`,
      calculation: `C(${suitRemaining},2) × C(${nonSuit},1) / C(${remaining},3)`
    };
  },

  // Probability of flopping a made flush with suited cards
  madeFlushProbability: function(suitedCards) {
    const remaining = 48;
    const suitRemaining = 13 - suitedCards;

    // P(all 3 flop cards are our suit)
    const all3 = this.combinations(suitRemaining, 3) / this.combinations(remaining, 3);

    return {
      probability: all3 * 100,
      description: "Probability of flopping a made flush",
      calculation: `C(${suitRemaining},3) / C(${remaining},3)`
    };
  },

  // ============ STRAIGHT DRAW PROBABILITIES ============

  // Probability of flopping a wrap (13+ outs to straight) with a rundown
  wrapProbability: function(gapCount) {
    // This is approximate - exact calculation depends on specific cards
    // Tight rundown (no gaps): ~25% wrap, ~8% made straight
    // 1-gap rundown: ~18% wrap, ~5% made straight
    // 2-gap rundown: ~12% wrap, ~3% made straight

    const wrapRates = { 0: 25, 1: 18, 2: 12 };
    const straightRates = { 0: 8.5, 1: 5.2, 2: 3.1 };

    return {
      wrapProbability: wrapRates[gapCount] || 10,
      madeStraightProbability: straightRates[gapCount] || 2,
      gapCount: gapCount,
      description: gapCount === 0 ?
        "Connected rundown - high wrap potential" :
        `Rundown with ${gapCount} gap(s) - reduced wrap potential`
    };
  },

  // ============ OUTS CALCULATIONS ============

  outs: {
    // Standard draw outs
    flushDraw: 9,        // 4 to a flush, 9 remaining of suit
    openEndedStraight: 8, // 8 cards complete the straight
    gutshot: 4,          // 4 cards complete the straight
    set: 2,              // 2 cards to make set from pair
    trips: 7,            // 7 cards to make trips from unpaired
    twoPair: 5,          // Approximate for making two pair

    // Wrap outs (Omaha-specific)
    wrap13: 13,          // 13-card wrap (e.g., 5678 on 49T board)
    wrap16: 16,          // 16-card wrap
    wrap17: 17,          // 17-card wrap
    wrap20: 20,          // Monster wrap (20 outs)

    // Combined draws
    flushDrawPlusPair: 9 + 5,      // ~14 outs (some overlap)
    flushDrawPlusGutshot: 9 + 4 - 1, // ~12 outs (1 overlap)
    flushDrawPlusOpenEnded: 9 + 8 - 2, // ~15 outs (2 overlap)
  },

  // Calculate probability of hitting outs
  outsToProbability: function(outs, cardsToComeTurns) {
    // cardsToComeTurns: 1 for turn only, 2 for turn + river
    const remaining = 47; // after flop, 47 unknown cards

    if (cardsToComeTurns === 1) {
      // Just turn
      return (outs / remaining) * 100;
    } else {
      // Turn + river (1 - miss both)
      const missOnce = (remaining - outs) / remaining;
      const missTwice = missOnce * ((remaining - 1 - outs) / (remaining - 1));
      return (1 - missTwice) * 100;
    }
  },

  // Quick outs-to-percentage approximations
  outsApprox: function(outs) {
    return {
      outs: outs,
      turnOnly: (outs * 2.1).toFixed(1), // ~2% per out
      turnAndRiver: (outs * 4).toFixed(1), // ~4% per out (rough)
      exactTurnAndRiver: this.outsToProbability(outs, 2).toFixed(1),
      rule: "Multiply outs by 2 for turn, by 4 for turn+river (rough)"
    };
  },

  // ============ MULTIWAY ADJUSTMENTS ============

  // How equity changes with more opponents
  multiwayEquityAdjustment: function(baseEquity, opponents) {
    // In PLO, equity drops faster than NLH with more opponents
    // Rough model: equity ≈ baseEquity / (1 + 0.35 * (opponents - 1))

    const adjusted = baseEquity / (1 + 0.35 * (opponents - 1));
    return {
      baseEquity: baseEquity,
      opponents: opponents,
      adjustedEquity: adjusted,
      reduction: baseEquity - adjusted,
      note: opponents >= 4 ?
        "In 4+ way pots, even strong hands lose significant equity" :
        "Moderate equity reduction in multiway pot"
    };
  },

  // ============ PREFLOP HAND STATISTICS ============

  // Get comprehensive stats for a hand type
  getHandStats: function(structure, rank, suitedness) {
    const stats = {
      structure,
      rank,
      suitedness,
      probabilities: {},
      outs: {},
      warnings: [],
      strengths: []
    };

    // Set probabilities for pairs
    if (structure === 'pair') {
      const setProb = this.setProbability();
      stats.probabilities.setOnFlop = setProb.probability.toFixed(1) + '%';
      stats.outs.toSet = 2;

      if (rank >= 12) { // QQ+
        stats.strengths.push('Top set potential - dominates other sets');
      } else if (rank <= 8) {
        stats.warnings.push('Low set potential - can be dominated by higher sets');
      }
    }

    // Flush draw probabilities based on suitedness
    if (suitedness === 'ds') {
      const fd1 = this.flushDrawProbability(2);
      const fd2 = this.flushDrawProbability(2);
      stats.probabilities.flushDrawOnFlop = (fd1.probability + fd2.probability).toFixed(1) + '%';
      stats.probabilities.nutFlushPotential = 'Both suits';
      stats.strengths.push('Double-suited provides two flush draw opportunities');
      stats.outs.toFlush = 9; // per suit
    } else if (suitedness === 'ss') {
      const fd = this.flushDrawProbability(2);
      stats.probabilities.flushDrawOnFlop = fd.probability.toFixed(1) + '%';
      stats.probabilities.nutFlushPotential = rank >= 14 ? 'Nut flush possible' : 'Non-nut flush risk';
      stats.outs.toFlush = 9;
      if (rank < 14) {
        stats.warnings.push('Single suited without Ace - flush may not be the nuts');
      }
    } else {
      stats.probabilities.flushDrawOnFlop = 'N/A (rainbow)';
      stats.warnings.push('No flush potential - reduced multiway viability');
    }

    // Straight potential for rundowns
    if (structure === 'run') {
      const wrapStats = this.wrapProbability(0); // assume tight rundown
      stats.probabilities.wrapOnFlop = wrapStats.wrapProbability.toFixed(1) + '%';
      stats.probabilities.madeStraightOnFlop = wrapStats.madeStraightProbability.toFixed(1) + '%';
      stats.strengths.push('Rundown structure provides excellent straight potential');

      if (rank <= 8) {
        stats.warnings.push('Low rundown - straights may not be the nuts');
      }
      if (rank >= 11) {
        stats.strengths.push('High rundown - straights will often be the nuts');
      }
    }

    return stats;
  },

  // ============ POSITION STATISTICS ============

  positionStats: {
    'UTG': {
      name: 'Under the Gun',
      playersToAct: '5-8 behind',
      recommendedVPIP: { rock: '8-12%', tag: '12-18%', lag: '20-28%' },
      notes: 'Tightest position. Need strong hands to overcome positional disadvantage.'
    },
    'MP': {
      name: 'Middle Position',
      playersToAct: '3-5 behind',
      recommendedVPIP: { rock: '12-16%', tag: '18-24%', lag: '26-32%' },
      notes: 'Moderate caution. Can open slightly wider than UTG.'
    },
    'CO': {
      name: 'Cutoff',
      playersToAct: '2 behind (BTN, Blinds)',
      recommendedVPIP: { rock: '18-22%', tag: '25-32%', lag: '35-42%' },
      notes: 'Strong stealing position. Often acts as pseudo-button if BTN folds.'
    },
    'BTN': {
      name: 'Button',
      playersToAct: '0 behind postflop',
      recommendedVPIP: { rock: '22-28%', tag: '35-45%', lag: '45-55%' },
      notes: 'Best position. Guaranteed last to act postflop. Can play widest range.'
    },
    'SB': {
      name: 'Small Blind',
      playersToAct: 'First postflop',
      recommendedVPIP: { rock: '15-20%', tag: '25-32%', lag: '35-42%' },
      notes: 'Worst postflop position. Already invested 0.5BB. Complete or raise, rarely just call.'
    },
    'BB': {
      name: 'Big Blind',
      playersToAct: 'Second postflop',
      recommendedVPIP: { rock: 'Defend 25-35%', tag: 'Defend 40-50%', lag: 'Defend 55-65%' },
      notes: 'Already invested 1BB. Defend wider vs steals, but OOP postflop.'
    }
  },

  // ============ AI CONTEXT BUILDER ============

  // Build comprehensive context for AI explanations
  buildAIContext: function(state, simulationData = null) {
    const handStats = this.getHandStats(state.structure, state.rank, state.suitedness);
    const posStats = this.positionStats[state.position];

    const context = {
      // Hand information
      hand: {
        structure: state.structure,
        rank: state.rank,
        rankName: this.rankName(state.rank),
        suitedness: state.suitedness,
        suitednessName: { ds: 'double-suited', ss: 'single-suited', r: 'rainbow', any: 'any' }[state.suitedness]
      },

      // Situation
      situation: {
        position: state.position,
        positionName: posStats.name,
        opponents: state.opponents,
        style: state.style,
        styleName: { rock: 'Rock (Tight-Passive)', tag: 'TAG (Tight-Aggressive)', lag: 'LAG (Loose-Aggressive)' }[state.style]
      },

      // Calculated statistics (for credibility)
      statistics: {
        ...handStats.probabilities,
        outs: handStats.outs,
        positionVPIP: posStats.recommendedVPIP[state.style],
        positionNotes: posStats.notes
      },

      // Strategic assessment
      assessment: {
        strengths: handStats.strengths,
        warnings: handStats.warnings,
        isMultiway: state.opponents >= 3,
        multiwayAdvice: state.opponents >= 4 ?
          'In 4+ way pots, only continue with nut potential or strong made hands' :
          state.opponents >= 3 ?
          'In 3-way pots, tighten range slightly and be cautious with non-nut draws' :
          'Heads-up or 3-way allows for more creative play'
      },

      // Raw data for calculations
      rawData: {
        setProbability: this.setProbability(),
        flushDrawProbability: state.suitedness !== 'r' ? this.flushDrawProbability(2) : null,
        outsReference: this.outs,
        positionStats: posStats
      }
    };

    // Add simulation data if available - THIS IS THE PRIMARY SOURCE FOR PROBABILITIES
    if (simulationData) {
      const simStats = this.extractSimulationStats(simulationData);

      context.simulationData = {
        // Metadata
        iterations: simStats?.iterations,
        totalHands: simStats?.totalHands,
        durationMs: simStats?.durationMs,

        // Win rates from ACTUAL SIMULATION (most credible)
        overallWinRate: simStats?.overallWinRate?.toFixed(2) + '%',

        // Full hand type statistics from simulation
        handTypeStatistics: simStats?.handTypeStats?.map(ht => ({
          hand: ht.name,
          frequency: ht.percentage?.toFixed(2) + '%',
          winRate: ht.winRate?.toFixed(2) + '%',
          timesOccurred: ht.count,
          timesWon: ht.wins
        })),

        // Starting hand category performance (if available)
        startingHandPerformance: simStats?.startingCategories,

        // THREAT LANDSCAPE: "When I have X, what % of hands have opponent with Y?"
        // This shows how often you face each type of hand, NOT your win rate against them
        threatLandscape: this.extractThreatLandscape(simulationData, state),

        // Data source indicator for credibility
        dataSource: 'Monte Carlo simulation (' + (simStats?.iterations || 0).toLocaleString() + ' iterations)'
      };

      // Replace formula-based probabilities with simulation data where available
      context.statistics.dataNote = 'Statistics below combine simulation results with mathematical poker fundamentals.';
    } else {
      context.statistics.dataNote = 'No simulation run yet. Statistics are based on mathematical poker fundamentals. Run a simulation for empirical data.';
    }

    return context;
  },

  // ============ SIMULATION DATA EXTRACTION ============

  // Hand type enum mapping (matches core/src/evaluator/types.ts)
  HAND_TYPE_NAMES: [
    'High Card', 'Pair', 'Two Pair', 'Three of a Kind',
    'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
  ],

  // Extract comprehensive statistics from simulation data
  extractSimulationStats: function(simData) {
    if (!simData?.statistics) return null;

    const stats = simData.statistics;

    return {
      totalHands: stats.totalHands,
      durationMs: simData.metadata?.durationMs,
      iterations: simData.metadata?.config?.iterations,

      // Hand type distribution with win rates
      handTypeStats: stats.handTypeDistribution?.map(ht => ({
        name: this.HAND_TYPE_NAMES[ht.handType] || `Type ${ht.handType}`,
        handType: ht.handType,
        count: ht.count,
        percentage: ht.percentage,
        wins: ht.wins,
        winRate: ht.winRate
      })) || [],

      // Overall win rate (weighted average or from starting category)
      overallWinRate: this.calculateOverallWinRate(stats),

      // Starting hand category stats (Omaha-specific)
      startingCategories: stats.byStartingCategory ?
        Object.entries(stats.byStartingCategory).map(([cat, data]) => ({
          category: cat,
          count: data.count,
          winRate: data.winRate,
          percentage: (data.count / stats.totalHands * 100).toFixed(2)
        })) : null
    };
  },

  // Calculate overall win rate from hand type distribution
  calculateOverallWinRate: function(stats) {
    if (!stats?.handTypeDistribution?.length) return null;

    let totalWins = 0;
    let totalHands = 0;

    stats.handTypeDistribution.forEach(ht => {
      totalWins += ht.wins || 0;
      totalHands += ht.count || 0;
    });

    return totalHands > 0 ? (totalWins / totalHands * 100) : 0;
  },

  // Extract threat landscape from probability matrix
  // THREAT LANDSCAPE: "When I have X, what % of hands have at least one opponent with Y?"
  extractThreatLandscape: function(simData, state) {
    if (!simData?.statistics?.probabilityMatrix) return null;

    const matrix = simData.statistics.probabilityMatrix;
    
    // Map UI structure to hand type indices
    const structureToTypes = {
      'pair': [1],           // Pair
      'dpair': [1, 2],       // Pair or Two Pair (paired boards)
      'run': [4],            // Straight
      'bway': [4, 5],        // Straight or Flush (broadway often makes these)
      'any': [0, 1, 2]       // High Card, Pair, Two Pair
    };

    const relevantTypes = structureToTypes[state.structure] || [0, 1, 2];

    // Build threat landscape for relevant hand types
    const landscape = {};
    
    relevantTypes.forEach(heroTypeIdx => {
      const heroName = this.HAND_TYPE_NAMES[heroTypeIdx];
      if (!heroName || !Array.isArray(matrix[heroTypeIdx])) return;
      
      landscape[heroName] = matrix[heroTypeIdx]
        .filter(entry => entry && typeof entry.threatPct !== 'undefined')
        .map((entry, oppIdx) => ({
          oppHand: entry.oppHand || this.HAND_TYPE_NAMES[oppIdx],
          threatPct: entry.threatPct,
          // Include win rate as secondary info
          winRate: entry.winRate
        }))
        .filter(t => t.threatPct > 0) // Only show non-zero threats
        .sort((a, b) => b.threatPct - a.threatPct); // Sort by most common threat
    });

    return Object.keys(landscape).length > 0 ? landscape : null;
  },

  // Legacy function for backwards compatibility
  extractRelevantMatchups: function(simData, state) {
    return this.extractThreatLandscape(simData, state);
  },

  // Get win rate for a specific hand type from simulation
  getHandTypeWinRate: function(simData, handType) {
    const stats = simData?.statistics?.handTypeDistribution;
    if (!stats) return null;

    const found = stats.find(ht => ht.handType === handType);
    return found ? found.winRate : null;
  },

  // Helper for rank names
  rankName: function(rank) {
    const names = { 14: 'Aces', 13: 'Kings', 12: 'Queens', 11: 'Jacks', 10: 'Tens' };
    return names[rank] || rank + 's';
  }
};

// Export for use in app.js
window.PokerStats = PokerStats;
