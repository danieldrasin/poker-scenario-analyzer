#!/usr/bin/env node

import {
  Simulator,
  SimulationConfig,
  SimulationResult,
  GameVariant,
  SUPPORTED_VARIANTS,
  generateHTMLReport,
  formatProbabilityMatrix
} from '@poker-sim/core';
import {
  saveSimulationJSON,
  saveSimulationsJSON,
  loadSimulationJSON,
  loadSimulationsJSON,
  SCHEMA_DOCUMENTATION
} from '@poker-sim/storage';
import * as fs from 'fs';
import * as path from 'path';

const VERSION = '1.0.0';

interface CLIOptions {
  command: string;
  game: GameVariant;
  players: number | number[];
  iterations: number;
  output?: string;
  format: 'json' | 'html' | 'table';
  seed?: number;
  storeHands?: boolean;
  input?: string;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    command: 'help',
    game: 'omaha4',
    players: 6,
    iterations: 10000,
    format: 'table'
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case 'simulate':
      case 'sim':
        options.command = 'simulate';
        break;

      case 'analyze':
        options.command = 'analyze';
        break;

      case 'export':
        options.command = 'export';
        break;

      case 'schema':
        options.command = 'schema';
        break;

      case 'help':
      case '--help':
      case '-h':
        options.command = 'help';
        break;

      case '--version':
      case '-v':
        options.command = 'version';
        break;

      case '--game':
      case '-g':
        i++;
        if (SUPPORTED_VARIANTS.includes(args[i] as GameVariant)) {
          options.game = args[i] as GameVariant;
        } else {
          console.error(`Invalid game variant: ${args[i]}. Supported: ${SUPPORTED_VARIANTS.join(', ')}`);
          process.exit(1);
        }
        break;

      case '--players':
      case '-p':
        i++;
        if (args[i].includes('-')) {
          // Range: 2-9
          const [min, max] = args[i].split('-').map(Number);
          options.players = [];
          for (let p = min; p <= max; p++) {
            (options.players as number[]).push(p);
          }
        } else if (args[i].includes(',')) {
          // List: 2,4,6,8
          options.players = args[i].split(',').map(Number);
        } else {
          options.players = parseInt(args[i], 10);
        }
        break;

      case '--iterations':
      case '-i':
        i++;
        options.iterations = parseInt(args[i], 10);
        break;

      case '--output':
      case '-o':
        i++;
        options.output = args[i];
        break;

      case '--format':
      case '-f':
        i++;
        options.format = args[i] as 'json' | 'html' | 'table';
        break;

      case '--seed':
      case '-s':
        i++;
        options.seed = parseInt(args[i], 10);
        break;

      case '--store-hands':
        options.storeHands = true;
        break;

      case '--input':
        i++;
        options.input = args[i];
        break;
    }

    i++;
  }

  return options;
}

function printHelp(): void {
  console.log(`
Poker Simulator CLI v${VERSION}

USAGE:
  poker-sim <command> [options]

COMMANDS:
  simulate, sim    Run Monte Carlo simulation
  analyze          Analyze existing simulation results
  export           Export results to different formats
  schema           Print data schema documentation
  help             Show this help message

OPTIONS:
  -g, --game <variant>     Game variant: holdem, omaha4, omaha5, omaha6 (default: omaha4)
  -p, --players <n|range>  Number of players: 6, 2-9, or 2,4,6,8 (default: 6)
  -i, --iterations <n>     Number of hands to simulate (default: 10000)
  -o, --output <file>      Output file path
  -f, --format <format>    Output format: json, html, table (default: table)
  -s, --seed <n>           Random seed for reproducibility
  --store-hands            Store individual hand records (increases file size)
  --input <file>           Input file for analyze/export commands

EXAMPLES:
  # Run simulation for 6-player Omaha
  poker-sim simulate -g omaha4 -p 6 -i 100000 -o results.json -f json

  # Run simulation for all player counts 2-9
  poker-sim simulate -g omaha4 -p 2-9 -i 50000 -o results.html -f html

  # Generate HTML report from existing JSON
  poker-sim export --input results.json -o report.html -f html

  # Print schema for LLM querying
  poker-sim schema
`);
}

