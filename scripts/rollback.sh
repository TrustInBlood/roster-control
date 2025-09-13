#!/bin/bash

# Rollback script for role-based whitelist system
# Usage: ./scripts/rollback.sh [commit-hash]

set -e

echo "🔄 Role-Based Whitelist System Rollback"
echo "======================================"

# Get current commit for reference
CURRENT_COMMIT=$(git rev-parse HEAD)
echo "Current commit: $CURRENT_COMMIT"

# If commit hash provided, use it; otherwise ask for confirmation
if [ -n "$1" ]; then
    TARGET_COMMIT="$1"
    echo "Target commit: $TARGET_COMMIT"
    
    read -p "Rollback to commit $TARGET_COMMIT? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Rollback cancelled"
        exit 1
    fi
else
    echo ""
    echo "Recent commits:"
    git log --oneline -10
    echo ""
    read -p "Enter commit hash to rollback to: " TARGET_COMMIT
    
    if [ -z "$TARGET_COMMIT" ]; then
        echo "❌ No commit hash provided"
        exit 1
    fi
fi

echo ""
echo "🛑 Stopping bot..."
pm2 stop roster-control || echo "⚠️ Bot may not be running"

echo ""
echo "🔄 Rolling back code..."
git checkout "$TARGET_COMMIT"

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🚀 Deploying commands..."
npm run deploy:commands:prod

echo ""
echo "▶️ Starting bot..."
pm2 start roster-control

echo ""
echo "✅ Rollback complete!"
echo ""
echo "Please verify:"
echo "1. Bot is online in Discord"
echo "2. Commands work as expected"
echo "3. No errors in logs: pm2 logs roster-control"
echo ""
echo "To return to latest version later:"
echo "git checkout main && npm install && npm run deploy:commands:prod && pm2 restart roster-control"