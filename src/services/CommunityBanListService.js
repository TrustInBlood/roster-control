/**
 * Community Ban List (CBL) Service
 * Provides integration with the Community Ban List GraphQL API
 * for checking player reputation and ban history.
 */

const axios = require('axios');
const { console: loggerConsole } = require('../utils/logger');

class CommunityBanListService {
  constructor() {
    this.baseUrl = 'https://communitybanlist.com/graphql';
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Search for a player by Steam ID
   * @param {string} steamId - Steam ID64
   * @param {number} timeout - Optional timeout in milliseconds
   * @returns {Promise<Object>} Player data including reputation and bans
   */
  async searchPlayer(steamId, timeout = 10000) {
    const query = `
      query Search($id: String!) {
        steamUser(id: $id) {
          id
          name
          reputationPoints
          riskRating
          reputationRank
          activeBans: bans(orderBy: "created", orderDirection: DESC, expired: false) {
            edges {
              node {
                id
                reason
                created
                expires
                banList {
                  name
                  organisation {
                    name
                  }
                }
              }
            }
          }
          expiredBans: bans(orderBy: "created", orderDirection: DESC, expired: true) {
            edges {
              node {
                id
                reason
                created
                expires
                banList {
                  name
                  organisation {
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.axiosInstance.post('', {
        operationName: 'Search',
        variables: { id: steamId },
        query: query.replace(/\s+/g, ' ').trim()
      }, {
        timeout
      });

      const steamUser = response.data?.data?.steamUser;

      if (!steamUser) {
        return {
          found: false,
          steamId,
          error: null
        };
      }

      // Process active bans
      const activeBans = (steamUser.activeBans?.edges || []).map(edge => ({
        id: edge.node.id,
        reason: edge.node.reason || 'No reason provided',
        created: edge.node.created,
        expires: edge.node.expires,
        banList: edge.node.banList?.name || 'Unknown',
        organisation: edge.node.banList?.organisation?.name || 'Unknown'
      }));

      // Process expired bans (just count for summary)
      const expiredBansCount = steamUser.expiredBans?.edges?.length || 0;

      return {
        found: true,
        steamId,
        playerData: {
          name: steamUser.name,
          reputationPoints: steamUser.reputationPoints || 0,
          riskRating: steamUser.riskRating || 0,
          reputationRank: steamUser.reputationRank || null,
          activeBans,
          activeBansCount: activeBans.length,
          expiredBansCount
        },
        profileUrl: `https://communitybanlist.com/search/${steamId}`,
        error: null
      };
    } catch (error) {
      loggerConsole.warn('CBL lookup failed:', {
        steamId,
        error: error.message
      });

      return {
        found: false,
        steamId,
        error: error.message
      };
    }
  }

  /**
   * Get a formatted risk rating description
   * @param {number} riskRating - The risk rating value
   * @returns {string} Human-readable risk description
   */
  getRiskDescription(riskRating) {
    if (riskRating === 0) return 'None';
    if (riskRating <= 1) return 'Very Low';
    if (riskRating <= 2) return 'Low';
    if (riskRating <= 3) return 'Moderate';
    if (riskRating <= 5) return 'High';
    return 'Very High';
  }

  /**
   * Get color based on risk rating for embeds
   * @param {number} riskRating - The risk rating value
   * @returns {number} Discord embed color
   */
  getRiskColor(riskRating) {
    if (riskRating === 0) return 0x00FF00; // Green
    if (riskRating <= 1) return 0x7FFF00; // Yellow-green
    if (riskRating <= 2) return 0xFFFF00; // Yellow
    if (riskRating <= 3) return 0xFFA500; // Orange
    if (riskRating <= 5) return 0xFF4500; // Red-orange
    return 0xFF0000; // Red
  }

  /**
   * Get emoji based on reputation points
   * @param {number} reputationPoints - The reputation points value
   * @returns {string} Emoji representing reputation status
   */
  getReputationEmoji(reputationPoints) {
    if (reputationPoints === 0) return ':white_check_mark:';
    if (reputationPoints <= 2) return ':warning:';
    return ':x:';
  }
}

// Export singleton instance
module.exports = new CommunityBanListService();
