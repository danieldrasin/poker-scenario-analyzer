/**
 * Play Advisor UI E2E Tests
 * Comprehensive suite covering:
 * - DOM integrity (no duplicate IDs, correct element targeting)
 * - Tab navigation and component isolation
 * - Complete user workflows (input → action → output)
 * - Card selection and situation inputs
 * - Style differentiation in UI
 * - Responsive layout
 * - Error states
 */

import { test, expect } from '@playwright/test';

const getBaseUrl = () => process.env.TEST_URL || 'http://localhost:3000';

// =============================================================================
// DOM INTEGRITY TESTS
// =============================================================================

test.describe('DOM Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
  });

  test('no duplicate element IDs in document', async ({ page }) => {
    const duplicates = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const id of ids) {
        if (seen.has(id)) dupes.push(id);
        seen.add(id);
      }
      return dupes;
    });
    expect(duplicates).toEqual([]);
  });

  test('scenario builder analyze button has unique ID', async ({ page }) => {
    const count = await page.locator('#analyze-btn').count();
    expect(count).toBe(1);
  });

  test('play advisor analyze button has unique ID', async ({ page }) => {
    const count = await page.locator('#advisor-analyze-btn').count();
    expect(count).toBe(1);
  });

  test('scenario builder analyze button is inside scenario tab', async ({ page }) => {
    const btn = page.locator('#scenario-tab #analyze-btn');
    await expect(btn).toHaveCount(1);
  });

  test('play advisor analyze button is inside advisor tab', async ({ page }) => {
    const btn = page.locator('#advisor-tab #advisor-analyze-btn');
    await expect(btn).toHaveCount(1);
  });
});

// =============================================================================
// TAB NAVIGATION & ISOLATION TESTS
// =============================================================================

test.describe('Tab Navigation & Isolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
  });

  test('all four tabs load without errors', async ({ page }) => {
    const tabs = ['scenario', 'advisor', 'matrix', 'saved'];
    for (const tab of tabs) {
      await page.click(`[data-tab="${tab}"]`);
      const content = page.locator(`#${tab}-tab`);
      await expect(content).toHaveClass(/active/);
      await expect(content).toBeVisible();
    }
  });

  test('scenario builder analyze button is NOT disabled after visiting advisor tab', async ({ page }) => {
    // Visit advisor tab (where PlayAdvisor.init runs)
    await page.click('[data-tab="advisor"]');
    await page.waitForTimeout(500);

    // Switch back to scenario builder
    await page.click('[data-tab="scenario"]');

    // Scenario Builder's analyze button should be enabled (not disabled by PlayAdvisor)
    const scenarioBtn = page.locator('#scenario-tab #analyze-btn');
    await expect(scenarioBtn).toBeEnabled();
  });

  test('scenario builder button text preserved after advisor tab visit', async ({ page }) => {
    // Visit advisor tab
    await page.click('[data-tab="advisor"]');
    await page.waitForTimeout(300);

    // Switch back
    await page.click('[data-tab="scenario"]');

    // Button should still have its original structure with icon
    const btnText = page.locator('#analyze-btn .btn-text');
    await expect(btnText).toContainText('Analyze Scenario');
  });

  test('play advisor state preserved across tab switches', async ({ page }) => {
    // Set up cards in advisor (switch to study mode for card selector grid)
    await page.click('[data-tab="advisor"]');
    await page.click('[data-mode="study"]');
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');

    // Switch away and back
    await page.click('[data-tab="scenario"]');
    await page.click('[data-tab="advisor"]');

    // Cards should still be selected (study mode should still be active)
    await expect(page.locator('.card-btn[data-card="As"]')).toHaveClass(/selected/);
    await expect(page.locator('.card-btn[data-card="Ks"]')).toHaveClass(/selected/);
  });

  test('hand journal tab shows coming soon', async ({ page }) => {
    await page.click('[data-tab="saved"]');
    // Wait for the tab content to become active/visible
    await expect(page.locator('#saved-tab')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('.saved-coming-soon')).toBeVisible();
    await expect(page.locator('.coming-soon-subtitle')).toContainText('Coming Soon');
  });
});

