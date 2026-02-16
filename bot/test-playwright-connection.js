/**
 * Test: Can Playwright connect to PokerNow as a player?
 *
 * This test determines if PokerNow blocks headless/automated browsers
 * for player sessions (separate from the reCAPTCHA on game creation)
 */

import { chromium } from 'playwright';

const GAME_URL = 'https://www.pokernow.com/games/pgl2wy20QIsPBt_NSZ5zQfL4X';

async function testPlaywrightConnection() {
  console.log('=== PokerNow Playwright Connection Test ===\n');

  const results = {
    browserLaunch: false,
    pageLoad: false,
    gamePageReached: false,
    joinFormVisible: false,
    canInteract: false,
    blockedReason: null,
    detectionSignals: []
  };

  let browser, context, page;

  try {
    // Test 1: Can we launch a browser?
    console.log('1. Launching Playwright browser...');
    browser = await chromium.launch({
      headless: false,  // Start with headful for debugging
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ]
    });
    results.browserLaunch = true;
    console.log('   ✓ Browser launched successfully\n');

    // Test 2: Can we create a context and page?
    console.log('2. Creating browser context...');
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });
    page = await context.newPage();
    console.log('   ✓ Context and page created\n');

    // Test 3: Can we navigate to PokerNow?
    console.log('3. Navigating to PokerNow game...');
    console.log(`   URL: ${GAME_URL}`);

    const response = await page.goto(GAME_URL, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    results.pageLoad = true;
    console.log(`   ✓ Page loaded (status: ${response.status()})\n`);

    // Test 4: Check for blocking/detection
    console.log('4. Checking for bot detection...');

    // Check for common blocking indicators
    const pageContent = await page.content();
    const pageTitle = await page.title();

    // Look for signs of blocking
    const blockingIndicators = [
      { pattern: /captcha/i, name: 'CAPTCHA' },
      { pattern: /blocked/i, name: 'Blocked message' },
      { pattern: /access denied/i, name: 'Access denied' },
      { pattern: /cloudflare/i, name: 'Cloudflare challenge' },
      { pattern: /please verify/i, name: 'Verification required' },
      { pattern: /unusual traffic/i, name: 'Traffic detection' },
      { pattern: /robot/i, name: 'Robot detection' }
    ];

    for (const indicator of blockingIndicators) {
      if (indicator.pattern.test(pageContent)) {
        results.detectionSignals.push(indicator.name);
      }
    }

    if (results.detectionSignals.length > 0) {
      console.log(`   ⚠ Detection signals found: ${results.detectionSignals.join(', ')}\n`);
    } else {
      console.log('   ✓ No obvious bot detection triggered\n');
    }

    // Test 5: Can we see the game page elements?
    console.log('5. Checking for game page elements...');

    // Wait a moment for dynamic content
    await page.waitForTimeout(2000);

    // Check for poker table elements
    const tableExists = await page.$('.table-poker, .poker-table, [class*="table"]');
    const nicknameInput = await page.$('input[placeholder*="ickname"], input[name="nickname"]');
    const joinButton = await page.$('button:has-text("Take"), button:has-text("Join"), button:has-text("Sit")');
    const seatButtons = await page.$$('.table-player-seat button, [class*="seat"] button');

    if (tableExists) {
      results.gamePageReached = true;
      console.log('   ✓ Poker table detected');
    } else {
      console.log('   ✗ No poker table found');
    }

    if (nicknameInput || joinButton || seatButtons.length > 0) {
      results.joinFormVisible = true;
      console.log(`   ✓ Join elements found (inputs: ${nicknameInput ? 'yes' : 'no'}, buttons: ${joinButton ? 'yes' : 'no'}, seats: ${seatButtons.length})`);
    } else {
      console.log('   ✗ No join elements found');
    }

    // Test 6: Can we interact with the page?
    console.log('\n6. Testing interaction capability...');

    // Try to find and click on a seat
    if (seatButtons.length > 0) {
      try {
        await seatButtons[0].click();
        await page.waitForTimeout(1000);

        // Check if a form appeared
        const formAppeared = await page.$('input[placeholder*="ickname"], input[type="text"]');
        if (formAppeared) {
          results.canInteract = true;
          console.log('   ✓ Clicked seat, form appeared - interaction works!');
        } else {
          console.log('   ~ Clicked seat, but no form appeared');
        }
      } catch (e) {
        console.log(`   ✗ Click failed: ${e.message}`);
      }
    } else {
      // Try clicking on the table area
      try {
        await page.click('.poker-table, .table-poker', { timeout: 2000 });
        console.log('   ~ Clicked on table area');
      } catch (e) {
        console.log('   ✗ Could not click table');
      }
    }

    // Take screenshot for verification
    console.log('\n7. Taking screenshot...');
    await page.screenshot({ path: '/tmp/pokernow-playwright-test.png', fullPage: true });
    console.log('   Screenshot saved to /tmp/pokernow-playwright-test.png\n');

    // Summary
    console.log('=== TEST RESULTS ===');
    console.log(`Browser Launch:     ${results.browserLaunch ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Page Load:          ${results.pageLoad ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Game Page Reached:  ${results.gamePageReached ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Join Form Visible:  ${results.joinFormVisible ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Can Interact:       ${results.canInteract ? '✓ PASS' : '? UNCERTAIN'}`);
    console.log(`Detection Signals:  ${results.detectionSignals.length === 0 ? 'None' : results.detectionSignals.join(', ')}`);

    // Conclusion
    console.log('\n=== CONCLUSION ===');
    if (results.pageLoad && results.gamePageReached && results.detectionSignals.length === 0) {
      console.log('✓ PLAYWRIGHT CAN CONNECT TO POKERNOW');
      console.log('  Multi-bot testing with Playwright contexts is viable!');
      return { success: true, results };
    } else if (results.detectionSignals.length > 0) {
      console.log('⚠ BOT DETECTION TRIGGERED');
      console.log('  May need stealth plugins or alternative approach');
      return { success: false, reason: 'detection', results };
    } else {
      console.log('? INCONCLUSIVE');
      console.log('  Page loaded but game elements not found');
      return { success: false, reason: 'unknown', results };
    }

  } catch (error) {
    console.error('\n✗ TEST FAILED:', error.message);
    results.blockedReason = error.message;
    return { success: false, reason: 'error', error: error.message, results };

  } finally {
    // Keep browser open for manual inspection
    console.log('\nBrowser will close in 10 seconds for manual inspection...');
    await new Promise(r => setTimeout(r, 10000));

    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
testPlaywrightConnection()
  .then(result => {
    console.log('\nFinal result:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
