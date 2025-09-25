// Mock database models for testing

const mockWhitelistEntry = {
  id: 1,
  steamid64: '76561198000000000',
  username: 'TestPlayer',
  discord_username: 'testuser#1234',
  reason: 'service-member',
  duration_value: 6,
  duration_type: 'months',
  granted_by: '123456789012345678',
  created_at: new Date(),
  updated_at: new Date(),
  expiration: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000),
  is_active: true,
  revoked_at: null,
  revoked_by: null,
  revoke_reason: null
};

const mockPlayerDiscordLink = {
  id: 1,
  steamid64: '76561198000000000',
  discord_user_id: '123456789012345678',
  username: 'TestPlayer',
  discord_username: 'testuser#1234',
  link_confidence: 0.5,
  link_source: 'manual',
  verified_at: new Date(),
  created_at: new Date(),
  updated_at: new Date()
};

const mockWhitelistModel = {
  grantWhitelist: jest.fn().mockResolvedValue(mockWhitelistEntry),
  revokeWhitelist: jest.fn().mockResolvedValue(1),
  getActiveWhitelistForUser: jest.fn().mockResolvedValue({
    hasWhitelist: true,
    entries: [mockWhitelistEntry],
    highestPriorityEntry: mockWhitelistEntry
  }),
  findByPk: jest.fn().mockResolvedValue(mockWhitelistEntry),
  findOne: jest.fn().mockResolvedValue(mockWhitelistEntry),
  findAll: jest.fn().mockResolvedValue([mockWhitelistEntry])
};

const mockPlayerDiscordLinkModel = {
  findBySteamId: jest.fn().mockResolvedValue(mockPlayerDiscordLink),
  findByDiscordUserId: jest.fn().mockResolvedValue(mockPlayerDiscordLink),
  createLink: jest.fn().mockResolvedValue(mockPlayerDiscordLink),
  findOne: jest.fn().mockResolvedValue(mockPlayerDiscordLink),
  findAll: jest.fn().mockResolvedValue([mockPlayerDiscordLink])
};

const mockDatabaseManager = {
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(undefined),
  healthCheck: jest.fn().mockResolvedValue(true),
  getSequelize: jest.fn().mockReturnValue({
    config: {
      database: 'test_roster_control',
      host: 'localhost',
      port: 3306,
      username: 'test_user'
    }
  })
};

module.exports = {
  Whitelist: mockWhitelistModel,
  PlayerDiscordLink: mockPlayerDiscordLinkModel,
  databaseManager: mockDatabaseManager,
  mockWhitelistEntry,
  mockPlayerDiscordLink
};