function printVersion(): void {
  console.log(`Poker Simulator CLI v${VERSION}`);
}

function printSchema(): void {
  console.log(SCHEMA_DOCUMENTATION);
}

async function runSimulation(options: CLIOptions): Promise<void> {
  const playerCounts = Array.isArray(options.players) ? options.players : [options.players];
  const results: SimulationResult[] = [];

  console.log(`\nPoker Simulation: ${options.game}`);
  console.log(`Iterations per player count: ${options.iterations.toLocaleString()}`);
  console.log(`Player counts: ${playerCounts.join(', ')}`);
  console.log('');

  for (const playerCount of playerCounts) {
    const config: SimulationConfig = {
      gameVariant: options.game,
      playerCount,
      iterations: options.iterations,
      seed: options.seed,
      storeHandRecords: options.storeHands,
      handRecordSampleRate: 0.001 // Store 0.1% of hands if enabled
    };

    const simulator = new Simulator(config);
    const startTime = Date.now();

    console.log(`Running ${playerCount}-player simulation...`);

    const result = simulator.run((completed, total) => {
      const pct = ((completed / total) * 100).toFixed(1);
      process.stdout.write(`\r  Progress: ${pct}% (${completed.toLocaleString()}/${total.toLocaleString()})`);
    });

    const elapsed = Date.now() - startTime;
    const handsPerSec = Math.round(options.iterations / (elapsed / 1000));

    console.log(`\r  Completed in ${elapsed}ms (${handsPerSec.toLocaleString()} hands/sec)         `);

    results.push(result);

    // Print quick summary
    if (options.format === 'table') {
      printTableSummary(result);
    }
  }

  // Output
  if (options.output) {
    if (options.format === 'json') {
      if (results.length === 1) {
        saveSimulationJSON(results[0], options.output);
      } else {
        saveSimulationsJSON(results, options.output);
      }
      console.log(`\nResults saved to: ${options.output}`);
    } else if (options.format === 'html') {
      const html = generateHTMLReport(results);
      fs.writeFileSync(options.output, html, 'utf-8');
      console.log(`\nHTML report saved to: ${options.output}`);
    }
  }
}

function printTableSummary(result: SimulationResult): void {
  const matrix = formatProbabilityMatrix(result.statistics.probabilityMatrix);

  console.log(`\n  Probability Matrix (Player Has \\ Opponent Has):`);
  console.log(`  ${['    ', ...matrix.headers].join(' | ')}`);
  console.log(`  ${'-'.repeat(matrix.headers.length * 8 + 8)}`);

  for (const row of matrix.rows) {
    const values = row.values.map(v => v.toFixed(1).padStart(5));
    console.log(`  ${row.label.padEnd(4)} | ${values.join(' | ')}`);
  }
}

async function exportResults(options: CLIOptions): Promise<void> {
  if (!options.input) {
    console.error('Error: --input is required for export command');
    process.exit(1);
  }

  if (!options.output) {
    console.error('Error: --output is required for export command');
    process.exit(1);
  }

  let results: SimulationResult[];

  const content = fs.readFileSync(options.input, 'utf-8');
  const parsed = JSON.parse(content);

  if (Array.isArray(parsed)) {
    results = parsed;
  } else {
    results = [parsed];
  }

  if (options.format === 'html') {
    const html = generateHTMLReport(results);
    fs.writeFileSync(options.output, html, 'utf-8');
    console.log(`HTML report saved to: ${options.output}`);
  } else if (options.format === 'json') {
    saveSimulationsJSON(results, options.output);
    console.log(`JSON saved to: ${options.output}`);
  } else {
    // Table format - print to console
    for (const result of results) {
      console.log(`\n${result.metadata.config.playerCount} Players (${result.metadata.config.gameVariant}):`);
      printTableSummary(result);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  switch (options.command) {
    case 'help':
      printHelp();
      break;

    case 'version':
      printVersion();
      break;

    case 'schema':
      printSchema();
      break;

    case 'simulate':
      await runSimulation(options);
      break;

    case 'export':
      await exportResults(options);
      break;

    case 'analyze':
      // TODO: Implement analyze command
      console.log('Analyze command coming soon...');
      break;

    default:
      printHelp();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
