# Squad Groups Database Migration Plan

## Overview
Move Squad server group configuration from `config/squadGroups.js` to a database-driven system with dashboard management. Each Discord role with Squad permissions becomes its own Squad group (1:1 mapping), with hierarchy determined by Discord's role position.

## User Requirements
- **Granularity**: Individual Squad permissions per Discord role
- **Hierarchy**: Discord role position determines priority (higher = more priority)
- **Permissions**: Predefined checkbox list (not free-form)
- **Role mapping**: 1:1 - Each Discord role IS its own Squad group
- **Access control**: Super Admin only (MANAGE_PERMISSIONS)

## Predefined Squad Permissions
`cameraman`, `canseeadminchat`, `chat`, `forceteamchange`, `immune`, `reserve`, `teamchange`, `balance`

---

## Implementation Steps

### Phase 1: Database Layer

#### 1.1 Create Migration
**File**: `migrations/035-create-squad-role-permissions-table.js`

```sql
CREATE TABLE squad_role_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_id VARCHAR(20) NOT NULL UNIQUE,  -- Discord role ID
  role_name VARCHAR(100),               -- Cached role name
  group_name VARCHAR(100),              -- Squad group name (defaults to role name)
  permissions TEXT NOT NULL,            -- Comma-separated Squad permissions
  created_by VARCHAR(20),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(20),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_role_id (role_id)
);
```

#### 1.2 Create Model
**File**: `src/database/models/SquadRolePermission.js`

Static methods:
- `getAllMappings()` - Get all role configs
- `getByRoleId(roleId)` - Get config for specific role
- `setRolePermissions(roleId, data)` - Create/update role
- `removeRole(roleId)` - Delete role from system
- `getTrackedRoleIds()` - Get all tracked Discord role IDs

#### 1.3 Update Model Index
**File**: `src/database/models/index.js` - Export new model

---

### Phase 2: Service Layer

#### 2.1 Create SquadGroupService
**File**: `src/services/SquadGroupService.js`

Features:
- 5-minute TTL cache (same as PermissionService)
- Fallback to config file if DB unavailable
- Auto-seed from config on first run
- Whitelist cache invalidation hook

Key methods (maintain backward-compatible signatures):
```javascript
class SquadGroupService {
  // Cache management
  async initialize()
  invalidateCache()

  // Helper replacements (same signature as config functions)
  async getAllTrackedRoles()                    // Returns string[]
  async getHighestPriorityGroup(roleCache, guild)  // Uses Discord role position
  async getGroupByRoleId(roleId)
  async isTrackedRole(roleId)

  // CRUD for dashboard
  async getAllRoleConfigs()
  async setRolePermissions(roleId, data, updatedBy)
  async removeRole(roleId, removedBy)

  // Metadata
  getSquadPermissionsList()  // Returns predefined permissions array
}
```

**Priority calculation** (using Discord role position):
```javascript
async getHighestPriorityGroup(roleCache, guild) {
  const trackedRoles = await this.getAllTrackedRoles();
  const userTrackedRoles = roleCache.filter(r => trackedRoles.includes(r.id));

  // Sort by Discord position (higher = more priority)
  const sorted = userTrackedRoles.sort((a, b) => b.position - a.position);

  if (sorted.size === 0) return null;

  const highestRole = sorted.first();
  return this.getGroupByRoleId(highestRole.id);
}
```

---

### Phase 3: API Layer

#### 3.1 Create API Routes
**File**: `src/api/v1/squadgroups.js`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/squadgroups` | List all configured roles with permissions |
| GET | `/api/v1/squadgroups/permissions` | Get predefined permissions list |
| GET | `/api/v1/squadgroups/roles` | Get available Discord roles |
| POST | `/api/v1/squadgroups` | Add new role with permissions |
| PUT | `/api/v1/squadgroups/:roleId` | Update role permissions |
| DELETE | `/api/v1/squadgroups/:roleId` | Remove role from system |

All endpoints require `MANAGE_PERMISSIONS` permission.

#### 3.2 Mount Routes
**File**: `src/api/v1/index.js` - Add squadgroups router

---

### Phase 4: Integration Updates

#### 4.1 Update environment.js
**File**: `src/utils/environment.js`

- Export `squadGroupService` singleton
- Proxy helper functions to service methods
- Keep sync exports for backward compatibility during transition

```javascript
// New exports
const { squadGroupService } = require('../services/SquadGroupService');

