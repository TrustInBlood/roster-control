// scripts/test-stats-templates.js
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const tmpDir = path.join(__dirname, '../tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

const templates = [
  {
    name: 'current',
    file: 'stats-template.png',
    layout: 'list',
    box: { width: 450, height: 450, rightMargin: 125, padding: 25, fontSize: 22, titleSize: 28, lineHeight: 50 }
  },
  {
    name: 'banner',
    file: 'stats-template-banner.png',
    layout: 'grid',
    box: { width: 600, height: 260, rightMargin: 40, padding: 20, fontSize: 16, titleSize: 22, lineHeight: 32 }
  }
];

const testStats = {
  playerName: 'TestPlayer123',
  kills: 245,
  deaths: 89,
  kdRatio: 2.75,
  teamkills: 3,
  revivesGiven: 67,
  revivesReceived: 34,
  nemesis: 'EnemySniper99'
};

function drawListLayout(ctx, stats, boxX, boxY, boxWidth, boxConfig) {
  const { padding, fontSize, titleSize, lineHeight } = boxConfig;

  // Player name
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.font = `bold ${titleSize}px sans-serif`;
  ctx.fillText(stats.playerName, boxX + padding, boxY + padding + titleSize);

  // Divider
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const dividerY = boxY + padding + titleSize + 12;
  ctx.moveTo(boxX + padding, dividerY);
  ctx.lineTo(boxX + boxWidth - padding, dividerY);
  ctx.stroke();

  // Stats as list
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  let y = dividerY + lineHeight;
  const lines = [
    `Kills: ${stats.kills}`,
    `Deaths: ${stats.deaths}`,
    `K/D: ${stats.kdRatio.toFixed(2)}`,
    `Teamkills: ${stats.teamkills}`,
    `Revives: ${stats.revivesGiven} / ${stats.revivesReceived}`,
    `Nemesis: ${stats.nemesis}`
  ];
  for (const line of lines) {
    ctx.fillText(line, boxX + padding, y);
    y += lineHeight;
  }
}

function drawGridLayout(ctx, stats, boxX, boxY, boxWidth, boxConfig) {
  const { padding, fontSize, titleSize } = boxConfig;
  const labelColor = 'rgba(255, 255, 255, 0.7)';
  const valueColor = '#ffffff';
  const colWidth = (boxWidth - padding * 2) / 3;
  const labelSize = fontSize - 2;
  const valueSize = fontSize + 4;
  const rowGap = 8;

  // Player name (centered)
  ctx.fillStyle = valueColor;
  ctx.textAlign = 'center';
  ctx.font = `bold ${titleSize}px sans-serif`;
  ctx.fillText(stats.playerName, boxX + boxWidth / 2, boxY + padding + titleSize);

  // Divider
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const dividerY = boxY + padding + titleSize + 10;
  ctx.moveTo(boxX + padding, dividerY);
  ctx.lineTo(boxX + boxWidth - padding, dividerY);
  ctx.stroke();

  let y = dividerY + 28;

  // Row 1: Kills / Deaths / K/D labels
  ctx.font = `${labelSize}px sans-serif`;
  ctx.fillStyle = labelColor;
  ctx.textAlign = 'center';
  const col1 = boxX + padding + colWidth * 0.5;
  const col2 = boxX + padding + colWidth * 1.5;
  const col3 = boxX + padding + colWidth * 2.5;

  ctx.fillText('KILLS', col1, y);
  ctx.fillText('DEATHS', col2, y);
  ctx.fillText('K/D', col3, y);

  // Row 2: Kills / Deaths / K/D values
  y += rowGap + valueSize;
  ctx.font = `bold ${valueSize}px sans-serif`;
  ctx.fillStyle = valueColor;
  ctx.fillText(stats.kills.toString(), col1, y);
  ctx.fillText(stats.deaths.toString(), col2, y);
  ctx.fillText(stats.kdRatio.toFixed(2), col3, y);

  // Row 3: Teamkills / Revives Given / Revives Received labels
  y += rowGap + 28;
  ctx.font = `${labelSize}px sans-serif`;
  ctx.fillStyle = labelColor;
  ctx.fillText('TEAMKILLS', col1, y);
  ctx.fillText('REVIVES GIVEN', col2, y);
  ctx.fillText('REVIVES RECEIVED', col3, y);

  // Row 4: Teamkills value + Revives values
  y += rowGap + valueSize;
  ctx.font = `bold ${valueSize}px sans-serif`;
  ctx.fillStyle = valueColor;
  ctx.fillText(stats.teamkills.toString(), col1, y);
  ctx.fillText(stats.revivesGiven.toString(), col2, y);
  ctx.fillText(stats.revivesReceived.toString(), col3, y);

  // Row 5: Nemesis
  y += rowGap + 28;
  ctx.font = `${labelSize}px sans-serif`;
  ctx.fillStyle = labelColor;
  ctx.textAlign = 'center';
  ctx.fillText('NEMESIS', boxX + boxWidth / 2, y);

  y += rowGap + valueSize - 4;
  ctx.font = `bold ${valueSize - 2}px sans-serif`;
  ctx.fillStyle = valueColor;
  ctx.fillText(stats.nemesis, boxX + boxWidth / 2, y);
}

async function generateWithTemplate(templatePath, stats, boxConfig, layout) {
  const template = await loadImage(templatePath);
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext('2d');

  const { width: boxWidth, height: boxHeight, rightMargin } = boxConfig;

  // Draw blurred background
  ctx.filter = 'blur(2px)';
  ctx.drawImage(template, 0, 0);
  ctx.filter = 'none';

  // Overlay box (right side)
  const boxX = template.width - boxWidth - rightMargin;
  const boxY = (template.height - boxHeight) / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
  ctx.fill();

  // Draw stats based on layout
  if (layout === 'grid') {
    drawGridLayout(ctx, stats, boxX, boxY, boxWidth, boxConfig);
  } else {
    drawListLayout(ctx, stats, boxX, boxY, boxWidth, boxConfig);
  }

  return canvas.toBuffer('image/png');
}

(async () => {
  for (const t of templates) {
    const templatePath = path.join(__dirname, '../assets', t.file);
    const buffer = await generateWithTemplate(templatePath, testStats, t.box, t.layout);
    const outFile = path.join(tmpDir, `stats-${t.name}.png`);
    fs.writeFileSync(outFile, buffer);
    console.log(`Generated: tmp/stats-${t.name}.png`);
  }
  console.log('\nCompare the two files in tmp/ folder');
})();
