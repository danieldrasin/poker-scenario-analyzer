import { test, expect } from '@playwright/test';

/**
 * E2E tests for Poker Scenario Analyzer
 *
 * Run locally: npx playwright test
 * Run against live: TEST_URL=https://your-app.vercel.app LIVE_TEST=true npx playwright test
 */

test.describe('Poker Scenario Analyzer', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('homepage loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Poker Scenario Analyzer/);
  });

  test('displays main navigation tabs', async ({ page }) => {
    // Use specific tab button selectors to avoid matching other text
    await expect(page.locator('.tab-btn:has-text("Scenario Builder")')).toBeVisible();
    await expect(page.locator('.tab-btn:has-text("Probability Matrix")')).toBeVisible();
    await expect(page.locator('.tab-btn:has-text("Saved Analysis")')).toBeVisible();
  });

  test('game selector has Omaha variants', async ({ page }) => {
    const gameSelect = page.locator('#game-select');
    await expect(gameSelect).toBeVisible();

    // Check options exist
    await expect(gameSelect.locator('option[value="omaha4"]')).toHaveText('Omaha 4-Card');
    await expect(gameSelect.locator('option[value="omaha5"]')).toHaveText('Omaha 5-Card');
    await expect(gameSelect.locator('option[value="omaha6"]')).toHaveText('Omaha 6-Card');
  });

  test('position selector has all positions', async ({ page }) => {
    const posSelect = page.locator('#position-select');
    await expect(posSelect).toBeVisible();

    // Check options exist by counting them (options are hidden until dropdown opens)
    const options = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
    for (const pos of options) {
      await expect(posSelect.locator(`option[value="${pos}"]`)).toHaveCount(1);
    }
  });

  test('opponent buttons are clickable', async ({ page }) => {
    // Find opponent selector buttons
    const oppButtons = page.locator('.opp-btn');
    await expect(oppButtons).toHaveCount(8); // 1-8 opponents

    // Click a different opponent count
    await page.click('.opp-btn[data-count="3"]');
    await expect(page.locator('.opp-btn[data-count="3"]')).toHaveClass(/active/);
  });

  test('preset chips are clickable', async ({ page }) => {
    const presetChips = page.locator('.preset-chip');
    await expect(presetChips.first()).toBeVisible();

    // Click a preset
    await page.click('.preset-chip[data-query="pair:KK:ds"]');
    await expect(page.locator('.preset-chip[data-query="pair:KK:ds"]')).toHaveClass(/active/);
  });

  test('can switch to Matrix tab', async ({ page }) => {
    await page.click('text=Probability Matrix');
    await expect(page.locator('#matrix-tab')).toBeVisible();
  });

  test('can switch to Saved Analysis tab', async ({ page }) => {
    await page.click('text=Saved Analysis');
    await expect(page.locator('#saved-tab')).toBeVisible();
  });

  test('settings button opens AI settings modal', async ({ page }) => {
    await page.click('#settings-btn');
    // Modal should appear - use specific settings modal ID to avoid matching help modal
    await expect(page.locator('#settings-modal')).toBeVisible({ timeout: 5000 });
  });

});

test.describe('Matrix Tab', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=Probability Matrix');
  });

  test('matrix tab has game and player selectors', async ({ page }) => {
    // Matrix tab should have controls to explore 3D space (game variant x player count)
    await expect(page.locator('#matrix-tab')).toBeVisible();
    await expect(page.locator('#matrix-game')).toBeVisible();
    await expect(page.locator('#matrix-players')).toBeVisible();
  });

  test('matrix auto-loads with Tier 2 data', async ({ page }) => {
    // Matrix should auto-load pre-computed data when tab is opened
    // Wait for matrix table to appear (auto-loaded)
    await expect(page.locator('.matrix')).toBeVisible({ timeout: 15000 });
    // Should show source info indicating pre-computed data
    await expect(page.locator('.matrix-source-info')).toContainText(/pre-computed|Loaded/i, { timeout: 5000 });
  });

});

test.describe('Responsive Layout', () => {

  test('mobile viewport shows all critical elements', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/');

    // Core elements should be visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('#game-select')).toBeVisible();
    await expect(page.locator('.tab-btn').first()).toBeVisible();
  });

  test('tablet viewport renders properly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('/');

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.tab-btn')).toHaveCount(3);
  });

});

