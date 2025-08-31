const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { withLoadingMessage, createResponseEmbed, sendSuccess, sendError } = require('../utils/messageHandler');
const { Whitelist } = require('../database/models');
const { WHITELIST_AWARD_ROLES } = require('../../config/discord');
const { 
  createOrUpdateLink, 
  resolveSteamIdFromDiscord, 
  resolveDiscordFromSteamId, 
  getUserInfo 
} = require('../utils/accountLinking');

// Helper function to validate Steam ID format
function isValidSteamId(steamid) {
  // Steam ID64 validation - 17 digits, typically starting with 76561197 or 76561198
  if (!steamid || typeof steamid !== 'string') return false;
  
  // Check if it's exactly 17 digits
  if (!/^[0-9]{17}$/.test(steamid)) return false;
  
  // Check if it starts with valid Steam ID64 prefixes
  return steamid.startsWith('76561197') || steamid.startsWith('76561198');
}

// Helper function to get role ID based on whitelist reason
function getRoleForReason(reason) {
  const roleMapping = {
    'service-member': WHITELIST_AWARD_ROLES.SERVICE_MEMBER,
    'first-responder': WHITELIST_AWARD_ROLES.FIRST_RESPONDER,
    'donator': WHITELIST_AWARD_ROLES.DONATOR,
    // 'reporting' has no specific role
  };
  
  return roleMapping[reason] || null;
}

// Note: Steam ID resolution is now handled by accountLinking utility

// Helper function to get user info from steamid or discord user (with auto-linking)
async function resolveUserInfo(steamid, discordUser, createLink = false) {
  let resolvedSteamId = steamid;
  let discordUsername = null;
  let username = null;
  let linkedAccount = false;

  if (discordUser) {
    discordUsername = `${discordUser.username}#${discordUser.discriminator}`;
    username = discordUser.displayName || discordUser.username;
  }

  if (!resolvedSteamId && discordUser) {
    // Try to resolve Steam ID from Discord user via account linking
    resolvedSteamId = await resolveSteamIdFromDiscord(discordUser.id);
    if (!resolvedSteamId) {
      throw new Error('Steam ID is required. No linked account found for this Discord user.');
    }
  }

  if (!isValidSteamId(resolvedSteamId)) {
    throw new Error('Invalid Steam ID format. Please provide a valid Steam ID64.');
  }

  // Create or update account link if both Discord and Steam info available
  if (createLink && discordUser && resolvedSteamId) {
    const linkResult = await createOrUpdateLink(
      discordUser.id, 
      resolvedSteamId, 
      null, // eosID
      username
    );
    
    if (!linkResult.error) {
      linkedAccount = linkResult.created ? 'created' : 'updated';
    }
  }

  return {
    steamid64: resolvedSteamId,
    discord_username: discordUsername,
    username: username,
    linkedAccount: linkedAccount
  };
}

// Helper function for info command - works with either user OR steamid  
async function resolveUserForInfo(steamid, discordUser) {
  // Use the comprehensive getUserInfo function
  const userInfo = await getUserInfo({
    discordUserId: discordUser?.id,
    steamid64: steamid,
    username: discordUser?.displayName || discordUser?.username
  });

  // Validate that we have at least a Steam ID
  if (!userInfo.steamid64) {
    if (discordUser && !steamid) {
      throw new Error('No linked Steam account found for this Discord user. Please provide a Steam ID.');
    } else {
      throw new Error('Please provide either a Discord user or Steam ID to check.');
    }
  }

  if (!isValidSteamId(userInfo.steamid64)) {
    throw new Error('Invalid Steam ID format. Please provide a valid Steam ID64.');
  }

  return {
    steamid64: userInfo.steamid64,
    discordUser: discordUser, // Keep original Discord user object for mentions
    hasLink: userInfo.hasLink,
    hasWhitelistHistory: userInfo.hasWhitelistHistory
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage whitelist entries for Squad servers')
    
    // Grant subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('grant')
        .setDescription('Grant whitelist access to a user')
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for granting whitelist')
            .setRequired(true)
            .addChoices(
              { name: 'Service Member (6 months)', value: 'service-member' },
              { name: 'First Responder (6 months)', value: 'first-responder' },
              { name: 'Donator', value: 'donator' },
              { name: 'Reporting', value: 'reporting' }
            ))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to grant whitelist')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 of the user')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('duration')
            .setDescription('Duration for donator whitelist')
            .setRequired(false)
            .addChoices(
              { name: '6 months', value: '6m' },
              { name: '1 year', value: '1y' }
            ))
        .addIntegerOption(option =>
          option.setName('days')
            .setDescription('Custom days for reporting (default: 7)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(365))
        .addStringOption(option =>
          option.setName('note')
            .setDescription('Additional note for this whitelist entry')
            .setRequired(false)))
    
    // Info subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Check whitelist status for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to check')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 to check')
            .setRequired(false)))
    
    // Extend subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('extend')
        .setDescription('Extend whitelist duration for a user')
        .addIntegerOption(option =>
          option.setName('months')
            .setDescription('Number of months to extend')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(24))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to extend')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 to extend')
            .setRequired(false)))
    
    // Revoke subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('revoke')
        .setDescription('Revoke whitelist access for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to revoke')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 to revoke')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for revocation')
            .setRequired(false))),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      const subcommand = interaction.options.getSubcommand();

      try {
        switch (subcommand) {
          case 'grant':
            await handleGrant(interaction);
            break;
          case 'info':
            await handleInfo(interaction);
            break;
          case 'extend':
            await handleExtend(interaction);
            break;
          case 'revoke':
            await handleRevoke(interaction);
            break;
          default:
            await sendError(interaction, 'Unknown subcommand.');
        }
      } catch (error) {
        console.error('Whitelist command error:', error);
        await sendError(interaction, error.message || 'An error occurred while processing the whitelist command.');
      }
    });
  }
};

