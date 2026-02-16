/**
 * PokerNow Bot Configuration
 *
 * Configure browser settings, timing, and behavior
 */

export const config = {
  // Browser settings
  browser: {
    // Path to Chrome executable (adjust for your system)
    // macOS: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    // Windows: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    // Linux: '/usr/bin/google-chrome'
    executablePath: process.env.CHROME_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',

    headless: false, // Set to true for background operation
    defaultViewport: { width: 1280, height: 800 },

    // Browser args for stability
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  },

  // PokerNow URLs
  urls: {
    base: 'https://www.pokernow.club',
    newGame: 'https://www.pokernow.club/start-game'
  },

  // Timing settings (milliseconds)
  timing: {
    turnCheckInterval: 500,     // How often to check if it's our turn
    actionDelay: {
      min: 800,                 // Minimum delay before action
      max: 2500                 // Maximum delay before action
    },
    betInputDelay: 300,         // Delay after entering bet amount
    reconnectDelay: 5000,       // Delay before reconnecting
    pageLoadTimeout: 30000      // Max time to wait for page load
  },

  // Play Advisor API
  advisor: {
    baseUrl: process.env.ADVISOR_URL || 'http://localhost:3000',
    endpoint: '/api/advise',
    timeout: 5000,
    // Skip advisor and fold if confidence below this
    minConfidence: 0.4
  },

  // Bot behavior
  behavior: {
    // Default action if advisor fails or returns low confidence
    defaultAction: 'fold',

    // Maximum hands before taking a break
    maxHandsPerSession: 200,

    // Auto-rebuy settings
    autoRebuy: true,
    rebuyThreshold: 0.2,        // Rebuy when stack < 20% of max

    // Logging
    verbose: true,
    logActions: true,
    logGameState: false         // Can be noisy
  },

  // Opponent tracking
  tracking: {
    enabled: true,
    dbPath: './bot/db/opponents.sqlite'
  },

  // Card notation mapping (PokerNow → our format)
  cardMap: {
    ranks: {
      'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', 'T': 'T',
      '10': 'T', '9': '9', '8': '8', '7': '7', '6': '6',
      '5': '5', '4': '4', '3': '3', '2': '2'
    },
    suits: {
      's': 's', 'spades': 's', '♠': 's',
      'h': 'h', 'hearts': 'h', '♥': 'h',
      'd': 'd', 'diamonds': 'd', '♦': 'd',
      'c': 'c', 'clubs': 'c', '♣': 'c'
    }
  }
};

export default config;
