# Whitelist Cleanup Scripts

This directory contains scripts used for analyzing, exporting, and cleaning up whitelist entries in the production database. These were created to address issues from failed BattleMetrics migration attempts.

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Scripts](#scripts)
- [Common Workflows](#common-workflows)
- [Output Files](#output-files)
- [Safety Notes](#safety-notes)

## Overview

These scripts were created to clean up the whitelist database after failed BattleMetrics migration attempts that resulted in:
- Wrong source fields (manual instead of donation)
- Wrong expiration dates (recalculated from migration date)
- Duplicate imports (same BattleMetrics entry imported multiple times)
- 21,634+ imported entries that needed to be removed

The cleanup was successfully completed on November 9, 2025, removing all imported entries and preserving only bot-created and role-based entries.

## Prerequisites

All scripts require:
- Node.js environment
- `.env.production` file in the project root with database credentials
- Access to production database (MariaDB)
- `migration-output/` directory will be auto-created for output files

**Required Environment Variables:**
```
DB_HOST=your-database-host
DB_PORT=3306
DB_NAME=roster_control
DB_USER=your-database-user
DB_PASSWORD=your-database-password
BATTLEMETRICS_TOKEN=your-battlemetrics-token
BATTLEMETRICS_BANLIST_ID=your-banlist-id
```

## Scripts

### 1. Export BattleMetrics Donations

**File:** `export-battlemetrics-test.js`

**Purpose:** Exports all donation whitelist entries from BattleMetrics API for comparison and analysis.

**Usage:**
```bash
node scripts/whitelist-cleanup/export-battlemetrics-test.js
```

**What it does:**
- Fetches all donation entries from BattleMetrics ban list
- Uses unlimited pagination (max 100 entries per page, API limit)
- Filters entries created before Oct 26, 2025 (excludes manual admin additions)
- Respects rate limiting (220ms between requests)
- Exports to JSON and generates SQL INSERT statements

**Output files:**
- `migration-output/battlemetrics-donations-full.json` - All donation entries
- `migration-output/battlemetrics-donations-full.sql` - SQL INSERT statements
- `migration-output/battlemetrics-donations-summary.txt` - Statistics summary

**Notes:**
- BattleMetrics API has max 100 entries per page
- Script automatically handles pagination using `links.next`
- Filters by exact reason match: 'Rewarded Whitelist via Donation'

---

### 2. Export Production Database

**File:** `export-prod-whitelists.js`

**Purpose:** Exports all whitelist entries from production database for comparison and backup.

**Usage:**
```bash
node scripts/whitelist-cleanup/export-prod-whitelists.js
```

**What it does:**
- Connects to production database
- Exports ALL whitelist entries (no filtering)
- Creates separate export of active entries only
- Generates statistics summary

**Output files:**
- `migration-output/prod-whitelists-export.json` - All entries
- `migration-output/prod-whitelists-active.json` - Active entries only
- `migration-output/prod-whitelists-summary.txt` - Statistics summary

**Notes:**
- READ-ONLY operation (no database modifications)
- Includes all fields: metadata, approved, revoked, etc.

---

### 3. Compare Exports

**File:** `compare-whitelist-exports.js`

**Purpose:** Compares BattleMetrics export with production database to identify overlaps, duplicates, and missing entries.

**Usage:**
```bash
# Must run export scripts first
node scripts/whitelist-cleanup/export-battlemetrics-test.js
node scripts/whitelist-cleanup/export-prod-whitelists.js

# Then run comparison
node scripts/whitelist-cleanup/compare-whitelist-exports.js
```

**What it does:**
- Loads both BattleMetrics and production database exports
- Identifies exact matches (source='donation')
- Identifies manual overlaps (source='manual')
- Identifies role overlaps (source='role')
- Finds missing entries
- Detects duplicate Steam IDs

**Output files:**
- `migration-output/comparison-exact-matches.json`
- `migration-output/comparison-manual-overlaps.json`
- `migration-output/comparison-role-overlaps.json`
- `migration-output/comparison-missing.json`
- `migration-output/comparison-prod-duplicates.json`
- `migration-output/comparison-multiple-entries.json`
- `migration-output/comparison-summary.txt`

**Key findings from Nov 2025 cleanup:**
- Only 10 entries correctly tagged as source='donation' (0.23%)
- 4,371 entries tagged as source='manual' instead
- Migration worked but with wrong source field

---

### 4. Fix Donation Source Field

**File:** `fix-donation-source.js`

**Purpose:** Generates SQL to fix entries that were imported with wrong source field.

**Usage:**
```bash
# Must run export-prod-whitelists.js first
node scripts/whitelist-cleanup/fix-donation-source.js
```

**What it does:**
- Identifies entries with reason starting with 'Rewarded Whitelist via Donation:'
- Finds entries where source='manual' (incorrect)
- Generates SQL UPDATE to change source='manual' to source='donation'

**Output files:**
- `migration-output/fix-donation-source.sql` - SQL UPDATE statements
- `migration-output/fix-donation-source-list.json` - Entries to fix
- `migration-output/fix-donation-source-summary.txt` - Summary

**Notes:**
- Does NOT modify database (generates SQL only)
- Includes verification queries to run after update

---

### 5. Identify Migration Entries

**File:** `identify-migration-entries.js`

**Purpose:** Identifies expired whitelist entries for removal.

**Usage:**
```bash
node scripts/whitelist-cleanup/identify-migration-entries.js
```

**What it does:**
- Connects to production database
- Identifies ALL expired entries (expiration < NOW() or duration_value = 0)
- Filters for approved, non-revoked entries
- Generates DELETE SQL statements (commented for safety)

**Output files:**
- `migration-output/expired-entries-to-remove.json` - Full entry details
- `migration-output/remove-expired-entries.sql` - DELETE statements (commented)
- `migration-output/expired-entries-summary.txt` - Summary

**Nov 2025 cleanup results:**
- Found 18,430 expired entries (82% of database)

**Notes:**
- READ-ONLY operation
- SQL statements are commented out for safety
- Review before executing

---

### 6. Analyze Whitelist Origins

**File:** `analyze-whitelist-origins.js`

**Purpose:** Categorizes ALL whitelist entries by origin (imported vs bot-created vs role-based).

**Usage:**
```bash
node scripts/whitelist-cleanup/analyze-whitelist-origins.js
```

**What it does:**
- Fetches all entries from production database
- Categorizes by origin:
  - **IMPORTED**: Has battlemetricsId in metadata field (needs removal)
  - **BOT-CREATED**: Created via Discord bot commands (keep)
  - **ROLE-BASED**: Automatic Discord role sync (keep)
- Identifies duplicate BattleMetrics imports
- Generates comprehensive statistics

**Output files:**
- `migration-output/imported-entries.json` - Entries TO REMOVE
- `migration-output/bot-created-entries.json` - Entries TO KEEP
- `migration-output/role-based-entries.json` - Entries TO KEEP
- `migration-output/duplicate-imports.json` - Duplicate BattleMetrics IDs
- `migration-output/remove-imported-entries.sql` - DELETE statements (commented)
- `migration-output/whitelist-origins-summary.txt` - Full report

**Nov 2025 cleanup results:**
- 21,634 imported entries (96.2% of database)
- 662 bot-created entries (2.9%)
- 196 role-based entries (0.9%)
- 90 BattleMetrics IDs imported multiple times (180 duplicate entries)

**Identification logic:**
- Imported: metadata contains `battlemetricsId` field
- Bot-created: No battlemetricsId, source='donation' or 'manual'
- Role-based: source='role'

**Notes:**
- 100% accurate identification using metadata field
- READ-ONLY operation
- Review output files before deletion

---

### 7. Delete Imported Entries

**File:** `delete-imported-entries.js`

**Purpose:** PERMANENTLY deletes all imported whitelist entries from production database.

**Usage:**
```bash
# DANGER: This MODIFIES the production database
# Make sure you have a backup first
node scripts/whitelist-cleanup/delete-imported-entries.js
```

**What it does:**
- Connects to production database
- Counts entries before deletion
- Deletes ALL entries where metadata contains 'battlemetricsId'
- Verifies deletion was successful
- Shows breakdown of remaining entries

**Nov 2025 cleanup results:**
- Deleted: 21,634 imported entries
- Remaining: 858 entries (620 manual, 196 role, 42 donation)
- Imported entries remaining: 0 (success)

**SAFETY WARNINGS:**
- **DESTRUCTIVE OPERATION** - Cannot be undone
- **REQUIRES DATABASE BACKUP** before running
- Review `analyze-whitelist-origins.js` output first
- Verify `.env.production` is pointing to correct database

**Verification:**
- Counts entries before and after deletion
- Confirms 0 entries with battlemetricsId remain
- Shows source breakdown of remaining entries

---

### 8. Analyze Revoked and Unapproved

**File:** `analyze-revoked-unapproved.js`

**Purpose:** Shows details about revoked and unapproved whitelist entries.

**Usage:**
```bash
node scripts/whitelist-cleanup/analyze-revoked-unapproved.js
```

**What it does:**
- Queries all revoked entries (revoked = 1)
- Queries all unapproved entries (approved = 0)
- Shows full details for each entry
- Categorizes by source
- Identifies recent revocations (last 30 days)

**Output files:**
- `migration-output/revoked-entries.json` - All revoked entries
- `migration-output/unapproved-entries.json` - All unapproved entries

**Common revocation reasons:**
- Security blocks: insufficient link confidence for staff roles
- Duplicate cleanup: multiple entries for same user
- Discord role removed: automatic revocation
- Admin corrections: manual revocations

**Notes:**
- READ-ONLY operation
- Useful for understanding security system behavior
- Revoked entries are safe to delete (already inactive)

---

## Common Workflows

### Full Database Cleanup (Nov 2025 workflow)

1. **Export and analyze:**
```bash
# Export BattleMetrics donations
node scripts/whitelist-cleanup/export-battlemetrics-test.js

# Export production database
node scripts/whitelist-cleanup/export-prod-whitelists.js

# Compare the two
node scripts/whitelist-cleanup/compare-whitelist-exports.js
```

2. **Identify what needs removal:**
```bash
# Analyze all entries by origin
node scripts/whitelist-cleanup/analyze-whitelist-origins.js

# Review output files in migration-output/
# Verify imported-entries.json contains what should be removed
# Verify bot-created-entries.json contains what should be kept
```

3. **Backup database** (CRITICAL)
```bash
# Use your database backup method
# mysqldump, Pterodactyl panel, etc.
```

4. **Delete imported entries:**
```bash
# DANGER: This modifies production database
node scripts/whitelist-cleanup/delete-imported-entries.js
```

5. **Verify cleanup:**
```bash
# Check revoked and unapproved entries
node scripts/whitelist-cleanup/analyze-revoked-unapproved.js

# Optional: Export database again to compare
node scripts/whitelist-cleanup/export-prod-whitelists.js
```

---

### Quick Analysis (Read-Only)

If you just want to see the current state without modifying anything:

```bash
# See all entries categorized by origin
node scripts/whitelist-cleanup/analyze-whitelist-origins.js

# See revoked and unapproved entries
node scripts/whitelist-cleanup/analyze-revoked-unapproved.js

# Export current database state
node scripts/whitelist-cleanup/export-prod-whitelists.js
```

---

### Identify Expired Entries

To find and remove only expired entries (not a full cleanup):

```bash
# Identify expired entries
node scripts/whitelist-cleanup/identify-migration-entries.js

# Review migration-output/expired-entries-to-remove.json
# Review migration-output/remove-expired-entries.sql

# Execute the SQL manually after review
# (script does not modify database)
```

---

## Output Files

All scripts output to `migration-output/` directory (auto-created).

**File naming conventions:**
- `*.json` - Data exports in JSON format
- `*.sql` - SQL statements (usually commented for safety)
- `*-summary.txt` - Human-readable summary reports

**Common output files:**
- BattleMetrics exports: `battlemetrics-donations-full.*`
- Production exports: `prod-whitelists-*`
- Comparisons: `comparison-*`
- Analysis: `imported-entries.json`, `bot-created-entries.json`, etc.
- SQL statements: `remove-*.sql`, `fix-*.sql`

---

## Safety Notes

### ALWAYS DO BEFORE RUNNING DESTRUCTIVE OPERATIONS:

1. **Database Backup**
   - Full database backup before any DELETE/UPDATE operations
   - Verify backup is complete and restorable
   - Store backup in safe location

2. **Review Output Files**
   - Run analysis scripts first
   - Review JSON exports to verify what will be affected
   - Check SQL statements before executing

3. **Verify Environment**
   - Confirm `.env.production` points to correct database
   - Check `DB_HOST`, `DB_NAME` in script output
   - Never run on wrong environment

4. **Test on Development First**
   - If possible, test on development database
   - Verify expected behavior before production

### Scripts That Modify Database:

Only **ONE** script modifies the database:
- `delete-imported-entries.js` - DESTRUCTIVE, requires backup

All other scripts are **READ-ONLY** and safe to run.

### Commented SQL Statements:

Scripts that generate SQL (but don't execute it):
- `identify-migration-entries.js`
- `analyze-whitelist-origins.js`
- `fix-donation-source.js`

These output SQL files with DELETE/UPDATE statements **commented out**. You must manually review and uncomment them to execute.

---

## Historical Context

### The Problem (Nov 2025)

The `/migratewhitelists` command had multiple issues:
1. Wrong source field: Tagged as 'manual' instead of 'donation'
2. Wrong expiration dates: Recalculated from migration date instead of original
3. Duplicate imports: Same BattleMetrics donation imported multiple times (Sept + Nov)
4. 21,634+ corrupted entries in database

### The Solution

1. Created analysis scripts to understand the problem
2. Identified ALL imported entries via `battlemetricsId` in metadata
3. Categorized entries: imported (remove) vs bot-created (keep) vs role-based (keep)
4. Backed up database
5. Deleted all 21,634 imported entries
6. Preserved 858 legitimate entries (bot-created + role-based)
7. Removed the `/migratewhitelists` command

### Results

- Database reduced from 22,492 to 858 entries (96% cleanup)
- 0 imported entries remaining (100% cleanup success)
- 770 active legitimate entries preserved
- No data loss for bot-created or role-based entries

---

## Future Use

These scripts can be reused for:
- Database cleanup after future migration issues
- Analyzing whitelist entry origins
- Identifying duplicate or corrupted entries
- Comparing BattleMetrics with production database
- Removing expired entries
- Auditing security blocks and revocations

**Recommendation:** Keep these scripts in the repository for future database maintenance needs.
