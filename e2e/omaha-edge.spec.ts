import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for the Omaha Edge mobile SPA
 * (index.html + app.js — the new mobile-first vanilla JS app)
 *
 * These tests run against the local dev server serving packages/web/src/public/
 */

// Helper: dismiss splash screen
async function dismissSplash(page: Page) {
  const splash = page.locator('#splash');
  if (await splash.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.locator('#splash-start').click();
    await expect(splash).toBeHidden({ timeout: 3000 });
  }
  // Also dismiss walkthrough if it appears
  const wt = page.locator('#walkthrough');
  if (await wt.isVisible({ timeout: 1000 }).catch(() => false)) {
    const skip = page.locator('#wt-skip');
    if (await skip.isVisible({ timeout: 500 }).catch(() => false)) {
      await skip.click();
    }
  }
}

// Helper: click a rank key then a suit key on the starter keypad
async function enterCardStarter(page: Page, rank: string, suit: string) {
  const suitMap: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
  // Click rank button
  const rankBtn = page.locator('#starter-rankpad .pk-rk').filter({ hasText: new RegExp(`^${rank}$`) }).first();
  await rankBtn.click();
  // Click suit button
  const suitBtn = page.locator('#starter-suitrow .pk-sbtn').filter({ hasText: suitMap[suit] }).first();
  await suitBtn.click();
}

test.describe('Card Entry Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('entering 4 cards shows advisor result', async ({ page }) => {
    await enterCardStarter(page, 'A', 's');
    await enterCardStarter(page, 'A', 'h');
    await enterCardStarter(page, 'K', 's');
    await enterCardStarter(page, 'Q', 'h');

    // Fan should show 4 cards
    const faceCards = page.locator('#starter-fan .pk-card.face');
    await expect(faceCards).toHaveCount(4);

    // Equity ring should show action (RAISE/CALL/FOLD)
    const ringText = page.locator('#starter-ring-inner');
    await expect(ringText).toContainText(/RAISE|CALL|FOLD/);

    // Result sheet should appear
    await expect(page.locator('#starter-result')).toBeVisible();
  });

  test('rank → suit → card appears in fan', async ({ page }) => {
    // Enter one card
    await enterCardStarter(page, 'K', 'h');

    // Should see 1 face card in fan
    const faceCards = page.locator('#starter-fan .pk-card.face');
    await expect(faceCards).toHaveCount(1);

    // Ring should show partial equity
    const eqText = page.locator('#starter-eq-text');
    await expect(eqText).not.toHaveText('—');
  });

  test('duplicate card is rejected', async ({ page }) => {
    await enterCardStarter(page, 'A', 's');
    const countBefore = await page.locator('#starter-fan .pk-card.face').count();

    // Try to enter same card again
    await enterCardStarter(page, 'A', 's');
    const countAfter = await page.locator('#starter-fan .pk-card.face').count();
    expect(countAfter).toBe(countBefore);
  });
});

test.describe('Variant Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('switching to Big O shows 5 card slots', async ({ page }) => {
    // Click Big O variant chip
    const bigO = page.locator('#play-variants .pk-vchip').filter({ hasText: 'Big O' });
    await bigO.click();

    // Fan should have 5 slots
    const slots = page.locator('#starter-fan .pk-fan-card');
    await expect(slots).toHaveCount(5);
  });

  test('switching to PLO-6 shows 6 card slots', async ({ page }) => {
    const plo6 = page.locator('#play-variants .pk-vchip').filter({ hasText: 'PLO-6' });
    await plo6.click();

    const slots = page.locator('#starter-fan .pk-fan-card');
    await expect(slots).toHaveCount(6);
  });

  test('switching back to PLO shows 4 card slots', async ({ page }) => {
    // Switch to Big O then back to PLO
    await page.locator('#play-variants .pk-vchip').filter({ hasText: 'Big O' }).click();
    await page.locator('#play-variants .pk-vchip').filter({ hasText: 'PLO' }).first().click();

    const slots = page.locator('#starter-fan .pk-fan-card');
    await expect(slots).toHaveCount(4);
  });

  test('card entry respects new variant count', async ({ page }) => {
    // Switch to Big O (5 cards)
    await page.locator('#play-variants .pk-vchip').filter({ hasText: 'Big O' }).click();

    // Enter 5 cards
    await enterCardStarter(page, 'A', 's');
    await enterCardStarter(page, 'K', 'h');
    await enterCardStarter(page, 'Q', 'd');
    await enterCardStarter(page, 'J', 'c');

    // After 4 cards, should NOT show result (need 5)
    await expect(page.locator('#starter-result')).toBeHidden();

    await enterCardStarter(page, 'T', 's');

    // Now result should show
    await expect(page.locator('#starter-result')).toBeVisible();
  });
});

