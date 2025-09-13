# Development Environment Setup Guide

## Discord Server Setup (Testing Zone)

### Current Roles Available
- ✅ **Admin** (`1365205433236717598`) - Will be used as EXECUTIVE_ADMIN
- ✅ **On-Duty Dev** (`1407218174117679125`) - Used for duty system testing
- ✅ **Donator** (`1411597337834426539`) - For whitelist award testing (gives 6-12 month whitelist)
- ✅ **First Responder** (`1411597443774283859`) - For whitelist award testing (gives 6 month whitelist)
- ✅ **Service Member** (`1411597413176574084`) - For whitelist award testing (gives 6 month whitelist)

### Recommended Test Roles to Create

To properly test the role hierarchy system, create these additional roles in your Testing Zone Discord:

**Essential for testing:**
1. **Test Member** - For Member group testing (regular members, no admin permissions)

**Optional for full hierarchy testing:**
2. **Test Head Admin** - For HeadAdmin group testing  
3. **Test Senior Admin** - For SquadAdmin group testing
4. **Test Squad Admin** - For SquadAdmin group testing
5. **Test Moderator** - For Moderator group testing

### Steps to Set Up Testing Environment

#### 1. Create Missing Roles (Optional but Recommended)
In your Testing Zone Discord:
1. Go to Server Settings → Roles
2. Create the test roles listed above
3. Assign yourself these roles for testing

#### 2. Update Development Configuration
After creating roles, get their IDs and update `config/discordRoles.development.js`:

```javascript
HEAD_ADMIN: 'NEW_ROLE_ID_HERE',        // "Test Head Admin"
SENIOR_ADMIN: 'NEW_ROLE_ID_HERE',      // "Test Senior Admin" 
SQUAD_ADMIN: 'NEW_ROLE_ID_HERE',       // "Test Squad Admin"
MODERATOR: 'NEW_ROLE_ID_HERE',         // "Test Moderator"
```

#### 3. Run Tests
```bash
# Check role mappings
NODE_ENV=development node scripts/check-dev-roles.js

# Run full test suite
NODE_ENV=development node scripts/test-role-system.js
```

#### 4. Start Development Bot
```bash
npm run dev
```

#### 5. Test Commands in Discord
- `/ping` - Should work for everyone
- `/whitelist info user:@yourself` - Should show your role-based status
- `/unlinkedstaff` - Should list anyone with roles but no Steam link

## Minimal Testing Setup (Current Configuration)

Even without creating additional roles, you can test with current setup:

### Current Role Mappings
- **HeadAdmin Group**: Admin role → Full server permissions
- **Member Group**: No roles configured yet (need to create "Test Member" role)
- **Whitelist Awards**: Service Member, Donator, First Responder → Database-based whitelists

### Test Scenarios Available
1. **Admin Functionality**: Assign yourself the Admin role, test `/whitelist info`
2. **Whitelist Awards**: Test Service Member/Donator/First Responder roles (database whitelists)
3. **Unlinked Staff**: Remove Steam account link, should appear in `/unlinkedstaff`
4. **Role Changes**: Add/remove roles, verify cache updates

**Note**: To test Member group functionality, you'll need to create a "Test Member" role first.

### Test Endpoints
- `http://localhost:3001/staff` - Should show admin entries
- `http://localhost:3001/members` - Should show member entries  
- `http://localhost:3001/whitelist` - Original database whitelist (unchanged)

## Testing Checklist

- [ ] Bot starts without errors
- [ ] Role mappings work (check with `/whitelist info`)
- [ ] Staff endpoint serves correctly
- [ ] Member endpoint serves correctly
- [ ] Unlinked staff detection works
- [ ] Role changes are detected and logged
- [ ] Commands have proper permissions

## Troubleshooting

### Bot Won't Start
- Check `.env.development` has correct Discord token/guild ID
- Verify database connection
- Check for syntax errors in config files

### Roles Not Working
- Run `NODE_ENV=development node scripts/check-dev-roles.js`
- Verify role IDs in development config files
- Check bot has permission to read guild members

### Endpoints Empty
- Verify you have roles assigned
- Check if you need to link a Steam account
- Look for error messages in bot logs