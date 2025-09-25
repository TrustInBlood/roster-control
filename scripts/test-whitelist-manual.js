#!/usr/bin/env node

/**
 * Manual testing script for whitelist commands
 * This script helps test whitelist functionality against the dev Discord server
 */

require('dotenv').config();
const { console: loggerConsole } = require('../src/utils/logger');

// Test scenarios for whitelist commands
const TEST_SCENARIOS = [
  {
    name: 'Valid Steam ID Info Check',
    command: '/whitelist info',
    parameters: {
      steamid: '76561198000000000'
    },
    expectedResult: 'Should show whitelist info or "No active whitelist" message'
  },
  {
    name: 'Invalid Steam ID',
    command: '/whitelist info',
    parameters: {
      steamid: 'invalid_steamid'
    },
    expectedResult: 'Should show error: "Invalid Steam ID format"'
  },
  {
    name: 'Discord User Only (Unlinked)',
    command: '/whitelist info',
    parameters: {
      user: '@testuser'
    },
    expectedResult: 'Should show "Steam ID not found" or whitelist info if linked'
  },
  {
    name: 'Both Parameters (Linked Account)',
    command: '/whitelist info',
    parameters: {
      user: '@testuser',
      steamid: '76561198000000000'
    },
    expectedResult: 'Should show whitelist info for the Steam ID'
  },
  {
    name: 'Both Parameters (Unlinked Account)',
    command: '/whitelist info',
    parameters: {
      user: '@testuser',
      steamid: '76561198000000000'
    },
    expectedResult: 'Should handle gracefully with appropriate message'
  },
  {
    name: 'No Parameters',
    command: '/whitelist info',
    parameters: {},
    expectedResult: 'Should show error: "Please provide either a Discord user or Steam ID"'
  },
  {
    name: 'Grant Command with Valid Parameters',
    command: '/whitelist grant',
    parameters: {
      user: '@testuser',
      steamid: '76561198000000000'
    },
    expectedResult: 'Should show reason selection buttons'
  },
  {
    name: 'Grant Steam ID Only (Admin)',
    command: '/whitelist grant-steamid',
    parameters: {
      steamid: '76561198000000000',
      username: 'TestPlayer'
    },
    expectedResult: 'Should show warning about Steam ID only grant'
  },
  {
    name: 'Revoke Command',
    command: '/whitelist revoke',
    parameters: {
      steamid: '76561198000000000',
      reason: 'Test revocation'
    },
    expectedResult: 'Should revoke whitelist and remove Discord roles if applicable'
  }
];

function displayTestScenarios() {
  loggerConsole.log('🧪 Whitelist Command Test Scenarios');
  loggerConsole.log('===================================');
  loggerConsole.log('');

  TEST_SCENARIOS.forEach((scenario, index) => {
    loggerConsole.log(`${index + 1}. ${scenario.name}`);
    loggerConsole.log(`   Command: ${scenario.command}`);
    loggerConsole.log(`   Parameters: ${JSON.stringify(scenario.parameters, null, 2)}`);
    loggerConsole.log(`   Expected: ${scenario.expectedResult}`);
    loggerConsole.log('');
  });
}

function displayManualTestInstructions() {
  loggerConsole.log('📋 Manual Testing Instructions');
  loggerConsole.log('==============================');
  loggerConsole.log('');
  loggerConsole.log('1. Ensure the bot is running in development mode (npm run dev)');
  loggerConsole.log('2. Go to your Discord test server');
  loggerConsole.log('3. Test each scenario above by typing the commands with the parameters');
  loggerConsole.log('4. Verify that the expected results occur');
  loggerConsole.log('5. Check for any error messages or unexpected behavior');
  loggerConsole.log('');
  loggerConsole.log('Important Test Cases:');
  loggerConsole.log('- Error handling (invalid Steam IDs, missing parameters)');
  loggerConsole.log('- UI interactions (button clicks, modal submissions)');
  loggerConsole.log('- Permission checks (admin-only commands)');
  loggerConsole.log('- Database operations (grant, revoke, info lookup)');
  loggerConsole.log('- Discord role management (assignment, removal)');
  loggerConsole.log('');
}

