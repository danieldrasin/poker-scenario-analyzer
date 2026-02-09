#!/usr/bin/env node
/**
 * Generate Tier 1 bundled data for all Omaha variants
 *
 * This script pre-computes simulation data that will be bundled with the app.
 * Run with: node scripts/generate-bundled-data.js
 *
 * Output goes to: packages/web/src/public/data/tier1/
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Import simulator
const { Simulator } = require('../packages/core/dist/simulator/Simulator.js');

// Configuration
const CONFIG = {
  outputDir: path.join(__dirname, '../packages/web/src/public/data/tier1'),

  variants: [
    { name: 'omaha4', display: '4-card Omaha (PLO)', cards: 4, maxPlayers: 10 },
    { name: 'omaha5', display: '5-card Omaha (PLO5)', cards: 5, maxPlayers: 9 },  // 9×5+5=50 cards
    { name: 'omaha6', display: '6-card Omaha (PLO6)', cards: 6, maxPlayers: 7 }   // 7×6+5=47 cards
  ],

  playerCounts: [2, 3, 4, 5, 6, 7, 8, 9, 10],

  // Iterations per simulation (higher = more accurate but slower)
  iterations: 50000,  // Reduced for faster generation; still statistically reliable

  // Whether to generate compressed versions
  compress: true
};

// Progress tracking
let totalConfigs = 0;
let completedConfigs = 0;

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return (ms / 60000).toFixed(1) + 'm';
}

async function generateVariantData(variant) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Generating data for ${variant.display}`);
  console.log(`Max players: ${variant.maxPlayers} (deck constraint: ${variant.cards} cards × players + 5 board)`);
  console.log('='.repeat(60));

  const variantData = {
    variant: variant.name,
    display: variant.display,
    cards: variant.cards,
    maxPlayers: variant.maxPlayers,
    generatedAt: new Date().toISOString(),
    iterationsPerConfig: CONFIG.iterations,
    byPlayerCount: {}
  };

  const startTime = Date.now();

  // Filter player counts by variant's max
  const validPlayerCounts = CONFIG.playerCounts.filter(p => p <= variant.maxPlayers);

  for (const playerCount of validPlayerCounts) {
    const configStart = Date.now();

    console.log(`\n  ${playerCount} players...`);

    try {
      const simulator = new Simulator({
        gameVariant: variant.name,
        playerCount: playerCount,
        iterations: CONFIG.iterations,
        storeHandRecords: false
      });

      const result = simulator.run();

      // Extract just the statistics (not metadata with timestamps)
      variantData.byPlayerCount[playerCount] = {
        playerCount,
        totalHands: result.statistics.totalHands,
        handTypeDistribution: result.statistics.handTypeDistribution,
        probabilityMatrix: result.statistics.probabilityMatrix,
        byStartingCategory: result.statistics.byStartingCategory
      };

      const duration = Date.now() - configStart;
      completedConfigs++;

      const progress = ((completedConfigs / totalConfigs) * 100).toFixed(1);
      console.log(`    ✓ Completed in ${formatDuration(duration)} [${progress}% overall]`);

    } catch (error) {
      console.error(`    ✗ Error: ${error.message}`);
    }
  }

  const totalDuration = Date.now() - startTime;
  console.log(`\n  Total time for ${variant.display}: ${formatDuration(totalDuration)}`);

  return variantData;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Poker Simulator - Tier 1 Data Generator              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Create output directory
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    console.log(`\nCreated output directory: ${CONFIG.outputDir}`);
  }

  totalConfigs = CONFIG.variants.reduce((sum, v) =>
    sum + CONFIG.playerCounts.filter(p => p <= v.maxPlayers).length, 0);
  console.log(`\nWill generate ${totalConfigs} configurations:`);
  CONFIG.variants.forEach(v => {
    const validCounts = CONFIG.playerCounts.filter(p => p <= v.maxPlayers);
    console.log(`  - ${v.name}: players ${validCounts.join(', ')} (${validCounts.length} configs)`);
  });
  console.log(`  - Iterations per config: ${CONFIG.iterations.toLocaleString()}`);

  const overallStart = Date.now();
  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    variants: [],
    playerCounts: CONFIG.playerCounts,
    iterationsPerConfig: CONFIG.iterations,
    files: []
  };

  for (const variant of CONFIG.variants) {
    const data = await generateVariantData(variant);
    manifest.variants.push(variant.name);

    // Save JSON
    const filename = `${variant.name === 'omaha4' ? 'plo4' : variant.name === 'omaha5' ? 'plo5' : 'plo6'}-base.json`;
    const filepath = path.join(CONFIG.outputDir, filename);

    const jsonStr = JSON.stringify(data);
    fs.writeFileSync(filepath, jsonStr);

    const fileInfo = {
      variant: variant.name,
      filename,
      sizeBytes: jsonStr.length,
      sizeFormatted: formatBytes(jsonStr.length)
    };

    // Optionally compress
    if (CONFIG.compress) {
      const gzipFilename = filename + '.gz';
      const gzipFilepath = path.join(CONFIG.outputDir, gzipFilename);
      const compressed = zlib.gzipSync(jsonStr);
      fs.writeFileSync(gzipFilepath, compressed);

      fileInfo.compressedFilename = gzipFilename;
      fileInfo.compressedSizeBytes = compressed.length;
      fileInfo.compressedSizeFormatted = formatBytes(compressed.length);
      fileInfo.compressionRatio = ((1 - compressed.length / jsonStr.length) * 100).toFixed(1) + '%';
    }

    manifest.files.push(fileInfo);
    console.log(`\n  Saved: ${filename} (${fileInfo.sizeFormatted})`);
    if (CONFIG.compress) {
      console.log(`  Compressed: ${fileInfo.compressedFilename} (${fileInfo.compressedSizeFormatted}, ${fileInfo.compressionRatio} reduction)`);
    }
  }

  // Save manifest
  const manifestPath = path.join(CONFIG.outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const totalDuration = Date.now() - overallStart;

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('GENERATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nTotal time: ${formatDuration(totalDuration)}`);
  console.log(`Configs generated: ${completedConfigs}/${totalConfigs}`);

  const totalSize = manifest.files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const totalCompressed = manifest.files.reduce((sum, f) => sum + (f.compressedSizeBytes || 0), 0);

  console.log(`\nFile sizes:`);
  console.log(`  Raw JSON:    ${formatBytes(totalSize)}`);
  if (CONFIG.compress) {
    console.log(`  Gzipped:     ${formatBytes(totalCompressed)}`);
  }

  console.log(`\nFiles written to: ${CONFIG.outputDir}`);
  console.log('\nManifest saved to: manifest.json');
}

// Run
main().catch(console.error);
