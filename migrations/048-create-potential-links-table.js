'use strict';

/**
 * Migration: Create potential_player_links table
 *
 * This table stores potential links between Discord users and Steam IDs
 * that are NOT verified. These are used for alt detection only and are
 * not considered "real" links.
 *
 * Sources:
 * - ticket: Auto-extracted from ticket messages (0.3 confidence)
 * - manual: Admin-created but not verified (0.7 confidence)
 * - whitelist: Created when granting whitelist (0.5 confidence)
 *
 * These entries do NOT grant any access or privileges - they're purely
 * for tracking potential alt accounts.
 */

const TABLE_NAME = 'potential_player_links';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable(TABLE_NAME, {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      discord_user_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Discord user ID'
      },
      steamid64: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Steam ID64'
      },
      eosID: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Epic Online Services ID (if known)'
      },
      username: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Last known username'
      },
      link_source: {
        type: DataTypes.ENUM('ticket', 'manual', 'whitelist'),
        allowNull: false,
        comment: 'How this potential link was discovered'
      },
      confidence_score: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.30,
        comment: 'Confidence score (0.00-0.99) - these are always < 1.0'
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Additional context about how this link was discovered'
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
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add indexes
    await queryInterface.addIndex(TABLE_NAME, ['discord_user_id', 'steamid64'], {
      unique: true,
      name: 'idx_potential_links_discord_steam_unique'
    });

    await queryInterface.addIndex(TABLE_NAME, ['discord_user_id'], {
      name: 'idx_potential_links_discord_user'
    });

    await queryInterface.addIndex(TABLE_NAME, ['steamid64'], {
      name: 'idx_potential_links_steamid'
    });

    await queryInterface.addIndex(TABLE_NAME, ['link_source'], {
      name: 'idx_potential_links_source'
    });

    console.log(`Created ${TABLE_NAME} table with indexes`);
  },

  async down(queryInterface) {
    await queryInterface.dropTable(TABLE_NAME);
    console.log(`Dropped ${TABLE_NAME} table`);
  }
};
