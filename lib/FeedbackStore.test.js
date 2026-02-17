/**
 * FeedbackStore Unit Tests
 *
 * Phase 5: Refinement & Learning
 * Tests for feedback storage, retrieval, and analytics
 */

import {
  storeFeedback,
  getFeedbackStats,
  queryFeedback,
  getNegativeFeedbackPatterns,
  getAnalytics,
  logRecommendation,
  clearAllData
} from './FeedbackStore.js';

describe('FeedbackStore', () => {
  // Clear data before each test
  beforeEach(() => {
    clearAllData();
  });

  describe('storeFeedback', () => {
    it('stores positive feedback successfully', () => {
      const result = storeFeedback({
        rating: 'positive',
        action: 'fold',
        context: { street: 'flop', position: 'BTN' }
      });

      expect(result.success).toBe(true);
      expect(result.feedbackId).toBeDefined();
    });

    it('stores negative feedback with comment', () => {
      const result = storeFeedback({
        rating: 'negative',
        action: 'raise',
        context: { street: 'turn', position: 'BB' },
        userComment: 'Should have folded here'
      });

      expect(result.success).toBe(true);
      expect(result.feedbackId).toBeDefined();
    });

    it('rejects feedback without rating', () => {
      const result = storeFeedback({
        action: 'call',
        context: {}
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects feedback without action', () => {
      const result = storeFeedback({
        rating: 'positive',
        context: {}
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects invalid rating', () => {
      const result = storeFeedback({
        rating: 'maybe',
        action: 'fold',
        context: {}
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('rating');
    });

    it('generates unique feedback IDs', () => {
      const result1 = storeFeedback({
        rating: 'positive',
        action: 'fold',
        context: {}
      });
      const result2 = storeFeedback({
        rating: 'positive',
        action: 'fold',
        context: {}
      });

      expect(result1.feedbackId).not.toBe(result2.feedbackId);
    });
  });

  describe('getFeedbackStats', () => {
    it('returns zero stats when no feedback exists', () => {
      const stats = getFeedbackStats();

      expect(stats.total).toBe(0);
      expect(stats.positive).toBe(0);
      expect(stats.negative).toBe(0);
    });

    it('calculates positive rate correctly', () => {
      // Add 3 positive, 1 negative
      storeFeedback({ rating: 'positive', action: 'fold', context: {} });
      storeFeedback({ rating: 'positive', action: 'call', context: {} });
      storeFeedback({ rating: 'positive', action: 'raise', context: {} });
      storeFeedback({ rating: 'negative', action: 'fold', context: {} });

      const stats = getFeedbackStats();

      expect(stats.total).toBe(4);
      expect(stats.positive).toBe(3);
      expect(stats.negative).toBe(1);
      expect(stats.positiveRate).toBe(75); // 3/4 = 75%
    });

    it('tracks action breakdown', () => {
      storeFeedback({ rating: 'positive', action: 'fold', context: {} });
      storeFeedback({ rating: 'positive', action: 'fold', context: {} });
      storeFeedback({ rating: 'negative', action: 'raise', context: {} });

      const stats = getFeedbackStats();

      expect(stats.byAction.fold.positive).toBe(2);
      expect(stats.byAction.fold.negative).toBe(0);
      expect(stats.byAction.raise.positive).toBe(0);
      expect(stats.byAction.raise.negative).toBe(1);
    });

    it('tracks street breakdown', () => {
      storeFeedback({ rating: 'positive', action: 'fold', context: { street: 'flop' } });
      storeFeedback({ rating: 'negative', action: 'call', context: { street: 'flop' } });
      storeFeedback({ rating: 'positive', action: 'raise', context: { street: 'turn' } });

      const stats = getFeedbackStats();

      expect(stats.byStreet.flop.total).toBe(2);
      expect(stats.byStreet.turn.total).toBe(1);
    });

    it('tracks position breakdown', () => {
      storeFeedback({ rating: 'positive', action: 'fold', context: { position: 'BTN' } });
      storeFeedback({ rating: 'positive', action: 'call', context: { position: 'BTN' } });
      storeFeedback({ rating: 'negative', action: 'raise', context: { position: 'BB' } });

      const stats = getFeedbackStats();

      expect(stats.byPosition.BTN.total).toBe(2);
      expect(stats.byPosition.BB.total).toBe(1);
    });
  });

  describe('queryFeedback', () => {
    beforeEach(() => {
      // Set up test data
      storeFeedback({ rating: 'positive', action: 'fold', context: { street: 'flop', position: 'BTN' } });
      storeFeedback({ rating: 'negative', action: 'fold', context: { street: 'turn', position: 'BB' } });
      storeFeedback({ rating: 'positive', action: 'raise', context: { street: 'flop', position: 'BTN' } });
      storeFeedback({ rating: 'negative', action: 'call', context: { street: 'river', position: 'SB' } });
    });

    it('filters by action', () => {
      const results = queryFeedback({ action: 'fold' });

      expect(results.length).toBe(2);
      results.forEach(r => expect(r.action).toBe('fold'));
    });

    it('filters by rating', () => {
      const results = queryFeedback({ rating: 'negative' });

      expect(results.length).toBe(2);
      results.forEach(r => expect(r.rating).toBe('negative'));
    });

    it('filters by street', () => {
      const results = queryFeedback({ street: 'flop' });

      expect(results.length).toBe(2);
      results.forEach(r => expect(r.context.street).toBe('flop'));
    });

    it('filters by position', () => {
      const results = queryFeedback({ position: 'BTN' });

      expect(results.length).toBe(2);
      results.forEach(r => expect(r.context.position).toBe('BTN'));
    });

    it('combines multiple filters', () => {
      const results = queryFeedback({ action: 'fold', rating: 'positive' });

      expect(results.length).toBe(1);
      expect(results[0].action).toBe('fold');
      expect(results[0].rating).toBe('positive');
    });

    it('respects limit parameter', () => {
      const results = queryFeedback({ limit: 2 });

      expect(results.length).toBe(2);
    });

    it('returns empty array when no matches', () => {
      const results = queryFeedback({ action: 'check' });

      expect(results).toEqual([]);
    });
  });

  describe('getNegativeFeedbackPatterns', () => {
    it('returns empty patterns when no negative feedback', () => {
      storeFeedback({ rating: 'positive', action: 'fold', context: {} });

      const patterns = getNegativeFeedbackPatterns();

      expect(patterns.patterns.length).toBe(0);
    });

    it('identifies action patterns in negative feedback', () => {
      // Add multiple negative feedback for fold (over 30% threshold)
      storeFeedback({ rating: 'negative', action: 'fold', context: { street: 'flop' } });
      storeFeedback({ rating: 'negative', action: 'fold', context: { street: 'flop' } });
      storeFeedback({ rating: 'negative', action: 'fold', context: { street: 'flop' } });
      storeFeedback({ rating: 'negative', action: 'fold', context: { street: 'flop' } });
      storeFeedback({ rating: 'negative', action: 'raise', context: { street: 'turn' } });

      const patterns = getNegativeFeedbackPatterns();

      expect(patterns.totalNegatives).toBe(5);

      // Fold is 80% of negatives (4/5), should be flagged
      const foldPattern = patterns.patterns.find(p =>
        p.type === 'action_disliked' && p.action === 'fold'
      );
      expect(foldPattern).toBeDefined();
    });

    it('identifies high equity fold pattern', () => {
      // Add 4+ high equity folds
      storeFeedback({ rating: 'negative', action: 'fold', context: { equity: 50 } });
      storeFeedback({ rating: 'negative', action: 'fold', context: { equity: 45 } });
      storeFeedback({ rating: 'negative', action: 'fold', context: { equity: 55 } });
      storeFeedback({ rating: 'negative', action: 'fold', context: { equity: 60 } });

      const patterns = getNegativeFeedbackPatterns();

      const highEquityPattern = patterns.patterns.find(p =>
        p.type === 'high_equity_fold'
      );
      expect(highEquityPattern).toBeDefined();
    });

    it('generates suggestions based on patterns', () => {
      // Trigger high equity fold pattern
      storeFeedback({ rating: 'negative', action: 'fold', context: { equity: 50 } });
      storeFeedback({ rating: 'negative', action: 'fold', context: { equity: 45 } });
      storeFeedback({ rating: 'negative', action: 'fold', context: { equity: 55 } });
      storeFeedback({ rating: 'negative', action: 'fold', context: { equity: 60 } });

      const patterns = getNegativeFeedbackPatterns();

      expect(patterns.suggestions.length).toBeGreaterThan(0);
      expect(patterns.suggestions.some(s => s.toLowerCase().includes('fold'))).toBe(true);
    });
  });

  describe('logRecommendation', () => {
    it('logs recommendation successfully', () => {
      const result = logRecommendation({
        action: 'raise',
        confidence: 0.85,
        equity: 65,
        potOdds: 25,
        street: 'flop',
        position: 'BTN'
      });

      expect(result.success).toBe(true);
      expect(result.logId).toBeDefined();
    });

    it('logs with minimal data', () => {
      const result = logRecommendation({
        action: 'fold',
        confidence: 0.5
      });

      expect(result.success).toBe(true);
    });

    it('generates unique log IDs', () => {
      const result1 = logRecommendation({ action: 'call', confidence: 0.7 });
      const result2 = logRecommendation({ action: 'call', confidence: 0.7 });

      expect(result1.logId).not.toBe(result2.logId);
    });
  });

  describe('getAnalytics', () => {
    it('returns analytics structure', () => {
      const analytics = getAnalytics();

      expect(analytics).toHaveProperty('dailyStats');
      expect(analytics).toHaveProperty('actionStats');
      expect(analytics).toHaveProperty('trends');
    });

    it('tracks daily stats after feedback', () => {
      storeFeedback({ rating: 'positive', action: 'fold', context: {} });
      storeFeedback({ rating: 'positive', action: 'call', context: {} });

      const analytics = getAnalytics();
      const today = new Date().toISOString().split('T')[0];

      expect(analytics.dailyStats[today]).toBeDefined();
      expect(analytics.dailyStats[today].total).toBe(2);
      expect(analytics.dailyStats[today].positive).toBe(2);
    });

    it('tracks action stats', () => {
      storeFeedback({ rating: 'positive', action: 'fold', context: {} });
      storeFeedback({ rating: 'negative', action: 'fold', context: {} });
      storeFeedback({ rating: 'positive', action: 'raise', context: {} });

      const analytics = getAnalytics();

      expect(analytics.actionStats.fold.total).toBe(2);
      expect(analytics.actionStats.fold.positive).toBe(1);
      expect(analytics.actionStats.fold.negative).toBe(1);
      expect(analytics.actionStats.raise.total).toBe(1);
    });

    it('calculates trend data', () => {
      // Add some feedback
      storeFeedback({ rating: 'positive', action: 'fold', context: {} });
      storeFeedback({ rating: 'positive', action: 'call', context: {} });
      storeFeedback({ rating: 'negative', action: 'raise', context: {} });

      const analytics = getAnalytics();

      expect(analytics.trends).toBeDefined();
      expect(analytics.trends.last7Days).toBeDefined();
      expect(analytics.trends.last7Days.total).toBe(3);
      expect(analytics.trends.last7Days.positive).toBe(2);
    });
  });

  describe('clearAllData', () => {
    it('clears all feedback and logs', () => {
      storeFeedback({ rating: 'positive', action: 'fold', context: {} });
      logRecommendation({ action: 'fold', confidence: 0.8 });

      clearAllData();

      const stats = getFeedbackStats();

      expect(stats.total).toBe(0);
    });
  });
});
