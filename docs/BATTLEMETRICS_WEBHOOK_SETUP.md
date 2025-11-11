# BattleMetrics Webhook Setup Guide

This guide explains how to configure BattleMetrics webhooks to automatically grant temporary whitelists when specific conditions are met.

## Overview

The BattleMetrics webhook endpoint allows you to automatically add players to your Squad server whitelist for a specified duration when they meet certain conditions (e.g., subscribing to your BattleMetrics community, joining your server, etc.).

## Endpoint Information

- **URL**: `http://your-server:3001/webhook/battlemetrics/whitelist`
- **Method**: POST
- **Content-Type**: application/json

## Setup Steps

### 1. Configure Environment Variables

Add the following to your `.env` file:

```bash
# Enable authentication (recommended for production)
BATTLEMETRICS_WEBHOOK_ENABLE_TOKEN=true

# Option 1: X-Signature (RECOMMENDED)
# Set this to a secure random string and use it as "Shared Secret" in BattleMetrics
BATTLEMETRICS_WEBHOOK_SECRET=your_secure_random_string_here

# Option 2: Query Token (ALTERNATIVE)
# If using query token method, set this and append ?token=... to webhook URL
BATTLEMETRICS_WEBHOOK_TOKEN=your_secure_token_here
```

### 2. Create BattleMetrics Webhook Action

1. Go to your BattleMetrics organization settings
2. Navigate to **Triggers & Actions**
3. Create a new **Webhook** action with the following configuration:

#### Webhook Configuration

**URL**:
- **With X-Signature (recommended)**: `http://your-server:3001/webhook/battlemetrics/whitelist`
- **With Query Token**: `http://your-server:3001/webhook/battlemetrics/whitelist?token=your_secure_token_here`

**Method**: POST

**Content-Type**: application/json

**Shared Secret** (if using X-Signature): `your_secure_random_string_here` (same as `BATTLEMETRICS_WEBHOOK_SECRET`)

**Body** (JSON):
```json
{
  "steamid64": "{{player.steamID}}",
  "username": "{{player.name}}",
  "days": 30,
  "reason": "BattleMetrics subscription",
  "admin": "{{user.nickname}}"
}
```

**Note**: The `days` field supports fractional values (e.g., `2.5` for 2.5 days). Fractional days are internally converted to hours for precise storage while maintaining backwards compatibility.

#### Template Variables Explained

BattleMetrics provides these template variables for webhook payloads:

| Variable | Description | Maps To |
|----------|-------------|---------|
| `{{player.steamID}}` | Player's Steam64 ID | `steamid64` (required) |
| `{{player.name}}` | Player's in-game name | `username` (optional) |
| `{{user.nickname}}` | Admin who triggered action | `admin` (required) |
| `{{user.id}}` | Admin's BattleMetrics ID | `admin` (fallback) |

**Note**: Use `{{user.nickname}}` with a fallback to `{{user.id}}` if nickname is not set.

#### JSON Body Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `steamid64` | string | Yes | Player's Steam64 ID | `"76561198123456789"` |
| `days` | number | Yes | Duration in days (supports fractional values like 2.5) | `30` or `2.5` |
| `admin` | string | Yes | Admin identifier/name | `"BM_Admin_John"` |
| `username` | string | No | Player's in-game name | `"PlayerName"` |
| `reason` | string | No | Reason for whitelist | `"BattleMetrics subscription"` |

### 3. Create BattleMetrics Trigger

Create a trigger that activates your webhook action. Common trigger types:

#### Example: Subscription-Based Whitelist

**Trigger Type**: Player Action
**Conditions**:
- Player is online: `{{player.online}} == true`
- Player has active subscription: (check your subscription system)
- Action: Run your whitelist webhook

#### Example: Manual Admin Grant

**Trigger Type**: Manual Trigger
**Usage**: Admins can manually trigger the webhook to grant whitelist access
**Action**: Run your whitelist webhook

### 4. Test Your Webhook

You can test the webhook using curl:

```bash
# Test without authentication (if BATTLEMETRICS_WEBHOOK_ENABLE_TOKEN=false)
curl -X POST http://your-server:3001/webhook/battlemetrics/whitelist \
  -H "Content-Type: application/json" \
  -d '{
    "steamid64": "76561198123456789",
    "username": "TestPlayer",
    "days": 30,
    "reason": "Test whitelist",
    "admin": "TestAdmin"
  }'

# Test with query token
curl -X POST 'http://your-server:3001/webhook/battlemetrics/whitelist?token=your_token' \
  -H "Content-Type: application/json" \
  -d '{
    "steamid64": "76561198123456789",
    "username": "TestPlayer",
    "days": 30,
    "reason": "Test whitelist",
    "admin": "TestAdmin"
  }'

# Test with fractional days (2.5 days)
curl -X POST 'http://your-server:3001/webhook/battlemetrics/whitelist?token=your_token' \
  -H "Content-Type: application/json" \
  -d '{
    "steamid64": "76561198123456789",
    "username": "TestPlayer",
    "days": 2.5,
    "reason": "Trial access",
    "admin": "TestAdmin"
  }'

# Test health check
curl http://your-server:3001/webhook/battlemetrics/health
```

