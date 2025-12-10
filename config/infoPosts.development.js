/**
 * Development Info Posts Configuration
 * Contains embed content for informational buttons on the whitelist post
 *
 * ADDING NEW INFO BUTTONS:
 * Each entry must have:
 *   - Unique key name (e.g., SEED_REWARD, MY_BUTTON) - duplicates will be overwritten
 *   - buttonId: Must start with 'info_' prefix and be unique (e.g., 'info_my_button')
 *   - buttonLabel: Text displayed on the button
 *   - buttonEmoji: (optional) Emoji displayed on the button
 *   - embed: The embed content shown when clicked
 *
 * Buttons are automatically generated from this config - no code changes needed.
 * Use /reloadposts to apply changes without restarting the bot.
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
    buttonId: 'info_seed_reward',
    buttonLabel: 'Seed Reward',
    buttonEmoji: '🌱',
    embed: {
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
    }
  },

  SERVICE_MEMBERS: {
    buttonId: 'info_service_members',
    buttonLabel: 'Service Members',
    buttonEmoji: '🎖️',
    channels: {
      tickets: '1416292357887758439'  // Dev BOT_LOGS channel for testing
    },
    embed: {
      color: 0xff0000,
      title: 'SERVICE MEMBERS AND FIRST RESPONDERS REWARD',
      description: 'The Bloody Bucket is now offering FREE whitelist **FOR LIFE** to Military and First Responders. (**6-MONTH** verification required)',
      fields: [
        {
          name: 'How to Apply',
          value: 'Just open a ticket in {#tickets} and provide the required proof, and we can get you set up!',
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
    }
  },

  REPORT_TOXIC: {
    buttonId: 'info_report_toxic',
    buttonLabel: 'Report Toxic',
    buttonEmoji: '🚨',
    channels: {
      tickets: '1416292357887758439'  // Dev BOT_LOGS channel for testing
    },
    embed: {
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
    }
  },

  DONATION: {
    buttonId: 'info_donation',
    buttonLabel: 'Donation',
    buttonEmoji: '💰',
    channels: {
      howToDonate: '1416292357887758439'  // Dev BOT_LOGS channel for testing
    },
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
          value: 'See {#howToDonate} for instructions.',
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
