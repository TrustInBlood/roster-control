# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Getting Started

Before working on this codebase:
- Review `TASKS.md` for current implementation status and next steps
- Check `PLANNING.md` for overall project architecture and goals
- These documents are referenced by Cursor AI rules and should be kept up to date

## Quick Reference

**Start Development**: `npm run dev`
**Deploy Commands**: `npm run deploy:commands:dev`
**Test Database**: `npm run test:db`
**Environment Utility**: Always use `src/utils/environment.js` for environment detection
**Logging**: Always use `src/utils/logger.js` (replace console.log with loggerConsole)

## Development Commands

### Essential Commands
- `npm run dev` - Start development server with auto-reload via nodemon
- `npm run dev:debug` - Start development server with Node.js debugger
- `npm start` - Production start (NODE_ENV=production)
- `npm run lint` - Run ESLint for code quality checks
- `npm run lint:fix` - Auto-fix ESLint issues where possible
- `npm test` - Run Jest test suite

### Database Commands
- `npm run test:db` - Test database connection and configuration
- `npm run test:player` - Test Player model operations (create, read, update, delete)

### Discord Commands Deployment
- `npm run deploy:commands` - Deploy slash commands (uses current NODE_ENV)
- `npm run deploy:commands:dev` - Deploy commands to development environment
- `npm run deploy:commands:prod` - Deploy commands to production environment

## Architecture Overview

### Core System Design
This is a **Discord bot for Squad server roster management** with the following key architectural components:

**Data Layer**: MariaDB with Sequelize ORM, featuring automated Umzug migrations and connection pooling. Core models include `Player` (Steam/EOS IDs, roster status), `Admin` (Discord info, permissions), `Server` (Squad server configs), `AuditLog` (comprehensive action tracking), and `DutyStatusChange` (duty status history).

**Bot Framework**: Discord.js v14 with modular command structure, role-based permissions, and automated event handling for voice state monitoring.

**Integration Layer**: Designed for BattleMetrics API integration and SquadJS real-time event processing (planned), with proper rate limiting and reconnection logic.

**On-Duty System**: Discord role-based admin and tutor management where roles are the source of truth for duty status. Includes separate duty tracking for admins and tutors, duty change logging, external role change detection, automatic notifications, and voice channel monitoring.

**Tutor System**: Comprehensive tutor management with specialty role assignments (helicopter, armor, infantry, squad expert) restricted to tutor program leads. Includes separate on-duty tracking with visual distinction and complete lifecycle management.

**Unified Whitelist System**: Database-driven whitelist management with automatic Discord role synchronization. The system maintains a single source of truth in the database while automatically creating/revoking entries when Discord roles change. Supports both manual admin-granted whitelists and automatic role-based access with confidence-based Steam account linking requirements.

### Key Components

#### Permission System (`src/handlers/permissionHandler.js`)
- Role-based command restrictions defined in `config/roles.js`
- Middleware pattern for command execution
- Support for multiple role IDs per command

#### Database Architecture (`src/database/`)
- **Sequelize Models**:
  - `Player` - Steam/EOS IDs, username, roster status, activity tracking
  - `Admin` - Discord user info, permission levels (no duty status - roles determine this)
  - `Server` - Squad server configs, health status, connection details
  - `AuditLog` - Comprehensive action tracking with actor/target info
  - `DutyStatusChange` - Duty status change logs with source tracking
  - `Whitelist` - Unified whitelist entries with source tracking (role/manual/import)
  - `PlayerDiscordLink` - Steam account to Discord user linking with confidence scores
  - `VerificationCode` - Temporary codes for in-game Steam account verification
- **Migration System**: Umzug-powered automated database migrations
- **Connection Management**: Singleton DatabaseManager with health checks and connection pooling
- **Configuration**: Charset-aware MariaDB setup (utf8mb4_unicode_ci), flexible TEXT fields instead of ENUMs

#### Command System (`src/commands/`)
- **Modular Structure**: Each command is a separate file with `data` (SlashCommandBuilder) and `execute` properties
- **Error Handling**: Centralized error handling with user-friendly messages
- **Current Commands**: `/ping`, `/help`, `/onduty`, `/offduty`, `/ondutytutor`, `/offdutytutor`, `/addspecialty`, `/removespecialty`, `/removetutor`, `/whatsnew`, `/linkid`, `/adminlink`, `/upgradeconfidence`, `/unlink`, `/whitelist` (grant/info/extend/revoke), `/unlinkedstaff`, `/checkenv`

#### Event Handling (`src/handlers/`)
- **Voice State Monitoring**: Automatic notifications when users join monitored voice channels
- **Role Change Detection**: Monitors Discord role changes, distinguishes bot vs external changes
- **Duty Notifications**: Embed-based status updates sent to configured channels
- **Error Management**: Comprehensive error handling with logging

