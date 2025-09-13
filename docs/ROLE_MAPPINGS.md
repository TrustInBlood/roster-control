# Discord Role Mappings

## Administrative Hierarchy

| Code Constant | Discord Role Name | Squad Group | Squad Permissions |
|---------------|-------------------|-------------|-------------------|
| `EXECUTIVE_ADMIN` | Executive Admin | HeadAdmin | Full server control (all permissions) |
| `HEAD_ADMIN` | Head Admin | SquadAdmin | Core admin (ban, kick, changemap, etc) |
| `OG_ADMIN` | OG Admin | SquadAdmin | Core admin (ban, kick, changemap, etc) |
| `SENIOR_ADMIN` | Senior Admin | Moderator | Basic (chat, reserve) |
| `SQUAD_ADMIN` | Squad Admin | Moderator | Basic (chat, reserve) |

## Squad Group Hierarchy

1. **HeadAdmin** (Priority: 300)
   - Discord Roles: Executive Admin
   - Permissions: Full server control including `manageserver` and `config`

2. **SquadAdmin** (Priority: 200)
   - Discord Roles: Head Admin, OG Admin
   - Permissions: Core admin permissions (ban, kick, changemap, forceteamchange, etc)

3. **Moderator** (Priority: 100)
   - Discord Roles: Senior Admin, Squad Admin
   - Permissions: Basic permissions (canseeadminchat, chat, reserve)

4. **Member** (Priority: 0)
   - Discord Roles: Not configured yet
   - Permissions: reserve only (whitelist access without admin powers)

## Other Role Systems

### Duty System
- `ON_DUTY`: On-Duty Admin - Indicates admin is actively moderating

### Tutor System
- `TUTOR`: Tutor - Base tutor role
- `TUTOR_ON_DUTY`: On-Duty Tutor - Active tutor status
- `TUTOR_LEAD`: Tutor Program Lead - Can manage tutor specialties

### Tutor Specialties
- `TUTOR_HELICOPTER`: Helicopter Specialist
- `TUTOR_ARMOR`: Armor Specialist  
- `TUTOR_INFANTRY`: Infantry Specialist
- `TUTOR_EXPERT`: Squad Expert

### Whitelist Awards
- `DONATOR`: Donator - Gets 6-12 month whitelist
- `FIRST_RESPONDER`: First Responder - Gets 6 month whitelist
- `SERVICE_MEMBER`: Service Member - Gets 6 month whitelist

## Notes

- The role names in code don't always match Discord role names due to historical reasons
- Higher priority numbers take precedence when a user has multiple roles
- All admin roles can use admin commands (whitelist, duty, link, etc)
- Role-based whitelists are served at `/staff` (with permissions) and `/members` (whitelist only)