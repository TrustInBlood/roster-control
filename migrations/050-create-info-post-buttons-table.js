'use strict';

/**
 * Migration: Create info_post_buttons table
 * Stores configuration for info buttons on the whitelist post
 * Seeds initial data from config/infoPosts.js
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create the table
    await queryInterface.createTable('info_post_buttons', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      button_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Unique button identifier (e.g., info_seed_reward)'
      },
      button_label: {
        type: Sequelize.STRING(80),
        allowNull: false,
        comment: 'Display text on the button'
      },
      button_emoji: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Optional emoji displayed on the button'
      },
      channels: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Channel references for placeholders'
      },
      embed: {
        type: Sequelize.JSON,
        allowNull: false,
        comment: 'Full embed configuration'
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Order in which buttons appear'
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether the button is visible'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add indexes
    await queryInterface.addIndex('info_post_buttons', ['button_id'], {
      unique: true,
      name: 'idx_info_post_buttons_button_id'
    });

    await queryInterface.addIndex('info_post_buttons', ['display_order'], {
      name: 'idx_info_post_buttons_order'
    });

    await queryInterface.addIndex('info_post_buttons', ['enabled'], {
      name: 'idx_info_post_buttons_enabled'
    });

    // Seed initial data from production config
    const seedData = [
      {
        button_id: 'info_seed_reward',
        button_label: 'Seed Reward',
        button_emoji: '🌱',
        channels: null,
        embed: JSON.stringify({
          color: 0x00ff00,
          title: 'SEED REWARD',
          description: 'If you reach 100% whitelist reward, you will earn a 3-day whitelist. (type `!point` ingame)',
          fields: [
            {
              name: 'How It Works',
              value: 'You can only receive one reward per day - resets every day.\nWhitelist is stackable.\nWhitelist is added automatically to your account. Takes 1-2hrs to activate.',
              inline: false
            },
            {
              name: 'Rate',
              value: 'Rates vary depending on the situation.',
              inline: false
            },
            {
              name: 'Note',
              value: 'These rules can be changed for any reason.',
              inline: false
            }
          ],
          footer: {
            text: 'Updated: 11/21/2025'
          }
        }),
        display_order: 0,
        enabled: true
      },
      {
        button_id: 'info_service_members',
        button_label: 'Service Members',
        button_emoji: '🎖️',
        channels: JSON.stringify({
          tickets: '1204601712246001734'
        }),
        embed: JSON.stringify({
          color: 0xff0000,
          title: 'SERVICE MEMBERS AND FIRST RESPONDERS REWARD',
          description: 'The Bloody Bucket is now offering FREE whitelist **FOR LIFE** to Military and First Responders. (**1-YEAR** verification required)',
          fields: [
            {
              name: 'How to Apply',
              value: 'Just open a ticket in {#tickets} and provide the required proofs, and we can get you set up!',
              inline: false
            },
            {
              name: 'Important',
              value: '(Please DO NOT post a picture of your CAC here. It\'s illegal to take a photo of a CAC card.)',
              inline: false
            }
          ],
          footer: {
            text: 'Edited: 3/5/2025'
          }
        }),
        display_order: 1,
        enabled: true
      },
      {
        button_id: 'info_report_toxic',
        button_label: 'Report Toxic',
        button_emoji: '🚨',
        channels: JSON.stringify({
          tickets: '1204601712246001734'
        }),
        embed: JSON.stringify({
          color: 0xff4500,
          title: 'REPORT TOXIC PLAYERS',
          description: 'Reporting trolls, toxic players, or players with bad behavior will be rewarded with whitelist.',
          fields: [
            {
              name: 'Reward',
              value: 'A reward of 1-3 days each time depending on the situation. Occasionally 30 days could be rewarded.',
              inline: false
            },
            {
              name: 'Tip',
              value: 'Make sure to provide solid evidence and remind the staff about your reward.',
              inline: false
            },
            {
              name: 'How to Report',
              value: 'Open a ticket in {#tickets} with your evidence.',
              inline: false
            }
          ],
          footer: {
            text: 'Updated: 11/9/2025'
          }
        }),
        display_order: 2,
        enabled: true
      },
      {
        button_id: 'info_donation',
        button_label: 'Donation',
        button_emoji: '💰',
        channels: JSON.stringify({
          howToDonate: '1202285020480282706'
        }),
        embed: JSON.stringify({
          color: 0xffd700,
          title: 'DONATION',
          description: 'If you feel like supporting us, your contributions are greatly appreciated as we reward you with whitelist access:',
          fields: [
            {
              name: 'Donation Tiers',
              value: '**$10** for 6-month access for 1 person\n**$20** for **1-year** access for **2 people**\n**$25** for **1-year** access for **3 people**, and then only $5 for each additional person',
              inline: false
            },
            {
              name: 'Note',
              value: 'Donations are completely voluntary and are not a "pay-for-service" offer.',
              inline: false
            },
            {
              name: 'How to Donate',
              value: 'See {#howToDonate} for instructions.',
              inline: false
            }
          ],
          footer: {
            text: 'Updated: 9/22/2025'
          }
        }),
        display_order: 3,
        enabled: true
      },
      {
        button_id: 'info_steamid',
        button_label: 'Find SteamID',
        button_emoji: '❔',
        channels: null,
        embed: JSON.stringify({
          color: 0xffd700,
          title: 'How to Find Your SteamID',
          description: 'Use the guide below to quickly locate your SteamID.',
          fields: [
            {
              name: 'Steps',
              value: '1. Open your Steam profile.\n2. Copy the numbers at the end of your profile URL.\n\nHere\'s an example image:\nhttps://media.discordapp.net/attachments/1207033540999389185/1352427606682632342/image.png',
              inline: false
            }
          ],
          footer: {
            text: 'Updated: 12/10/2025'
          }
        }),
        display_order: 4,
        enabled: true
      }
    ];

    await queryInterface.bulkInsert('info_post_buttons', seedData);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('info_post_buttons');
  }
};
