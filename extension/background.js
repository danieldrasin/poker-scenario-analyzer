/**
 * Background Service Worker — PokerNow Play Advisor
 *
 * Handles:
 * - Default settings initialization on install
 * - Hand log storage (chrome.storage.local, capped at 1000 entries)
 * - Message relay between popup and content script
 */

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================

const DEFAULT_SETTINGS = {
  mode: 'off',           // 'off' | 'a1' | 'a2'
  heroStyle: 'tag',      // nit | rock | reg | tag | lag | fish
  apiUrl: 'https://poker-simulator-gamma.vercel.app/api/advise',
  logHands: true,
  gameVariant: 'omaha4'  // omaha4 | omaha5 | omaha6
};

const MAX_LOG_ENTRIES = 1000;

// =============================================================================
// INSTALLATION — Initialize defaults
// =============================================================================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set(DEFAULT_SETTINGS, () => {
      console.log('[PlayAdvisor] Default settings initialized:', DEFAULT_SETTINGS);
    });

    // Initialize empty hand log
    chrome.storage.local.set({ handLog: [] }, () => {
      console.log('[PlayAdvisor] Hand log initialized');
    });
  }
});

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    // ── Log a hand from the content script ──────────────────────────
    case 'LOG_HAND':
      logHand(message.data)
        .then(count => sendResponse({ success: true, totalHands: count }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;  // Keep channel open for async response

    // ── Get hand log stats ──────────────────────────────────────────
    case 'GET_LOG_STATS':
      chrome.storage.local.get('handLog', (result) => {
        const log = result.handLog || [];
        sendResponse({
          totalHands: log.length,
          lastHand: log.length > 0 ? log[log.length - 1] : null,
          oldestHand: log.length > 0 ? log[0] : null
        });
      });
      return true;

    // ── Get recent hand log entries ─────────────────────────────────
    case 'GET_HAND_LOG':
      const count = message.count || 20;
      chrome.storage.local.get('handLog', (result) => {
        const log = result.handLog || [];
        sendResponse({
          hands: log.slice(-count),
          totalHands: log.length
        });
      });
      return true;

    // ── Clear hand log ──────────────────────────────────────────────
    case 'CLEAR_HAND_LOG':
      chrome.storage.local.set({ handLog: [] }, () => {
        sendResponse({ success: true });
      });
      return true;

    // ── Get current settings ────────────────────────────────────────
    case 'GET_SETTINGS':
      chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        sendResponse(settings);
      });
      return true;

    // ── Update settings ─────────────────────────────────────────────
    case 'UPDATE_SETTINGS':
      chrome.storage.sync.set(message.data, () => {
        // Also forward to the active pokernow tab's content script
        forwardToContentScript({
          type: 'UPDATE_CONFIG',
          ...message.data
        });
        sendResponse({ success: true });
      });
      return true;

    default:
      break;
  }
});

// =============================================================================
// HAND LOGGING
// =============================================================================

async function logHand(entry) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get('handLog', (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      let log = result.handLog || [];

      // Add timestamp and tab URL
      const logEntry = {
        timestamp: new Date().toISOString(),
        ...entry
      };

      log.push(logEntry);

      // Cap at MAX_LOG_ENTRIES (remove oldest)
      if (log.length > MAX_LOG_ENTRIES) {
        log = log.slice(log.length - MAX_LOG_ENTRIES);
      }

      chrome.storage.local.set({ handLog: log }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(log.length);
        }
      });
    });
  });
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Forward a message to the content script on any active PokerNow tab.
 */
function forwardToContentScript(message) {
  chrome.tabs.query({ url: 'https://www.pokernow.club/*' }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Tab might not have content script loaded yet — ignore
      });
    }
  });
}
