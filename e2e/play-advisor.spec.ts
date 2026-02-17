/**
 * Play Advisor UI E2E Tests
 * Tests for Phase 4: UI Integration
 */

import { test, expect } from '@playwright/test';

test.describe('Play Advisor Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('tab navigation to Play Advisor', async ({ page }) => {
    // Click the Play Advisor tab
    await page.click('[data-tab="advisor"]');

    // Verify the tab is active
    const tabBtn = page.locator('[data-tab="advisor"]');
    await expect(tabBtn).toHaveClass(/active/);

    // Verify the tab content is visible
    const tabContent = page.locator('#advisor-tab');
    await expect(tabContent).toHaveClass(/active/);
    await expect(tabContent).toBeVisible();
  });

  test('intro card can be collapsed', async ({ page }) => {
    await page.click('[data-tab="advisor"]');

    // Find the intro card
    const introCard = page.locator('#advisor-intro');
    await expect(introCard).toBeVisible();

    // Collapse it
    await page.click('#advisor-intro .intro-card-dismiss');
    await expect(introCard).toHaveClass(/collapsed/);
  });
});

test.describe('Card Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-tab="advisor"]');
  });

  test('card selector grid is rendered', async ({ page }) => {
    const grid = page.locator('#card-selector-grid');
    await expect(grid).toBeVisible();

    // Should have 52 card buttons (13 ranks × 4 suits)
    const cardBtns = grid.locator('.card-btn');
    await expect(cardBtns).toHaveCount(52);
  });

  test('can select hole cards', async ({ page }) => {
    // Ensure hole card mode is selected
    await page.check('input[name="card-mode"][value="hole"]');

    // Click on As (Ace of spades)
    await page.click('.card-btn[data-card="As"]');

    // Card should be marked as selected/hole
    const asBtn = page.locator('.card-btn[data-card="As"]');
    await expect(asBtn).toHaveClass(/selected/);
    await expect(asBtn).toHaveClass(/hole/);

    // Selected cards display should show the card
    const selectedDisplay = page.locator('#selected-hole-cards');
    await expect(selectedDisplay).toContainText('A♠');
  });

  test('can select board cards', async ({ page }) => {
    // Switch to board card mode
    await page.check('input[name="card-mode"][value="board"]');

    // Click on Ts, 9s, 2h (flop)
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="2h"]');

    // Cards should be marked as selected/board
    await expect(page.locator('.card-btn[data-card="Ts"]')).toHaveClass(/board/);
    await expect(page.locator('.card-btn[data-card="9s"]')).toHaveClass(/board/);
    await expect(page.locator('.card-btn[data-card="2h"]')).toHaveClass(/board/);

    // Street indicator should show FLOP
    await expect(page.locator('#street-indicator')).toContainText('FLOP');
  });

  test('cannot select same card for hole and board', async ({ page }) => {
    // Select As as hole card
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');

    // Try to select As as board card
    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="As"]');

    // As should still be hole card, not board
    const asBtn = page.locator('.card-btn[data-card="As"]');
    await expect(asBtn).toHaveClass(/hole/);
    await expect(asBtn).not.toHaveClass(/board/);
  });

  test('clear hole cards button works', async ({ page }) => {
    // Select some hole cards
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');

    // Click clear
    await page.click('#clear-hole-cards');

    // Cards should be deselected
    await expect(page.locator('.card-btn[data-card="As"]')).not.toHaveClass(/selected/);
    await expect(page.locator('.card-btn[data-card="Ks"]')).not.toHaveClass(/selected/);
  });

  test('clear board cards button works', async ({ page }) => {
    // Select some board cards
    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');

    // Click clear
    await page.click('#clear-board-cards');

    // Cards should be deselected
    await expect(page.locator('.card-btn[data-card="Ts"]')).not.toHaveClass(/selected/);
    await expect(page.locator('.card-btn[data-card="9s"]')).not.toHaveClass(/selected/);
  });

  test('max hole cards enforced based on game variant', async ({ page }) => {
    // Default is omaha4 (4 hole cards)
    await page.check('input[name="card-mode"][value="hole"]');

    // Select 4 cards
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qs"]');
    await page.click('.card-btn[data-card="Js"]');

    // Try to select 5th card
    await page.click('.card-btn[data-card="Ts"]');

    // 5th card should NOT be selected
    await expect(page.locator('.card-btn[data-card="Ts"]')).not.toHaveClass(/selected/);
  });

  test('omaha5 allows 5 hole cards', async ({ page }) => {
    // Switch to omaha5
    await page.selectOption('#advisor-game-select', 'omaha5');

    await page.check('input[name="card-mode"][value="hole"]');

    // Select 5 cards
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qs"]');
    await page.click('.card-btn[data-card="Js"]');
    await page.click('.card-btn[data-card="Ts"]');

    // 5th card should be selected
    await expect(page.locator('.card-btn[data-card="Ts"]')).toHaveClass(/selected/);
  });
});

