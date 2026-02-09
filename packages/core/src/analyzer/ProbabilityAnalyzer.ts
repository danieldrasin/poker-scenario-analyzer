import { HandType, handTypeToCode, HAND_TYPE_CODES } from '../evaluator/HandRank.js';
import { SimulationResult, ProbabilityMatrix, ProbabilityMatrixEntry } from '../simulator/types.js';

/**
 * Format the probability matrix as a 2D table for display
 */
export interface FormattedMatrix {
  headers: string[];
  rows: { label: string; values: number[] }[];
}

/**
 * Convert the flat probability matrix to a formatted table
 */
export function formatProbabilityMatrix(matrix: ProbabilityMatrix): FormattedMatrix {
  // Hand types we care about (excluding Royal Flush which is too rare)
  const handTypes = [
    HandType.HIGH_CARD,
    HandType.PAIR,
    HandType.TWO_PAIR,
    HandType.THREE_OF_A_KIND,
    HandType.STRAIGHT,
    HandType.FLUSH,
    HandType.FULL_HOUSE,
    HandType.FOUR_OF_A_KIND,
    HandType.STRAIGHT_FLUSH
  ];

  const headers = handTypes.map(ht => handTypeToCode(ht));

  const rows: { label: string; values: number[] }[] = [];

  for (const playerHT of handTypes) {
    const rowValues: number[] = [];
    for (const oppHT of handTypes) {
      const entry = matrix.find(
        e => e.playerHandType === playerHT && e.opponentHandType === oppHT
      );
      rowValues.push(entry ? Math.round(entry.probability * 100) / 100 : 0);
    }
    rows.push({
      label: handTypeToCode(playerHT),
      values: rowValues
    });
  }

  return { headers, rows };
}

/**
 * Query the simulation results for specific scenarios
 */
export interface ScenarioQuery {
  /** Filter: player has exactly this hand type */
  playerHasExactly?: HandType;

  /** Filter: player has this hand type or better */
  playerHasAtLeast?: HandType;

  /** Filter: player's starting category (Omaha) */
  playerStartingCategory?: string;

  /** Question: probability opponent has exactly this */
  opponentHasExactly?: HandType;

  /** Question: probability opponent has this or better */
  opponentHasAtLeast?: HandType;
}

/**
 * Result of a scenario query
 */
export interface ScenarioResult {
  query: ScenarioQuery;
  description: string;
  sampleSize: number;
  matchCount: number;
  probability: number;
}

/**
 * Execute a scenario query against simulation results
 */
export function queryScenario(
  result: SimulationResult,
  query: ScenarioQuery
): ScenarioResult {
  const matrix = result.statistics.probabilityMatrix;

  let description = 'When player has ';
  let sampleSize = 0;
  let matchCount = 0;

  // Determine which player hand types to include
  const playerHandTypes: HandType[] = [];
  if (query.playerHasExactly !== undefined) {
    playerHandTypes.push(query.playerHasExactly);
    description += `exactly ${handTypeToCode(query.playerHasExactly)}`;
  } else if (query.playerHasAtLeast !== undefined) {
    for (let ht = query.playerHasAtLeast; ht <= HandType.STRAIGHT_FLUSH; ht++) {
      playerHandTypes.push(ht);
    }
    description += `${handTypeToCode(query.playerHasAtLeast)} or better`;
  } else {
    // All hand types
    for (let ht = 0; ht <= HandType.STRAIGHT_FLUSH; ht++) {
      playerHandTypes.push(ht);
    }
    description += 'any hand';
  }

  // Determine which opponent hand types to count
  const opponentHandTypes: HandType[] = [];
  if (query.opponentHasExactly !== undefined) {
    opponentHandTypes.push(query.opponentHasExactly);
    description += `, probability opponent has exactly ${handTypeToCode(query.opponentHasExactly)}`;
  } else if (query.opponentHasAtLeast !== undefined) {
    for (let ht = query.opponentHasAtLeast; ht <= HandType.STRAIGHT_FLUSH; ht++) {
      opponentHandTypes.push(ht);
    }
    description += `, probability opponent has ${handTypeToCode(query.opponentHasAtLeast)} or better`;
  } else {
    description += ', counting all opponent hands';
    for (let ht = 0; ht <= HandType.STRAIGHT_FLUSH; ht++) {
      opponentHandTypes.push(ht);
    }
  }

  // Sum up from matrix
  for (const playerHT of playerHandTypes) {
    // Get total times player had this hand type
    let playerTotal = 0;
    for (let oht = 0; oht <= HandType.STRAIGHT_FLUSH; oht++) {
      const entry = matrix.find(e => e.playerHandType === playerHT && e.opponentHandType === oht);
      if (entry) {
        playerTotal = entry.playerCount;
        break; // playerCount is same for all opponent types
      }
    }
    sampleSize += playerTotal;

    // Count matching opponent hands
    for (const oppHT of opponentHandTypes) {
      const entry = matrix.find(
        e => e.playerHandType === playerHT && e.opponentHandType === oppHT
      );
      if (entry) {
        matchCount += entry.opponentCount;
      }
    }
  }

  return {
    query,
    description,
    sampleSize,
    matchCount,
    probability: sampleSize > 0 ? (matchCount / sampleSize) * 100 : 0
  };
}

