/**
 * Test cache initialization specifically
 * Run with: NODE_ENV=development node scripts/test-cache-init.js
 */

// Load environment-specific config
if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: '.env.development' });
} else {
  require('dotenv').config();
}

const { Client, GatewayIntentBits } = require('discord.js');
const RoleBasedWhitelistCache = require('../src/services/RoleBasedWhitelistCache');

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

const testConfig = { cache: { refreshSeconds: 60 } };

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

async function testCacheInit() {
  console.log('Testing Cache Initialization');
  console.log('='.repeat(50));
  
  const guildId = process.env.DISCORD_GUILD_ID;
  const guild = await client.guilds.fetch(guildId);
  
  console.log(`Guild: ${guild.name}`);
  
  // Create cache
  const cache = new RoleBasedWhitelistCache(testLogger, testConfig);
  
  // Manually step through initialization
  console.log('\n1. Fetching guild members...');
  const members = await guild.members.fetch();
  console.log(`Found ${members.size} members`);
  
  console.log('\n2. Processing each member...');
  let processedCount = 0;
  
  for (const [memberId, member] of members) {
    console.log(`\nProcessing ${member.user.tag} (${memberId})`);
    
    // Check if member has any tracked roles
    const highestGroup = getHighestPriorityGroup(member.roles.cache);
    console.log(`  Highest group: ${highestGroup || 'none'}`);
    
    if (highestGroup) {
      console.log(`  Has tracked roles, checking Steam link...`);
      
      // Get Steam ID link
      const { PlayerDiscordLink } = require('../src/database/models');
      const link = await PlayerDiscordLink.findOne({
        where: { discord_user_id: memberId, is_primary: true }
      });
      
      if (link) {
        console.log(`  Steam linked: ${link.steamid64}`);
        const userData = {
          username: link.steam_username || '',
          discord_username: member.user.username || '',
          discordId: memberId
        };
        
        console.log(`  Adding to cache: ${highestGroup}`);
        cache.addUser(link.steamid64, highestGroup, userData);
        processedCount++;
      } else if (highestGroup !== 'Member') {
        console.log(`  No Steam link - adding as unlinked staff`);
        const userData = {
          username: member.displayName || member.user.username || '',
          discord_username: member.user.username || ''
        };
        
        cache.addUnlinkedStaff(memberId, highestGroup, userData);
        processedCount++;
      } else {
        console.log(`  No Steam link and is Member group - skipping`);
      }
    } else {
      console.log(`  No tracked roles - skipping`);
    }
  }
  
  console.log(`\n3. Final cache state:`);
  const counts = cache.getTotalCount();
  console.log(JSON.stringify(counts, null, 2));
  
  console.log(`\n4. Testing content generation:`);
  const staffContent = await cache.getCachedStaff();
  const memberContent = await cache.getCachedMembers();
  
  console.log('\nStaff content:');
  console.log(staffContent);
  console.log('\nMember content:');
  console.log(memberContent);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}\n`);
  
  await testCacheInit();
  
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('Failed to login:', error);
  process.exit(1);
});