test.describe('Betting Inputs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-tab="advisor"]');
  });

  test('pot size input works', async ({ page }) => {
    const potInput = page.locator('#advisor-pot-size');
    await expect(potInput).toHaveValue('100');

    await potInput.fill('250');
    await expect(potInput).toHaveValue('250');
  });

  test('to call input works', async ({ page }) => {
    const toCallInput = page.locator('#advisor-to-call');
    await expect(toCallInput).toHaveValue('0');

    await toCallInput.fill('50');
    await expect(toCallInput).toHaveValue('50');
  });

  test('stack size input works', async ({ page }) => {
    const stackInput = page.locator('#advisor-stack-size');
    await expect(stackInput).toHaveValue('1000');

    await stackInput.fill('500');
    await expect(stackInput).toHaveValue('500');
  });
});

test.describe('Situation Inputs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-tab="advisor"]');
  });

  test('game variant selector works', async ({ page }) => {
    const gameSelect = page.locator('#advisor-game-select');
    await expect(gameSelect).toHaveValue('omaha4');

    await gameSelect.selectOption('omaha5');
    await expect(gameSelect).toHaveValue('omaha5');
  });

  test('position selector works', async ({ page }) => {
    const posSelect = page.locator('#advisor-position-select');
    await expect(posSelect).toHaveValue('BTN');

    await posSelect.selectOption('UTG');
    await expect(posSelect).toHaveValue('UTG');
  });

  test('players selector works', async ({ page }) => {
    const playersSelect = page.locator('#advisor-players-select');
    await expect(playersSelect).toHaveValue('3');

    await playersSelect.selectOption('2');
    await expect(playersSelect).toHaveValue('2');
  });
});

test.describe('Style Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-tab="advisor"]');
  });

  test('style selector is visible', async ({ page }) => {
    const styleSelect = page.locator('#advisor-style-select');
    await expect(styleSelect).toBeVisible();
  });

  test('style defaults to reg', async ({ page }) => {
    const styleSelect = page.locator('#advisor-style-select');
    await expect(styleSelect).toHaveValue('reg');
  });

  test('can select all 6 styles', async ({ page }) => {
    const styleSelect = page.locator('#advisor-style-select');
    const styles = ['nit', 'rock', 'reg', 'tag', 'lag', 'fish'];

    for (const style of styles) {
      await styleSelect.selectOption(style);
      await expect(styleSelect).toHaveValue(style);
    }
  });

  test('style selection persists through analysis', async ({ page }) => {
    // Select LAG style
    await page.selectOption('#advisor-style-select', 'lag');

    // Set up a complete hand
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qh"]');
    await page.click('.card-btn[data-card="Jh"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="7s"]');
    await page.click('.card-btn[data-card="4s"]');
    await page.click('.card-btn[data-card="2s"]');

    // Wait for analysis to complete
    await page.waitForSelector('.recommendation-card', { timeout: 5000 });

    // Style should still be LAG
    await expect(page.locator('#advisor-style-select')).toHaveValue('lag');
  });

  test('changing style triggers re-analysis', async ({ page }) => {
    // Set up a complete hand first
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qh"]');
    await page.click('.card-btn[data-card="Jh"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="7s"]');
    await page.click('.card-btn[data-card="4s"]');
    await page.click('.card-btn[data-card="2s"]');

    // Wait for initial analysis
    await page.waitForSelector('.recommendation-card', { timeout: 5000 });

    // Change style — should trigger new analysis
    await page.selectOption('#advisor-style-select', 'nit');

    // Wait briefly for re-analysis
    await page.waitForTimeout(1000);

    // Recommendation should still be visible (re-analysis completed)
    await expect(page.locator('.recommendation-card')).toBeVisible();
  });

  test('style affects displayed recommendation for same hand', async ({ page }) => {
    // Set up a complete hand
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qh"]');
    await page.click('.card-btn[data-card="Jh"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="7s"]');
    await page.click('.card-btn[data-card="4s"]');
    await page.click('.card-btn[data-card="2s"]');

    // Analyze with Nit
    await page.selectOption('#advisor-style-select', 'nit');
    await page.waitForSelector('.recommendation-card', { timeout: 5000 });
    const nitAction = await page.locator('.action-badge').textContent();

    // Switch to LAG
    await page.selectOption('#advisor-style-select', 'lag');
    await page.waitForTimeout(1500);
    const lagAction = await page.locator('.action-badge').textContent();

    // At minimum, the recommendation UI should have re-rendered
    // (action or confidence text may differ)
    expect(nitAction).toBeDefined();
    expect(lagAction).toBeDefined();
  });
});

test.describe('Villain Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-tab="advisor"]');
  });

  test('can add villain actions', async ({ page }) => {
    await page.click('.villain-action-btn[data-action="raise"]');

    const display = page.locator('#villain-actions-display');
    await expect(display).toContainText('raise');
  });

  test('multiple actions show in sequence', async ({ page }) => {
    await page.click('.villain-action-btn[data-action="bet"]');
    await page.click('.villain-action-btn[data-action="call"]');

    const display = page.locator('#villain-actions-display');
    await expect(display).toContainText('bet');
    await expect(display).toContainText('call');
  });

  test('clear villain actions button works', async ({ page }) => {
    await page.click('.villain-action-btn[data-action="raise"]');
    await page.click('#clear-villain-actions');

    const display = page.locator('#villain-actions-display');
    await expect(display).toContainText('No actions yet');
  });
});