// =============================================================================
// SCENARIO BUILDER COMPLETE WORKFLOW TESTS
// =============================================================================

test.describe('Scenario Builder - Complete Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
    // Ensure scenario tab is active and JS is initialized
    await page.click('[data-tab="scenario"]');
    await expect(page.locator('#scenario-tab')).toHaveClass(/active/);
    // Wait for strategy insight to be populated (indicates JS init complete)
    await expect(page.locator('#insight-context')).not.toBeEmpty();
  });

  test('preset → analyze → results appear', async ({ page }) => {
    // Ensure we're on the scenario tab
    await page.click('[data-tab="scenario"]');

    // Click a preset
    await page.click('.preset-chip[data-query="pair:AA:ds"]');

    // Click analyze — scope to scenario tab to avoid ambiguity
    const analyzeBtn = page.locator('#scenario-tab #analyze-btn');
    await expect(analyzeBtn).toBeEnabled();
    await analyzeBtn.click();

    // Button should show loading state
    await expect(analyzeBtn).toBeDisabled();

    // Results section should appear (needs network for TieredDataService — R2 or live sim)
    // Use longer timeout since this fetches real data
    await page.waitForSelector('#results-section', { state: 'visible', timeout: 30000 });

    // Win rate should be populated
    const winRate = page.locator('#stat-winrate');
    await expect(winRate).not.toHaveText('--');
  });

  test('changing opponents updates strategy insight', async ({ page }) => {
    // Get initial insight text
    const insightContext = page.locator('#insight-context');
    const initialText = await insightContext.textContent();

    // Change opponent count to 3 (which means 4-handed table: 3 opponents + hero)
    await page.click('.opp-btn[data-count="3"]');

    // Insight should update to reflect new table size
    await page.waitForTimeout(300);
    const updatedText = await insightContext.textContent();
    // Format is "STYLE @ POSITION (N-handed table)" where N = opponents + 1
    expect(updatedText).toContain('4-handed');
    expect(updatedText).not.toBe(initialText);
  });

  test('strategy insight updates when style changes', async ({ page }) => {
    const insightContext = page.locator('#insight-context');
    const initialText = await insightContext.textContent();
    expect(initialText).toContain('TAG'); // Default style is TAG

    // Change style to LAG
    await page.selectOption('#style-select', 'lag');
    // Trigger change event explicitly for reliability
    await page.locator('#style-select').dispatchEvent('change');
    await page.waitForTimeout(500);

    // Recommendation context should reference new style
    await expect(insightContext).toContainText('LAG');
  });
});

// =============================================================================
// PLAY ADVISOR COMPLETE WORKFLOW TESTS
// =============================================================================

