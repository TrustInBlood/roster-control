# Role-Based Whitelist System Testing Checklist

## Pre-Deployment Tests

### 1. Run Automated Test Script
```bash
node scripts/test-role-system.js
```
**Expected:** All tests should pass (6/6)

### 2. Manual Configuration Verification

#### Check Role Mappings
```bash
node scripts/check-roles.js
```
**Verify:**
- All role IDs resolve to correct Discord role names
- Squad group mappings match your intended hierarchy
- Member count for each role looks reasonable

#### Check Configuration Files
- [ ] `config/discordRoles.js` - All role IDs are correct
- [ ] `config/squadGroups.js` - Groups mapped to intended roles
- [ ] `config/roles.js` - Command permissions look correct
- [ ] `migratewhitelists` command is properly disabled

### 3. Test in Development Environment

#### Database Connection
```bash
npm run test:db
```
**Expected:** Database connection successful

#### Bot Startup
```bash
npm run dev
```
**Verify:**
- Bot starts without errors
- Role-based cache initializes successfully
- No error messages about missing roles or configurations

#### Test Commands (in Discord)
- [ ] `/ping` - Should work for everyone
- [ ] `/help` - Should work for everyone  
- [ ] `/whitelist info user:@someone` - Should show role-based status if they have roles
- [ ] `/unlinkedstaff` - Should list staff without Steam links (admin only)
- [ ] `/migratewhitelists` - Should be denied (shelved command)

#### Test Role Changes
1. Temporarily add/remove a staff role from a test user
2. Check that the role change is detected and logged
3. Verify cache updates properly

## Production Deployment Checklist

### Pre-Deployment
- [ ] All automated tests pass
- [ ] Manual verification complete
- [ ] Rollback plan prepared
- [ ] Backup of current system taken

### Deployment Steps
1. [ ] Stop current bot: `pm2 stop roster-control`
2. [ ] Pull latest code: `git pull origin main`
3. [ ] Install dependencies: `npm install`
4. [ ] Deploy commands: `npm run deploy:commands:prod`
5. [ ] Start bot: `pm2 start roster-control`

### Post-Deployment Verification

#### Immediate Checks (first 5 minutes)
- [ ] Bot comes online in Discord
- [ ] No error messages in logs: `pm2 logs roster-control`
- [ ] Role-based cache initializes successfully
- [ ] Staff whitelist endpoint works: `curl http://localhost:3001/staff`
- [ ] Member whitelist endpoint works: `curl http://localhost:3001/members`
- [ ] Traditional whitelist still works: `curl http://localhost:3001/whitelist`

#### Functional Tests (first 30 minutes)
- [ ] Test `/whitelist info` with a staff member - should show role-based status
- [ ] Test `/whitelist info` with a regular member - should show role-based status if configured
- [ ] Test `/unlinkedstaff` - should list staff who need to link accounts
- [ ] Verify role change detection by temporarily modifying a test user's roles
- [ ] Check that audit logs are being created for role changes

#### Extended Monitoring (first 24 hours)
- [ ] Monitor logs for any unexpected errors
- [ ] Verify Squad servers can fetch whitelists from all three endpoints
- [ ] Check that role changes continue to be detected and processed
- [ ] Confirm no performance issues with the in-memory cache

## Rollback Plan

If any issues occur:

### Immediate Rollback (if critical)
1. `pm2 stop roster-control`
2. `git checkout <previous-commit-hash>`
3. `npm install`
4. `npm run deploy:commands:prod`
5. `pm2 start roster-control`

### Partial Rollback (disable role-based system)
1. Comment out role cache initialization in `src/services/WhitelistIntegration.js`
2. Restart bot - system will fall back to database-only whitelists
3. Investigate and fix issues

## Common Issues and Troubleshooting

### Role Cache Not Initializing
- Check Discord permissions - bot needs to read guild members
- Verify role IDs in `config/discordRoles.js`
- Check database connection for PlayerDiscordLink table

### Endpoints Returning Empty
- Verify role mappings in squadGroups.js
- Check if staff have linked Steam accounts
- Confirm cache is being populated during initialization

### Performance Issues
- Monitor memory usage of role cache
- Check cache refresh frequency (default 60 seconds)
- Verify database queries aren't timing out

### Role Changes Not Detected
- Confirm guildMemberUpdate event is working
- Check that roleChangeHandler has access to role cache
- Verify role mappings in configuration

## Success Criteria

✅ **System is ready for production when:**
- All automated tests pass
- Manual verification complete
- Bot starts without errors
- All three whitelist endpoints work
- Role-based status appears in `/whitelist info`
- Unlinked staff are properly tracked
- Role changes are detected and processed
- No critical errors in logs for first 30 minutes

⚠️ **Consider rollback if:**
- Any automated test fails
- Critical errors in logs
- Endpoints return incorrect data
- Squad servers can't fetch whitelists
- Performance significantly degraded
- Staff lose expected whitelist access