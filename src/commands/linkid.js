const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { VerificationCode, PlayerDiscordLink } = require('../database/models');
const { config: whitelistConfig } = require('../../config/whitelist');
const { container } = require('../core/ServiceContainer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkid')
    .setDescription('Generate a verification code to link your Discord account with your game account'),
  
  async execute(interaction) {
    try {
      const discordUserId = interaction.user.id;

      // Check if user already has a Steam account linked
      const existingLink = await PlayerDiscordLink.findOne({
        where: {
          discord_user_id: discordUserId,
          is_primary: true
        },
        order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
      });

      if (existingLink && existingLink.steamid64 && existingLink.confidence_score >= 1.0) {
        const alreadyLinkedEmbed = {
          color: 0xffa500,
          title: 'Account Already Linked',
          description: 'Your Discord account is already linked to a Steam account with high confidence.',
          fields: [
            {
              name: 'Linked Steam ID',
              value: existingLink.steamid64,
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
            },
            {
              name: 'Need to change your link?',
              value: 'Use `/unlink` to remove your current link first, then use `/linkid` to create a new one.',
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Roster Control System'
          }
        };

        await interaction.reply({
          embeds: [alreadyLinkedEmbed],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // If user has a low-confidence link, show info but allow re-linking
      if (existingLink && existingLink.steamid64 && existingLink.confidence_score < 1.0) {
        const lowConfidenceEmbed = {
          color: 0xffaa00,
          title: 'Improving Your Account Link',
          description: 'You have an existing Steam account link with low confidence. You can verify in-game to improve your link confidence.',
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
              name: 'Why improve confidence?',
              value: 'Higher confidence links provide better whitelist access and are required for staff roles.',
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Proceeding to generate verification code...'
          }
        };

        await interaction.reply({
          embeds: [lowConfidenceEmbed],
          flags: MessageFlags.Ephemeral
        });

        // Brief delay to show the message before updating
        setTimeout(async () => {
          try {
            await interaction.editReply({ embeds: [lowConfidenceEmbed] });
          } catch (error) {
            // Ignore edit errors, proceed with verification code generation
          }
        }, 2000);
      }

      const verificationCode = await VerificationCode.createCode(
        discordUserId,
        whitelistConfig.verification.codeLength,
        whitelistConfig.verification.expirationMinutes
      );

      const isImproving = existingLink && existingLink.steamid64 && existingLink.confidence_score < 1.0;

      const embed = {
        color: 0x00ff00,
        title: isImproving ? 'Account Link Improvement Code Generated' : 'Account Linking Code Generated',
        description: `Your verification code is: **${verificationCode.code}**`,
        fields: [
          {
            name: 'Instructions',
            value: `Type this code in Squad game chat to ${isImproving ? 'improve your link confidence' : 'link your accounts'}:\n\`${verificationCode.code}\``,
            inline: false
          },
          {
            name: 'Expiration',
            value: `This code expires in ${whitelistConfig.verification.expirationMinutes} minutes (<t:${Math.floor(verificationCode.expiration.getTime() / 1000)}:R>)`,
            inline: false
          },
          {
            name: 'What happens next?',
            value: isImproving
              ? 'Once you type the code in-game, your link confidence will be improved and you\'ll have better access!'
              : 'Once you type the code in-game, you\'ll receive a confirmation message in Squad and your account will be linked!',
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Roster Control System'
        }
      };

      if (isImproving) {
        // If we already showed the low confidence message, edit the reply
        try {
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          // If edit fails (e.g., timing issue), just reply normally
          await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
          });
        }
      } else {
        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral
        });
      }

      // Store the interaction for later update
      const verificationService = container.get('verificationService');
      verificationService.addPendingVerification(verificationCode.code, {
        interaction,
        discordUserId,
        code: verificationCode.code,
        expiration: verificationCode.expiration,
        timestamp: Date.now(),
        isImproving
      });

      // Set timeout to update the message if code expires unused
      const timeoutCode = verificationCode.code; // Capture the code for the timeout
      setTimeout(async () => {
        const pending = verificationService.getPendingVerification(timeoutCode);
        if (pending) {
          try {
            const expiredEmbed = {
              color: 0xff4444,
              title: 'Verification Code Expired',
              description: `Your verification code **${pending.code}** has expired.`,
              fields: [
                {
                  name: 'What to do next?',
                  value: pending.isImproving
                    ? 'Run `/linkid` again to generate a new code and continue improving your link confidence.'
                    : 'Run `/linkid` again to generate a new code.',
                  inline: false
                }
              ],
              timestamp: new Date().toISOString(),
              footer: {
                text: 'Roster Control System'
              }
            };

            await pending.interaction.editReply({ embeds: [expiredEmbed] });
            verificationService.removePendingVerification(timeoutCode);

            interaction.client.logger?.info('Updated expired verification message', {
              code: pending.code,
              discordUserId: pending.discordUserId
            });
          } catch (error) {
            interaction.client.logger?.warn('Failed to update expired verification message', {
              error: error.message,
              code: timeoutCode
            });
          }
        }
      }, whitelistConfig.verification.expirationMinutes * 60 * 1000);

      interaction.client.logger?.info('Verification code generated', {
        discordUserId,
        code: verificationCode.code,
        expiration: verificationCode.expiration
      });

    } catch (error) {
      interaction.client.logger?.error('Failed to generate verification code', {
        discordUserId: interaction.user.id,
        error: error.message
      });

      await interaction.reply({
        content: 'Failed to generate verification code. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};