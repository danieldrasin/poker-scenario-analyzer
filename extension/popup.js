/**
 * Popup Script — PokerNow Play Advisor
 *
 * Controls: mode toggle, style selector, API config, hand log viewer.
 * Settings persist via chrome.storage.sync and are forwarded to content script.
 */

// =============================================================================
// DOM REFERENCES
// =============================================================================

const modeButtons = document.querySelectorAll('.mode-btn');
const styleSelect = document.getElementById('style-select');
const variantSelect = document.getElementById('variant-select');
const apiUrlInput = document.getElementById('api-url');
const logHandsCheckbox = document.getElementById('log-hands');
const btnProd = document.getElementById('btn-prod');
const btnLocal = document.getElementById('btn-local');
const btnHealth = document.getElementById('btn-health');
const healthDot = document.getElementById('health-dot');
const btnLogs = document.getElementById('btn-logs');
const logCountBadge = document.getElementById('log-count');
const btnClearLogs = document.getElementById('btn-clear-logs');
const statusBar = document.getElementById('status-bar');

const PROD_URL = 'https://poker-simulator-gamma.vercel.app/api/advise';
const LOCAL_URL = 'http://localhost:3001/api/advise';

// =============================================================================
// LOAD SETTINGS
// =============================================================================

function loadSettings() {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
    if (!settings) return;

    // Mode buttons
    modeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === settings.mode);
    });

    // Selects
    styleSelect.value = settings.heroStyle || 'tag';
    variantSelect.value = settings.gameVariant || 'omaha4';

    // API URL
    apiUrlInput.value = settings.apiUrl || PROD_URL;

    // Checkbox
    logHandsCheckbox.checked = settings.logHands !== false;
  });

  // Load hand log count
  chrome.runtime.sendMessage({ type: 'GET_LOG_STATS' }, (stats) => {
    if (stats) {
      logCountBadge.textContent = stats.totalHands || 0;
    }
  });
}

// =============================================================================
// SAVE & BROADCAST SETTINGS
// =============================================================================

function saveSettings(partial) {
  chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    data: partial
  }, () => {
    setStatus('Settings saved');
  });
}

function setStatus(text, duration = 2000) {
  statusBar.textContent = text;
  if (duration > 0) {
    setTimeout(() => { statusBar.textContent = 'Ready'; }, duration);
  }
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================

// ── Mode toggle ─────────────────────────────────────────────────────────────

modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    saveSettings({ mode: btn.dataset.mode });

    const labels = { off: 'Off', a1: 'A1 Auto-pilot', a2: 'A2 Advisory' };
    setStatus(`Mode: ${labels[btn.dataset.mode]}`);
  });
});

// ── Style selector ──────────────────────────────────────────────────────────

styleSelect.addEventListener('change', () => {
  saveSettings({ heroStyle: styleSelect.value });
});

// ── Variant selector ────────────────────────────────────────────────────────

variantSelect.addEventListener('change', () => {
  saveSettings({ gameVariant: variantSelect.value });
});

// ── API URL ─────────────────────────────────────────────────────────────────

let apiUrlTimeout;
apiUrlInput.addEventListener('input', () => {
  clearTimeout(apiUrlTimeout);
  apiUrlTimeout = setTimeout(() => {
    saveSettings({ apiUrl: apiUrlInput.value.trim() });
  }, 600);
});

btnProd.addEventListener('click', () => {
  apiUrlInput.value = PROD_URL;
  saveSettings({ apiUrl: PROD_URL });
  setStatus('API: Production');
});

btnLocal.addEventListener('click', () => {
  apiUrlInput.value = LOCAL_URL;
  saveSettings({ apiUrl: LOCAL_URL });
  setStatus('API: Localhost');
});

// ── Log hands checkbox ──────────────────────────────────────────────────────

logHandsCheckbox.addEventListener('change', () => {
  saveSettings({ logHands: logHandsCheckbox.checked });
});

// ── API Health Check ────────────────────────────────────────────────────────

btnHealth.addEventListener('click', async () => {
  healthDot.className = 'dot checking';
  setStatus('Checking API...', 0);

  try {
    // Derive health URL from advise URL
    const adviseUrl = apiUrlInput.value.trim();
    const healthUrl = adviseUrl.replace(/\/advise$/, '/health');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      healthDot.className = 'dot online';
      setStatus(`API online — ${data.message || 'healthy'}`);
    } else {
      healthDot.className = 'dot offline';
      setStatus(`API error: ${response.status}`);
    }
  } catch (err) {
    healthDot.className = 'dot offline';
    if (err.name === 'AbortError') {
      setStatus('API timeout (5s)');
    } else {
      setStatus(`API unreachable: ${err.message}`);
    }
  }
});

// ── View Logs ───────────────────────────────────────────────────────────────

btnLogs.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'GET_HAND_LOG', count: 50 }, (result) => {
    if (!result || !result.hands || result.hands.length === 0) {
      setStatus('No hands logged yet');
      return;
    }

    // Open a new tab with log data
    const logHtml = generateLogHtml(result.hands, result.totalHands);
    const blob = new Blob([logHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    chrome.tabs.create({ url });
  });
});

// ── Clear Logs ──────────────────────────────────────────────────────────────

btnClearLogs.addEventListener('click', () => {
  if (confirm('Clear all hand logs?')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_HAND_LOG' }, () => {
      logCountBadge.textContent = '0';
      setStatus('Logs cleared');
    });
  }
});

// =============================================================================
// LOG VIEWER
// =============================================================================

function generateLogHtml(hands, totalHands) {
  const rows = hands.map((h, i) => {
    const gs = h.gameState || {};
    const rec = h.recommendation || {};
    const time = h.timestamp ? new Date(h.timestamp).toLocaleString() : '—';
    return `
      <tr>
        <td>${totalHands - hands.length + i + 1}</td>
        <td>${time}</td>
        <td>${gs.street || '—'}</td>
        <td>${(gs.holeCards || []).join(' ')}</td>
        <td>${(gs.board || []).join(' ')}</td>
        <td>${gs.position || '—'}</td>
        <td>${gs.potSize || '—'}</td>
        <td><strong>${rec.action || '—'}</strong></td>
        <td>${rec.amount || '—'}</td>
        <td>${rec.confidence ? Math.round(rec.confidence) + '%' : '—'}</td>
        <td>${rec.reasoning?.primary || '—'}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <title>Play Advisor Hand Log</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; background: #1a1a2e; color: #e0e0e0; }
    h1 { color: #00d4aa; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border: 1px solid #333; padding: 6px 10px; text-align: left; }
    th { background: #16213e; color: #00d4aa; position: sticky; top: 0; }
    tr:nth-child(even) { background: #16213e; }
    tr:hover { background: #1a3a5c; }
    td strong { color: #ff6b6b; }
  </style>
</head>
<body>
  <h1>Play Advisor — Hand Log (${totalHands} total)</h1>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Time</th><th>Street</th><th>Hole Cards</th><th>Board</th>
        <th>Position</th><th>Pot</th><th>Action</th><th>Amount</th><th>Confidence</th><th>Reasoning</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

// =============================================================================
// INIT
// =============================================================================

document.addEventListener('DOMContentLoaded', loadSettings);