#### Unified Whitelist System (`src/services/`)
- **Single Source of Truth**: All whitelist access is determined by database entries, with Discord roles automatically synced
- **RoleWhitelistSyncService**: Automatically creates/updates/revokes database entries when Discord roles change
- **WhitelistService**: Generates comprehensive Squad server whitelists with role-based entries from database
- **WhitelistAuthorityService**: Validates access by checking database entries and Steam account confidence
- **Source Tracking**: Entries are categorized by source (role/manual/import) for proper management
- **Confidence Requirements**: Staff roles require high-confidence (≥1.0) Steam account links for security
- **Account Linking**: In-game verification system via SquadJS for secure Steam-Discord account connections
- **Automatic Sync**: Discord role changes are automatically detected and synced to database whitelist entries
- **Comprehensive Output**: Squad server whitelist includes group definitions, role-based staff/members, and manual entries

## Configuration System

### Environment Variables
Configuration is managed through `.env` file (see `.env.example`):
- **Discord**: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`
- **Database**: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- **BattleMetrics**: `BATTLEMETRICS_TOKEN`, `BATTLEMETRICS_SERVER_ID`
- **SquadJS**: `SQUADJS_HOST`, `SQUADJS_PORT`, `SQUADJS_PASSWORD`
- **Logging**: `LOG_LEVEL`, `NODE_ENV`

### Role and Channel Configuration
- **Roles**: Configured in `config/roles.js` with specific Discord role IDs for command permissions
- **Channels**: Configured in `config/channels.js` for duty logs and voice monitoring
- **Notification Routing**: Configured in `config/channels.js` via `NOTIFICATION_ROUTES` - maps notification types to target channels
- **Validation**: Built-in config validation in `config/config.js`

### Environment-Specific Configuration
The system automatically loads environment-specific configurations based on `NODE_ENV`:

- **Production**: Uses `config/squadGroups.js`, `config/channels.js`, `config/discordRoles.js`
- **Development**: Uses `config/squadGroups.development.js`, `config/channels.development.js`, `config/discordRoles.development.js`

**IMPORTANT**: Always use the centralized environment utility for environment detection and config loading:

```javascript
// ✅ CORRECT - Use centralized utility
const { getHighestPriorityGroup, isDevelopment } = require('../utils/environment');

// ❌ WRONG - Don't manually check environment
const isDevelopment = process.env.NODE_ENV === 'development';
const { getHighestPriorityGroup } = require(isDevelopment ? '../../config/squadGroups.development' : '../../config/squadGroups');
```

**Available exports from `src/utils/environment.js`**:
- `isDevelopment`, `isProduction` - Environment flags
- `getConfigPath(configName)` - Get environment-specific config path
- `loadConfig(configName)` - Load environment-specific configuration
- `squadGroups`, `channels`, `discordRoles` - Pre-loaded configurations
- `getHighestPriorityGroup`, `CHANNELS`, `DISCORD_ROLES` - Common exports

## Development Patterns

### Command Creation
1. Create command file in `src/commands/` following existing pattern
2. Export object with `data` (SlashCommandBuilder) and `execute` function
3. Commands auto-load via dynamic file scanning in `src/index.js`
4. Deploy commands using `npm run deploy:commands:dev`

### Database Operations
- Use Sequelize models, not raw SQL
- Use Umzug for database migrations (automated on startup)
- All models include comprehensive static methods for querying
- Player model: `findBySteamId()`, `findByEosId()`, `getRosterMembers()`
- Admin model: `findByDiscordId()`, `getActiveAdmins()`, `getAdminsByLevel()`
- Always use database connection manager for health checks
- Database schema uses flexible TEXT fields instead of ENUMs for future-proofing
- **IMPORTANT**: `PlayerDiscordLink.link_source` is an ENUM with only these values: `'manual'`, `'ticket'`, `'squadjs'`, `'import'`. Use `'manual'` for admin-initiated links (including whitelist operations). Do NOT use `'whitelist'` or `'admin'` as these will cause database errors.

### Centralized Logging System
The application uses a unified Winston-based logging system with consistent timestamps across all environments:

- **Location**: `src/utils/logger.js` - Centralized logging utility
- **Format**: `[HH:mm:ss] level: [service] message` with timestamps in all environments
- **Usage**: Replace `console.log` with `const { console: loggerConsole } = require('../utils/logger');` then use `loggerConsole.log()`
- **Service Contexts**: Use `createServiceLogger('ServiceName')` for categorized logging
- **Global Override**: Available via `overrideGlobalConsole()` to catch any missed console calls
- **Log Levels**: error, warn, info, debug (configurable via `LOG_LEVEL` environment variable)
- **File Logging**: Automatic file output to `logs/` directory with rotation (5MB max, 5 files)
- **Environment Behavior**:
  - **Development**: All log levels to console with timestamps and colors
  - **Production**: Info level and above to console with timestamps

**Key Methods**:
```javascript
const { console: loggerConsole, createServiceLogger, logger } = require('../utils/logger');

// Basic logging (replaces console.log)
loggerConsole.log('Message with timestamp');
loggerConsole.error('Error with timestamp');

