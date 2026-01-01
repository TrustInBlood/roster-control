const { sequelize } = require('../../../config/database');

// Import existing models (already defined)
const Player = require('./Player');
const DutyStatusChange = require('./DutyStatusChange');
const Admin = require('./Admin');
const Server = require('./Server');
const AuditLog = require('./AuditLog');
const PlayerSession = require('./PlayerSession');
const SeedingSession = require('./SeedingSession');
const SeedingParticipant = require('./SeedingParticipant');

// Import new duty tracking models
const DutySession = require('./DutySession');
const { DutyTrackingConfig, DutyTrackingConfigAudit } = require('./DutyTrackingConfig');
const DutyLifetimeStats = require('./DutyLifetimeStats');

// Import seeding time tracking models
const SeedingTime = require('./SeedingTime');
const ServerSeedingSnapshot = require('./ServerSeedingSnapshot');

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
const StatsTemplateFactory = require('./StatsTemplate');
const StatsTemplateRoleMappingFactory = require('./StatsTemplateRoleMapping');
const PotentialPlayerLinkFactory = require('./PotentialPlayerLink');
const InfoPostButtonFactory = require('./InfoPostButton');

const Group = GroupFactory(sequelize);
const Whitelist = WhitelistFactory(sequelize);
const PlayerDiscordLink = PlayerDiscordLinkFactory(sequelize);
const VerificationCode = VerificationCodeFactory(sequelize);
const UnlinkHistory = UnlinkHistoryFactory(sequelize);
const RoleArchive = RoleArchiveFactory(sequelize);
const InteractivePost = InteractivePostFactory(sequelize);
const RolePermission = RolePermissionFactory(sequelize);
const SquadRolePermission = SquadRolePermissionFactory(sequelize);
const StatsTemplate = StatsTemplateFactory(sequelize);
const StatsTemplateRoleMapping = StatsTemplateRoleMappingFactory(sequelize);
const PotentialPlayerLink = PotentialPlayerLinkFactory(sequelize);
const InfoPostButton = InfoPostButtonFactory(sequelize);

// Define associations
PlayerSession.belongsTo(Player, { foreignKey: 'player_id', as: 'player' });
Player.hasMany(PlayerSession, { foreignKey: 'player_id', as: 'sessions' });

// Stats template associations
StatsTemplate.hasMany(StatsTemplateRoleMapping, { foreignKey: 'template_id', as: 'roleMappings' });
StatsTemplateRoleMapping.belongsTo(StatsTemplate, { foreignKey: 'template_id', as: 'template' });

// Seeding session associations
SeedingSession.hasMany(SeedingParticipant, { foreignKey: 'session_id', as: 'participants' });
SeedingParticipant.belongsTo(SeedingSession, { foreignKey: 'session_id', as: 'session' });
SeedingParticipant.belongsTo(Player, { foreignKey: 'player_id', as: 'player' });
Player.hasMany(SeedingParticipant, { foreignKey: 'player_id', as: 'seedingParticipations' });

// Seeding time associations
SeedingTime.belongsTo(Player, { foreignKey: 'player_id', as: 'player' });
Player.hasMany(SeedingTime, { foreignKey: 'player_id', as: 'seedingTimes' });

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
  StatsTemplate,
  StatsTemplateRoleMapping,
  SeedingSession,
  SeedingParticipant,
  DutySession,
  DutyTrackingConfig,
  DutyTrackingConfigAudit,
  DutyLifetimeStats,
  SeedingTime,
  ServerSeedingSnapshot,
  PotentialPlayerLink,
  InfoPostButton
};
