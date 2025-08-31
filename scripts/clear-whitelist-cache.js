// Script to clear whitelist cache and test fresh data
require('../config/config');
const { Whitelist, Group } = require('../src/database/models');

async function clearCacheAndTest() {
  try {
    console.log('Checking current whitelist data...');
    
    console.log('\n=== Current Whitelist Database Entries ===');
    const entries = await Whitelist.findAll({
      order: [['granted_at', 'DESC']],
      limit: 10
    });
    
    entries.forEach(entry => {
      console.log(`Steam ID: ${entry.steamid64}`);
      console.log(`Username: ${entry.username || 'N/A'}`);
      console.log(`Discord: ${entry.discord_username || 'N/A'}`);
      console.log(`Reason: ${entry.reason || 'N/A'}`);
      console.log(`Revoked: ${entry.revoked}`);
      console.log(`Granted at: ${entry.granted_at}`);
      console.log(`Group ID: ${entry.group_id || 'N/A'}`);
      console.log('---');
    });
    
    console.log('\n=== Testing getActiveEntries ===');
    const activeEntries = await Whitelist.getActiveEntries('whitelist');
    console.log(`Found ${activeEntries.length} active entries`);
    
    activeEntries.forEach(entry => {
      console.log(`Active: ${entry.steamid64} - ${entry.username} - Group: ${entry.group?.group_name || 'None'}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

clearCacheAndTest();