test.describe('Play Advisor - Complete Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');
    // Switch to Study mode where the full card selector grid lives
    await page.click('[data-mode="study"]');
    await expect(page.locator('#study-mode')).toHaveClass(/active/);
  });

  test('full happy path: select cards → auto-analyze → see recommendation', async ({ page }) => {
    // Select 4 hole cards
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qh"]');
    await page.click('.card-btn[data-card="Jh"]');

    // Select 3 board cards
    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="2s"]');

    // Auto-analyze should fire — wait for recommendation card
    await page.waitForSelector('.recommendation-card', { timeout: 5000 });

    // Verify all result sections appear
    await expect(page.locator('.hand-strength-card')).toBeVisible();
    await expect(page.locator('.equity-card')).toBeVisible();
    await expect(page.locator('.recommendation-card')).toBeVisible();
    await expect(page.locator('.reasoning-card')).toBeVisible();

    // Action badge should contain a valid action
    const actionText = await page.locator('.action-badge').textContent();
    expect(['FOLD', 'CALL', 'CHECK', 'BET', 'RAISE']).toContain(actionText?.trim().toUpperCase());
  });

  test('manual analyze button works when clicked', async ({ page }) => {
    // Select complete hand
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qh"]');
    await page.click('.card-btn[data-card="Jh"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="2s"]');

    // Wait for auto-analyze to complete first
    await page.waitForSelector('.recommendation-card', { timeout: 5000 });

    // Now click the manual button — it should re-analyze
    const advisorBtn = page.locator('#advisor-analyze-btn');
    await expect(advisorBtn).toBeEnabled();
    await advisorBtn.click();

    // Results should still be visible after manual trigger
    await page.waitForTimeout(1000);
    await expect(page.locator('.recommendation-card')).toBeVisible();
  });

  test('changing style updates recommendation with different reasoning', async ({ page }) => {
    // Set up complete hand
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qh"]');
    await page.click('.card-btn[data-card="Jh"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="2s"]');

    // Wait for analysis with default style (reg)
    await page.waitForSelector('.reasoning-card', { timeout: 5000 });
    const regReasoning = await page.locator('.reasoning-strategic').textContent();

    // Switch to LAG
    await page.selectOption('#advisor-style-select', 'lag');
    await page.waitForTimeout(1500);
    const lagReasoning = await page.locator('.reasoning-strategic').textContent();

    // Switch to Nit
    await page.selectOption('#advisor-style-select', 'nit');
    await page.waitForTimeout(1500);
    const nitReasoning = await page.locator('.reasoning-strategic').textContent();

    // At least one pair should have different reasoning
    const allSame = regReasoning === lagReasoning && lagReasoning === nitReasoning;
    expect(allSame).toBeFalsy();
  });

  test('changing pot/call updates sizing recommendation', async ({ page }) => {
    // Set up complete hand
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qh"]');
    await page.click('.card-btn[data-card="Jh"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="2s"]');

    // Wait for initial analysis
    await page.waitForSelector('.sizing-card', { timeout: 5000 });
    const initialSizing = await page.locator('.sizing-card').textContent();

    // Change pot size to something much larger
    await page.fill('#advisor-pot-size', '500');
    await page.waitForTimeout(1500);

    const updatedSizing = await page.locator('.sizing-card').textContent();
    expect(updatedSizing).not.toBe(initialSizing);
  });

  test('clearing cards clears results', async ({ page }) => {
    // Set up and get results
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qh"]');
    await page.click('.card-btn[data-card="Jh"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="2s"]');

    await page.waitForSelector('.recommendation-card', { timeout: 5000 });

    // Clear hole cards
    await page.click('#clear-hole-cards');

    // Results should clear — placeholder should return
    await page.waitForSelector('.advisor-placeholder', { timeout: 3000 });
    await expect(page.locator('.recommendation-card')).toHaveCount(0);
  });

  test('omaha5 workflow: 5 hole cards + 3 board cards → analysis', async ({ page }) => {
    // Switch to omaha5
    await page.selectOption('#advisor-game-select', 'omaha5');

    // Select 5 hole cards
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qs"]');
    await page.click('.card-btn[data-card="Jh"]');
    await page.click('.card-btn[data-card="Th"]');

    // Select 3 board cards
    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="8s"]');
    await page.click('.card-btn[data-card="2d"]');

    // Should auto-analyze and show results
    await page.waitForSelector('.recommendation-card', { timeout: 5000 });
    await expect(page.locator('.action-badge')).toBeVisible();
  });

  test('4 hole cards + 0 board cards → no analysis, button disabled', async ({ page }) => {
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qh"]');
    await page.click('.card-btn[data-card="Jh"]');

    // Button should be disabled
    const advisorBtn = page.locator('#advisor-analyze-btn');
    await expect(advisorBtn).toBeDisabled();

    // No recommendation should appear
    await page.waitForTimeout(1000);
    await expect(page.locator('.recommendation-card')).toHaveCount(0);
  });
});

// =============================================================================
// CARD SELECTOR TESTS
// =============================================================================

