/**
 * Debug script to check role assignments and cache status
 * Run with: NODE_ENV=development node scripts/debug-roles.js
 */

// Load environment-specific config
if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: '.env.development' });
} else {
  require('dotenv').config();
}

const { Client, GatewayIntentBits } = require('discord.js');
const RoleBasedWhitelistCache = require('../src/services/RoleBasedWhitelistCache');
const { PlayerDiscordLink } = require('../src/database/models');

// Load environment-specific configurations
const isDevelopment = process.env.NODE_ENV === 'development';
const { DISCORD_ROLES } = require(isDevelopment ? '../config/discordRoles.development' : '../config/discordRoles');
const { SQUAD_GROUPS, getHighestPriorityGroup } = require(isDevelopment ? '../config/squadGroups.development' : '../config/squadGroups');

// Test logger
const testLogger = {
  info: (...args) => console.log('[INFO]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args),
  warn: (...args) => console.log('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

// Test config
const testConfig = {
  cache: { refreshSeconds: 60 }
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

async function debugRoles() {
  console.log('='.repeat(80));
  console.log('ROLE-BASED CACHE DEBUG');
  console.log('='.repeat(80));
  
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    console.error('❌ DISCORD_GUILD_ID not set');
    return;
  }
  
  try {
    const guild = await client.guilds.fetch(guildId);
    console.log(`\nDebugging in guild: ${guild.name}\n`);
    
    // 1. Check your Discord user and roles
    console.log('1. CHECKING YOUR DISCORD USER AND ROLES');
    console.log('-'.repeat(50));
    
    const botUser = client.user;
    let yourMember = null;
    
    // Try to find you by checking members with tracked roles
    const members = await guild.members.fetch();
    console.log(`Total guild members: ${members.size}`);
    
    // Show members with tracked roles
    const trackedRoleIds = Object.values(DISCORD_ROLES).filter(Boolean);
    console.log(`Tracked role IDs: ${trackedRoleIds.join(', ')}`);
    
    const membersWithRoles = [];
    for (const [memberId, member] of members) {
      const userRoles = member.roles.cache.filter(role => trackedRoleIds.includes(role.id));
      if (userRoles.size > 0) {
        membersWithRoles.push({
          id: memberId,
          tag: member.user.tag,
          roles: Array.from(userRoles.values()).map(r => r.name)
        });
      }
    }
    
    console.log(`\nMembers with tracked roles:`);
    if (membersWithRoles.length === 0) {
      console.log('  No members found with tracked roles!');
      console.log('  👆 This is likely the problem - assign yourself a role first');
    } else {
      membersWithRoles.forEach(member => {
        console.log(`  ${member.tag}: ${member.roles.join(', ')}`);
      });
    }
    
    // 2. Test role priority for members with roles
    console.log('\n2. TESTING ROLE PRIORITY FOR EACH MEMBER');
    console.log('-'.repeat(50));
    
    for (const memberInfo of membersWithRoles) {
      const member = members.get(memberInfo.id);
      const highestGroup = getHighestPriorityGroup(member.roles.cache);
      console.log(`  ${member.user.tag}: ${highestGroup || 'No group'}`);
    }
    
    // 3. Check Discord-Steam links
    console.log('\n3. CHECKING DISCORD-STEAM ACCOUNT LINKS');
    console.log('-'.repeat(50));
    
    for (const memberInfo of membersWithRoles) {
      try {
        const link = await PlayerDiscordLink.findOne({
          where: { discord_user_id: memberInfo.id, is_primary: true }
        });
        
        if (link) {
          console.log(`  ${memberInfo.tag}: Linked to Steam ${link.steamid64}`);
        } else {
          console.log(`  ${memberInfo.tag}: No Steam link found`);
        }
      } catch (error) {
        console.log(`  ${memberInfo.tag}: Database error - ${error.message}`);
      }
    }
    
    // 4. Initialize cache and check contents
    console.log('\n4. INITIALIZING ROLE-BASED CACHE');
    console.log('-'.repeat(50));
    
    const cache = new RoleBasedWhitelistCache(testLogger, testConfig);
    await cache.initializeFromGuild(guild);
    
    const counts = cache.getTotalCount();
    console.log(`Cache contents: ${JSON.stringify(counts)}`);
    
    // 5. Check cache contents in detail
    console.log('\n5. DETAILED CACHE CONTENTS');
    console.log('-'.repeat(50));
    
    const unlinkedStaff = cache.getUnlinkedStaff();
    if (unlinkedStaff.length > 0) {
      console.log('Unlinked staff:');
      unlinkedStaff.forEach(staff => {
        console.log(`  ${staff.username} (${staff.group}) - Discord ID: ${staff.discordId}`);
      });
    } else {
      console.log('No unlinked staff found');
    }
    
    // 6. Generate endpoint content
    console.log('\n6. TESTING ENDPOINT CONTENT');
    console.log('-'.repeat(50));
    
    const staffContent = await cache.getCachedStaff();
    const memberContent = await cache.getCachedMembers();
    
    console.log('Staff endpoint content:');
    console.log(staffContent);
    console.log('\nMember endpoint content:');
    console.log(memberContent);
    
    // 7. Manual role test
    console.log('\n7. MANUAL ROLE UPDATE TEST');
    console.log('-'.repeat(50));
    
    if (membersWithRoles.length > 0) {
      const testMember = members.get(membersWithRoles[0].id);
      const group = getHighestPriorityGroup(testMember.roles.cache);
      
      console.log(`Testing manual update for ${testMember.user.tag} (${group})`);
      await cache.updateUserRole(testMember.user.id, group, testMember);
      
      const newCounts = cache.getTotalCount();
      console.log(`Cache after manual update: ${JSON.stringify(newCounts)}`);
    }
    
  } catch (error) {
    console.error('Debug error:', error);
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}\n`);
  
  await debugRoles();
  
  client.destroy();
  process.exit(0);
});

client.on('error', error => {
  console.error('Discord client error:', error);
  process.exit(1);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('Failed to login:', error);
  process.exit(1);
});