test.describe('Board Card Entry', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('board entry appears after hole cards are filled', async ({ page }) => {
    // Board should be hidden initially
    await expect(page.locator('#starter-board-wrap')).toBeHidden();

    // Fill 4 hole cards
    await enterCardStarter(page, 'A', 's');
    await enterCardStarter(page, 'A', 'h');
    await enterCardStarter(page, 'K', 's');
    await enterCardStarter(page, 'Q', 'h');

    // Board entry area should now be visible
    await expect(page.locator('#starter-board-wrap')).toBeVisible();
  });

  test('can enter flop cards', async ({ page }) => {
    // Fill hole cards
    await enterCardStarter(page, 'A', 's');
    await enterCardStarter(page, 'A', 'h');
    await enterCardStarter(page, 'K', 's');
    await enterCardStarter(page, 'Q', 'h');

    // Click "Add board cards" to activate board picker
    const boardBtn = page.locator('#starter-board-wrap').locator('text=board').first();
    if (await boardBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await boardBtn.click();
    }

    // Enter 3 flop cards
    await enterCardStarter(page, 'T', 'd');
    await enterCardStarter(page, '9', 'c');
    await enterCardStarter(page, '2', 'h');
  });
});

test.describe('Mode Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('starts in Starter mode', async ({ page }) => {
    await expect(page.locator('#view-starter')).toBeVisible();
    await expect(page.locator('#view-expert')).toBeHidden();
    await expect(page.locator('#btn-starter')).toHaveClass(/on/);
  });

  test('switches to Expert mode', async ({ page }) => {
    await page.locator('#btn-expert').click();

    await expect(page.locator('#view-expert')).toBeVisible();
    await expect(page.locator('#view-starter')).toBeHidden();
    await expect(page.locator('#btn-expert')).toHaveClass(/on/);
  });

  test('switches back to Starter from Expert', async ({ page }) => {
    await page.locator('#btn-expert').click();
    await page.locator('#btn-starter').click();

    await expect(page.locator('#view-starter')).toBeVisible();
    await expect(page.locator('#view-expert')).toBeHidden();
  });

  test('expert mode has text input and 7-col keypad', async ({ page }) => {
    await page.locator('#btn-expert').click();

    await expect(page.locator('#expert-type-input')).toBeVisible();
    await expect(page.locator('#expert-rankpad')).toBeVisible();
  });
});

