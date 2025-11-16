# Member & Staff Scrubbing System - Implementation Plan

**Created:** 2025-11-15
**Status:** In Progress
**Complexity:** High (~19 hours estimated)

## Overview

Semi-automated system to remove unlinked Discord members, demote unlinked staff, and clean up BattleMetrics "=B&B= Member" flags with admin approval workflow.

### Requirements Summary

- **Members**: Immediate removal of Member role for all unlinked accounts
- **Staff**: Remove all staff roles and archive them for potential restoration
- **BattleMetrics**: Remove "=B&B= Member" flag from all unlinked/removed users
- **Automation**: Semi-automated with admin approval (preview → approve → execute)
- **Audit Trail**: Complete logging of all operations

---

## Phase 1: Database & Model Extensions

### ✅ Task 1.1: Create StaffRoleArchive Model

**File:** `src/database/models/StaffRoleArchive.js`
**Status:** COMPLETED
**Dependencies:** None

**Purpose:** Permanent record of staff roles before removal for potential restoration.

**Schema Fields:**
- `id` - Auto-increment primary key
- `discord_user_id` - Discord user ID (STRING 50)
- `discord_username` - Username at removal (STRING 255)
- `discord_display_name` - Display name at removal (STRING 255)
- `removed_roles` - JSON array of {id, name, priority, group}
- `highest_role_name` - Quick reference (STRING 100)
- `highest_role_group` - HeadAdmin/SquadAdmin/Moderator (STRING 50)
- `removal_reason` - Why removed (TEXT)
- `removal_type` - scrub_unlinked/manual/disciplinary (STRING 50)
- `removed_by_user_id` - Admin who approved (STRING 50)
- `removed_by_username` - Admin username (STRING 255)
- `scrub_approval_id` - Approval ID from preview (STRING 100)
- `prior_link_status` - no_link/low_confidence/insufficient_confidence (STRING 50)
- `prior_confidence_score` - DECIMAL(3, 2)
- `prior_steam_id` - STRING(50)
- `restore_eligible` - BOOLEAN (default true)
- `restore_expiry` - DATE (null = no expiry)
- `restored` - BOOLEAN (default false)
- `restored_at` - DATE
- `restored_by_user_id` - STRING(50)
- `metadata` - JSON
- `notes` - TEXT
- `created_at` - DATE
- `updated_at` - DATE

**Indexes:**
- `idx_staff_archive_discord_user_id`
- `idx_staff_archive_removed_by`
- `idx_staff_archive_removal_type`
- `idx_staff_archive_prior_link_status`
- `idx_staff_archive_restore_eligible`
- `idx_staff_archive_restored`
- `idx_staff_archive_created_at`
- `idx_staff_archive_approval_id`
- `idx_staff_archive_restore_lookup` (composite: discord_user_id, restore_eligible, restored)
- `idx_staff_archive_scrub_date` (composite: removal_type, created_at)

**Static Methods:**
- `createArchive(archiveData)` - Create new archive entry
- `findByDiscordId(discordUserId)` - All archives for user
- `findLatestByDiscordId(discordUserId)` - Most recent archive
- `findEligibleForRestore(discordUserId)` - Active restoration candidates
- `findByApprovalId(approvalId)` - All archives from specific scrub
- `findByRemovalType(removalType, limit)` - Filter by removal type
- `findRecentRemovals(hours, limit)` - Recent removals
- `markAsRestored(archiveId, restoredBy)` - Update restoration status
- `getStatistics(hours)` - Stats on removals/restorations

**Instance Methods:**
- `isEligibleForRestore()` - Check eligibility
- `getHighestRole()` - Get highest priority role
- `getRoleNames()` - Get array of role names
- `getFormattedRemovalDate()` - Formatted date string

---

### ✅ Task 1.2: Create Database Migration for StaffRoleArchive

**File:** `migrations/029-create-staff-role-archive-table.js`
**Status:** COMPLETED
**Dependencies:** Task 1.1 (model created)

**Actions:**
1. Create `staff_role_archives` table with all fields from model
2. Add all indexes defined in model
3. Set charset to `utf8mb4` with `utf8mb4_unicode_ci` collation
4. Add table comment
5. Test with `npm run db:migrate:dev`

