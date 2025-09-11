const { PlayerDiscordLink } = require('../src/database/models');
const { sequelize } = require('../config/database');

async function checkPlayerLink() {
  try {
    console.log('🔍 Checking for player discord link...\n');
    
    // Check for the specific Discord user from the error
    const discordUserId = '303655043146579971';
    const steamId = '76561198397781604';
    
    // Find by Discord ID
    const linkByDiscord = await PlayerDiscordLink.findOne({
      where: { discord_user_id: discordUserId }
    });
    
    if (linkByDiscord) {
      console.log('✅ Found link by Discord ID:');
      console.log('  Discord ID:', linkByDiscord.discord_user_id);
      console.log('  Steam ID:', linkByDiscord.steamid64);
      console.log('  Username:', linkByDiscord.username);
      console.log('  Link Source:', linkByDiscord.link_source);
      console.log('  Confidence:', linkByDiscord.confidence_score);
      console.log('  Created:', linkByDiscord.created_at);
      console.log('  Updated:', linkByDiscord.updated_at);
    } else {
      console.log('❌ No link found for Discord ID:', discordUserId);
    }
    
    console.log('\n-------------------\n');
    
    // Find by Steam ID
    const linkBySteam = await PlayerDiscordLink.findOne({
      where: { steamid64: steamId }
    });
    
    if (linkBySteam) {
      console.log('✅ Found link by Steam ID:');
      console.log('  Discord ID:', linkBySteam.discord_user_id);
      console.log('  Steam ID:', linkBySteam.steamid64);
      console.log('  Username:', linkBySteam.username);
      console.log('  Link Source:', linkBySteam.link_source);
      console.log('  Confidence:', linkBySteam.confidence_score);
      console.log('  Created:', linkBySteam.created_at);
      console.log('  Updated:', linkBySteam.updated_at);
    } else {
      console.log('❌ No link found for Steam ID:', steamId);
    }
    
    console.log('\n-------------------\n');
    
    // Check recent entries
    console.log('📋 Last 5 entries in player_discord_links:');
    const recentLinks = await PlayerDiscordLink.findAll({
      order: [['created_at', 'DESC']],
      limit: 5
    });
    
    recentLinks.forEach((link, index) => {
      console.log(`\n${index + 1}. Discord: ${link.discord_user_id}`);
      console.log(`   Steam: ${link.steamid64}`);
      console.log(`   Username: ${link.username}`);
      console.log(`   Source: ${link.link_source}`);
      console.log(`   Created: ${link.created_at}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking player link:', error);
  } finally {
    await sequelize.close();
  }
}

checkPlayerLink();