test.describe('Card Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');
    await page.click('[data-mode="study"]');
    await expect(page.locator('#study-mode')).toHaveClass(/active/);
  });

  test('card selector grid renders 52 cards', async ({ page }) => {
    const grid = page.locator('#card-selector-grid');
    await expect(grid).toBeVisible();
    const cardBtns = grid.locator('.card-btn');
    await expect(cardBtns).toHaveCount(52);
  });

  test('can select and deselect hole cards', async ({ page }) => {
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await expect(page.locator('.card-btn[data-card="As"]')).toHaveClass(/selected/);
    await expect(page.locator('#selected-hole-cards')).toContainText('A');

    // Click again to deselect
    await page.click('.card-btn[data-card="As"]');
    await expect(page.locator('.card-btn[data-card="As"]')).not.toHaveClass(/selected/);
  });

  test('can select board cards and street updates', async ({ page }) => {
    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="2h"]');

    await expect(page.locator('#street-indicator')).toContainText('FLOP');

    // Add turn card
    await page.click('.card-btn[data-card="5d"]');
    await expect(page.locator('#street-indicator')).toContainText('TURN');
  });

  test('cannot select same card for hole and board', async ({ page }) => {
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="As"]');

    await expect(page.locator('.card-btn[data-card="As"]')).toHaveClass(/hole/);
    await expect(page.locator('.card-btn[data-card="As"]')).not.toHaveClass(/board/);
  });

  test('max hole cards enforced for omaha4', async ({ page }) => {
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qs"]');
    await page.click('.card-btn[data-card="Js"]');
    await page.click('.card-btn[data-card="Ts"]'); // 5th — should be rejected
    await expect(page.locator('.card-btn[data-card="Ts"]')).not.toHaveClass(/selected/);
  });

  test('clear buttons work', async ({ page }) => {
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('#clear-hole-cards');
    await expect(page.locator('.card-btn[data-card="As"]')).not.toHaveClass(/selected/);

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('#clear-board-cards');
    await expect(page.locator('.card-btn[data-card="Ts"]')).not.toHaveClass(/selected/);
  });
});

// =============================================================================
// SITUATION & BETTING INPUT TESTS
// =============================================================================

test.describe('Situation & Betting Inputs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');
    await page.click('[data-mode="study"]');
    await expect(page.locator('#study-mode')).toHaveClass(/active/);
  });

  test('all dropdowns have correct defaults', async ({ page }) => {
    await expect(page.locator('#advisor-game-select')).toHaveValue('omaha4');
    await expect(page.locator('#advisor-style-select')).toHaveValue('reg');
    await expect(page.locator('#advisor-position-select')).toHaveValue('BTN');
    await expect(page.locator('#advisor-players-select')).toHaveValue('3');
  });

  test('betting inputs have correct defaults', async ({ page }) => {
    await expect(page.locator('#advisor-pot-size')).toHaveValue('100');
    await expect(page.locator('#advisor-to-call')).toHaveValue('0');
    await expect(page.locator('#advisor-stack-size')).toHaveValue('1000');
  });

  test('villain actions can be added and cleared', async ({ page }) => {
    await page.click('.villain-action-btn[data-action="raise"]');
    await page.click('.villain-action-btn[data-action="call"]');
    await expect(page.locator('#villain-actions-display')).toContainText('raise');
    await expect(page.locator('#villain-actions-display')).toContainText('call');

    await page.click('#clear-villain-actions');
    await expect(page.locator('#villain-actions-display')).toContainText('No actions');
  });
});

// =============================================================================
// ANALYZE BUTTON STATE TESTS
// =============================================================================

test.describe('Advisor Analyze Button State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');
    await page.click('[data-mode="study"]');
    await expect(page.locator('#study-mode')).toHaveClass(/active/);
  });

  test('disabled with no cards selected', async ({ page }) => {
    await expect(page.locator('#advisor-analyze-btn')).toBeDisabled();
  });

  test('disabled with only hole cards', async ({ page }) => {
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qs"]');
    await page.click('.card-btn[data-card="Jh"]');
    await expect(page.locator('#advisor-analyze-btn')).toBeDisabled();
  });

  test('enabled with complete hand (4 hole + 3 board)', async ({ page }) => {
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qs"]');
    await page.click('.card-btn[data-card="Jh"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="2h"]');

    await expect(page.locator('#advisor-analyze-btn')).toBeEnabled();
  });

  test('becomes disabled again after clearing cards', async ({ page }) => {
    // Set up complete hand
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qs"]');
    await page.click('.card-btn[data-card="Jh"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="2h"]');

    await expect(page.locator('#advisor-analyze-btn')).toBeEnabled();

    // Clear hole cards
    await page.click('#clear-hole-cards');
    await expect(page.locator('#advisor-analyze-btn')).toBeDisabled();
  });
});

