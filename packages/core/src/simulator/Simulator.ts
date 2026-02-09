import { Card } from '../cards/Card.js';
import { Deck } from '../cards/Deck.js';
import { createRules, GameRules } from '../rules/GameRules.js';
import { evaluateBestHand } from '../evaluator/HandEvaluator.js';
import { HandType, handTypeToCode } from '../evaluator/HandRank.js';
import { categorizeOmahaHand, getSimplifiedCategory } from '../categorizer/OmahaStartingHand.js';
import {
  SimulationConfig,
  SimulationResult,
  SimulationMetadata,
  SimulationStatistics,
  HandResult,
  PlayerResult,
  HandTypeStats,
  ProbabilityMatrix,
  ProbabilityMatrixEntry,
  StartingCategoryStats
} from './types.js';

const VERSION = '1.0.0';

/**
 * Monte Carlo poker simulator.
 * Runs many random hands and collects statistics.
 */
export class Simulator {
  private config: SimulationConfig;
  private rules: GameRules;

  constructor(config: SimulationConfig) {
    this.config = config;
    this.rules = createRules(config.gameVariant);
  }

  /**
   * Run the simulation and return results
   */
  run(progressCallback?: (completed: number, total: number) => void): SimulationResult {
    const startTime = Date.now();

    const { iterations, playerCount, seed, storeHandRecords, handRecordSampleRate } = this.config;

    // Initialize counters
    const handTypeCounters = new Map<HandType, number>();
    const handTypeWins = new Map<HandType, number>();
    const matrixCounters = new Map<string, { playerCount: number; opponentCount: number }>();
    const startingCategoryStats = new Map<string, {
      count: number;
      wins: number;
      finalHandTypes: Map<HandType, number>;
    }>();

    const handRecords: HandResult[] = [];
    const shouldStoreRecords = storeHandRecords ?? false;
    const sampleRate = handRecordSampleRate ?? 1.0;

    // Run simulations
    for (let i = 0; i < iterations; i++) {
      const handResult = this.simulateOneHand(i, seed ? seed + i : undefined);

      // Update counters
      this.updateCounters(
        handResult,
        handTypeCounters,
        handTypeWins,
        matrixCounters,
        startingCategoryStats
      );

      // Maybe store hand record
      if (shouldStoreRecords && Math.random() < sampleRate) {
        handRecords.push(handResult);
      }

      // Progress callback
      if (progressCallback && (i + 1) % 1000 === 0) {
        progressCallback(i + 1, iterations);
      }
    }

    const endTime = Date.now();

    // Build results
    const metadata: SimulationMetadata = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      config: this.config,
      durationMs: endTime - startTime,
      version: VERSION
    };

    const statistics = this.buildStatistics(
      iterations * playerCount,
      handTypeCounters,
      handTypeWins,
      matrixCounters,
      startingCategoryStats
    );

    const result: SimulationResult = {
      metadata,
      statistics
    };

    if (shouldStoreRecords && handRecords.length > 0) {
      result.handRecords = handRecords;
    }

