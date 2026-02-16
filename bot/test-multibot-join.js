/**
 * Test: Multi-bot join using Playwright contexts
 *
 * This test creates 2 isolated browser contexts and joins them both to the game.
 */

import { chromium } from 'playwright';

const GAME_URL = 'https://www.pokernow.com/games/pgl2wy20QIsPBt_NSZ5zQfL4X';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function joinBot(context, botName, stackSize = 1000) {
  console.log(`\n[${botName}] Creating page...`);
  const page = await context.newPage();

  console.log(`[${botName}] Navigating to game...`);
  await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  // Find and click an empty seat
  console.log(`[${botName}] Looking for empty seat...`);
  const seats = await page.$$('.table-player-seat:not(.taken)');
  console.log(`[${botName}] Found ${seats.length} available seats`);

  if (seats.length === 0) {
    // Try clicking any seat button
    const seatButtons = await page.$$('.table-player-seat button');
    if (seatButtons.length > 0) {
      await seatButtons[0].click();
    }
  } else {
    await seats[0].click();
  }

  await sleep(1000);

  // Fill in the join form
  console.log(`[${botName}] Filling join form...`);

  // Try to find and fill nickname
  const nicknameSelectors = [
    'input[placeholder*="ickname"]',
    'input[placeholder*="name"]',
    'input[type="text"]:first-of-type'
  ];

  for (const selector of nicknameSelectors) {
    try {
      const input = await page.$(selector);
      if (input) {
        await input.fill(botName);
        console.log(`[${botName}] Set nickname using: ${selector}`);
        break;
      }
    } catch (e) {}
  }

  // Try to find and fill stack
  const stackSelectors = [
    'input[type="number"]',
    'input[placeholder*="stack"]',
    'input[placeholder*="chip"]'
  ];

  for (const selector of stackSelectors) {
    try {
      const input = await page.$(selector);
      if (input) {
        await input.fill(String(stackSize));
        console.log(`[${botName}] Set stack using: ${selector}`);
        break;
      }
    } catch (e) {}
  }

  // Click join button
  console.log(`[${botName}] Clicking join button...`);
  const joinButton = await page.$('button:has-text("Take"), button:has-text("Join"), button:has-text("Sit")');
  if (joinButton) {
    await joinButton.click();
  }

  await sleep(2000);

  // Verify we joined
  const playerName = await page.$eval('.you-player .table-player-name', el => el.textContent).catch(() => null);
  console.log(`[${botName}] Joined as: ${playerName || 'unknown'}`);

  return page;
}

async function main() {
  console.log('=== Multi-Bot Join Test ===');
  console.log(`Game URL: ${GAME_URL}\n`);

  const browser = await chromium.launch({
    headless: false,  // Show browser for debugging
    args: ['--disable-blink-features=AutomationControlled']
  });

  try {
    // Create two isolated contexts
    console.log('Creating isolated browser contexts...');

    const context1 = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    });

    const context2 = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    });

    // Join bot 1
    const page1 = await joinBot(context1, 'TestBot1', 1000);

    // Wait a bit before joining bot 2
    await sleep(2000);

    // Join bot 2
    const page2 = await joinBot(context2, 'TestBot2', 1000);

    console.log('\n=== RESULTS ===');
    console.log('Both bots attempted to join.');
    console.log('Check the browser windows to verify.');
    console.log('\nPress Ctrl+C to exit...');

    // Keep browsers open for inspection
    await new Promise(() => {});  // Wait forever

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