**Migration Template:**
```javascript
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('staff_role_archives', {
      // All fields from model
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Archive of staff roles removed during scrubbing operations'
    });

    // Add all indexes
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('staff_role_archives');
  }
};
```

---

### ✅ Task 1.3: Update Models Index

**File:** `src/database/models/index.js`
**Status:** COMPLETED
**Dependencies:** Task 1.1

**Changes:**
- ✅ Import StaffRoleArchiveFactory
- ✅ Initialize StaffRoleArchive with sequelize
- ✅ Export in module.exports

---

### ✅ Task 1.4: Document New AuditLog Action Types

**File:** `src/database/models/AuditLog.js` (documentation block added)
**Status:** COMPLETED
**Dependencies:** None

**New Action Types Documented:**
- `MEMBER_SCRUB` - Member role removed for unlinked account
- `STAFF_SCRUB` - Staff roles removed for unlinked account
- `BATTLEMETRICS_FLAG_REMOVED` - BM "=B&B= Member" flag removed
- `SCRUB_PREVIEW` - Admin previewed scrub candidates
- `SCRUB_EXECUTED` - Admin executed scrub operation
- `STAFF_ARCHIVE_CREATED` - Staff role archive entry created
- `STAFF_ROLES_RESTORED` - Staff roles restored from archive

**Note:** AuditLog model already supports arbitrary action types (STRING field), no schema changes needed.

---

## Phase 2: BattleMetrics Write Integration

### Task 2.1: Extend BattleMetricsService with Write Methods

**File:** `src/services/BattleMetricsService.js`
**Status:** PENDING
**Dependencies:** None

**Current Capabilities:**
- ✅ Read whitelists from API
- ✅ Search players by Steam ID
- ✅ Rate limiting (220ms delay, ~4.5 req/sec)
- ✅ Pagination support
- ❌ No write operations yet

**New Methods to Add:**

```javascript
/**
 * Add a custom flag/note to a BattleMetrics player profile
 * @param {string} playerId - BattleMetrics player ID
 * @param {string} flagName - Flag/note to add (e.g., "=B&B= Member")
 * @returns {Promise<Object>} API response
 */
async addPlayerFlag(playerId, flagName) {
  // POST request to BattleMetrics API
  // Endpoint: /players/{playerId}/relationships/flags
  // Body: { data: { type: 'playerFlag', attributes: { name: flagName } } }
}

/**
 * Remove a specific flag from a BattleMetrics player profile
 * @param {string} playerId - BattleMetrics player ID
 * @param {string} flagName - Flag to remove
 * @returns {Promise<Object>} API response
 */
async removePlayerFlag(playerId, flagName) {
  // First: GET flags to find flag ID
  // Then: DELETE /players/{playerId}/relationships/flags/{flagId}
}

/**
 * Update player notes on BattleMetrics
 * @param {string} playerId - BattleMetrics player ID
 * @param {string} note - Note text
 * @returns {Promise<Object>} API response
 */
async updatePlayerNote(playerId, note) {
  // PATCH request to update player notes
  // Endpoint: /players/{playerId}
  // Body: { data: { type: 'player', attributes: { notes: note } } }
}

/**
 * Search for players with a specific flag
 * @param {string} flagName - Flag name to search for
 * @returns {Promise<Array>} Array of player objects with the flag
 */
async searchPlayersByFlag(flagName) {
  // GET request with filter
  // Endpoint: /players?filter[flags]={flagName}
  // Include pagination handling
}

/**
 * Get all flags for a specific player
 * @param {string} playerId - BattleMetrics player ID
 * @returns {Promise<Array>} Array of flag objects
 */
async getPlayerFlags(playerId) {
  // GET request
  // Endpoint: /players/{playerId}/relationships/flags
}
```

**Implementation Notes:**
- Maintain existing rate limiting (220ms delay)
- Use existing axios instance with auth headers
- Add error handling for 404 (player not found), 403 (permissions), 429 (rate limit)
- Return structured responses: `{ success: boolean, data: any, error: string }`

**API Documentation Reference:**
- BattleMetrics API: https://www.battlemetrics.com/developers
- Auth: Bearer token in `BATTLEMETRICS_TOKEN` env var

---

### Task 2.2: Create BattleMetricsScrubService

**File:** `src/services/BattleMetricsScrubService.js`
**Status:** PENDING
**Dependencies:** Task 2.1

