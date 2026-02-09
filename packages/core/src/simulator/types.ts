import { HandType } from '../evaluator/HandRank.js';
import { GameVariant } from '../rules/GameRules.js';

/**
 * Configuration for running a simulation
 */
export interface SimulationConfig {
  /** Which poker variant to simulate */
  gameVariant: GameVariant;

  /** Number of players at the table */
  playerCount: number;

  /** Number of hands to simulate */
  iterations: number;

  /** Random seed for reproducibility (optional) */
  seed?: number;

  /** Whether to store individual hand records (increases memory usage) */
  storeHandRecords?: boolean;

  /** Sample rate for hand records (e.g., 0.01 = store 1% of hands) */
  handRecordSampleRate?: number;
}

/**
 * A single player's result in one hand
 */
export interface PlayerResult {
  /** Player index (0-based) */
  playerIndex: number;

  /** Hole cards as string notation */
  holeCards: string[];

  /** Starting hand category (for Omaha) */
  startingCategory?: string;

  /** The best 5-card hand found */
  bestHand: string[];

  /** The hand type achieved */
  handType: HandType;

  /** Numeric score for comparison */
  score: number;

  /** Rank among all players (1 = winner) */
  rank: number;

  /** Whether this player won (or tied for win) */
  isWinner: boolean;
}

/**
 * Result of a single simulated hand
 */
export interface HandResult {
  /** Sequential hand number */
  handNumber: number;

  /** Board cards as string notation */
  board: string[];

  /** Results for each player */
  players: PlayerResult[];

  /** Index of winning player(s) */
  winnerIndices: number[];
}

/**
 * Aggregated statistics for a hand type
 */
export interface HandTypeStats {
  /** The hand type */
  handType: HandType;

  /** Number of times this hand type occurred */
  count: number;

  /** Percentage of total hands */
  percentage: number;

  /** Number of times this hand type won */
  wins: number;

  /** Win rate when holding this hand type */
  winRate: number;
}

/**
 * Cross-tabulation: given I have hand type X, probability opponent has Y
 */
export interface ProbabilityMatrixEntry {
  /** Player's hand type */
  playerHandType: HandType;

  /** Opponent's hand type being checked */
  opponentHandType: HandType;

  /** Number of times player had this hand type */
  playerCount: number;

  /** Number of times opponent had this (or better) hand type when player had playerHandType */
  opponentCount: number;

  /** Probability percentage */
  probability: number;
}

/**
 * Full probability matrix (9x9 for all hand types)
 */
export type ProbabilityMatrix = ProbabilityMatrixEntry[];

/**
 * Complete simulation results
 */
export interface SimulationResult {
  /** Metadata about the simulation */
  metadata: SimulationMetadata;

  /** Aggregated statistics */
  statistics: SimulationStatistics;

  /** Sample of individual hand records (if stored) */
  handRecords?: HandResult[];
}

export interface SimulationMetadata {
  /** Unique identifier for this simulation run */
  id: string;

  /** When the simulation was run */
  createdAt: string;

  /** Configuration used */
  config: SimulationConfig;

  /** How long the simulation took (ms) */
  durationMs: number;

  /** Version of the simulator */
  version: string;
}

export interface SimulationStatistics {
  /** Total hands simulated */
  totalHands: number;

  /** Hand type frequency distribution */
  handTypeDistribution: HandTypeStats[];

  /** Probability matrix: P(opponent has Y | I have X) */
  probabilityMatrix: ProbabilityMatrix;

  /** Statistics by starting hand category (Omaha only) */
  byStartingCategory?: Record<string, StartingCategoryStats>;
}

export interface StartingCategoryStats {
  /** Category name */
  category: string;

  /** Number of hands in this category */
  count: number;

  /** Distribution of final hand types from this starting category */
  finalHandDistribution: HandTypeStats[];

  /** Win rate for this starting category */
  winRate: number;
}
