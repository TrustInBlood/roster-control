const { handleRevoke } = require('../../../../../src/commands/whitelist/handlers/revokeHandler');
const { mockInteraction } = require('../../../../mocks/discord');

// Mock dependencies
jest.mock('../../../../../src/database/models', () => require('../../../../mocks/database'));
jest.mock('../../../../../src/utils/logger', () => require('../../../../mocks/utils'));
jest.mock('../../../../../src/utils/messageHandler', () => require('../../../../mocks/utils'));
jest.mock('../../../../../src/commands/whitelist/utils/userResolution');
jest.mock('../../../../../config/discord', () => ({
  WHITELIST_AWARD_ROLES: {
    SERVICE_MEMBER: '555444333222111001',
    DONATOR: '555444333222111002',
    FIRST_RESPONDER: '555444333222111003'
  }
}), { virtual: true });

const { resolveUserForInfo } = require('../../../../../src/commands/whitelist/utils/userResolution');
const { Whitelist } = require('../../../../../src/database/models');
const { withLoadingMessage, sendSuccess } = require('../../../../../src/utils/messageHandler');

describe('revokeHandler', () => {
  let interaction;

  beforeEach(() => {
    jest.clearAllMocks();
    interaction = {
      ...mockInteraction,
      options: {
        getUser: jest.fn(),
        getString: jest.fn(),
        getSubcommand: jest.fn().mockReturnValue('revoke')
      }
    };
  });

  it('should handle successful whitelist revocation with Discord user', async () => {
    const discordUser = { id: '123456789', tag: 'testuser#1234' };
    const steamId = '76561198000000000';
    const reason = 'Violation of rules';

    interaction.options.getUser.mockReturnValue(discordUser);
    interaction.options.getString.mockImplementation((option) => {
      if (option === 'steamid') return steamId;
      if (option === 'reason') return reason;
      return null;
    });

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: discordUser
    });

    Whitelist.revokeWhitelist.mockResolvedValue(2); // 2 entries revoked

    // Mock whitelist status check
    Whitelist.getActiveWhitelistForUser.mockResolvedValue({
      hasWhitelist: false // No active whitelist entries remain
    });

    // Mock guild member operations
    const mockRole = { id: '555444333222111001', name: 'Service Member', permissions: [] };
    const mockMember = {
      roles: {
        cache: {
          has: jest.fn().mockImplementation((roleId) => roleId === '555444333222111001'),
          get: jest.fn().mockReturnValue(mockRole)
        },
        remove: jest.fn().mockResolvedValue(true)
      }
    };

    interaction.guild.members.fetch.mockResolvedValue(mockMember);
    interaction.guild.roles.cache.get.mockReturnValue(mockRole);

    await handleRevoke(interaction);

    expect(withLoadingMessage).toHaveBeenCalledWith(
      interaction,
      'Revoking whitelist...',
      expect.any(Function)
    );

    expect(resolveUserForInfo).toHaveBeenCalledWith(steamId, discordUser);
    expect(Whitelist.revokeWhitelist).toHaveBeenCalledWith(
      steamId,
      reason,
      interaction.user.id
    );

    expect(mockMember.roles.remove).toHaveBeenCalledWith(
      mockRole,
      `Whitelist revoked by ${interaction.user.tag}`
    );

    expect(sendSuccess).toHaveBeenCalled();
  });

  it('should handle revocation with Steam ID only', async () => {
    const steamId = '76561198000000000';
    const reason = 'Account suspended';

    interaction.options.getUser.mockReturnValue(null);
    interaction.options.getString.mockImplementation((option) => {
      if (option === 'steamid') return steamId;
      if (option === 'reason') return reason;
      return null;
    });

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: null
    });

    Whitelist.revokeWhitelist.mockResolvedValue(1);
    Whitelist.getActiveWhitelistForUser.mockResolvedValue({
      hasWhitelist: false
    });

    await handleRevoke(interaction);

    expect(resolveUserForInfo).toHaveBeenCalledWith(steamId, null);
    expect(Whitelist.revokeWhitelist).toHaveBeenCalledWith(
      steamId,
      reason,
      interaction.user.id
    );
  });

  it('should handle revocation with default reason', async () => {
    const steamId = '76561198000000000';

    interaction.options.getUser.mockReturnValue(null);
    interaction.options.getString.mockImplementation((option) => {
      if (option === 'steamid') return steamId;
      if (option === 'reason') return null;
      return null;
    });

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: null
    });

    Whitelist.revokeWhitelist.mockResolvedValue(1);
    Whitelist.getActiveWhitelistForUser.mockResolvedValue({
      hasWhitelist: false
    });

    await handleRevoke(interaction);

    expect(Whitelist.revokeWhitelist).toHaveBeenCalledWith(
      steamId,
      'No reason provided',
      interaction.user.id
    );
  });

  it('should handle case where user still has active whitelists (no role removal)', async () => {
    const discordUser = { id: '123456789', tag: 'testuser#1234' };
    const steamId = '76561198000000000';

    interaction.options.getUser.mockReturnValue(discordUser);
    interaction.options.getString.mockImplementation((option) => {
      if (option === 'steamid') return steamId;
      if (option === 'reason') return 'Test revocation';
      return null;
    });

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: discordUser
    });

    Whitelist.revokeWhitelist.mockResolvedValue(1);

    // User still has active whitelist entries
    Whitelist.getActiveWhitelistForUser.mockResolvedValue({
      hasWhitelist: true
    });

    const mockMember = {
      roles: {
        cache: new Map(),
        remove: jest.fn()
      }
    };

    interaction.guild.members.fetch.mockResolvedValue(mockMember);

    await handleRevoke(interaction);

    // Should not remove roles since user still has active whitelists
    expect(mockMember.roles.remove).not.toHaveBeenCalled();
  });

  it('should handle error when no Steam ID found', async () => {
    const discordUser = { id: '123456789', tag: 'testuser#1234' };

    interaction.options.getUser.mockReturnValue(discordUser);
    interaction.options.getString.mockReturnValue(null);

    resolveUserForInfo.mockResolvedValue({
      steamid64: null, // No Steam ID found
      discordUser: discordUser
    });

    await handleRevoke(interaction);

    expect(withLoadingMessage).toHaveBeenCalledWith(
      interaction,
      'Revoking whitelist...',
      expect.any(Function)
    );
  });

  it('should handle error when no active whitelist entries found', async () => {
    const steamId = '76561198000000000';

    interaction.options.getUser.mockReturnValue(null);
    interaction.options.getString.mockImplementation((option) => {
      if (option === 'steamid') return steamId;
      if (option === 'reason') return null;
      return null;
    });

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: null
    });

    Whitelist.revokeWhitelist.mockResolvedValue(0); // No entries revoked

    await handleRevoke(interaction);

    expect(withLoadingMessage).toHaveBeenCalledWith(
      interaction,
      'Revoking whitelist...',
      expect.any(Function)
    );
    expect(Whitelist.revokeWhitelist).toHaveBeenCalledWith(
      steamId,
      'No reason provided',
      interaction.user.id
    );
  });

  it('should handle role removal failures gracefully', async () => {
    const discordUser = { id: '123456789', tag: 'testuser#1234' };
    const steamId = '76561198000000000';

    interaction.options.getUser.mockReturnValue(discordUser);
    interaction.options.getString.mockImplementation((option) => {
      if (option === 'steamid') return steamId;
      if (option === 'reason') return 'Test';
      return null;
    });

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: discordUser
    });

    Whitelist.revokeWhitelist.mockResolvedValue(1);
    Whitelist.getActiveWhitelistForUser.mockResolvedValue({
      hasWhitelist: false
    });

    // Mock role removal failure
    interaction.guild.members.fetch.mockRejectedValue(new Error('Member not found'));

    await handleRevoke(interaction);

    // Should still complete successfully despite role removal failure
    expect(sendSuccess).toHaveBeenCalled();
  });

  it('should handle multiple role removals', async () => {
    const discordUser = { id: '123456789', tag: 'testuser#1234' };
    const steamId = '76561198000000000';

    interaction.options.getUser.mockReturnValue(discordUser);
    interaction.options.getString.mockImplementation((option) => {
      if (option === 'steamid') return steamId;
      if (option === 'reason') return 'Test';
      return null;
    });

    resolveUserForInfo.mockResolvedValue({
      steamid64: steamId,
      discordUser: discordUser
    });

    Whitelist.revokeWhitelist.mockResolvedValue(3);
    Whitelist.getActiveWhitelistForUser.mockResolvedValue({
      hasWhitelist: false
    });

    // Mock member with multiple whitelist roles
    const serviceMemberRole = { id: '555444333222111001', name: 'Service Member' };
    const donatorRole = { id: '555444333222111002', name: 'Donator' };

    const mockMember = {
      roles: {
        cache: {
          has: jest.fn().mockImplementation((roleId) =>
            roleId === '555444333222111001' || roleId === '555444333222111002'
          )
        },
        remove: jest.fn().mockResolvedValue(true)
      }
    };

    interaction.guild.members.fetch.mockResolvedValue(mockMember);
    interaction.guild.roles.cache.get.mockImplementation((roleId) => {
      if (roleId === '555444333222111001') return serviceMemberRole;
      if (roleId === '555444333222111002') return donatorRole;
      return null;
    });

    await handleRevoke(interaction);

    // Should remove all whitelist roles
    expect(mockMember.roles.remove).toHaveBeenCalledTimes(2);
  });

  it('should handle user resolution errors', async () => {
    const steamId = 'invalid_steamid';

    interaction.options.getUser.mockReturnValue(null);
    interaction.options.getString.mockReturnValue(steamId);

    resolveUserForInfo.mockRejectedValue(new Error('Invalid Steam ID format'));

    await handleRevoke(interaction);

    expect(withLoadingMessage).toHaveBeenCalledWith(
      interaction,
      'Revoking whitelist...',
      expect.any(Function)
    );
  });
});