// =============================================================================
// ANALYSIS RESULTS DETAIL TESTS
// =============================================================================

test.describe('Analysis Results Details', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');
    await page.click('[data-mode="study"]');
    await expect(page.locator('#study-mode')).toHaveClass(/active/);

    // Set up nut flush scenario
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qh"]');
    await page.click('.card-btn[data-card="Jh"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="2s"]');
  });

  test('hand strength shows flush', async ({ page }) => {
    await page.waitForSelector('.hand-strength-card', { timeout: 5000 });
    await expect(page.locator('.hand-strength-card')).toContainText('Flush');
  });

  test('equity shows percentage', async ({ page }) => {
    await page.waitForSelector('.equity-card', { timeout: 5000 });
    await expect(page.locator('.equity-card')).toContainText('%');
  });

  test('recommendation shows valid action', async ({ page }) => {
    await page.waitForSelector('.recommendation-card', { timeout: 5000 });
    const actionText = await page.locator('.action-badge').textContent();
    expect(['FOLD', 'CALL', 'CHECK', 'BET', 'RAISE']).toContain(actionText?.trim().toUpperCase());
  });

  test('reasoning section is populated', async ({ page }) => {
    await page.waitForSelector('.reasoning-card', { timeout: 5000 });
    await expect(page.locator('.reasoning-primary')).not.toBeEmpty();
  });

  test('latency info is shown', async ({ page }) => {
    await page.waitForSelector('.latency-info', { timeout: 5000 });
    await expect(page.locator('.latency-info')).toContainText('ms');
  });

  test('nut flush shows nuts badge', async ({ page }) => {
    await page.waitForSelector('.hand-strength-card', { timeout: 5000 });
    await expect(page.locator('.nuts-badge')).toBeVisible();
  });
});

// =============================================================================
// STYLE DIFFERENTIATION UI TESTS
// =============================================================================

test.describe('Style Differentiation in UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');
    await page.click('[data-mode="study"]');
    await expect(page.locator('#study-mode')).toHaveClass(/active/);
  });

  test('style selector visible with all 6 options', async ({ page }) => {
    const styleSelect = page.locator('#advisor-style-select');
    await expect(styleSelect).toBeVisible();

    const options = await styleSelect.locator('option').allTextContents();
    expect(options.length).toBe(6);
  });

  test('defaults to reg', async ({ page }) => {
    await expect(page.locator('#advisor-style-select')).toHaveValue('reg');
  });

  test('all 6 styles produce results for same hand', async ({ page }) => {
    const styles = ['nit', 'rock', 'reg', 'tag', 'lag', 'fish'];

    for (const style of styles) {
      // Clear and re-setup for clean state
      await page.click('#clear-hole-cards');
      await page.click('#clear-board-cards');

      await page.selectOption('#advisor-style-select', style);

      await page.check('input[name="card-mode"][value="hole"]');
      await page.click('.card-btn[data-card="As"]');
      await page.click('.card-btn[data-card="Ks"]');
      await page.click('.card-btn[data-card="Qh"]');
      await page.click('.card-btn[data-card="Jh"]');

      await page.check('input[name="card-mode"][value="board"]');
      await page.click('.card-btn[data-card="Ts"]');
      await page.click('.card-btn[data-card="9s"]');
      await page.click('.card-btn[data-card="2s"]');

      await page.waitForSelector('.recommendation-card', { timeout: 5000 });
      const action = await page.locator('.action-badge').textContent();
      expect(action?.trim().length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// RESPONSIVE LAYOUT TESTS
// =============================================================================

test.describe('Responsive Layout', () => {
  test('mobile viewport: live mode inputs visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');

    // Live mode is default — check live mode elements
    await expect(page.locator('#live-card-picker')).toBeVisible();
    await expect(page.locator('#live-pot')).toBeVisible();
    await expect(page.locator('#live-position-select')).toBeVisible();
    await expect(page.locator('#live-style-select')).toBeVisible();
    await expect(page.locator('.live-new-hand-btn')).toBeVisible();
  });

  test('mobile viewport: study mode inputs visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');
    await page.click('[data-mode="study"]');

    await expect(page.locator('#card-selector-grid')).toBeVisible();
    await expect(page.locator('#advisor-pot-size')).toBeVisible();
    await expect(page.locator('#advisor-style-select')).toBeVisible();
    await expect(page.locator('#advisor-analyze-btn')).toBeVisible();
  });

  test('tablet viewport: study mode layout visible', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');
    await page.click('[data-mode="study"]');

    await expect(page.locator('.advisor-layout')).toBeVisible();
    await expect(page.locator('.advisor-input-panel')).toBeVisible();
    await expect(page.locator('.advisor-results-panel')).toBeVisible();
  });

  test('desktop viewport: mode toggle visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');

    await expect(page.locator('.advisor-mode-toggle')).toBeVisible();
    await expect(page.locator('[data-mode="live"]')).toBeVisible();
    await expect(page.locator('[data-mode="study"]')).toBeVisible();
  });
});

