# Environment Setup Guide

## Overview
This project uses **dotenv-flow** for automatic environment-specific configuration management. This prevents accidentally running development code against production databases and vice versa.

## Environment Files

### Active Files
- `.env.development` - Development configuration (localhost database, dev Discord bot)
- `.env.production` - Production configuration (remote database, prod Discord bot)
- `.env` - Currently active environment (gitignored, auto-loaded as fallback)

### Current Status
- **Active environment**: `.env` is currently set to **development**
- **Development database**: `localhost:3306/roster_control`
- **Production database**: `216.114.75.101:12007/roster_control`

## Safe Workflow

### Development Work (Default)
```bash
# Run bot in development
npm run dev

# Check migration status
npm run db:migrate:status:dev

# Run migrations (SAFE - localhost only)
npm run db:migrate:dev

# Rollback if needed (SAFE - localhost only)
npm run db:migrate:rollback:dev
```

### Production Deployment (Explicit Intent Required)
```bash
# Check migration status on production
npm run db:migrate:status:prod

# Run migrations on production (DANGEROUS - requires explicit command)
npm run db:migrate:prod

# Start production bot
npm start
```

## How It Works

### Automatic Environment Detection
1. **Development (explicit)**: `NODE_ENV=development` → Loads `.env.development`
2. **Production (Pterodactyl egg)**: No NODE_ENV set → Loads `.env` which contains `NODE_ENV=production`
3. **Production (manual)**: `NODE_ENV=production` → Loads `.env.production`

### Production Egg Behavior
The Pterodactyl egg startup command does NOT set `NODE_ENV` explicitly. This is intentional and safe because:
- The egg uses `.env` file directly (not `.env.development` or `.env.production`)
- The `.env` file on production server contains `NODE_ENV=production`
- dotenv-flow loads `.env` and reads `NODE_ENV=production` from it
- System then operates in production mode correctly

### Safety Features
- **Explicit commands**: Must specify `:dev` or `:prod` for database operations
- **No generic commands**: `npm run db:migrate` is deprecated - use explicit versions
- **Prevent accidents**: Can't accidentally run against wrong database

## Migration Workflow

### Testing New Migrations
```bash
# 1. Create migration file
migrations/025-my-new-migration.js

# 2. Test on development
npm run db:migrate:dev

# 3. Verify it worked
npm run db:migrate:status:dev

# 4. Test rollback
npm run db:migrate:rollback:dev

# 5. Re-apply
npm run db:migrate:dev

# 6. Once tested, deploy to production
npm run db:migrate:prod
```

## Switching Environments Manually

If you need to change the default environment in `.env`:

```bash
# Switch to development (local work)
cp .env.development .env

# Switch to production (before deploying to Pterodactyl)
cp .env.production .env
```

**Note**: This is rarely needed for local development since explicit `:dev` and `:prod` commands handle everything.

## Production Deployment Checklist

**CRITICAL**: Before deploying to production Pterodactyl egg, ensure `.env` is set to production:

```bash
# 1. Verify .env.production exists and has correct settings
cat .env.production | grep NODE_ENV
# Should show: NODE_ENV=production

# 2. Copy to .env for production deployment
cp .env.production .env

# 3. Verify .env is now production
cat .env | grep NODE_ENV
# Should show: NODE_ENV=production

# 4. Commit .env to git (or deploy it to Pterodactyl)
git add .env
git commit -m "Switch .env to production for deployment"
git push
```

**Why this matters**: The Pterodactyl egg startup command does NOT set `NODE_ENV` explicitly. It relies on the `.env` file containing `NODE_ENV=production`.

## What Was Fixed

### Before (Broken)
- Single `.env` file with `NODE_ENV=production`
- Running `npm run db:migrate` used production database
- No way to safely test migrations
- Accidentally ran migration against production

### After (Fixed)
- Separate `.env.development` and `.env.production` files
- Explicit `:dev` and `:prod` commands prevent accidents
- dotenv-flow automatically loads correct environment
- Safe development workflow

## Important Files Updated

1. **config/config.js** - Now uses `dotenv-flow` instead of manual `dotenv`
2. **package.json** - Added `:dev` and `:prod` variants for all database commands
3. **CLAUDE.md** - Updated with new safety rules and workflow
4. **.env** - Switched to development configuration

## Verification

### Test Environment Detection
```bash
# Test that environment detection works correctly
npm run test:env
```

This will verify that:
- .env file is read correctly when NODE_ENV is not set (Pterodactyl egg scenario)
- The system correctly detects production vs development mode
- Database configuration matches the expected environment

### Check Database Connections
```bash
npm run db:migrate:status:dev   # Should connect to localhost
npm run db:migrate:status:prod  # Should connect to 216.114.75.101
```
