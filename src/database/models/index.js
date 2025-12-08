const { sequelize } = require('../../../config/database');

// Import existing models (already defined)
const Player = require('./Player');
const DutyStatusChange = require('./DutyStatusChange');
const Admin = require('./Admin');
const Server = require('./Server');
const AuditLog = require('./AuditLog');
const PlayerSession = require('./PlayerSession');

// Import and initialize whitelist models (factory functions)
const GroupFactory = require('./Group');
const WhitelistFactory = require('./Whitelist');
const PlayerDiscordLinkFactory = require('./PlayerDiscordLink');
const VerificationCodeFactory = require('./VerificationCode');
const UnlinkHistoryFactory = require('./UnlinkHistory');
const RoleArchiveFactory = require('./RoleArchive');

const Group = GroupFactory(sequelize);
const Whitelist = WhitelistFactory(sequelize);
const PlayerDiscordLink = PlayerDiscordLinkFactory(sequelize);
const VerificationCode = VerificationCodeFactory(sequelize);
const UnlinkHistory = UnlinkHistoryFactory(sequelize);
const RoleArchive = RoleArchiveFactory(sequelize);

// Define associations
PlayerSession.belongsTo(Player, { foreignKey: 'player_id', as: 'player' });
Player.hasMany(PlayerSession, { foreignKey: 'player_id', as: 'sessions' });

// Export all models
module.exports = {
  Player,
  DutyStatusChange,
  Admin,
  Server,
  AuditLog,
  Group,
  Whitelist,
  PlayerDiscordLink,
  VerificationCode,
  UnlinkHistory,
  PlayerSession,
  RoleArchive
};
