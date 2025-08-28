# Whitelist Integration Guide

This document explains how to integrate the whitelist functionality into your existing roster-control project.

## Integration Steps

### 1. Add to src/index.js

Add the following code to your main src/index.js file:

```javascript
// Import whitelist integration
const { setupWhitelistRoutes } = require('./services/WhitelistIntegration');

// After your existing Discord client setup and database initialization:
async function initializeWhitelist() {
  try {
    // Setup HTTP server if not already exists
    const express = require('express');
    const app = express();
    
    // Setup whitelist routes and services
    const whitelistServices = await setupWhitelistRoutes(
      app, 
      sequelize, 
      logger, 
      client
    );

    // Start HTTP server
    const port = whitelistServices.config.http.port;
    const host = whitelistServices.config.http.host;
    
    app.listen(port, host, () => {
      logger.info(`Whitelist HTTP server listening on ${host}:${port}`);
    });

    logger.info('Whitelist integration initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize whitelist integration', { error: error.message });
  }
}

// Call this after your Discord client is ready
client.once('ready', async () => {
  // ... your existing ready handler code ...
  
  // Initialize whitelist functionality
  await initializeWhitelist();
});
```

### 2. Environment Variables

The configuration is now managed through `config/whitelist.js`. Add these variables to your .env file:

```bash
# HTTP Server Configuration
HTTP_PORT=3001
HTTP_HOST=0.0.0.0

# Whitelist Endpoint Paths
WHITELIST_STAFF_PATH=/staff
WHITELIST_GENERAL_PATH=/whitelist

# Cache Configuration  
WHITELIST_CACHE_REFRESH_SECONDS=60
WHITELIST_LOG_CONNECTIONS=true
WHITELIST_LOG_CACHE_HITS=false

# Identifier Preferences
WHITELIST_PREFER_EOSID=true

# Multiple SquadJS Server Configuration
SQUADJS_SERVER1_NAME=Squad Server 1
SQUADJS_SERVER1_HOST=localhost
SQUADJS_SERVER1_PORT=3000
SQUADJS_SERVER1_TOKEN=your_token_here
SQUADJS_SERVER1_ENABLED=true

SQUADJS_SERVER2_NAME=Squad Server 2
SQUADJS_SERVER2_HOST=localhost
SQUADJS_SERVER2_PORT=3001
SQUADJS_SERVER2_TOKEN=your_token_here
SQUADJS_SERVER2_ENABLED=false

# ... up to SQUADJS_SERVER5_* for 5 servers total

# Logging Configuration
LOG_LEVEL=info
```

### 3. Deploy Slash Commands

Run the following command to deploy the new slash commands:

```bash
npm run deploy:commands:dev
```

## Database Schema

The integration creates these tables automatically via migrations:

- **groups** - Group definitions with permissions
- **whitelists** - Whitelist entries with Steam/EOS IDs
- **player_discord_links** - Links between Discord users and game accounts
- **verification_codes** - Temporary codes for account linking
- **unlink_history** - Audit trail of unlinked accounts

## API Endpoints

Once integrated, these endpoints will be available:

- `GET /staff` - Staff whitelist in Squad format
- `GET /whitelist` - General whitelist in Squad format

## Discord Commands

Two new slash commands will be available:

- `/linkid` - Generate verification code for account linking
- `/unlink` - Remove account link

## Squad Integration

Configure your Squad servers to pull whitelists from:
- Staff: `http://your-server:3001/staff`
- General: `http://your-server:3001/whitelist`

## Usage Flow

1. User runs `/linkid` in Discord
2. User types the 6-character code in Squad game chat
3. SquadJS detects the code and links the accounts
4. Discord user receives confirmation
5. Whitelist entries are updated with Discord username
6. Squad server automatically pulls updated whitelist

## Configuration Options

All configuration is managed through `config/whitelist.js`:

- **http.port/host**: HTTP server binding (default: 3001/0.0.0.0)
- **cache.refreshSeconds**: How often to refresh whitelist cache (default: 60)
- **identifiers.preferEosID**: Use EOS ID over Steam ID when available (default: false)  
- **paths.staff/whitelist**: Custom paths for whitelist endpoints
- **verification.codeLength**: Length of verification codes (default: 6)
- **verification.expirationMinutes**: Code expiration time (default: 5)
- **squadjs.servers**: Array of SquadJS server configurations
- **logging.logConnections**: Log HTTP requests (default: true)
- **logging.logCacheHits**: Log cache hits for debugging (default: false)

## Security Notes

- Verification codes expire after 5 minutes
- Only approved whitelist entries are served
- All account linking actions are logged
- Sensitive tokens are not logged

## Troubleshooting

- Check logs for SquadJS connection issues
- Ensure database migrations have run
- Verify Discord bot permissions for slash commands
- Test endpoints manually via browser/curl