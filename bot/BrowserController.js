/**
 * Browser Controller
 *
 * Manages Puppeteer browser instance for PokerNow automation
 */

import puppeteer from 'puppeteer-core';
import { config } from './config.js';

export class BrowserController {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isConnected = false;
  }

  /**
   * Launch browser and create page
   */
  async launch() {
    if (this.browser) {
      console.log('Browser already running');
      return;
    }

    console.log('Launching browser...');
    console.log('Chrome path:', config.browser.executablePath);

    try {
      this.browser = await puppeteer.launch({
        executablePath: config.browser.executablePath,
        headless: config.browser.headless,
        defaultViewport: config.browser.defaultViewport,
        args: config.browser.args
      });

      this.page = await this.browser.newPage();

      // Set up page event handlers
      this.page.on('console', msg => {
        if (config.behavior.verbose) {
          console.log('Browser console:', msg.text());
        }
      });

      this.page.on('pageerror', error => {
        console.error('Page error:', error.message);
      });

      this.page.on('disconnect', () => {
        console.log('Page disconnected');
        this.isConnected = false;
      });

      this.isConnected = true;
      console.log('Browser launched successfully');

    } catch (error) {
      console.error('Failed to launch browser:', error.message);
      throw error;
    }
  }

  /**
   * Navigate to a PokerNow table
   */
  async navigateToTable(tableUrl) {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    console.log('Navigating to table:', tableUrl);

    try {
      await this.page.goto(tableUrl, {
        waitUntil: 'networkidle2',
        timeout: config.timing.pageLoadTimeout
      });

      // Wait for the game table to load
      await this.page.waitForSelector('.table-player', {
        timeout: config.timing.pageLoadTimeout
      });

      console.log('Table loaded successfully');
      return true;

    } catch (error) {
      console.error('Failed to navigate to table:', error.message);
      return false;
    }
  }

  /**
   * Check if it's our turn to act
   * Verified selector from pokernow-bot: .action-signal indicates it's our turn
   */
  async isOurTurn() {
    if (!this.page) return false;

    try {
      // Primary check: look for .action-signal on our player (verified from pokernow-bot)
      const hasActionSignal = await this.page.evaluate(() => {
        // Check if there's an action-signal element visible
        const actionSignal = document.querySelector('.you-player .action-signal');
        if (actionSignal) {
          const style = window.getComputedStyle(actionSignal);
          return style.display !== 'none' &&
                 style.visibility !== 'hidden';
        }

        // Fallback: check if action buttons are present and visible
        const foldButton = document.querySelector('button.fold');
        const checkButton = document.querySelector('button.check');
        const callButton = document.querySelector('button.call');

        // If any action button exists and is visible, it's our turn
        const anyButton = foldButton || checkButton || callButton;
        if (anyButton) {
          const style = window.getComputedStyle(anyButton);
          return style.display !== 'none' &&
                 style.visibility !== 'hidden' &&
                 style.opacity !== '0';
        }

        return false;
      });

      return hasActionSignal;

    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for our turn with polling
   */
  async waitForTurn(timeout = 60000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this.isOurTurn()) {
        return true;
      }
      await this.sleep(config.timing.turnCheckInterval);
    }

    return false;
  }

  /**
   * Get raw page content for parsing
   */
  async getPageContent() {
    if (!this.page) return null;

    try {
      return await this.page.content();
    } catch (error) {
      console.error('Failed to get page content:', error.message);
      return null;
    }
  }

  /**
   * Execute JavaScript in page context
   */
  async evaluate(fn, ...args) {
    if (!this.page) return null;

    try {
      return await this.page.evaluate(fn, ...args);
    } catch (error) {
      console.error('Evaluate failed:', error.message);
      return null;
    }
  }

  /**
   * Click an element
   */
  async click(selector) {
    if (!this.page) return false;

    try {
      await this.page.waitForSelector(selector, { timeout: 5000 });
      await this.page.click(selector);
      return true;
    } catch (error) {
      console.error(`Click failed for ${selector}:`, error.message);
      return false;
    }
  }

  /**
   * Type into an input field
   */
  async type(selector, text) {
    if (!this.page) return false;

    try {
      await this.page.waitForSelector(selector, { timeout: 5000 });
      await this.page.click(selector, { clickCount: 3 }); // Select all
      await this.page.type(selector, text);
      return true;
    } catch (error) {
      console.error(`Type failed for ${selector}:`, error.message);
      return false;
    }
  }

  /**
   * Take a screenshot for debugging
   */
  async screenshot(filename = 'debug.png') {
    if (!this.page) return false;

    try {
      await this.page.screenshot({ path: filename, fullPage: true });
      console.log(`Screenshot saved: ${filename}`);
      return true;
    } catch (error) {
      console.error('Screenshot failed:', error.message);
      return false;
    }
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      console.log('Closing browser...');
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isConnected = false;
    }
  }

  /**
   * Utility: sleep for ms
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add random delay for human-like behavior
   */
  async randomDelay() {
    const { min, max } = config.timing.actionDelay;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.sleep(delay);
  }
}

export default BrowserController;
