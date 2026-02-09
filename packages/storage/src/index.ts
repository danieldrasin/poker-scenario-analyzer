import { SimulationResult } from '@poker-sim/core';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Save simulation results to a JSON file
 */
export function saveSimulationJSON(result: SimulationResult, filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const json = JSON.stringify(result, null, 2);
  fs.writeFileSync(filePath, json, 'utf-8');
}

/**
 * Load simulation results from a JSON file
 */
export function loadSimulationJSON(filePath: string): SimulationResult {
  const json = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(json) as SimulationResult;
}

/**
 * Save multiple simulation results to a single JSON file
 */
export function saveSimulationsJSON(results: SimulationResult[], filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const json = JSON.stringify(results, null, 2);
  fs.writeFileSync(filePath, json, 'utf-8');
}

/**
 * Load multiple simulation results from a JSON file
 */
export function loadSimulationsJSON(filePath: string): SimulationResult[] {
  const json = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(json) as SimulationResult[];
}

/**
 * Generate a filename based on simulation config
 */
export function generateFilename(result: SimulationResult): string {
  const { config } = result.metadata;
  const date = new Date().toISOString().split('T')[0];
  return `${config.gameVariant}_${config.playerCount}p_${config.iterations}i_${date}.json`;
}

/**
 * List all simulation files in a directory
 */
export function listSimulationFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(dir, f));
}

/**
 * Schema documentation for LLM querying
 */
export const SCHEMA_DOCUMENTATION = `
# Poker Simulation Data Schema

## SimulationResult
The top-level object containing all simulation data.

### metadata
- id: Unique identifier for this simulation run
- createdAt: ISO timestamp of when simulation was run
- config: The configuration used (gameVariant, playerCount, iterations, seed)
- durationMs: How long the simulation took in milliseconds
- version: Simulator version

### statistics
- totalHands: Number of hands simulated
- handTypeDistribution: Array of {handType, count, percentage, wins, winRate} for each hand type
- probabilityMatrix: Array of {playerHandType, opponentHandType, playerCount, opponentCount, probability}
- byStartingCategory (Omaha only): Map of starting hand categories to their statistics

### handRecords (optional)
Sample of individual hand records if storeHandRecords was true.
Each record contains: handNumber, board, players[], winnerIndices

## Hand Types (in order)
0: HIGH_CARD (HC)
1: PAIR (1P)
2: TWO_PAIR (2P)
3: THREE_OF_A_KIND (3C)
4: STRAIGHT (ST)
5: FLUSH (FL)
6: FULL_HOUSE (FH)
7: FOUR_OF_A_KIND (4C)
8: STRAIGHT_FLUSH (SF)
9: ROYAL_FLUSH (RF)

## Example Queries

To find "probability opponent has flush when I have two pair":
Look in probabilityMatrix for entry where:
- playerHandType === 2 (TWO_PAIR)
- opponentHandType === 5 (FLUSH)
The 'probability' field gives the answer as a percentage.

To find "how often AAxx starting hands win" (Omaha):
Look in byStartingCategory for key "aces" or "aces-ds"
The 'winRate' field gives win percentage.
`;
