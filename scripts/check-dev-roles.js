/**
 * Script to check Discord role IDs in development environment
 * Run with: NODE_ENV=development node scripts/check-dev-roles.js
 */

require('dotenv').config({ path: '.env.development' });
const { Client, GatewayIntentBits } = require('discord.js');

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
    console.error('DISCORD_GUILD_ID not set in .env.development');
    process.exit(1);
  }
  
  try {
    const guild = await client.guilds.fetch(guildId);
    console.log(`\nChecking roles in DEVELOPMENT guild: ${guild.name}\n`);
    console.log('='.repeat(80));
    
    // Get all roles and display them
    const roles = Array.from(guild.roles.cache.values())
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position);
    
    console.log('Available Roles:');
    console.log('-'.repeat(40));
    roles.forEach(role => {
      const memberCount = role.members.size;
      console.log(`${role.name.padEnd(25)} -> ${role.id} (${memberCount} members)`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('\nSuggested Development Role Mappings:');
    console.log('-'.repeat(40));
    
    // Look for potential admin/staff roles
    const adminKeywords = ['admin', 'head', 'exec', 'owner', 'lead', 'senior'];
    const modKeywords = ['mod', 'staff', 'helper'];
    const memberKeywords = ['member', 'player', 'user'];
    
    console.log('\nPotential Admin Roles:');
    roles.filter(role => 
      adminKeywords.some(keyword => 
        role.name.toLowerCase().includes(keyword)
      )
    ).forEach(role => {
      console.log(`  EXECUTIVE_ADMIN: '${role.id}',  // "${role.name}"`);
    });
    
    console.log('\nPotential Moderator Roles:');
    roles.filter(role => 
      modKeywords.some(keyword => 
        role.name.toLowerCase().includes(keyword)
      )
    ).forEach(role => {
      console.log(`  MODERATOR: '${role.id}',  // "${role.name}"`);
    });
    
    console.log('\nPotential Member Roles:');
    roles.filter(role => 
      memberKeywords.some(keyword => 
        role.name.toLowerCase().includes(keyword)
      )
    ).forEach(role => {
      console.log(`  MEMBER: '${role.id}',  // "${role.name}"`);
    });
    
    console.log('\nOther Roles (you may want to create test roles):');
    roles.filter(role => {
      const name = role.name.toLowerCase();
      return !adminKeywords.some(k => name.includes(k)) &&
             !modKeywords.some(k => name.includes(k)) &&
             !memberKeywords.some(k => name.includes(k));
    }).forEach(role => {
      console.log(`  // '${role.id}',  // "${role.name}"`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('\nRecommendations:');
    console.log('1. Create test roles if needed: Test Admin, Test Mod, Test Member');
    console.log('2. Copy role IDs from above into config/discordRoles.development.js');
    console.log('3. Assign test roles to your development Discord account');
    console.log('4. Run: NODE_ENV=development node scripts/test-role-system.js');
    
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

// Login to Discord using development token
client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('Failed to login:', error);
  process.exit(1);
});