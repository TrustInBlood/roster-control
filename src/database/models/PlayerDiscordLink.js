const { DataTypes, Op } = require('sequelize');

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

  PlayerDiscordLink.createOrUpdateLink = async function(discordUserId, steamid64, eosID, username, options = {}) {
    const {
      linkSource = 'manual',
      confidenceScore = 1.00,
      isPrimary = true,
      metadata = null
    } = options;

    const [link, created] = await this.upsert({
      discord_user_id: discordUserId,
      steamid64,
      eosID,
      username,
      link_source: linkSource,
      confidence_score: confidenceScore,
      is_primary: isPrimary,
      metadata,
      created_at: new Date(),
      updated_at: new Date()
    }, {
      returning: true
    });

    return { link, created };
  };

  PlayerDiscordLink.createTicketLink = async function(discordUserId, steamid64, ticketInfo) {
    // Check if this exact combination already exists
    const existingLink = await this.findOne({
      where: { 
        discord_user_id: discordUserId,
        steamid64: steamid64 
      }
    });
    
    // If exact same record exists, skip
    if (existingLink) {
      return { link: existingLink, created: false, reason: 'duplicate_link' };
    }

    const metadata = {
      ticketChannelId: ticketInfo.channelId,
      ticketChannelName: ticketInfo.channelName,
      messageId: ticketInfo.messageId,
      extractedAt: new Date(),
      originalMessage: ticketInfo.messageContent?.substring(0, 500) // Limit size
    };

    return await this.createOrUpdateLink(discordUserId, steamid64, null, ticketInfo.username, {
      linkSource: 'ticket',
      confidenceScore: 0.3, // Lower confidence for ticket text extraction
      isPrimary: true,
      metadata
    });
  };

  PlayerDiscordLink.findHighConfidenceLinks = async function(minConfidence = 0.8) {
    return await this.findAll({
      where: {
        confidence_score: {
          [Op.gte]: minConfidence
        }
      },
      order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
    });
  };

  PlayerDiscordLink.findBySource = async function(linkSource) {
    return await this.findAll({
      where: { link_source: linkSource },
      order: [['created_at', 'DESC']]
    });
  };

  PlayerDiscordLink.createManualLink = async function(discordUserId, steamid64, eosId = null, username = null, adminInfo = {}) {
    // Admin manual links get 0.7 confidence (not sufficient for staff whitelist)
    const metadata = {
      created_by: adminInfo.created_by,
      created_by_tag: adminInfo.created_by_tag,
      reason: adminInfo.reason || 'Manual admin link',
      created_at: new Date()
    };

    // Mark any existing links for this Steam ID as non-primary
    if (steamid64) {
      await this.update(
        { is_primary: false },
        { where: { steamid64: steamid64 } }
      );
    }

    return await this.createOrUpdateLink(discordUserId, steamid64, eosId, username, {
      linkSource: 'admin',
      confidenceScore: 0.7, // Admin-created links get 0.7 confidence
      isPrimary: true,
      metadata
    });
  };

  return PlayerDiscordLink;
};