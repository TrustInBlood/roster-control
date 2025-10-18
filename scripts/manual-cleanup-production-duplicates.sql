-- Manual cleanup script for production database duplicates
-- Run this directly in MariaDB to clean up remaining duplicates

USE roster_control;

-- Step 1: Check current duplicate situation
SELECT
  discord_user_id,
  COUNT(*) as duplicate_count
FROM whitelists
WHERE source = 'role' AND revoked = false
GROUP BY discord_user_id
HAVING duplicate_count > 1;

-- Step 2: Delete all duplicates except the most recent (highest ID) for each user
DELETE w1 FROM whitelists w1
WHERE w1.source = 'role'
  AND w1.revoked = false
  AND w1.id NOT IN (
    SELECT * FROM (
      SELECT MAX(w2.id)
      FROM whitelists w2
      WHERE w2.source = 'role'
        AND w2.revoked = false
      GROUP BY w2.discord_user_id
    ) AS keepers
  );

-- Step 3: Verify no duplicates remain
SELECT
  discord_user_id,
  COUNT(*) as duplicate_count
FROM whitelists
WHERE source = 'role' AND revoked = false
GROUP BY discord_user_id
HAVING duplicate_count > 1;

-- Step 4: Remove the failed migration from schema_migrations so it can retry
DELETE FROM schema_migrations WHERE name = '025-add-role-whitelist-unique-constraint.js';

-- Step 5: Verify migration status
SELECT * FROM schema_migrations ORDER BY name DESC LIMIT 5;