**Purpose:** Specialized service for managing BattleMetrics flags during scrubbing operations.

**Class Structure:**

```javascript
const BattleMetricsService = require('./BattleMetricsService');
const { PlayerDiscordLink } = require('../database/models');
const { console: loggerConsole, createServiceLogger } = require('../utils/logger');

class BattleMetricsScrubService {
  constructor() {
    this.bmService = new BattleMetricsService();
    this.logger = createServiceLogger('BattleMetricsScrubService');
    this.FLAG_NAME = '=B&B= Member';
  }

  /**
   * Find all BM profiles with "=B&B= Member" flag
   * @returns {Promise<Array>} Players with flag
   */
  async findPlayersWithMemberFlag() {
    // Use BattleMetricsService.searchPlayersByFlag()
    // Return array of { bmPlayerId, steamId, name, hasFlag: true }
  }

  /**
   * Identify unlinked players with member flag
   * @returns {Promise<Object>} { toRemove: [], linked: [], stats: {} }
   */
  async identifyUnlinkedWithFlag() {
    // 1. Get all players with "=B&B= Member" flag from BM
    // 2. Cross-reference with PlayerDiscordLink table
    // 3. Check if Discord user still has Member role (via Discord API)
    // 4. Return categorized lists:
    //    - toRemove: BM has flag but no link or no role
    //    - linked: BM has flag and valid link with role (keep flag)
  }

  /**
   * Generate removal preview report
   * @param {Array} players - Players to process
   * @returns {Object} Report with counts and sample data
   */
  async generateFlagRemovalReport(players) {
    // Create detailed report:
    // - Total players with flag
    // - Players with valid links (keep flag)
    // - Players without links (remove flag)
    // - Players who left Discord (remove flag)
    // - Sample list (first 10)
  }

  /**
   * Remove "=B&B= Member" flag from multiple players
   * @param {Array} bmPlayerIds - BM player IDs
   * @param {Object} options - { approvalId, executedBy }
   * @returns {Promise<Object>} { successful: [], failed: [], stats: {} }
   */
  async removeMemberFlagBulk(bmPlayerIds, options = {}) {
    // 1. Iterate through player IDs with rate limiting
    // 2. Call BattleMetricsService.removePlayerFlag()
    // 3. Log each success/failure to AuditLog
    // 4. Track progress and errors
    // 5. Return detailed results
  }

  /**
   * Add "=B&B= Member" flag to player
   * @param {string} bmPlayerId - BM player ID
   * @param {Object} metadata - Context info
   * @returns {Promise<Object>} Result
   */
  async addMemberFlag(bmPlayerId, metadata = {}) {
    // Call BattleMetricsService.addPlayerFlag()
    // Log to AuditLog
  }
}

module.exports = BattleMetricsScrubService;
```

**Key Features:**
- Rate-limited bulk operations
- Cross-referencing with PlayerDiscordLink
- Discord role verification
- Comprehensive audit logging
- Error recovery and retry logic
- Progress tracking for large batches

---

## Phase 3: Core Scrubbing Services

### Task 3.1: Create MemberScrubService

**File:** `src/services/MemberScrubService.js`
**Status:** PENDING
**Dependencies:** None (uses existing models)

**Purpose:** Handle removal of Member role from unlinked Discord users.

**Class Structure:**

```javascript
const { PlayerDiscordLink, AuditLog } = require('../database/models');
const { getAllMemberRoles } = require('../../config/discordRoles');
const { createServiceLogger } = require('../utils/logger');

class MemberScrubService {
  constructor(discordClient) {
    this.client = discordClient;
    this.logger = createServiceLogger('MemberScrubService');
  }

  /**
   * Identify all Discord members without Steam account links
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Array>} Array of {userId, username, roles, hasLink}
   */
  async identifyUnlinkedMembers(guildId) {
    // 1. Get all members with Member role from Discord
    // 2. For each member, check PlayerDiscordLink table
    // 3. Return members with Member role but no link
  }

  /**
   * Generate member scrub preview report
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>} Report with counts and data
   */
  async generateMemberScrubReport(guildId) {
    // Create report:
    // - Total members
    // - Members with links
    // - Members without links (candidates for scrub)
    // - Sample list (first 20)
  }

  /**
   * Remove Member role from unlinked users
   * @param {Array} userIds - Discord user IDs to scrub
   * @param {Object} options - { approvalId, executedBy, guildId }
   * @returns {Promise<Object>} { successful: [], failed: [], stats: {} }
   */
  async executeMemberScrub(userIds, options = {}) {
    // 1. Verify each user still lacks link
    // 2. Remove Member role (and other member-tier roles)
    // 3. Log each removal to AuditLog with MEMBER_SCRUB
    // 4. Track successes and failures
    // 5. Return detailed results
  }

  /**
   * Send notification DM to removed member
   * @param {string} userId - Discord user ID
   * @param {Object} info - Removal context
   * @returns {Promise<boolean>} Success status
   */
  async notifyRemovedMember(userId, info) {
    // Send DM with:
    // - Reason for removal
    // - How to link account
    // - How to rejoin after linking
  }
}

module.exports = MemberScrubService;
```

