const { DataTypes, Op } = require('sequelize');

/**
 * PotentialPlayerLink Model
 *
 * Stores unverified/soft links between Discord users and Steam IDs.
 * These are NOT real account links - they're potential associations
 * used for alt detection and investigation purposes only.
 *
 * Unlike PlayerDiscordLink (which requires 1.0 confidence verification),
 * these entries are created automatically from:
 * - Ticket messages containing Steam IDs (0.3 confidence)
 * - Admin manual linking without verification (0.7 confidence)
 * - Whitelist grants (0.5 confidence)
 *
 * These entries do NOT:
 * - Grant any access or privileges
 * - Trigger role syncs
 * - Appear on user profiles as "linked accounts"
 *
 * They DO:
 * - Help identify potential alt accounts
 * - Provide investigative context for admins
 * - Track Steam ID associations discovered through various channels
 *
 * NOTE: This table is created by migration 048. Methods gracefully handle
 * the case where the table doesn't exist yet (before migration runs).
 */

// Track whether the table exists (checked once on first query)
let tableExistsChecked = false;
let tableExists = false;

/**
 * Check if the potential_player_links table exists
 * Caches the result after first check for performance
 * @param {Object} sequelize - Sequelize instance
 * @returns {Promise<boolean>} True if table exists
 */
async function checkTableExists(sequelize) {
  if (tableExistsChecked) {
    console.log('[PotentialPlayerLink] Table exists cache hit:', tableExists);
    return tableExists;
  }

  try {
    console.log('[PotentialPlayerLink] Checking if table exists...');
    const [results] = await sequelize.query(
      'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = \'potential_player_links\''
    );
    tableExists = results[0].count > 0;
    tableExistsChecked = true;
    console.log('[PotentialPlayerLink] Table exists check result:', tableExists);
    return tableExists;
  } catch (error) {
    console.log('[PotentialPlayerLink] Table exists check error:', error.message);
    // If we can't check, assume table doesn't exist
    return false;
  }
}

/**
 * Reset the table existence cache (useful after migrations)
 */
function resetTableExistsCache() {
  tableExistsChecked = false;
  tableExists = false;
}

