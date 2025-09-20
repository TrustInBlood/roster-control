'use strict';

/**
 * Migration: Convert existing Discord role-based users to database whitelist entries
 *
 * This migration scans Discord guild members for staff/member roles and creates
 * corresponding database entries in the whitelists table with source='role'.
 * This ensures seamless transition to the unified database system.
 */

const { Client, GatewayIntentBits } = require('discord.js');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔄 Starting role-based user migration to database...');

    try {
      // Get environment variables
      const discordToken = process.env.DISCORD_TOKEN;
      const guildId = process.env.DISCORD_GUILD_ID;

      if (!discordToken || !guildId) {
        console.log('⚠️  DISCORD_TOKEN or DISCORD_GUILD_ID not set - skipping role migration');
        console.log('   This is OK for development/test environments and initial deployments');
        console.log('   Role-based entries will be created automatically as users interact with the bot');
        return;
      }

      // Check if this is a containerized environment (like Pterodactyl)
      // In production containers, Discord connections during migrations can be problematic
      const isContainer = process.env.PTERODACTYL || process.env.CONTAINER || process.env.DOCKER;
      if (isContainer && process.env.NODE_ENV === 'production') {
        console.log('⚠️  Container environment detected in production - skipping Discord migration');
        console.log('   Role-based entries will be created automatically when users join/get roles');
        console.log('   This is the recommended approach for containerized deployments');
        return;
      }

      // Load environment-specific squad groups configuration
      const isDevelopment = process.env.NODE_ENV === 'development';
      const configPath = isDevelopment ? '../config/squadGroups.development' : '../config/squadGroups';

      let SQUAD_GROUPS, getHighestPriorityGroup;
      try {
        ({ SQUAD_GROUPS, getHighestPriorityGroup } = require(configPath));

        if (!SQUAD_GROUPS || typeof SQUAD_GROUPS !== 'object') {
          console.log('⚠️  SQUAD_GROUPS configuration not found or invalid - skipping migration');
          console.log('   This is OK for production environments without role-based configuration');
          return;
        }

        if (!getHighestPriorityGroup || typeof getHighestPriorityGroup !== 'function') {
          console.log('⚠️  getHighestPriorityGroup function not found - skipping migration');
          return;
        }
      } catch (configError) {
        console.log(`⚠️  Could not load squad groups config from ${configPath} - skipping migration`);
        console.log('   Error:', configError.message);
        console.log('   This is OK for production environments without role-based configuration');
        return;
      }

      // Initialize Discord client
      const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
      });

      // Wait for Discord client to be ready
      await new Promise((resolve, reject) => {
        client.once('ready', resolve);
        client.once('error', reject);
        client.login(discordToken);
      });

      console.log(`✅ Connected to Discord as ${client.user.tag}`);

      // Fetch guild and members
      const guild = await client.guilds.fetch(guildId);
      console.log(`📋 Fetching members from guild: ${guild.name}`);

      const members = await guild.members.fetch();
      console.log(`👥 Found ${members.size} total members`);

      // Get all tracked roles for this environment
      const trackedRoles = [];
      try {
        for (const groupConfig of Object.values(SQUAD_GROUPS)) {
          if (groupConfig && groupConfig.discordRoles && Array.isArray(groupConfig.discordRoles)) {
            trackedRoles.push(...groupConfig.discordRoles);
          }
        }
      } catch (configError) {
        console.error('⚠️  Error loading squad groups configuration:', configError.message);
        console.log('   Skipping migration - no valid squad groups found');
        return;
      }

      console.log(`🎯 Tracking ${trackedRoles.length} role IDs`);

      if (trackedRoles.length === 0) {
        console.log('ℹ️  No tracked roles found - skipping migration');
        await client.destroy();
        return;
      }

      // Find members with tracked roles
      const membersWithRoles = [];
      for (const [memberId, member] of members) {
        if (member.user.bot) continue; // Skip bots

        const userGroup = getHighestPriorityGroup(member.roles.cache);
        if (userGroup) {
          membersWithRoles.push({
            discordUserId: memberId,
            userTag: member.user.tag,
            displayName: member.displayName || member.user.username,
            group: userGroup
          });
        }
      }

      console.log(`✨ Found ${membersWithRoles.length} members with tracked roles`);

      // Group by role for summary
      const roleGroups = {};
      membersWithRoles.forEach(m => {
        roleGroups[m.group] = (roleGroups[m.group] || 0) + 1;
      });
      console.log('📊 Role distribution:', roleGroups);

      if (membersWithRoles.length === 0) {
        console.log('ℹ️  No members with tracked roles found - migration complete');
        await client.destroy();
        return;
      }

      // Get existing primary Discord links for bulk processing
      const discordUserIds = membersWithRoles.map(m => m.discordUserId);

      const existingLinks = await queryInterface.sequelize.query(
        `SELECT discord_user_id, steamid64, confidence_score, link_source
         FROM player_discord_links
         WHERE discord_user_id IN (:discordUserIds)
         AND is_primary = true`,
        {
          replacements: { discordUserIds },
          type: Sequelize.QueryTypes.SELECT
        }
      );

      // Create lookup map
      const linksByDiscordId = new Map();
      existingLinks.forEach(link => {
        linksByDiscordId.set(link.discord_user_id, link);
      });

      console.log(`🔗 Found ${existingLinks.length} existing Discord-Steam links`);

      // Check for existing role-based entries to avoid duplicates
      const existingRoleEntries = await queryInterface.sequelize.query(
        `SELECT discord_user_id, role_name
         FROM whitelists
         WHERE source = 'role'
         AND discord_user_id IN (:discordUserIds)
         AND revoked = false`,
        {
          replacements: { discordUserIds },
          type: Sequelize.QueryTypes.SELECT
        }
      );

      const existingRoleMap = new Set();
      existingRoleEntries.forEach(entry => {
        existingRoleMap.add(`${entry.discord_user_id}:${entry.role_name}`);
      });

      console.log(`📝 Found ${existingRoleEntries.length} existing role-based database entries`);

      // Process each member and create database entries
      const entriesToCreate = [];
      let withSteamLinks = 0;
      let withoutSteamLinks = 0;
      let skippedDuplicates = 0;

      for (const member of membersWithRoles) {
        const entryKey = `${member.discordUserId}:${member.group}`;

        // Skip if entry already exists
        if (existingRoleMap.has(entryKey)) {
          skippedDuplicates++;
          continue;
        }

        const link = linksByDiscordId.get(member.discordUserId);
        const now = new Date();

        // Determine entry type and approval status
        const entryType = member.group === 'Member' ? 'whitelist' : 'staff';
        const steamId = link?.steamid64 || '00000000000000000'; // Placeholder for unlinked
        const approved = !!link; // Only approve if they have a Steam link

        const entry = {
          type: entryType,
          steamid64: steamId,
          discord_user_id: member.discordUserId,
          discord_username: member.userTag,
          username: member.displayName,
          source: 'role',
          role_name: member.group,
          approved: approved,
          revoked: false,
          granted_by: 'MIGRATION_SYSTEM',
          granted_at: now,
          reason: `Migrated from Discord role: ${member.group}`,
          // Role-based entries are permanent (no expiration)
          expiration: null,
          duration_value: null,
          duration_type: null,
          metadata: JSON.stringify({
            migration: true,
            migratedAt: now.toISOString(),
            originalDiscordRole: member.group,
            hasDiscordLink: !!link,
            linkConfidence: link?.confidence_score || 0,
            linkSource: link?.link_source || 'none'
          }),
          createdAt: now,
          updatedAt: now
        };

        entriesToCreate.push(entry);

        if (link) {
          withSteamLinks++;
        } else {
          withoutSteamLinks++;
        }
      }

      console.log(`\n📊 Migration Summary:`);
      console.log(`  - Total members to migrate: ${membersWithRoles.length}`);
      console.log(`  - With Steam links: ${withSteamLinks}`);
      console.log(`  - Without Steam links: ${withoutSteamLinks}`);
      console.log(`  - Skipped duplicates: ${skippedDuplicates}`);
      console.log(`  - New entries to create: ${entriesToCreate.length}`);

      if (entriesToCreate.length > 0) {
        // Bulk insert the entries
        await queryInterface.bulkInsert('whitelists', entriesToCreate);
        console.log(`✅ Successfully created ${entriesToCreate.length} role-based whitelist entries`);

        // Log detailed breakdown
        const typeBreakdown = entriesToCreate.reduce((acc, entry) => {
          const key = `${entry.type}:${entry.role_name}:${entry.approved ? 'approved' : 'pending'}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});

        console.log('\n📋 Entry breakdown:');
        Object.entries(typeBreakdown).forEach(([key, count]) => {
          console.log(`  - ${key}: ${count}`);
        });

        // Summary of unlinked staff that need attention
        const unlinkedStaff = entriesToCreate.filter(e =>
          e.type === 'staff' && !e.approved
        );

        if (unlinkedStaff.length > 0) {
          console.log(`\n⚠️  ${unlinkedStaff.length} staff members need Steam account linking:`);
          unlinkedStaff.forEach(entry => {
            console.log(`  - ${entry.discord_username} (${entry.role_name})`);
          });
          console.log('   These entries are created but not approved until Steam links exist.');
        }
      }

      // Disconnect Discord client
      await client.destroy();
      console.log('✅ Role-based user migration completed successfully');

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 Reversing role-based user migration...');

    // Remove all entries created by this migration
    const deletedCount = await queryInterface.sequelize.query(
      `DELETE FROM whitelists
       WHERE source = 'role'
       AND granted_by = 'MIGRATION_SYSTEM'`,
      { type: Sequelize.QueryTypes.DELETE }
    );

    console.log(`✅ Removed ${deletedCount} role-based entries created by migration`);
  }
};