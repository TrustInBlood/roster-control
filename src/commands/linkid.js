const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { PlayerDiscordLink, UnlinkHistory } = require('../database/models');
const { isValidSteamId } = require('../utils/steamId');
const { triggerUserRoleSync } = require('../utils/triggerUserRoleSync');
const { getRoleArchiveService } = require('../services/RoleArchiveService');
const { Op } = require('sequelize');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkid')
    .setDescription('Link your Discord account to your Steam account')
    .addStringOption(option =>
      option.setName('steamid')
        .setDescription('Your 17-digit Steam ID64 (e.g., 76561198XXXXXXXXX)')
        .setRequired(true)),

  async execute(interaction) {
    try {
      // Defer reply immediately to prevent timeout
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const discordUserId = interaction.user.id;
      const steamId = interaction.options.getString('steamid').trim();

      // Validate Steam ID format
      if (!isValidSteamId(steamId)) {
        const invalidEmbed = {
          color: 0xff4444,
          title: '❌ Invalid Steam ID',
          description: 'The Steam ID you provided is not valid.',
          fields: [
            {
              name: 'What you entered',
              value: `\`${steamId}\``,
              inline: false
            },
            {
              name: 'Expected format',
              value: 'Steam ID64 must be exactly 17 digits starting with 7656119',
              inline: false
            },
            {
              name: 'Example',
              value: '`76561198123456789`',
              inline: false
            },
            {
              name: 'How to find your Steam ID',
              value: 'Visit [steamid.io](https://steamid.io) and enter your Steam profile URL or locate it on your Steam profile page.',
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Roster Control System'
          }
        };

        await interaction.editReply({ embeds: [invalidEmbed] });
        return;
      }

      // Check for 30-day cooldown from recent unlink
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentUnlink = await UnlinkHistory.findOne({
        where: {
          discord_user_id: discordUserId,
          unlinked_at: {
            [Op.gt]: thirtyDaysAgo
          }
        },
        order: [['unlinked_at', 'DESC']]
      });

      if (recentUnlink) {
        const unlinkDate = new Date(recentUnlink.unlinked_at);
        const cooldownEndDate = new Date(unlinkDate);
        cooldownEndDate.setDate(cooldownEndDate.getDate() + 30);

        const daysRemaining = Math.ceil((cooldownEndDate - new Date()) / (1000 * 60 * 60 * 24));

        const cooldownEmbed = {
          color: 0xff4444,
          title: '⏳ Cooldown Active',
          description: 'You recently unlinked your Steam ID and must wait before linking again.',
          fields: [
            {
              name: 'Previous Steam ID',
              value: recentUnlink.steamid64,
              inline: true
            },
            {
              name: 'Unlinked On',
              value: `<t:${Math.floor(unlinkDate.getTime() / 1000)}:F>`,
              inline: true
            },
            {
              name: 'Days Remaining',
              value: `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
              inline: true
            },
            {
              name: 'Cooldown Ends',
              value: `<t:${Math.floor(cooldownEndDate.getTime() / 1000)}:R>`,
              inline: false
            },
            {
              name: 'Why the cooldown?',
              value: 'This prevents abuse of the linking system. Contact staff if you need urgent help.',
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Roster Control System'
          }
        };

        await interaction.editReply({ embeds: [cooldownEmbed] });
        return;
      }

      // Check if user already has a Steam account linked
      const existingLink = await PlayerDiscordLink.findOne({
        where: {
          discord_user_id: discordUserId,
          is_primary: true
        },
        order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
      });

      // Case 1: User is linking the SAME Steam ID (upgrade to 1.0 confidence)
      if (existingLink && existingLink.steamid64 === steamId) {
        if (existingLink.confidence_score >= 1.0) {
          const alreadyLinkedEmbed = {
            color: 0x00ff00,
            title: '✅ Already Linked at Maximum Confidence',
            description: 'Your Discord account is already linked to this Steam ID with maximum confidence.',
            fields: [
              {
                name: 'Steam ID',
                value: steamId,
                inline: true
              },
              {
                name: 'Link Confidence',
                value: `${(existingLink.confidence_score * 100).toFixed(0)}%`,
                inline: true
              },
              {
                name: 'Linked Since',
                value: `<t:${Math.floor(existingLink.created_at.getTime() / 1000)}:R>`,
                inline: true
              }
            ],
            timestamp: new Date().toISOString(),
            footer: {
              text: 'Roster Control System'
            }
          };

          await interaction.editReply({ embeds: [alreadyLinkedEmbed] });
          return;
        }

        // Upgrade confidence to 1.0
        await existingLink.update({
          confidence_score: 1.0,
          link_source: 'manual',
          metadata: {
            ...existingLink.metadata,
            confidence_upgrade: {
              upgraded_by: discordUserId,
              upgraded_at: new Date().toISOString(),
              previous_confidence: existingLink.confidence_score,
              upgrade_method: 'linkid_direct'
            }
          }
        });

        const upgradeEmbed = {
          color: 0x00ff00,
          title: '✅ Link Confidence Upgraded',
          description: 'Your account link confidence has been upgraded to maximum!',
          fields: [
            {
              name: 'Steam ID',
              value: steamId,
              inline: true
            },
            {
              name: 'Previous Confidence',
              value: `${(existingLink.confidence_score * 100).toFixed(0)}%`,
              inline: true
            },
            {
              name: 'New Confidence',
              value: '100%',
              inline: true
            },
            {
              name: 'What changed?',
              value: 'You now have full whitelist access and can use all features that require account linking.',
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Roster Control System'
          }
        };

        await interaction.editReply({ embeds: [upgradeEmbed] });

        // Trigger role sync
        await triggerUserRoleSync(interaction.client, discordUserId, {
          source: 'linkid_upgrade',
          skipNotification: true
        });

        // Check for archived roles to restore
        const roleArchiveService = getRoleArchiveService(interaction.client);
        const restoreResult = await roleArchiveService.restoreUserRoles(
          discordUserId,
          interaction.guild,
          discordUserId
        );

        if (restoreResult.restoredRoles && restoreResult.restoredRoles.length > 0) {
          const restoredNames = restoreResult.restoredRoles
            .filter(r => r.restored)
            .map(r => r.name);

          if (restoredNames.length > 0) {
            // Send follow-up message about restored roles
            await interaction.followUp({
              embeds: [{
                color: 0x00ff00,
                title: '🔄 Roles Restored',
                description: 'Your previously removed roles have been restored!',
                fields: [{
                  name: 'Restored Roles',
                  value: restoredNames.join(', '),
                  inline: false
                }],
                timestamp: new Date().toISOString(),
                footer: { text: 'Roster Control System' }
              }],
              flags: MessageFlags.Ephemeral
            });
          }
        }

        interaction.client.logger?.info('User upgraded link confidence via /linkid', {
          discordUserId,
          steamId,
          previousConfidence: existingLink.confidence_score,
          rolesRestored: restoreResult.restoredRoles?.filter(r => r.restored).length || 0
        });

        return;
      }

      // Case 2: User is linking a DIFFERENT Steam ID AND has 1.0 confidence (block)
      if (existingLink && existingLink.steamid64 !== steamId && existingLink.confidence_score >= 1.0) {
        const blockEmbed = {
          color: 0xffa500,
          title: '🔒 Cannot Change Steam ID',
          description: 'You already have a verified Steam ID linked. You must unlink it first.',
          fields: [
            {
              name: 'Current Steam ID',
              value: existingLink.steamid64,
              inline: true
            },
            {
              name: 'Current Confidence',
              value: `${(existingLink.confidence_score * 100).toFixed(0)}%`,
              inline: true
            },
            {
              name: 'Linked Since',
              value: `<t:${Math.floor(existingLink.created_at.getTime() / 1000)}:R>`,
              inline: true
            },
            {
              name: 'Want to change your Steam ID?',
              value: '⚠️ **Important**: Use `/unlink` to remove your current link.\n\n**Warning**: You will have a **30-day cooldown** after unlinking before you can link a new Steam ID.',
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Roster Control System'
          }
        };

        await interaction.editReply({ embeds: [blockEmbed] });
        return;
      }

      // Case 3: User is linking a DIFFERENT Steam ID AND has < 1.0 confidence (allow overwrite)
      // OR user has no existing link (new link)
      const { link, created } = await PlayerDiscordLink.createOrUpdateLink(
        discordUserId,
        steamId,
        null, // eosId
        interaction.user.username,
        {
          linkSource: 'manual',
          confidenceScore: 1.0,
          isPrimary: true,
          metadata: {
            direct_link: true,
            created_by_command: 'linkid',
            created_at: new Date().toISOString(),
            replaced_link: existingLink ? {
              previous_steamid: existingLink.steamid64,
              previous_confidence: existingLink.confidence_score,
              replaced_at: new Date().toISOString()
            } : null
          }
        }
      );

      const successEmbed = {
        color: 0x00ff00,
        title: created ? '✅ Steam ID Linked Successfully' : '✅ Steam ID Updated Successfully',
        description: `Your Discord account is now linked to Steam ID \`${steamId}\` with maximum confidence.`,
        fields: [
          {
            name: 'Steam ID',
            value: steamId,
            inline: true
          },
          {
            name: 'Link Confidence',
            value: '100%',
            inline: true
          },
          {
            name: 'Link Type',
            value: created ? 'New Link' : 'Updated Link',
            inline: true
          },
          {
            name: 'What now?',
            value: 'Your Steam ID is now linked to your Discord account! Your roles will be synchronized automatically.',
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Roster Control System'
        }
      };

      if (existingLink && existingLink.steamid64 !== steamId) {
        successEmbed.fields.push({
          name: 'Previous Steam ID',
          value: `\`${existingLink.steamid64}\` (replaced)`,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [successEmbed] });

      // Trigger role sync
      await triggerUserRoleSync(interaction.client, discordUserId, {
        source: 'linkid_direct',
        skipNotification: false
      });

      // Check for archived roles to restore
      const roleArchiveService = getRoleArchiveService(interaction.client);
      const restoreResult = await roleArchiveService.restoreUserRoles(
        discordUserId,
        interaction.guild,
        discordUserId
      );

      if (restoreResult.restoredRoles && restoreResult.restoredRoles.length > 0) {
        const restoredNames = restoreResult.restoredRoles
          .filter(r => r.restored)
          .map(r => r.name);

        if (restoredNames.length > 0) {
          // Send follow-up message about restored roles
          await interaction.followUp({
            embeds: [{
              color: 0x00ff00,
              title: '🔄 Roles Restored',
              description: 'Your previously removed roles have been restored!',
              fields: [{
                name: 'Restored Roles',
                value: restoredNames.join(', '),
                inline: false
              }],
              timestamp: new Date().toISOString(),
              footer: { text: 'Roster Control System' }
            }],
            flags: MessageFlags.Ephemeral
          });
        }
      }

      interaction.client.logger?.info('User linked Steam ID via /linkid', {
        discordUserId,
        steamId,
        created,
        replacedPrevious: existingLink && existingLink.steamid64 !== steamId,
        rolesRestored: restoreResult.restoredRoles?.filter(r => r.restored).length || 0
      });

    } catch (error) {
      interaction.client.logger?.error('Failed to link Steam ID', {
        discordUserId: interaction.user.id,
        error: error.message
      });

      const replyMethod = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
      await interaction[replyMethod]({
        content: 'Failed to link Steam ID. Please try again later or contact staff for help.',
        flags: replyMethod === 'reply' ? MessageFlags.Ephemeral : undefined
      });
    }
  }
};
