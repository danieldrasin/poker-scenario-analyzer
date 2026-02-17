/**
 * Feedback API Endpoint
 *
 * Handles storing and retrieving feedback on Play Advisor recommendations.
 *
 * POST /api/feedback - Submit feedback
 * GET /api/feedback - Get feedback statistics
 * GET /api/feedback/patterns - Get negative feedback patterns
 * GET /api/feedback/analytics - Get analytics data
 *
 * Phase 5: Refinement & Learning
 */

import {
  storeFeedback,
  getFeedbackStats,
  queryFeedback,
  getNegativeFeedbackPatterns,
  getAnalytics
} from '../lib/FeedbackStore.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse query parameters
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const subPath = pathParts[2]; // e.g., /api/feedback/patterns -> 'patterns'

  try {
    // =========================================================================
    // POST /api/feedback - Submit feedback
    // =========================================================================
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      const { rating, action, context, userComment } = body;

      if (!rating) {
        return res.status(400).json({
          error: 'Missing required field: rating',
          hint: 'Must be "positive" or "negative"'
        });
      }

      if (!action) {
        return res.status(400).json({
          error: 'Missing required field: action',
          hint: 'The recommended action (fold, call, raise, etc.)'
        });
      }

      const result = storeFeedback({
        rating,
        action,
        context: context || {},
        userComment
      });

      if (result.success) {
        return res.status(201).json({
          message: 'Feedback recorded',
          feedbackId: result.feedbackId
        });
      } else {
        return res.status(500).json({
          error: result.error || 'Failed to store feedback'
        });
      }
    }

    // =========================================================================
    // GET /api/feedback/patterns - Get negative feedback patterns
    // =========================================================================
    if (req.method === 'GET' && subPath === 'patterns') {
      const patterns = getNegativeFeedbackPatterns();
      return res.status(200).json(patterns);
    }

    // =========================================================================
    // GET /api/feedback/analytics - Get analytics data
    // =========================================================================
    if (req.method === 'GET' && subPath === 'analytics') {
      const analytics = getAnalytics();
      return res.status(200).json(analytics);
    }

    // =========================================================================
    // GET /api/feedback/query - Query specific feedback
    // =========================================================================
    if (req.method === 'GET' && subPath === 'query') {
      const action = url.searchParams.get('action');
      const rating = url.searchParams.get('rating');
      const street = url.searchParams.get('street');
      const position = url.searchParams.get('position');
      const limit = parseInt(url.searchParams.get('limit')) || 100;

      const entries = queryFeedback({ action, rating, street, position, limit });
      return res.status(200).json({ entries, count: entries.length });
    }

    // =========================================================================
    // GET /api/feedback - Get feedback statistics
    // =========================================================================
    if (req.method === 'GET') {
      const stats = getFeedbackStats();
      return res.status(200).json(stats);
    }

    // Method not allowed
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['GET', 'POST']
    });

  } catch (error) {
    console.error('Feedback API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
