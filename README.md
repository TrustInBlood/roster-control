# Roster Control Discord Bot

A Discord bot designed to manage player rosters for Squad game servers with real-time monitoring, whitelist management, and on-duty admin system.

## Overview

Roster Control integrates with MariaDB for persistent storage, BattleMetrics API for server/player data, and SquadJS for real-time player events. It enables server administrators to manage whitelist access, monitor player activity, enforce roster rules, and designate on-duty admins through Discord slash commands.

## Features

### Core Features
- **On-Duty Admin Management**: Manual `/onduty` and `/offduty` commands with automated triggers
- **Roster Management**: Add/remove players from whitelist with `/whitelist` commands
- **Real-Time Monitoring**: Track player join/leave events via SquadJS integration
- **Audit Logging**: Complete audit trail of all roster and admin actions
- **Role-Based Permissions**: Restrict sensitive commands to on-duty admins

### Planned Features
- **RCON Integration**: Automated kicks/bans for roster violations
- **Automated Reporting**: Daily/weekly activity summaries
- **Multi-Server Support**: Manage multiple Squad servers
- **Custom Notifications**: Alert admins of specific events

## Technology Stack

- **Node.js** with Discord.js v14
- **MariaDB** with Sequelize ORM
- **SquadJS** for Squad server integration
- **BattleMetrics API** for player data
- **Winston** for logging
- **Umzug** for database migrations

## Installation

### Prerequisites
- Node.js 18+ 
- MariaDB server
- Discord Bot Token
- BattleMetrics API Token
- Squad server with RCON access

### Setup

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd roster-control
   npm install
   ```

2. **Environment Configuration**
   
   Copy the example environment file and update it with your settings:
   
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```
   


3. **Database Setup**
   ```bash
   # Create database
   mysql -u root -p -e "CREATE DATABASE roster_control;"
   
   # Run migrations (happens automatically on startup)
   npm start
   ```

4. **Discord Bot Setup**
   - Create application at https://discord.com/developers/applications
   - Create bot and copy token to `.env`
   - Invite bot to server with appropriate permissions:
     - Send Messages
     - Use Slash Commands
     - Embed Links
     - Read Message History

## Usage

### Commands

#### Admin Management
- `/onduty <admin_id>` - Designate admin as on-duty
- `/offduty <admin_id>` - Remove admin from on-duty status

#### Roster Management
- `/whitelist add <player_id> type:<source>` - Add player to whitelist
- `/whitelist remove <player_id>` - Remove player from whitelist
- `/whitelist list` - Display current roster

#### Player Activity
- `/activity <player_id>` - Show player's recent activity

#### Utility
- `/ping` - Test bot connectivity
- `/help` - Show available commands

### Permissions

Commands are restricted based on roles and on-duty status:
- **Whitelist commands**: Require on-duty admin status
- **Admin commands**: Require admin role
- **General commands**: Available to all users

## Database Schema

### Tables
- **Players**: Player ID, Username, Roster Status, Activity History
- **Admins**: Admin ID, On-Duty Status, Duty History
- **Servers**: Server ID, Name, Connection Details
- **AuditLog**: Action tracking with timestamps and details

### Migrations
Database schema is managed through Umzug migrations that run automatically on startup. Migration files are located in `/migrations/`.

## Deployment

### Pterodactyl Panel
1. Create new Node.js application
2. Upload project files
3. Configure `.env` file
4. Set startup command: `npm start`
5. Allocate sufficient memory (recommended: 512MB+)

### Manual Deployment
```bash
# Production start
npm run start

# Development with auto-restart
npm run dev

# Development with debugger
npm run dev:debug

# Deploy commands to development servers
npm run deploy:commands:dev

# Deploy commands to production servers
npm run deploy:commands:prod
```

## Logging

Winston logging is configured with multiple levels:
- **Error**: Critical errors and exceptions
- **Warn**: Non-critical issues
- **Info**: General application flow
- **Debug**: Detailed debugging information

Logs are written to both console and file (`logs/combined.log`).

## Monitoring

### Health Checks
- Database connection status
- Discord bot connectivity
- SquadJS connection status
- BattleMetrics API availability

### Performance Metrics
- Command response times
- Database query performance
- Memory usage
- Event processing rates

## Troubleshooting

### Common Issues

**Bot not responding to commands**
- Verify Discord token and permissions
- Check bot is online in Discord
- Ensure slash commands are registered

**Database connection errors**
- Verify MariaDB is running
- Check connection credentials in `.env`
- Ensure database exists and user has permissions

**SquadJS connection issues**
- Verify Squad server RCON settings
- Check firewall rules for RCON port
- Confirm RCON password is correct

**BattleMetrics API errors**
- Verify API token is valid
- Check rate limiting (max 60 requests/minute)
- Ensure server ID is correct

### Logs Location
- Application logs: `logs/combined.log`
- Error logs: `logs/error.log`
- Database logs: Check MariaDB error log

## Development

### Project Structure
```
roster-control/
├── commands/          # Discord slash commands
├── events/            # Discord bot events
├── models/            # Sequelize database models
├── migrations/        # Database migration files
├── utils/             # Utility functions
├── logs/              # Log files
├── config/            # Configuration files
└── index.js           # Main application entry
```

### Adding Commands
1. Create command file in `/commands/`
2. Follow existing command structure
3. Register command in command handler
4. Test with `/ping` equivalent

### Database Changes
1. Create migration file in `/migrations/`
2. Update corresponding Sequelize model
3. Test migration up/down functionality
4. Document schema changes

## Security Considerations

- **Environment Variables**: Store sensitive data in `.env` (gitignored)
- **Database Access**: Use dedicated database user with minimal permissions
- **API Tokens**: Regularly rotate BattleMetrics and Discord tokens
- **RCON Security**: Restrict RCON access to trusted IPs only

## Support

For issues or questions:
1. Check logs for error details
2. Verify configuration settings
3. Test individual components (database, Discord, SquadJS)
4. Review recent changes in audit log

## License

Internal use only - not for public distribution.
