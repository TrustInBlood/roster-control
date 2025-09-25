const { handleInfo } = require('../../../../../src/commands/whitelist/handlers/infoHandler');
const { mockInteraction } = require('../../../../mocks/discord');

// Mock dependencies
jest.mock('../../../../../src/database/models', () => require('../../../../mocks/database'));
jest.mock('../../../../../src/utils/logger', () => require('../../../../mocks/utils'));
jest.mock('../../../../../src/utils/messageHandler', () => require('../../../../mocks/utils'));
jest.mock('../../../../../src/services/WhitelistAuthorityService', () => ({
  hasWhitelistAccess: jest.fn().mockResolvedValue({
    hasAccess: false,
    sources: [],
    highestPrioritySource: null
  })
}));
jest.mock('../../../../../src/utils/environment', () => ({
  getHighestPriorityGroup: jest.fn().mockReturnValue('DEFAULT')
}));
jest.mock('../../../../../src/commands/whitelist/utils/userResolution');

const { resolveUserForInfo } = require('../../../../../src/commands/whitelist/utils/userResolution');
const { Whitelist } = require('../../../../../src/database/models');
const { createResponseEmbed } = require('../../../../../src/utils/messageHandler');

describe('infoHandler', () => {
  let interaction;

  beforeEach(() => {
    jest.clearAllMocks();
    interaction = {
      ...mockInteraction,
      options: {
        getUser: jest.fn(),
        getString: jest.fn(),
        getSubcommand: jest.fn().mockReturnValue('info')
      }
    };
  });

  it('should handle successful whitelist info lookup with Discord user and Steam ID', async () => {
    const discordUser = { id: '123456789', tag: 'testuser#1234' };
    const steamId = '76561198000000000';

    interaction.options.getUser.mockReturnValue(discordUser);
    interaction.options.getString.mockReturnValue(steamId);

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: discordUser,
      hasLink: true
    });

    Whitelist.getActiveWhitelistForUser.mockResolvedValue({
      hasWhitelist: true,
      entries: [{
        reason: 'service-member',
        duration_value: 6,
        duration_type: 'months',
        expiration: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000),
        granted_by: '987654321',
        created_at: new Date()
      }],
      highestPriorityEntry: {
        reason: 'service-member',
        duration_value: 6,
        duration_type: 'months',
        expiration: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)
      }
    });

    await handleInfo(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(resolveUserForInfo).toHaveBeenCalledWith(steamId, discordUser);
    expect(Whitelist.getActiveWhitelistForUser).toHaveBeenCalledWith(steamId);
  });

  it('should handle user with no whitelist entries', async () => {
    const steamId = '76561198000000000';

    interaction.options.getUser.mockReturnValue(null);
    interaction.options.getString.mockReturnValue(steamId);

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: null,
      hasLink: false
    });

    Whitelist.getActiveWhitelistForUser.mockResolvedValue({
      hasWhitelist: false,
      entries: [],
      highestPriorityEntry: null
    });

    await handleInfo(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(resolveUserForInfo).toHaveBeenCalledWith(steamId, null);
    expect(Whitelist.getActiveWhitelistForUser).toHaveBeenCalledWith(steamId);
  });

  it('should handle Discord user only lookup', async () => {
    const discordUser = { id: '123456789', tag: 'testuser#1234' };

    interaction.options.getUser.mockReturnValue(discordUser);
    interaction.options.getString.mockReturnValue(null);

    resolveUserForInfo.mockResolvedValue({
      steamid64: '76561198000000000',
      discordUser: discordUser,
      hasLink: true
    });

    Whitelist.getActiveWhitelistForUser.mockResolvedValue({
      hasWhitelist: false,
      entries: [],
      highestPriorityEntry: null
    });

    await handleInfo(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(resolveUserForInfo).toHaveBeenCalledWith(null, discordUser);
  });

  it('should handle Steam ID only lookup', async () => {
    const steamId = '76561198000000000';

    interaction.options.getUser.mockReturnValue(null);
    interaction.options.getString.mockReturnValue(steamId);

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: null,
      hasLink: false
    });

    Whitelist.getActiveWhitelistForUser.mockResolvedValue({
      hasWhitelist: false,
      entries: [],
      highestPriorityEntry: null
    });

    await handleInfo(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(resolveUserForInfo).toHaveBeenCalledWith(steamId, null);
  });

  it('should handle error when no parameters provided', async () => {
    interaction.options.getUser.mockReturnValue(null);
    interaction.options.getString.mockReturnValue(null);

    // Should exit early without deferring
    await handleInfo(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ Please provide either a Discord user or Steam ID to check.'
    });
  });

  it('should handle accounts not linked scenario', async () => {
    const discordUser = { id: '123456789', tag: 'testuser#1234' };
    const steamId = '76561198000000000';

    interaction.options.getUser.mockReturnValue(discordUser);
    interaction.options.getString.mockReturnValue(steamId);

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: discordUser,
      accountsNotLinked: true,
      hasLink: false
    });

    await handleInfo(interaction);

    // Should complete the lookup despite accounts not being linked
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(resolveUserForInfo).toHaveBeenCalledWith(steamId, discordUser);
    expect(Whitelist.getActiveWhitelistForUser).toHaveBeenCalledWith(steamId);
  });

  it('should handle database errors gracefully', async () => {
    const steamId = '76561198000000000';

    interaction.options.getUser.mockReturnValue(null);
    interaction.options.getString.mockReturnValue(steamId);

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: null,
      hasLink: false
    });

    Whitelist.getActiveWhitelistForUser.mockRejectedValue(new Error('Database connection failed'));

    await handleInfo(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(resolveUserForInfo).toHaveBeenCalledWith(steamId, null);
  });

  it('should handle user resolution errors', async () => {
    const steamId = 'invalid_steamid';

    interaction.options.getUser.mockReturnValue(null);
    interaction.options.getString.mockReturnValue(steamId);

    resolveUserForInfo.mockRejectedValue(new Error('Invalid Steam ID format'));

    await handleInfo(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
  });

  it('should handle multiple whitelist entries correctly', async () => {
    const steamId = '76561198000000000';

    interaction.options.getUser.mockReturnValue(null);
    interaction.options.getString.mockReturnValue(steamId);

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: null,
      hasLink: false
    });

    const mockEntries = [
      {
        reason: 'service-member',
        duration_value: 6,
        duration_type: 'months',
        expiration: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000),
        granted_by: '987654321',
        created_at: new Date()
      },
      {
        reason: 'donator',
        duration_value: 1,
        duration_type: 'years',
        expiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        granted_by: '987654321',
        created_at: new Date()
      }
    ];

    Whitelist.getActiveWhitelistForUser.mockResolvedValue({
      hasWhitelist: true,
      entries: mockEntries,
      highestPriorityEntry: mockEntries[1] // Donator has higher priority
    });

    await handleInfo(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(Whitelist.getActiveWhitelistForUser).toHaveBeenCalledWith(steamId);
  });
});