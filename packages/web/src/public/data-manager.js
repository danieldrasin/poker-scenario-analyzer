/**
 * Tiered Data Manager for Poker Simulator
 *
 * Tier 1: Bundled with app (Vercel /public) - instant access
 * Tier 2: Remote storage (Cloudflare R2) - downloaded on demand, cached locally
 * Tier 3: User-generated simulations - stored in IndexedDB
 */

const DataManager = {
  // Configuration
  config: {
    tier2BaseUrl: '', // Set to Cloudflare R2 URL when deployed
    dbName: 'poker-simulator-data',
    dbVersion: 1,
    stores: {
      tier2Cache: 'tier2-cache',
      userSims: 'user-simulations',
      metadata: 'metadata'
    }
  },

  db: null,

  // ============ INITIALIZATION ============

  async init() {
    try {
      this.db = await this.openDatabase();
      console.log('DataManager initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize DataManager:', error);
      return false;
    }
  },

  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, this.config.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store for cached Tier 2 data
        if (!db.objectStoreNames.contains(this.config.stores.tier2Cache)) {
          const tier2Store = db.createObjectStore(this.config.stores.tier2Cache, { keyPath: 'id' });
          tier2Store.createIndex('variant', 'variant', { unique: false });
          tier2Store.createIndex('downloadedAt', 'downloadedAt', { unique: false });
        }

        // Store for user-generated simulations
        if (!db.objectStoreNames.contains(this.config.stores.userSims)) {
          const userStore = db.createObjectStore(this.config.stores.userSims, { keyPath: 'id' });
          userStore.createIndex('variant', 'variant', { unique: false });
          userStore.createIndex('createdAt', 'createdAt', { unique: false });
          userStore.createIndex('playerCount', 'playerCount', { unique: false });
        }

        // Store for metadata (version info, last sync, etc.)
        if (!db.objectStoreNames.contains(this.config.stores.metadata)) {
          db.createObjectStore(this.config.stores.metadata, { keyPath: 'key' });
        }
      };
    });
  },

  // ============ TIER 1: BUNDLED DATA ============

  /**
   * Load Tier 1 data (bundled with app)
   * These files are in /public/data/tier1/ and load instantly
   */
  async loadTier1Data(variant = 'omaha4') {
    const variantMap = {
      'omaha4': 'plo4',
      'omaha5': 'plo5',
      'omaha6': 'plo6'
    };

    const filename = variantMap[variant] || 'plo4';

    try {
      const response = await fetch(`/data/tier1/${filename}-base.json`);
      if (!response.ok) {
        throw new Error(`Failed to load Tier 1 data: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn(`Tier 1 data not found for ${variant}, returning null`);
      return null;
    }
  },

  /**
   * Get all available Tier 1 configurations
   */
  async getTier1Manifest() {
    try {
      const response = await fetch('/data/tier1/manifest.json');
      return await response.json();
    } catch {
      // Return default manifest if not found
      return {
        variants: ['omaha4', 'omaha5', 'omaha6'],
        playerCounts: [2, 3, 4, 5, 6, 7, 8, 9, 10],
        iterationsPerConfig: 100000,
        generatedAt: null
      };
    }
  },

  // ============ TIER 2: REMOTE DATA (CLOUDFLARE R2) ============

  /**
   * Load Tier 2 data - checks cache first, downloads if needed
   */
  async loadTier2Data(dataType, variant = 'omaha4') {
    const cacheKey = `${variant}-${dataType}`;

    // Check local cache first
    const cached = await this.getCachedTier2(cacheKey);
    if (cached) {
      console.log(`Tier 2 cache hit: ${cacheKey}`);
      return cached.data;
    }

    // Download from R2
    console.log(`Downloading Tier 2 data: ${cacheKey}`);
    const data = await this.downloadTier2(dataType, variant);

    if (data) {
      // Cache locally
      await this.cacheTier2(cacheKey, variant, data);
    }

    return data;
  },

  async downloadTier2(dataType, variant) {
    if (!this.config.tier2BaseUrl) {
      console.warn('Tier 2 base URL not configured');
      return null;
    }

    const variantMap = {
      'omaha4': 'plo4',
      'omaha5': 'plo5',
      'omaha6': 'plo6'
    };

    const filename = `${variantMap[variant] || 'plo4'}-${dataType}.json`;

    try {
      const response = await fetch(`${this.config.tier2BaseUrl}/tier2/${filename}`);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Failed to download Tier 2 data: ${error.message}`);
      return null;
    }
  },

  async getCachedTier2(key) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.config.stores.tier2Cache, 'readonly');
      const store = tx.objectStore(this.config.stores.tier2Cache);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  },

  async cacheTier2(key, variant, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.config.stores.tier2Cache, 'readwrite');
      const store = tx.objectStore(this.config.stores.tier2Cache);

      const record = {
        id: key,
        variant,
        data,
        downloadedAt: new Date().toISOString(),
        sizeBytes: JSON.stringify(data).length
      };

      const request = store.put(record);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Check if Tier 2 data is available (either cached or remote)
   */
  async isTier2Available(dataType, variant = 'omaha4') {
    const cacheKey = `${variant}-${dataType}`;
    const cached = await this.getCachedTier2(cacheKey);
    return !!cached;
  },

  /**
   * Get Tier 2 cache status
   */
  async getTier2CacheStatus() {
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.config.stores.tier2Cache, 'readonly');
      const store = tx.objectStore(this.config.stores.tier2Cache);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result || [];
        const totalSize = items.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);

        resolve({
          count: items.length,
          totalSizeBytes: totalSize,
          totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
          items: items.map(i => ({
            id: i.id,
            variant: i.variant,
            downloadedAt: i.downloadedAt,
            sizeMB: (i.sizeBytes / 1024 / 1024).toFixed(2)
          }))
        });
      };
      request.onerror = () => resolve({ count: 0, totalSizeBytes: 0, items: [] });
    });
  },

  // ============ TIER 3: USER-GENERATED SIMULATIONS ============

  /**
   * Save a user-generated simulation
   */
  async saveUserSimulation(simulationResult) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.config.stores.userSims, 'readwrite');
      const store = tx.objectStore(this.config.stores.userSims);

      const record = {
        id: simulationResult.metadata.id,
        variant: simulationResult.metadata.config.gameVariant,
        playerCount: simulationResult.metadata.config.playerCount,
        iterations: simulationResult.metadata.config.iterations,
        createdAt: simulationResult.metadata.createdAt,
        data: simulationResult,
        sizeBytes: JSON.stringify(simulationResult).length
      };

      const request = store.put(record);
      request.onsuccess = () => resolve(record.id);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Get a user simulation by ID
   */
  async getUserSimulation(id) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.config.stores.userSims, 'readonly');
      const store = tx.objectStore(this.config.stores.userSims);
      const request = store.get(id);

      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? record.data : null);
      };
      request.onerror = () => resolve(null);
    });
  },

  /**
   * List all user simulations
   */
  async listUserSimulations(variant = null) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.config.stores.userSims, 'readonly');
      const store = tx.objectStore(this.config.stores.userSims);

      let request;
      if (variant) {
        const index = store.index('variant');
        request = index.getAll(variant);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        const records = request.result || [];
        resolve(records.map(r => ({
          id: r.id,
          variant: r.variant,
          playerCount: r.playerCount,
          iterations: r.iterations,
          createdAt: r.createdAt,
          sizeMB: (r.sizeBytes / 1024 / 1024).toFixed(2)
        })));
      };
      request.onerror = () => resolve([]);
    });
  },

  /**
   * Delete a user simulation
   */
  async deleteUserSimulation(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.config.stores.userSims, 'readwrite');
      const store = tx.objectStore(this.config.stores.userSims);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Get storage usage for user simulations
   */
  async getUserStorageUsage() {
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.config.stores.userSims, 'readonly');
      const store = tx.objectStore(this.config.stores.userSims);
      const request = store.getAll();

      request.onsuccess = () => {
        const records = request.result || [];
        const totalSize = records.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);

        resolve({
          count: records.length,
          totalSizeBytes: totalSize,
          totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
        });
      };
      request.onerror = () => resolve({ count: 0, totalSizeBytes: 0, totalSizeMB: '0.00' });
    });
  },

  // ============ UNIFIED DATA ACCESS ============

  /**
   * Get simulation data for a specific scenario
   * Checks all tiers in order: user sims -> tier 1 -> tier 2
   */
  async getSimulationData(variant, playerCount, options = {}) {
    // First check user simulations for an exact match
    const userSims = await this.listUserSimulations(variant);
    const exactMatch = userSims.find(s =>
      s.playerCount === playerCount &&
      (!options.minIterations || s.iterations >= options.minIterations)
    );

    if (exactMatch) {
      console.log(`Found user simulation: ${exactMatch.id}`);
      return {
        source: 'user',
        data: await this.getUserSimulation(exactMatch.id)
      };
    }

    // Check Tier 1 (bundled data)
    const tier1Data = await this.loadTier1Data(variant);
    if (tier1Data) {
      // Tier 1 data may be aggregated across player counts
      // or have player-count specific data
      const playerData = tier1Data.byPlayerCount?.[playerCount] || tier1Data;
      if (playerData) {
        console.log(`Using Tier 1 data for ${variant}`);
        return {
          source: 'tier1',
          data: playerData
        };
      }
    }

    // Check Tier 2 if available
    if (options.downloadTier2 !== false) {
      const tier2Data = await this.loadTier2Data('extended', variant);
      if (tier2Data?.byPlayerCount?.[playerCount]) {
        console.log(`Using Tier 2 data for ${variant} ${playerCount}p`);
        return {
          source: 'tier2',
          data: tier2Data.byPlayerCount[playerCount]
        };
      }
    }

    return {
      source: null,
      data: null
    };
  },

  // ============ STORAGE MANAGEMENT ============

  /**
   * Clear all cached Tier 2 data
   */
  async clearTier2Cache() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.config.stores.tier2Cache, 'readwrite');
      const store = tx.objectStore(this.config.stores.tier2Cache);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Clear all user simulations
   */
  async clearUserSimulations() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.config.stores.userSims, 'readwrite');
      const store = tx.objectStore(this.config.stores.userSims);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Get total storage usage
   */
  async getTotalStorageUsage() {
    const tier2Status = await this.getTier2CacheStatus();
    const userUsage = await this.getUserStorageUsage();

    return {
      tier2Cache: tier2Status,
      userSimulations: userUsage,
      totalSizeMB: (
        parseFloat(tier2Status.totalSizeMB) +
        parseFloat(userUsage.totalSizeMB)
      ).toFixed(2)
    };
  },

  /**
   * Estimate available storage (IndexedDB quota)
   */
  async estimateStorageQuota() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        quota: estimate.quota,
        usage: estimate.usage,
        available: estimate.quota - estimate.usage,
        quotaMB: (estimate.quota / 1024 / 1024).toFixed(0),
        usageMB: (estimate.usage / 1024 / 1024).toFixed(2),
        availableMB: ((estimate.quota - estimate.usage) / 1024 / 1024).toFixed(0)
      };
    }
    return null;
  },

  /**
   * Get storage usage (simplified interface for UI)
   */
  async getStorageUsage() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    return null;
  }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataManager;
} else {
  window.DataManager = DataManager;
}
