#!/usr/bin/env node
/**
 * Test script to verify confidence-based security system
 */

require('../config/config');
const { databaseManager } = require('../src/database');
const { PlayerDiscordLink, Whitelist } = require('../src/database/models');

async function testConfidenceSystem() {
  console.log('🔍 Testing confidence-based security system...\n');
  
  try {
    // Connect to database
    await databaseManager.connect();
    
    // Test 1: Check existing link confidence scores
    console.log('📊 Current PlayerDiscordLink confidence scores:');
    const links = await PlayerDiscordLink.findAll({
      order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
    });
    
    if (links.length === 0) {
      console.log('   No links found in database\n');
    } else {
      for (const link of links) {
        console.log(`   Discord: ${link.discord_user_id} | Steam: ${link.steamid64} | Confidence: ${link.confidence_score} | Source: ${link.link_source}`);
      }
      console.log('');
    }
    
    // Test 2: Count links by confidence level
    const confidenceCounts = await Promise.all([
      PlayerDiscordLink.count({ where: { confidence_score: 1.0 } }),
      PlayerDiscordLink.count({ where: { confidence_score: 0.7 } }),
      PlayerDiscordLink.count({ where: { confidence_score: 0.5 } }),
      PlayerDiscordLink.count({ where: { confidence_score: 0.3 } })
    ]);
    
    console.log('📈 Link confidence distribution:');
    console.log(`   Confidence 1.0 (Self-verified): ${confidenceCounts[0]} links`);
    console.log(`   Confidence 0.7 (Admin-created): ${confidenceCounts[1]} links`);
    console.log(`   Confidence 0.5 (Whitelist-created): ${confidenceCounts[2]} links`);
    console.log(`   Confidence 0.3 (Ticket-extracted): ${confidenceCounts[3]} links\n`);
    
    // Test 3: Check whitelist entries
    const staffWhitelist = await Whitelist.getActiveEntries('staff');
    const regularWhitelist = await Whitelist.getActiveEntries('whitelist');
    
    console.log('📋 Whitelist entries:');
    console.log(`   Staff whitelist entries: ${staffWhitelist.length}`);
    console.log(`   Regular whitelist entries: ${regularWhitelist.length}\n`);
    
    // Test 4: Show which staff entries would be filtered
    if (staffWhitelist.length > 0) {
      console.log('🔒 Staff whitelist security check:');
      
      for (const entry of staffWhitelist) {
        const highestLink = await PlayerDiscordLink.findOne({
          where: { 
            steamid64: entry.steamid64,
            is_primary: true
          },
          order: [['confidence_score', 'DESC']]
        });
        
        if (highestLink) {
          const status = highestLink.confidence_score >= 1.0 ? '✅ ALLOWED' : '❌ BLOCKED';
          console.log(`   Steam ID ${entry.steamid64}: ${status} (Confidence: ${highestLink.confidence_score})`);
        } else {
          console.log(`   Steam ID ${entry.steamid64}: ❌ BLOCKED (No Discord link)`);
        }
      }
      console.log('');
    }
    
    console.log('✅ Confidence system test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Close database connection
    await databaseManager.getSequelize().close();
  }
}

// Run the test
testConfidenceSystem();