/**
 * Test script for role-based whitelist system
 * Run with: node scripts/test-role-system.js
 */

// Load environment-specific config
if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: '.env.development' });
} else {
  require('dotenv').config();
}

const { Client, GatewayIntentBits } = require('discord.js');
const RoleBasedWhitelistCache = require('../src/services/RoleBasedWhitelistCache');

// Load environment-specific configurations
const isDevelopment = process.env.NODE_ENV === 'development';
const { DISCORD_ROLES } = require(isDevelopment ? '../config/discordRoles.development' : '../config/discordRoles');
const { SQUAD_GROUPS, getHighestPriorityGroup } = require(isDevelopment ? '../config/squadGroups.development' : '../config/squadGroups');

// Test logger
const testLogger = {
  info: (...args) => console.log('[INFO]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args),
  warn: (...args) => console.log('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

// Test config
const testConfig = {
  cache: { refreshSeconds: 60 }
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

async function runTests() {
  console.log('='.repeat(80));
  console.log('ROLE-BASED WHITELIST SYSTEM TEST');
  console.log('='.repeat(80));
  
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    console.error('❌ DISCORD_GUILD_ID not set in environment');
    return false;
  }
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    const guild = await client.guilds.fetch(guildId);
    console.log(`\nTesting in guild: ${guild.name}\n`);
    
    // Test 1: Verify all configured roles exist
    console.log('TEST 1: Verifying configured roles exist...');
    let roleCheckPassed = true;
    for (const [roleName, roleId] of Object.entries(DISCORD_ROLES)) {
      if (roleId && roleId !== 'DISABLED') {
        const role = guild.roles.cache.get(roleId);
        if (!role) {
          console.log(`  ❌ ${roleName}: Role ID ${roleId} not found`);
          roleCheckPassed = false;
        } else {
          console.log(`  ✅ ${roleName}: ${role.name}`);
        }
      }
    }
    if (roleCheckPassed) {
      console.log('✅ TEST 1 PASSED: All roles verified\n');
      testsPassed++;
    } else {
      console.log('❌ TEST 1 FAILED: Some roles not found\n');
      testsFailed++;
    }
    
    // Test 2: Initialize role-based cache
    console.log('TEST 2: Initializing role-based cache...');
    const cache = new RoleBasedWhitelistCache(testLogger, testConfig);
    await cache.initializeFromGuild(guild);
    const counts = cache.getTotalCount();
    console.log(`  Staff with links: ${counts.staff}`);
    console.log(`  Members with links: ${counts.members}`);
    console.log(`  Unlinked staff: ${counts.unlinkedStaff}`);
    console.log('✅ TEST 2 PASSED: Cache initialized\n');
    testsPassed++;
    
    // Test 3: Check unlinked staff
    console.log('TEST 3: Checking unlinked staff detection...');
    const unlinkedStaff = cache.getUnlinkedStaff();
    if (unlinkedStaff.length > 0) {
      console.log(`  Found ${unlinkedStaff.length} unlinked staff members:`);
      unlinkedStaff.forEach(staff => {
        console.log(`    - ${staff.username} (${staff.group})`);
      });
    } else {
      console.log('  No unlinked staff found');
    }
    console.log('✅ TEST 3 PASSED: Unlinked staff check complete\n');
    testsPassed++;
    
    // Test 4: Test staff whitelist formatting
    console.log('TEST 4: Testing staff whitelist format...');
    const staffContent = await cache.getCachedStaff();
    const staffLines = staffContent.split('\n').filter(line => line.trim());
    console.log(`  Generated ${staffLines.length} lines`);
    
    // Check for group definitions
    const hasGroups = staffLines.some(line => line.startsWith('Group='));
    const hasAdmins = staffLines.some(line => line.startsWith('Admin='));
    
    if (hasGroups || hasAdmins || staffContent.includes('No entries')) {
      console.log('  ✅ Valid Squad server format detected');
      if (hasGroups) console.log('  - Contains group definitions');
      if (hasAdmins) console.log('  - Contains admin entries');
      console.log('✅ TEST 4 PASSED: Staff format valid\n');
      testsPassed++;
    } else {
      console.log('  ❌ Invalid format detected');
      console.log('❌ TEST 4 FAILED: Staff format invalid\n');
      testsFailed++;
    }
    
    // Test 5: Test member whitelist formatting
    console.log('TEST 5: Testing member whitelist format...');
    const memberContent = await cache.getCachedMembers();
    const memberLines = memberContent.split('\n').filter(line => line.trim());
    console.log(`  Generated ${memberLines.length} lines`);
    
    if (memberContent.includes('No entries') || memberLines.some(line => line.match(/^\d{17}/))) {
      console.log('  ✅ Valid member format detected');
      console.log('✅ TEST 5 PASSED: Member format valid\n');
      testsPassed++;
    } else {
      console.log('  ❌ Invalid format detected');
      console.log('❌ TEST 5 FAILED: Member format invalid\n');
      testsFailed++;
    }
    
    // Test 6: Test role priority
    console.log('TEST 6: Testing role priority system...');
    let priorityTestPassed = true;
    
    // Create mock role caches for testing (only test configured roles)
    const testCases = [
      { roles: ['EXECUTIVE_ADMIN'], expected: 'HeadAdmin' },
      { roles: ['MEMBER'], expected: 'Member' },
    ];
    
    // Add additional test cases only if roles are configured
    if (DISCORD_ROLES.HEAD_ADMIN) {
      testCases.push({ roles: ['HEAD_ADMIN'], expected: 'HeadAdmin' });
      testCases.push({ roles: ['HEAD_ADMIN', 'MEMBER'], expected: 'HeadAdmin' });
    }
    if (DISCORD_ROLES.MODERATOR) {
      testCases.push({ roles: ['MODERATOR'], expected: 'Moderator' });
    }
    if (DISCORD_ROLES.SENIOR_ADMIN) {
      testCases.push({ roles: ['SENIOR_ADMIN'], expected: 'SquadAdmin' });
    }
    
    for (const test of testCases) {
      const mockCache = new Map();
      test.roles.forEach(roleName => {
        const roleId = DISCORD_ROLES[roleName];
        if (roleId) mockCache.set(roleId, true);
      });
      
      const result = getHighestPriorityGroup(mockCache);
      if (result === test.expected) {
        console.log(`  ✅ ${test.roles.join('+')} -> ${result}`);
      } else {
        console.log(`  ❌ ${test.roles.join('+')} -> ${result} (expected ${test.expected})`);
        priorityTestPassed = false;
      }
    }
    
    if (priorityTestPassed) {
      console.log('✅ TEST 6 PASSED: Priority system working\n');
      testsPassed++;
    } else {
      console.log('❌ TEST 6 FAILED: Priority system issues\n');
      testsFailed++;
    }
    
  } catch (error) {
    console.error('Test error:', error);
    testsFailed++;
  }
  
  // Summary
  console.log('='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  
  if (testsFailed === 0) {
    console.log('\n✅ ALL TESTS PASSED - System ready for production');
    return true;
  } else {
    console.log('\n❌ SOME TESTS FAILED - Review issues before deploying');
    return false;
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}\n`);
  
  const success = await runTests();
  
  client.destroy();
  process.exit(success ? 0 : 1);
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