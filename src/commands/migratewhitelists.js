const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { sendError, sendSuccess } = require('../utils/messageHandler');
const { Whitelist } = require('../database/models');
const BattleMetricsService = require('../services/BattleMetricsService');
const NotificationService = require('../services/NotificationService');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('migratewhitelists')
    .setDescription('Migrate active whitelists from BattleMetrics to database')
    .addBooleanOption(option =>
      option.setName('dryrun')
        .setDescription('Test run without creating database records')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Limit number of entries to migrate (for testing)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(1000))
    .addBooleanOption(option =>
      option.setName('skipduplicates')
        .setDescription('Skip entries that already exist in database')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('targetfilter')
        .setDescription('Only migrate entries containing this text (e.g., "service member")')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('sincedate')
        .setDescription('Only migrate entries created on or after this date (format: YYYY-MM-DD)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('donationsonly')
        .setDescription('Only migrate webhook-based donation entries (Rewarded Whitelist via Donation)')
        .setRequired(false)),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const dryRun = interaction.options.getBoolean('dryrun') ?? false;
        const limit = interaction.options.getInteger('limit') ?? null;
        const skipDuplicates = interaction.options.getBoolean('skipduplicates') ?? true;
        const targetFilter = interaction.options.getString('targetfilter')?.toLowerCase() || null;
        const sinceDateStr = interaction.options.getString('sincedate') || null;
        const donationsOnly = interaction.options.getBoolean('donationsonly') ?? false;

        // Validate and parse sincedate if provided
        let sinceDate = null;
        if (sinceDateStr) {
          const datePattern = /^\d{4}-\d{2}-\d{2}$/;
          if (!datePattern.test(sinceDateStr)) {
            await sendError(interaction, 'Invalid date format. Please use YYYY-MM-DD (e.g., 2025-09-01)');
            return;
          }
          sinceDate = new Date(sinceDateStr);
          if (isNaN(sinceDate.getTime())) {
            await sendError(interaction, 'Invalid date. Please check the date and try again.');
            return;
          }
        }

        // Test BattleMetrics connection first
        const connectionOk = await BattleMetricsService.testConnection();
        if (!connectionOk) {
          await sendError(interaction, 'Failed to connect to BattleMetrics API. Please check configuration.');
          return;
        }

        // Create progress embed
        const filterDescriptions = [];
        if (donationsOnly) filterDescriptions.push('Donations only');
        if (sinceDate) filterDescriptions.push(`Since ${sinceDateStr}`);
        if (targetFilter) filterDescriptions.push(`Target: "${targetFilter}"`);

        const title = filterDescriptions.length > 0
          ? `Filtered Migration (${filterDescriptions.join(', ')})`
          : 'Migrating BattleMetrics Whitelists';

        const progressEmbed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(dryRun ? '**DRY RUN MODE** - No database changes will be made' : 'Fetching whitelist data from BattleMetrics...')
          .setColor(0x5865f2)
          .addFields([
            { name: 'Status', value: 'Starting migration...', inline: false },
            { name: 'Progress', value: '0 entries processed', inline: true },
            { name: 'Mode', value: dryRun ? 'Dry Run' : 'Live Migration', inline: true }
          ])
          .setTimestamp();

        await interaction.editReply({ embeds: [progressEmbed] });

        // Fetch whitelists with progress updates (use server-side search if targetFilter specified)
        let totalFetched = 0;
        let oldEntriesEncountered = 0;
        const OLD_ENTRIES_THRESHOLD = 50; // Stop if we see 50 consecutive entries older than sinceDate

        // Use server-side search if targetFilter is specified, or use 'donation' for donationsOnly
        const searchFilter = donationsOnly ? 'donation' : targetFilter;

        // Use the provided limit or no limit
        const effectiveLimit = limit;
        const whitelists = await BattleMetricsService.fetchAllActiveWhitelists(async (progress) => {
          totalFetched = progress.totalFetched;

          // Stop fetching if we've reached the limit
          if (effectiveLimit && totalFetched >= effectiveLimit) {
            loggerConsole.log(`Reached limit of ${effectiveLimit} entries, stopping fetch...`);
            return false; // Signal to stop fetching
          }

          // If date filtering is enabled, check if recent entries are too old
          // BattleMetrics returns entries in reverse chronological order (newest first)
          if (sinceDate && progress.lastBatch && progress.lastBatch.length > 0) {
            let batchOldCount = 0;
            for (const entry of progress.lastBatch) {
              const createdAt = entry.battlemetricsMetadata?.originalCreatedAt;
              if (createdAt) {
                const entryDate = new Date(createdAt);
                if (entryDate < sinceDate) {
                  batchOldCount++;
                }
              }
            }

            // If entire batch is older than sinceDate, we've gone too far back in time
            if (batchOldCount === progress.lastBatch.length) {
              oldEntriesEncountered += batchOldCount;
              if (oldEntriesEncountered >= OLD_ENTRIES_THRESHOLD) {
                loggerConsole.log(`Encountered ${oldEntriesEncountered} consecutive entries older than ${sinceDateStr}, stopping fetch...`);
                return false; // Signal to stop fetching
              }
            } else {
              oldEntriesEncountered = 0; // Reset counter if we found recent entries
            }
          }

          progressEmbed.setFields([
            { name: 'Status', value: `Fetching page ${progress.currentPage}...`, inline: false },
            { name: 'Progress', value: `${progress.totalFetched} entries fetched${limit ? ` (limit: ${limit})` : ''}`, inline: true },
            { name: 'Mode', value: dryRun ? 'Dry Run' : 'Live Migration', inline: true }
          ]);

          try {
            await interaction.editReply({ embeds: [progressEmbed] });
          } catch (editError) {
            loggerConsole.error('Failed to update progress:', editError.message);
          }
        }, searchFilter);

        // Server-side filtering already applied via search parameter
        if (searchFilter) {
          loggerConsole.log(`Server-side search for "${searchFilter}" returned ${whitelists.length} entries`);
        }

        // Apply date filtering if specified (client-side, as BM API doesn't support date filtering)
        let filteredWhitelists = whitelists;
        let dateFilteredCount = 0;
        if (sinceDate) {
          filteredWhitelists = whitelists.filter(entry => {
            // Check if entry has a creation timestamp in metadata
            const createdAt = entry.battlemetricsMetadata?.originalCreatedAt;
            if (!createdAt) return true; // Keep entries without timestamp (safer than excluding)

            const entryDate = new Date(createdAt);
            return entryDate >= sinceDate;
          });
          dateFilteredCount = whitelists.length - filteredWhitelists.length;
          loggerConsole.log(`Date filter (since ${sinceDateStr}): ${filteredWhitelists.length} entries kept, ${dateFilteredCount} filtered out`);
        }

        // Apply donation-only filtering if specified (exact match on webhook format)
        let donationFilteredWhitelists = filteredWhitelists;
        let donationFilteredCount = 0;
        if (donationsOnly) {
          donationFilteredWhitelists = filteredWhitelists.filter(entry => {
            const reason = entry.reason || '';
            // Exact match for webhook-based donations
            return reason === 'Rewarded Whitelist via Donation';
          });
          donationFilteredCount = filteredWhitelists.length - donationFilteredWhitelists.length;
          loggerConsole.log(`Donation filter (exact match): ${donationFilteredWhitelists.length} entries kept, ${donationFilteredCount} filtered out`);
        }

        // Apply limit if specified (as a safety net)
        const finalWhitelists = limit ? donationFilteredWhitelists.slice(0, limit) : donationFilteredWhitelists;

        // Categorize by priority
        const categories = BattleMetricsService.categorizeWhitelists(finalWhitelists);
        
        // Process in priority order: donors -> first responders -> service members -> other
        const processingOrder = [
          { name: 'Donors', entries: categories.donors },
          { name: 'First Responders', entries: categories.firstResponders },
          { name: 'Service Members', entries: categories.servicemembers },
          { name: 'Other', entries: categories.other }
        ];

        let processedCount = 0;
        let createdCount = 0;
        let duplicateCount = 0;
        let errorCount = 0;
        let skippedCount = 0;
        const duplicates = new Map(); // steamId -> [existing, new] for longest expiration logic
        const skippedEntries = {
          noSteamId: 0,
          membership: 0,
          permanent: 0
        };

        for (const category of processingOrder) {
          if (category.entries.length === 0) continue;

          // Update progress for current category
          progressEmbed.setFields([
            { name: 'Status', value: `Processing ${category.name}...`, inline: false },
            { name: 'Progress', value: `${processedCount}/${finalWhitelists.length} entries processed`, inline: true },
            { name: 'Created', value: `${createdCount} new entries`, inline: true },
            { name: 'Duplicates', value: `${duplicateCount} duplicates found`, inline: true },
            { name: 'Skipped', value: `${skippedCount} entries skipped`, inline: true }
          ]);
          await interaction.editReply({ embeds: [progressEmbed] });

          for (const entry of category.entries) {
            try {
              if (!entry.player?.steamId) {
                loggerConsole.log(`SKIP (No Steam ID): ${entry.id} - Player: ${entry.player?.name || 'Unknown'}`);
                skippedEntries.noSteamId++;
                skippedCount++;
                processedCount++;
                continue;
              }

              // Filter out membership whitelists (permanent role-based whitelists)
              const reason = (entry.reason || '').toLowerCase();
              const note = (entry.note || '').toLowerCase();
              const membershipKeywords = ['membership', 'discord role', 'permanent', 'perm'];
              // More specific patterns to avoid false positives like "Service Member"
              const membershipPatterns = ['via membership', 'membership whitelist', 'role member', 'discord member'];
              
              const combined = `${reason} ${note}`;
              if (membershipKeywords.some(keyword => combined.includes(keyword)) || 
                  membershipPatterns.some(pattern => combined.includes(pattern))) {
                loggerConsole.log(`SKIP (Membership): ${entry.id} - ${entry.player.name} - "${entry.reason || entry.note}"`);
                skippedEntries.membership++;
                skippedCount++;
                processedCount++;
                continue;
              }

              // Also skip entries with no expiration (permanent) unless they're clearly temporary rewards
              const temporaryKeywords = ['seedpoint', 'reward', 'event', 'promo', 'temporary', 'temp'];
              if (!entry.expiresAt && !temporaryKeywords.some(keyword => reason.includes(keyword) || note.includes(keyword))) {
                loggerConsole.log(`SKIP (Permanent): ${entry.id} - ${entry.player.name} - "${entry.reason || entry.note}"`);
                skippedEntries.permanent++;
                skippedCount++;
                processedCount++;
                continue;
              }

              const steamId = entry.player.steamId;

              // Check for existing active whitelists
              const existingWhitelists = await Whitelist.findAll({
                where: { steamid64: steamId, revoked: false },
                order: [['granted_at', 'DESC']]
              });

              if (existingWhitelists.length > 0 && skipDuplicates) {
                // Find the active whitelist with longest expiration
                const activeWhitelist = await Whitelist.getActiveWhitelistForUser(steamId);
                
                if (activeWhitelist.isActive) {
                  const newExpiration = entry.expiresAt ? new Date(entry.expiresAt) : null;
                  const existingExpiration = activeWhitelist.expiration;
                  
                  // If new entry has longer expiration or existing is about to expire
                  if (newExpiration && existingExpiration) {
                    const shouldExtend = newExpiration > existingExpiration;
                    const existingSoon = (existingExpiration - new Date()) < (7 * 24 * 60 * 60 * 1000); // 7 days
                    
                    duplicates.set(steamId, {
                      existing: existingWhitelists[0],
                      new: entry,
                      shouldExtend: shouldExtend || existingSoon,
                      reason: shouldExtend ? 'longer_expiration' : (existingSoon ? 'expiring_soon' : 'duplicate')
                    });
                  } else {
                    duplicates.set(steamId, {
                      existing: existingWhitelists[0],
                      new: entry,
                      shouldExtend: false,
                      reason: 'permanent_exists'
                    });
                  }
                  
                  duplicateCount++;
                  processedCount++;
                  continue;
                }
              }

              if (!dryRun) {
                // Create new whitelist entry
                const duration = BattleMetricsService.calculateDuration(entry.expiresAt);

                // Determine source: donation if reason matches webhook format, otherwise import
                const isDonation = (entry.reason || '').includes('Rewarded Whitelist via Donation');
                const source = isDonation ? 'donation' : 'import';

                const whitelistData = {
                  steamid64: steamId,
                  eosID: entry.player.eosId,
                  username: entry.player.name,
                  reason: entry.reason || `Migrated from BattleMetrics (${category.name})`,
                  duration_value: duration.value,
                  duration_type: duration.type,
                  granted_by: interaction.user.id,
                  note: entry.note || `BM ID: ${entry.id}`,
                  metadata: entry.battlemetricsMetadata,
                  source: source
                };

                await Whitelist.grantWhitelist(whitelistData);
                createdCount++;
              } else {
                // Dry run - just count what we would create
                createdCount++;
              }

              processedCount++;

              // Update progress every 50 entries
              if (processedCount % 50 === 0) {
                progressEmbed.setFields([
                  { name: 'Status', value: `Processing ${category.name}...`, inline: false },
                  { name: 'Progress', value: `${processedCount}/${finalWhitelists.length} entries processed`, inline: true },
                  { name: 'Created', value: `${createdCount} new entries`, inline: true },
                  { name: 'Duplicates', value: `${duplicateCount} duplicates found`, inline: true },
                  { name: 'Skipped', value: `${skippedCount} entries skipped`, inline: true }
                ]);
                await interaction.editReply({ embeds: [progressEmbed] });
              }

            } catch (error) {
              loggerConsole.error(`Error processing whitelist entry ${entry.id}:`, error);
              errorCount++;
            }
          }
        }

        // Create final results embed
        const resultsEmbed = new EmbedBuilder()
          .setTitle(dryRun ? '🧪 Dry Run Complete' : '✅ Migration Complete')
          .setColor(errorCount > 0 ? 0xff9500 : 0x00ff00)
          .addFields([
            { name: 'Total Fetched', value: `${totalFetched} entries`, inline: true },
            { name: 'Processed', value: `${processedCount} entries`, inline: true },
            { name: 'Created', value: `${createdCount} new entries`, inline: true },
            { name: 'Duplicates Found', value: `${duplicateCount} entries`, inline: true },
            { name: 'Skipped', value: `${skippedCount} entries`, inline: true },
            { name: 'Errors', value: `${errorCount} errors`, inline: true },
            { name: 'Categories', value: [
              `Donors: ${categories.donors.length}`,
              `First Responders: ${categories.firstResponders.length}`,
              `Service Members: ${categories.servicemembers.length}`,
              `Other: ${categories.other.length}`
            ].join('\n'), inline: false }
          ])
          .setTimestamp();

        // Add filter statistics if filters were applied
        if (sinceDate || searchFilter || donationsOnly) {
          const filterStats = [];
          if (searchFilter) {
            filterStats.push(`Server-side search for "${searchFilter}": ${whitelists.length} entries returned`);
          }
          if (sinceDate && dateFilteredCount > 0) {
            filterStats.push(`Date filter (since ${sinceDateStr}): ${dateFilteredCount} entries filtered out, ${filteredWhitelists.length} kept`);
          }
          if (donationsOnly && donationFilteredCount > 0) {
            filterStats.push(`Donation filter (exact match): ${donationFilteredCount} entries filtered out, ${donationFilteredWhitelists.length} kept`);
          }

          if (filterStats.length > 0) {
            resultsEmbed.addFields([
              { name: '🔍 Filter Statistics', value: filterStats.join('\n'), inline: false }
            ]);
          }
        }

        // Add skip details if any were skipped
        if (skippedCount > 0) {
          const skipDetails = [];
          if (skippedEntries.noSteamId > 0) skipDetails.push(`No Steam ID: ${skippedEntries.noSteamId}`);
          if (skippedEntries.membership > 0) skipDetails.push(`Membership: ${skippedEntries.membership}`);
          if (skippedEntries.permanent > 0) skipDetails.push(`Permanent: ${skippedEntries.permanent}`);
          
          resultsEmbed.addFields([
            { 
              name: '⏭️ Skip Breakdown', 
              value: skipDetails.join('\n'), 
              inline: false 
            }
          ]);
        }

        if (duplicateCount > 0) {
          resultsEmbed.addFields([
            { 
              name: '📋 Duplicate Handling', 
              value: `${duplicateCount} existing entries found. Use \`skipduplicates: false\` to process duplicates or review manually.`,
              inline: false 
            }
          ]);
        }

        await interaction.editReply({ embeds: [resultsEmbed] });

        // Send notification to bot logs
        await NotificationService.send('whitelist', {
          title: dryRun ? 'Whitelist Migration Dry Run Completed' : 'Whitelist Migration Completed',
          description: `Migration processed ${processedCount} entries from BattleMetrics`,
          fields: [
            { name: 'Executed By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Mode', value: dryRun ? 'Dry Run' : 'Live Migration', inline: true },
            { name: 'Results', value: `${createdCount} created, ${duplicateCount} duplicates, ${errorCount} errors`, inline: false }
          ]
        });

      } catch (error) {
        loggerConsole.error('Migration command error:', error);
        await sendError(interaction, `Migration failed: ${error.message}`);
        
        // Log error to bot logs
        await NotificationService.send('whitelist', {
          title: '❌ Whitelist Migration Failed',
          description: `Migration command failed with error: ${error.message}`,
          fields: [
            { name: 'Executed By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Error', value: error.message, inline: false }
          ],
          color: 0xff0000
        });
      }
    });
  }
};