/**
 * Generate an HTML report similar to the original Smalltalk output
 */
export function generateHTMLReport(results: SimulationResult[]): string {
  const html: string[] = [];

  html.push(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Poker Hand Analysis</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .tab { display: inline-block; padding: 10px 20px; cursor: pointer; background-color: #f0f0f0; border: 1px solid #ddd; margin-right: 2px; }
    .tab.active { background-color: #ddd; border-bottom-color: #ddd; }
    .tabcontent { display: none; padding: 20px; border: 1px solid #ddd; border-top: none; }
    .tabcontent.active { display: block; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
    th { background-color: #f2f2f2; }
    .meta { color: #666; font-size: 0.9em; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h1>Poker Hand Analysis</h1>
`);

  // Tabs
  html.push('  <div class="tabs">');
  results.forEach((r, i) => {
    const playerCount = r.metadata.config.playerCount;
    const activeClass = i === 0 ? ' active' : '';
    html.push(`    <div class="tab${activeClass}" onclick="openTab(event, 'player${playerCount}')">${playerCount} Players</div>`);
  });
  html.push('  </div>');

  // Tab content
  results.forEach((r, i) => {
    const playerCount = r.metadata.config.playerCount;
    const activeClass = i === 0 ? ' active' : '';
    const matrix = formatProbabilityMatrix(r.statistics.probabilityMatrix);

    html.push(`  <div id="player${playerCount}" class="tabcontent${activeClass}">`);
    html.push(`    <h2>${playerCount} Player Game</h2>`);
    html.push(`    <div class="meta">`);
    html.push(`      Game: ${r.metadata.config.gameVariant} | Iterations: ${r.metadata.config.iterations.toLocaleString()} | Duration: ${r.metadata.durationMs}ms`);
    html.push(`    </div>`);
    html.push('    <table>');
    html.push('      <tr>');
    html.push('        <th>Player Hand \\ Opponent Has</th>');
    matrix.headers.forEach(h => html.push(`        <th>${h}</th>`));
    html.push('      </tr>');

    matrix.rows.forEach(row => {
      html.push('      <tr>');
      html.push(`        <th>${row.label}</th>`);
      row.values.forEach(v => html.push(`        <td>${v.toFixed(2)}</td>`));
      html.push('      </tr>');
    });

    html.push('    </table>');
    html.push('  </div>');
  });

  // Script
  html.push(`
  <script>
    function openTab(evt, tabName) {
      const tabcontent = document.getElementsByClassName("tabcontent");
      for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].classList.remove('active');
      }
      const tabs = document.getElementsByClassName("tab");
      for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
      }
      document.getElementById(tabName).classList.add('active');
      evt.currentTarget.classList.add('active');
    }
  </script>
</body>
</html>`);

  return html.join('\n');
}
