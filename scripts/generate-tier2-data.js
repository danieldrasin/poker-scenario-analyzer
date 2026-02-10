#!/usr/bin/env node
/**
 * Generate Tier 2 pre-computed simulation data and upload to Cloudflare R2
 *
 * This script runs Monte Carlo simulations for common scenarios and uploads
 * the results to R2 for fast retrieval.
 *
 * Usage:
 *   node scripts/generate-tier2-data.js --generate   # Generate data files locally
 *   node scripts/generate-tier2-data.js --upload     # Upload to R2
 *   node scripts/generate-tier2-data.js --all        # Generate and upload
 *
 * Environment variables required for upload:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HAND_TYPE_NAMES, dealAndEvaluate, determineWinners } from './poker-evaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ITERATIONS = 100000; // 100K iterations - matches original Smalltalk ph_t2.html
const OUTPUT_DIR = path.join(__dirname, '../data/tier2');

// Game variants and player counts to simulate
// Note: Original Smalltalk was Omaha 4-card only
const SCENARIOS = [
  { game: 'omaha4', players: [2, 3, 4, 5, 6, 7, 8, 9], holeCards: 4 },
  { game: 'omaha5', players: [2, 3, 4, 5, 6, 7, 8], holeCards: 5 },
  { game: 'omaha6', players: [2, 3, 4, 5, 6], holeCards: 6 },
];

/**
 * Run Monte Carlo simulation with ACTUAL card dealing and hand evaluation
 * This matches the original Smalltalk implementation exactly:
 * - Deals real cards from a shuffled deck
 * - Evaluates best Omaha hand (2 hole + 3 board)
 * - Matrix shows: "When I have X, what % of hands have at least one opponent with Y?"
 */