**Key Operations:**
1. Fetch Discord guild members with Member role
2. Cross-reference with `player_discord_links` table
3. Filter out users who have ANY link (any confidence)
4. Remove Discord roles (Member, Donator, First Responder, Service Member)
5. Log each action with `MEMBER_SCRUB` action type
6. Optional: Send DM notifications

---

### Task 3.2: Create StaffScrubService

**File:** `src/services/StaffScrubService.js`
**Status:** PENDING
**Dependencies:** Task 1.1 (StaffRoleArchive model)

**Purpose:** Handle removal of staff roles with archiving for potential restoration.

**Class Structure:**

```javascript
const { PlayerDiscordLink, StaffRoleArchive, AuditLog } = require('../database/models');
const { getAllStaffRoles, getHighestPriorityGroup } = require('../../config/discordRoles');
const { createServiceLogger } = require('../utils/logger');

class StaffScrubService {
  constructor(discordClient) {
    this.client = discordClient;
    this.logger = createServiceLogger('StaffScrubService');
    this.REQUIRED_CONFIDENCE = 1.0;
  }

  /**
   * Identify staff members without sufficient confidence links
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Array>} Staff members to scrub
   */
  async identifyUnlinkedStaff(guildId) {
    // 1. Get all members with staff roles
    // 2. For each, check PlayerDiscordLink for confidence >= 1.0
    // 3. Return staff with no link or confidence < 1.0
    // 4. Include current roles, highest role, confidence score
  }

  /**
   * Generate staff scrub preview report
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>} Detailed report
   */
  async generateStaffScrubReport(guildId) {
    // Report includes:
    // - Total staff count
    // - Staff with valid links
    // - Staff without links (breakdown by role)
    // - Staff with low confidence links
    // - Full list with current roles
  }

  /**
   * Archive staff roles before removal
   * @param {string} userId - Discord user ID
   * @param {Array} roles - Roles to archive
   * @param {Object} context - Removal context
   * @returns {Promise<Object>} Archive entry
   */
  async archiveStaffRoles(userId, roles, context) {
    // 1. Get user info from Discord
    // 2. Get link status from PlayerDiscordLink
    // 3. Determine highest role and group
    // 4. Create StaffRoleArchive entry
    // 5. Log to AuditLog with STAFF_ARCHIVE_CREATED
  }

  /**
   * Execute staff role removal with archiving
   * @param {Array} userIds - Discord user IDs
   * @param {Object} options - { approvalId, executedBy, guildId }
   * @returns {Promise<Object>} Results
   */
  async executeStaffScrub(userIds, options = {}) {
    // For each user:
    // 1. Verify still lacks sufficient confidence
    // 2. Archive current staff roles
    // 3. Remove all staff roles from Discord
    // 4. Log with STAFF_SCRUB action type
    // 5. Track success/failure
  }

  /**
   * Restore staff roles from archive
   * @param {string} userId - Discord user ID
   * @param {number} archiveId - Archive entry ID
   * @param {Object} restoredBy - Admin info
   * @returns {Promise<Object>} Restoration result
   */
  async restoreStaffRoles(userId, archiveId, restoredBy) {
    // 1. Get archive entry and verify eligibility
    // 2. Verify user now has confidence >= 1.0
    // 3. Re-add archived roles to Discord
    // 4. Mark archive as restored
    // 5. Log with STAFF_ROLES_RESTORED
  }

  /**
   * Send notification to removed staff member
   * @param {string} userId - Discord user ID
   * @param {Object} archiveInfo - Archive details
   * @returns {Promise<boolean>} Success
   */
  async notifyRemovedStaff(userId, archiveInfo) {
    // Send DM with:
    // - Roles that were removed
    // - Reason (insufficient link confidence)
    // - How to achieve 1.0 confidence
    // - Restoration eligibility info
  }
}

module.exports = StaffScrubService;
```

