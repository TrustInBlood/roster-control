'use strict';

/**
 * Migration: Move soft links from player_discord_links to potential_player_links
 *
 * This migration:
 * 1. Copies all entries with confidence_score < 1.0 to potential_player_links
 * 2. Deletes those entries from player_discord_links
 *
 * After this migration, player_discord_links will ONLY contain verified (1.0) links.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Get count of rows to migrate for logging
    const countResult = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as count FROM player_discord_links WHERE confidence_score < 1.0',
      { type: Sequelize.QueryTypes.SELECT }
    );
    const migratedCount = countResult[0]?.count || 0;

    if (migratedCount === 0) {
      console.log('No soft links to migrate - all links are already verified (1.0 confidence)');
      return;
    }

    // Step 1: Copy soft links (confidence < 1.0) to potential_player_links
    // Map link_source values: 'manual' -> 'manual', 'ticket' -> 'ticket', 'import' -> 'manual'
    // Note: 'squadjs' links should never be < 1.0, but if any exist, map to 'manual'
    await queryInterface.sequelize.query(`
      INSERT INTO potential_player_links
        (discord_user_id, steamid64, eosID, username, link_source, confidence_score, metadata, created_at, updated_at)
      SELECT
        discord_user_id,
        steamid64,
        eosID,
        username,
        CASE
          WHEN link_source = 'ticket' THEN 'ticket'
          WHEN link_source = 'manual' THEN 'manual'
          ELSE 'manual'
        END as link_source,
        confidence_score,
        metadata,
        created_at,
        updated_at
      FROM player_discord_links
      WHERE confidence_score < 1.0
      ON DUPLICATE KEY UPDATE
        confidence_score = GREATEST(potential_player_links.confidence_score, VALUES(confidence_score)),
        updated_at = NOW()
    `, { type: Sequelize.QueryTypes.INSERT });

    // Step 2: Delete soft links from player_discord_links
    await queryInterface.sequelize.query(
      'DELETE FROM player_discord_links WHERE confidence_score < 1.0',
      { type: Sequelize.QueryTypes.DELETE }
    );

    console.log(`Migrated ${migratedCount} soft links to potential_player_links table`);
    console.log('player_discord_links now only contains verified (1.0 confidence) links');
  },

  async down(queryInterface, Sequelize) {
    // Reverse: Copy potential links back to player_discord_links
    // Map link_source: 'whitelist' -> 'manual' since original table doesn't have 'whitelist'
    await queryInterface.sequelize.query(`
      INSERT INTO player_discord_links
        (discord_user_id, steamid64, eosID, username, link_source, confidence_score, is_primary, metadata, created_at, updated_at)
      SELECT
        discord_user_id,
        steamid64,
        eosID,
        username,
        CASE
          WHEN link_source = 'whitelist' THEN 'manual'
          ELSE link_source
        END as link_source,
        confidence_score,
        0 as is_primary,
        metadata,
        created_at,
        updated_at
      FROM potential_player_links
      ON DUPLICATE KEY UPDATE
        confidence_score = GREATEST(player_discord_links.confidence_score, VALUES(confidence_score)),
        updated_at = NOW()
    `, { type: Sequelize.QueryTypes.INSERT });

    // Delete from potential_player_links (since they're now back in the main table)
    await queryInterface.sequelize.query(
      'DELETE FROM potential_player_links',
      { type: Sequelize.QueryTypes.DELETE }
    );

    console.log('Rolled back: soft links restored to player_discord_links table');
  }
};
