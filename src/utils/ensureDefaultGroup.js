const { Group } = require('../database/models');

/**
 * Ensures the default "whitelisted" group exists with "reserve" permission
 * @returns {Object} The whitelisted group
 */
async function ensureDefaultWhitelistGroup() {
  try {
    // Try to find existing whitelisted group
    let group = await Group.findByName('whitelisted');
    
    if (!group) {
      // Create the default whitelisted group
      group = await Group.create({
        group_name: 'whitelisted',
        permissions: 'reserve'
      });
      
      console.log('Created default whitelisted group with reserve permission');
    } else {
      // Ensure it has the correct permissions
      if (group.permissions !== 'reserve') {
        group.permissions = 'reserve';
        await group.save();
        console.log('Updated whitelisted group permissions to "reserve"');
      }
    }
    
    return group;
  } catch (error) {
    console.error('Failed to ensure default whitelist group:', error);
    throw error;
  }
}

module.exports = { ensureDefaultWhitelistGroup };