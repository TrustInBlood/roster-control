const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { VerificationCode } = require('../database/models');
const { config: whitelistConfig } = require('../../config/whitelist');
const { container } = require('../core/ServiceContainer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkid')
    .setDescription('Generate a verification code to link your Discord account with your game account'),
  
  async execute(interaction) {
    try {
      const discordUserId = interaction.user.id;

      const verificationCode = await VerificationCode.createCode(
        discordUserId,
        whitelistConfig.verification.codeLength,
        whitelistConfig.verification.expirationMinutes
      );

      const embed = {
        color: 0x00ff00,
        title: 'Account Linking Code Generated',
        description: `Your verification code is: **${verificationCode.code}**`,
        fields: [
          {
            name: 'Instructions',
            value: `Type this code in Squad game chat to link your accounts:\n\`${verificationCode.code}\``,
            inline: false
          },
          {
            name: 'Expiration',
            value: `This code expires in ${whitelistConfig.verification.expirationMinutes} minutes (<t:${Math.floor(verificationCode.expiration.getTime() / 1000)}:R>)`,
            inline: false
          },
          {
            name: 'What happens next?',
            value: 'Once you type the code in-game, you\'ll receive a confirmation message in Squad and your account will be linked!',
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Roster Control System'
        }
      };

      await interaction.reply({ 
        embeds: [embed], 
        flags: MessageFlags.Ephemeral 
      });

      // Store the interaction for later update
      const verificationService = container.get('verificationService');
      verificationService.addPendingVerification(verificationCode.code, {
        interaction,
        discordUserId,
        code: verificationCode.code,
        expiration: verificationCode.expiration,
        timestamp: Date.now()
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
                  value: 'Run `/linkid` again to generate a new code.',
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