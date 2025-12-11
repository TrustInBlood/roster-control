# Dashboard Implementation Plan

## Overview

Build a web dashboard for roster-control that replaces awkward Discord slash commands with a visual interface. Uses Discord OAuth2 for authentication, integrated into the existing Express server.

**Stack**: React + TailwindCSS frontend, Express.js API (existing server on port 3001)

---

## Phase Priority

1. **Phase 1**: Whitelist Management - CRUD operations (MVP)
2. **Phase 2**: Member Onboarding - `/addmember` replacement
3. **Phase 3**: Duty Statistics - charts/analytics (after auto-tracking implemented)
4. **Phase 4**: Security Auditing - audit log viewer, unlinked staff (lower priority)

---

## Architecture

```
[React SPA]  <-->  [/api/v1/* routes]  <-->  [Existing Express Server :3001]
                         |
                  [Discord OAuth2]
                         |
                  [MariaDB + Sequelize]
```

- **Monorepo**: Frontend lives in `/dashboard` subdirectory
- **API Prefix**: All new routes under `/api/v1/`
- **Production**: Express serves React build as static files
- **Development**: Vite dev server proxies to Express backend

---

## Phase 1: Whitelist Management MVP

### Features

#### 1.1 Whitelist List View
- Paginated table of all whitelist entries
- **Filters**: Status (active/expired/revoked), Source (role/manual/donation/import), Search by Steam ID/username
- **Columns**: Steam ID, Discord User, Username, Source, Status, Expiration, Granted By, Actions
- **Sorting**: By expiration, grant date, username

#### 1.2 Whitelist Detail View
- User info (Steam ID, Discord user, in-game name)
- Current status with countdown timer
- Stacked duration visualization (shows how multiple entries accumulate)
- Entry history timeline
- Account link confidence score

#### 1.3 Grant Whitelist
- Form: Steam ID, Discord user (optional autocomplete), Duration (presets + custom), Reason, Note
- Validates Steam ID format
- Shows warning if Steam ID linked to different Discord user
- Shows existing whitelist status before granting

#### 1.4 Extend Whitelist
- Duration selector (same as grant)
- Creates new stacking entry

#### 1.5 Revoke Whitelist
- Reason input (required)
- Revokes all non-role-based entries for user
- Logs to AuditLog

### API Endpoints

```
GET    /api/v1/whitelist                - List entries (pagination, filters)
GET    /api/v1/whitelist/:steamid64     - User whitelist details + history
POST   /api/v1/whitelist                - Grant new whitelist
PUT    /api/v1/whitelist/:id/extend     - Extend existing entry
DELETE /api/v1/whitelist/:steamid64     - Revoke entries
GET    /api/v1/whitelist/stats          - Dashboard statistics
```

---

## Phase 2: Member Onboarding

### Features
- Multi-step wizard replacing `/addmember` command
- Discord user selection with autocomplete
- Steam ID validation (manual entry or BattleMetrics lookup)
- Role assignment preview
- Whitelist grant in same flow
- **Bulk Import**: CSV upload with validation and progress indicator

### API Endpoints

```
GET    /api/v1/members                  - List members
POST   /api/v1/members                  - Add new member
POST   /api/v1/members/bulk             - Bulk import
GET    /api/v1/discord/members          - Guild member autocomplete
GET    /api/v1/battlemetrics/search     - Search BM players by name
```

---

## Phase 3: Duty Statistics

### Features (requires automatic duty tracking from SquadJS)
- Real-time on-duty board with WebSocket updates
- Duty time leaderboard with time period selector
- User duty detail view with session timeline
- Charts: duty hours over time, by day of week, coverage gaps

### API Endpoints

```
GET    /api/v1/duty/live                - Currently on-duty users
GET    /api/v1/duty/leaderboard         - Duty time leaderboard
GET    /api/v1/duty/user/:discordId     - User duty statistics
WS     /api/v1/duty/stream              - WebSocket for live updates
```