function displayTestData() {
  loggerConsole.log('🔧 Test Data Suggestions');
  loggerConsole.log('========================');
  loggerConsole.log('');
  loggerConsole.log('Valid Steam IDs for testing:');
  loggerConsole.log('- 76561198000000000 (Generic test Steam ID)');
  loggerConsole.log('- 76561197960265728 (First Steam ID)');
  loggerConsole.log('');
  loggerConsole.log('Invalid Steam IDs for testing:');
  loggerConsole.log('- 123456789 (too short)');
  loggerConsole.log('- 76561198000000000123 (too long)');
  loggerConsole.log('- abcdefghijk (not numeric)');
  loggerConsole.log('- invalid_steamid (clearly invalid)');
  loggerConsole.log('');
  loggerConsole.log('Discord Users for testing:');
  loggerConsole.log('- Use your own Discord account for linked/unlinked tests');
  loggerConsole.log('- Create a test user for permission testing');
  loggerConsole.log('');
}

function displayEnvironmentCheck() {
  loggerConsole.log('⚙️ Environment Check');
  loggerConsole.log('====================');
  loggerConsole.log('');

  const requiredEnvVars = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_GUILD_ID',
    'DB_HOST',
    'DB_NAME',
    'DB_USER'
  ];

  let allSet = true;
  requiredEnvVars.forEach(envVar => {
    const isSet = !!process.env[envVar];
    loggerConsole.log(`${isSet ? '✅' : '❌'} ${envVar}: ${isSet ? 'Set' : 'Not Set'}`);
    if (!isSet) allSet = false;
  });

  loggerConsole.log('');
  if (allSet) {
    loggerConsole.log('✅ All required environment variables are set');
  } else {
    loggerConsole.log('❌ Some required environment variables are missing');
    loggerConsole.log('   Please check your .env file');
  }
  loggerConsole.log('');
  loggerConsole.log(`Current NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  loggerConsole.log('');
}

async function checkBotStatus() {
  loggerConsole.log('🤖 Bot Status Check');
  loggerConsole.log('===================');
  loggerConsole.log('');

  try {
    // Try to connect to database
    const { databaseManager } = require('../src/database');
    const connected = await databaseManager.connect();

    if (connected) {
      loggerConsole.log('✅ Database connection: OK');
      await databaseManager.disconnect();
    } else {
      loggerConsole.log('❌ Database connection: FAILED');
    }
  } catch (error) {
    loggerConsole.log('❌ Database connection: ERROR -', error.message);
  }

  loggerConsole.log('');
  loggerConsole.log('To check if the Discord bot is online:');
  loggerConsole.log('1. Look for the bot in your Discord server member list');
  loggerConsole.log('2. Check if the bot shows as "Online" (green dot)');
  loggerConsole.log('3. Try running /ping command to test basic functionality');
  loggerConsole.log('');
}

async function main() {
  loggerConsole.log('🚀 Whitelist Command Manual Testing Guide');
  loggerConsole.log('==========================================');
  loggerConsole.log('');

  displayEnvironmentCheck();
  await checkBotStatus();
  displayTestData();
  displayTestScenarios();
  displayManualTestInstructions();

  loggerConsole.log('💡 Tips for Testing:');
  loggerConsole.log('- Use Discord Developer Tools (F12) to check for console errors');
  loggerConsole.log('- Test with different permission levels (admin vs regular user)');
  loggerConsole.log('- Check the bot logs for any error messages during testing');
  loggerConsole.log('- Verify database entries after grant/revoke operations');
  loggerConsole.log('- Test both ephemeral and public responses where applicable');
  loggerConsole.log('');

  process.exit(0);
}

// Run the script
main().catch(error => {
  loggerConsole.error('Error running manual test script:', error);
  process.exit(1);
});