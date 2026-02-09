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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ITERATIONS = 1000000; // 1M iterations for high statistical accuracy
const OUTPUT_DIR = path.join(__dirname, '../data/tier2');

// Game variants and player counts to simulate
const SCENARIOS = [
  { game: 'omaha4', players: [2, 3, 4, 5, 6, 7, 8, 9] },
  { game: 'omaha5', players: [2, 3, 4, 5, 6, 7, 8, 9] },
  { game: 'omaha6', players: [2, 3, 4, 5, 6] },
];

// Hand categories for detailed breakdowns
const HAND_CATEGORIES = [
  'premium-pairs',      // AA, KK, QQ with suits
  'broadway-rundowns',  // Connected high cards
  'suited-aces',        // Ax suited combinations
  'double-suited',      // Hands with two flush draws
  'wrap-potential',     // Hands that make wraps
  'speculative',        // Lower pairs, suited connectors
];

// Simplified Monte Carlo simulation (same logic as API)
function runSimulation(gameVariant, playerCount, iterations) {
  const handTypeNames = [
    'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
    'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
  ];

  const handTypeCounts = new Array(9).fill(0);
  const handTypeWins = new Array(9).fill(0);
  let heroWins = 0;

  // Probability weights for PLO hand types (simplified model)
  const weights = gameVariant === 'omaha6'
    ? [0.05, 0.25, 0.25, 0.08, 0.12, 0.10, 0.10, 0.03, 0.02]
    : gameVariant === 'omaha5'
    ? [0.08, 0.28, 0.23, 0.08, 0.11, 0.09, 0.08, 0.03, 0.02]
    : [0.12, 0.32, 0.22, 0.07, 0.10, 0.08, 0.05, 0.025, 0.015];

  for (let i = 0; i < iterations; i++) {
    const heroHandType = weightedRandom(weights);
    handTypeCounts[heroHandType]++;

    let heroWon = true;
    for (let opp = 0; opp < playerCount - 1; opp++) {
      const oppHandType = weightedRandom(weights);
      if (oppHandType > heroHandType || (oppHandType === heroHandType && Math.random() > 0.5)) {
        heroWon = false;
        break;
      }
    }

    if (heroWon) {
      heroWins++;
      handTypeWins[heroHandType]++;
    }
  }

  return {
    metadata: {
      gameVariant,
      playerCount,
      iterations,
      generatedAt: new Date().toISOString()
    },
    statistics: {
      handTypeDistribution: handTypeNames.map((name, i) => ({
        handType: i,
        name,
        count: handTypeCounts[i],
        percentage: parseFloat((handTypeCounts[i] / iterations * 100).toFixed(2)),
        wins: handTypeWins[i],
        winRate: handTypeCounts[i] > 0 ? parseFloat((handTypeWins[i] / handTypeCounts[i] * 100).toFixed(2)) : 0
      })),
      overallWinRate: parseFloat((heroWins / iterations * 100).toFixed(2))
    }
  };
}

function weightedRandom(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) return i;
  }
  return weights.length - 1;
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
