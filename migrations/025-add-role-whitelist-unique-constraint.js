const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔧 Adding unique constraint for role-based whitelist entries');

    try {
      // Check if index already exists
      const indexes = await queryInterface.showIndex('whitelists');
      const indexExists = indexes.some(index =>
        index.name === 'whitelists_unique_active_role_entry'
      );

      if (indexExists) {
        console.log('⚠️  Index already exists, skipping...');
        return;
      }

      // Add partial unique index for active role-based entries
      // This prevents duplicate active role entries per user while allowing:
      // - Multiple revoked entries (history)
      // - Multiple manual/import entries (different source)
      await queryInterface.addIndex('whitelists', {
        name: 'whitelists_unique_active_role_entry',
        unique: true,
        fields: ['discord_user_id', 'source', 'revoked'],
        where: {
          source: 'role',
          revoked: false
        }
      });

      console.log('✅ Successfully added unique constraint for role-based whitelist entries');

    } catch (error) {
      console.error('❌ Error adding unique constraint:', error.message);

      // Check if error is due to existing duplicates
      if (error.message.includes('Duplicate entry') || error.message.includes('UNIQUE')) {
        console.error('⚠️  DUPLICATE ENTRIES DETECTED IN DATABASE!');
        console.error('⚠️  Please run the following query to identify duplicates:');
        console.error('');
        console.error('    SELECT discord_user_id, COUNT(*) as count');
        console.error('    FROM whitelists');
        console.error('    WHERE source = \'role\' AND revoked = false');
        console.error('    GROUP BY discord_user_id');
        console.error('    HAVING count > 1;');
        console.error('');
        console.error('⚠️  Clean up duplicates before running this migration.');
      }

      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Rolling back: Removing unique constraint for role-based whitelist entries');

    try {
      // Check if index exists before trying to remove it
      const indexes = await queryInterface.showIndex('whitelists');
      const indexExists = indexes.some(index =>
        index.name === 'whitelists_unique_active_role_entry'
      );

      if (!indexExists) {
        console.log('⚠️  Index does not exist, skipping...');
        return;
      }

      // Remove the unique index
      await queryInterface.removeIndex('whitelists', 'whitelists_unique_active_role_entry');

      console.log('✅ Successfully removed unique constraint');

    } catch (error) {
      console.error('❌ Error removing unique constraint:', error.message);
      throw error;
    }
  }
};
