const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    // This migration fixes low-confidence links incorrectly marked as primary
    // Security fix: Prevent low-confidence links from granting staff privileges

    await queryInterface.sequelize.transaction(async (transaction) => {
      // Step 1: Find all Discord users who have multiple links
      const usersWithMultipleLinks = await queryInterface.sequelize.query(`
        SELECT discord_user_id, COUNT(*) as link_count, MAX(confidence_score) as max_confidence
        FROM player_discord_links
        GROUP BY discord_user_id
        HAVING COUNT(*) > 1
      `, {
        transaction,
        type: queryInterface.sequelize.QueryTypes.SELECT
      });

      console.log(`Found ${usersWithMultipleLinks.length} users with multiple links`);

      // Step 2: For each user with multiple links, ensure only the highest confidence link is primary
      for (const user of usersWithMultipleLinks) {
        // First, set all links for this user to is_primary = false
        await queryInterface.sequelize.query(`
          UPDATE player_discord_links
          SET is_primary = false
          WHERE discord_user_id = :discordUserId
        `, {
          replacements: { discordUserId: user.discord_user_id },
          transaction
        });

        // Then set only the highest confidence link to primary
        // If there are ties, prefer manual > squadjs > whitelist > ticket > import
        await queryInterface.sequelize.query(`
          UPDATE player_discord_links
          SET is_primary = true
          WHERE discord_user_id = :discordUserId
          AND id = (
            SELECT id FROM (
              SELECT id
              FROM player_discord_links
              WHERE discord_user_id = :discordUserId
              ORDER BY
                confidence_score DESC,
                CASE link_source
                  WHEN 'manual' THEN 1
                  WHEN 'squadjs' THEN 2
                  WHEN 'whitelist' THEN 3
                  WHEN 'ticket' THEN 4
                  WHEN 'import' THEN 5
                  ELSE 6
                END,
                created_at ASC
              LIMIT 1
            ) AS subquery
          )
        `, {
          replacements: { discordUserId: user.discord_user_id },
          transaction
        });
      }

      // Step 3: Log users who had low-confidence primary links
      const lowConfidencePrimaries = await queryInterface.sequelize.query(`
        SELECT discord_user_id, steamid64, confidence_score, link_source
        FROM player_discord_links
        WHERE is_primary = true
        AND confidence_score < 1.0
        AND discord_user_id IN (
          SELECT DISTINCT pdl.discord_user_id
          FROM player_discord_links pdl
          JOIN admins a ON a.discordUserId = pdl.discord_user_id
        )
      `, {
        transaction,
        type: queryInterface.sequelize.QueryTypes.SELECT
      });

      if (lowConfidencePrimaries.length > 0) {
        console.log('WARNING: Found staff members with low-confidence primary links:');
        lowConfidencePrimaries.forEach(link => {
          console.log(`  - Discord: ${link.discord_user_id}, Steam: ${link.steamid64}, ` +
                      `Confidence: ${link.confidence_score}, Source: ${link.link_source}`);
        });
      }

      // Step 4: Create audit log entries for security fix
      const auditEntries = lowConfidencePrimaries.map(link => ({
        actionType: 'SECURITY_FIX',
        actorType: 'system',
        actorId: 'MIGRATION',
        actorName: 'Migration 017',
        targetType: 'player_discord_link',
        targetId: link.discord_user_id,
        targetName: link.steamid64,
        guildId: null,
        description: `Fixed low-confidence link marked as primary. Confidence: ${link.confidence_score}, Source: ${link.link_source}`,
        beforeState: JSON.stringify({ is_primary: true, confidence_score: link.confidence_score }),
        afterState: JSON.stringify({ is_primary: false, confidence_score: link.confidence_score }),
        metadata: JSON.stringify({
          migration: '017-fix-low-confidence-primary-links',
          security_issue: 'low_confidence_staff_access',
          link_source: link.link_source
        }),
        severity: 'high',
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      if (auditEntries.length > 0) {
        await queryInterface.bulkInsert('audit_logs', auditEntries, { transaction });
        console.log(`Created ${auditEntries.length} audit log entries for security fix`);
      }

      console.log('Migration completed: Fixed low-confidence primary links');
    });
  },

  async down(queryInterface, Sequelize) {
    // This migration is not reversible as it fixes a security issue
    // We don't want to restore the vulnerable state
    console.log('This migration cannot be reversed (security fix)');
  }
};