## Authentication Methods

### Method 1: X-Signature (HMAC-SHA256) - RECOMMENDED

This is the most secure method. BattleMetrics signs each request with HMAC-SHA256.

**Pros**:
- Cryptographically secure
- No secrets in URLs (can't be logged accidentally)
- BattleMetrics native support

**Setup**:
1. Set `BATTLEMETRICS_WEBHOOK_SECRET` in your `.env`
2. Use the same value as "Shared Secret" in BattleMetrics webhook configuration
3. BattleMetrics will send `X-Signature` header with each request
4. Server validates the signature matches the expected HMAC-SHA256 hash

### Method 2: Query Token - ALTERNATIVE

Simpler but less secure. Token is passed in the URL query string.

**Pros**:
- Simple to set up
- Easy to test
- No BattleMetrics signature configuration needed

**Cons**:
- Token visible in URLs (can appear in logs)
- Less secure than HMAC signatures

**Setup**:
1. Set `BATTLEMETRICS_WEBHOOK_TOKEN` in your `.env`
2. Append `?token=your_token` to your webhook URL

## Response Format

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Whitelist granted",
  "steamid64": "76561198123456789",
  "expirationDate": "2025-11-28T06:45:10.551Z",
  "daysGranted": 30
}
```

### Error Responses

**401 Unauthorized** - Invalid or missing authentication:
```json
{
  "error": "Unauthorized"
}
```

**400 Bad Request** - Missing required fields:
```json
{
  "error": "Missing required field: steamid64"
}
```

**400 Bad Request** - Invalid Steam ID format:
```json
{
  "error": "Invalid Steam ID format"
}
```

**400 Bad Request** - Invalid days value:
```json
{
  "error": "Invalid days value. Must be a positive number."
}
```

## How Whitelist Entries Work

1. **Database Storage**: Each webhook request creates a new whitelist entry in the database
2. **Fractional Days**: Days are internally converted to hours for precise storage (e.g., 2.5 days = 60 hours), then displayed as days in the UI
3. **Duration Stacking**: Multiple entries for the same Steam ID will stack their durations
4. **Expiration**: Entries automatically expire after the specified duration
5. **Squad Integration**: Entries are automatically included in Squad server whitelist files
6. **Audit Trail**: All entries track who granted them (admin field) and when

## Example Use Cases

### 1. Community Subscription Whitelist
Grant 30-day whitelist access to players who subscribe to your BattleMetrics community.

### 2. VIP Program
Grant extended whitelist access (90+ days) to VIP members.

### 3. Trial Access
Grant short-term access (7 days) for trial periods, or use fractional days (2.5 days) for precise control.

### 4. Event Participants
Grant temporary access (3 days) to event participants, or use fractional values like 0.5 days for 12-hour access.

### 5. Manual Admin Grants
Allow admins to manually trigger whitelist grants through BattleMetrics interface.

## Troubleshooting

### Webhook Not Working

1. **Check authentication**: Verify `BATTLEMETRICS_WEBHOOK_ENABLE_TOKEN` and token/secret are configured correctly
2. **Check logs**: Look for `BattleMetricsWebhook` service logs in your application
3. **Test health endpoint**: `curl http://your-server:3001/webhook/battlemetrics/health`
4. **Verify firewall**: Ensure port 3001 is accessible from BattleMetrics IPs

### Invalid Signature Errors

1. Ensure `BATTLEMETRICS_WEBHOOK_SECRET` matches your BattleMetrics "Shared Secret" exactly
2. Check that Content-Type is `application/json`
3. Verify the webhook is sending the `X-Signature` header

### Steam ID Validation Fails

1. Ensure Steam ID is 17 digits starting with "765"
2. Use `{{player.steamID}}` template variable in BattleMetrics, not `{{player.id}}`
3. Steam ID must be Steam64 format, not SteamID3 or other formats

## Security Best Practices

1. **Always enable authentication** in production (`BATTLEMETRICS_WEBHOOK_ENABLE_TOKEN=true`)
2. **Use X-Signature method** when possible (more secure than query tokens)
3. **Use strong secrets**: Generate cryptographically secure random strings for tokens/secrets
4. **Monitor logs**: Watch for unauthorized webhook attempts
5. **Firewall rules**: Restrict webhook endpoint to BattleMetrics IP ranges if possible
6. **HTTPS**: Use HTTPS in production (configure reverse proxy like nginx)

## Additional Resources

- [BattleMetrics Webhook Documentation](https://www.battlemetrics.com/developers/documentation#link-POST-trigger-/triggers/-trigger_identifier-/test)
- [BattleMetrics Template Variables](https://www.battlemetrics.com/developers/documentation#template-variables)
- [Discord Bot Setup Guide](../README.md)