---

## Phase 4: Security Auditing

### Features
- Audit log viewer with filters (action type, actor, target, date range)
- Unlinked staff management with bulk notification
- Security issue tracking

### API Endpoints

```
GET    /api/v1/audit                    - List audit logs
GET    /api/v1/security/unlinked-staff  - Staff without Steam links
```

---

## Authentication Flow

1. User clicks "Login with Discord"
2. `GET /api/v1/auth/login` - redirects to Discord OAuth
3. Discord redirects to `/api/v1/auth/callback`
4. Backend validates user is in guild, creates session
5. Frontend calls `/api/v1/auth/me` to get user info + roles
6. Role-based access control on all dashboard pages/actions

### Permission Mapping

```javascript
VIEW_WHITELIST:   ['STAFF', 'MODERATOR', 'ADMIN', 'HEAD_ADMIN', 'SUPER_ADMIN']
GRANT_WHITELIST:  ['STAFF', 'MODERATOR', 'ADMIN', 'HEAD_ADMIN', 'SUPER_ADMIN']
REVOKE_WHITELIST: ['ADMIN', 'HEAD_ADMIN', 'SUPER_ADMIN']
ADD_MEMBER:       ['APPLICATIONS', 'ADMIN', 'HEAD_ADMIN', 'SUPER_ADMIN']
VIEW_AUDIT:       ['ADMIN', 'HEAD_ADMIN', 'SUPER_ADMIN']
```

---

## File Structure

```
roster-control/
├── src/
│   ├── api/                          # NEW: Dashboard API
│   │   ├── v1/
│   │   │   ├── index.js              # Router setup
│   │   │   ├── auth.js               # Discord OAuth routes
│   │   │   ├── whitelist.js          # Whitelist CRUD
│   │   │   ├── members.js            # Member management
│   │   │   ├── duty.js               # Duty statistics
│   │   │   ├── audit.js              # Audit logs
│   │   │   └── discord.js            # Discord data proxy
│   │   └── middleware/
│   │       ├── auth.js               # Session validation
│   │       └── permissions.js        # Role-based access
│   └── ...existing code
│
├── dashboard/                        # NEW: React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui components
│   │   │   ├── layout/               # Header, Sidebar, Layout
│   │   │   └── whitelist/            # WhitelistTable, GrantForm, etc.
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Whitelist.tsx
│   │   │   ├── WhitelistDetail.tsx
│   │   │   └── Login.tsx
│   │   ├── hooks/                    # useAuth, useWhitelist, etc.
│   │   ├── lib/api.ts                # API client
│   │   └── types/                    # TypeScript types
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
└── config/
    └── dashboard.js                  # NEW: Dashboard config
```

---

## Dependencies to Add

### Backend (add to root package.json)

```json
{
  "passport": "^0.7.0",
  "passport-discord": "^0.1.4",
  "express-session": "^1.18.0",
  "connect-session-sequelize": "^7.1.7",
  "helmet": "^7.1.0",
  "cors": "^2.8.5"
}
```

### Frontend (dashboard/package.json)

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",
    "@tanstack/react-query": "^5.17.0",
    "@tanstack/react-table": "^8.11.0",
    "react-hook-form": "^7.49.0",
    "zod": "^3.22.0",
    "axios": "^1.6.0",
    "date-fns": "^3.0.0",
    "recharts": "^2.10.0",
    "lucide-react": "^0.303.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

---

## Database Changes

### New Migration: dashboard_sessions table

```sql
CREATE TABLE dashboard_sessions (
  sid VARCHAR(36) PRIMARY KEY,
  discord_user_id VARCHAR(20) NOT NULL,
  discord_username VARCHAR(100),
  data TEXT,
  expires DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_discord_user (discord_user_id),
  INDEX idx_sessions_expires (expires)
);
```

---

## Critical Files to Modify