async function handleGrant(interaction) {
  await withLoadingMessage(interaction, 'Processing whitelist grant...', async () => {
    const reason = interaction.options.getString('reason');
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');
    const duration = interaction.options.getString('duration');
    const days = interaction.options.getInteger('days');
    const note = interaction.options.getString('note');

    // Resolve user information and create account link
    const userInfo = await resolveUserInfo(steamid, discordUser, true);

    // Determine duration based on reason
    let durationValue, durationType;

    switch (reason) {
      case 'service-member':
      case 'first-responder':
        durationValue = 6;
        durationType = 'months';
        break;
      
      case 'donator':
        if (!duration) {
          throw new Error('Duration is required for donator whitelist. Please select 6m or 1y.');
        }
        durationValue = duration === '6m' ? 6 : 12;
        durationType = 'months';
        break;
      
      case 'reporting':
        durationValue = days || 7;
        durationType = 'days';
        break;
      
      default:
        throw new Error('Invalid reason specified.');
    }

    // Grant the whitelist
    const whitelistEntry = await Whitelist.grantWhitelist({
      steamid64: userInfo.steamid64,
      username: userInfo.username,
      discord_username: userInfo.discord_username,
      reason: reason,
      duration_value: durationValue,
      duration_type: durationType,
      granted_by: interaction.user.id,
      note: note
    });

    // Assign Discord role based on whitelist reason
    let roleAssigned = false;
    const roleId = getRoleForReason(reason);
    
    if (discordUser && roleId) {
      try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(discordUser.id).catch(() => null);
        
        if (member) {
          const role = guild.roles.cache.get(roleId);
          if (role && !member.roles.cache.has(roleId)) {
            await member.roles.add(role, `${reason.replace('-', ' ')} whitelist granted by ${interaction.user.tag}`);
            roleAssigned = true;
          }
        }
      } catch (error) {
        console.error(`Failed to assign ${reason} role:`, error);
        // Continue without failing the command
      }
    }

    // Format duration for display
    const durationText = durationType === 'months' 
      ? `${durationValue} month${durationValue > 1 ? 's' : ''}`
      : `${durationValue} day${durationValue > 1 ? 's' : ''}`;

    const embed = createResponseEmbed({
      title: '✅ Whitelist Granted',
      description: `Successfully granted whitelist access${roleAssigned ? ' and assigned Discord role' : ''}`,
      fields: [
        { name: 'User', value: discordUser ? `<@${discordUser.id}>` : 'Unknown Discord User', inline: true },
        { name: 'Steam ID', value: userInfo.steamid64, inline: true },
        { name: 'Reason', value: reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()), inline: true },
        { name: 'Duration', value: durationText, inline: true },
        { name: 'Expires', value: whitelistEntry.expiration ? whitelistEntry.expiration.toLocaleDateString() : 'Never', inline: true },
        { name: 'Granted By', value: `<@${interaction.user.id}>`, inline: true }
      ],
      color: 0x00FF00
    });

    if (roleAssigned) {
      const roleName = reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
      embed.addFields({ name: 'Discord Role', value: `✅ ${roleName} role assigned`, inline: true });
    } else if (roleId && discordUser) {
      embed.addFields({ name: 'Discord Role', value: '⚠️ Role assignment failed or user already has role', inline: true });
    } else if (discordUser && !roleId) {
      embed.addFields({ name: 'Discord Role', value: 'ℹ️ No specific role for this whitelist type', inline: true });
    }

    if (note) {
      embed.addFields({ name: 'Note', value: note, inline: false });
    }

    if (userInfo.linkedAccount) {
      embed.addFields({ 
        name: 'Account Link', 
        value: `✅ Discord-Steam link ${userInfo.linkedAccount}`, 
        inline: true 
      });
    }

    await sendSuccess(interaction, 'Whitelist granted successfully!', embed);
  });
}