module.exports = {
  // Existing sync exports (fallback to config)
  squadGroups,
  getHighestPriorityGroup: squadGroups.getHighestPriorityGroup,

  // New async service
  squadGroupService,
  getHighestPriorityGroupAsync: (roleCache, guild) =>
    squadGroupService.getHighestPriorityGroup(roleCache, guild),
};
```

#### 4.2 Update Consumers
Files that need async updates:

| File | Change |
|------|--------|
| `src/handlers/roleChangeHandler.js` | Use service methods |
| `src/services/RoleWhitelistSyncService.js` | Use service methods |
| `src/services/WhitelistService.js` | Use service for group definitions |
| `src/commands/unlinkedstaff.js` | Use async service |
| `src/api/v1/security.js` | Use async service |

#### 4.3 Whitelist Cache Invalidation
**File**: `src/services/SquadGroupService.js`

On any squad group change:
```javascript
async setRolePermissions(...) {
  // ... update DB
  this.invalidateCache();

  // Trigger whitelist regeneration
  if (this.whitelistService) {
    this.whitelistService.invalidateCache();
  }
}
```

---

### Phase 5: Frontend

#### 5.1 Types
**File**: `dashboard/src/types/squadgroups.ts`

```typescript
interface SquadPermission {
  id: string;
  label: string;
  description: string;
}

interface RoleConfig {
  roleId: string;
  roleName: string;
  groupName: string;
  permissions: string[];
  discordPosition: number;
  color: string;
}
```

#### 5.2 API Client
**File**: `dashboard/src/lib/api.ts` - Add `squadGroupsApi` object

#### 5.3 Hooks
**File**: `dashboard/src/hooks/useSquadGroups.ts`

- `useSquadGroups()` - List all configs
- `useSquadGroupRoles()` - Available Discord roles
- `useAddSquadRole()` - Mutation
- `useUpdateSquadRole()` - Mutation
- `useRemoveSquadRole()` - Mutation

#### 5.4 Page Component
**File**: `dashboard/src/pages/SquadGroups.tsx`

Layout:
- Header with title + refresh button
- Table of configured roles (sorted by Discord position)
- "Add Role" button
- Click row to edit

#### 5.5 Components
- `dashboard/src/components/squadgroups/SquadGroupsTable.tsx`
- `dashboard/src/components/squadgroups/SquadGroupEditModal.tsx` - Checkbox grid for permissions
- `dashboard/src/components/squadgroups/AddSquadRoleModal.tsx` - Role selector + permissions

#### 5.6 Navigation
**File**: `dashboard/src/components/layout/Sidebar.tsx`

Add nav item under Admin section:
```typescript
{ name: 'Squad Groups', href: '/admin/squadgroups', icon: Shield, permission: 'MANAGE_PERMISSIONS' }
```

#### 5.7 Routing
**File**: `dashboard/src/App.tsx`

Add route: `<Route path="admin/squadgroups" element={<SquadGroups />} />`

---

## Files Summary

### New Files (10)
1. `migrations/035-create-squad-role-permissions-table.js`
2. `src/database/models/SquadRolePermission.js`
3. `src/services/SquadGroupService.js`
4. `src/api/v1/squadgroups.js`
5. `dashboard/src/types/squadgroups.ts`
6. `dashboard/src/hooks/useSquadGroups.ts`
7. `dashboard/src/pages/SquadGroups.tsx`
8. `dashboard/src/components/squadgroups/SquadGroupsTable.tsx`
9. `dashboard/src/components/squadgroups/SquadGroupEditModal.tsx`
10. `dashboard/src/components/squadgroups/AddSquadRoleModal.tsx`

### Modified Files (11)
1. `src/database/models/index.js` - Export new model
2. `src/utils/environment.js` - Add service exports
3. `src/api/v1/index.js` - Mount squadgroups routes
4. `src/handlers/roleChangeHandler.js` - Use async service
5. `src/services/RoleWhitelistSyncService.js` - Use async service
6. `src/services/WhitelistService.js` - Use service for group defs
7. `src/commands/unlinkedstaff.js` - Use async service
8. `src/api/v1/security.js` - Use async service
9. `dashboard/src/lib/api.ts` - Add squadGroupsApi
10. `dashboard/src/components/layout/Sidebar.tsx` - Add nav
11. `dashboard/src/App.tsx` - Add route

---

## Key Design Decisions

1. **Discord Role Position for Priority**: No manual priority management - uses Discord's built-in role hierarchy
2. **1:1 Role-to-Group**: Simpler mental model - each role IS its own group
3. **Predefined Permissions**: Checkbox UI prevents typos, but requires code change for new permissions
4. **Same Function Signatures**: Helper functions maintain same interface for minimal refactoring
5. **Fallback to Config**: If DB unavailable, falls back to squadGroups.js
6. **Cache Invalidation Chain**: Squad group changes trigger whitelist regeneration

---

## Implementation Order

1. Database (migration + model)
2. Service layer with caching
3. API endpoints
4. Integration updates (consumers)
5. Frontend (types, hooks, components)
6. Build + test
