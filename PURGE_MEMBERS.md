# Member Purge - Implementation Tasks

One-time member purge to remove roles from users without linked Steam accounts. Roles are archived for 30-day restoration via existing `/linkid` command.

## Overview

- **Target**: Members with MEMBER role who have no Steam account linked
- **Cascade**: Remove MEMBER role AND all staff/admin roles together
- **Nickname Reset**: Server nicknames are reset to default (username)
- **Preserved**: DONATOR, FIRST_RESPONDER, SERVICE_MEMBER roles are NOT touched
- **Restoration**: Automatic when user runs `/linkid` - archived roles restored on successful link
- **Expiry**: 30 days to link account and restore roles

---

## Phase 0: Configuration

- [x] Add `TICKET_SUPPORT` role ID to `config/discordRoles.js` and `config/discordRoles.development.js`

---

## Phase 1: Database & Model

### Role Archive Table
- [x] Create migration `migrations/029-create-role-archive-table.js`
  - Table: `role_archives`
  - Fields: discord_user_id, discord_username, discord_display_name, removed_roles (JSON), removal_reason, removal_source, removed_by_user_id, removed_by_username, expires_at, restored, restored_at, metadata, timestamps
  - Indexes: discord_user_id, expires_at, restored, removal_reason

### Role Archive Model
- [x] Create model `src/database/models/RoleArchive.js`
  - Static: `archiveRoles()`, `findActiveArchive()`, `getExpiredArchives()`, `markRestored()`
  - Instance: `isExpired()`, `getRoleIds()`, `getRoleNames()`

### Register Model
- [x] Add RoleArchive to `src/database/models/index.js`

### Run Migration
- [x] Run `npm run db:migrate:dev` to create table

---

## Phase 2: Role Archive Service (Permanent)

- [x] Create `src/services/RoleArchiveService.js`
  - `archiveUserRoles(member, roles, reason, removedBy)` - Archive before removal
  - `restoreUserRoles(discordUserId, guild)` - Restore from archive
  - `getArchiveForUser(discordUserId)` - Get active archive
  - `cleanupExpiredArchives()` - Remove old entries

---

## Phase 3: Integrate with /linkid

- [x] Modify `/linkid` command or linking service to check for active role archive
  - After successful Steam link with confidence >= 1.0
  - Call `RoleArchiveService.restoreUserRoles()`
  - Restore archived roles to user
  - Mark archive as restored
  - Log to AuditLog: `ROLES_RESTORED`

---

## Phase 4: Purge Service (Temporary)

- [x] Create `src/services/MemberPurgeService.js`
  - `generatePreview(guild, limit=30)` - Returns affected users with roles
  - `executePurge(guild, actorId, actorName)` - Archives roles, removes them, sends DMs
  - `sendRemovalNotification(member, removedRoles, expiresAt)` - DM user

### Purge Logic
- Get members with MEMBER role via MemberCacheService
- Filter to those WITHOUT PlayerDiscordLink records
- For each user, collect roles to remove:
  - MEMBER
  - STAFF, MODERATOR, TICKET_SUPPORT
  - SQUAD_ADMIN, OG_ADMIN, SENIOR_ADMIN, HEAD_ADMIN, EXECUTIVE_ADMIN, SUPER_ADMIN
- **DO NOT remove**: DONATOR, FIRST_RESPONDER, SERVICE_MEMBER
- Archive via RoleArchiveService (30-day expiry)
- Remove roles from Discord
- **Reset server nickname** (set to null/default)
- Send DM with instructions

---

## Phase 5: Web Interface (Temporary)

### HTML Page
- [x] Create `src/views/purge.html`
  - Warning banner
  - Stats: total affected, roles to remove
  - Table: Username | Current Roles | Roles to Remove (max 30 rows)
  - "X more affected..." indicator if >30
  - Confirm button with typed confirmation ("CONFIRM PURGE")
  - Progress indicator
  - Results summary

### Routes
- [x] Create `src/routes/purge.js`
  - Token validation middleware (PURGE_SECRET_TOKEN)
  - `GET /purge` - Serve HTML page
  - `GET /purge/preview` - JSON preview data
  - `POST /purge/execute` - Execute purge

---

## Phase 6: Integration

- [x] Add purge routes to `src/index.js`:
  ```javascript
  if (process.env.PURGE_SECRET_TOKEN) {
    const { setupPurgeRoutes } = require('./routes/purge');
    app.use('/purge', setupPurgeRoutes(client));
  }
  ```

- [x] Add `PURGE_SECRET_TOKEN` to `.env`

- [x] Test in development environment

---

## Phase 7: Execute Purge

- [ ] Deploy to production
- [ ] Run migration: `npm run db:migrate:prod`
- [ ] Access purge webpage and review preview
- [ ] Execute purge
- [ ] Verify results and audit logs

---

## Phase 8: Cleanup (After Purge Complete)

### Delete Temporary Files
- [ ] `src/routes/purge.js`
- [ ] `src/services/MemberPurgeService.js`
- [ ] `src/views/purge.html`

### Remove from src/index.js
- [ ] The `if (process.env.PURGE_SECRET_TOKEN)` block

### Remove from .env
- [ ] `PURGE_SECRET_TOKEN` line

---

## Permanent Components (Keep)

These stay for future inactive status feature:
- `src/database/models/RoleArchive.js`
- `src/services/RoleArchiveService.js`
- `migrations/029-create-role-archive-table.js`
- Database table `role_archives`
- Integration in `/linkid` for auto-restore

---

## Roles Reference

### Roles to REMOVE
| Category | Roles |
|----------|-------|
| Member | MEMBER |
| Staff | STAFF, MODERATOR, TICKET_SUPPORT |
| Admin | SQUAD_ADMIN, OG_ADMIN, SENIOR_ADMIN, HEAD_ADMIN, EXECUTIVE_ADMIN, SUPER_ADMIN |

### Roles to PRESERVE
| Category | Roles |
|----------|-------|
| Whitelist Awards | DONATOR, FIRST_RESPONDER, SERVICE_MEMBER |

---

## DM Notification Content

When roles are removed, DM the user:
- Your Member role (and staff roles if applicable) have been removed
- Reason: No Steam account linked to your Discord
- To restore: Link your Steam account using `/linkid`
- Roles will be automatically restored upon successful link
- Expiry: 30 days from removal date

---

## Audit Log Actions

| Action Type | Description |
|-------------|-------------|
| `MEMBER_PURGE_EXECUTED` | Bulk purge completed |
| `ROLES_ARCHIVED` | Individual user's roles archived |
| `ROLES_RESTORED` | User's roles restored via /linkid |