**Key Features:**
- Confidence threshold validation (1.0 required for staff)
- Role archiving before removal
- Restoration workflow support
- Detailed audit trail
- DM notifications with restoration info

---

### Task 3.3: Create UnifiedScrubOrchestrator

**File:** `src/services/UnifiedScrubOrchestrator.js`
**Status:** PENDING
**Dependencies:** Tasks 2.2, 3.1, 3.2

**Purpose:** Coordinate all scrubbing operations (members, staff, BattleMetrics) in a unified workflow.

**Class Structure:**

```javascript
const MemberScrubService = require('./MemberScrubService');
const StaffScrubService = require('./StaffScrubService');
const BattleMetricsScrubService = require('./BattleMetricsScrubService');
const { AuditLog } = require('../database/models');
const { createServiceLogger } = require('../utils/logger');
const crypto = require('crypto');

class UnifiedScrubOrchestrator {
  constructor(discordClient) {
    this.client = discordClient;
    this.memberScrub = new MemberScrubService(discordClient);
    this.staffScrub = new StaffScrubService(discordClient);
    this.bmScrub = new BattleMetricsScrubService();
    this.logger = createServiceLogger('UnifiedScrubOrchestrator');
    this.pendingApprovals = new Map(); // approvalId => preview data
  }

  /**
   * Generate comprehensive scrub preview
   * @param {string} guildId - Discord guild ID
   * @param {Object} requestedBy - Admin who requested
   * @returns {Promise<Object>} Unified preview report with approval ID
   */
  async generatePreview(guildId, requestedBy) {
    // 1. Run all three preview reports in parallel:
    //    - memberScrub.generateMemberScrubReport()
    //    - staffScrub.generateStaffScrubReport()
    //    - bmScrub.identifyUnlinkedWithFlag()
    // 2. Generate unique approval ID
    // 3. Store preview data in memory (24hr expiry)
    // 4. Log SCRUB_PREVIEW to AuditLog
    // 5. Return unified report
  }

  /**
   * Execute approved scrub operation
   * @param {string} approvalId - Approval ID from preview
   * @param {Object} executedBy - Admin executing
   * @returns {Promise<Object>} Execution results
   */
  async executeScrub(approvalId, executedBy) {
    // 1. Validate approval ID and check expiry
    // 2. Get preview data
    // 3. Execute in order (transaction-safe where possible):
    //    a. Archive staff roles
    //    b. Remove staff Discord roles
    //    c. Remove member Discord roles
    //    d. Remove BattleMetrics flags (with rate limiting)
    // 4. Log SCRUB_EXECUTED to AuditLog
    // 5. Track all successes/failures
    // 6. Send completion notification
    // 7. Clear approval from memory
  }

  /**
   * Get preview by approval ID
   * @param {string} approvalId - Approval ID
   * @returns {Object|null} Preview data or null
   */
  getPreview(approvalId) {
    return this.pendingApprovals.get(approvalId);
  }

  /**
   * Clean up expired previews (24hr old)
   */
  cleanupExpiredPreviews() {
    const now = Date.now();
    const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

    for (const [id, data] of this.pendingApprovals.entries()) {
      if (now - data.createdAt > EXPIRY_MS) {
        this.pendingApprovals.delete(id);
      }
    }
  }

  /**
   * Send execution summary to admin channel
   * @param {Object} results - Execution results
   * @param {string} guildId - Guild ID
   */
  async sendCompletionNotification(results, guildId) {
    // Send embed to admin channel with:
    // - Total counts (members/staff/BM removed)
    // - Success/failure breakdown
    // - Any errors encountered
  }
}

module.exports = UnifiedScrubOrchestrator;
```

**Workflow:**
1. **Preview Phase**: Generate approval ID, collect all data, store in memory
2. **Approval Phase**: Admin reviews preview, decides to execute
3. **Execution Phase**: Validate approval, execute all operations sequentially
4. **Notification Phase**: Send results to admin channel, optional user DMs

