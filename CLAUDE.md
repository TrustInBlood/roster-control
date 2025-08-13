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

**Data Layer**: MariaDB with Sequelize ORM, featuring automated migrations and connection pooling. The primary model is `Player` with comprehensive tracking of Steam IDs, EOS IDs, roster status, and activity history.

**Bot Framework**: Discord.js v14 with modular command structure, role-based permissions, and automated event handling for voice state monitoring.

**Integration Layer**: Designed for BattleMetrics API integration and SquadJS real-time event processing (planned), with proper rate limiting and reconnection logic.

**On-Duty System**: Role-based admin management where admins can set themselves on/off duty, with automatic notifications and voice channel monitoring.

### Key Components

#### Permission System (`src/handlers/permissionHandler.js`)
- Role-based command restrictions defined in `config/roles.js`
- Middleware pattern for command execution
- Support for multiple role IDs per command

#### Database Architecture (`src/database/`)
- **Sequelize Models**: Player model with comprehensive fields (steamId, eosId, username, roster status, activity tracking)
- **Connection Management**: Singleton DatabaseManager with health checks and connection pooling
- **Configuration**: Charset-aware MariaDB setup (utf8mb4_unicode_ci)

#### Command System (`src/commands/`)
- **Modular Structure**: Each command is a separate file with `data` (SlashCommandBuilder) and `execute` properties
- **Error Handling**: Centralized error handling with user-friendly messages
- **Current Commands**: `/ping`, `/help`, `/onduty`, `/offduty`

#### Event Handling (`src/handlers/`)
- **Voice State Monitoring**: Automatic notifications when users join monitored voice channels
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
- Player model includes static methods: `findBySteamId()`, `findByEosId()`, `getRosterMembers()`
- Instance methods: `updateActivity()`, `addPlayTime()`
- Always use database connection manager for health checks

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
- ✅ **Complete**: Discord bot framework, basic commands, permission system, database models, error handling
- 🔄 **In Progress**: Database migrations, SquadJS integration, BattleMetrics API
- 📋 **Planned**: Whitelist management commands, player activity tracking, RCON integration

### Key Files for Development
- `src/index.js` - Main bot entry point with event handlers
- `src/database/models/Player.js` - Primary data model
- `config/roles.js` - Permission configuration (contains actual Discord role IDs)
- `config/channels.js` - Channel configuration (contains actual Discord channel IDs)
- `PLANNING.md` - Detailed project roadmap and architecture decisions
- `TASKS.md` - Current implementation status and next steps

### Integration Points
- **BattleMetrics API**: Rate-limited HTTP client for server/player data
- **SquadJS**: WebSocket connection for real-time game events
- **Discord Events**: Voice state monitoring for admin notifications
- **Database**: Automated sync on startup, no manual migrations needed

## Important Notes

### Security Considerations
- Role IDs and channel IDs in config files are environment-specific
- Database uses connection pooling with charset configuration for Squad player names
- Environment variables must be properly configured before deployment

### Development Workflow
1. Always test database connection before implementing new features
2. Deploy commands to development environment first
3. Use ESLint for code consistency
4. Follow existing permission middleware patterns for new commands
5. Update TASKS.md when implementing new features

### Multi-Server Architecture
The system is designed to support 5 Squad servers through SquadJS instances, with centralized Discord bot management and per-server data tracking.