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
          hasMore: !!nextUrl,
          lastBatch: processedBatch // Include batch data for date-based early termination
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

  /**
   * Get all flags for a specific player
   * @param {string} playerId - BattleMetrics player ID
   * @returns {Promise<Array>} Player flags
   */
  async getPlayerFlags(playerId) {
    try {
      loggerConsole.log('Fetching flags for player:', playerId);

      const response = await this.axiosInstance.get(`/players/${playerId}`, {
        params: {
          include: 'flagPlayer'
        }
      });

      const included = response.data.included || [];

      // Get active flag assignments (flagPlayer with no removedAt)
      const activeFlagAssignments = included
        .filter(item => item.type === 'flagPlayer')
        .filter(item => !item.attributes?.removedAt);

      // Now we need to get the flag names - they might be in included as playerFlag types
      const flagDefinitions = included
        .filter(item => item.type === 'playerFlag')
        .reduce((map, flag) => {
          map[flag.id] = flag.attributes?.name || '';
          return map;
        }, {});

      const flags = activeFlagAssignments.map(assignment => {
        const flagId = assignment.relationships?.playerFlag?.data?.id;
        return {
          id: assignment.id,
          name: flagDefinitions[flagId] || 'Unknown',
          createdAt: assignment.attributes?.addedAt || null
        };
      });

      loggerConsole.log(`Player ${playerId} has ${flags.length} active flags`);
      return flags;
    } catch (error) {
      loggerConsole.error('Error fetching player flags:', {
        playerId,
        error: error.message,
        status: error.response?.status
      });
      throw new Error(`Failed to fetch player flags: ${error.message}`);
    }
  }

  /**
   * Add a flag to a player
   * @param {string} playerId - BattleMetrics player ID
   * @param {string} flagName - Flag name to add
   * @returns {Promise<Object>} Result object
   */
  async addPlayerFlag(playerId, flagName) {
    try {
      loggerConsole.log('Adding flag to player:', { playerId, flagName });

      // Step 1: Look up the flag ID by name
      loggerConsole.log('Looking up flag ID for:', flagName);
      const flagsResponse = await this.axiosInstance.get('/player-flags', {
        params: {
          'filter[personal]': false,
          'page[size]': 100
        }
      });

      const flags = flagsResponse.data.data || [];
      const targetFlag = flags.find(f => f.attributes?.name === flagName);

      if (!targetFlag) {
        const errorMsg = `Flag "${flagName}" not found in organization flags`;
        loggerConsole.error(errorMsg);
        return {
          success: false,
          playerId,
          flagName,
          error: errorMsg,
          notFound: true
        };
      }

      const flagId = targetFlag.id;
      loggerConsole.log('Found flag ID:', flagId);

      // Step 2: Create player flag assignment using the correct endpoint
      const data = {
        data: [
          {
            type: 'playerFlag',
            id: flagId
          }
        ]
      };

      const response = await this.axiosInstance.post(`/players/${playerId}/relationships/flags`, data);

      loggerConsole.log('Player flag added successfully:', {
        playerId,
        flagName,
        flagId: response.data.data?.id,
        status: response.status
      });

      return {
        success: true,
        playerId,
        flagName,
        flagId: response.data.data?.id,
        status: response.status
      };
    } catch (error) {
      const errorMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      const status = error.response?.status;

      // Handle 409 Conflict (flag already added) as a success case
      if (status === 409) {
        loggerConsole.info(`Flag already exists for player ${playerId}:`, flagName);
        return {
          success: true,
          alreadyHasFlag: true,
          playerId,
          flagName
        };
      }

      loggerConsole.error('Error adding player flag:', {
        playerId,
        flagName,
        error: errorMsg,
        status,
        fullErrorResponse: JSON.stringify(error.response?.data, null, 2)
      });

      return {
        success: false,
        playerId,
        flagName,
        error: errorMsg,
        status,
        notFound: status === 404,
        forbidden: status === 403,
        rateLimited: status === 429
      };
    }
  }

  /**
   * Remove a specific flag from a player
   * @param {string} flagId - Player flag ID (not player ID)
   * @returns {Promise<Object>} Result object
   */
  async removePlayerFlag(flagId) {
    try {
      loggerConsole.log('Removing player flag:', flagId);

      const response = await this.axiosInstance.delete(`/player-flags/${flagId}`);

      loggerConsole.log('Player flag removed successfully:', {
        flagId,
        status: response.status
      });

      return {
        success: true,
        flagId,
        status: response.status
      };
    } catch (error) {
      const errorMsg = error.response?.data?.errors?.[0]?.detail || error.message;
      const status = error.response?.status;

      loggerConsole.error('Error removing player flag:', {
        flagId,
        error: errorMsg,
        status
      });

      return {
        success: false,
        flagId,
        error: errorMsg,
        status,
        notFound: status === 404,
        forbidden: status === 403,
        rateLimited: status === 429
      };
    }
  }

  /**
   * Search for players with a specific flag
   * @param {string} flagName - Flag name to search for (e.g., "=B&B= Member")
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Array>} Players with the specified flag
   */
  async searchPlayersByFlag(flagName, onProgress = null) {
    try {
      loggerConsole.log('Searching BattleMetrics players with flag:', flagName);

      // Step 1: Find the flag ID by name
      loggerConsole.log('Step 1: Finding flag ID for:', flagName);
      let flagId = null;

      const flagsResponse = await this.axiosInstance.get('/player-flags', {
        params: {
          'filter[personal]': false,
          'page[size]': 100
        }
      });

      const flags = flagsResponse.data.data || [];
      const targetFlag = flags.find(f => f.attributes?.name === flagName);

      if (!targetFlag) {
        loggerConsole.warn(`Flag "${flagName}" not found in organization flags`);
        return [];
      }

      flagId = targetFlag.id;
      loggerConsole.log(`Found flag ID: ${flagId} for "${flagName}"`);

      // Step 2: Search for players with flag using filter
      loggerConsole.log(`Step 2: Searching for players with flag ${flagId} using filter`);

      const playerMap = new Map();
      let nextUrl = null;
      let pageCount = 0;
      let totalPlayers = 0;

      do {
        const url = nextUrl || '/players';
        const params = nextUrl ? {} : {
          'filter[playerFlags]': flagId,
          'include': 'identifier,playerFlag',
          'page[size]': 100
        };

        const urlToFetch = nextUrl ? nextUrl.replace('https://api.battlemetrics.com', '') : url;

        const response = await this.axiosInstance.get(urlToFetch, { params: nextUrl ? {} : params });
        const players = response.data.data || [];
        const included = response.data.included || [];
        totalPlayers += players.length;

        // Build identifier lookup map
        const identifierMap = new Map();

        for (const item of included) {
          if (item.type === 'identifier') {
            const playerId = item.relationships?.player?.data?.id;
            const identifierType = item.attributes?.type;
            const identifierValue = item.attributes?.identifier;

            if (playerId && identifierType && identifierValue) {
              if (!identifierMap.has(playerId)) {
                identifierMap.set(playerId, { steamId: null, eosId: null });
              }

              const playerIdentifiers = identifierMap.get(playerId);
              if (identifierType === 'steamID') {
                playerIdentifiers.steamId = identifierValue;
              } else if (identifierType === 'eosID') {
                playerIdentifiers.eosId = identifierValue;
              }
            }
          }
        }

        // Process players
        for (const playerData of players) {
          const playerId = playerData.id;
          const identifiers = identifierMap.get(playerId) || { steamId: null, eosId: null };

          const playerFlags = included
            .filter(item => item.type === 'playerFlag')
            .map(flag => ({
              id: flag.id,
              name: flag.attributes?.name || '',
              createdAt: flag.attributes?.createdAt || null
            }));

          playerMap.set(playerId, {
            id: playerId,
            name: playerData.attributes?.name || 'Unknown',
            steamId: identifiers.steamId,
            eosId: identifiers.eosId,
            flags: playerFlags.length > 0 ? playerFlags : [{ id: flagId, name: flagName, createdAt: null }],
            metadata: {
              battlemetricsId: playerId,
              importedAt: new Date().toISOString()
            }
          });
        }

        pageCount++;
        nextUrl = response.data.links?.next || null;

        if (onProgress) {
          const shouldStop = await onProgress({
            currentPage: pageCount,
            totalFetched: playerMap.size,
            batchSize: players.length,
            hasMore: !!nextUrl,
            totalPlayers,
            playersWithFlag: playerMap.size
          });

          if (shouldStop === false) {
            break;
          }
        }

        // Rate limiting
        if (nextUrl) {
          await new Promise(resolve => setTimeout(resolve, 220));
        }
      } while (nextUrl);

      const players = Array.from(playerMap.values());
      const playersWithSteamId = players.filter(p => p.steamId).length;
      loggerConsole.log(`Found ${players.length} players with "${flagName}" flag (${playersWithSteamId} with Steam ID)`);
      return players;
    } catch (error) {
      loggerConsole.error('Error searching players by flag:', {
        flagName,
        error: error.message,
        status: error.response?.status
      });
      throw new Error(`Failed to search players by flag: ${error.message}`);
    }
  }

  /**
   * Find all Squad servers at an IP address and return map by game port
   * Used for auto-discovering BattleMetrics server info
   * @param {string} ip - Server IP address
   * @returns {Promise<Map<number, Object>>} Map of gamePort -> server info
   */
  async findServersByIP(ip) {
    try {
      loggerConsole.log('Searching BattleMetrics for servers at IP:', ip);

      const response = await this.axiosInstance.get('/servers', {
        params: {
          'filter[search]': ip,
          'filter[game]': 'squad'
        }
      });

      const serverMap = new Map();
      for (const server of response.data.data || []) {
        // Only include servers that exactly match the IP
        if (server.attributes.ip === ip) {
          serverMap.set(server.attributes.port, {
            id: server.id,
            name: server.attributes.name,
            ip: server.attributes.ip,
            port: server.attributes.port,
            queryPort: server.attributes.portQuery,
            players: server.attributes.players,
            maxPlayers: server.attributes.maxPlayers,
            status: server.attributes.status
          });
        }
      }

      loggerConsole.log(`Found ${serverMap.size} servers at IP ${ip}`);
      return serverMap;
    } catch (error) {
      loggerConsole.error('Error searching servers by IP:', {
        ip,
        error: error.message,
        status: error.response?.status
      });
      throw new Error(`Failed to search servers by IP: ${error.message}`);
    }
  }
}

// Export singleton instance
module.exports = new BattleMetricsService();