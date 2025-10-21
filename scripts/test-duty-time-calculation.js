/**
 * Test Script for Duty Time Calculation
 *
 * This script tests the duty time calculation logic with various edge cases:
 * - Normal ON→OFF duty periods
 * - Currently on duty (no OFF event yet)
 * - Multiple consecutive sessions
 * - Mixed duty types (admin vs tutor)
 * - Date range filtering
 */

require('dotenv').config();
const { DutyStatusChange } = require('../src/database/models');
const { createServiceLogger } = require('../src/utils/logger');

const logger = createServiceLogger('TestDutyTime');

async function runTest() {
  try {
    logger.info('Starting Duty Time Calculation Test');
    logger.info('====================================');

    // Test data
    const testUserId = 'TEST_DUTY_TIME_USER';
    const testUsername = 'TestDutyUser';
    const testGuildId = 'TEST_GUILD';

    // Clean up any existing test data
    logger.info('Cleaning up existing test data...');
    await DutyStatusChange.destroy({ where: { discordUserId: testUserId } });

    // TEST CASE 1: Normal ON→OFF duty period
    logger.info('');
    logger.info('TEST CASE 1: Normal ON→OFF duty period');
    logger.info('---------------------------------------');

    const session1Start = new Date('2025-10-21T10:00:00Z');
    const session1End = new Date('2025-10-21T12:30:00Z'); // 2.5 hours

    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: true,
      previousStatus: false,
      source: 'command',
      reason: 'User activated duty status',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: session1Start
    });

    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: false,
      previousStatus: true,
      source: 'command',
      reason: 'User deactivated duty status',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: session1End
    });

    let stats = await DutyStatusChange.calculateDutyTime(testUserId, null, null, 'admin');

    logger.info(`Total time: ${stats.totalHours.toFixed(2)} hours`);
    logger.info(`Sessions: ${stats.sessionCount}`);
    logger.info(`Expected: 2.5 hours, 1 session`);

    if (Math.abs(stats.totalHours - 2.5) > 0.01) {
      throw new Error(`FAIL: Expected 2.5 hours, got ${stats.totalHours}`);
    }

    if (stats.sessionCount !== 1) {
      throw new Error(`FAIL: Expected 1 session, got ${stats.sessionCount}`);
    }

    logger.info('SUCCESS: Normal ON→OFF period calculated correctly');

    // TEST CASE 2: Currently on duty (no OFF event)
    logger.info('');
    logger.info('TEST CASE 2: Currently on duty (no OFF event)');
    logger.info('----------------------------------------------');

    const session2Start = new Date('2025-10-21T14:00:00Z');

    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: true,
      previousStatus: false,
      source: 'command',
      reason: 'User activated duty status',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: session2Start
    });

    stats = await DutyStatusChange.calculateDutyTime(testUserId, null, null, 'admin');

    logger.info(`Total sessions: ${stats.sessionCount}`);
    logger.info(`Active session: ${stats.sessions.find(s => s.isActive) ? 'Yes' : 'No'}`);
    logger.info(`Expected: 2 sessions, with 1 active`);

    if (stats.sessionCount !== 2) {
      throw new Error(`FAIL: Expected 2 sessions, got ${stats.sessionCount}`);
    }

    const activeSession = stats.sessions.find(s => s.isActive);
    if (!activeSession) {
      throw new Error('FAIL: No active session found');
    }

    logger.info('SUCCESS: Currently on duty handled correctly');

    // TEST CASE 3: Multiple consecutive sessions
    logger.info('');
    logger.info('TEST CASE 3: Multiple consecutive sessions');
    logger.info('-------------------------------------------');

    // Clean up for this test
    await DutyStatusChange.destroy({ where: { discordUserId: testUserId } });

    // Session 1: 2 hours
    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: true,
      previousStatus: false,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-21T08:00:00Z')
    });

    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: false,
      previousStatus: true,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-21T10:00:00Z')
    });

    // Session 2: 3 hours
    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: true,
      previousStatus: false,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-21T11:00:00Z')
    });

    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: false,
      previousStatus: true,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-21T14:00:00Z')
    });

    // Session 3: 1.5 hours
    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: true,
      previousStatus: false,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-21T15:00:00Z')
    });

    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: false,
      previousStatus: true,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-21T16:30:00Z')
    });

    stats = await DutyStatusChange.calculateDutyTime(testUserId, null, null, 'admin');

    logger.info(`Total time: ${stats.totalHours.toFixed(2)} hours`);
    logger.info(`Sessions: ${stats.sessionCount}`);
    logger.info(`Average session: ${(stats.averageSessionMs / (1000 * 60 * 60)).toFixed(2)} hours`);
    logger.info(`Longest session: ${(stats.longestSessionMs / (1000 * 60 * 60)).toFixed(2)} hours`);
    logger.info(`Expected: 6.5 total hours, 3 sessions, 2.17 avg, 3.0 longest`);

    if (Math.abs(stats.totalHours - 6.5) > 0.01) {
      throw new Error(`FAIL: Expected 6.5 hours, got ${stats.totalHours}`);
    }

    if (stats.sessionCount !== 3) {
      throw new Error(`FAIL: Expected 3 sessions, got ${stats.sessionCount}`);
    }

    logger.info('SUCCESS: Multiple consecutive sessions calculated correctly');

    // TEST CASE 4: Mixed duty types (admin vs tutor)
    logger.info('');
    logger.info('TEST CASE 4: Mixed duty types (admin vs tutor)');
    logger.info('-----------------------------------------------');

    // Clean up for this test
    await DutyStatusChange.destroy({ where: { discordUserId: testUserId } });

    // Admin duty: 2 hours
    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: true,
      previousStatus: false,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-21T08:00:00Z')
    });

    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: false,
      previousStatus: true,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-21T10:00:00Z')
    });

    // Tutor duty: 3 hours
    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: true,
      previousStatus: false,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'tutor' },
      success: true,
      createdAt: new Date('2025-10-21T11:00:00Z')
    });

    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: false,
      previousStatus: true,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'tutor' },
      success: true,
      createdAt: new Date('2025-10-21T14:00:00Z')
    });

    const adminStats = await DutyStatusChange.calculateDutyTime(testUserId, null, null, 'admin');
    const tutorStats = await DutyStatusChange.calculateDutyTime(testUserId, null, null, 'tutor');
    const bothStats = await DutyStatusChange.calculateDutyTime(testUserId, null, null, 'both');

    logger.info(`Admin duty: ${adminStats.totalHours.toFixed(2)} hours`);
    logger.info(`Tutor duty: ${tutorStats.totalHours.toFixed(2)} hours`);
    logger.info(`Both: ${bothStats.totalHours.toFixed(2)} hours`);
    logger.info(`Expected: 2.0 admin, 3.0 tutor, 5.0 both`);

    if (Math.abs(adminStats.totalHours - 2.0) > 0.01) {
      throw new Error(`FAIL: Expected 2.0 admin hours, got ${adminStats.totalHours}`);
    }

    if (Math.abs(tutorStats.totalHours - 3.0) > 0.01) {
      throw new Error(`FAIL: Expected 3.0 tutor hours, got ${tutorStats.totalHours}`);
    }

    if (Math.abs(bothStats.totalHours - 5.0) > 0.01) {
      throw new Error(`FAIL: Expected 5.0 total hours, got ${bothStats.totalHours}`);
    }

    logger.info('SUCCESS: Mixed duty types filtered correctly');

    // TEST CASE 5: Date range filtering
    logger.info('');
    logger.info('TEST CASE 5: Date range filtering');
    logger.info('----------------------------------');

    // Clean up for this test
    await DutyStatusChange.destroy({ where: { discordUserId: testUserId } });

    // Session on Oct 20: 2 hours (should be excluded)
    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: true,
      previousStatus: false,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-20T10:00:00Z')
    });

    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: false,
      previousStatus: true,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-20T12:00:00Z')
    });

    // Session on Oct 21: 3 hours (should be included)
    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: true,
      previousStatus: false,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-21T10:00:00Z')
    });

    await DutyStatusChange.create({
      discordUserId: testUserId,
      discordUsername: testUsername,
      status: false,
      previousStatus: true,
      source: 'command',
      guildId: testGuildId,
      metadata: { dutyType: 'admin' },
      success: true,
      createdAt: new Date('2025-10-21T13:00:00Z')
    });

    const startDate = new Date('2025-10-21T00:00:00Z');
    const filteredStats = await DutyStatusChange.calculateDutyTime(testUserId, startDate, null, 'admin');
    const allStats = await DutyStatusChange.calculateDutyTime(testUserId, null, null, 'admin');

    logger.info(`Filtered (Oct 21 only): ${filteredStats.totalHours.toFixed(2)} hours`);
    logger.info(`All time: ${allStats.totalHours.toFixed(2)} hours`);
    logger.info(`Expected: 3.0 filtered, 5.0 all time`);

    if (Math.abs(filteredStats.totalHours - 3.0) > 0.01) {
      throw new Error(`FAIL: Expected 3.0 filtered hours, got ${filteredStats.totalHours}`);
    }

    if (Math.abs(allStats.totalHours - 5.0) > 0.01) {
      throw new Error(`FAIL: Expected 5.0 total hours, got ${allStats.totalHours}`);
    }

    logger.info('SUCCESS: Date range filtering works correctly');

    // TEST CASE 6: Leaderboard calculation
    logger.info('');
    logger.info('TEST CASE 6: Leaderboard calculation');
    logger.info('-------------------------------------');

    // Clean up for this test
    await DutyStatusChange.destroy({ where: { guildId: testGuildId } });

    const user1 = 'USER_1';
    const user2 = 'USER_2';
    const user3 = 'USER_3';

    // User 1: 5 hours
    await createTestSession(user1, 'User1', testGuildId, '2025-10-21T08:00:00Z', '2025-10-21T13:00:00Z');

    // User 2: 3 hours
    await createTestSession(user2, 'User2', testGuildId, '2025-10-21T09:00:00Z', '2025-10-21T12:00:00Z');

    // User 3: 7 hours
    await createTestSession(user3, 'User3', testGuildId, '2025-10-21T10:00:00Z', '2025-10-21T17:00:00Z');

    const leaderboard = await DutyStatusChange.getLeaderboard(testGuildId, null, null, 'admin', 10);

    logger.info('Leaderboard:');
    leaderboard.forEach((entry, index) => {
      logger.info(`  ${index + 1}. ${entry.discordUsername}: ${entry.totalHours.toFixed(2)} hours`);
    });

    if (leaderboard.length !== 3) {
      throw new Error(`FAIL: Expected 3 users in leaderboard, got ${leaderboard.length}`);
    }

    // Check sorting (User3 > User1 > User2)
    if (leaderboard[0].discordUsername !== 'User3') {
      throw new Error(`FAIL: Expected User3 in first place, got ${leaderboard[0].discordUsername}`);
    }

    if (leaderboard[1].discordUsername !== 'User1') {
      throw new Error(`FAIL: Expected User1 in second place, got ${leaderboard[1].discordUsername}`);
    }

    if (leaderboard[2].discordUsername !== 'User2') {
      throw new Error(`FAIL: Expected User2 in third place, got ${leaderboard[2].discordUsername}`);
    }

    logger.info('SUCCESS: Leaderboard sorted correctly');

    // Clean up test data
    logger.info('');
    logger.info('Cleaning up test data...');
    await DutyStatusChange.destroy({ where: { guildId: testGuildId } });
    await DutyStatusChange.destroy({ where: { discordUserId: testUserId } });

    logger.info('====================================');
    logger.info('SUCCESS: All duty time calculation tests passed!');
    logger.info('Test results:');
    logger.info('  Test Case 1: PASS - Normal ON→OFF period');
    logger.info('  Test Case 2: PASS - Currently on duty');
    logger.info('  Test Case 3: PASS - Multiple consecutive sessions');
    logger.info('  Test Case 4: PASS - Mixed duty types');
    logger.info('  Test Case 5: PASS - Date range filtering');
    logger.info('  Test Case 6: PASS - Leaderboard calculation');

    process.exit(0);

  } catch (error) {
    logger.error('Test failed:', error.message);
    logger.error(error.stack);

    process.exit(1);
  }
}

// Helper function to create a test session
async function createTestSession(userId, username, guildId, startTime, endTime) {
  await DutyStatusChange.create({
    discordUserId: userId,
    discordUsername: username,
    status: true,
    previousStatus: false,
    source: 'command',
    guildId: guildId,
    metadata: { dutyType: 'admin' },
    success: true,
    createdAt: new Date(startTime)
  });

  await DutyStatusChange.create({
    discordUserId: userId,
    discordUsername: username,
    status: false,
    previousStatus: true,
    source: 'command',
    guildId: guildId,
    metadata: { dutyType: 'admin' },
    success: true,
    createdAt: new Date(endTime)
  });
}

// Run the test
runTest();