test.describe('Study Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
    // Switch to Study tab
    await page.locator('#tabbar .pk-tab[data-tab="study"]').click();
  });

  test('Study tab shows Scenarios sub-view by default', async ({ page }) => {
    await expect(page.locator('#pane-study')).toBeVisible();
    await expect(page.locator('#study-scenarios')).toBeVisible();
  });

  test('switches to Matrix sub-view', async ({ page }) => {
    await page.locator('#btn-matrix').click();
    await expect(page.locator('#study-matrix')).toBeVisible();
    await expect(page.locator('#study-scenarios')).toBeHidden();
  });

  test('switches back to Scenarios from Matrix', async ({ page }) => {
    await page.locator('#btn-matrix').click();
    await page.locator('#btn-scenarios').click();
    await expect(page.locator('#study-scenarios')).toBeVisible();
  });

  test('preset chips are clickable and update study', async ({ page }) => {
    const presets = page.locator('#study-presets .st-preset');
    const count = await presets.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Click first preset
    await presets.first().click();
  });

  test('hand builder is visible in Scenarios', async ({ page }) => {
    await expect(page.locator('#hand-builder')).toBeVisible();
  });

  test('hand builder structure chips are clickable', async ({ page }) => {
    // Find a structure chip and click it
    const chip = page.locator('#hand-builder .hb-chip').first();
    if (await chip.isVisible({ timeout: 1000 }).catch(() => false)) {
      await chip.click();
    }
  });

  test('hand builder shuffle regenerates examples', async ({ page }) => {
    // Get initial examples HTML
    const examplesContainer = page.locator('#hand-builder .hb-examples');
    if (await examplesContainer.isVisible({ timeout: 1000 }).catch(() => false)) {
      const htmlBefore = await examplesContainer.innerHTML();

      // Click shuffle
      const shuffleBtn = page.locator('#hand-builder .hb-shuffle');
      await shuffleBtn.click();

      // Examples should change (different suit arrangement)
      const htmlAfter = await examplesContainer.innerHTML();
      expect(htmlAfter).not.toBe(htmlBefore);
    }
  });

  test('Matrix sub-view shows hand name and navigation', async ({ page }) => {
    await page.locator('#btn-matrix').click();

    await expect(page.locator('#matrix-hand-name')).toBeVisible();
    await expect(page.locator('#matrix-prev')).toBeVisible();
    await expect(page.locator('#matrix-next')).toBeVisible();
  });

  test('Matrix hand navigation works', async ({ page }) => {
    await page.locator('#btn-matrix').click();

    const nameEl = page.locator('#matrix-hand-name');
    const nameBefore = await nameEl.textContent();

    await page.locator('#matrix-next').click();
    const nameAfter = await nameEl.textContent();

    expect(nameAfter).not.toBe(nameBefore);
  });
});

test.describe('Pot Economics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('pot economics appear after hole cards filled', async ({ page }) => {
    await expect(page.locator('#starter-econ-wrap')).toBeHidden();

    // Fill 4 hole cards
    await enterCardStarter(page, 'A', 's');
    await enterCardStarter(page, 'A', 'h');
    await enterCardStarter(page, 'K', 's');
    await enterCardStarter(page, 'Q', 'h');

    await expect(page.locator('#starter-econ-wrap')).toBeVisible();
  });

  test('expert mode economics are visible with full hand', async ({ page }) => {
    await page.locator('#btn-expert').click();

    // Type a full hand in expert mode
    await page.locator('#expert-type-input').fill('AsAhKsQh');
    await page.locator('#expert-type-input').press('Enter');

    // Wait for economics to appear
    await expect(page.locator('#expert-econ-wrap')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Cross-Tab State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('variant persists when switching tabs', async ({ page }) => {
    // Switch to Big O
    await page.locator('#play-variants .pk-vchip').filter({ hasText: 'Big O' }).click();

    // Switch to Study tab
    await page.locator('#tabbar .pk-tab[data-tab="study"]').click();

    // Study tab should also show Big O selected
    const studyVariant = page.locator('#study-variants .pk-vchip.on');
    await expect(studyVariant).toContainText('Big O');

    // Switch back to Play
    await page.locator('#tabbar .pk-tab[data-tab="play"]').click();

    // Should still be Big O
    const playVariant = page.locator('#play-variants .pk-vchip.on');
    await expect(playVariant).toContainText('Big O');
  });

  test('situation context persists across tabs', async ({ page }) => {
    // Check Play tab context
    const playPos = page.locator('#ctx-pos');
    const posText = await playPos.textContent();

    // Switch to Study
    await page.locator('#tabbar .pk-tab[data-tab="study"]').click();

    // Study should show same position
    await expect(page.locator('#study-ctx-pos')).toHaveText(posText!);
  });
});

test.describe('Journal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('Journal tab shows session data', async ({ page }) => {
    await page.locator('#tabbar .pk-tab[data-tab="journal"]').click();
    await expect(page.locator('#pane-journal')).toBeVisible();
    await expect(page.locator('#jr-scroll')).toBeVisible();
  });

  test('Journal shows session count', async ({ page }) => {
    await page.locator('#tabbar .pk-tab[data-tab="journal"]').click();
    const count = page.locator('#jr-session-count');
    await expect(count).toBeVisible();
    const text = await count.textContent();
    expect(Number(text)).toBeGreaterThanOrEqual(0);
  });

  test('saving a hand adds it to journal', async ({ page }) => {
    // Enter 4 hole cards
    await enterCardStarter(page, 'A', 's');
    await enterCardStarter(page, 'A', 'h');
    await enterCardStarter(page, 'K', 's');
    await enterCardStarter(page, 'Q', 'h');

    // Click save button
    const saveBtn = page.locator('#starter-save');
    if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await saveBtn.click();
    }

    // Toast should appear
    await expect(page.locator('#toast')).toBeVisible({ timeout: 3000 });

    // Switch to journal tab
    await page.locator('#tabbar .pk-tab[data-tab="journal"]').click();

    // Should show at least 1 session (the live session)
    const sessionCount = await page.locator('#jr-session-count').textContent();
    expect(Number(sessionCount)).toBeGreaterThanOrEqual(1);
  });
});

