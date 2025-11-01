# Testing Guide: Confidence Upgrade Fix

This guide walks you through testing the confidence upgrade fix that ensures security-blocked entries are automatically upgraded when confidence reaches 1.0.

## Prerequisites

- Dev bot is running (`npm run dev`)
- You have access to the test Discord server
- You have a test user account in Discord

## Test Scenario: Complete Fix Verification

### Setup
1. Choose a test user who:
   - Has a SquadAdmin role (or another staff role)
   - Does NOT have an existing Steam link

### Test Steps

#### Step 1: Create Low-Confidence Link (Security Block)
```
/adminlink user:@TestUser steamid:76561199999999999 reason:Testing confidence upgrade fix
```

**Expected Result:**
- Link created with 0.7 confidence
- Warning message shows: "This link has confidence score below 1.0 and cannot grant staff whitelist access"
- In database: A security-blocked entry is created (approved=0, revoked=1)

**Verify in database:**
```sql
SELECT id, steamid64, discord_user_id, source, role_name, approved, revoked, revoked_reason
FROM whitelists
WHERE steamid64 = '76561199999999999';
```

You should see:
- `approved = 0`
- `revoked = 1`
- `revoked_reason = "Security block: insufficient link confidence (0.70/1.0)"`

#### Step 2: Upgrade Confidence to 1.0
```
/upgradeconfidence user:@TestUser reason:Testing automatic security entry upgrade
```

**Expected Result:**
- Confidence upgraded to 1.0
- Success message shows: "This user now has FULL staff whitelist access"
- **NEW BEHAVIOR**: Role sync is automatically triggered
- Security-blocked entry should be auto-upgraded in background

**Wait 2-3 seconds** for background sync to complete, then verify in database:
```sql
SELECT id, steamid64, discord_user_id, source, role_name, approved, revoked, metadata
FROM whitelists
WHERE steamid64 = '76561199999999999' AND source = 'role';
```

You should now see:
- `approved = 1`
- `revoked = 0`
- `metadata` contains `"upgraded": true`
- `metadata` contains `"upgradedFrom": "security_blocked"`

#### Step 3: Verify Whitelist Output
```
/whitelist info steamid:76561199999999999
```

**Expected Result:**
- Shows user has active staff whitelist access
- Shows role: SquadAdmin

Alternatively, check the whitelist endpoint:
```bash
curl http://localhost:3001/combined
```

The Steam ID should appear in the staff section with SquadAdmin group.

## Test Scenario 2: /whitelist sync Fix

This tests that `/whitelist sync` can also fix orphaned security-blocked entries.

### Setup
1. Create a security-blocked entry (use Step 1 from above)
2. Manually upgrade confidence in database instead of using `/upgradeconfidence`:
```sql
UPDATE player_discord_links
SET confidence_score = 1.0
WHERE steamid64 = '76561199999999999';
```

### Test Steps

Run whitelist sync:
```
/whitelist sync
```

**Expected Result:**
- Bulk sync processes all users
- Security-blocked entry for this user is detected and upgraded
- Entry now shows `approved=1, revoked=0`

**Verify:**
```sql
SELECT id, steamid64, approved, revoked
FROM whitelists
WHERE steamid64 = '76561199999999999' AND source = 'role';
```

## Test Scenario 3: Systemic Hook (Future-Proof)

This tests that ANY confidence upgrade triggers the fix, not just commands.

### Setup
1. Create a security-blocked entry
2. Use the model's `createOrUpdateLink` directly to upgrade confidence

### Test Steps

In a script or console:
```javascript
const { PlayerDiscordLink } = require('./src/database/models');

await PlayerDiscordLink.createOrUpdateLink(
  'DISCORD_USER_ID',
  '76561199999999999',
  null,
  'TestUser',
  { confidenceScore: 1.0 }
);
```

**Expected Result:**
- Confidence upgraded
- Background role sync triggered automatically
- Security-blocked entry upgraded without any command being run

## Expected Logs

When the fix works correctly, you should see log entries like:

```
info: Triggering role sync for user: TestUser#1234 (SquadAdmin)
info: Upgrading unapproved/blocked role-based entries
info: Upgraded entry to proper role-based whitelist
info: Logged security upgrade to audit trail
info: Sent security transition notification
info: Role sync completed for TestUser#1234
```

## Cleanup

After testing, clean up test data:
```sql
DELETE FROM whitelists WHERE steamid64 = '76561199999999999';
DELETE FROM player_discord_links WHERE steamid64 = '76561199999999999';
```

## Success Criteria

✅ `/adminlink` creates security-blocked entry with 0.7 confidence
✅ `/upgradeconfidence` triggers role sync automatically
✅ Security-blocked entries are upgraded to approved status
✅ `/whitelist sync` upgrades all eligible entries
✅ Audit logs show security upgrades
✅ Whitelist endpoint shows user with staff access
✅ No manual database intervention needed

## Rollback

If issues occur, you can kill the dev server:
```bash
# Find process
ps aux | grep "node.*src/index.js"

# Kill it
kill -9 <PID>
```

Or press Ctrl+C in the terminal running npm run dev.
