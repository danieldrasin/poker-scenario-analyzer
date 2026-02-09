import express, { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import {
  Simulator,
  SimulationConfig,
  SimulationResult,
  GameVariant,
  SUPPORTED_VARIANTS,
  HandType,
  formatProbabilityMatrix
} from '@poker-sim/core';
import {
  saveSimulationJSON,
  loadSimulationJSON,
  loadSimulationsJSON,
  listSimulationFiles
} from '@poker-sim/storage';

const app = express();
const PORT = process.env.PORT || 3000;

// Data directory
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data', 'simulations');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Middleware
app.use(express.json());

// Static files - handle both dev and built paths
const publicPath = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', 'src', 'public');
app.use(express.static(publicPath));

// API Routes

// Get list of saved simulations
app.get('/api/simulations', (req: Request, res: Response) => {
  try {
    const files = listSimulationFiles(DATA_DIR);
    const simulations = files.map(file => {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(content);
        // Handle both single results and batch arrays
        const data = Array.isArray(parsed) ? parsed[0] : parsed;
        return {
          id: data.metadata.id,
          filename: path.basename(file),
          game: data.metadata.config.gameVariant,
          players: Array.isArray(parsed) ? 'batch' : data.metadata.config.playerCount,
          iterations: data.metadata.config.iterations,
          createdAt: data.metadata.createdAt
        };
      } catch (e) {
        console.error(`Failed to parse ${file}:`, e);
        return null;
      }
    }).filter(Boolean);
    res.json(simulations);
  } catch (error) {
    console.error('List simulations error:', error);
    res.status(500).json({ error: 'Failed to list simulations' });
  }
});

// Load a specific simulation
app.get('/api/simulations/:filename', (req: Request, res: Response) => {
  try {
    const filePath = path.join(DATA_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    const data = loadSimulationJSON(filePath);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load simulation' });
  }
});

// Run a new simulation
app.post('/api/simulate', async (req: Request, res: Response) => {
  try {
    const {
      gameVariant = 'omaha4',
      playerCount = 6,
      iterations = 10000,
      seed
    } = req.body;

    const config: SimulationConfig = {
      gameVariant: gameVariant as GameVariant,
      playerCount,
      iterations,
      seed
    };

    console.log(`Starting simulation: ${gameVariant}, ${playerCount} players, ${iterations} iterations`);

    const simulator = new Simulator(config);
    const result = simulator.run((completed, total) => {
      // Progress logging
      if (completed % 5000 === 0) {
        console.log(`  Progress: ${((completed / total) * 100).toFixed(1)}%`);
      }
    });

    // Save to file
    const filename = `${gameVariant}_${playerCount}p_${iterations}i_${Date.now()}.json`;
    const filePath = path.join(DATA_DIR, filename);
    saveSimulationJSON(result, filePath);

    console.log(`Simulation complete. Saved to ${filename}`);

    res.json({
      success: true,
      filename,
      result
    });
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ error: 'Simulation failed', details: String(error) });
  }
});

// Run batch simulation (multiple player counts)
app.post('/api/simulate/batch', async (req: Request, res: Response) => {
  try {
    const {
      gameVariant = 'omaha4',
      playerCounts = [2, 3, 4, 5, 6, 7, 8, 9],
      iterations = 10000,
      seed
    } = req.body;

    const results: SimulationResult[] = [];

    for (const playerCount of playerCounts) {
      console.log(`Running ${playerCount}-player simulation...`);

      const config: SimulationConfig = {
        gameVariant: gameVariant as GameVariant,
        playerCount,
        iterations,
        seed: seed ? seed + playerCount : undefined
      };

      const simulator = new Simulator(config);
      const result = simulator.run();
      results.push(result);
    }

    // Save combined results
    const filename = `${gameVariant}_batch_${iterations}i_${Date.now()}.json`;
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(results, null, 2));

    console.log(`Batch simulation complete. Saved to ${filename}`);

    res.json({
      success: true,
      filename,
      results
    });
  } catch (error) {
    console.error('Batch simulation error:', error);
    res.status(500).json({ error: 'Batch simulation failed', details: String(error) });
  }
});

// Delete a simulation
app.delete('/api/simulations/:filename', (req: Request, res: Response) => {
  try {
    const filePath = path.join(DATA_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    fs.unlinkSync(filePath);
    console.log(`Deleted simulation: ${req.params.filename}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete simulation' });
  }
});

// Get supported game variants
app.get('/api/variants', (req: Request, res: Response) => {
  res.json(SUPPORTED_VARIANTS);
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve index.html for root
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                   Poker Simulator                          ║
║                                                            ║
║   Web UI running at: http://localhost:${PORT}                 ║
║                                                            ║
║   Press Ctrl+C to stop the server                          ║
╚════════════════════════════════════════════════════════════╝
`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
});
