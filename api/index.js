/**
 * Vercel Serverless API Handler
 *
 * Routes API requests to appropriate handlers.
 * Handles query-param routes that Vercel may not route correctly.
 */

import dataHandler from './data.js';
import healthHandler from './health.js';
import variantsHandler from './variants.js';
import simulateHandler from './simulate.js';

export default async function handler(req, res) {
  const { method, url } = req;
  const path = url.replace('/api', '').split('?')[0];

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Route to appropriate handlers
  if (path === '/health' || path === '/health/') {
    return healthHandler(req, res);
  }

  if (path === '/variants' || path === '/variants/') {
    return variantsHandler(req, res);
  }

  if (path === '/data' || path === '/data/') {
    return dataHandler(req, res);
  }

  if (path === '/simulate' || path === '/simulate/') {
    return simulateHandler(req, res);
  }

  // Server simulations storage not supported
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
    availableEndpoints: ['/api/health', '/api/variants', '/api/data', '/api/simulate', '/api/simulations']
  });
}
