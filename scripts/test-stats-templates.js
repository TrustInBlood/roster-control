// scripts/test-stats-templates.js
// Test script for stats image templates - uses config from statsTemplates.js

const { generateStatsImage, clearCache } = require('../src/services/StatsImageService');
const { TEMPLATES } = require('../config/statsTemplates');
const fs = require('fs');
const path = require('path');

const tmpDir = path.join(__dirname, '../tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

const testStats = {
  playerName: '=B&B= Δ R C Δ N E',
  kills: 245,
  deaths: 89,
  kdRatio: 2.75,
  teamkills: 3,
  revivesGiven: 67,
  revivesReceived: 34,
  nemesis: 'EnemySniper99'
};

(async () => {
  // Clear cache to pick up any template changes
  clearCache();

  // Get template names from command line args, or test all
  const args = process.argv.slice(2);
  const templateNames = args.length > 0 ? args : Object.keys(TEMPLATES);

  console.log('Testing templates:', templateNames.join(', '));
  console.log('');

  for (const name of templateNames) {
    if (!TEMPLATES[name]) {
      console.log(`Skipping unknown template: ${name}`);
      continue;
    }

    try {
      const buffer = await generateStatsImage(testStats, name);
      const outFile = path.join(tmpDir, `stats-${name}.png`);
      fs.writeFileSync(outFile, buffer);
      console.log(`Generated: tmp/stats-${name}.png`);
    } catch (err) {
      console.error(`Failed to generate ${name}:`, err.message);
    }
  }

  console.log('\nCheck the tmp/ folder for results');
  process.exit(0);
})();
