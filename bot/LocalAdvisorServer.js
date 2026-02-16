/**
 * LocalAdvisorServer - Simple local API server for Play Advisor testing
 *
 * This wraps the Play Advisor API for local testing without needing Vercel.
 * Run this alongside your bot tests.
 *
 * Usage:
 *   node bot/LocalAdvisorServer.js
 *   # API available at http://localhost:3001/api/advise
 */

import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.ADVISOR_PORT || 3001;

app.use(express.json());

// CORS for local testing
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Dynamically import the advise handler
let adviseHandler = null;

async function loadAdviseHandler() {
  try {
    // Import the API handler
    const adviseModule = await import('../api/advise.js');
    adviseHandler = adviseModule.default;
    console.log('✓ Loaded advise handler');
  } catch (error) {
    console.error('Failed to load advise handler:', error.message);
    // Provide a fallback handler
    adviseHandler = async (req, res) => {
      res.status(500).json({ error: 'Advise handler not available' });
    };
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Play Advisor endpoint
app.post('/api/advise', async (req, res) => {
  if (!adviseHandler) {
    return res.status(503).json({ error: 'Handler not ready' });
  }

  try {
    // The Vercel function expects (req, res) format
    await adviseHandler(req, res);
  } catch (error) {
    console.error('Advise error:', error);
    res.status(500).json({
      error: error.message,
      recommendation: {
        action: 'fold',
        confidence: 0,
        reasoning: { primary: 'Error - folding as safe default' }
      }
    });
  }
});

// Fallback simple advisor for testing
app.post('/api/advise-simple', (req, res) => {
  const { holeCards, board, toCall, potSize, availableActions } = req.body;

  // Simple rule-based advisor for testing
  let action = 'fold';
  let confidence = 50;

  // If we can check, do that
  if (availableActions?.includes('check')) {
    action = 'check';
    confidence = 80;
  }
  // If pot odds are good (>3:1), call
  else if (toCall && potSize && potSize / toCall > 3) {
    action = 'call';
    confidence = 60;
  }
  // Otherwise fold
  else {
    action = 'fold';
    confidence = 40;
  }

  res.json({
    recommendation: {
      action,
      confidence,
      reasoning: { primary: 'Simple rule-based decision' }
    }
  });
});

async function start() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║      Local Play Advisor Server         ║');
  console.log('╚════════════════════════════════════════╝\n');

  await loadAdviseHandler();

  app.listen(PORT, () => {
    console.log(`\n✓ Server running at http://localhost:${PORT}`);
    console.log(`  - POST /api/advise - Full advisor`);
    console.log(`  - POST /api/advise-simple - Simple fallback`);
    console.log(`  - GET /api/health - Health check\n`);
  });
}

start().catch(console.error);

export default app;
