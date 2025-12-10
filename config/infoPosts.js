/**
 * Production Info Posts Configuration
 * Contains embed content for informational buttons on the whitelist post
 *
 * CHANNEL REFERENCES:
 * You can reference Discord channels in your embed text using placeholders:
 *   {#channelKey} - Will be replaced with <#channelId> when displayed
 *
 * To add a channel reference:
 * 1. Add a 'channels' object to the info post config
 * 2. Define channel keys with their Discord channel IDs
 * 3. Use {#channelKey} in your description or field values
 *
 * Example:
 *   EXAMPLE_POST: {
 *     buttonLabel: 'Example',
 *     buttonEmoji: '📌',
 *     channels: {
 *       tickets: '1234567890123456789',
 *       rules: '9876543210987654321'
 *     },
 *     embed: {
 *       title: 'Example',
 *       description: 'Open a ticket in {#tickets} or read {#rules}',
 *       ...
 *     }
 *   }
 *
 * You can also use raw Discord channel mentions: <#1234567890123456789>
 */
const INFO_POSTS = {
  SEED_REWARD: {
    buttonLabel: 'Seed Reward',
    buttonEmoji: '🌱',
    embed: {
      color: 0x00ff00,
      title: 'SEED REWARD',
      description: 'If you reach 100% whitelist reward, you will earn a 3-day whitelist. (type `!point` ingame)',
      fields: [
        {
          name: 'How It Works',
          value: 'You can only receive one reward per day - Reset Everyday.\nWhitelist is stackable.\nWhitelist is added automatically to your account. Take 1-2hrs to activate.',
          inline: false
        },
        {
          name: 'Rate',
          value: 'Rate is vary depending on situations.',
          inline: false
        },
        {
          name: 'Note',
          value: 'This play rules can be changed for any reason.',
          inline: false
        }
      ],
      footer: {
        text: 'Updated: 11/21/2025'
      }
    }
  },

  SERVICE_MEMBERS: {
    buttonLabel: 'Service Members',
    buttonEmoji: '🎖️',
    embed: {
      color: 0xff0000,
      title: 'SERVICE MEMBERS AND FIRST RESPONDERS REWARD',
      description: 'The Bloody Bucket is now offering FREE whitelist **FOR LIFE** to Military and First Responders. (**6-MONTH** each verify)',
      fields: [
        {
          name: 'How to Apply',
          value: 'Just open up a ticket and provide required proofs and we can get you set up!',
          inline: false
        },
        {
          name: 'Important',
          value: '(Please DO NOT post a picture of your CAC here. It\'s illegal to take photo of a CAC card.)',
          inline: false
        }
      ],
      footer: {
        text: 'Edited: 3/5/2025'
      }
    }
  },

  REPORT_TOXIC: {
    buttonLabel: 'Report Toxic',
    buttonEmoji: '🚨',
    embed: {
      color: 0xff4500,
      title: 'REPORT TOXIC PLAYERS',
      description: 'Reporting a troll, toxic, or bad behavior players will be rewarded with whitelist.',
      fields: [
        {
          name: 'Reward',
          value: 'A reward is 1-3 days each time depending on the situation. Occasionally 30 days could be rewarded out.',
          inline: false
        },
        {
          name: 'Tip',
          value: 'Make sure to provide a solid evidence and remind the staff for your reward.',
          inline: false
        }
      ],
      footer: {
        text: 'Update: 11/9/2025'
      }
    }
  },

  DONATION: {
    buttonLabel: 'Donation',
    buttonEmoji: '💰',
    embed: {
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
          value: 'See the how-to-donate channel for instructions.',
          inline: false
        }
      ],
      footer: {
        text: 'Updated: 9/22/2025'
      }
    }
  }
};

module.exports = { INFO_POSTS };
