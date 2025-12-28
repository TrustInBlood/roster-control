const { DataTypes } = require('sequelize');

/**
 * PlayerDiscordLink Model
 *
 * Stores VERIFIED links between Discord users and Steam IDs.
 * After the soft-link refactor, this table ONLY contains 1.0 confidence links.
 *
 * Verified links are created through:
 * - SquadJS in-game verification (1.0 confidence)
 * - Admin verification via button click (1.0 confidence)
 * - Admin link command with verification (1.0 confidence)
 *
 * For unverified/potential links, see PotentialPlayerLink model.
 */
module.exports = (sequelize) => {
  const PlayerDiscordLink = sequelize.define('PlayerDiscordLink', {
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
      allowNull: true
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
      type: DataTypes.ENUM('manual', 'ticket', 'squadjs', 'import'),
      allowNull: false,
      defaultValue: 'manual',
      comment: 'Source of the account link'
    },
    confidence_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 1.00,
      comment: 'Confidence score of the link (0.00-1.00)'
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether this is the primary Steam ID for the user'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional metadata about the link'
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
    tableName: 'player_discord_links',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['discord_user_id', 'steamid64']  // Unique combination, but allow multiple steamids per discord user
      },
      {
        fields: ['discord_user_id']
      },
      {
        fields: ['steamid64']
      },
      {
        fields: ['eosID']
      },
      {
        fields: ['link_source']
      },
      {
        fields: ['confidence_score']
      }
    ]
  });

  PlayerDiscordLink.findByDiscordId = async function(discordUserId) {
    // Returns the highest confidence link for this Discord user
    return await this.findOne({ 
      where: { discord_user_id: discordUserId },
      order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
    });
  };

  PlayerDiscordLink.findAllByDiscordId = async function(discordUserId) {
    // Returns all links for this Discord user
    return await this.findAll({ 
      where: { discord_user_id: discordUserId },
      order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
    });
  };

  PlayerDiscordLink.findBySteamId = async function(steamid64) {
    return await this.findOne({ 
      where: { steamid64 } 
    });
  };

  PlayerDiscordLink.findByEosId = async function(eosID) {
    return await this.findOne({ 
      where: { eosID } 
    });
  };

  /**
   * Create or update a VERIFIED link (1.0 confidence only)
   * This method is for verified links only. For potential links, use PotentialPlayerLink.
   *
   * @param {string} discordUserId - Discord user ID
   * @param {string} steamid64 - Steam ID64
   * @param {string} eosID - EOS ID (optional)
   * @param {string} username - Username (optional)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} { link, created }
   */
  PlayerDiscordLink.createOrUpdateLink = async function(discordUserId, steamid64, eosID, username, options = {}) {
    const {
      linkSource = 'manual',
      isPrimary = true,
      metadata = null
    } = options;

    // Verified links are ALWAYS 1.0 confidence
    const confidenceScore = 1.00;

    // Check for existing link
    const existingLink = await this.findOne({
      where: {
        discord_user_id: discordUserId,
        steamid64
      }
    });

    // Update metadata to preserve existing if not provided
    const finalMetadata = metadata !== null ? metadata : (existingLink?.metadata || null);

    const [link, created] = await this.upsert({
      discord_user_id: discordUserId,
      steamid64,
      eosID,
      username,
      link_source: linkSource,
      confidence_score: confidenceScore,
      is_primary: isPrimary,
      metadata: finalMetadata,
      created_at: existingLink ? existingLink.created_at : new Date(),
      updated_at: new Date()
    }, {
      returning: true
    });

    // Trigger role sync for new verified links
    if (created) {
      setImmediate(async () => {
        try {
          const { triggerUserRoleSync } = require('../../utils/triggerUserRoleSync');

          if (global.discordClient) {
            await triggerUserRoleSync(global.discordClient, discordUserId, {
              source: 'verified_link_created',
              skipNotification: false
            });
          }
        } catch (syncError) {
          const { console: loggerConsole } = require('../../utils/logger');
          loggerConsole.error('Failed to auto-sync role after verified link creation', {
            discordUserId,
            steamid64,
            error: syncError.message
          });
        }
      });
    }

    return { link, created };
  };

  /**
   * Find all verified links by source type
   * @param {string} linkSource - 'manual', 'squadjs', or 'import'
   * @returns {Promise<Array>}
   */
  PlayerDiscordLink.findBySource = async function(linkSource) {
    return await this.findAll({
      where: { link_source: linkSource },
      order: [['created_at', 'DESC']]
    });
  };

  /**
   * Create a verified link from admin action
   * This creates a VERIFIED (1.0 confidence) link, not a soft link.
   *
   * @param {string} discordUserId - Discord user ID
   * @param {string} steamid64 - Steam ID64
   * @param {string} eosId - EOS ID (optional)
   * @param {string} username - Username (optional)
   * @param {Object} adminInfo - Admin action info
   * @returns {Promise<Object>} { link, created }
   */
  PlayerDiscordLink.createVerifiedLink = async function(discordUserId, steamid64, eosId = null, username = null, adminInfo = {}) {
    const metadata = {
      verified_by: adminInfo.verified_by,
      verified_by_tag: adminInfo.verified_by_tag,
      reason: adminInfo.reason || 'Admin verified link',
      verified_at: new Date()
    };

    // Mark any existing links for this Steam ID as non-primary
    if (steamid64) {
      await this.update(
        { is_primary: false },
        { where: { steamid64: steamid64 } }
      );
    }

    return await this.createOrUpdateLink(discordUserId, steamid64, eosId, username, {
      linkSource: 'manual',
      isPrimary: true,
      metadata
    });
  };

  return PlayerDiscordLink;
};