// =============================================================================
// ERROR STATE TESTS
// =============================================================================

test.describe('Error States', () => {
  test('placeholder shown when no cards selected', async ({ page }) => {
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');

    // Live mode shows placeholder in live-result
    await expect(page.locator('.live-result-placeholder')).toBeVisible();
    await expect(page.locator('.live-result-placeholder')).toContainText('Enter your cards');
  });
});

// =============================================================================
// REAL USER WORKFLOW TESTS
// Tests that verify what a user actually SEES, not just DOM state.
// These catch visual/layout bugs that element-existence tests miss.
// =============================================================================

test.describe('Visual Isolation — only one tab content visible at a time', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
  });

  test('on load, only scenario tab content is visible', async ({ page }) => {
    // Scenario tab should be visible
    await expect(page.locator('#scenario-tab')).toBeVisible();
    // All other tab contents should be hidden (display:none → not visible)
    await expect(page.locator('#advisor-tab')).not.toBeVisible();
    await expect(page.locator('#matrix-tab')).not.toBeVisible();
    await expect(page.locator('#saved-tab')).not.toBeVisible();
  });

  test('clicking Play Advisor hides Scenario Builder content', async ({ page }) => {
    await page.click('[data-tab="advisor"]');
    await expect(page.locator('#advisor-tab')).toBeVisible();
    await expect(page.locator('#scenario-tab')).not.toBeVisible();
    await expect(page.locator('#matrix-tab')).not.toBeVisible();
    await expect(page.locator('#saved-tab')).not.toBeVisible();
  });

  test('clicking Matrix hides all other tab contents', async ({ page }) => {
    await page.click('[data-tab="matrix"]');
    await expect(page.locator('#matrix-tab')).toBeVisible();
    await expect(page.locator('#scenario-tab')).not.toBeVisible();
    await expect(page.locator('#advisor-tab')).not.toBeVisible();
    await expect(page.locator('#saved-tab')).not.toBeVisible();
  });

  test('clicking Hand Journal hides all other tab contents', async ({ page }) => {
    await page.click('[data-tab="saved"]');
    await expect(page.locator('#saved-tab')).toBeVisible();
    await expect(page.locator('#scenario-tab')).not.toBeVisible();
    await expect(page.locator('#advisor-tab')).not.toBeVisible();
    await expect(page.locator('#matrix-tab')).not.toBeVisible();
  });

  test('cycling through all tabs shows exactly one content at a time', async ({ page }) => {
    const tabs = ['scenario', 'advisor', 'matrix', 'saved'];
    for (const activeTab of tabs) {
      await page.click(`[data-tab="${activeTab}"]`);
      for (const tab of tabs) {
        if (tab === activeTab) {
          await expect(page.locator(`#${tab}-tab`)).toBeVisible();
        } else {
          await expect(page.locator(`#${tab}-tab`)).not.toBeVisible();
        }
      }
    }
  });
});

