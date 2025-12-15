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
const InteractivePostFactory = require('./InteractivePost');
const RolePermissionFactory = require('./RolePermission');
const SquadRolePermissionFactory = require('./SquadRolePermission');
const DiscordRoleGroupFactory = require('./DiscordRoleGroup');
const DiscordRoleFactory = require('./DiscordRole');
const DiscordRoleGroupMemberFactory = require('./DiscordRoleGroupMember');

const Group = GroupFactory(sequelize);
const Whitelist = WhitelistFactory(sequelize);
const PlayerDiscordLink = PlayerDiscordLinkFactory(sequelize);
const VerificationCode = VerificationCodeFactory(sequelize);
const UnlinkHistory = UnlinkHistoryFactory(sequelize);
const RoleArchive = RoleArchiveFactory(sequelize);
const InteractivePost = InteractivePostFactory(sequelize);
const RolePermission = RolePermissionFactory(sequelize);
const SquadRolePermission = SquadRolePermissionFactory(sequelize);
const DiscordRoleGroup = DiscordRoleGroupFactory(sequelize);
const DiscordRole = DiscordRoleFactory(sequelize);
const DiscordRoleGroupMember = DiscordRoleGroupMemberFactory(sequelize);

// Define associations
PlayerSession.belongsTo(Player, { foreignKey: 'player_id', as: 'player' });
Player.hasMany(PlayerSession, { foreignKey: 'player_id', as: 'sessions' });

// Discord role many-to-many associations via junction table
DiscordRole.belongsToMany(DiscordRoleGroup, {
  through: DiscordRoleGroupMember,
  foreignKey: 'role_id',
  otherKey: 'group_id',
  as: 'groups'
});
DiscordRoleGroup.belongsToMany(DiscordRole, {
  through: DiscordRoleGroupMember,
  foreignKey: 'group_id',
  otherKey: 'role_id',
  as: 'roles'
});

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
  RoleArchive,
  InteractivePost,
  RolePermission,
  SquadRolePermission,
  DiscordRoleGroup,
  DiscordRole,
  DiscordRoleGroupMember
};
