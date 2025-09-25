const { handleGrant, handleGrantSteamId, processWhitelistGrant } = require('../../../../../src/commands/whitelist/handlers/grantHandler');
const { mockInteraction } = require('../../../../mocks/discord');

// Mock dependencies
jest.mock('../../../../../src/database/models', () => require('../../../../mocks/database'));
jest.mock('../../../../../src/utils/logger', () => require('../../../../mocks/utils'));
jest.mock('../../../../../src/utils/messageHandler', () => require('../../../../mocks/utils'));
jest.mock('../../../../../src/utils/discordLogger', () => require('../../../../mocks/utils'));
jest.mock('../../../../../src/commands/whitelist/utils/userResolution');
jest.mock('../../../../../src/commands/whitelist/utils/roleHelpers', () => require('../../../../mocks/utils'));
jest.mock('../../../../../src/commands/whitelist/ui/grantComponents');

const { resolveUserInfo } = require('../../../../../src/commands/whitelist/utils/userResolution');
const { showReasonSelectionButtons } = require('../../../../../src/commands/whitelist/ui/grantComponents');
const { Whitelist } = require('../../../../../src/database/models');
const { sendError } = require('../../../../../src/utils/messageHandler');

describe('grantHandler', () => {
  let interaction;

  beforeEach(() => {
    jest.clearAllMocks();
    interaction = {
      ...mockInteraction,
      options: {
        getUser: jest.fn(),
        getString: jest.fn(),
        getSubcommand: jest.fn().mockReturnValue('grant')
      }
    };
  });

  describe('handleGrant', () => {
    it('should handle successful grant initialization', async () => {
      const discordUser = { id: '123456789', tag: 'testuser#1234' };
      const steamId = '76561198000000000';

      interaction.options.getUser.mockReturnValue(discordUser);
      interaction.options.getString.mockReturnValue(steamId);

      const mockUserInfo = {
        steamid64: steamId,
        username: 'TestPlayer',
        discord_username: 'testuser#1234'
      };

      resolveUserInfo.mockResolvedValue(mockUserInfo);
      showReasonSelectionButtons.mockResolvedValue(undefined);

      await handleGrant(interaction);

      expect(resolveUserInfo).toHaveBeenCalledWith(steamId, discordUser, true);
      expect(showReasonSelectionButtons).toHaveBeenCalledWith(interaction, {
        discordUser,
        userInfo: mockUserInfo,
        originalUser: interaction.user,
        isSteamIdOnly: false
      });
    });

    it('should handle user resolution errors', async () => {
      const discordUser = { id: '123456789', tag: 'testuser#1234' };
      const steamId = 'invalid_steamid';

      interaction.options.getUser.mockReturnValue(discordUser);
      interaction.options.getString.mockReturnValue(steamId);

      resolveUserInfo.mockRejectedValue(new Error('Invalid Steam ID format'));

      await handleGrant(interaction);

      expect(sendError).toHaveBeenCalledWith(interaction, 'Invalid Steam ID format');
      expect(showReasonSelectionButtons).not.toHaveBeenCalled();
    });
  });

  describe('handleGrantSteamId', () => {
    it('should show warning and handle confirmation for Steam ID only grant', async () => {
      const steamId = '76561198000000000';
      const username = 'TestPlayer';

      interaction.options.getString.mockImplementation((option) => {
        if (option === 'steamid') return steamId;
        if (option === 'username') return username;
        return null;
      });

      await handleGrantSteamId(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        components: expect.any(Array),
        flags: 64 // MessageFlags.Ephemeral
      });
    });

    it('should handle Steam ID only grant without username', async () => {
      const steamId = '76561198000000000';

      interaction.options.getString.mockImplementation((option) => {
        if (option === 'steamid') return steamId;
        if (option === 'username') return null;
        return null;
      });

      await handleGrantSteamId(interaction);

      expect(interaction.reply).toHaveBeenCalled();
    });

    it('should handle errors during Steam ID grant setup', async () => {
      interaction.options.getString.mockImplementation((option) => {
        if (option === 'steamid') throw new Error('Options error');
        return null;
      });

      await expect(handleGrantSteamId(interaction)).rejects.toThrow('Options error');
    });
  });

  describe('processWhitelistGrant', () => {
    it('should process successful whitelist grant', async () => {
      const grantData = {
        reason: 'service-member',
        discordUser: { id: '123456789', tag: 'testuser#1234' },
        userInfo: {
          steamid64: '76561198000000000',
          username: 'TestPlayer',
          discord_username: 'testuser#1234'
        },
        durationValue: 6,
        durationType: 'months',
        durationText: '6 months',
        originalUser: interaction.user,
        isSteamIdOnly: false
      };

      const mockWhitelistEntry = {
        id: 1,
        steamid64: grantData.userInfo.steamid64,
        reason: grantData.reason,
        expiration: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)
      };

      Whitelist.grantWhitelist.mockResolvedValue(mockWhitelistEntry);

      // Mock guild operations
      const mockMember = {
        roles: {
          cache: new Map(),
          add: jest.fn().mockResolvedValue(true)
        }
      };
      interaction.guild.members.fetch.mockResolvedValue(mockMember);

      await processWhitelistGrant(interaction, grantData);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '⏳ Processing whitelist grant...',
        embeds: [],
        components: []
      });

      expect(Whitelist.grantWhitelist).toHaveBeenCalledWith({
        steamid64: grantData.userInfo.steamid64,
        username: grantData.userInfo.username,
        discord_username: grantData.userInfo.discord_username,
        reason: grantData.reason,
        duration_value: grantData.durationValue,
        duration_type: grantData.durationType,
        granted_by: grantData.originalUser.id
      });
    });

    it('should handle Steam ID only grant (no Discord attribution)', async () => {
      const grantData = {
        reason: 'service-member',
        discordUser: null,
        userInfo: {
          steamid64: '76561198000000000',
          username: 'TestPlayer'
        },
        durationValue: 6,
        durationType: 'months',
        durationText: '6 months',
        originalUser: interaction.user,
        isSteamIdOnly: true
      };

      const mockWhitelistEntry = {
        id: 1,
        steamid64: grantData.userInfo.steamid64,
        reason: grantData.reason,
        expiration: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)
      };

      Whitelist.grantWhitelist.mockResolvedValue(mockWhitelistEntry);

      await processWhitelistGrant(interaction, grantData);

      expect(Whitelist.grantWhitelist).toHaveBeenCalledWith({
        steamid64: grantData.userInfo.steamid64,
        username: grantData.userInfo.username,
        discord_username: null, // Should be null for Steam ID only grants
        reason: grantData.reason,
        duration_value: grantData.durationValue,
        duration_type: grantData.durationType,
        granted_by: grantData.originalUser.id
      });
    });

    it('should handle role assignment during grant', async () => {
      const grantData = {
        reason: 'donator',
        discordUser: { id: '123456789', tag: 'testuser#1234' },
        userInfo: {
          steamid64: '76561198000000000',
          username: 'TestPlayer',
          discord_username: 'testuser#1234'
        },
        durationValue: 1,
        durationType: 'years',
        durationText: '1 year',
        originalUser: interaction.user,
        isSteamIdOnly: false
      };

      const mockWhitelistEntry = {
        id: 1,
        steamid64: grantData.userInfo.steamid64,
        reason: grantData.reason,
        expiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      };

      Whitelist.grantWhitelist.mockResolvedValue(mockWhitelistEntry);

      // Mock successful role assignment
      const mockRole = { id: '555444333222111000', name: 'Test Role', permissions: [] };
      const mockMember = {
        roles: {
          cache: new Map(),
          add: jest.fn().mockResolvedValue(true)
        }
      };

      interaction.guild.members.fetch.mockResolvedValue(mockMember);

      await processWhitelistGrant(interaction, grantData);

      expect(mockMember.roles.add).toHaveBeenCalledWith(
        mockRole,
        expect.stringContaining('donator whitelist granted by')
      );
    });

    it('should handle database errors during grant processing', async () => {
      const grantData = {
        reason: 'service-member',
        discordUser: { id: '123456789', tag: 'testuser#1234' },
        userInfo: {
          steamid64: '76561198000000000',
          username: 'TestPlayer'
        },
        durationValue: 6,
        durationType: 'months',
        durationText: '6 months',
        originalUser: interaction.user,
        isSteamIdOnly: false
      };

      Whitelist.grantWhitelist.mockRejectedValue(new Error('Database connection failed'));

      await processWhitelistGrant(interaction, grantData);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '❌ Failed to grant whitelist: Database connection failed',
        embeds: [],
        components: []
      });
    });

    it('should handle role assignment failures gracefully', async () => {
      const grantData = {
        reason: 'donator',
        discordUser: { id: '123456789', tag: 'testuser#1234' },
        userInfo: {
          steamid64: '76561198000000000',
          username: 'TestPlayer',
          discord_username: 'testuser#1234'
        },
        durationValue: 1,
        durationType: 'years',
        durationText: '1 year',
        originalUser: interaction.user,
        isSteamIdOnly: false
      };

      const mockWhitelistEntry = {
        id: 1,
        steamid64: grantData.userInfo.steamid64,
        reason: grantData.reason,
        expiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      };

      Whitelist.grantWhitelist.mockResolvedValue(mockWhitelistEntry);

      // Mock failed member fetch (user not in server)
      interaction.guild.members.fetch.mockRejectedValue(new Error('Unknown Member'));

      await processWhitelistGrant(interaction, grantData);

      // Should still complete the whitelist grant despite role assignment failure
      expect(Whitelist.grantWhitelist).toHaveBeenCalled();
    });
  });
});