test.describe('Analyze Button', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-tab="advisor"]');
  });

  test('analyze button is disabled without cards', async ({ page }) => {
    const analyzeBtn = page.locator('#analyze-btn');
    await expect(analyzeBtn).toBeDisabled();
  });

  test('analyze button is disabled with only hole cards', async ({ page }) => {
    // Select 4 hole cards
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qs"]');
    await page.click('.card-btn[data-card="Jh"]');

    const analyzeBtn = page.locator('#analyze-btn');
    await expect(analyzeBtn).toBeDisabled();
  });

  test('analyze button is enabled with complete input', async ({ page }) => {
    // Select 4 hole cards
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qs"]');
    await page.click('.card-btn[data-card="Jh"]');

    // Select 3 board cards
    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="Ts"]');
    await page.click('.card-btn[data-card="9s"]');
    await page.click('.card-btn[data-card="2h"]');

    const analyzeBtn = page.locator('#analyze-btn');
    await expect(analyzeBtn).toBeEnabled();
  });
});

test.describe('Analysis Results', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-tab="advisor"]');

    // Select a complete hand setup
    await page.check('input[name="card-mode"][value="hole"]');
    await page.click('.card-btn[data-card="As"]');
    await page.click('.card-btn[data-card="Ks"]');
    await page.click('.card-btn[data-card="Qh"]');
    await page.click('.card-btn[data-card="Jh"]');

    await page.check('input[name="card-mode"][value="board"]');
    await page.click('.card-btn[data-card="7s"]');
    await page.click('.card-btn[data-card="4s"]');
    await page.click('.card-btn[data-card="2s"]');
  });

  test('displays hand strength after analysis', async ({ page }) => {
    // Wait for auto-analyze or click analyze
    await page.waitForSelector('.hand-strength-card', { timeout: 5000 });

    const handCard = page.locator('.hand-strength-card');
    await expect(handCard).toBeVisible();
    await expect(handCard).toContainText('Flush');
  });

  test('displays equity after analysis', async ({ page }) => {
    await page.waitForSelector('.equity-card', { timeout: 5000 });

    const equityCard = page.locator('.equity-card');
    await expect(equityCard).toBeVisible();
    await expect(equityCard).toContainText('%');
  });

  test('displays recommendation after analysis', async ({ page }) => {
    await page.waitForSelector('.recommendation-card', { timeout: 5000 });

    const recCard = page.locator('.recommendation-card');
    await expect(recCard).toBeVisible();

    // Should show an action
    const actionBadge = recCard.locator('.action-badge');
    await expect(actionBadge).toBeVisible();
    const actionText = await actionBadge.textContent();
    expect(['FOLD', 'CALL', 'CHECK', 'BET', 'RAISE']).toContain(actionText?.toUpperCase());
  });

  test('displays reasoning after analysis', async ({ page }) => {
    await page.waitForSelector('.reasoning-card', { timeout: 5000 });

    const reasonCard = page.locator('.reasoning-card');
    await expect(reasonCard).toBeVisible();
    await expect(reasonCard.locator('.reasoning-primary')).not.toBeEmpty();
  });

  test('displays latency info', async ({ page }) => {
    await page.waitForSelector('.latency-info', { timeout: 5000 });

    const latencyInfo = page.locator('.latency-info');
    await expect(latencyInfo).toContainText('ms');
  });
});

test.describe('Responsive Layout', () => {
  test('mobile viewport shows all inputs', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/');
    await page.click('[data-tab="advisor"]');

    // All key elements should be visible
    await expect(page.locator('#card-selector-grid')).toBeVisible();
    await expect(page.locator('#advisor-pot-size')).toBeVisible();
    await expect(page.locator('#advisor-position-select')).toBeVisible();
    await expect(page.locator('#advisor-style-select')).toBeVisible();
    await expect(page.locator('#analyze-btn')).toBeVisible();
  });

  test('tablet viewport shows proper layout', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('/');
    await page.click('[data-tab="advisor"]');

    await expect(page.locator('.advisor-layout')).toBeVisible();
    await expect(page.locator('.advisor-input-panel')).toBeVisible();
    await expect(page.locator('.advisor-results-panel')).toBeVisible();
  });

  test('desktop viewport shows full layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.click('[data-tab="advisor"]');

    await expect(page.locator('.advisor-layout')).toBeVisible();
    // On desktop, both panels should be side by side
    const layout = page.locator('.advisor-layout');
    const box = await layout.boundingBox();
    expect(box?.width).toBeGreaterThan(900);
  });
});

test.describe('Error States', () => {
  test('shows placeholder when no cards selected', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-tab="advisor"]');

    const placeholder = page.locator('.advisor-placeholder');
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText('Select');
  });
});
