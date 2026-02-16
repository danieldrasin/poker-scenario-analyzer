/**
 * PlaywrightBotJoiner - Join bots to PokerNow game
 *
 * Discovered workflow:
 * 1. Click seat → Fill nickname/stack → Click REQUEST THE SEAT
 * 2. Cancel email dialog (bypasses verification)
 * 3. Wait for owner approval (auto if "do not show this again" checked)
 * 4. Bot is seated!
 */

import { chromium } from 'playwright';

export class PlaywrightBotJoiner {
  constructor(gameUrl, options = {}) {
    this.gameUrl = gameUrl;
    this.options = {
      headless: options.headless ?? false,
      stackSize: options.stackSize ?? 1000,
      verbose: options.verbose ?? true,
      ...options
    };

    this.browser = null;
    this.bots = [];
  }

  log(msg) {
    if (this.options.verbose) {
      console.log(`[BotJoiner] ${msg}`);
    }
  }

  async initialize() {
    this.log('Launching browser...');
    this.browser = await chromium.launch({
      headless: this.options.headless,
      args: ['--disable-blink-features=AutomationControlled']
    });
    this.log('Browser ready');
  }

  async joinBot(botName) {
    this.log(`Creating bot: ${botName}`);

    // Create isolated context
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    const bot = { name: botName, context, page, isSeated: false };

    try {
      // Step 1: Navigate
      this.log(`${botName}: Navigating to game...`);
      await page.goto(this.gameUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Step 1.5: Dismiss any overlays/alerts/cookie notices
      this.log(`${botName}: Dismissing overlays...`);
      const dismissSelectors = [
        'button:has-text("Got it")',
        'button:has-text("Accept")',
        'button:has-text("OK")',
        'button:has-text("Close")',
        '.alert-1-container button',
        '[class*="cookie"] button',
        '[class*="consent"] button'
      ];

      for (const selector of dismissSelectors) {
        try {
          const btn = await page.$(selector);
          if (btn) {
            await btn.click({ timeout: 2000 });
            this.log(`${botName}: Dismissed overlay using: ${selector}`);
            await page.waitForTimeout(500);
          }
        } catch (e) {
          // Ignore click errors
        }
      }

      // Step 2: Click a seat - try multiple selectors
      this.log(`${botName}: Looking for empty seat...`);
      
      // Try different selectors for empty seats
      const seatSelectors = [
        '.table-player-seat.empty',
        '.table-player-seat:not(.taken)',
        '.table-player-seat-open',
        '[class*="seat"]:not([class*="taken"])',
        '.seat-number'  // The numbered empty seats
      ];
      
      let seatClicked = false;
      for (const selector of seatSelectors) {
        const seat = await page.$(selector);
        if (seat) {
          this.log(`${botName}: Found seat with selector: ${selector}`);
          await seat.click({ force: true });
          seatClicked = true;
          break;
        }
      }
      
      // If no selector worked, try clicking on the table center area where seats usually are
      if (!seatClicked) {
        this.log(`${botName}: No seat found with selectors, trying table click...`);
        // Click on the left side of the table where empty seats typically are
        await page.click('.table-felt', { position: { x: 100, y: 300 }, force: true }).catch(() => {});
      }
      
      await page.waitForTimeout(2000);
      
      // Check if a seat request form appeared
      let nameInput = await page.$('input[placeholder="Your Name"]');
      
      // If form didn't appear, try clicking on visible seat numbers
      if (!nameInput) {
        this.log(`${botName}: Form not found, trying seat numbers...`);
        // Look for elements that look like seat numbers (1-10)
        for (let i = 1; i <= 10; i++) {
          const seatNum = await page.$(`text="${i}"`);
          if (seatNum) {
            // Check if it's an empty seat (not a player)
            const parent = await seatNum.evaluateHandle(el => el.closest('.table-player-seat, .seat-container'));
            if (parent) {
              await seatNum.click({ force: true });
              this.log(`${botName}: Clicked seat number ${i}`);
              await page.waitForTimeout(1500);
              nameInput = await page.$('input[placeholder="Your Name"]');
              if (nameInput) break;
            }
          }
        }
      }

      // Step 3: Fill form
      this.log(`${botName}: Filling form...`);
      nameInput = await page.$('input[placeholder="Your Name"]');
      const stackInput = await page.$('input[placeholder="Intended Stack"]');

      if (nameInput) {
        await nameInput.fill(botName);
        this.log(`${botName}: Filled name`);
      } else {
        this.log(`${botName}: WARNING - Name input not found!`);
      }
      
      if (stackInput) {
        await stackInput.fill(String(this.options.stackSize));
        this.log(`${botName}: Filled stack`);
      } else {
        this.log(`${botName}: WARNING - Stack input not found!`);
      }

      // Step 4: Click REQUEST THE SEAT
      this.log(`${botName}: Requesting seat...`);

      // Try multiple selectors for the request button
      const requestSelectors = [
        'button:has-text("REQUEST THE SEAT")',
        'button:has-text("Request the seat")',
        'button:has-text("Request")',
        '.request-seat-button',
        'button[class*="request"]',
        'button[class*="join"]'
      ];

      let requestBtn = null;
      for (const selector of requestSelectors) {
        requestBtn = await page.$(selector);
        if (requestBtn) {
          this.log(`${botName}: Found request button with: ${selector}`);
          break;
        }
      }

      if (requestBtn) {
        try {
          await requestBtn.click({ force: true, timeout: 5000 });
          this.log(`${botName}: Clicked request button`);
        } catch (e) {
          this.log(`${botName}: Request button click failed: ${e.message}`);
          // Try dismissing overlays again
          const gotIt = await page.$('button:has-text("Got it")');
          if (gotIt) await gotIt.click();
          await page.waitForTimeout(500);
          await requestBtn.click({ force: true }).catch(() => {});
        }
      } else {
        this.log(`${botName}: WARNING - Request button NOT FOUND!`);
        // Try screenshot for debugging
        const buttons = await page.$$eval('button', els => els.map(e => e.textContent?.trim()));
        this.log(`${botName}: Available buttons: ${buttons.slice(0, 5).join(', ')}`);
      }
      await page.waitForTimeout(2000);

      // Step 5: Handle email dialog - try to skip without cancelling seat request
      this.log(`${botName}: Handling email dialog...`);

      // First dismiss any blocking alerts (but NOT the email dialog's cancel)
      try {
        const alertContainer = await page.$('.alert-1-container');
        if (alertContainer) {
          const alertBtn = await alertContainer.$('button');
          if (alertBtn) {
            const btnText = await alertBtn.textContent();
            // Only click if it's "Got it" or similar, NOT "CANCEL"
            if (btnText && !btnText.toUpperCase().includes('CANCEL')) {
              await alertBtn.click({ force: true, timeout: 2000 });
              this.log(`${botName}: Dismissed alert: ${btnText}`);
            }
            await page.waitForTimeout(500);
          }
        }
      } catch (e) { /* ignore */ }

      // Try pressing Escape to close email dialog without cancelling
      // IMPORTANT: Don't click CANCEL as it cancels the seat request!
      this.log(`${botName}: Pressing Escape to skip email dialog...`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1500);

      // Check if we need to try again
      const emailDialog = await page.$('.email-dialog, [class*="email"], input[type="email"]');
      if (emailDialog) {
        this.log(`${botName}: Email dialog still present, pressing Escape again...`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }

      // Step 6: Check status
      const waitingMsg = await page.$('text=Wait for the owner approval');
      const seated = await page.$('.you-player');

      if (waitingMsg) {
        this.log(`${botName}: Waiting for owner approval...`);
        bot.status = 'pending_approval';
      } else if (seated) {
        this.log(`${botName}: Seated successfully!`);
        bot.isSeated = true;
        bot.status = 'seated';
      } else {
        this.log(`${botName}: Unknown status`);
        bot.status = 'unknown';
      }

      this.bots.push(bot);
      return bot;

    } catch (error) {
      this.log(`${botName}: Error - ${error.message}`);
      bot.error = error.message;
      this.bots.push(bot);
      return bot;
    }
  }

  async waitForApproval(bot, timeoutMs = 60000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      // Check if we're now seated
      const seated = await bot.page.$('.you-player .table-player-name');
      if (seated) {
        const name = await seated.textContent();
        this.log(`${bot.name}: Approved! Seated as ${name}`);
        bot.isSeated = true;
        bot.status = 'seated';
        return true;
      }

      // Check for rejection
      const rejected = await bot.page.$('text=rejected');
      if (rejected) {
        this.log(`${bot.name}: Rejected by owner`);
        bot.status = 'rejected';
        return false;
      }

      await bot.page.waitForTimeout(2000);
    }

    this.log(`${bot.name}: Approval timeout`);
    return false;
  }

  async keepAlive() {
    // Keep bots alive by periodically checking status
    this.log('Keeping bots alive. Press Ctrl+C to stop.');

    while (true) {
      for (const bot of this.bots) {
        if (bot.isSeated) {
          // Check if it's our turn
          const actionButtons = await bot.page.$('button.fold, button.check, button.call');
          if (actionButtons) {
            this.log(`${bot.name}: Action required!`);
            // For now, just log - later we'll integrate with Play Advisor
          }
        }
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  async cleanup() {
    this.log('Cleaning up bots...');
    for (const bot of this.bots) {
      try {
        this.log(`Closing ${bot.name}...`);
        await bot.context.close();
      } catch (e) {
        this.log(`Error closing ${bot.name}: ${e.message}`);
      }
    }
    this.bots = [];
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.log('All bots cleaned up');
  }

  /**
   * Gracefully leave seat and close a specific bot
   */
  async removeBot(botName) {
    const botIndex = this.bots.findIndex(b => b.name === botName);
    if (botIndex === -1) {
      this.log(`Bot ${botName} not found`);
      return false;
    }

    const bot = this.bots[botIndex];
    try {
      // Try to click "Leave Seat" button if present
      const leaveBtn = await bot.page.$('button:has-text("Leave Seat"), .leave-seat-btn');
      if (leaveBtn) {
        await leaveBtn.click();
        this.log(`${botName}: Left seat gracefully`);
        await bot.page.waitForTimeout(1000);
      }
    } catch (e) {
      // Ignore leave errors
    }

    try {
      await bot.context.close();
      this.bots.splice(botIndex, 1);
      this.log(`${botName}: Removed`);
      return true;
    } catch (e) {
      this.log(`Error removing ${botName}: ${e.message}`);
      return false;
    }
  }

  /**
   * Get list of active bots and their status
   */
  getBotStatus() {
    return this.bots.map(bot => ({
      name: bot.name,
      status: bot.status,
      isSeated: bot.isSeated,
      error: bot.error || null
    }));
  }

  /**
   * Check if browser is still running
   */
  isRunning() {
    return this.browser !== null && this.browser.isConnected();
  }
}

// CLI entry point
async function main() {
  const gameUrl = process.argv[2] || 'https://www.pokernow.com/games/pgl2wy20QIsPBt_NSZ5zQfL4X';
  const numBots = parseInt(process.argv[3]) || 2;

  console.log('=== Playwright Bot Joiner ===');
  console.log(`Game: ${gameUrl}`);
  console.log(`Bots: ${numBots}\n`);

  const joiner = new PlaywrightBotJoiner(gameUrl, {
    headless: false,
    verbose: true
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await joiner.cleanup();
    process.exit(0);
  });

  try {
    await joiner.initialize();

    // Join bots
    for (let i = 1; i <= numBots; i++) {
      const botName = `Bot${i}`;
      await joiner.joinBot(botName);
      await new Promise(r => setTimeout(r, 1000)); // Delay between joins
    }

    console.log('\n=== Bots Status ===');
    for (const bot of joiner.bots) {
      console.log(`${bot.name}: ${bot.status}`);
    }

    console.log('\nWaiting for owner approval...');
    console.log('(Approve bots in the owner browser, then game will start)');
    console.log('Press Ctrl+C to exit.\n');

    await joiner.keepAlive();

  } catch (error) {
    console.error('Error:', error);
    await joiner.cleanup();
  }
}

export default PlaywrightBotJoiner;

/**
 * OwnerAutomation - Automated owner role for unattended testing
 * 
 * Handles:
 * - Monitoring for pending player approvals
 * - Auto-approving bots
 * - Starting the game when enough players are seated
 */
export class OwnerAutomation {
  constructor(gameUrl, options = {}) {
    this.gameUrl = gameUrl;
    this.options = {
      headless: options.headless ?? false,
      verbose: options.verbose ?? true,
      minPlayers: options.minPlayers ?? 2,
      autoStart: options.autoStart ?? true,
      ...options
    };

    this.browser = null;
    this.context = null;
    this.page = null;
    this.isRunning = false;
    this.approvalCount = 0;
  }

  log(msg) {
    if (this.options.verbose) {
      console.log(`[OwnerBot] ${msg}`);
    }
  }

  async initialize() {
    this.log('Launching owner browser...');
    this.browser = await chromium.launch({
      headless: this.options.headless,
      args: ['--disable-blink-features=AutomationControlled']
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    });

    this.page = await this.context.newPage();
    this.log('Owner browser ready');
  }

  async joinAsOwner() {
    // If gameUrl is provided, try to join as owner
    // Otherwise, create a new game
    if (this.gameUrl && this.gameUrl.includes('/games/')) {
      this.log('Navigating to existing game...');
      await this.page.goto(this.gameUrl, { waitUntil: 'networkidle', timeout: 30000 });
    } else {
      // Create a new game
      this.log('Creating new game...');
      await this.page.goto('https://www.pokernow.com/', { waitUntil: 'networkidle', timeout: 30000 });
      await this.page.waitForTimeout(2000);

      // Dismiss any initial overlays
      const gotIt = await this.page.$('button:has-text("Got it")');
      if (gotIt) await gotIt.click().catch(() => {});
      await this.page.waitForTimeout(500);

      // Click "Create Game" link
      this.log('Looking for Create Game link...');
      const createLink = await this.page.$('a[href*="start"], a:has-text("Create"), button:has-text("Create")');
      if (createLink) {
        await createLink.click();
        this.log('Clicked Create Game');
        await this.page.waitForTimeout(3000);
      }

      // Check if we're on the game creation page
      const currentUrl = this.page.url();
      this.log(`Current URL after create: ${currentUrl}`);

      // If we're on the start-game page, fill the form
      if (currentUrl.includes('start-game') || currentUrl.includes('start') || currentUrl.includes('create')) {
        // Fill in the nickname field
        this.log('Filling in owner nickname...');
        const nicknameInput = await this.page.$('input[placeholder*="Nickname"], input[type="text"]');
        if (nicknameInput) {
          await nicknameInput.click();
          await nicknameInput.fill('GameOwner');
          this.log('Entered nickname: GameOwner');
          await this.page.waitForTimeout(500);
        } else {
          this.log('WARNING: Nickname field not found');
        }

        // Look for the CREATE GAME button and click with navigation wait
        const createBtn = await this.page.$('button:has-text("CREATE GAME"), button:has-text("Create Game"), button[type="submit"]');
        if (createBtn) {
          this.log('Clicking CREATE GAME button and waiting for navigation...');
          // Click and wait for navigation simultaneously
          await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
            createBtn.click()
          ]);
          this.log('Navigation completed or timed out');
        } else {
          this.log('WARNING: CREATE GAME button not found');
        }
      }

      // Poll for redirect to game page (more reliable than waitForURL)
      this.log('Waiting for redirect to game URL...');
      const maxWait = 15000;
      const startWait = Date.now();
      while (Date.now() - startWait < maxWait) {
        const currentUrl = this.page.url();
        if (currentUrl.includes('/games/')) {
          this.gameUrl = currentUrl;
          this.log(`Created new game: ${this.gameUrl}`);
          break;
        }
        await this.page.waitForTimeout(500);
      }

      if (!this.gameUrl || !this.gameUrl.includes('/games/')) {
        this.gameUrl = this.page.url();
        this.log(`Final URL: ${this.gameUrl}`);
        if (!this.gameUrl.includes('/games/')) {
          this.log('ERROR: Failed to create game - URL does not contain /games/');
          throw new Error('Failed to create new game');
        }
      }
    }

    await this.page.waitForTimeout(2000);

    // Dismiss any overlays
    const dismissSelectors = [
      'button:has-text("Got it")',
      'button:has-text("Accept")',
      'button:has-text("OK")',
      '.alert-1-container button'
    ];

    for (const selector of dismissSelectors) {
      try {
        const btn = await this.page.$(selector);
        if (btn) {
          await btn.click({ timeout: 2000 });
          this.log(`Dismissed overlay: ${selector}`);
          await this.page.waitForTimeout(500);
        }
      } catch (e) {}
    }

    // Check if we have owner privileges
    const startBtn = await this.page.$('button:has-text("START GAME")');
    if (startBtn) {
      this.log('Owner privileges confirmed (START GAME visible)');
      return true;
    }
    
    // Also check for SHUFFLE SEATS as owner indicator
    const shuffleBtn = await this.page.$('button:has-text("SHUFFLE SEATS")');
    if (shuffleBtn) {
      this.log('Owner privileges confirmed (SHUFFLE SEATS visible)');
      return true;
    }

    this.log('WARNING: May not have owner privileges');
    return true;
  }

  getGameUrl() {
    return this.gameUrl;
  }

  /**
   * Start the approval monitoring loop
   */
  async startApprovalLoop(expectedBots = 2, timeoutMs = 180000) {
    this.isRunning = true;
    const startTime = Date.now();
    let lastCheck = 0;
    const CHECK_INTERVAL = 2000;

    this.log(`Starting approval loop (expecting ${expectedBots} bots, timeout ${timeoutMs/1000}s)...`);

    while (this.isRunning && Date.now() - startTime < timeoutMs) {
      if (Date.now() - lastCheck < CHECK_INTERVAL) {
        await this.sleep(500);
        continue;
      }
      lastCheck = Date.now();

      try {
        // Check for pending approvals by looking for APPROVE buttons
        const approveButtons = await this.page.$$('button:has-text("APPROVE")');
        
        if (approveButtons.length > 0) {
          this.log(`Found ${approveButtons.length} pending approval(s)`);
          
          for (const btn of approveButtons) {
            try {
              await btn.click({ timeout: 3000 });
              this.log('Clicked APPROVE');
              await this.page.waitForTimeout(500);

              // Click APPROVE PLAYER in the dialog
              const approvePlayerBtn = await this.page.$('button:has-text("APPROVE PLAYER")');
              if (approvePlayerBtn) {
                await approvePlayerBtn.click({ timeout: 3000 });
                this.log('Clicked APPROVE PLAYER');
                this.approvalCount++;
                await this.page.waitForTimeout(500);

                // Dismiss OK dialog
                const okBtn = await this.page.$('button:has-text("Ok")');
                if (okBtn) {
                  await okBtn.click({ timeout: 2000 });
                  await this.page.waitForTimeout(300);
                }
              }
            } catch (e) {
              this.log(`Approval click error: ${e.message}`);
            }
          }
        }

        // Check if we have enough approved players
        if (this.approvalCount >= expectedBots) {
          this.log(`All ${expectedBots} bots approved!`);
          
          // Auto-start if enabled
          if (this.options.autoStart) {
            await this.sleep(2000); // Wait for UI to settle
            await this.startGame();
          }
          
          return true;
        }

      } catch (e) {
        this.log(`Approval loop error: ${e.message}`);
      }
    }

    if (Date.now() - startTime >= timeoutMs) {
      this.log('Approval timeout reached');
    }

    return this.approvalCount >= expectedBots;
  }

  /**
   * Click START GAME button
   */
  async startGame() {
    this.log('Attempting to start game...');

    try {
      // Go back to main view if in settings
      const backBtn = await this.page.$('text="« BACK"');
      if (backBtn) {
        await backBtn.click();
        await this.page.waitForTimeout(1000);
      }

      // Look for START GAME button
      const startBtn = await this.page.$('button:has-text("START GAME")');
      if (startBtn) {
        await startBtn.click({ timeout: 5000 });
        this.log('Clicked START GAME');
        await this.page.waitForTimeout(2000);
        return true;
      } else {
        this.log('START GAME button not found');
        return false;
      }
    } catch (e) {
      this.log(`Start game error: ${e.message}`);
      return false;
    }
  }

  /**
   * Keep the owner session alive and handle any needed clicks
   */
  async keepAlive() {
    while (this.isRunning) {
      try {
        // Handle any disconnection warnings
        const reconnect = await this.page.$('text="click here"');
        if (reconnect) {
          await reconnect.click();
          this.log('Reconnected');
        }

        // Handle any popups
        const okBtn = await this.page.$('.alert-1-container button:has-text("Ok")');
        if (okBtn) {
          await okBtn.click();
        }

      } catch (e) {}

      await this.sleep(5000);
    }
  }

  stop() {
    this.isRunning = false;
  }

  async cleanup() {
    this.isRunning = false;
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    this.log('Owner browser closed');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