// Service-specific logging
const serviceLogger = createServiceLogger('WhitelistService');
serviceLogger.info('Service message');

// Direct logger access
logger.info('Direct winston logger access');
```

### Error Handling
- Use `sendError()` and `sendSuccess()` from `src/utils/messageHandler.js`
- Implement proper try-catch blocks in all async operations
- Use centralized logger from `src/utils/logger.js` (not direct Winston logger)
- All error logging includes timestamps automatically

### Testing
- Database tests use `scripts/test-db-connection.js` and `scripts/test-player-model.js`
- Run `npm run test:db` before making database changes
- Test command deployment before production releases

## Project Structure Context

### Current Implementation Status
- ✅ **Complete**: Discord bot framework, all database models with migrations, role-based on-duty system, tutor system with specialty management, external role change detection, duty status logging, permission system, error handling, **centralized logging system with timestamps**, **unified whitelist system with automatic Discord role synchronization**, Steam account linking with confidence scoring, comprehensive Squad server whitelist generation
- 🔄 **In Progress**: SquadJS integration, BattleMetrics API
- 📋 **Planned**: Player activity tracking, RCON integration, automated reporting

### Key Files for Development
- `src/index.js` - Main bot entry point with event handlers
- `src/utils/logger.js` - **Centralized logging system with timestamps for all environments**
- `src/database/models/` - All database models (Player, Admin, Server, AuditLog, DutyStatusChange, Whitelist, PlayerDiscordLink, VerificationCode)
- `src/handlers/roleChangeHandler.js` - Discord role change detection and processing
- `src/services/DutyStatusFactory.js` - Duty status management and logging
- `src/services/RoleWhitelistSyncService.js` - **Automatic Discord role to database whitelist synchronization**
- `src/services/WhitelistService.js` - **Squad server whitelist generation with role-based entries**
- `src/services/WhitelistIntegration.js` - **Unified whitelist system initialization and startup sync**
- `src/services/WhitelistAuthorityService.js` - **Unified whitelist access validation**
- `src/services/SquadJSLinkingService.js` - In-game Steam account verification and linking
- `src/utils/environment.js` - **Centralized environment detection and config loading utility**
- `config/roles.js` - Permission configuration (contains actual Discord role IDs)
- `config/channels.js` - Channel configuration (contains actual Discord channel IDs)
- `migrations/` - Database migration files managed by Umzug (see migrations 019-020 for whitelist system)
- `TASKS.md` - Current implementation status and next steps

### Unified Whitelist System Workflow

The unified whitelist system (implemented in migrations 019-020) automatically manages Squad server access based on Discord roles:

1. **Role Monitoring**: `roleChangeHandler.js` detects Discord role changes in real-time
2. **Database Sync**: `RoleWhitelistSyncService` creates/updates/revokes database entries when roles change
3. **Whitelist Generation**: `WhitelistService` generates comprehensive Squad server whitelists from database
4. **Output Format**: Squad servers receive whitelist files with group definitions, role-based entries, and manual entries
5. **Steam Linking**: Users link Steam accounts via in-game verification for whitelist access

**Key Features**:
- ✅ **Automatic Sync**: Discord role changes instantly update Squad server access
- ✅ **Source Tracking**: Entries tagged by source (role/manual/import) for proper management
- ✅ **Confidence Scoring**: Staff roles require high-confidence Steam account links
- ✅ **Comprehensive Output**: Single whitelist file includes all access types and group definitions
- ✅ **Unlinked Handling**: Staff without Steam links get placeholder entries for tracking

### Integration Points
- **BattleMetrics API**: Rate-limited HTTP client for server/player data
- **SquadJS**: WebSocket connection for real-time game events
- **Discord Events**: Voice state monitoring for admin notifications, role change detection for whitelist sync
- **Database**: Automated Umzug migrations on startup, comprehensive logging and audit trails

## Important Notes

### Project-Specific Constraints
- **ESLint**: Use single quotes instead of template literals for simple strings
- **Slash Commands**: Adding a Discord slash command requires updates in `config/roles.js`
- **Database ENUMs**: `PlayerDiscordLink.link_source` only accepts: `'manual'`, `'ticket'`, `'squadjs'`, `'import'`
- **Code Style**: Avoid using emojis in code, comments, or output unless specifically requested
- **No Production Access**: You don't have access to the production server
- **No Commits**: Do not commit anything
- **Never Start Production**: Never start the production instance (`npm start`)

### Security Considerations
- Role IDs and channel IDs in config files are environment-specific
- Database uses connection pooling with charset configuration for Squad player names
- Environment variables must be properly configured before deployment

### Documentation Updates
When implementing new features, update:
- `/whatsnew` command with latest features
- `TASKS.md` with implementation status
- `PLANNING.md` if architecture changes
- `README.md` if user-facing changes occur

### Multi-Server Architecture
The system is designed to support 5 Squad servers through SquadJS instances, with centralized Discord bot management and per-server data tracking.