test.describe('Dual-Mode Toggle — Live Table vs Study', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');
  });

  test('mode toggle is visible with both options', async ({ page }) => {
    await expect(page.locator('.advisor-mode-toggle')).toBeVisible();
    await expect(page.locator('[data-mode="live"]')).toBeVisible();
    await expect(page.locator('[data-mode="study"]')).toBeVisible();
  });

  test('live mode is active by default', async ({ page }) => {
    await expect(page.locator('[data-mode="live"]')).toHaveClass(/active/);
    await expect(page.locator('[data-mode="study"]')).not.toHaveClass(/active/);
    await expect(page.locator('#live-mode')).toBeVisible();
    await expect(page.locator('#study-mode')).not.toBeVisible();
  });

  test('clicking Study shows study mode and hides live mode', async ({ page }) => {
    await page.click('[data-mode="study"]');
    await expect(page.locator('#study-mode')).toBeVisible();
    await expect(page.locator('#live-mode')).not.toBeVisible();
    await expect(page.locator('[data-mode="study"]')).toHaveClass(/active/);
    await expect(page.locator('[data-mode="live"]')).not.toHaveClass(/active/);
  });

  test('clicking back to Live restores live mode', async ({ page }) => {
    await page.click('[data-mode="study"]');
    await page.click('[data-mode="live"]');
    await expect(page.locator('#live-mode')).toBeVisible();
    await expect(page.locator('#study-mode')).not.toBeVisible();
  });

  test('live mode shows speed-optimized elements', async ({ page }) => {
    await expect(page.locator('.live-card-picker')).toBeVisible();
    await expect(page.locator('.live-betting-bar')).toBeVisible();
    await expect(page.locator('.live-result')).toBeVisible();
    await expect(page.locator('.live-new-hand-btn')).toBeVisible();
  });

  test('study mode shows detailed analysis elements', async ({ page }) => {
    await page.click('[data-mode="study"]');
    await expect(page.locator('#card-selector-grid')).toBeVisible();
    await expect(page.locator('#advisor-analyze-btn')).toBeVisible();
    await expect(page.locator('.advisor-layout')).toBeVisible();
  });
});

test.describe('Live Mode — user workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getBaseUrl());
    await page.click('[data-tab="advisor"]');
    // Live mode is default
  });

  test('card picker shows 52 cards in 4 suits', async ({ page }) => {
    const cards = page.locator('.live-pick-btn');
    await expect(cards).toHaveCount(52);
  });

  test('clicking a card fills the next hole slot', async ({ page }) => {
    // Click Ace of spades
    await page.click('.live-pick-btn[data-card="As"]');
    // Should appear in hole cards area
    const firstSlot = page.locator('#live-hole-cards .live-card-slot').first();
    await expect(firstSlot).toHaveClass(/filled/);
    await expect(firstSlot).not.toHaveText('?');
    // The card should now be marked as used in the picker
    await expect(page.locator('.live-pick-btn[data-card="As"]')).toHaveClass(/used/);
  });

  test('new hand button clears everything', async ({ page }) => {
    // Pick some cards
    await page.click('.live-pick-btn[data-card="As"]');
    await page.click('.live-pick-btn[data-card="Ks"]');
    // Click new hand
    await page.click('#live-new-hand');
    // All slots should be empty
    const emptySlots = page.locator('#live-hole-cards .live-card-slot.empty');
    await expect(emptySlots).toHaveCount(4); // 4 hole card slots for omaha4
    // Card should be available again
    await expect(page.locator('.live-pick-btn[data-card="As"]')).not.toHaveClass(/used/);
  });

  test('spinner buttons change pot value', async ({ page }) => {
    const potInput = page.locator('#live-pot');
    await expect(potInput).toHaveValue('100');
    // Click the + button for pot
    await page.click('.spin-btn[data-target="live-pot"][data-delta="10"]');
    await expect(potInput).toHaveValue('110');
    // Click the - button
    await page.click('.spin-btn[data-target="live-pot"][data-delta="-10"]');
    await expect(potInput).toHaveValue('100');
  });
});
