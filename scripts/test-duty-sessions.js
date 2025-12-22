#!/usr/bin/env node
/**
 * Test script for DutySession functionality
 * Run with: node scripts/test-duty-sessions.js
 */

require('dotenv').config();

const { sequelize } = require('../config/database');
const { DutySession, DutyTrackingConfig } = require('../src/database/models');
const { getDutyConfigService } = require('../src/services/DutyConfigService');

const TEST_USER_ID = '123456789012345678';
const TEST_USERNAME = 'TestUser';
const TEST_GUILD_ID = process.env.DISCORD_GUILD_ID || '000000000000000000';

async function runTests() {
  console.log('\n=== Duty Session Test Script ===\n');

  try {
    // Test database connection
    console.log('1. Testing database connection...');
    await sequelize.authenticate();
    console.log('   Database connected successfully\n');

    // Test DutyTrackingConfig
    console.log('2. Testing DutyTrackingConfig...');
    const configService = getDutyConfigService();
    const config = await configService.getConfig(TEST_GUILD_ID);
    console.log('   Default config loaded:', Object.keys(config).length, 'keys');
    console.log('   Auto-timeout enabled:', config.auto_timeout_enabled?.value);
    console.log('   Timeout hours:', config.auto_timeout_hours?.value);
    console.log('   Warning minutes:', config.auto_timeout_warning_minutes?.value);
    console.log('');

    // Test creating a session
    console.log('3. Testing session creation...');
    const startResult = await DutySession.startSession(
      TEST_USER_ID,
      TEST_USERNAME,
      'admin',
      TEST_GUILD_ID,
      { source: 'test_script' }
    );

    if (startResult.created) {
      console.log('   Session created:', {
        id: startResult.session.id,
        discordUserId: startResult.session.discordUserId,
        dutyType: startResult.session.dutyType,
        isActive: startResult.session.isActive
      });
    } else if (startResult.existing) {
      console.log('   Session already exists:', startResult.session.id);
    } else {
      console.log('   Error:', startResult.error);
    }
    console.log('');

    // Test getting active session
    console.log('4. Testing getActiveSession...');
    const activeSession = await DutySession.getActiveSession(TEST_USER_ID, 'admin');
    if (activeSession) {
      console.log('   Active session found:', {
        id: activeSession.id,
        durationMinutes: activeSession.getDurationMinutes(),
        isActive: activeSession.isActive
      });
    } else {
      console.log('   No active session found');
    }
    console.log('');

    // Test getting all active sessions
    console.log('5. Testing getActiveSessions...');
    const activeSessions = await DutySession.getActiveSessions(TEST_GUILD_ID);
    console.log('   Active sessions in guild:', activeSessions.length);
    activeSessions.forEach(s => {
      console.log('   -', s.discordUsername, `(${s.dutyType})`, s.getDurationMinutes(), 'min');
    });
    console.log('');

    // Test point calculation
    console.log('6. Testing point calculation...');
    if (activeSession) {
      const pointValues = {
        basePerMinute: await configService.getPointValue(TEST_GUILD_ID, 'base_per_minute'),
        voicePerMinute: await configService.getPointValue(TEST_GUILD_ID, 'voice_per_minute'),
        ticketResponse: await configService.getPointValue(TEST_GUILD_ID, 'ticket_response')
      };
      console.log('   Point values:', pointValues);
    }
    console.log('');

    // Test ending session
    console.log('7. Testing session end...');
    if (activeSession) {
      const pointsData = {
        basePoints: activeSession.getDurationMinutes() * 1,
        bonusPoints: 0
      };
      const endResult = await DutySession.endSession(activeSession.id, 'test_complete', pointsData);
      if (endResult.success) {
        console.log('   Session ended:', {
          id: endResult.session.id,
          durationMinutes: endResult.session.durationMinutes,
          totalPoints: endResult.session.totalPoints,
          endReason: endResult.session.endReason
        });
      } else {
        console.log('   Error:', endResult.error);
      }
    } else {
      console.log('   No session to end');
    }
    console.log('');

    // Show recent sessions
    console.log('8. Recent sessions in database...');
    const recentSessions = await DutySession.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5
    });
    console.log('   Last 5 sessions:');
    recentSessions.forEach(s => {
      const status = s.isActive ? 'ACTIVE' : `ended (${s.endReason})`;
      console.log(`   - #${s.id} ${s.discordUsername} [${s.dutyType}] ${status} - ${s.durationMinutes || s.getDurationMinutes()}min, ${s.totalPoints}pts`);
    });
    console.log('');

    console.log('=== All tests completed ===\n');

  } catch (error) {
    console.error('\nTest failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

runTests();
