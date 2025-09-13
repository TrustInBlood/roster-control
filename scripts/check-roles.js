/**
 * Script to check Discord role IDs and their names
 * Run with: node scripts/check-roles.js
 */

// Load environment-specific config
if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: '.env.development' });
} else {
  require('dotenv').config();
}

const { Client, GatewayIntentBits } = require('discord.js');

// Load environment-specific role config
const isDevelopment = process.env.NODE_ENV === 'development';
const { DISCORD_ROLES } = require(isDevelopment ? '../config/discordRoles.development' : '../config/discordRoles');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    console.error('DISCORD_GUILD_ID not set in environment');
    process.exit(1);
  }
  
  try {
    const guild = await client.guilds.fetch(guildId);
    console.log(`\nChecking roles in guild: ${guild.name}\n`);
    console.log('='.repeat(80));
    
    // Check each configured role
    for (const [roleName, roleId] of Object.entries(DISCORD_ROLES)) {
      if (!roleId) {
        console.log(`❌ ${roleName.padEnd(20)} -> NOT CONFIGURED`);
        continue;
      }
      
      try {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          const memberCount = role.members.size;
          console.log(`✅ ${roleName.padEnd(20)} -> "${role.name}" (${memberCount} members)`);
        } else {
          console.log(`⚠️  ${roleName.padEnd(20)} -> Role ID ${roleId} NOT FOUND in guild`);
        }
      } catch (error) {
        console.log(`❌ ${roleName.padEnd(20)} -> Error: ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\nRole Group Summaries:');
    console.log('-'.repeat(40));
    
    // Show admin roles
    const adminRoles = [
      DISCORD_ROLES.HEAD_ADMIN,
      DISCORD_ROLES.SQUAD_ADMIN,
      DISCORD_ROLES.MODERATOR,
      DISCORD_ROLES.SENIOR_ADMIN,
      DISCORD_ROLES.ADMIN
    ].filter(Boolean);
    
    console.log('\nAdmin Roles (have command permissions):');
    for (const roleId of adminRoles) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        console.log(`  • ${role.name} (${role.members.size} members)`);
      }
    }
    
    // Show tutor roles
    const tutorRoles = [
      DISCORD_ROLES.TUTOR,
      DISCORD_ROLES.TUTOR_LEAD,
      DISCORD_ROLES.TUTOR_ON_DUTY
    ].filter(Boolean);
    
    console.log('\nTutor Roles:');
    for (const roleId of tutorRoles) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        console.log(`  • ${role.name} (${role.members.size} members)`);
      }
    }
    
    // Show whitelist award roles
    const whitelistRoles = [
      DISCORD_ROLES.DONATOR,
      DISCORD_ROLES.FIRST_RESPONDER,
      DISCORD_ROLES.SERVICE_MEMBER
    ].filter(Boolean);
    
    console.log('\nWhitelist Award Roles:');
    for (const roleId of whitelistRoles) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        console.log(`  • ${role.name} (${role.members.size} members)`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\nSquad Group Mappings:');
    console.log('-'.repeat(40));
    
    const { SQUAD_GROUPS } = require(isDevelopment ? '../config/squadGroups.development' : '../config/squadGroups');
    
    for (const [groupName, groupData] of Object.entries(SQUAD_GROUPS)) {
      console.log(`\n${groupName}:`);
      if (groupData.discordRoles.length === 0) {
        console.log('  No roles configured');
      } else {
        for (const roleId of groupData.discordRoles) {
          if (roleId) {
            const role = guild.roles.cache.get(roleId);
            if (role) {
              console.log(`  • ${role.name}`);
            } else {
              console.log(`  • Role ${roleId} not found`);
            }
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('Error fetching guild or roles:', error);
  }
  
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