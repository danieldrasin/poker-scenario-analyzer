/**
 * Advisor Client
 *
 * Connects to the Play Advisor API to get action recommendations
 */

import { config } from './config.js';

export class AdvisorClient {
  constructor() {
    this.baseUrl = config.advisor.baseUrl;
    this.endpoint = config.advisor.endpoint;
    this.timeout = config.advisor.timeout;
  }

  /**
   * Get recommendation from Play Advisor
   * @param {Object} gameState - Parsed game state
   * @returns {Object} Recommendation with action, sizing, confidence
   */
  async getRecommendation(gameState) {
    // Format request for Play Advisor API
    const request = {
      gameVariant: gameState.gameVariant,
      street: gameState.street,
      holeCards: gameState.holeCards,
      board: gameState.board,
      position: gameState.position,
      playersInHand: gameState.playersInHand,
      potSize: gameState.potSize,
      toCall: gameState.toCall,
      stackSize: gameState.stackSize,
      villainActions: gameState.villainActions
    };

    if (config.behavior.verbose) {
      console.log('Requesting advice for:', JSON.stringify(request, null, 2));
    }

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}${this.endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request)
        },
        this.timeout
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // Extract recommendation
      const recommendation = {
        action: data.recommendation?.action || 'fold',
        confidence: data.recommendation?.confidence || 0,
        sizing: data.betSizing || null,
        reasoning: data.reasoning || [],
        warnings: data.warnings || [],
        analysis: data.analysis || {}
      };

      if (config.behavior.verbose) {
        console.log('Received recommendation:', recommendation.action,
          `(confidence: ${(recommendation.confidence * 100).toFixed(0)}%)`);
      }

      return recommendation;

    } catch (error) {
      console.error('Advisor API error:', error.message);

      // Return default fold recommendation on error
      return {
        action: config.behavior.defaultAction,
        confidence: 0,
        sizing: null,
        reasoning: ['API error - defaulting to fold'],
        warnings: [error.message],
        analysis: {},
        error: error.message
      };
    }
  }

  /**
   * Check if recommendation meets minimum confidence threshold
   */
  meetsConfidenceThreshold(recommendation) {
    return recommendation.confidence >= config.advisor.minConfidence;
  }

  /**
   * Get safe action for low-confidence situations
   */
  getSafeAction(gameState) {
    // If we can check, check. Otherwise fold.
    const availableActions = gameState._raw?.availableActions || [];

    if (availableActions.includes('check')) {
      return {
        action: 'check',
        confidence: 0.5,
        sizing: null,
        reasoning: ['Low confidence - checking'],
        warnings: [],
        analysis: {}
      };
    }

    return {
      action: 'fold',
      confidence: 0.5,
      sizing: null,
      reasoning: ['Low confidence - folding'],
      warnings: [],
      analysis: {}
    };
  }

  /**
   * Fetch with timeout support
   */
  async fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Log recommendation for feedback analysis
   */
  async logRecommendation(gameState, recommendation, result) {
    if (!config.behavior.logActions) return;

    const logEntry = {
      timestamp: Date.now(),
      gameState: {
        street: gameState.street,
        position: gameState.position,
        potSize: gameState.potSize,
        toCall: gameState.toCall
      },
      recommendation: {
        action: recommendation.action,
        confidence: recommendation.confidence
      },
      result: result
    };

    // Send to feedback API (non-blocking)
    try {
      fetch(`${this.baseUrl}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: result.success ? 'positive' : 'negative',
          action: recommendation.action,
          context: logEntry.gameState
        })
      }).catch(() => {}); // Ignore errors
    } catch (e) {
      // Ignore logging errors
    }
  }

  /**
   * Health check for the API
   */
  async healthCheck() {
    try {
      // Send a minimal request to test connectivity
      const testRequest = {
        gameVariant: 'omaha4',
        street: 'flop',
        holeCards: ['As', 'Ks', 'Qs', 'Js'],
        board: ['Ts', '9s', '2h'],
        position: 'BTN',
        playersInHand: 2,
        potSize: 100,
        toCall: 0,
        stackSize: 1000
      };

      const response = await this.fetchWithTimeout(
        `${this.baseUrl}${this.endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testRequest)
        },
        5000
      );

      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error.message);
      return false;
    }
  }
}

export default AdvisorClient;