| File | Changes |
|------|---------|
| `src/index.js` (lines 350-418) | Mount `/api/v1/` router, add session middleware |
| `src/database/models/Whitelist.js` | Reuse existing methods: `getActiveEntries`, `grantWhitelist`, `revokeWhitelist`, `getUserHistory` |
| `config/discordRoles.js` | Import role definitions for permission middleware |
| `src/database/models/AuditLog.js` | Log all dashboard actions via `logAction` |
| `package.json` | Add backend dependencies, add dashboard build scripts |

---

## Implementation Steps (Phase 1 MVP)

### Step 1: Backend Foundation
1. Create `src/api/v1/` directory structure
2. Add authentication dependencies to package.json
3. Create session middleware with connect-session-sequelize
4. Create migration for dashboard_sessions table

### Step 2: Discord OAuth
1. Implement `/api/v1/auth/login` - generates state, redirects to Discord
2. Implement `/api/v1/auth/callback` - validates, creates session
3. Implement `/api/v1/auth/me` - returns user + roles
4. Implement `/api/v1/auth/logout` - destroys session
5. Create auth middleware for protected routes

### Step 3: Whitelist API
1. `GET /api/v1/whitelist` - list with pagination/filters (reuse `Whitelist.getActiveEntries`)
2. `GET /api/v1/whitelist/:steamid64` - detail view (reuse `Whitelist.getActiveWhitelistForUser`, `getUserHistory`)
3. `POST /api/v1/whitelist` - grant (reuse `Whitelist.grantWhitelist`)
4. `PUT /api/v1/whitelist/:id/extend` - extend (reuse `Whitelist.extendWhitelist`)
5. `DELETE /api/v1/whitelist/:steamid64` - revoke (reuse `Whitelist.revokeWhitelist`)

### Step 4: React Setup
1. Initialize Vite + React + TypeScript in `/dashboard`
2. Configure TailwindCSS + shadcn/ui
3. Setup Vite proxy to backend
4. Create API client with axios

### Step 5: Core UI Components
1. Layout (Header with user menu, Sidebar with navigation)
2. Login page with Discord OAuth button
3. Auth context for user state

### Step 6: Whitelist UI
1. WhitelistTable with TanStack Table (server-side pagination)
2. Filter controls (status, source, search)
3. GrantForm modal
4. WhitelistDetail page with history timeline
5. ExtendModal and RevokeModal

### Step 7: Integration
1. Add npm scripts for dashboard build
2. Configure Express to serve React build in production
3. Test full flow: login -> view -> grant -> revoke

---

## Environment Variables to Add

```env
# Discord OAuth (new)
DISCORD_OAUTH_CLIENT_SECRET=your_client_secret
DISCORD_OAUTH_CALLBACK_URL=http://localhost:3001/api/v1/auth/callback

# Session (new)
SESSION_SECRET=random_secure_string

# Dashboard (new)
DASHBOARD_ENABLED=true
```

---

## Long-Term Vision

### Future Enhancements (Post-Phase 4)
- **Real-time notifications**: WebSocket push for whitelist changes
- **Mobile-responsive design**: Dashboard usable on phones/tablets
- **Dark mode**: Theme toggle
- **Export functionality**: CSV/PDF reports for whitelist, duty stats
- **Scheduled reports**: Automated weekly duty summaries
- **API keys**: Allow external integrations (SquadJS plugins, etc.)
- **Multi-guild support**: Manage multiple Discord servers from one dashboard

### Integration Opportunities
- **SquadJS Plugin**: Auto-sync player events directly to dashboard
- **BattleMetrics Webhooks**: Real-time ban notifications
- **Discord Bot Commands**: `/dashboard` command to get direct link

---

## Notes

- Existing Whitelist model methods handle duration stacking logic - reuse them
- Express server already running on port 3001 with middleware configured
- AuditLog already captures all actions - dashboard actions should use same pattern
- Permission system in `config/discordRoles.js` has helper functions ready to use
