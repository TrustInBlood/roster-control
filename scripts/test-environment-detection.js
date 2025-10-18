/**
 * Test Environment Detection Script
 *
 * This script verifies that the environment detection works correctly
 * in different scenarios, including the Pterodactyl egg case where
 * NODE_ENV is not set in the startup command.
 */

const path = require('path');

console.log('\n=== Testing Environment Detection ===\n');

// Test 1: Simulate Pterodactyl egg (no NODE_ENV set)
console.log('Test 1: Pterodactyl Egg Simulation (no NODE_ENV)');
console.log('Current NODE_ENV before loading config:', process.env.NODE_ENV || '(not set)');

// Delete NODE_ENV to simulate Pterodactyl startup
delete process.env.NODE_ENV;

// Load the config
console.log('\nLoading config...');
const config = require('../config/config');

console.log('Detected environment:', config.env);
console.log('Database host:', config.database.host);
console.log('Database port:', config.database.port);

// Determine if configuration is correct based on .env content
const fs = require('fs');
const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const envNodeEnv = envContent.match(/NODE_ENV=(\w+)/)?.[1];

console.log('\n.env file contains: NODE_ENV=' + envNodeEnv);
console.log('Config detected: NODE_ENV=' + config.env);

if (config.env === envNodeEnv) {
  console.log('\n✅ SUCCESS: Environment detection working correctly!');
  console.log('   The system correctly read NODE_ENV from .env file');
} else {
  console.log('\n❌ FAILURE: Environment mismatch!');
  console.log('   Expected:', envNodeEnv);
  console.log('   Got:', config.env);
  process.exit(1);
}

// Show what would happen in production
console.log('\n=== Production Pterodactyl Egg Behavior ===');
console.log('1. Pterodactyl runs: node src/index.js (no NODE_ENV set)');
console.log('2. config.js loads .env file');
console.log('3. .env contains NODE_ENV=production');
console.log('4. System operates in production mode');
console.log('5. Production database and Discord bot are used');

console.log('\n=== Development Workflow ===');
console.log('1. Developer runs: npm run dev (sets NODE_ENV=development)');
console.log('2. config.js loads .env.development file');
console.log('3. System operates in development mode');
console.log('4. Localhost database and dev Discord bot are used');

console.log('\n');
