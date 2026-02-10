/**
 * Vercel Serverless API Handler
 *
 * This provides a lightweight API for the poker simulator.
 * Most functionality is client-side with IndexedDB, but this
 * handles any server-side needs.
 */

import dataHandler from './data.js';

export default async function handler(req, res) {
  const { method, url } = req;
  const path = url.replace('/api', '').split('?')[0]; // Remove query string for matching

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check
  if (path === '/health' || path === '/health/') {
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      deployment: 'vercel',
      note: 'Primary storage is client-side IndexedDB'
    });
  }

  // Variants info
  if (path === '/variants' || path === '/variants/') {
    return res.status(200).json([
      { name: 'omaha4', display: '4-card Omaha (PLO)', cards: 4, maxPlayers: 10 },
      { name: 'omaha5', display: '5-card Omaha (PLO5)', cards: 5, maxPlayers: 9 },
      { name: 'omaha6', display: '6-card Omaha (PLO6)', cards: 6, maxPlayers: 7 },
      { name: 'holdem', display: 'Texas Hold\'em', cards: 2, maxPlayers: 10 }
    ]);
  }

  // Tier 2 data from R2
  if (path === '/data' || path === '/data/') {
    return dataHandler(req, res);
  }

  // Server simulations are not supported in static deployment
  // All simulation storage is handled by IndexedDB on the client
  if (path.startsWith('/simulations')) {
    return res.status(200).json({
      message: 'Server-side simulation storage is not available in this deployment.',
      hint: 'Simulations are stored locally in your browser using IndexedDB.',
      simulations: []
    });
  }

  // Default: not found
  return res.status(404).json({
    error: 'Not found',
    path: path,
    availableEndpoints: ['/api/health', '/api/variants', '/api/data', '/api/simulations']
  });
}