    return result;
  }

  /**
   * Simulate a single hand
   */
  private simulateOneHand(handNumber: number, seed?: number): HandResult {
    const { playerCount } = this.config;
    const deck = Deck.standard(seed).shuffle();

    // Deal hole cards to each player
    const playerHoleCards: Card[][] = [];
    for (let p = 0; p < playerCount; p++) {
      playerHoleCards.push(deck.dealMany(this.rules.holeCardCount));
    }

    // Burn and deal board (simplified - no street-by-street for now)
    deck.burn();
    const board = deck.dealMany(this.rules.boardCardCount);

    // Evaluate each player's best hand
    const playerResults: PlayerResult[] = [];

    for (let p = 0; p < playerCount; p++) {
      const holeCards = playerHoleCards[p];
      const { hand: bestHand, rank: handRank } = evaluateBestHand(
        holeCards,
        board,
        this.rules.generateValidHands.bind(this.rules)
      );

      // Categorize starting hand for Omaha variants
      let startingCategory: string | undefined;
      if (this.config.gameVariant.startsWith('omaha')) {
        const category = categorizeOmahaHand(holeCards);
        startingCategory = getSimplifiedCategory(category);
      }

      playerResults.push({
        playerIndex: p,
        holeCards: holeCards.map(c => c.toString()),
        startingCategory,
        bestHand: bestHand.map(c => c.toString()),
        handType: handRank.type,
        score: handRank.score,
        rank: 0, // Will be set below
        isWinner: false // Will be set below
      });
    }

    // Determine rankings
    const sortedByScore = [...playerResults].sort((a, b) => b.score - a.score);
    const winningScore = sortedByScore[0].score;

    let currentRank = 1;
    let lastScore = -1;
    let sameRankCount = 0;

    for (const result of sortedByScore) {
      if (result.score !== lastScore) {
        currentRank = currentRank + sameRankCount;
        sameRankCount = 1;
      } else {
        sameRankCount++;
      }

      const player = playerResults[result.playerIndex];
      player.rank = currentRank;
      player.isWinner = result.score === winningScore;

      lastScore = result.score;
    }

    const winnerIndices = playerResults
      .filter(p => p.isWinner)
      .map(p => p.playerIndex);

    return {
      handNumber,
      board: board.map(c => c.toString()),
      players: playerResults,
      winnerIndices
    };
  }

  /**
   * Update running counters from a hand result
   */
  private updateCounters(
    handResult: HandResult,
    handTypeCounters: Map<HandType, number>,
    handTypeWins: Map<HandType, number>,
    matrixCounters: Map<string, { playerCount: number; opponentCount: number }>,
    startingCategoryStats: Map<string, { count: number; wins: number; finalHandTypes: Map<HandType, number> }>
  ): void {
    for (const player of handResult.players) {
      // Count hand types
      handTypeCounters.set(
        player.handType,
        (handTypeCounters.get(player.handType) ?? 0) + 1
      );

      // Count wins
      if (player.isWinner) {
        handTypeWins.set(
          player.handType,
          (handTypeWins.get(player.handType) ?? 0) + 1
        );
      }

      // Update probability matrix: for each player's hand type, check what opponents have
      // The key question is: "Given I have X, what's the probability AT LEAST ONE opponent has Y?"
      // So we need to track: for each opponent hand type Y, does ANY opponent have it?
      const opponentHandTypes = new Set<HandType>();
      for (const opponent of handResult.players) {
        if (opponent.playerIndex === player.playerIndex) continue;
        opponentHandTypes.add(opponent.handType);
      }

      // Count player occurrences and whether any opponent has each hand type
      for (let oppHT = 0; oppHT <= HandType.STRAIGHT_FLUSH; oppHT++) {
        const key = `${player.handType}-${oppHT}`;
        const entry = matrixCounters.get(key) ?? { playerCount: 0, opponentCount: 0 };
        entry.playerCount++;
        if (opponentHandTypes.has(oppHT)) {
          entry.opponentCount++;
        }
        matrixCounters.set(key, entry);
      }

      // Update starting category stats (Omaha only)
      if (player.startingCategory) {
        let catStats = startingCategoryStats.get(player.startingCategory);
        if (!catStats) {
          catStats = { count: 0, wins: 0, finalHandTypes: new Map() };
          startingCategoryStats.set(player.startingCategory, catStats);
        }
        catStats.count++;
        if (player.isWinner) {
          catStats.wins++;
        }
        catStats.finalHandTypes.set(
          player.handType,
          (catStats.finalHandTypes.get(player.handType) ?? 0) + 1
        );
      }
    }
  }

  /**
   * Build final statistics from counters
   */
  private buildStatistics(
    totalPlayerHands: number,
    handTypeCounters: Map<HandType, number>,
    handTypeWins: Map<HandType, number>,
    matrixCounters: Map<string, { playerCount: number; opponentCount: number }>,
    startingCategoryStats: Map<string, { count: number; wins: number; finalHandTypes: Map<HandType, number> }>
  ): SimulationStatistics {
    // Hand type distribution
    const handTypeDistribution: HandTypeStats[] = [];
    for (let ht = 0; ht <= HandType.ROYAL_FLUSH; ht++) {
      const count = handTypeCounters.get(ht) ?? 0;
      const wins = handTypeWins.get(ht) ?? 0;
      handTypeDistribution.push({
        handType: ht,
        count,
        percentage: totalPlayerHands > 0 ? (count / totalPlayerHands) * 100 : 0,
        wins,
        winRate: count > 0 ? (wins / count) * 100 : 0
      });
    }

    // Probability matrix
    const probabilityMatrix: ProbabilityMatrix = [];
    for (let playerHT = 0; playerHT <= HandType.STRAIGHT_FLUSH; playerHT++) {
      for (let oppHT = 0; oppHT <= HandType.STRAIGHT_FLUSH; oppHT++) {
        const key = `${playerHT}-${oppHT}`;
        const entry = matrixCounters.get(key);

        const playerCount = entry?.playerCount ?? 0;
        const opponentCount = entry?.opponentCount ?? 0;

        probabilityMatrix.push({
          playerHandType: playerHT,
          opponentHandType: oppHT,
          playerCount,
          opponentCount,
          probability: playerCount > 0 ? (opponentCount / playerCount) * 100 : 0
        });
      }
    }

    // Starting category stats (Omaha)
    let byStartingCategory: Record<string, StartingCategoryStats> | undefined;
    if (startingCategoryStats.size > 0) {
      byStartingCategory = {};
      for (const [category, stats] of startingCategoryStats) {
        const finalHandDistribution: HandTypeStats[] = [];
        for (let ht = 0; ht <= HandType.ROYAL_FLUSH; ht++) {
          const count = stats.finalHandTypes.get(ht) ?? 0;
          finalHandDistribution.push({
            handType: ht,
            count,
            percentage: stats.count > 0 ? (count / stats.count) * 100 : 0,
            wins: 0, // Not tracked at this granularity
            winRate: 0
          });
        }

        byStartingCategory[category] = {
          category,
          count: stats.count,
          finalHandDistribution,
          winRate: stats.count > 0 ? (stats.wins / stats.count) * 100 : 0
        };
      }
    }

    return {
      totalHands: this.config.iterations,
      handTypeDistribution,
      probabilityMatrix,
      byStartingCategory
    };
  }
}

/**
 * Generate a unique ID for simulation runs
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sim_${timestamp}_${random}`;
}

/**
 * Convenience function to run a simulation with default settings
 */
export function runSimulation(
  gameVariant: SimulationConfig['gameVariant'],
  playerCount: number,
  iterations: number,
  options?: Partial<SimulationConfig>
): SimulationResult {
  const config: SimulationConfig = {
    gameVariant,
    playerCount,
    iterations,
    ...options
  };

  const simulator = new Simulator(config);
  return simulator.run();
}