module.exports = (sequelize) => {
  const PotentialPlayerLink = sequelize.define('PotentialPlayerLink', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    discord_user_id: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    steamid64: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    eosID: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    link_source: {
      type: DataTypes.ENUM('ticket', 'manual', 'whitelist'),
      allowNull: false,
      comment: 'Source of the potential link'
    },
    confidence_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 0.30,
      comment: 'Confidence score (always < 1.0 for potential links)'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional metadata about the link discovery'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'potential_player_links',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['discord_user_id', 'steamid64'],
        name: 'idx_potential_links_discord_steam_unique'
      },
      {
        fields: ['discord_user_id'],
        name: 'idx_potential_links_discord_user'
      },
      {
        fields: ['steamid64'],
        name: 'idx_potential_links_steamid'
      },
      {
        fields: ['link_source'],
        name: 'idx_potential_links_source'
      }
    ]
  });

  /**
   * Find all potential links for a Discord user
   * @param {string} discordUserId - Discord user ID
   * @returns {Promise<Array>} Array of potential links
   */
  PotentialPlayerLink.findByDiscordId = async function(discordUserId) {
    if (!await checkTableExists(sequelize)) {
      return [];
    }
    return await this.findAll({
      where: { discord_user_id: discordUserId },
      order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
    });
  };

  /**
   * Find all potential links for a Steam ID (potential alts)
   * @param {string} steamid64 - Steam ID64
   * @returns {Promise<Array>} Array of potential links (different Discord users)
   */
  PotentialPlayerLink.findBySteamId = async function(steamid64) {
    if (!await checkTableExists(sequelize)) {
      return [];
    }
    return await this.findAll({
      where: { steamid64 },
      order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
    });
  };

  /**
   * Find potential links by source type
   * @param {string} linkSource - 'ticket', 'manual', or 'whitelist'
   * @returns {Promise<Array>} Array of potential links
   */
  PotentialPlayerLink.findBySource = async function(linkSource) {
    if (!await checkTableExists(sequelize)) {
      return [];
    }
    return await this.findAll({
      where: { link_source: linkSource },
      order: [['created_at', 'DESC']]
    });
  };

  /**
   * Create or update a potential link
   * @param {string} discordUserId - Discord user ID
   * @param {string} steamid64 - Steam ID64
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} { link, created }
   */
  PotentialPlayerLink.createOrUpdatePotentialLink = async function(
    discordUserId,
    steamid64,
    options = {}
  ) {
    if (!await checkTableExists(sequelize)) {
      return { link: null, created: false };
    }

    const {
      eosID = null,
      username = null,
      linkSource = 'ticket',
      confidenceScore = 0.30,
      metadata = null
    } = options;

    // Check for existing potential link
    const existingLink = await this.findOne({
      where: {
        discord_user_id: discordUserId,
        steamid64
      }
    });

    if (existingLink) {
      // Update if new confidence is higher
      const newConfidence = Math.max(
        parseFloat(existingLink.confidence_score),
        parseFloat(confidenceScore)
      );

      // Merge metadata
      const mergedMetadata = {
        ...existingLink.metadata,
        ...metadata,
        previousSources: [
          ...(existingLink.metadata?.previousSources || []),
          { source: existingLink.link_source, at: existingLink.updated_at || existingLink.created_at }
        ]
      };

      await existingLink.update({
        eosID: eosID || existingLink.eosID,
        username: username || existingLink.username,
        confidence_score: newConfidence,
        metadata: mergedMetadata,
        updated_at: new Date()
      });

      return { link: existingLink, created: false };
    }

    // Create new potential link
    const newLink = await this.create({
      discord_user_id: discordUserId,
      steamid64,
      eosID,
      username,
      link_source: linkSource,
      confidence_score: confidenceScore,
      metadata,
      created_at: new Date()
    });

    return { link: newLink, created: true };
  };

  /**
   * Create a potential link from ticket message
   * @param {string} discordUserId - Discord user ID
   * @param {string} steamid64 - Steam ID64
   * @param {Object} ticketInfo - Ticket context info
   * @returns {Promise<Object>} { link, created, reason }
   */
  PotentialPlayerLink.createTicketLink = async function(discordUserId, steamid64, ticketInfo) {
    if (!await checkTableExists(sequelize)) {
      return { link: null, created: false, reason: 'table_not_ready' };
    }

    // Check if this exact combination already exists
    const existingLink = await this.findOne({
      where: {
        discord_user_id: discordUserId,
        steamid64
      }
    });

    if (existingLink) {
      return { link: existingLink, created: false, reason: 'duplicate_link' };
    }

    const metadata = {
      ticketChannelId: ticketInfo.channelId,
      ticketChannelName: ticketInfo.channelName,
      messageId: ticketInfo.messageId,
      extractedAt: new Date(),
      originalMessage: ticketInfo.messageContent?.substring(0, 500)
    };

    return await this.createOrUpdatePotentialLink(discordUserId, steamid64, {
      username: ticketInfo.username,
      linkSource: 'ticket',
      confidenceScore: 0.30,
      metadata
    });
  };

  /**
   * Remove a potential link (e.g., when verified link is created)
   * @param {string} discordUserId - Discord user ID
   * @param {string} steamid64 - Steam ID64
   * @returns {Promise<boolean>} True if deleted
   */
  PotentialPlayerLink.removePotentialLink = async function(discordUserId, steamid64) {
    if (!await checkTableExists(sequelize)) {
      return false;
    }
    const deleted = await this.destroy({
      where: {
        discord_user_id: discordUserId,
        steamid64
      }
    });
    return deleted > 0;
  };

  /**
   * Remove all potential links for a Discord user
   * @param {string} discordUserId - Discord user ID
   * @returns {Promise<number>} Number of deleted rows
   */
  PotentialPlayerLink.removeAllForDiscordUser = async function(discordUserId) {
    if (!await checkTableExists(sequelize)) {
      return 0;
    }
    return await this.destroy({
      where: { discord_user_id: discordUserId }
    });
  };

  /**
   * Find potential alts for a verified account
   * Given a Discord user and their verified Steam ID, find other Discord users
   * who have potential links to the same Steam ID
   * @param {string} discordUserId - The verified Discord user ID
   * @param {string} steamid64 - The verified Steam ID
   * @returns {Promise<Array>} Array of potential links from other Discord users
   */
  PotentialPlayerLink.findPotentialAlts = async function(discordUserId, steamid64) {
    if (!await checkTableExists(sequelize)) {
      return [];
    }
    return await this.findAll({
      where: {
        steamid64,
        discord_user_id: { [Op.ne]: discordUserId }
      },
      order: [['confidence_score', 'DESC']]
    });
  };

  /**
   * Get statistics about potential links
   * @returns {Promise<Object>} Statistics object
   */
  PotentialPlayerLink.getStats = async function() {
    if (!await checkTableExists(sequelize)) {
      return { total: 0, bySource: {} };
    }

    const [total, bySource] = await Promise.all([
      this.count(),
      this.findAll({
        attributes: [
          'link_source',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['link_source']
      })
    ]);

    const sourceStats = {};
    for (const row of bySource) {
      sourceStats[row.link_source] = parseInt(row.getDataValue('count'));
    }

    return {
      total,
      bySource: sourceStats
    };
  };

  // Attach cache reset function to the model for use after migrations
  PotentialPlayerLink.resetTableExistsCache = resetTableExistsCache;

  return PotentialPlayerLink;
};
