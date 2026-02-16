/**
 * Test: Can we bypass email verification by clicking CANCEL?
 * Or does entering any email work?
 */

import { chromium } from 'playwright';
import { promises as fs } from 'fs';

const GAME_URL = 'https://www.pokernow.com/games/pgl2wy20QIsPBt_NSZ5zQfL4X';
const SCREENSHOT_DIR = './bot/debug-screenshots';

async function screenshot(page, name) {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true }).catch(() => {});
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

async function main() {
  console.log('=== Email Bypass Test ===\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    // Navigate
    console.log('1. Navigating to game...');
    await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click a seat
    console.log('2. Clicking a seat...');
    const seat = await page.$('.table-player-seat');
    await seat.click();
    await page.waitForTimeout(1500);
    await screenshot(page, 'bypass-01-seat-clicked');

    // Fill the form
    console.log('3. Filling form...');
    const nameInput = await page.$('input[placeholder="Your Name"]');
    const stackInput = await page.$('input[placeholder="Intended Stack"]');

    if (nameInput) {
      await nameInput.fill('BypassBot');
      console.log('   Name: BypassBot');
    }
    if (stackInput) {
      await stackInput.fill('1000');
      console.log('   Stack: 1000');
    }

    await screenshot(page, 'bypass-02-form-filled');

    // Click REQUEST THE SEAT
    console.log('4. Clicking REQUEST THE SEAT...');
    const requestBtn = await page.$('button:has-text("REQUEST THE SEAT")');
    if (requestBtn) {
      await requestBtn.click();
    }
    await page.waitForTimeout(2000);
    await screenshot(page, 'bypass-03-after-request');

    // Look for email dialog
    console.log('5. Checking for email dialog...');
    const emailInput = await page.$('input[placeholder*="email" i], input[type="email"]');
    const cancelBtn = await page.$('button:has-text("CANCEL")');
    const confirmBtn = await page.$('button:has-text("CONFIRM")');

    if (emailInput && cancelBtn) {
      console.log('   Email dialog detected!');

      // TEST 1: Try clicking CANCEL
      console.log('\n=== TEST: Clicking CANCEL ===');
      await cancelBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'bypass-04-after-cancel');

      // Check if we're seated
      const leaveBtn = await page.$('button:has-text("Leave")');
      const playerName = await page.$eval('.you-player .table-player-name', el => el.textContent).catch(() => null);

      console.log(`   Leave button: ${!!leaveBtn}`);
      console.log(`   Player name: ${playerName || 'not found'}`);

      if (leaveBtn || playerName) {
        console.log('\n✅ SUCCESS! CANCEL bypassed email verification!');
      } else {
        console.log('\n❌ CANCEL did not work. Trying with dummy email...');

        // Click seat again
        await page.waitForTimeout(1000);
        const seat2 = await page.$('.table-player-seat:not(.taken)');
        if (seat2) {
          await seat2.click();
          await page.waitForTimeout(1500);

          const nameInput2 = await page.$('input[placeholder="Your Name"]');
          const stackInput2 = await page.$('input[placeholder="Intended Stack"]');
          if (nameInput2) await nameInput2.fill('BypassBot2');
          if (stackInput2) await stackInput2.fill('1000');

          const requestBtn2 = await page.$('button:has-text("REQUEST THE SEAT")');
          if (requestBtn2) await requestBtn2.click();
          await page.waitForTimeout(2000);

          // Now try entering a dummy email
          const emailInput2 = await page.$('input[placeholder*="email" i], input[type="email"]');
          const confirmBtn2 = await page.$('button:has-text("CONFIRM")');

          if (emailInput2 && confirmBtn2) {
            console.log('\n=== TEST: Entering dummy email ===');
            await emailInput2.fill('testbot@example.com');
            await screenshot(page, 'bypass-05-email-entered');
            await confirmBtn2.click();
            await page.waitForTimeout(3000);
            await screenshot(page, 'bypass-06-after-confirm');

            const leaveBtn2 = await page.$('button:has-text("Leave")');
            const playerName2 = await page.$eval('.you-player .table-player-name', el => el.textContent).catch(() => null);

            console.log(`   Leave button: ${!!leaveBtn2}`);
            console.log(`   Player name: ${playerName2 || 'not found'}`);

            if (leaveBtn2 || playerName2) {
              console.log('\n✅ SUCCESS! Dummy email worked!');
            } else {
              console.log('\n❌ Dummy email did not work either.');
            }
          }
        }
      }
    } else {
      console.log('   No email dialog - checking if we joined directly...');
      const leaveBtn = await page.$('button:has-text("Leave")');
      const playerName = await page.$eval('.you-player .table-player-name', el => el.textContent).catch(() => null);

      if (leaveBtn || playerName) {
        console.log('\n✅ Joined without email verification!');
      } else {
        console.log('\n❓ Unclear state - check screenshot');
      }
    }

    await screenshot(page, 'bypass-final');

    console.log('\nKeeping browser open for 20 seconds...');
    await page.waitForTimeout(20000);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await screenshot(page, 'bypass-error');
  } finally {
    await browser.close();
  }
}

main();
