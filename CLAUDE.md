# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- **Migration System**: Umzug-powered automated database migrations
- **Connection Management**: Singleton DatabaseManager with health checks and connection pooling
- **Configuration**: Charset-aware MariaDB setup (utf8mb4_unicode_ci), flexible TEXT fields instead of ENUMs

#### Command System (`src/commands/`)
- **Modular Structure**: Each command is a separate file with `data` (SlashCommandBuilder) and `execute` properties
- **Error Handling**: Centralized error handling with user-friendly messages
- **Current Commands**: `/ping`, `/help`, `/onduty`, `/offduty`, `/ondutytutor`, `/offdutytutor`, `/addspecialty`, `/removespecialty`, `/removetutor`, `/whatsnew`

#### Event Handling (`src/handlers/`)
- **Voice State Monitoring**: Automatic notifications when users join monitored voice channels
- **Role Change Detection**: Monitors Discord role changes, distinguishes bot vs external changes
- **Duty Notifications**: Embed-based status updates sent to configured channels
- **Error Management**: Comprehensive error handling with logging

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
- **Validation**: Built-in config validation in `config/config.js`

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

### Error Handling
- Use `sendError()` and `sendSuccess()` from `src/utils/messageHandler.js`
- Implement proper try-catch blocks in all async operations
- Log errors using Winston logger (configured in `src/index.js`)

### Testing
- Database tests use `scripts/test-db-connection.js` and `scripts/test-player-model.js`
- Run `npm run test:db` before making database changes
- Test command deployment before production releases

## Project Structure Context

### Current Implementation Status
- ✅ **Complete**: Discord bot framework, all database models with migrations, role-based on-duty system, tutor system with specialty management, external role change detection, duty status logging, permission system, error handling
- 🔄 **In Progress**: SquadJS integration, BattleMetrics API
- 📋 **Planned**: Whitelist management commands, player activity tracking, RCON integration

### Key Files for Development
- `src/index.js` - Main bot entry point with event handlers
- `src/database/models/` - All database models (Player, Admin, Server, AuditLog, DutyStatusChange)
- `src/handlers/roleChangeHandler.js` - Discord role change detection and processing
- `src/services/DutyStatusFactory.js` - Duty status management and logging
- `config/roles.js` - Permission configuration (contains actual Discord role IDs)
- `config/channels.js` - Channel configuration (contains actual Discord channel IDs)
- `migrations/` - Database migration files managed by Umzug
- `TASKS.md` - Current implementation status and next steps

### Integration Points
- **BattleMetrics API**: Rate-limited HTTP client for server/player data
- **SquadJS**: WebSocket connection for real-time game events
- **Discord Events**: Voice state monitoring for admin notifications
- **Database**: Automated Umzug migrations on startup, comprehensive logging and audit trails

## Important Notes

### Code Style Guidelines
- **Avoid using emojis** in code, comments, or output unless specifically requested by the user
- Use clear, descriptive text instead of emoji characters for better readability and maintainability

### Security Considerations
- Role IDs and channel IDs in config files are environment-specific
- Database uses connection pooling with charset configuration for Squad player names
- Environment variables must be properly configured before deployment

### Development Workflow
1. Always test database connection before implementing new features
2. Deploy commands to development environment first
3. Use ESLint for code consistency
4. Follow existing permission middleware patterns for new commands
5. Update documentation when implementing new features:
   - Update `/whatsnew` command with latest features
   - Update `TASKS.md` with implementation status
   - Update `PLANNING.md` if architecture changes
   - Update `README.md` if user-facing changes occur

### Multi-Server Architecture
The system is designed to support 5 Squad servers through SquadJS instances, with centralized Discord bot management and per-server data tracking.