const { sequelize } = require('../../../config/database');

// Import existing models (already defined)
const Player = require('./Player');
const DutyStatusChange = require('./DutyStatusChange');
const Admin = require('./Admin');
const Server = require('./Server');
const AuditLog = require('./AuditLog');

// Import and initialize whitelist models (factory functions)
const GroupFactory = require('./Group');
const WhitelistFactory = require('./Whitelist');
const PlayerDiscordLinkFactory = require('./PlayerDiscordLink');
const VerificationCodeFactory = require('./VerificationCode');
const UnlinkHistoryFactory = require('./UnlinkHistory');

const Group = GroupFactory(sequelize);
const Whitelist = WhitelistFactory(sequelize);
const PlayerDiscordLink = PlayerDiscordLinkFactory(sequelize);
const VerificationCode = VerificationCodeFactory(sequelize);
const UnlinkHistory = UnlinkHistoryFactory(sequelize);

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
  UnlinkHistory
};
