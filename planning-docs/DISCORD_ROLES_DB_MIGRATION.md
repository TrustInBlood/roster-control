# Discord Roles Database Migration Plan

## Overview
Move Discord role configuration from `config/discordRoles.js` to a database-driven system with dashboard management and custom groupings. Groups serve both functional purposes (replacing helper functions) and visual organization in the dashboard.

## User Requirements
- **Functional + Visual groups**: Groups replace helper functions AND organize dashboard display
- **Custom groups**: Users can create/rename/delete groups freely
- **All roles managed**: Every role in discordRoles.js becomes database-managed
- **Access control**: MANAGE_PERMISSIONS required

## Current State
**17 Discord Role IDs** in `DISCORD_ROLES` object
**6 Helper Functions**: `getAllAdminRoles()`, `getAllTutorRoles()`, `getAllSpecialtyRoles()`, `getAllWhitelistAwardRoles()`, `getAllMemberRoles()`, `getAllStaffRoles()`

---

## Database Schema

### Table 1: `discord_role_groups`
```sql
CREATE TABLE discord_role_groups (
  id INT PRIMARY KEY AUTO_INCREMENT,
  group_key VARCHAR(50) NOT NULL UNIQUE,         -- e.g., 'admin_roles'
  display_name VARCHAR(100) NOT NULL,            -- e.g., 'Admin Roles'
  description TEXT,
  display_order INT DEFAULT 0,
  color VARCHAR(7),                              -- Hex color for UI
  is_system_group BOOLEAN DEFAULT FALSE,         -- Cannot delete if true
  security_critical BOOLEAN DEFAULT FALSE,       -- Must have roles if true
  created_by VARCHAR(20),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(20),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Table 2: `discord_roles`
```sql
CREATE TABLE discord_roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  role_id VARCHAR(20) NOT NULL UNIQUE,           -- Discord snowflake ID
  role_name VARCHAR(100),                        -- Cached Discord role name
  role_key VARCHAR(50) NOT NULL UNIQUE,          -- e.g., 'SUPER_ADMIN', 'MEMBER'
  description TEXT,
  group_id INT,                                  -- FK to discord_role_groups
  is_system_role BOOLEAN DEFAULT FALSE,          -- Cannot delete if true
  created_by VARCHAR(20),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(20),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES discord_role_groups(id) ON DELETE SET NULL
);
```

### Initial Groups (seeded from config)
| group_key | display_name | security_critical |
|-----------|--------------|-------------------|
| admin_roles | Admin Roles | true |
| staff_roles | Staff Roles | true |
| tutor_roles | Tutor Roles | false |
| specialty_roles | Specialty Roles | false |
| whitelist_award_roles | Whitelist Awards | false |
| member_roles | Member Roles | false |
| duty_roles | Duty Roles | false |
| system_roles | System Roles | false |

---

## Implementation Phases

### Phase 1: Database Layer
**Files to create:**
- `migrations/036-create-discord-role-groups.js`
- `migrations/037-create-discord-roles.js`
- `src/database/models/DiscordRoleGroup.js`
- `src/database/models/DiscordRole.js`

**Files to modify:**
- `src/database/models/index.js` - Export new models

### Phase 2: Service Layer
**File to create:** `src/services/DiscordRoleService.js`

Key methods:
```javascript
class DiscordRoleService {
  // Cache (5-min TTL like SquadGroupService)
  async initialize()
  invalidateCache()

  // Role queries
  async getAllRoles()
  async getRoleById(roleId)
  async getRoleByKey(roleKey)        // e.g., 'MEMBER'
  async getRolesByGroup(groupKey)

  // Group queries
  async getAllGroups()
  async getGroupByKey(groupKey)
  async getRoleIdsByGroup(groupKey)  // Returns string[] of role IDs

  // Helper function replacements (async)
  async getAllAdminRoles()           // Returns role IDs in 'admin_roles' group
  async getAllStaffRoles()           // Returns admin_roles + staff_roles
  async getAllTutorRoles()
  async getAllSpecialtyRoles()
  async getAllWhitelistAwardRoles()
  async getAllMemberRoles()

  // CRUD
  async createRole(data, createdBy)
  async updateRole(roleId, data, updatedBy)
  async deleteRole(roleId, deletedBy)
  async createGroup(data, createdBy)
  async updateGroup(groupId, data, updatedBy)
  async deleteGroup(groupId, deletedBy)

  // Seeding
  async seedFromConfigIfEmpty()
}
```

**Security**: `getAllAdminRoles()` and `getAllStaffRoles()` return safety markers (`['NO_ADMIN_ROLES_CONFIGURED']`) if empty.

### Phase 3: API Layer
**File to create:** `src/api/v1/discordroles.js`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/discordroles` | List all roles with group info |
| GET | `/api/v1/discordroles/:roleId` | Get single role |
| POST | `/api/v1/discordroles` | Create role entry |
| PUT | `/api/v1/discordroles/:roleId` | Update role |
| DELETE | `/api/v1/discordroles/:roleId` | Delete role |
| GET | `/api/v1/discordroles/groups` | List all groups |
| POST | `/api/v1/discordroles/groups` | Create custom group |
| PUT | `/api/v1/discordroles/groups/:groupId` | Update group |
| DELETE | `/api/v1/discordroles/groups/:groupId` | Delete group |
| POST | `/api/v1/discordroles/seed` | Re-seed from config |
| GET | `/api/v1/discordroles/available` | Discord roles not yet tracked |