**Safety Features:**
- 24-hour approval expiry
- Pre-execution validation
- Transaction safety where possible
- Rollback on critical errors
- Detailed error logging
- Maximum batch size limits

---

## Phase 4: Discord Commands

### Task 4.1: Create /scrub Command (with subcommands)

**File:** `src/commands/scrub.js`
**Status:** PENDING
**Dependencies:** Task 3.3

**Command Structure:**

```javascript
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { EmbedBuilder } = require('discord.js');
const UnifiedScrubOrchestrator = require('../services/UnifiedScrubOrchestrator');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scrub')
    .setDescription('Manage member and staff scrubbing operations')
    .addSubcommand(subcommand =>
      subcommand
        .setName('preview')
        .setDescription('Preview what will be scrubbed (no changes made)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('execute')
        .setDescription('Execute an approved scrub operation')
        .addStringOption(option =>
          option
            .setName('approval_id')
            .setDescription('Approval ID from preview command')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('history')
        .setDescription('View recent scrubbing operations')
        .addIntegerOption(option =>
          option
            .setName('hours')
            .setDescription('Hours to look back (default: 24)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'preview') {
      await handlePreview(interaction);
    } else if (subcommand === 'execute') {
      await handleExecute(interaction);
    } else if (subcommand === 'history') {
      await handleHistory(interaction);
    }
  }
};

async function handlePreview(interaction) {
  // 1. Defer reply (this will take time)
  // 2. Create UnifiedScrubOrchestrator
  // 3. Generate preview
  // 4. Format embed with:
  //    - Member count to remove
  //    - Staff count to remove (with roles listed)
  //    - BattleMetrics profiles to update
  //    - Approval ID
  //    - Expiry time (24hr)
  // 5. Send embed
}

async function handleExecute(interaction) {
  // 1. Get approval ID
  // 2. Show confirmation modal/button
  // 3. On confirmation:
  //    a. Defer reply
  //    b. Execute scrub
  //    c. Format results embed
  //    d. Send results
}

async function handleHistory(interaction) {
  // 1. Query AuditLog for SCRUB_EXECUTED actions
  // 2. Format embed with recent scrubs
  // 3. Include counts and timestamps
}
```

**Permissions:**
- `/scrub preview` - Senior Admin or higher
- `/scrub execute` - Head Admin or higher
- `/scrub history` - Senior Admin or higher

---

### Task 4.2: Create /staffarchive Command

**File:** `src/commands/staffarchive.js`
**Status:** PENDING
**Dependencies:** Task 1.1

**Command Structure:**

```javascript
const { SlashCommandBuilder } = require('discord.js');
const { EmbedBuilder } = require('discord.js');
const { StaffRoleArchive } = require('../database/models');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staffarchive')
    .setDescription('View archived staff roles')
    .addSubcommand(subcommand =>
      subcommand
        .setName('lookup')
        .setDescription('Look up archived roles for a user')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to look up')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('restore')
        .setDescription('Restore archived staff roles')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to restore roles for')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('archive_id')
            .setDescription('Specific archive entry to restore')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'lookup') {
      await handleLookup(interaction);
    } else if (subcommand === 'restore') {
      await handleRestore(interaction);
    }
  }
};

async function handleLookup(interaction) {
  // 1. Get user
  // 2. Query StaffRoleArchive.findByDiscordId()
  // 3. Format embed showing:
  //    - All archive entries (most recent first)
  //    - Removed roles
  //    - Removal date and reason
  //    - Restoration eligibility
  // 4. Send embed
}

async function handleRestore(interaction) {
  // 1. Get user and optional archive ID
  // 2. Verify user now has confidence >= 1.0
  // 3. Get eligible archives
  // 4. Restore roles via StaffScrubService.restoreStaffRoles()
  // 5. Send confirmation
}
```

**Permissions:**
- `/staffarchive lookup` - Senior Admin or higher
- `/staffarchive restore` - Head Admin or higher

---

## Phase 5: Configuration & Permissions

### Task 5.1: Add Command Permissions to config/roles.js

**File:** `config/roles.js`
**Status:** PENDING
**Dependencies:** Tasks 4.1, 4.2

**Additions:**

