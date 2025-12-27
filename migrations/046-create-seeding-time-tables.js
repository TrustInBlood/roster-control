'use strict';

/**
 * Migration: Create Passive Seeding Time Tracking System
 *
 * This migration:
 * 1. Creates `seeding_time` table for per-player, per-server, per-day aggregates
 * 2. Creates `server_seeding_snapshots` table for server state change history
 * 3. Adds `seeding_minutes` column to `player_sessions`
 * 4. Adds `total_seeding_minutes` column to `players`
 * 5. Cleans up bloated `playerCountSnapshots` from existing session metadata
 * 6. Closes zombie sessions (active > 12 hours)
 *
 * REPLACES the previous unbounded JSON snapshot approach with efficient aggregates.
 *
 * NOTE: This migration is idempotent - it checks for existing tables/indexes/columns
 * before creating them, allowing it to resume from a partial run.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { console: loggerConsole } = require('../src/utils/logger');

    loggerConsole.log('Starting passive seeding time tracking migration...');

    // Helper to check if a table exists
    const tableExists = async (tableName) => {
      const [results] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = '${tableName}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return results.count > 0;
    };

    // Helper to check if an index exists
    const indexExists = async (tableName, indexName) => {
      const [results] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = '${tableName}' AND index_name = '${indexName}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return results.count > 0;
    };

    // Helper to check if a column exists
    const columnExists = async (tableName, columnName) => {
      const [results] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = '${tableName}' AND column_name = '${columnName}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return results.count > 0;
    };

    // Step 1: Create seeding_time table
    loggerConsole.log('Step 1: Creating seeding_time table...');
    if (await tableExists('seeding_time')) {
      loggerConsole.log('seeding_time table already exists, skipping creation');
    } else {
      await queryInterface.createTable('seeding_time', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },
        player_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'players',
            key: 'id'
          },
          onDelete: 'CASCADE'
        },
        server_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: 'Server identifier (e.g., "server1")'
        },
        date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
          comment: 'Calendar date for aggregation'
        },
        seeding_minutes: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'Minutes spent while server was below seed threshold'
        },
        total_minutes: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'Total minutes played on this server this day'
        },
        seed_threshold: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: 'Seed threshold used (for historical accuracy)'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });
    }

    // Add indexes to seeding_time (check each one)
    if (!await indexExists('seeding_time', 'idx_seeding_time_player_server_date')) {
      await queryInterface.addIndex('seeding_time', ['player_id', 'server_id', 'date'], {
        unique: true,
        name: 'idx_seeding_time_player_server_date'
      });
    }
    if (!await indexExists('seeding_time', 'idx_seeding_time_server_date')) {
      await queryInterface.addIndex('seeding_time', ['server_id', 'date'], {
        name: 'idx_seeding_time_server_date'
      });
    }
    if (!await indexExists('seeding_time', 'idx_seeding_time_date')) {
      await queryInterface.addIndex('seeding_time', ['date'], {
        name: 'idx_seeding_time_date'
      });
    }
    if (!await indexExists('seeding_time', 'idx_seeding_time_player')) {
      await queryInterface.addIndex('seeding_time', ['player_id'], {
        name: 'idx_seeding_time_player'
      });
    }

    loggerConsole.log('seeding_time table ready with indexes');

    // Step 2: Create server_seeding_snapshots table
    loggerConsole.log('Step 2: Creating server_seeding_snapshots table...');
    if (await tableExists('server_seeding_snapshots')) {
      loggerConsole.log('server_seeding_snapshots table already exists, skipping creation');
    } else {
      await queryInterface.createTable('server_seeding_snapshots', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },
        server_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: 'Server identifier'
        },
        timestamp: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: 'When the state change occurred'
        },
        player_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: 'Player count at time of state change'
        },
        was_seeding: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          comment: 'true = entered seeding state, false = exited seeding state'
        },
        seed_threshold: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: 'Threshold that was crossed'
        }
      });
    }

    // Add indexes to server_seeding_snapshots (check each one)
    if (!await indexExists('server_seeding_snapshots', 'idx_server_seeding_server_timestamp')) {
      await queryInterface.addIndex('server_seeding_snapshots', ['server_id', 'timestamp'], {
        name: 'idx_server_seeding_server_timestamp'
      });
    }
    if (!await indexExists('server_seeding_snapshots', 'idx_server_seeding_timestamp')) {
      await queryInterface.addIndex('server_seeding_snapshots', ['timestamp'], {
        name: 'idx_server_seeding_timestamp'
      });
    }

    loggerConsole.log('server_seeding_snapshots table ready with indexes');

    // Step 3: Add seeding_minutes column to player_sessions
    loggerConsole.log('Step 3: Adding seeding_minutes column to player_sessions...');
    if (await columnExists('player_sessions', 'seeding_minutes')) {
      loggerConsole.log('seeding_minutes column already exists, skipping');
    } else {
      await queryInterface.addColumn('player_sessions', 'seeding_minutes', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: 'Minutes spent seeding during this session'
      });
    }

    // Step 4: Add total_seeding_minutes column to players
    loggerConsole.log('Step 4: Adding total_seeding_minutes column to players...');
    if (await columnExists('players', 'total_seeding_minutes')) {
      loggerConsole.log('total_seeding_minutes column already exists, skipping');
    } else {
      await queryInterface.addColumn('players', 'total_seeding_minutes', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Lifetime seeding time in minutes'
      });
    }

    // Step 5: Close zombie sessions (active > 12 hours)
    loggerConsole.log('Step 5: Closing zombie sessions (active > 12 hours)...');
    const [zombieResult] = await queryInterface.sequelize.query(`
      UPDATE player_sessions
      SET
        isActive = false,
        sessionEnd = NOW(),
        durationMinutes = TIMESTAMPDIFF(MINUTE, sessionStart, NOW())
      WHERE isActive = true
        AND sessionStart < DATE_SUB(NOW(), INTERVAL 12 HOUR)
    `);
    loggerConsole.log(`Closed ${zombieResult.affectedRows || 0} zombie sessions`);

    // Step 6: Clean up bloated playerCountSnapshots from metadata
    loggerConsole.log('Step 6: Cleaning up bloated playerCountSnapshots from metadata...');

    // Get count of sessions with snapshots
    const [[{ snapshotCount }]] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as snapshotCount
      FROM player_sessions
      WHERE metadata IS NOT NULL
        AND JSON_CONTAINS_PATH(metadata, 'one', '$.playerCountSnapshots')
    `);
    loggerConsole.log(`Found ${snapshotCount} sessions with playerCountSnapshots to clean`);

    if (snapshotCount > 0) {
      // Process in batches to avoid memory issues
      const batchSize = 1000;
      let totalCleaned = 0;
      let batchNum = 0;
      let hasMore = true;

      while (hasMore) {
        batchNum++;

        // Get batch of IDs to clean
        const [rows] = await queryInterface.sequelize.query(`
          SELECT id
          FROM player_sessions
          WHERE metadata IS NOT NULL
            AND JSON_CONTAINS_PATH(metadata, 'one', '$.playerCountSnapshots')
          LIMIT ${batchSize}
        `);

        if (rows.length === 0) {
          hasMore = false;
          break;
        }

        const ids = rows.map(r => r.id);

        // Remove playerCountSnapshots from these sessions
        await queryInterface.sequelize.query(`
          UPDATE player_sessions
          SET metadata = JSON_REMOVE(metadata, '$.playerCountSnapshots')
          WHERE id IN (${ids.join(',')})
        `);

        totalCleaned += rows.length;
        loggerConsole.log(`Batch ${batchNum}: Cleaned ${rows.length} sessions (total: ${totalCleaned})`);

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      loggerConsole.log(`Cleaned playerCountSnapshots from ${totalCleaned} sessions`);
    }

    // Step 7: Optimize table to reclaim space
    loggerConsole.log('Step 7: Optimizing player_sessions table...');
    try {
      await queryInterface.sequelize.query('OPTIMIZE TABLE player_sessions');
      loggerConsole.log('Table optimization complete');
    } catch (err) {
      loggerConsole.warn('Table optimization skipped (may not be supported): ' + err.message);
    }

    // Step 8: Show final stats
    const [[stats]] = await queryInterface.sequelize.query(`
      SELECT
        COUNT(*) as totalSessions,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeSessions,
        ROUND(SUM(LENGTH(COALESCE(metadata, '{}'))) / 1024 / 1024, 2) as metadataMB
      FROM player_sessions
    `);

    loggerConsole.log('Migration complete. Final stats:', stats);
  },

  async down(queryInterface, Sequelize) {
    const { console: loggerConsole } = require('../src/utils/logger');

    loggerConsole.log('Rolling back passive seeding time tracking migration...');

    // Remove columns from player_sessions
    await queryInterface.removeColumn('player_sessions', 'seeding_minutes');

    // Remove column from players
    await queryInterface.removeColumn('players', 'total_seeding_minutes');

    // Drop tables
    await queryInterface.dropTable('server_seeding_snapshots');
    await queryInterface.dropTable('seeding_time');

    loggerConsole.log('Rollback complete');
  }
};
