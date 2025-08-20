# Roster Control Discord Bot - Implementation Tasks

## Phase 1: Project Setup & Foundation ✅ COMPLETED

### Project Initialization ✅
- [x] Create GitHub repository
- [x] Set up basic Node.js project structure
- [x] Initialize npm and install core dependencies
  - [x] Discord.js v14
  - [x] Sequelize, MariaDB driver
  - [x] node-fetch
  - [x] socket.io-client (via SquadJS)
  - [x] Winston
  - [x] dotenv
  - [x] Umzug
- [x] Create README with project overview
- [x] Set up environment configuration system
  - [x] Environment variables for sensitive data
  - [x] Centralized config management
  - [x] Example configuration file
- [x] Configure ESLint for code formatting
- [x] Set up command deployment scripts

### Discord Bot Framework ✅ COMPLETED
- [x] Set up Discord.js and register bot with Discord
- [x] Implement modular command handler structure
- [x] Create `/ping` command for testing bot connectivity
- [x] Implement `/help` command with dynamic command listing
- [x] Set up role-based permission system for commands
- [x] Create error handling and logging system
  - [x] Implement ephemeral message handling for user feedback
  - [x] Set up Winston logging for errors and actions
- [x] Configure Discord embed formatting for responses

### Database Setup ✅ COMPLETED
- [x] Set up MariaDB with Sequelize ORM
- [x] Design and implement database schema
  - [x] Players model (Player ID, Username, Roster Status, Activity History)
  - [x] Admins model (Admin ID, Discord User Info, Permission Level) - removed duty status tracking per role-based approach
  - [x] Servers model (Server ID, Server Name, Connection Details, Health Status)
  - [x] Audit Log model (Action ID, Action Type, Actor/Target Info, Timestamp, Details)
  - [x] Duty Status Changes model (Status Change Log, Source, Reason, Metadata)
- [x] Create database connection module
  - [x] Configure charset and collation settings (utf8mb4_unicode_ci)
  - [x] Implement connection pooling
- [x] Implement basic CRUD operations for all models
- [x] Set up Umzug for automated database migrations
  - [x] Create migration files for all tables
  - [x] Implement indexes for performance
  - [x] Add foreign key relationships and associations
- [x] Configure data retention fields (timestamps)
- [x] Replace ENUM fields with TEXT fields for flexibility
- [ ] Set up database backup system
- [ ] Implement data pruning for old records

## Phase 2: Squad Server & BattleMetrics Integration

### Multi-Squad Server Integration (via SquadJS)
- [ ] Design multi-server architecture
  - [ ] Support for 5 Squad servers via separate SquadJS instances
  - [ ] Server identification and management system
  - [ ] Centralized event processing from multiple SquadJS instances
- [ ] Configure SquadJS connections for multiple servers
  - [ ] Set up server configurations in environment files (5 servers)
  - [ ] Implement SquadJS instance management
  - [ ] Configure connection pooling for multiple SquadJS instances
- [ ] Implement SquadJS event listeners for key events
  - [ ] Player join events (with server identification)
  - [ ] Player leave events (with server identification)
  - [ ] Server status updates (per server)
- [ ] Configure SquadJS connection manager for multiple instances
  - [ ] Handle connection failures per server
  - [ ] Implement reconnection logic for individual servers
  - [ ] Monitor health of all SquadJS connections
- [ ] Implement error handling and reconnection logic using SquadJS
  - [ ] Per-server error handling
  - [ ] Automatic reconnection for failed instances
  - [ ] Alert system for server connection issues
- [ ] Add server authentication and security measures
  - [ ] Secure credential management for 5 servers
  - [ ] Access control per server

### BattleMetrics Integration
- [ ] Set up `node-fetch` for BattleMetrics API queries
- [ ] Configure bearer token authentication
- [ ] Implement API query functions
  - [ ] Fetch server status for all 5 servers
  - [ ] Retrieve player activity data per server
  - [ ] Batch API calls for multiple servers
- [ ] Add rate-limiting handling with retry logic
  - [ ] Implement per-server rate limiting
  - [ ] Optimize API calls across multiple servers
- [ ] Implement error handling for API failures
- [ ] Cache API responses to reduce rate limit impact
  - [ ] Server-specific caching
  - [ ] Cross-server data correlation

### Data Collection
- [ ] Identify key data points from SquadJS events
  - [ ] Player join/leave events (with server context)
  - [ ] Server status updates (per server)
  - [ ] Cross-server player tracking
- [ ] Process SquadJS event data for roster management
  - [ ] Server-specific roster management
  - [ ] Cross-server player validation
- [ ] Set up data normalization
  - [ ] Sanitize player names
  - [ ] Validate player IDs (Steam ID, BattleMetrics ID)
  - [ ] Handle player names across multiple servers
- [ ] Implement data buffering system
  - [ ] Design buffer strategy for high-volume events (5 servers)
  - [ ] Add batch processing for database writes
  - [ ] Implement buffer overflow protection
  - [ ] Server-specific buffering
- [ ] Create data validation system
  - [ ] Validate incoming SquadJS event data
  - [ ] Cross-server data validation
  - [ ] Log validation errors

### Data Storage
- [ ] Implement storage for player roster data
  - [ ] Server-specific roster storage
  - [ ] Cross-server player tracking
- [ ] Store admin on-duty status and history
  - [ ] Server-specific admin management
- [ ] Save audit logs for roster and admin actions
  - [ ] Server-specific audit trails
- [ ] Set up data indexing for efficient queries
  - [ ] Add timestamp-based indexes
  - [ ] Create player and server lookup indexes
  - [ ] Cross-server query optimization
- [ ] Implement data pruning for old records
  - [ ] Configure retention policies for audit logs
  - [ ] Set up pruning for inactive player records
  - [ ] Server-specific data retention

## Phase 3: Core Bot Features

### On-Duty Admin Commands ✅ COMPLETED
- [x] Implement `/onduty` command
  - [x] Role-based duty status (Discord roles as source of truth)
  - [x] Database logging of duty status changes
  - [x] Notification system for duty status changes
- [x] Implement `/offduty` command
  - [x] Role-based duty status removal
  - [x] Database logging of duty status changes
  - [x] Notification system for duty status changes
- [x] External role change detection and logging
  - [x] Monitor Discord role changes outside of bot commands
  - [x] Prevent duplicate logging of bot-initiated role changes
- [x] Voice channel monitoring for on-duty admin notifications
- [ ] Create automated on-duty triggers
  - [ ] Define rules (e.g., time-based, SquadJS event-driven)
  - [ ] Implement logic to assign on-duty status
- [ ] Restrict whitelist commands to on-duty admins
- [x] Log all admin actions in audit log

### Roster Management Commands
- [ ] Implement `/whitelist add <player_id> type:<source>` command
  - [ ] Support BattleMetrics and manual input sources
  - [ ] Validate player ID and update roster
  - [ ] Log action in audit log
- [ ] Implement `/whitelist remove <player_id>` command
  - [ ] Remove player from roster
  - [ ] Log action in audit log
- [ ] Create `/whitelist list` command
  - [ ] Display current roster with pagination
- [ ] Implement role-based permissions for whitelist commands

### Player Activity Tracking
- [ ] Process real-time player join/leave events from SquadJS
- [ ] Fetch and store player activity from BattleMetrics API
- [ ] Implement `/activity <player_id>` command
  - [ ] Show recent join/leave history
  - [ ] Include timestamps and server details

## Phase 4: Enhanced Features

### RCON Integration
- [ ] Configure RCON integration via SquadJS
- [ ] Implement RCON commands for automated kicks/bans
  - [ ] Enforce roster violations
  - [ ] Restrict to on-duty admins
- [ ] Log RCON actions in audit log

### Automated Reporting
- [ ] Implement daily roster and admin activity summaries
- [ ] Create weekly server activity reports
- [ ] Configure delivery to Discord channels or DMs
- [ ] Allow customization of report frequency

### Notifications
- [ ] Implement alerts for on-duty admins
  - [ ] Notify on unauthorized player joins (via SquadJS events)
  - [ ] Alert on roster violations
- [ ] Configure notification channels
- [ ] Allow customization of alert triggers

## Phase 5: Testing & Deployment

### Testing
- [ ] Write unit tests for core modules
  - [ ] Command handler
  - [ ] Database operations
  - [ ] SquadJS and BattleMetrics integrations
- [ ] Implement integration tests for Discord and database
- [ ] Test on-duty admin automation logic
- [ ] Design load tests for high player volumes
- [ ] Perform security testing for credential management
- [ ] Set up continuous testing in CI/CD pipeline

### Documentation
- [x] Create comprehensive README with project overview
- [x] Document environment configuration process
- [x] Document command deployment process
- [ ] List available commands and usage
- [ ] Write troubleshooting guide
- [ ] Create admin guide for on-duty system

### Deployment
- [ ] Configure Pterodactyl panel for Node.js application
- [ ] Write startup script with Umzug migrations
- [x] Set up environment configuration system
- [ ] Create backup/restore procedures
- [ ] Implement monitoring for uptime and performance

## Phase 6: Post-Launch

### Monitoring & Maintenance
- [ ] Set up usage tracking for commands
- [ ] Create performance monitoring dashboard
- [ ] Implement error reporting to Discord channel
- [ ] Establish dependency update schedule
- [ ] Schedule regular database maintenance

### Community Engagement
- [ ] Create public roadmap for feature planning
- [ ] Set up feedback collection via Discord
- [ ] Implement feature request tracking
- [ ] Create admin satisfaction surveys

### Future Expansion
- [ ] Explore web dashboard for roster management
- [ ] Plan advanced notification customization
- [ ] Research integration with other game server APIs

## Current Status

### ✅ Completed
- Project initialization and structure
- Basic environment configuration system
- Package.json with all dependencies
- ESLint configuration
- Command deployment scripts
- Comprehensive README
- Gitignore configuration
- Discord bot framework (commands, handlers, permissions, logging)
- Core bot commands (/ping, /help, /onduty, /offduty)
- Error handling and permission system
- Winston logging setup
- Complete database schema with all models (Player, Admin, Server, AuditLog, DutyStatusChange)
- Database migrations and connection management
- Role-based on-duty admin system with Discord role integration
- External role change detection and logging prevention for bot-initiated changes
- Duty status change logging and audit trails
- Voice channel monitoring for admin notifications

### 🔄 In Progress
- SquadJS integration for 5 servers
- BattleMetrics API integration

### 📋 Next Steps
1. Implement SquadJS integration for 5 servers
2. Set up BattleMetrics API integration
3. Build roster management commands with database backend
4. Implement player activity tracking
5. Write unit tests for core modules
6. Set up database backup and pruning systems