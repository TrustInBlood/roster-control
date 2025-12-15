'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create the junction table for many-to-many relationship
    await queryInterface.createTable('discord_role_group_members', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      role_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'discord_roles',
          key: 'id'
        },
        onDelete: 'CASCADE',
        comment: 'FK to discord_roles'
      },
      group_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'discord_role_groups',
          key: 'id'
        },
        onDelete: 'CASCADE',
        comment: 'FK to discord_role_groups'
      },
      added_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who added this role to the group'
      },
      added_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'When role was added to group'
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add unique constraint to prevent duplicate role-group pairs
    await queryInterface.addIndex('discord_role_group_members', ['role_id', 'group_id'], {
      name: 'idx_discord_role_group_unique',
      unique: true
    });

    // Add index for group lookups
    await queryInterface.addIndex('discord_role_group_members', ['group_id'], {
      name: 'idx_discord_role_group_members_group_id'
    });

    // Add index for role lookups
    await queryInterface.addIndex('discord_role_group_members', ['role_id'], {
      name: 'idx_discord_role_group_members_role_id'
    });

    // 2. Migrate existing data from discord_roles.group_id to junction table
    await queryInterface.sequelize.query(`
      INSERT INTO discord_role_group_members (role_id, group_id, added_at)
      SELECT id, group_id, created_at
      FROM discord_roles
      WHERE group_id IS NOT NULL
    `);

    // 3. Remove the group_id column from discord_roles
    await queryInterface.removeIndex('discord_roles', 'idx_discord_roles_group_id');
    await queryInterface.removeColumn('discord_roles', 'group_id');
  },

  down: async (queryInterface, Sequelize) => {
    // 1. Add back the group_id column to discord_roles
    await queryInterface.addColumn('discord_roles', 'group_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'discord_role_groups',
        key: 'id'
      },
      onDelete: 'SET NULL',
      comment: 'FK to discord_role_groups'
    });

    // 2. Migrate data back (take first group for each role)
    await queryInterface.sequelize.query(`
      UPDATE discord_roles dr
      SET group_id = (
        SELECT group_id
        FROM discord_role_group_members drgm
        WHERE drgm.role_id = dr.id
        ORDER BY drgm.added_at ASC
        LIMIT 1
      )
    `);

    // 3. Add back the index
    await queryInterface.addIndex('discord_roles', ['group_id'], {
      name: 'idx_discord_roles_group_id'
    });

    // 4. Drop the junction table
    await queryInterface.dropTable('discord_role_group_members');
  }
};
