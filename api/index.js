/**
 * Vercel Serverless API Handler (Fallback)
 *
 * This handles API routes not explicitly defined in vercel.json rewrites.
 * Most routes are directly mapped to their respective handler files.
 */

export default function handler(req, res) {
  const { method, url } = req;
  const path = url.replace('/api', '').split('?')[0];

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Server simulations are not supported in static deployment
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