```javascript
// In COMMAND_PERMISSIONS object:
'scrub': [
  DISCORD_ROLES.EXECUTIVE_ADMIN,
  DISCORD_ROLES.HEAD_ADMIN,
  DISCORD_ROLES.SENIOR_ADMIN // Preview and history only
],
'staffarchive': [
  DISCORD_ROLES.EXECUTIVE_ADMIN,
  DISCORD_ROLES.HEAD_ADMIN,
  DISCORD_ROLES.SENIOR_ADMIN
],
```

**Note:** Execute subcommand will have additional inline check for Head Admin+

---

### Task 5.2: Add Command Permissions to config/roles.development.js

**File:** `config/roles.development.js`
**Status:** PENDING
**Dependencies:** Tasks 4.1, 4.2

**Same additions as production config but with development role IDs**

---

## Phase 6: Testing & Validation

### Task 6.1: Unit Testing Strategy

**Status:** PENDING
**Dependencies:** All services and commands

**Test Areas:**
1. **StaffRoleArchive Model**
   - Create archive entries
   - Query methods
   - Restoration eligibility logic
   - Statistics generation

2. **BattleMetricsScrubService**
   - Mock BM API responses
   - Flag removal logic
   - Error handling
   - Rate limiting

3. **MemberScrubService**
   - Unlinked member identification
   - Role removal
   - Notification logic

4. **StaffScrubService**
   - Unlinked staff identification
   - Archiving logic
   - Restoration workflow

5. **UnifiedScrubOrchestrator**
   - Preview generation
   - Approval ID management
   - Execution workflow
   - Error recovery

---

### Task 6.2: Integration Testing in Development

**File:** Test script or manual testing
**Status:** PENDING
**Dependencies:** All implementation tasks

**Test Scenarios:**

1. **Preview Generation**
   - Run `/scrub preview`
   - Verify counts are accurate
   - Verify approval ID generation
   - Check expiry timestamp

2. **Member Scrubbing**
   - Create test Discord user without link
   - Give them Member role
   - Run preview, verify they appear
   - Execute scrub
   - Verify role removed
   - Check audit log

3. **Staff Scrubbing**
   - Create test Discord user with low confidence link
   - Give them staff role
   - Run preview, verify they appear
   - Execute scrub
   - Verify roles removed
   - Verify archive created
   - Check restoration eligibility

4. **BattleMetrics Integration**
   - Mock BM API or use test server
   - Create player with "=B&B= Member" flag
   - Ensure no Discord link
   - Run preview
   - Execute scrub
   - Verify flag removed

5. **Error Handling**
   - Test with invalid approval ID
   - Test with expired approval
   - Test with API errors
   - Verify rollback behavior

6. **Staff Restoration**
   - Use archived staff member from test 3
   - Upgrade link confidence to 1.0
   - Run `/staffarchive restore`
   - Verify roles restored
   - Check archive marked as restored

---

## Phase 7: Documentation Updates

### Task 7.1: Update CLAUDE.md

**File:** `CLAUDE.md`
**Status:** PENDING
**Dependencies:** All implementation tasks

**Sections to Add/Update:**

1. **Commands Section**: Add `/scrub` and `/staffarchive` documentation
2. **Services Section**: Document new scrubbing services
3. **Database Models**: Add StaffRoleArchive description
4. **BattleMetrics Integration**: Note write capabilities added
5. **Workflow Diagrams**: Add scrubbing workflow explanation

---

### Task 7.2: Update TASKS.md

**File:** `TASKS.md`
**Status:** PENDING
**Dependencies:** All implementation tasks

**Add New Phase:** Phase X - Member & Staff Scrubbing System
- List all implemented features
- Mark completion status
- Note any limitations or future improvements

---

### Task 7.3: Update /whatsnew Command

**File:** `src/commands/whatsnew.js`
**Status:** PENDING
**Dependencies:** All implementation tasks

**Add Entry:**
- Member & Staff Scrubbing System
- Semi-automated workflow with approval
- Staff role archiving and restoration
- BattleMetrics flag management

---

## Implementation Checklist