function runSimulation(gameVariant, playerCount, iterations) {
  // Determine hole card count based on variant
  const holeCardCount = gameVariant === 'omaha6' ? 6 : gameVariant === 'omaha5' ? 5 : 4;

  // Check if we have enough cards
  const cardsNeeded = playerCount * holeCardCount + 8; // +8 for burns and board
  if (cardsNeeded > 52) {
    console.warn(`  ⚠ ${gameVariant} with ${playerCount} players needs ${cardsNeeded} cards - skipping`);
    return null;
  }

  const handTypeCounts = new Array(9).fill(0);
  const handTypeWins = new Array(9).fill(0);
  let heroWins = 0;

  // THREAT LANDSCAPE MATRIX (matches original Smalltalk exactly):
  // threatMatrix[heroType][oppType] = count of hands where hero had heroType
  // AND at least one opponent had oppType as their BEST hand
  const threatMatrix = Array.from({ length: 9 }, () => new Array(9).fill(0));

  // Also track win rates for each matchup (secondary data)
  const winMatrix = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => ({ count: 0, wins: 0 }))
  );

  const startTime = Date.now();
  const logInterval = Math.floor(iterations / 10);

  for (let i = 0; i < iterations; i++) {
    if (i > 0 && i % logInterval === 0) {
      const pct = Math.round(i / iterations * 100);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r    ${pct}% (${elapsed}s)...`);
    }

    // ACTUALLY DEAL AND EVALUATE HANDS
    const results = dealAndEvaluate(playerCount, holeCardCount);
    const heroResult = results[0]; // Player 0 is "hero"
    const heroHandType = heroResult.handType;

    handTypeCounts[heroHandType]++;

    // Track which opponent hand types appear in THIS hand (for threat matrix)
    const oppTypesPresent = new Set();
    let strongestOppType = -1;
    let strongestOppTiebreaker = -1;

    for (let opp = 1; opp < playerCount; opp++) {
      const oppType = results[opp].handType;
      const oppTiebreaker = results[opp].tiebreaker;
      oppTypesPresent.add(oppType);

      if (oppType > strongestOppType ||
          (oppType === strongestOppType && oppTiebreaker > strongestOppTiebreaker)) {
        strongestOppType = oppType;
        strongestOppTiebreaker = oppTiebreaker;
      }
    }

    // THREAT LANDSCAPE: For each opponent hand type that appeared, increment the count
    // This answers: "When I have X, what % of hands have at least one opponent with Y?"
    for (const oppType of oppTypesPresent) {
      threatMatrix[heroHandType][oppType]++;
    }

    // Determine if hero won
    const winners = determineWinners(results);
    const heroWon = winners.includes(0);

    // WIN RATE MATRIX: Track wins vs the strongest opponent
    if (strongestOppType >= 0) {
      winMatrix[heroHandType][strongestOppType].count++;
      if (heroWon) {
        winMatrix[heroHandType][strongestOppType].wins++;
      }
    }

    if (heroWon) {
      heroWins++;
      handTypeWins[heroHandType]++;
    }
  }

  process.stdout.write(`\r    100%         \n`);

  const durationMs = Date.now() - startTime;

  // Match the format expected by displayScenarioResults and displayMatrix
  return {
    metadata: {
      id: `tier2_${gameVariant}_${playerCount}p`,
      config: { gameVariant, playerCount, iterations },
      createdAt: new Date().toISOString(),
      durationMs
    },
    statistics: {
      handTypeDistribution: HAND_TYPE_NAMES.map((name, i) => ({
        handType: i,
        name,
        count: handTypeCounts[i],
        percentage: parseFloat((handTypeCounts[i] / iterations * 100).toFixed(2)),
        wins: handTypeWins[i],
        winRate: handTypeCounts[i] > 0 ? parseFloat((handTypeWins[i] / handTypeCounts[i] * 100).toFixed(2)) : 0
      })),
      overallWinRate: parseFloat((heroWins / iterations * 100).toFixed(2)),
      // THREAT LANDSCAPE MATRIX - matches original Smalltalk behavior exactly
      // threatPct: "When I have heroHand, what % of hands have at least one opponent with oppHand?"
      // NOTE: Row totals can exceed 100% because multiple opponents can have different hand types
      probabilityMatrix: HAND_TYPE_NAMES.map((heroHand, heroIdx) =>
        HAND_TYPE_NAMES.map((oppHand, oppIdx) => {
          const heroCount = handTypeCounts[heroIdx];
          const threatCount = threatMatrix[heroIdx][oppIdx];
          const winCell = winMatrix[heroIdx][oppIdx];
          return {
            heroHand,
            oppHand,
            // Primary metric: % of hands where this opponent hand type appears
            threatPct: heroCount > 0 ? parseFloat((threatCount / heroCount * 100).toFixed(2)) : 0,
            // Secondary data: win rate when facing strongest opponent of this type
            count: winCell.count,
            wins: winCell.wins,
            winRate: winCell.count > 0 ? parseFloat((winCell.wins / winCell.count * 100).toFixed(1)) : 0
          };
        })
      )
    }
  };
}

// Generate all data files
async function generateData() {
  console.log('🎲 Generating Tier 2 simulation data...\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let totalFiles = 0;
  let totalSize = 0;

  for (const scenario of SCENARIOS) {
    const gameDir = path.join(OUTPUT_DIR, scenario.game);
    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }

    for (const players of scenario.players) {
      const playerDir = path.join(gameDir, `${players}p`);
      if (!fs.existsSync(playerDir)) {
        fs.mkdirSync(playerDir, { recursive: true });
      }

      console.log(`  Simulating ${scenario.game} with ${players} players...`);
      const result = runSimulation(scenario.game, players, ITERATIONS);

      // Save main simulation file
      const filePath = path.join(playerDir, 'all.json');
      const content = JSON.stringify(result, null, 2);
      fs.writeFileSync(filePath, content);

      const fileSize = Buffer.byteLength(content);
      totalFiles++;
      totalSize += fileSize;

      console.log(`    ✓ ${filePath} (${(fileSize / 1024).toFixed(1)} KB)`);
    }
  }

  console.log(`\n✅ Generated ${totalFiles} files (${(totalSize / 1024 / 1024).toFixed(2)} MB total)`);
  console.log(`   Location: ${OUTPUT_DIR}`);
}

// Upload to R2
async function uploadToR2() {
  console.log('☁️  Uploading to Cloudflare R2...\n');

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error('❌ Missing R2 credentials. Set these environment variables:');
    console.error('   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME');
    process.exit(1);
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });

  const bucket = R2_BUCKET_NAME || 'poker-sim-data';

  // Find all JSON files in tier2 directory
  function getAllFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        getAllFiles(fullPath, files);
      } else if (entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const files = getAllFiles(OUTPUT_DIR);
  console.log(`  Found ${files.length} files to upload\n`);

  let uploaded = 0;
  for (const filePath of files) {
    const key = path.relative(OUTPUT_DIR, filePath);
    const content = fs.readFileSync(filePath);

    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: content,
        ContentType: 'application/json'
      }));
      uploaded++;
      console.log(`  ✓ ${key}`);
    } catch (error) {
      console.error(`  ✗ ${key}: ${error.message}`);
    }
  }

  console.log(`\n✅ Uploaded ${uploaded}/${files.length} files to R2 bucket: ${bucket}`);
}

// List R2 contents
async function listR2Contents() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error('❌ Missing R2 credentials');
    process.exit(1);
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });

  const bucket = R2_BUCKET_NAME || 'poker-sim-data';

  try {
    const result = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
    console.log(`\n📦 Contents of R2 bucket: ${bucket}\n`);
    if (result.Contents) {
      for (const obj of result.Contents) {
        console.log(`  ${obj.Key} (${(obj.Size / 1024).toFixed(1)} KB)`);
      }
      console.log(`\n  Total: ${result.Contents.length} objects`);
    } else {
      console.log('  (empty)');
    }
  } catch (error) {
    console.error(`❌ Error listing bucket: ${error.message}`);
  }
}

// Main
const args = process.argv.slice(2);

if (args.includes('--generate') || args.includes('--all')) {
  await generateData();
}

if (args.includes('--upload') || args.includes('--all')) {
  await uploadToR2();
}

if (args.includes('--list')) {
  await listR2Contents();
}

if (args.length === 0) {
  console.log(`
Tier 2 Data Generator for Poker Simulator

Usage:
  node scripts/generate-tier2-data.js --generate   Generate data files locally
  node scripts/generate-tier2-data.js --upload     Upload to Cloudflare R2
  node scripts/generate-tier2-data.js --all        Generate and upload
  node scripts/generate-tier2-data.js --list       List R2 bucket contents

Environment variables for R2:
  R2_ACCOUNT_ID          Your Cloudflare account ID
  R2_ACCESS_KEY_ID       R2 API token access key
  R2_SECRET_ACCESS_KEY   R2 API token secret key
  R2_BUCKET_NAME         Bucket name (default: poker-sim-data)
`);
}