**File to modify:** `src/api/v1/index.js` - Mount routes

### Phase 4: Consumer Migration
Update files to use async service (in order):

| File | Current Usage | Migration |
|------|---------------|-----------|
| `src/utils/environment.js` | Re-exports config | Add async exports alongside sync |
| `src/services/PermissionService.js` | `getAllAdminRoles()` for seeding | Use async service |
| `src/api/middleware/auth.js` | `getAllStaffRoles()` for access | Use cached async call |
| `src/services/StatsService.js` | `getAllAdminRoles()` for cooldown | Use async service |
| `src/handlers/roleChangeHandler.js` | `getAllStaffRoles()` | Already async pattern |
| `src/services/StaffRoleSyncService.js` | `getAllStaffRoles()`, `DISCORD_ROLES.STAFF` | Use async service |
| `src/api/v1/members.js` | `DISCORD_ROLES.MEMBER` | Use `getRoleByKey('MEMBER')` |
| `src/commands/addmember.js` | `DISCORD_ROLES.MEMBER` | Use `getRoleByKey('MEMBER')` |

**Backward compatibility:** Keep sync exports in `environment.js` during transition.

### Phase 5: Dashboard UI
**Files to create:**
- `dashboard/src/types/discordroles.ts`
- `dashboard/src/hooks/useDiscordRoles.ts`
- `dashboard/src/lib/api.ts` - Add discordRolesApi
- `dashboard/src/pages/DiscordRoles.tsx`
- `dashboard/src/components/discordroles/RoleGroupsSidebar.tsx`
- `dashboard/src/components/discordroles/RoleGroupDetail.tsx`
- `dashboard/src/components/discordroles/AddRoleModal.tsx`
- `dashboard/src/components/discordroles/AddGroupModal.tsx`

**Files to modify:**
- `dashboard/src/App.tsx` - Add route
- `dashboard/src/components/layout/Sidebar.tsx` - Add nav item

**UI Layout:**
```
+------------------+  +--------------------------------+
| GROUPS           |  | ROLES IN: [Selected Group]     |
|------------------|  |--------------------------------|
| > Admin Roles    |  | [+] Add Role                   |
|   Staff Roles    |  |--------------------------------|
|   Tutor Roles    |  | Role Name  | Key         | X  |
|   ...            |  | Exec Admin | EXEC_ADMIN  | X  |
| [+] New Group    |  | Head Admin | HEAD_ADMIN  | X  |
+------------------+  +--------------------------------+
```

---

## Files Summary

### New Files (12)
1. `migrations/036-create-discord-role-groups.js`
2. `migrations/037-create-discord-roles.js`
3. `src/database/models/DiscordRoleGroup.js`
4. `src/database/models/DiscordRole.js`
5. `src/services/DiscordRoleService.js`
6. `src/api/v1/discordroles.js`
7. `dashboard/src/types/discordroles.ts`
8. `dashboard/src/hooks/useDiscordRoles.ts`
9. `dashboard/src/pages/DiscordRoles.tsx`
10. `dashboard/src/components/discordroles/RoleGroupsSidebar.tsx`
11. `dashboard/src/components/discordroles/RoleGroupDetail.tsx`
12. `dashboard/src/components/discordroles/AddRoleModal.tsx`

### Modified Files (12)
1. `src/database/models/index.js`
2. `src/api/v1/index.js`
3. `src/utils/environment.js`
4. `src/index.js` - Initialize service
5. `src/services/PermissionService.js`
6. `src/api/middleware/auth.js`
7. `src/services/StatsService.js`
8. `src/handlers/roleChangeHandler.js`
9. `src/services/StaffRoleSyncService.js`
10. `src/api/v1/members.js`
11. `src/commands/addmember.js`
12. `dashboard/src/App.tsx`
13. `dashboard/src/components/layout/Sidebar.tsx`
14. `dashboard/src/lib/api.ts`

---

## Key Design Decisions

1. **Two tables**: Separate groups and roles for flexibility
2. **group_key for lookups**: Helper functions query by group_key (e.g., 'admin_roles')
3. **is_system_role/group**: Prevents deletion of critical roles/groups
4. **security_critical**: Groups that must have at least one role
5. **Async-first**: New service is async, sync exports deprecated but kept for compatibility
6. **5-min TTL cache**: Same pattern as SquadGroupService
7. **Safety markers**: Return special strings if critical groups empty (security)

---

## Implementation Order

1. Database migrations + models
2. DiscordRoleService with seeding
3. API endpoints
4. Update environment.js with async exports
5. Migrate consumers (one by one)
6. Dashboard UI
7. Test all helper function usages
