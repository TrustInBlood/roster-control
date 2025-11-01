const axios = require('axios');
const { console: loggerConsole } = require('../utils/logger');

class BattleMetricsService {
  constructor() {
    this.baseUrl = 'https://api.battlemetrics.com';
    this.token = process.env.BATTLEMETRICS_TOKEN;
    this.banListId = process.env.BATTLEMETRICS_BANLIST_ID;
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  /**
   * Fetch active whitelists from BattleMetrics with pagination
   * @param {string} nextUrl - Next page URL from previous response (null for first page)
   * @param {string} searchFilter - Optional search term to filter results server-side
   * @returns {Promise<Object>} Whitelist data with pagination info
   */
  async fetchActiveWhitelists(nextUrl = null, searchFilter = null) {
    try {
      let url = '/bans';
      let params = {
        'filter[banList]': this.banListId,
        'include': 'user,server',
        'page[size]': 100  // Request 100 entries per page instead of default 10
      };

      // Add search filter if provided (searches reason and note fields)
      if (searchFilter && !nextUrl) {
        params['filter[search]'] = searchFilter;
      }

      // If we have a next URL, use it directly (it contains all necessary params)
      if (nextUrl) {
        // Extract just the path and query from the next URL
        const urlObj = new URL(nextUrl);
        url = urlObj.pathname + urlObj.search;
        params = {}; // Next URL already has all params
      }
      
      loggerConsole.log('Fetching BattleMetrics data:', { url, params });
      
      const response = await this.axiosInstance.get(url, { params });

      loggerConsole.log('BattleMetrics API response:', {
        status: response.status,
        dataCount: response.data.data?.length || 0,
        includedCount: response.data.included?.length || 0,
        hasLinks: !!response.data.links,
        links: response.data.links
      });

      return {
        data: response.data.data || [],
        included: response.data.included || [],
        meta: response.data.meta || {},
        nextUrl: response.data.links?.next || null,
        hasMore: !!response.data.links?.next
      };
    } catch (error) {
      loggerConsole.error('Error fetching BattleMetrics whitelists:');
      loggerConsole.error('Error message:', error.message);
      loggerConsole.error('Error response:', error.response?.data);
      loggerConsole.error('Error status:', error.response?.status);
      loggerConsole.error('Request URL:', error.config?.url);
      loggerConsole.error('Request params:', error.config?.params);
      throw new Error(`Failed to fetch whitelists: ${error.message}`);
    }
  }

  /**
   * Fetch all active whitelists with automatic pagination
   * @param {Function} onProgress - Progress callback function
   * @param {string} searchFilter - Optional search term to filter results server-side
   * @returns {Promise<Array>} All whitelist entries
   */
  async fetchAllActiveWhitelists(onProgress = null, searchFilter = null) {
    const allWhitelists = [];
    let nextUrl = null;
    let pageCount = 0;

    do {
      const batch = await this.fetchActiveWhitelists(nextUrl, searchFilter);
      
      // Process and combine the data with user info
      const processedBatch = this.processWhitelistBatch(batch.data, batch.included);
      allWhitelists.push(...processedBatch);

      pageCount++;
      nextUrl = batch.nextUrl;

      if (onProgress) {
        const shouldStop = await onProgress({
          currentPage: pageCount,
          totalFetched: allWhitelists.length,
          batchSize: processedBatch.length,
          hasMore: !!nextUrl
        });
        
        // If progress callback returns false, stop fetching
        if (shouldStop === false) {
          break;
        }
      }

      // Rate limiting - BattleMetrics allows 300 requests/minute (5 requests/second) for authenticated requests
      // Using 220ms delay = ~4.5 requests/second to stay safely under the limit
      if (nextUrl) {
        await new Promise(resolve => setTimeout(resolve, 220));
      }
    } while (nextUrl);

    return allWhitelists;
  }

  /**
   * Process whitelist batch and combine with user data
   * @param {Array} bans - Raw ban/whitelist data from /bans endpoint
   * @param {Array} included - Included user data
   * @returns {Array} Processed whitelist entries
   */
  processWhitelistBatch(bans, included) {
    // Create a map of user data for quick lookup
    const userMap = new Map();
    if (included && Array.isArray(included)) {
      included.forEach(item => {
        if (item.type === 'user') {
          userMap.set(item.id, item);
        }
      });
    }

    return bans.map(ban => {
      const userId = ban.relationships?.user?.data?.id;
      const user = userId ? userMap.get(userId) : null;
      
      // Extract Steam ID from ban identifiers (primary source) or user attributes (fallback)
      let steamId = null;
      let eosId = null;
      let playerName = ban.meta?.player || 'Unknown';
      
      // First try to get Steam ID from ban.attributes.identifiers
      if (ban.attributes?.identifiers && Array.isArray(ban.attributes.identifiers)) {
        const steamIdentifier = ban.attributes.identifiers.find(id => id.type === 'steamID');
        const eosIdentifier = ban.attributes.identifiers.find(id => id.type === 'eosID');
        
        if (steamIdentifier) {
          steamId = steamIdentifier.identifier;
        }
        if (eosIdentifier) {
          eosId = eosIdentifier.identifier;
        }
        
        // Use Steam profile name if available
        if (steamIdentifier?.metadata?.profile?.personaname) {
          playerName = steamIdentifier.metadata.profile.personaname;
        }
      }
      
      // Fallback to user attributes if no identifiers found
      if (!steamId && user?.attributes?.steamID) {
        steamId = user.attributes.steamID;
      }
      if (!eosId && user?.attributes?.eosID) {
        eosId = user.attributes.eosID;
      }
      if (playerName === 'Unknown' && user?.attributes?.nickname) {
        playerName = user.attributes.nickname;
      }
      
      // Debug logging for entries without Steam ID
      if (!steamId) {
        loggerConsole.log(`BM Entry Missing Steam ID: ${ban.id} - ${ban.meta?.player || 'Unknown'} - Identifiers: ${ban.attributes?.identifiers?.map(id => id.type).join(', ') || 'none'}`);
      }
      
      return {
        id: ban.id,
        type: 'whitelist', // These are whitelist entries from BattleMetrics
        reason: ban.attributes?.reason || '',
        note: ban.attributes?.note || '',
        expiresAt: ban.attributes?.expires || null,
        createdAt: ban.attributes?.timestamp || null,
        player: {
          id: userId || ban.id,
          name: playerName,
          steamId: steamId,
          eosId: eosId
        },
        battlemetricsMetadata: {
          battlemetricsId: ban.id,
          battlemetricsUserId: userId,
          importedAt: new Date().toISOString(),
          originalReason: ban.attributes?.reason || '',
          originalNote: ban.attributes?.note || '',
          originalExpiresAt: ban.attributes?.expires || null,
          originalCreatedAt: ban.attributes?.timestamp || null
        }
      };
    });
  }

  /**
   * Categorize whitelists by priority
   * @param {Array} whitelists - Processed whitelist entries
   * @returns {Object} Categorized whitelists
   */
  categorizeWhitelists(whitelists) {
    const categories = {
      donors: [],
      firstResponders: [],
      servicemembers: [],
      other: []
    };

    const donorKeywords = ['donor', 'donate', 'donation', 'patreon', 'sponsor', 'support'];
    const frKeywords = ['first responder', 'firefighter', 'paramedic', 'emt', 'police', 'dispatcher', '911'];
    const smKeywords = ['service member', 'military', 'veteran', 'army', 'navy', 'marine', 'air force', 'coast guard', 'national guard'];

    whitelists.forEach(entry => {
      const reason = (entry.reason || '').toLowerCase();
      const note = (entry.note || '').toLowerCase();
      const combined = `${reason} ${note}`;

      if (donorKeywords.some(keyword => combined.includes(keyword))) {
        categories.donors.push(entry);
      } else if (frKeywords.some(keyword => combined.includes(keyword))) {
        categories.firstResponders.push(entry);
      } else if (smKeywords.some(keyword => combined.includes(keyword))) {
        categories.servicemembers.push(entry);
      } else {
        categories.other.push(entry);
      }
    });

    return categories;
  }

  /**
   * Calculate duration from expiration date
   * @param {string} expiresAt - Expiration date string
   * @returns {Object} Duration object with value and type
   */
  calculateDuration(expiresAt) {
    if (!expiresAt) {
      return { value: null, type: null }; // Permanent
    }

    const now = new Date();
    const expiration = new Date(expiresAt);
    const diffMs = expiration - now;
    
    if (diffMs <= 0) {
      return { value: 0, type: 'days' }; // Expired
    }

    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    // If more than 60 days, express in months
    if (diffDays > 60) {
      const months = Math.ceil(diffDays / 30);
      return { value: months, type: 'months' };
    }
    
    return { value: diffDays, type: 'days' };
  }

  /**
   * Search for a player by Steam ID
   * @param {string} steamId - Steam ID64 to search for
   * @param {number} timeout - Request timeout in milliseconds (default: 5000)
   * @returns {Promise<Object>} Player data or null if not found
   */
  async searchPlayerBySteamId(steamId, timeout = 5000) {
    try {
      loggerConsole.log('Searching BattleMetrics for player:', steamId);

      const response = await this.axiosInstance.get('/players', {
        params: {
          'filter[search]': steamId
        },
        timeout: timeout
      });

      // Check if we got any results
      if (!response.data || !response.data.data || response.data.data.length === 0) {
        loggerConsole.log('Player not found in BattleMetrics:', steamId);
        return {
          found: false,
          profileUrl: null,
          playerData: null
        };
      }

      // Get the first matching player
      const player = response.data.data[0];
      const playerId = player.id;
      const playerName = player.attributes?.name || 'Unknown';

      loggerConsole.log('BattleMetrics player found:', {
        id: playerId,
        name: playerName,
        steamId: steamId
      });

      // Construct profile URL (RCON players path for full player details)
      const profileUrl = `https://www.battlemetrics.com/rcon/players/${playerId}`;

      return {
        found: true,
        profileUrl: profileUrl,
        playerData: {
          id: playerId,
          name: playerName,
          steamId: steamId
          // Future: Add banCount, playtime, lastSeen, etc. from response
        }
      };

    } catch (error) {
      // Handle timeout specifically
      if (error.code === 'ECONNABORTED') {
        loggerConsole.warn('BattleMetrics player search timed out:', {
          steamId,
          timeout
        });
      } else {
        loggerConsole.error('Error searching BattleMetrics for player:', {
          steamId,
          error: error.message,
          status: error.response?.status
        });
      }

      return {
        found: false,
        profileUrl: null,
        playerData: null,
        error: error.message
      };
    }
  }

  /**
   * Test connection to BattleMetrics API
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      loggerConsole.log('Testing BattleMetrics connection...');
      loggerConsole.log('Token:', this.token ? `${this.token.substring(0, 10)}...` : 'NOT SET');
      loggerConsole.log('Ban List ID:', this.banListId || 'NOT SET');

      // Test with a small request to the ban list
      const response = await this.axiosInstance.get('/bans', {
        params: {
          'filter[banList]': this.banListId
        }
      });
      loggerConsole.log('BattleMetrics API response status:', response.status);
      return response.status === 200;
    } catch (error) {
      loggerConsole.error('BattleMetrics connection test failed:');
      loggerConsole.error('Error message:', error.message);
      loggerConsole.error('Error response:', error.response?.data);
      loggerConsole.error('Error status:', error.response?.status);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new BattleMetricsService();