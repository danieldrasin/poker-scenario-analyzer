/**
 * Debug test: Single bot join with screenshots at every step
 */

import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';

const GAME_URL = 'https://www.pokernow.com/games/pgl2wy20QIsPBt_NSZ5zQfL4X';
const SCREENSHOT_DIR = './bot/debug-screenshots';

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {}
}

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  📸 Screenshot: ${filepath}`);
}

async function main() {
  await ensureDir(SCREENSHOT_DIR);

  console.log('=== Single Bot Debug Test ===\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    // Step 1: Navigate
    console.log('Step 1: Navigating to game...');
    await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '01-initial-page');

    // Step 2: Find available seats
    console.log('\nStep 2: Finding seats...');
    const allSeats = await page.$$('.table-player-seat');
    console.log(`  Found ${allSeats.length} total seat elements`);

    // Look for empty seats (those without a player name)
    const emptySeats = [];
    for (let i = 0; i < allSeats.length; i++) {
      const seat = allSeats[i];
      const hasPlayer = await seat.$('.table-player-name');
      const classList = await seat.evaluate(el => el.className);
      console.log(`  Seat ${i}: hasPlayer=${!!hasPlayer}, classes=${classList}`);
      if (!hasPlayer) {
        emptySeats.push(seat);
      }
    }
    console.log(`  Empty seats: ${emptySeats.length}`);

    if (emptySeats.length === 0) {
      console.log('  No empty seats found, trying to click first seat...');
      if (allSeats.length > 0) {
        await allSeats[0].click();
      }
    } else {
      // Click first empty seat
      console.log('  Clicking first empty seat...');
      await emptySeats[0].click();
    }

    await page.waitForTimeout(1500);
    await screenshot(page, '02-after-seat-click');

    // Step 3: Check for join dialog
    console.log('\nStep 3: Looking for join dialog...');

    // Look for the modal/dialog
    const dialog = await page.$('.modal, .dialog, [class*="modal"], [class*="dialog"], [class*="popup"]');
    console.log(`  Dialog found: ${!!dialog}`);

    // List all visible inputs
    const inputs = await page.$$('input:visible');
    console.log(`  Visible inputs: ${inputs.length}`);

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const placeholder = await input.getAttribute('placeholder') || '';
      const type = await input.getAttribute('type') || '';
      const name = await input.getAttribute('name') || '';
      const value = await input.inputValue() || '';
      console.log(`    Input ${i}: type=${type}, name=${name}, placeholder=${placeholder}, value=${value}`);
    }

    // Step 4: Fill nickname
    console.log('\nStep 4: Filling nickname...');
    const nicknameInput = await page.$('input[placeholder*="ickname"], input[placeholder*="name" i]');
    if (nicknameInput) {
      await nicknameInput.click();
      await nicknameInput.fill('');
      await nicknameInput.type('DebugBot', { delay: 50 });
      console.log('  Filled nickname: DebugBot');
    } else {
      console.log('  ⚠ No nickname input found!');
      // Try the first text input
      const firstInput = await page.$('input[type="text"]:visible');
      if (firstInput) {
        await firstInput.click();
        await firstInput.fill('');
        await firstInput.type('DebugBot', { delay: 50 });
        console.log('  Used first text input for nickname');
      }
    }

    await screenshot(page, '03-after-nickname');

    // Step 5: Fill stack
    console.log('\nStep 5: Filling stack...');
    const stackInput = await page.$('input[type="number"]:visible');
    if (stackInput) {
      await stackInput.click();
      await stackInput.fill('');
      await stackInput.type('1000', { delay: 50 });
      console.log('  Filled stack: 1000');
    } else {
      console.log('  ⚠ No stack input found');
    }

    await screenshot(page, '04-after-stack');

    // Step 6: Find and click join button
    console.log('\nStep 6: Finding join button...');
    const buttons = await page.$$('button:visible');
    console.log(`  Visible buttons: ${buttons.length}`);

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const text = await btn.textContent();
      console.log(`    Button ${i}: "${text.trim()}"`);
    }

    const joinBtn = await page.$('button:has-text("Take the Seat"), button:has-text("Take Seat"), button:has-text("Join")');
    if (joinBtn) {
      console.log('  Clicking join button...');
      await joinBtn.click();
    } else {
      console.log('  ⚠ No join button found! Trying last button...');
      if (buttons.length > 0) {
        await buttons[buttons.length - 1].click();
      }
    }

    await page.waitForTimeout(3000);
    await screenshot(page, '05-after-join-click');

    // Step 7: Verify join
    console.log('\nStep 7: Verifying join...');
    const playerName = await page.$eval('.you-player .table-player-name', el => el.textContent).catch(() => null);
    const hasLeaveButton = await page.$('button:has-text("Leave")');

    console.log(`  Player name shown: ${playerName || 'not found'}`);
    console.log(`  Has leave button: ${!!hasLeaveButton}`);

    await screenshot(page, '06-final-state');

    // Check for errors
    const errorMsg = await page.$('.error, .error-message, [class*="error"]');
    if (errorMsg) {
      const errorText = await errorMsg.textContent();
      console.log(`  ⚠ Error message found: ${errorText}`);
    }

    console.log('\n=== Test Complete ===');
    console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
    console.log('\nKeeping browser open for 30 seconds for manual inspection...');

    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await screenshot(page, 'error-state');
  } finally {
    await browser.close();
  }
}

main();
