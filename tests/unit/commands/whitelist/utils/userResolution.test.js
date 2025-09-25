const { resolveUserInfo, resolveUserForInfo } = require('../../../../../src/commands/whitelist/utils/userResolution');

// Mock dependencies
jest.mock('../../../../../src/database/models', () => require('../../../../mocks/database'));
jest.mock('../../../../../src/utils/logger', () => require('../../../../mocks/utils'));
jest.mock('../../../../../src/utils/accountLinking', () => ({
  getUserInfo: jest.fn(),
  createOrUpdateLink: jest.fn().mockResolvedValue({ created: true, error: false }),
  resolveSteamIdFromDiscord: jest.fn().mockResolvedValue('76561198000000000')
}));
jest.mock('../../../../../src/utils/steamId', () => ({
  isValidSteamId: jest.fn().mockImplementation((steamId) => {
    if (!steamId || typeof steamId !== 'string') return false;
    if (steamId.length !== 17) return false;
    if (!/^\d+$/.test(steamId)) return false;
    if (!steamId.startsWith('7656119')) return false;
    const steamIdNum = BigInt(steamId); // Use BigInt for large number comparison
    const minSteamId = BigInt('76561197960265728');
    const maxSteamId = BigInt('76561198999999999');
    return steamIdNum >= minSteamId && steamIdNum <= maxSteamId;
  })
}));
jest.mock('../../../../../src/services/NotificationService', () => ({
  notifyAccountLink: jest.fn().mockResolvedValue(undefined)
}));

const { getUserInfo } = require('../../../../../src/utils/accountLinking');
const { Whitelist, PlayerDiscordLink } = require('../../../../../src/database/models');

describe('userResolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveUserInfo', () => {
    it('should resolve user info with valid Steam ID and Discord user', async () => {
      const discordUser = { id: '123456789', username: 'testuser', discriminator: '1234', displayName: 'TestPlayer' };

      const result = await resolveUserInfo('76561198000000000', discordUser, true);

      expect(result).toEqual({
        steamid64: '76561198000000000',
        username: 'TestPlayer',
        discord_username: 'testuser#1234',
        linkedAccount: 'created'
      });
    });

    it('should throw error with invalid Steam ID format', async () => {
      await expect(
        resolveUserInfo('invalid_steamid', null, false)
      ).rejects.toThrow('Invalid Steam ID format');

      expect(getUserInfo).not.toHaveBeenCalled();
    });

    it('should handle Steam ID only resolution', async () => {
      const result = await resolveUserInfo('76561198000000000', null, false);

      expect(result).toEqual({
        steamid64: '76561198000000000',
        username: null,
        discord_username: null,
        linkedAccount: false
      });
    });

    it('should handle linking failures gracefully', async () => {
      const { createOrUpdateLink } = require('../../../../../src/utils/accountLinking');
      createOrUpdateLink.mockResolvedValue({ error: true, message: 'Link failed' });

      const discordUser = { id: '123456789', username: 'testuser', discriminator: '1234', displayName: 'TestPlayer' };

      const result = await resolveUserInfo('76561198000000000', discordUser, true);

      expect(result).toEqual({
        steamid64: '76561198000000000',
        username: 'TestPlayer',
        discord_username: 'testuser#1234',
        linkedAccount: 'failed'
      });
    });
  });

  describe('resolveUserForInfo', () => {
    it('should resolve with Steam ID when provided', async () => {
      getUserInfo.mockResolvedValue({
        steamid64: '76561198000000000',
        username: 'TestPlayer',
        discordUserId: null,
        hasLink: false
      });

      const result = await resolveUserForInfo('76561198000000000', null);

      expect(result.steamid64).toBe('76561198000000000');
      expect(getUserInfo).toHaveBeenCalledWith({
        discordUserId: undefined,
        steamid64: '76561198000000000',
        username: undefined
      });
    });

    it('should resolve with Discord user when provided', async () => {
      getUserInfo.mockResolvedValue({
        steamid64: null,
        username: 'TestUser',
        discordUserId: '123456789',
        hasLink: false
      });

      const discordUser = { id: '123456789', username: 'testuser' };
      const result = await resolveUserForInfo(null, discordUser);

      expect(result.discordUser).toEqual(discordUser);
      expect(result.steamid64).toBeNull();
    });

    it('should handle both parameters provided', async () => {
      getUserInfo.mockResolvedValue({
        steamid64: '76561198000000000',
        username: 'TestUser',
        discordUserId: '123456789',
        hasLink: true
      });

      const discordUser = { id: '123456789', username: 'testuser' };
      const result = await resolveUserForInfo('76561198000000000', discordUser);

      expect(result.steamid64).toBe('76561198000000000');
      expect(result.discordUser).toEqual(discordUser);
    });

    it('should throw error when no parameters provided', async () => {
      await expect(
        resolveUserForInfo(null, null)
      ).rejects.toThrow('Please provide either a Discord user or Steam ID to check.');
    });

    it('should handle getUserInfo errors', async () => {
      getUserInfo.mockRejectedValue(new Error('Database error'));

      await expect(
        resolveUserForInfo('76561198000000000', null)
      ).rejects.toThrow('Database error');
    });
  });

  describe('Steam ID validation', () => {
    const validSteamIds = [
      '76561198000000000',
      '76561198999999999',
      '76561197960265728'  // First Steam ID
    ];

    const invalidSteamIds = [
      '123456789',         // Too short
      '76561198000000000123', // Too long
      'abcdefghijk',       // Not numeric
      '76561199000000000', // Outside valid range (too high)
      '76561196000000000', // Wrong prefix (doesn't start with 7656119)
      '76561197960265727', // Outside valid range (too low)
      null,
      undefined,
      ''
    ];

    validSteamIds.forEach(steamId => {
      it(`should accept valid Steam ID: ${steamId}`, async () => {
        // Verify the mock steamId validator would accept this ID
        const { isValidSteamId } = require('../../../../../src/utils/steamId');
        expect(isValidSteamId(steamId)).toBe(true);

        const mockUserInfo = {
          steamid64: steamId,
          username: 'TestPlayer'
        };

        getUserInfo.mockResolvedValue(mockUserInfo);

        const result = await resolveUserInfo(steamId, null, false);
        expect(result.steamid64).toBe(steamId);
      });
    });

    invalidSteamIds.forEach(steamId => {
      it(`should reject invalid Steam ID: ${steamId}`, async () => {
        // Verify the mock steamId validator would reject this ID
        const { isValidSteamId } = require('../../../../../src/utils/steamId');
        expect(isValidSteamId(steamId)).toBe(false);

        await expect(
          resolveUserInfo(steamId, null, false)
        ).rejects.toThrow('Invalid Steam ID format');
      });
    });
  });
});