### Phase 1: Database ✅✅ 4/4 COMPLETE
- [x] Create StaffRoleArchive model
- [x] Update models/index.js
- [x] Create migration for StaffRoleArchive (migration #029 executed successfully)
- [x] Document AuditLog action types (comprehensive documentation added)

### Phase 2: BattleMetrics 0/2 Complete
- [ ] Extend BattleMetricsService with write methods
- [ ] Create BattleMetricsScrubService

### Phase 3: Core Services 0/3 Complete
- [ ] Create MemberScrubService
- [ ] Create StaffScrubService
- [ ] Create UnifiedScrubOrchestrator

### Phase 4: Commands 0/2 Complete
- [ ] Create /scrub command (preview, execute, history)
- [ ] Create /staffarchive command (lookup, restore)

### Phase 5: Configuration 0/2 Complete
- [ ] Add permissions to config/roles.js
- [ ] Add permissions to config/roles.development.js

### Phase 6: Testing 0/2 Complete
- [ ] Unit tests for core functionality
- [ ] Integration testing in development

### Phase 7: Documentation 0/3 Complete
- [ ] Update CLAUDE.md
- [ ] Update TASKS.md
- [ ] Update /whatsnew command

---

## Risk Assessment & Mitigation

### High Risk Areas

1. **BattleMetrics API Write Access**
   - **Risk:** API might not support flag manipulation as expected
   - **Mitigation:** Research API docs thoroughly, implement read operations first, test with single player before bulk

2. **Discord Role Removal at Scale**
   - **Risk:** Rate limiting, API errors on bulk operations
   - **Mitigation:** Implement batching, rate limiting, retry logic, progress tracking

3. **Data Loss on Staff Removal**
   - **Risk:** Accidentally removing roles without proper archiving
   - **Mitigation:** Archive BEFORE removal, transaction safety, audit logging, dry-run mode

4. **Approval Workflow Security**
   - **Risk:** Approval ID guessing, expired approvals executed
   - **Mitigation:** Cryptographically secure IDs, expiry validation, permission checks

### Medium Risk Areas

1. **Memory Storage for Approvals**
   - **Risk:** Bot restart loses pending approvals
   - **Mitigation:** 24hr expiry acceptable, consider database storage if needed

2. **Notification DM Failures**
   - **Risk:** Users have DMs disabled
   - **Mitigation:** Optional feature, log failures, don't block main operation

3. **Restoration Eligibility Logic**
   - **Risk:** Complex rules for when restoration is allowed
   - **Mitigation:** Simple default (always eligible), admin override available

---

## Future Enhancements (Post-MVP)

1. **Automated Scheduling**: Run scrub preview automatically (weekly/monthly)
2. **Grace Period Warnings**: Warn members X days before scrub
3. **Partial Restoration**: Restore specific roles, not all
4. **Export/Import**: CSV export of scrub results
5. **Dashboard**: Web interface for scrub management
6. **Analytics**: Track scrub effectiveness over time
7. **Role Demotion**: Instead of removal, demote staff to lower roles
8. **Whitelist Integration**: Automatically revoke whitelist entries during scrub

---

## Notes & Considerations

- **BattleMetrics Rate Limiting**: Current limit is ~4.5 req/sec. Large scrubs (100+ users) will take time.
- **Discord Audit Log**: All role changes will appear in Discord's native audit log (trackable)
- **Database Transactions**: Use where possible, but BattleMetrics operations can't be rolled back
- **Error Recovery**: Failed BM operations should be logged for manual retry
- **Dry Run Mode**: Consider adding `dry_run: true` option to test without making changes
- **Approval Persistence**: Consider storing approvals in database instead of memory for bot restart safety

---

## Progress Tracking

**Started:** 2025-11-15
**Current Phase:** Phase 2 - BattleMetrics Write Integration
**Overall Progress:** ~21% (4/19 tasks complete)

**✅ PHASE 1 COMPLETE - Database & Model Extensions:**
- ✅ Created comprehensive implementation plan (MEMBER_STAFF_SCRUBBING_PLAN.md)
- ✅ Created StaffRoleArchive model with full method suite (21 fields, 10 indexes, 12 methods)
- ✅ Created and executed migration #029 for staff_role_archives table
- ✅ Documented all AuditLog action types including 7 new scrub-related types

**Next Steps:**
1. Begin Phase 2: Extend BattleMetricsService with write methods (Task 2.1)
2. Create BattleMetricsScrubService (Task 2.2)
3. Begin Phase 3: Core scrubbing services
