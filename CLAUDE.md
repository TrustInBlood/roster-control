# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

| Task | Command |
|------|---------|
| Start Development | `npm run dev` |
| Deploy Commands | `npm run deploy:commands:dev` |
| Test Database | `npm run test:db` |
| Run Migrations | `npm run db:migrate:dev` |
| Lint | `npm run lint` |
| Dashboard Dev | `npm run dashboard:dev` |

**Before working**: Review `TASKS.md` for current status and `PLANNING.md` for architecture.

## Development Commands

### Core Commands
- `npm run dev` - Development server with nodemon auto-reload
- `npm run dev:debug` - Development with Node.js debugger
- `npm start` - Production start (NODE_ENV=production)
- `npm run lint` / `npm run lint:fix` - ESLint checks

### Database
- `npm run test:db` - Test database connection
- `npm run db:migrate:dev` - Run migrations (development)
- `npm run db:migrate:prod` - Run migrations (production - REQUIRES EXPLICIT INTENT)
- `npm run db:migrate:status:dev` - Check migration status
- `npm run db:migrate:rollback:dev` - Rollback last migration

### Discord Commands
- `npm run deploy:commands:dev` - Deploy to development Discord
- `npm run deploy:commands:prod` - Deploy to production Discord

### Dashboard (Vite + React)
- `npm run dashboard:dev` - Start dashboard dev server
- `npm run dashboard:build` - Build for production
- `npm run dashboard:preview` - Preview production build

## Architecture Overview

This is a **Discord bot for Squad server roster management** with these components:

### Data Flow
```
Discord Events → Bot Handlers → Services → Database (MariaDB/Sequelize)
                     ↓
              SquadJS Events ← Squad Servers (5 instances)
                     ↓
              HTTP Whitelist Server → Squad Server Configs
```

### Key Architectural Patterns

1. **Role-Based Duty System**: Discord roles are the source of truth for on-duty status. The bot monitors role changes and logs them.

2. **Unified Whitelist System**: Database-driven with automatic Discord role synchronization. When users gain/lose Discord roles, their whitelist access updates automatically.

3. **Confidence-Based Linking**: Steam accounts linked to Discord have confidence scores (0.3-1.0). Staff roles require high-confidence (≥1.0) links for whitelist access.

4. **Environment-Specific Configuration**: Uses dotenv-flow for automatic env loading. Always use `src/utils/environment.js` for environment detection.

## Key Files

### Entry Points
- `src/index.js` - Main bot entry, event handlers, HTTP server
- `config/config.js` - Configuration loading and validation

### Services (Business Logic)
- `src/services/RoleWhitelistSyncService.js` - Discord role → database whitelist sync
- `src/services/WhitelistService.js` - Squad server whitelist generation
- `src/services/WhitelistAuthorityService.js` - Access validation with confidence checks
- `src/services/DutyStatusFactory.js` - Admin/tutor duty management
- `src/services/SquadJSConnectionManager.js` - Multi-server SquadJS connections
- `src/services/SquadJSLinkingService.js` - In-game Steam account verification

### Handlers (Event Processing)
- `src/handlers/roleChangeHandler.js` - Discord role change detection
- `src/handlers/permissionHandler.js` - Command permission checks

### Utilities
- `src/utils/environment.js` - **Always use this for environment detection**
- `src/utils/logger.js` - Winston-based logging (use instead of console.log)
- `src/utils/messageHandler.js` - `sendError()` and `sendSuccess()` helpers

### Configuration
- `config/roles.js` / `config/roles.development.js` - Command permissions
- `config/channels.js` - Discord channel IDs for notifications
- `config/squadGroups.js` - Squad server group definitions

## Development Patterns

### Adding a New Command
1. Create file in `src/commands/` with `data` (SlashCommandBuilder) and `execute` exports
2. Add permission config to BOTH `config/roles.js` AND `config/roles.development.js`
3. Deploy: `npm run deploy:commands:dev`

### Environment Configuration
```javascript
// ✅ CORRECT - Use centralized utility
const { isDevelopment, getHighestPriorityGroup } = require('../utils/environment');

// ❌ WRONG - Don't manually check
const isDevelopment = process.env.NODE_ENV === 'development';
```

### Logging
```javascript
const { console: loggerConsole, createServiceLogger } = require('../utils/logger');

loggerConsole.log('General message');  // Replaces console.log

const logger = createServiceLogger('MyService');
logger.info('Service-specific message');
```

### Database Operations
- Use Sequelize models, not raw SQL
- Migrations auto-run on startup via Umzug
- **CRITICAL**: `PlayerDiscordLink.link_source` only accepts: `'manual'`, `'ticket'`, `'squadjs'`, `'import'`

## Important Constraints

### Production Safety
- **ALWAYS** use explicit env commands: `npm run db:migrate:dev` not `npm run db:migrate`
- **NEVER** run untested migrations on production
- Current `.env` is set to development (localhost database)

### Code Style
- ESLint: Use single quotes for simple strings
- No emojis in code/output unless requested
- Commands require permission config in BOTH dev and prod role files

### Whitelist Expiration
The `expiration` field in Whitelist model is deprecated. Always calculate expiration from:
- `duration_value` + `duration_type` + `granted_at` (authoritative)
- NOT from `entry.expiration` (may be stale after stacking)

## Current Discord Commands

Admin: `/onduty`, `/offduty`, `/promote`, `/addmember`, `/adminlink`, `/adminunlink`, `/unlinkedstaff`

Tutor: `/ondutytutor`, `/offdutytutor`, `/addspecialty`, `/removespecialty`, `/removetutor`

Whitelist: `/whitelist` (grant/info/extend/revoke/sync), `/auditwhitelist`

Account: `/linkid`, `/unlink`

Utility: `/ping`, `/help`, `/checkenv`, `/whatsnew`, `/stats`, `/dutystats`, `/dashboard`, `/reloadposts`

## Multi-Server Architecture

The system supports 5 Squad servers via separate SquadJS instances. Each server has its own connection managed by `SquadJSConnectionManager`. Server configurations are in environment variables (`SQUADJS_HOST_1`, `SQUADJS_PORT_1`, etc.).

## HTTP Endpoints

The bot runs an HTTP server (port from `HTTP_PORT` env) providing:
- `/combined` - Unified whitelist for Squad servers (group definitions + all entries)
- `/staff` - Staff-only whitelist entries
- `/whitelist` - Non-staff whitelist entries

## Documentation Updates

When implementing features, update:
- `/whatsnew` command for user-visible changes
- `TASKS.md` for implementation status
- `PLANNING.md` if architecture changes
