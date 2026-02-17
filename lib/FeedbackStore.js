/**
 * Feedback Storage Module
 *
 * Stores and retrieves user feedback on Play Advisor recommendations.
 * Uses file-based JSON storage for simplicity (can be upgraded to DB later).
 *
 * Phase 5: Refinement & Learning
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data/feedback');
const FEEDBACK_FILE = join(DATA_DIR, 'feedback.json');
const ANALYTICS_FILE = join(DATA_DIR, 'analytics.json');

// Ensure data directory exists
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ============================================================================
// FEEDBACK SCHEMA
// ============================================================================

/**
 * Feedback entry structure
 * @typedef {Object} FeedbackEntry
 * @property {string} id - Unique feedback ID
 * @property {number} timestamp - Unix timestamp
 * @property {'positive'|'negative'} rating - User rating
 * @property {string} action - Recommended action (fold/call/raise/bet/check)
 * @property {Object} context - Recommendation context
 * @property {string} [userComment] - Optional user comment
 * @property {Object} [metadata] - Additional metadata
 */

// ============================================================================
// STORAGE OPERATIONS
// ============================================================================

/**
 * Load feedback data from file
 */
function loadFeedback() {
  ensureDataDir();

  if (!existsSync(FEEDBACK_FILE)) {
    return { entries: [], lastUpdated: null };
  }

  try {
    const data = readFileSync(FEEDBACK_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Error loading feedback:', e);
    return { entries: [], lastUpdated: null };
  }
}

/**
 * Save feedback data to file
 */
function saveFeedback(data) {
  ensureDataDir();

  try {
    data.lastUpdated = Date.now();
    writeFileSync(FEEDBACK_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Error saving feedback:', e);
    return false;
  }
}

/**
 * Generate unique feedback ID
 */
function generateId() {
  return `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Store a new feedback entry
 *
 * @param {Object} params - Feedback parameters
 * @param {'positive'|'negative'} params.rating - User rating
 * @param {string} params.action - Recommended action
 * @param {Object} params.context - Full recommendation context
 * @param {string} [params.userComment] - Optional comment
 * @returns {Object} - Result with success status and feedback ID
 */
export function storeFeedback({ rating, action, context, userComment }) {
  if (!rating || !['positive', 'negative'].includes(rating)) {
    return { success: false, error: 'Invalid rating. Must be "positive" or "negative".' };
  }

  if (!action) {
    return { success: false, error: 'Action is required.' };
  }

  const data = loadFeedback();

  const entry = {
    id: generateId(),
    timestamp: Date.now(),
    rating,
    action,
    context: {
      // Store key context for analysis
      gameVariant: context.gameVariant,
      street: context.street,
      position: context.position,
      playersInHand: context.playersInHand,
      handType: context.handType,
      equity: context.equity,
      potOdds: context.potOdds,
      spr: context.spr,
      confidence: context.confidence,
      betType: context.betType,
      isNuts: context.isNuts
    },
    userComment: userComment || null,
    metadata: {
      userAgent: context.userAgent || null,
      sessionId: context.sessionId || null
    }
  };

  data.entries.push(entry);

  // Keep last 10,000 entries max
  if (data.entries.length > 10000) {
    data.entries = data.entries.slice(-10000);
  }

  const saved = saveFeedback(data);

  if (saved) {
    // Update analytics
    updateAnalytics(entry);
    return { success: true, feedbackId: entry.id };
  }

  return { success: false, error: 'Failed to save feedback.' };
}

/**
 * Get feedback statistics
 */
export function getFeedbackStats() {
  const data = loadFeedback();
  const entries = data.entries || [];

  if (entries.length === 0) {
    return {
      total: 0,
      positive: 0,
      negative: 0,
      positiveRate: 0,
      byAction: {},
      byStreet: {},
      byPosition: {},
      recent: []
    };
  }

  const positive = entries.filter(e => e.rating === 'positive').length;
  const negative = entries.filter(e => e.rating === 'negative').length;

  // Group by action
  const byAction = {};
  entries.forEach(e => {
    if (!byAction[e.action]) {
      byAction[e.action] = { total: 0, positive: 0, negative: 0 };
    }
    byAction[e.action].total++;
    byAction[e.action][e.rating]++;
  });

  // Calculate rates
  Object.keys(byAction).forEach(action => {
    const stats = byAction[action];
    stats.positiveRate = stats.total > 0
      ? Math.round((stats.positive / stats.total) * 100)
      : 0;
  });

  // Group by street
  const byStreet = {};
  entries.forEach(e => {
    const street = e.context?.street || 'unknown';
    if (!byStreet[street]) {
      byStreet[street] = { total: 0, positive: 0, negative: 0 };
    }
    byStreet[street].total++;
    byStreet[street][e.rating]++;
  });

  // Group by position
  const byPosition = {};
  entries.forEach(e => {
    const position = e.context?.position || 'unknown';
    if (!byPosition[position]) {
      byPosition[position] = { total: 0, positive: 0, negative: 0 };
    }
    byPosition[position].total++;
    byPosition[position][e.rating]++;
  });

  // Get recent entries with comments
  const recent = entries
    .filter(e => e.userComment)
    .slice(-10)
    .reverse();

  return {
    total: entries.length,
    positive,
    negative,
    positiveRate: Math.round((positive / entries.length) * 100),
    byAction,
    byStreet,
    byPosition,
    recent,
    lastUpdated: data.lastUpdated
  };
}

/**
 * Get feedback entries matching criteria
 */
export function queryFeedback({ action, rating, street, position, limit = 100 }) {
  const data = loadFeedback();
  let entries = data.entries || [];

  if (action) {
    entries = entries.filter(e => e.action === action);
  }

  if (rating) {
    entries = entries.filter(e => e.rating === rating);
  }

  if (street) {
    entries = entries.filter(e => e.context?.street === street);
  }

  if (position) {
    entries = entries.filter(e => e.context?.position === position);
  }

  return entries.slice(-limit).reverse();
}

/**
 * Get negative feedback patterns (for tuning)
 */
export function getNegativeFeedbackPatterns() {
  const data = loadFeedback();
  const negatives = (data.entries || []).filter(e => e.rating === 'negative');

  if (negatives.length === 0) {
    return { patterns: [], suggestions: [] };
  }

  // Analyze patterns
  const patterns = [];

  // Pattern: Action with low approval rate
  const byAction = {};
  negatives.forEach(e => {
    byAction[e.action] = (byAction[e.action] || 0) + 1;
  });

  const totalNegatives = negatives.length;
  Object.entries(byAction).forEach(([action, count]) => {
    if (count / totalNegatives > 0.3) {
      patterns.push({
        type: 'action_disliked',
        action,
        frequency: Math.round((count / totalNegatives) * 100),
        description: `${action.toUpperCase()} recommendations are frequently disliked (${count} times)`
      });
    }
  });

  // Pattern: High equity folds
  const highEquityFolds = negatives.filter(
    e => e.action === 'fold' && e.context?.equity > 40
  );
  if (highEquityFolds.length > 3) {
    patterns.push({
      type: 'high_equity_fold',
      frequency: highEquityFolds.length,
      description: `Folding with equity > 40% flagged as bad ${highEquityFolds.length} times`
    });
  }

  // Pattern: Low confidence disliked
  const lowConfidence = negatives.filter(
    e => e.context?.confidence && e.context.confidence < 0.6
  );
  if (lowConfidence.length / totalNegatives > 0.5) {
    patterns.push({
      type: 'low_confidence_issues',
      frequency: lowConfidence.length,
      description: 'Low confidence recommendations are often wrong'
    });
  }

  // Generate suggestions
  const suggestions = [];

  if (patterns.find(p => p.type === 'high_equity_fold')) {
    suggestions.push('Consider raising the fold threshold - users dislike folding with decent equity');
  }

  if (patterns.find(p => p.type === 'low_confidence_issues')) {
    suggestions.push('Consider showing alternatives when confidence is low');
  }

  return { patterns, suggestions, totalNegatives };
}

// ============================================================================
// ANALYTICS
// ============================================================================

function loadAnalytics() {
  ensureDataDir();

  if (!existsSync(ANALYTICS_FILE)) {
    return {
      dailyStats: {},
      actionStats: {},
      lastUpdated: null
    };
  }

  try {
    const data = readFileSync(ANALYTICS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return { dailyStats: {}, actionStats: {}, lastUpdated: null };
  }
}

function saveAnalytics(data) {
  ensureDataDir();

  try {
    data.lastUpdated = Date.now();
    writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving analytics:', e);
  }
}

function updateAnalytics(entry) {
  const analytics = loadAnalytics();

  // Daily stats
  const dateKey = new Date(entry.timestamp).toISOString().split('T')[0];
  if (!analytics.dailyStats[dateKey]) {
    analytics.dailyStats[dateKey] = { total: 0, positive: 0, negative: 0 };
  }
  analytics.dailyStats[dateKey].total++;
  analytics.dailyStats[dateKey][entry.rating]++;

  // Action stats
  if (!analytics.actionStats[entry.action]) {
    analytics.actionStats[entry.action] = { total: 0, positive: 0, negative: 0 };
  }
  analytics.actionStats[entry.action].total++;
  analytics.actionStats[entry.action][entry.rating]++;

  // Keep only last 90 days of daily stats
  const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
  Object.keys(analytics.dailyStats).forEach(key => {
    if (new Date(key).getTime() < cutoff) {
      delete analytics.dailyStats[key];
    }
  });

  saveAnalytics(analytics);
}

/**
 * Get analytics summary
 */
export function getAnalytics() {
  const analytics = loadAnalytics();

  // Calculate trends
  const dailyKeys = Object.keys(analytics.dailyStats).sort();
  const last7Days = dailyKeys.slice(-7);
  const prev7Days = dailyKeys.slice(-14, -7);

  const last7Total = last7Days.reduce((sum, key) => sum + (analytics.dailyStats[key]?.total || 0), 0);
  const last7Positive = last7Days.reduce((sum, key) => sum + (analytics.dailyStats[key]?.positive || 0), 0);

  const prev7Total = prev7Days.reduce((sum, key) => sum + (analytics.dailyStats[key]?.total || 0), 0);
  const prev7Positive = prev7Days.reduce((sum, key) => sum + (analytics.dailyStats[key]?.positive || 0), 0);

  const last7Rate = last7Total > 0 ? Math.round((last7Positive / last7Total) * 100) : 0;
  const prev7Rate = prev7Total > 0 ? Math.round((prev7Positive / prev7Total) * 100) : 0;

  return {
    dailyStats: analytics.dailyStats,
    actionStats: analytics.actionStats,
    trends: {
      last7Days: {
        total: last7Total,
        positive: last7Positive,
        positiveRate: last7Rate
      },
      prev7Days: {
        total: prev7Total,
        positive: prev7Positive,
        positiveRate: prev7Rate
      },
      rateChange: last7Rate - prev7Rate
    },
    lastUpdated: analytics.lastUpdated
  };
}

// ============================================================================
// RECOMMENDATION LOGGING
// ============================================================================

const RECOMMENDATIONS_FILE = join(DATA_DIR, 'recommendations.json');

/**
 * Log a recommendation (for analysis, separate from feedback)
 */
export function logRecommendation(recommendation) {
  ensureDataDir();

  let data = { entries: [] };

  if (existsSync(RECOMMENDATIONS_FILE)) {
    try {
      data = JSON.parse(readFileSync(RECOMMENDATIONS_FILE, 'utf-8'));
    } catch (e) {
      // Start fresh
    }
  }

  const logId = generateId().replace('fb_', 'rec_');

  data.entries.push({
    id: logId,
    timestamp: Date.now(),
    ...recommendation
  });

  // Keep last 50,000 recommendations
  if (data.entries.length > 50000) {
    data.entries = data.entries.slice(-50000);
  }

  try {
    writeFileSync(RECOMMENDATIONS_FILE, JSON.stringify(data, null, 2));
    return { success: true, logId };
  } catch (e) {
    console.error('Error logging recommendation:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Get recommendation logs
 */
export function getRecommendationLogs({ limit = 100, action, street } = {}) {
  if (!existsSync(RECOMMENDATIONS_FILE)) {
    return [];
  }

  try {
    const data = JSON.parse(readFileSync(RECOMMENDATIONS_FILE, 'utf-8'));
    let entries = data.entries || [];

    if (action) {
      entries = entries.filter(e => e.action === action);
    }

    if (street) {
      entries = entries.filter(e => e.street === street);
    }

    return entries.slice(-limit).reverse();
  } catch (e) {
    return [];
  }
}

/**
 * Clear all data (for testing purposes)
 */
export function clearAllData() {
  ensureDataDir();

  try {
    if (existsSync(FEEDBACK_FILE)) {
      writeFileSync(FEEDBACK_FILE, JSON.stringify({ entries: [], lastUpdated: null }));
    }
    if (existsSync(ANALYTICS_FILE)) {
      writeFileSync(ANALYTICS_FILE, JSON.stringify({ dailyStats: {}, actionStats: {}, lastUpdated: null }));
    }
    if (existsSync(RECOMMENDATIONS_FILE)) {
      writeFileSync(RECOMMENDATIONS_FILE, JSON.stringify({ entries: [] }));
    }
    return true;
  } catch (e) {
    console.error('Error clearing data:', e);
    return false;
  }
}

export default {
  storeFeedback,
  getFeedbackStats,
  queryFeedback,
  getNegativeFeedbackPatterns,
  getAnalytics,
  logRecommendation,
  getRecommendationLogs,
  clearAllData
};
