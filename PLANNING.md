# Roster Control Discord Bot – Project Planning Document

## Project Overview
Roster Control is a Discord bot designed to manage player rosters for Squad game servers. It integrates with MariaDB for persistent data storage, the BattleMetrics API for server and player information, and Socket.IO for real-time player events. The bot enables server administrators to manage whitelist access, monitor player activity, enforce roster rules, and designate on-duty admins via manual commands and automated processes. Deployed within a Pterodactyl server environment, it performs automated database migrations on startup for scalability and ease of use.

---

## Goals
- Enable designation and management of on-duty administrators through manual Discord commands and automated triggers.
- Provide a streamlined interface for managing whitelists and rosters via Discord slash commands.
- Track player activity in real time using BattleMetrics API and Socket.IO data.
- Log roster actions for auditing purposes.
- Support future RCON integration for automated rule enforcement (e.g., kicks).
- Ensure easy setup and minimal maintenance for server administrators.

---

## Architecture

### Components
1. **Discord Bot**:
   - Built with Discord.js v14 for slash commands and event handling.
   - Modular command and event structure.
   - Winston-based logging for auditing and debugging.
2. **On-Duty Admin System**:
   - Manages on-duty admin status via manual commands (e.g., `/onduty`, `/offduty`) and automated triggers (e.g., time-based or event-driven).
   - Tracks admin activity and permissions.
3. **Database Layer**:
   - MariaDB with Sequelize ORM for data persistence.
   - Automated migrations using Umzug on startup.
   - Connection pooling and error handling.
4. **BattleMetrics Integration**:
   - Uses `node-fetch` to query server and player data.
   - Implements bearer token authentication and rate-limiting handling.
5. **Socket Listener**:
   - Employs `socket.io-client` for real-time player join/leave events.
   - Includes auto-reconnection logic for reliability.
6. **Command Handler**:
   - Processes slash commands for roster, whitelist, and admin management.
   - Supports role-based permissions.

### Technology Stack
- **Language**: JavaScript (Node.js)
- **Discord Integration**: Discord.js v14
- **Database**: MariaDB with Sequelize ORM
- **BattleMetrics API**: `node-fetch`
- **Real-Time Events**: `socket.io-client`
- **Logging**: Winston
- **Configuration**: `dotenv` for environment variables
- **Deployment**: Pterodactyl panel with npm lifecycle scripts
- **Migrations**: Umzug for database schema management

---

## Features

### Core Features (Minimum Viable Product)
- **On-Duty Admin Management**:
  - Manual commands: `/onduty <admin_id>` to designate an admin as on-duty, `/offduty <admin_id>` to remove status.
  - Automated triggers: Configurable rules (e.g., auto-assign on-duty status based on server events or schedules).
  - Logs on-duty status changes and admin actions in the database.
  - Restricts certain commands (e.g., whitelist modifications) to on-duty admins.
- **Roster Management**:
  - Slash commands: `/whitelist add <player_id> type:<source>` and `/whitelist remove <player_id>` for roster management.
  - Supports multiple sources (e.g., BattleMetrics, manual input).
- **Player Activity Tracking**:
  - Real-time monitoring of player join/leave events via Socket.IO.
  - Live server and player data retrieval via BattleMetrics API.
- **Persistent Storage**:
  - Stores roster actions, player data, admin status, and audit logs in MariaDB.
- **Modular Structure**:
  - Extensible command and event handlers for future scalability.

### Extended Features (Planned)
- **RCON Integration**:
  - Automate kicks or bans for roster violations via RCON.
- **Automated Reporting**:
  - Generate summaries of roster and admin activity (e.g., daily reports).
- **Custom Notifications**:
  - Alert on-duty admins of specific events (e.g., unauthorized player joins).
- **Multi-Server Support**:
  - Manage rosters and admins across multiple Squad servers.

---

## Data Schema (Preliminary)

### Players Collection
- **Player ID**: Unique identifier (e.g., Steam ID or BattleMetrics ID).
- **Username**: Current player name.
- **Roster Status**: Boolean indicating whitelist status.
- **Activity History**: Timestamps of join/leave events.
- **Audit Log**: Record of roster actions (e.g., added/removed, timestamp, admin).

### Admins Collection
- **Admin ID**: Discord ID of the administrator.
- **On-Duty Status**: Boolean indicating current duty status.
- **Duty History**: Timestamps of on-duty/off-duty transitions.
- **Actions**: Log of admin actions (e.g., whitelist changes).

### Servers Collection
- **Server ID**: Unique identifier for the Squad server.
- **Server Name**: Human-readable name.
- **Connection Details**: Host, WebSocket port, RCON credentials.
- **Roster References**: List of whitelisted player IDs.

### Audit Log Collection
- **Action ID**: Unique identifier.
- **Action Type**: Roster change, admin status update, etc.
- **Player/Admin ID**: Affected player or admin.
- **Timestamp**: Date and time.
- **Details**: Context (e.g., source type, admin performing action).

---

## Integration Points

### Discord Integration
- **Slash Commands**: Implement `/whitelist`, `/onduty`, and `/offduty` commands.
- **Event Handling**: Modular handlers for bot events (e.g., ready, errors).
- **Permissions**: Restrict commands to on-duty admins or specific roles.
- **Logging**: Log all commands and admin actions using Winston.

### BattleMetrics Integration
- **API Queries**: Fetch server status and player data with `node-fetch`.
- **Authentication**: Use bearer tokens stored in `.env`.
- **Error Handling**: Manage rate limits and API errors with retry logic.

### Squad Server Integration
- **WebSocket**: Connect via `socket.io-client` for real-time event data.
- **Event Processing**: Handle player join/leave events.
- **Reconnection**: Implement auto-reconnect with configurable retries.

---

## Deployment Strategy
- **Environment**: Deploy in Pterodactyl panel as a Node.js application.
- **Startup**:
  - Run npm scripts to install dependencies and execute Umzug migrations.
  - Load configuration from `.env`.
- **Backup**: Schedule periodic database backups via cron.
- **Monitoring**: Use Pterodactyl tools to track uptime and performance.

---

## Maintenance Plan
- **Backups**: Daily database backups to prevent data loss.
- **Monitoring**: Track bot performance and uptime via Pterodactyl.
- **Logging**: Use Winston for error and action logging.
- **Updates**: Regularly update dependencies and review API changes.

---

## Potential Challenges
- **On-Duty Admin Automation**: Ensure reliable triggers for automated on-duty status changes.
- **API Rate Limits**: Cache BattleMetrics API responses to avoid limits.
- **WebSocket Reliability**: Handle server disconnects with robust reconnection logic.
- **Data Synchronization**: Maintain consistency across BattleMetrics, Socket.IO, and MariaDB.
- **Security**: Securely store API tokens and RCON credentials.

---

## Success Metrics
- **Uptime**: Achieve 99.9% bot uptime.
- **Response Time**: Commands respond within 2 seconds.
- **Data Accuracy**: Roster and admin data match BattleMetrics and in-game stats.
- **Admin Feedback**: Positive feedback on on-duty system usability.

---

## Configuration Management

### Server Configuration
- **Storage**: Use `.env` for server details, API tokens, and database credentials.
- **Details**:
  - Squad server host, WebSocket port, RCON credentials.
  - BattleMetrics API token and server IDs.
  - MariaDB connection settings.
- **Multi-Server**: Support multiple servers with unique configurations.

### Security Considerations
- **Current**: API tokens and RCON credentials in `.env` (gitignored).
- **Future**: Explore encrypted storage or secrets management for sensitive data.

---