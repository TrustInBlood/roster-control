// Mock utility modules for testing

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

const mockCreateResponseEmbed = jest.fn().mockReturnValue({
  title: 'Mock Embed',
  description: 'Mock Description',
  color: 0x00ff00,
  addFields: jest.fn().mockReturnThis()
});

const mockSendError = jest.fn().mockResolvedValue(undefined);
const mockSendSuccess = jest.fn().mockResolvedValue(undefined);
const mockWithLoadingMessage = jest.fn().mockImplementation(async (interaction, message, callback) => {
  try {
    return await callback();
  } catch (error) {
    // Mock implementation that handles errors within the callback
    // In real implementation, this would send an error message to the user
    return;
  }
});

const mockLogWhitelistOperation = jest.fn().mockResolvedValue(undefined);

const mockGetRoleForReason = jest.fn().mockReturnValue('555444333222111000');

module.exports = {
  // Logger mock
  console: mockLogger,
  createServiceLogger: jest.fn().mockReturnValue(mockLogger),

  // Message handler mocks
  createResponseEmbed: mockCreateResponseEmbed,
  sendError: mockSendError,
  sendSuccess: mockSendSuccess,
  withLoadingMessage: mockWithLoadingMessage,

  // Discord logger mock
  logWhitelistOperation: mockLogWhitelistOperation,

  // Role helper mock
  getRoleForReason: mockGetRoleForReason,

  // Mock values
  mockLogger
};