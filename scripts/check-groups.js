// Script to check groups and ensure default whitelist group exists
require('../config/config');
const { Group } = require('../src/database/models');
const { ensureDefaultWhitelistGroup } = require('../src/utils/ensureDefaultGroup');

async function checkGroups() {
  try {
    console.log('=== Current Groups ===');
    const groups = await Group.findAll();
    
    if (groups.length === 0) {
      console.log('No groups found in database');
    } else {
      groups.forEach(group => {
        console.log(`Group: ${group.group_name}, Permissions: ${group.permissions}`);
      });
    }
    
    console.log('\n=== Ensuring Default Whitelist Group ===');
    const whitelistGroup = await ensureDefaultWhitelistGroup();
    console.log(`Whitelist group ensured: ${whitelistGroup.group_name} (ID: ${whitelistGroup.id})`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkGroups();