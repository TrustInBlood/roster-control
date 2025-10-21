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

### Multi-Squad Server Integration (via SquadJS) ✅ COMPLETED
- [x] Design multi-server architecture
  - [x] Support for 5 Squad servers via separate SquadJS instances
  - [x] Server identification and management system
  - [x] Centralized event processing from multiple SquadJS instances
- [x] Configure SquadJS connections for multiple servers
  - [x] Set up server configurations in environment files (5 servers)
  - [x] Implement SquadJS instance management
  - [x] Configure connection pooling for multiple SquadJS instances
- [x] Implement SquadJS event listeners for key events
  - [x] Player join events (with server identification)
  - [x] Player leave events (with server identification)
  - [x] Server status updates (per server)
- [x] Configure SquadJS connection manager for multiple instances
  - [x] Handle connection failures per server
  - [x] Implement reconnection logic for individual servers
  - [x] Monitor health of all SquadJS connections
- [x] Implement error handling and reconnection logic using SquadJS
  - [x] Per-server error handling
  - [x] Automatic reconnection for failed instances
  - [x] Alert system for server connection issues
- [x] Add server authentication and security measures
  - [x] Secure credential management for 5 servers
  - [x] Access control per server

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

### Tutor System Commands ✅ COMPLETED
- [x] Implement `/ondutytutor` command
  - [x] Check for tutor role requirement
  - [x] Separate tutor duty status tracking
  - [x] Database logging with "tutor" duty type
  - [x] Notification system with tutor-specific colors
- [x] Implement `/offdutytutor` command
  - [x] Companion command to remove tutor duty status
  - [x] Same permission checks as ondutytutor
- [x] Implement `/addspecialty` command (Tutor Lead only)
  - [x] Subcommands for helicopter, armor, infantry, and expert specialties
  - [x] Role assignment for each specialty type
  - [x] Audit logging for specialty assignments
  - [x] Public announcements for specialty recognition
- [x] Implement `/removespecialty` command (Tutor Lead only)
  - [x] Individual specialty removal subcommands
  - [x] "Remove all" option for clearing all specialties
  - [x] Audit logging for specialty removals
  - [x] Public announcements for specialty changes
- [x] Implement `/removetutor` command (Tutor Lead only)
  - [x] Remove all tutor-related roles (tutor, on-duty, specialties)
  - [x] Protection against removing other tutor leads
  - [x] Reason tracking and audit logging
  - [x] Public announcements for tutor status changes
- [x] Update DutyStatusFactory for tutor support
  - [x] Add tutor-specific duty methods
  - [x] Support dutyType parameter throughout
  - [x] Differentiate admin vs tutor in logs and notifications

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
- Environment configuration system with dev/prod environment support
- Package.json with all dependencies (including express for HTTP server)
- ESLint configuration
- Command deployment scripts with environment-specific configuration
- Comprehensive README and documentation
- Gitignore configuration
- Discord bot framework (commands, handlers, permissions, logging)
- Core bot commands (/ping, /help, /onduty, /offduty, /linkid, /unlink, /ondutytutor, /offdutytutor, /addspecialty, /removespecialty, /removetutor)
- Error handling and permission system
- Winston logging setup
- Complete database schema with all models (Player, Admin, Server, AuditLog, DutyStatusChange, VerificationCode, PlayerDiscordLink, Whitelist, Group, UnlinkHistory)
- Database migrations and connection management
- Role-based on-duty admin system with Discord role integration
- Tutor duty system with separate role tracking and specialty management
- External role change detection and logging prevention for bot-initiated changes
- Duty status change logging and audit trails for both admin and tutor roles
- Voice channel monitoring for admin notifications
- SquadJS integration for 5 servers with connection management and event processing
- Discord account linking system with verification codes and chat monitoring
- HTTP whitelist server with configurable ports and JSON endpoints
- Basic Jest configuration (tests removed due to complexity issues)
- WhitelistService with caching and multi-server support
- Centralized environment detection and configuration loading utility
- Role-based whitelist system with proper environment-specific configuration handling
- Enhanced `/whitelist info` command with role-based and database entry display
- Resolved role detection issues and improved whitelist filtering logic
- Unified HTTP whitelist endpoint (`/combined`) with comprehensive group definitions and organized content sections
- **Whitelist Attribution Bug Fix**: Fixed issue where standalone Steam ID grants were incorrectly attributed to existing Discord users during bulk operations

### 🔄 In Progress
- BattleMetrics API integration

## Phase 3.6: Environment & Configuration Management ✅ COMPLETED

### Centralized Environment Detection ✅ COMPLETED
- [x] Create centralized environment utility (`src/utils/environment.js`)
  - [x] Automatic environment detection (`isDevelopment`, `isProduction`)
  - [x] Environment-specific configuration loading
  - [x] Pre-loaded common configurations (squadGroups, channels, discordRoles)
  - [x] Helper functions for config path resolution and loading
- [x] Update all files to use centralized environment utility
  - [x] `src/commands/whitelist.js` - Role detection and configuration loading
  - [x] `src/services/WhitelistService.js` - Squad groups configuration
  - [x] `src/services/RoleBasedWhitelistCache.js` - Squad groups configuration
  - [x] `src/handlers/roleChangeHandler.js` - Role tracking and configuration
  - [x] `src/services/NotificationService.js` - Development logging flags
- [x] Remove manual environment detection patterns throughout codebase
- [x] Update documentation (CLAUDE.md) with centralized approach
  - [x] Add usage examples and best practices
  - [x] Document available exports and functions
  - [x] Emphasize single source of truth approach

### Whitelist System Improvements ✅ COMPLETED
- [x] Fix role-based whitelist detection issues
  - [x] Resolve environment-specific config import problems
  - [x] Fix role detection not working due to config mismatches
- [x] Improve `/whitelist info` command logic
  - [x] Show role-based access when user has Discord roles
  - [x] Display database whitelist entries appropriately
  - [x] Handle both permanent and temporary whitelist entries
- [x] Fix database entry filtering for role-based vs database whitelists
  - [x] Exclude users with active Discord roles from database endpoints
  - [x] Allow users to have both role-based and database whitelist access
- [x] Resolve AuditLog field truncation issues
  - [x] Shorten action type names to fit database constraints
- [x] Clean up debug logging and improve user experience
- [x] Create unified HTTP whitelist endpoint (`/combined`)
  - [x] Combine all whitelist sources (role-based staff, role-based members, database whitelist)
  - [x] Include proper Squad group definitions at the top of the file
  - [x] Organize content with clear section headers and comments
  - [x] Maintain existing individual endpoints for debugging purposes
  - [x] Generate comprehensive whitelist suitable for Squad server consumption

## Phase 3.7: Whitelist Attribution Bug Fix ✅ COMPLETED

### Bug Resolution ✅ COMPLETED
- [x] **Investigate attribution issue** - Analyzed whitelist grant command logic and account linking system
- [x] **Identify root cause** - Found that standalone Steam ID grants were being linked to existing Discord accounts
- [x] **Implement protective measures** - Added explicit validation to prevent cross-contamination
  - [x] Enhanced `resolveUserInfo()` function with defensive comments and logic
  - [x] Added explicit check in database storage: `discord_username: discordUser ? userInfo.discord_username : null`
  - [x] Ensured role assignment only happens when Discord user is explicitly provided
- [x] **Test the fix** - Verified both scenarios work correctly:
  - [x] `/whitelist grant <steamid> <user>` - Creates whitelist WITH Discord attribution
  - [x] `/whitelist grant <steamid>` - Creates whitelist WITHOUT Discord attribution
- [x] **Update documentation** - Added comments explaining the security measures

### Technical Details
**Issue**: When someone mentioned Steam IDs in Discord (automatic 0.3 confidence links), subsequent `/whitelist grant <steamid>` commands without Discord user would incorrectly attribute whitelists to the linked Discord account.

**Solution**: Added explicit validation that only stores Discord attribution when a Discord user is explicitly provided in the command, regardless of existing automatic account links.

**Impact**: Prevents bulk donation scenarios where one person mentions multiple Steam IDs from causing incorrect whitelist attribution.

## Phase 3.5: Account Linking & Whitelist Integration ✅ COMPLETED

### Discord Account Linking System ✅ COMPLETED
- [x] Implement `/linkid` command for Discord-to-game account linking
  - [x] Generate secure verification codes with expiration
  - [x] Store verification codes in database with cleanup
  - [x] Handle code expiration with user notifications
- [x] Create SquadJS linking service for chat message processing
  - [x] Monitor in-game chat for verification codes
  - [x] Process valid codes and create account links
  - [x] Update Discord interactions with success/failure messages
  - [x] Send in-game RCON notifications to players
- [x] Implement PlayerDiscordLink model for account associations
  - [x] Store Discord user ID, Steam ID, EOS ID, and username
  - [x] Support account link updates (re-linking)
  - [x] Validate that at least one game ID is provided
- [x] Create VerificationCode model for temporary codes
  - [x] Generate unique alphanumeric codes
  - [x] Implement expiration and cleanup mechanisms
  - [x] Case-insensitive code matching
- [x] Integrate with whitelist system
  - [x] Update whitelist entries with Discord usernames
  - [x] Cross-reference Steam/EOS IDs with existing whitelist data

### Whitelist HTTP Integration ✅ COMPLETED  
- [x] Create HTTP server for external whitelist access
  - [x] Implement `/staff` and `/whitelist` endpoints
  - [x] Configure environment-based port selection (HTTP_PORT)
  - [x] Return JSON formatted whitelist data
- [x] Integrate with WhitelistService for data retrieval
  - [x] Cache whitelist data with configurable refresh intervals
  - [x] Support multiple whitelist types (staff, whitelist)
  - [x] Handle database connection errors gracefully
- [ ] Create comprehensive testing infrastructure
  - [ ] Unit tests for all database models
  - [ ] Unit tests for linking service functionality
  - [ ] Integration tests for complete workflow
  - [ ] Mock helpers for Discord.js and SquadJS components

### 📋 Next Steps
1. Complete BattleMetrics API integration
2. Build roster management commands with database backend
3. Implement player activity tracking
4. Rebuild testing infrastructure (if needed)
5. Set up database backup and pruning systems
6. Deploy to production with proper environment configuration

## Phase 3.8: Whitelist Security Hardening 🔒 IN PROGRESS

### Overview
Security audit identified 12 vulnerabilities in the unified whitelist system. These fixes are designed to be self-contained and testable independently.

### Phase 1: Database Integrity (Foundation) ✅ COMPLETED
- [x] **Fix 1.1**: Add unique constraint for role-based entries ✅ COMPLETED
  - **File**: Migration `025-add-role-whitelist-unique-constraint.js`
  - **Goal**: Prevent duplicate role entries at database level
  - **Change**: Add unique index using generated column `active_role_key` (MariaDB 10.3 compatible)
  - **Test**: Attempted manual DB duplicate insert - failed as expected ✅
  - **Risk**: Very low - constraint matches business logic
  - **Deployed**: Production on 2025-10-18

- [x] **Fix 1.2**: Add metadata size validation ✅ COMPLETED
  - **File**: Migration `026-add-metadata-size-constraint.js`
  - **Goal**: Prevent DoS via large JSON metadata
  - **Change**: Add CHECK constraint limiting metadata to 10KB using generated column
  - **Test**: Ready to test >10KB metadata insertion
  - **Risk**: Very low - defensive measure
  - **Status**: Tested on development, ready for production

### Phase 2: Audit Trail Enhancement (Visibility)
- [x] **Fix 2.1**: Add AuditLog entry for automatic upgrades ✅ COMPLETED
  - **File**: `src/services/RoleWhitelistSyncService.js` (after line 229)
  - **Goal**: Track security-blocked → approved transitions
  - **Change**: Add `AuditLog.create()` call documenting upgrades with before/after states
  - **Test**: Tested with `scripts/test-fix-2.1-security-upgrade-audit.js` - all assertions passed ✅
  - **Risk**: Very low - additive only, doesn't change behavior
  - **Status**: Implemented and tested on development on 2025-10-19

- [x] **Fix 2.2**: Add admin notification for security transitions ✅ COMPLETED
  - **File**: `src/services/RoleWhitelistSyncService.js` (after line 497), `config/channels.js` (added security_transition route)
  - **Goal**: Alert admins when blocked entries auto-activate
  - **Change**: Call `NotificationService.send('security_transition', ...)` for blocked→approved transitions
  - **Test**: Tested with `scripts/test-fix-2.2-security-notification.js` - notification service called successfully
  - **Risk**: Low - notification only, can be disabled via config
  - **Status**: Implemented and tested on development on 2025-10-19

### Phase 3: Role Validation on Upgrade (CRITICAL) - COMPLETED
- [x] **Fix 3.1**: Validate current role before upgrading blocked entries - COMPLETED
  - **File**: `src/services/RoleWhitelistSyncService.js` (lines 412-474, before upgrade logic)
  - **Goal**: Prevent auto-activation when user no longer has role
  - **Change**: Before upgrade, fetch Discord member and verify they still have required role
  - **Test Cases**:
    - User has role + high confidence → entry upgraded (documented)
    - User lost role + high confidence → entry NOT upgraded (PASS)
    - User never in guild + high confidence → entry NOT upgraded (PASS)
  - **Test**: Tested with `scripts/test-fix-3.1-role-validation.js` - all test cases passed
  - **Risk**: Medium - changes core upgrade logic, requires thorough testing
  - **Status**: Implemented and tested on development on 2025-10-20

### Phase 4: Race Condition Mitigation (CRITICAL) - COMPLETED
- [x] **Fix 4.1**: Replace Set-based deduplication with database transactions - COMPLETED
  - **File**: `src/services/RoleWhitelistSyncService.js` (syncUserRole, constructor, helper methods)
  - **Goal**: Prevent duplicate processing and race conditions
  - **Changes**:
    - Removed `processingUsers` Set from constructor
    - Added `Sequelize` import for Transaction constants
    - Wrapped all database operations in transactions with READ_COMMITTED isolation
    - Added row-level locking with `SELECT FOR UPDATE`
    - Implemented deadlock detection and retry logic with exponential backoff (3 retries, 100ms * 2^retryCount)
    - Updated all helper methods to accept and use transaction parameter
  - **Test Cases**:
    - 5 concurrent role grants → only 1 entry created (PASS)
    - Mixed concurrent operations (add/remove) → no duplicate approved entries (PASS)
    - Retry logic verified (implemented with ER_LOCK_DEADLOCK detection)
  - **Test**: Tested with `scripts/test-fix-4.1-race-condition.js` - all test cases passed
  - **Risk**: Medium-High - changes synchronization mechanism
  - **Status**: Implemented and tested on development on 2025-10-21

### Phase 5: Cache Atomicity (Correctness) - COMPLETED
- [x] **Fix 5.1**: Atomic cache invalidation with database commits - COMPLETED
  - **File**: `src/services/RoleWhitelistSyncService.js` (added cache invalidation at all modification points)
  - **Goal**: Prevent stale cache during updates
  - **Changes**:
    - Added cache invalidation after creating new entries (line 337)
    - Added cache invalidation after updating existing entries (line 314)
    - Added cache invalidation after revoking entries (line 387)
    - Added cache invalidation after upgrading entries (line 557)
    - Added cache invalidation after creating placeholder entries (line 721)
    - Added cache invalidation after creating security-blocked entries (line 978)
    - All invalidation calls happen within transactions before commit
  - **Test Cases**:
    - Cache invalidated after create operation (PASS)
    - Cache invalidated after update operation (PASS)
    - Cache invalidated after revoke operation (PASS)
    - Cache invalidated after upgrade operation (PASS)
    - Cache invalidated for unlinked staff placeholder (PASS)
    - Cache invalidated during concurrent operations (PASS)
  - **Test**: Tested with `scripts/test-fix-5.1-cache-consistency-simple.js` - all test cases passed
  - **Risk**: Low - improves consistency
  - **Status**: Implemented and tested on development on 2025-10-21

- [ ] **Fix 5.2**: Add cache version tags
  - **File**: `src/services/WhitelistService.js`
  - **Goal**: Detect and reject stale cache
  - **Change**: Add version number to cache, increment on changes, reject mismatches
  - **Test**: Concurrent read during write returns complete data, never mixed
  - **Risk**: Low - defensive measure

### Phase 6: Force Revoke Capability (Admin Tool)
- [ ] **Fix 6.1**: Add force revoke command
  - **File**: New command `src/commands/forcerevokewhitelist.js`
  - **Goal**: Allow emergency override of role-based entries
  - **Command**: `/forcerevoke <user> <reason>` (Super Admin only)
  - **Change**: New command that revokes ALL entries including role-based, with confirmation
  - **Test**: User with role entry, force revoke, verify whitelist removed despite role
  - **Risk**: Low - new isolated command

### Phase 7: Steam ID Conflict Detection (Data Integrity) - COMPLETED
- [x] **Fix 7.1**: Conflict detection in grant-steamid - COMPLETED
  - **File**: `src/commands/whitelist.js` (handleGrantSteamId, line 318)
  - **Goal**: Prevent conflicting entries for same Steam ID
  - **Changes**:
    - Added Steam ID conflict check at start of handleGrantSteamId
    - Created conflict warning embed with existing link details
    - Requires explicit confirmation before proceeding with conflicting grant
    - Refactored Steam ID grant flow into separate showSteamIdGrantWarning function
    - Added proper interaction state handling for conflict resolution flow
  - **Test Cases**:
    - Steam ID not linked → grant proceeds without conflict warning (PASS)
    - Steam ID linked to same user → conflict detected (acceptable behavior) (PASS)
    - Steam ID linked to different user → conflict warning shown with details (PASS)
    - Conflict detection query performance → 2ms average (PASS)
  - **Test**: Tested with `scripts/test-fix-7.1-conflict-detection.js` - all test cases passed
  - **Risk**: Low - adds safety check
  - **Status**: Implemented and tested on development on 2025-10-21

### Phase 8: Confidence Score Audit Trail (Monitoring)
- [ ] **Fix 8.1**: Log all confidence score changes
  - **File**: `src/database/models/PlayerDiscordLink.js` (createOrUpdateLink, line 114)
  - **Goal**: Track confidence changes for security review
  - **Change**: After line 132, check if confidence changed, create AuditLog entry with old/new values
  - **Test**: Update link with different confidence, verify AuditLog entry created
  - **Risk**: Very low - logging only

### Phase 9: Rate Limiting (DoS Prevention)
- [ ] **Fix 9.1**: Add rate limit to bulk sync
  - **File**: `src/commands/whitelist.js` (handleSync, line 1490)
  - **Goal**: Prevent spam of sync operations
  - **Change**: Track last sync per guild, require 5-minute cooldown (bypassed by Super Admin)
  - **Test**: Run sync twice quickly, verify second is rate-limited
  - **Risk**: Very low - simple throttle

### Testing Infrastructure
- [ ] Create unit tests: `tests/whitelist-security.test.js`
  - [ ] Test duplicate entry prevention (Fix 1.1)
  - [ ] Test upgrade with missing role (Fix 3.1)
  - [ ] Test concurrent role changes (Fix 4.1)
  - [ ] Test cache staleness (Fix 5.1, 5.2)
  - [ ] Test force revoke (Fix 6.1)
  - [ ] Test Steam ID conflicts (Fix 7.1)
  - [ ] Test confidence audit trail (Fix 8.1)

- [ ] Create integration tests: `tests/whitelist-integration.test.js`
  - [ ] Full workflow: role grant → link → upgrade → revoke
  - [ ] Race condition simulation
  - [ ] Cache consistency under load
  - [ ] Bulk sync with edge cases

### Implementation Progress
**Status**: Phase 7 Complete, Phase 8 Ready
**Current Phase**: Phase 8 - Confidence Score Audit Trail (Monitoring)
**Completed Phases**:
  - Phase 1 - Database Integrity (Fixes 1.1, 1.2) ✅
  - Phase 2 - Audit Trail Enhancement (Fixes 2.1, 2.2) ✅
  - Phase 3 - Role Validation on Upgrade (Fix 3.1) ✅
  - Phase 4 - Race Condition Mitigation (Fix 4.1) ✅
  - Phase 5 - Cache Atomicity (Fix 5.1) ✅
  - Phase 7 - Steam ID Conflict Detection (Fix 7.1) ✅ (Phase 6 skipped per user request)
**Next Action**: Implement Fix 8.1 - Log all confidence score changes, or proceed to Fix 9.1