async function handleInfo(interaction) {
  await withLoadingMessage(interaction, 'Checking whitelist status...', async () => {
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser, hasLink, hasWhitelistHistory } = await resolveUserForInfo(steamid, discordUser);

    // Get whitelist status with proper stacking calculation
    const whitelistStatus = await Whitelist.getActiveWhitelistForUser(resolvedSteamId);

    // Get history to show stacking info (without Group association to avoid error)
    const history = await Whitelist.findAll({
      where: { steamid64: resolvedSteamId },
      order: [['granted_at', 'DESC']]
    });
    const activeEntries = history.filter(entry => !entry.revoked);

    const embed = createResponseEmbed({
      title: '📋 Whitelist Status',
      description: `Whitelist information for ${resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'user'}`,
      fields: [
        { name: 'Steam ID', value: resolvedSteamId, inline: true },
        { name: 'Status', value: whitelistStatus.status, inline: true },
        { name: 'Account Link', value: hasLink ? '✅ Linked' : '❌ Not linked', inline: true }
      ],
      color: whitelistStatus.hasWhitelist ? 0x00FF00 : 0xFF0000
    });

    if (whitelistStatus.expiration) {
      embed.addFields({ 
        name: whitelistStatus.hasWhitelist ? 'Expires' : 'Expired', 
        value: whitelistStatus.expiration.toLocaleDateString(), 
        inline: true 
      });
    }

    // Show stacking info if there are multiple active entries
    if (activeEntries.length > 1) {
      const stackingInfo = activeEntries.map(entry => {
        const duration = `${entry.duration_value} ${entry.duration_type}`;
        const reason = entry.reason || 'Unknown';
        return `• ${reason}: ${duration}`;
      }).join('\n');
      
      embed.addFields({ 
        name: `Active Entries (${activeEntries.length})`, 
        value: stackingInfo, 
        inline: false 
      });
    }

    await sendSuccess(interaction, 'Whitelist status retrieved!', embed);
  });
}

async function handleExtend(interaction) {
  await withLoadingMessage(interaction, 'Extending whitelist...', async () => {
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');
    const months = interaction.options.getInteger('months');

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser } = await resolveUserForInfo(steamid, discordUser);

    // Extend the whitelist
    const extensionEntry = await Whitelist.extendWhitelist(
      resolvedSteamId, 
      months, 
      interaction.user.id
    );

    // Note: Extensions don't assign new roles - user should already have appropriate role from initial grant

    const embed = createResponseEmbed({
      title: '⏰ Whitelist Extended',
      description: `Successfully extended whitelist access`,
      fields: [
        { name: 'User', value: resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'Unknown Discord User', inline: true },
        { name: 'Steam ID', value: resolvedSteamId, inline: true },
        { name: 'Extension', value: `${months} month${months > 1 ? 's' : ''}`, inline: true },
        { name: 'New Entry Expires', value: extensionEntry.expiration.toLocaleDateString(), inline: true },
        { name: 'Extended By', value: `<@${interaction.user.id}>`, inline: true }
      ],
      color: 0x0099FF
    });

    await sendSuccess(interaction, 'Whitelist extended successfully!', embed);
  });
}

async function handleRevoke(interaction) {
  await withLoadingMessage(interaction, 'Revoking whitelist...', async () => {
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser } = await resolveUserForInfo(steamid, discordUser);

    // Revoke the whitelist
    const revokedCount = await Whitelist.revokeWhitelist(
      resolvedSteamId,
      reason,
      interaction.user.id
    );

    if (revokedCount === 0) {
      throw new Error('No active whitelist entries found for this user.');
    }

    // Remove Discord roles based on revoked whitelist entries
    let rolesRemoved = [];
    if (resolvedDiscordUser) {
      try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(resolvedDiscordUser.id).catch(() => null);
        
        if (member) {
          // Check if user still has any active whitelist entries
          const whitelistStatus = await Whitelist.getActiveWhitelistForUser(resolvedSteamId);
          
          // Only remove roles if user has no active whitelist entries
          if (!whitelistStatus.hasWhitelist) {
            // Check which whitelist roles the user has and remove them
            for (const [reasonKey, roleId] of Object.entries(WHITELIST_AWARD_ROLES)) {
              if (roleId && member.roles.cache.has(roleId)) {
                const role = guild.roles.cache.get(roleId);
                if (role) {
                  await member.roles.remove(role, `Whitelist revoked by ${interaction.user.tag}`);
                  rolesRemoved.push(reasonKey.toLowerCase().replace('_', ' '));
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to remove whitelist roles:', error);
        // Continue without failing the command
      }
    }

    const embed = createResponseEmbed({
      title: '❌ Whitelist Revoked',
      description: `Successfully revoked whitelist access${rolesRemoved.length > 0 ? ' and removed Discord roles' : ''}`,
      fields: [
        { name: 'User', value: resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'Unknown Discord User', inline: true },
        { name: 'Steam ID', value: resolvedSteamId, inline: true },
        { name: 'Entries Revoked', value: revokedCount.toString(), inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Revoked By', value: `<@${interaction.user.id}>`, inline: true }
      ],
      color: 0xFF0000
    });

    if (rolesRemoved.length > 0) {
      embed.addFields({ 
        name: 'Discord Roles', 
        value: `✅ Removed: ${rolesRemoved.join(', ')}`, 
        inline: true 
      });
    } else if (resolvedDiscordUser) {
      embed.addFields({ name: 'Discord Roles', value: '⚠️ Role removal not needed or failed', inline: true });
    }

    await sendSuccess(interaction, 'Whitelist revoked successfully!', embed);
  });
}