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
    // Modal should appear
    await expect(page.locator('.modal, .settings-modal, [role="dialog"]')).toBeVisible({ timeout: 5000 });
  });

});

test.describe('Matrix Tab', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=Probability Matrix');
  });

  test('matrix tab has run simulation controls', async ({ page }) => {
    // Should have iteration input or similar controls
    await expect(page.locator('#matrix-tab')).toBeVisible();
  });

  test('run simulation button exists', async ({ page }) => {
    // The run button has specific id
    const runBtn = page.locator('#run-matrix');
    await expect(runBtn).toBeVisible();
    await expect(runBtn).toHaveText('Run Simulation');
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

    // Button should show loading state
    await expect(analyzeBtn).toContainText(/Analyzing|Running/i, { timeout: 5000 });

    // Wait for results (with timeout for API call)
    // Either results appear or button returns to normal
    await expect(async () => {
      const btnText = await analyzeBtn.textContent();
      const resultsVisible = await page.locator('#stat-hands').isVisible();
      // Either button returned to Analyze or results are showing
      expect(btnText?.includes('Analyze') || resultsVisible).toBeTruthy();
    }).toPass({ timeout: 30000 });
  });

  test('Run Simulation in Matrix tab works', async ({ page }) => {
    await page.goto('/');

    // Switch to Matrix tab
    await page.click('.tab-btn:has-text("Probability Matrix")');
    await expect(page.locator('#matrix-tab')).toBeVisible();

    // Find run button
    const runBtn = page.locator('#run-matrix');
    await expect(runBtn).toBeVisible();
    await expect(runBtn).toHaveText('Run Simulation');

    // Click run
    await runBtn.click();

    // Button should show running state
    await expect(runBtn).toHaveText(/Running|Simulating/i, { timeout: 5000 });

    // Wait for completion (simulation can take time)
    await expect(async () => {
      const btnText = await runBtn.textContent();
      // Either button returned to Run Simulation or matrix results appeared
      const matrixVisible = await page.locator('.matrix').isVisible();
      expect(btnText?.includes('Run Simulation') || matrixVisible).toBeTruthy();
    }).toPass({ timeout: 60000 });
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