test.describe('Data Loading', () => {

  test('bundled data loads on page load', async ({ page }) => {
    await page.goto('/');

    // Check console for data loading (or check for absence of loading indicator after load)
    await page.waitForTimeout(2000); // Allow time for async data load

    // The loading indicator should be hidden after data loads
    const loadingIndicator = page.locator('#data-status');
    await expect(loadingIndicator).toBeHidden({ timeout: 10000 });
  });

});

test.describe('Simulation Features', () => {

  test('Analyze Scenario button triggers analysis', async ({ page }) => {
    await page.goto('/');

    // Find and click analyze button
    const analyzeBtn = page.locator('#analyze-btn');
    await expect(analyzeBtn).toBeVisible();
    await expect(analyzeBtn).toContainText('Analyze');

    // Click analyze
    await analyzeBtn.click();

    // Wait for results - Tier 2 data may load instantly so we check for results directly
    // Either loading state appears briefly OR results show up (with fast Tier 2 data)
    await expect(async () => {
      const btnText = await analyzeBtn.textContent();
      const resultsVisible = await page.locator('#stat-hands').isVisible();
      const isLoading = /Checking|Loading|Analyzing|Running/i.test(btnText || '');
      // Either loading state, button returned to Analyze, or results are showing
      expect(isLoading || btnText?.includes('Analyze') || resultsVisible).toBeTruthy();
    }).toPass({ timeout: 30000 });

    // Ultimately results should appear
    await expect(page.locator('#stat-hands')).toBeVisible({ timeout: 30000 });
  });

  test('Matrix tab auto-loads and responds to selector changes', async ({ page }) => {
    await page.goto('/');

    // Switch to Matrix tab - this now auto-loads the matrix with Tier 2 data
    await page.click('.tab-btn:has-text("Probability Matrix")');
    await expect(page.locator('#matrix-tab')).toBeVisible();

    // Matrix should auto-load with Tier 2 data
    await expect(page.locator('.matrix')).toBeVisible({ timeout: 15000 });

    // Verify header shows game variant and player count
    await expect(page.locator('.matrix-header')).toContainText(/OMAHA4.*6 Players/i);

    // Change player count - matrix should reload
    await page.selectOption('#matrix-players', '4');
    
    // Wait for matrix to reload with new player count
    await expect(page.locator('.matrix-header')).toContainText(/4 Players/i, { timeout: 10000 });

    // Change game variant - matrix should reload
    await page.selectOption('#matrix-game', 'omaha5');
    
    // Wait for matrix to reload with new game variant
    await expect(page.locator('.matrix-header')).toContainText(/OMAHA5/i, { timeout: 10000 });
  });

  test('API health endpoint works', async ({ page, request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
    const response = await request.get(`${baseUrl}/api/health`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('API simulate endpoint works', async ({ page, request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
    const response = await request.post(`${baseUrl}/api/simulate`, {
      data: {
        gameVariant: 'omaha4',
        playerCount: 4,
        iterations: 100
      }
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(data.result.metadata).toBeDefined();
    expect(data.result.statistics).toBeDefined();
    expect(data.result.metadata.config.iterations).toBe(100);
  });

});

test.describe('Tier 2 Data (R2 Pre-computed)', () => {

  test('API data endpoint returns R2 source with 1M iterations', async ({ request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
    const response = await request.get(`${baseUrl}/api/data?game=omaha4&players=6`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    // Should come from tier2-r2 (Cloudflare R2)
    expect(data.source).toBe('tier2-r2');
    // Should have 1 million iterations
    expect(data.data.metadata.config.iterations).toBe(1000000);
    // Should have game variant
    expect(data.data.metadata.config.gameVariant).toBe('omaha4');
    expect(data.data.metadata.config.playerCount).toBe(6);
  });

  test('R2 data has valid statistics structure', async ({ request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
    const response = await request.get(`${baseUrl}/api/data?game=omaha4&players=6`);
    const data = await response.json();

    // Check statistics structure
    expect(data.data.statistics).toBeDefined();
    expect(data.data.statistics.handTypeDistribution).toBeDefined();
    expect(data.data.statistics.overallWinRate).toBeDefined();
    expect(data.data.statistics.probabilityMatrix).toBeDefined();

    // Should have 9 hand types
    expect(data.data.statistics.handTypeDistribution.length).toBe(9);
  });

  test('R2 data has valid probability matrix', async ({ request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
    const response = await request.get(`${baseUrl}/api/data?game=omaha4&players=6`);
    const data = await response.json();

    const matrix = data.data.statistics.probabilityMatrix;
    // Should be 9x9 matrix (9 hand types)
    expect(matrix.length).toBe(9);
    expect(matrix[0].length).toBe(9);

    // Check a specific cell has expected structure
    const flushVsTwoPair = matrix[5][2]; // Flush vs Two Pair
    expect(flushVsTwoPair.heroHand).toBe('Flush');
    expect(flushVsTwoPair.oppHand).toBe('Two Pair');
    expect(flushVsTwoPair.winRate).toBeDefined();
    expect(typeof flushVsTwoPair.winRate).toBe('number');
  });

  test('R2 data available for all game variants', async ({ request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
    const variants = ['omaha4', 'omaha5', 'omaha6'];

    for (const variant of variants) {
      const response = await request.get(`${baseUrl}/api/data?game=${variant}&players=6`);
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.source).toBe('tier2-r2');
      expect(data.data.metadata.config.gameVariant).toBe(variant);
    }
  });

});

test.describe('Results Accuracy', () => {

  test('win rate is reasonable for 6 players', async ({ request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
    const response = await request.get(`${baseUrl}/api/data?game=omaha4&players=6`);
    const data = await response.json();

    const winRate = data.data.statistics.overallWinRate;
    // With 6 players, expected win rate ~16.7% (1/6), allow 10-25% range
    expect(winRate).toBeGreaterThan(10);
    expect(winRate).toBeLessThan(25);
  });

  test('win rate decreases with more players', async ({ request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';

    const response2p = await request.get(`${baseUrl}/api/data?game=omaha4&players=2`);
    const response6p = await request.get(`${baseUrl}/api/data?game=omaha4&players=6`);
    const response9p = await request.get(`${baseUrl}/api/data?game=omaha4&players=9`);

    const winRate2p = (await response2p.json()).data.statistics.overallWinRate;
    const winRate6p = (await response6p.json()).data.statistics.overallWinRate;
    const winRate9p = (await response9p.json()).data.statistics.overallWinRate;

    // More players = lower win rate
    expect(winRate2p).toBeGreaterThan(winRate6p);
    expect(winRate6p).toBeGreaterThan(winRate9p);
  });

  test('hand type distribution percentages sum to ~100%', async ({ request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
    const response = await request.get(`${baseUrl}/api/data?game=omaha4&players=6`);
    const data = await response.json();

    const distribution = data.data.statistics.handTypeDistribution;
    const totalPercentage = distribution.reduce((sum: number, h: any) => sum + h.percentage, 0);

    // Should sum to approximately 100% (allow small floating point variance)
    expect(totalPercentage).toBeGreaterThan(99);
    expect(totalPercentage).toBeLessThan(101);
  });

  test('stronger hands beat weaker hands more often', async ({ request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
    const response = await request.get(`${baseUrl}/api/data?game=omaha4&players=6`);
    const data = await response.json();

    const matrix = data.data.statistics.probabilityMatrix;

    // Flush (index 5) vs Two Pair (index 2) - Flush should win most of the time
    const flushVsTwoPair = matrix[5][2];
    expect(flushVsTwoPair.winRate).toBeGreaterThan(90);

    // Full House (index 6) vs Flush (index 5) - Full House should win most
    const fullHouseVsFlush = matrix[6][5];
    expect(fullHouseVsFlush.winRate).toBeGreaterThan(90);
  });

});

test.describe('AI Settings Modal', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('settings modal has provider dropdown', async ({ page }) => {
    await page.click('#settings-btn');
    await expect(page.locator('#settings-modal')).toBeVisible({ timeout: 5000 });

    // Look for provider select
    const providerSelect = page.locator('select#ai-provider, select[name="provider"], .provider-select');
    await expect(providerSelect).toBeVisible({ timeout: 3000 });
  });

  test('provider dropdown has multiple options', async ({ page }) => {
    await page.click('#settings-btn');
    await expect(page.locator('#settings-modal')).toBeVisible({ timeout: 5000 });

    const providerSelect = page.locator('select#ai-provider, select[name="provider"], .provider-select');
    // Should have at least Anthropic, OpenAI options
    const options = providerSelect.locator('option');
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('API key input accepts text', async ({ page }) => {
    await page.click('#settings-btn');
    await expect(page.locator('#settings-modal')).toBeVisible({ timeout: 5000 });

    // Find API key input
    const keyInput = page.locator('input#api-key, input[name="apiKey"], input[type="password"]').first();
    await expect(keyInput).toBeVisible({ timeout: 3000 });

    // Type a test key
    await keyInput.fill('sk-test-key-12345');
    await expect(keyInput).toHaveValue('sk-test-key-12345');
  });

  test('modal can be closed', async ({ page }) => {
    await page.click('#settings-btn');
    const modal = page.locator('#settings-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Use specific close button for settings modal
    const closeBtn = page.locator('#close-settings');
    await closeBtn.click();

    // Modal should be hidden
    await expect(modal).toBeHidden({ timeout: 3000 });
  });

});

test.describe('Hand Presets', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('clicking preset updates active state', async ({ page }) => {
    // Click KK preset (AA is default, so KK should not be active initially)
    const presetKK = page.locator('.preset-chip[data-query="pair:KK:ds"]');
    await expect(presetKK).toBeVisible();

    // KK should not be active initially (AA is the default)
    await expect(presetKK).not.toHaveClass(/active/);

    // Click KK preset
    await presetKK.click();

    // KK should now be active
    await expect(presetKK).toHaveClass(/active/);
  });

  test('different presets can be selected', async ({ page }) => {
    const presetAA = page.locator('.preset-chip[data-query="pair:AA:ds"]');
    const presetKK = page.locator('.preset-chip[data-query="pair:KK:ds"]');

    // Select AA
    await presetAA.click();
    await expect(presetAA).toHaveClass(/active/);

    // Select KK - should deactivate AA
    await presetKK.click();
    await expect(presetKK).toHaveClass(/active/);
    await expect(presetAA).not.toHaveClass(/active/);
  });

  test('multiple preset categories exist', async ({ page }) => {
    const presets = page.locator('.preset-chip');
    const count = await presets.count();

    // Should have multiple presets available
    expect(count).toBeGreaterThanOrEqual(5);
  });

});

test.describe('Saved Analysis', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for tab buttons to be ready
    await expect(page.locator('.tab-btn:has-text("Saved Analysis")')).toBeVisible({ timeout: 5000 });
    // Switch to Saved Analysis tab
    await page.click('.tab-btn:has-text("Saved Analysis")');
    // Wait for the button to become active (indicates JS handler ran)
    await expect(page.locator('.tab-btn:has-text("Saved Analysis")')).toHaveClass(/active/, { timeout: 5000 });
    // Then wait for tab content to become visible
    await expect(page.locator('#saved-tab')).toBeVisible({ timeout: 10000 });
  });

  test('saved analysis tab displays', async ({ page }) => {
    // Tab should be visible (already switched in beforeEach)
    await expect(page.locator('#saved-tab')).toBeVisible({ timeout: 5000 });
  });

  test('empty state shows message when no saved analyses', async ({ page }) => {
    // Check for empty state message or list
    const emptyMessage = page.locator('text=/no saved|empty|nothing saved/i');
    const savedList = page.locator('.saved-list, .saved-analyses, #saved-list');

    // Either empty message or empty list should be visible
    const hasEmpty = await emptyMessage.isVisible({ timeout: 2000 }).catch(() => false);
    const hasList = await savedList.isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasEmpty || hasList).toBeTruthy();
  });

});

test.describe('Error Handling', () => {

  test('handles invalid game variant gracefully', async ({ request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
    const response = await request.get(`${baseUrl}/api/data?game=invalid&players=6`);

    // Should return an error status or error message
    if (response.ok()) {
      const data = await response.json();
      // If it returns OK, it should have an error field or empty data
      expect(data.error || data.source === 'error' || !data.data).toBeTruthy();
    } else {
      // Non-OK status is acceptable for invalid input
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('handles invalid player count gracefully', async ({ request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
    const response = await request.get(`${baseUrl}/api/data?game=omaha4&players=99`);

    // Should handle gracefully - either 4xx error or error in response
    if (response.ok()) {
      const data = await response.json();
      expect(data.error || !data.data).toBeTruthy();
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('simulate endpoint handles edge cases', async ({ request }) => {
    const baseUrl = process.env.TEST_URL || 'http://localhost:3000';

    // Test with minimal iterations - should still work
    const response = await request.post(`${baseUrl}/api/simulate`, {
      data: {
        gameVariant: 'omaha4',
        playerCount: 2,
        iterations: 10
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Should return valid result even with minimal iterations
    expect(data.result).toBeDefined();
    expect(data.result.metadata.config.iterations).toBe(10);
  });

});