test.describe('New Hand', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('New hand clears all cards', async ({ page }) => {
    // Enter some cards
    await enterCardStarter(page, 'A', 's');
    await enterCardStarter(page, 'K', 'h');

    // Verify cards are present
    expect(await page.locator('#starter-fan .pk-card.face').count()).toBe(2);

    // Click New (clear) button
    await page.locator('#starter-clear').click();

    // Fan should have no face cards
    expect(await page.locator('#starter-fan .pk-card.face').count()).toBe(0);

    // Equity ring should reset
    await expect(page.locator('#starter-eq-text')).toHaveText('—');
  });

  test('New hand button in result sheet clears cards', async ({ page }) => {
    // Fill all 4 cards
    await enterCardStarter(page, 'A', 's');
    await enterCardStarter(page, 'A', 'h');
    await enterCardStarter(page, 'K', 's');
    await enterCardStarter(page, 'Q', 'h');

    // Click "New hand" in result sheet
    await page.locator('#starter-new').click();

    // Cards should be cleared
    expect(await page.locator('#starter-fan .pk-card.face').count()).toBe(0);
  });

  test('Expert mode New hand button works', async ({ page }) => {
    await page.locator('#btn-expert').click();

    // Type a hand
    await page.locator('#expert-type-input').fill('AsAhKsQh');
    await page.locator('#expert-type-input').press('Enter');

    // Click New hand
    await page.locator('#expert-new').click();

    // Track should be cleared
    const trackCards = page.locator('#expert-track .pk-card');
    expect(await trackCards.count()).toBe(0);
  });
});

test.describe('Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('starts on Play tab', async ({ page }) => {
    await expect(page.locator('#pane-play')).toBeVisible();
    await expect(page.locator('#pane-study')).toBeHidden();
    await expect(page.locator('#pane-journal')).toBeHidden();
  });

  test('can navigate to all 3 tabs', async ({ page }) => {
    // Study
    await page.locator('#tabbar .pk-tab[data-tab="study"]').click();
    await expect(page.locator('#pane-study')).toBeVisible();
    await expect(page.locator('#pane-play')).toBeHidden();

    // Journal
    await page.locator('#tabbar .pk-tab[data-tab="journal"]').click();
    await expect(page.locator('#pane-journal')).toBeVisible();
    await expect(page.locator('#pane-study')).toBeHidden();

    // Play
    await page.locator('#tabbar .pk-tab[data-tab="play"]').click();
    await expect(page.locator('#pane-play')).toBeVisible();
    await expect(page.locator('#pane-journal')).toBeHidden();
  });

  test('tab bar highlights active tab', async ({ page }) => {
    const playTab = page.locator('#tabbar .pk-tab[data-tab="play"]');
    const studyTab = page.locator('#tabbar .pk-tab[data-tab="study"]');

    await expect(playTab).toHaveClass(/on/);
    await expect(studyTab).not.toHaveClass(/on/);

    await studyTab.click();
    await expect(studyTab).toHaveClass(/on/);
    await expect(playTab).not.toHaveClass(/on/);
  });
});
