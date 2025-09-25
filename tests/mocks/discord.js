// Mock Discord.js components for testing

const mockUser = {
  id: '123456789012345678',
  username: 'testuser',
  tag: 'testuser#1234',
  bot: false
};

const mockGuildMember = {
  id: '123456789012345678',
  user: mockUser,
  roles: {
    cache: new Map(),
    add: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(true),
    has: jest.fn().mockReturnValue(false)
  },
  guild: {
    id: '987654321098765432'
  }
};

const mockRole = {
  id: '555444333222111000',
  name: 'Test Role',
  permissions: []
};

const mockGuild = {
  id: '987654321098765432',
  name: 'Test Guild',
  members: {
    fetch: jest.fn().mockResolvedValue(mockGuildMember),
    cache: new Map()
  },
  roles: {
    cache: {
      get: jest.fn().mockReturnValue(mockRole),
      has: jest.fn().mockReturnValue(true)
    }
  }
};

const mockChannel = {
  id: '111222333444555666',
  name: 'test-channel',
  type: 0, // GUILD_TEXT
  createMessageComponentCollector: jest.fn(() => ({
    on: jest.fn(),
    stop: jest.fn()
  }))
};

const mockInteraction = {
  id: '999888777666555444',
  user: mockUser,
  guild: mockGuild,
  channel: mockChannel,
  replied: false,
  deferred: false,
  reply: jest.fn().mockResolvedValue(undefined),
  editReply: jest.fn().mockResolvedValue(undefined),
  followUp: jest.fn().mockResolvedValue(undefined),
  deferReply: jest.fn().mockResolvedValue(undefined),
  deferUpdate: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  showModal: jest.fn().mockResolvedValue(undefined),
  awaitModalSubmit: jest.fn().mockResolvedValue({
    fields: {
      getTextInputValue: jest.fn().mockReturnValue('7')
    },
    user: mockUser,
    customId: 'reporting_custom_modal',
    replied: false,
    deferred: false,
    deferUpdate: jest.fn().mockResolvedValue(undefined)
  }),
  options: {
    getUser: jest.fn().mockReturnValue(mockUser),
    getString: jest.fn().mockReturnValue('76561198000000000'),
    getSubcommand: jest.fn().mockReturnValue('info')
  },
  client: {
    user: { id: '999999999999999999' }
  }
};

const mockButtonInteraction = {
  ...mockInteraction,
  customId: 'reason_service-member',
  componentType: 2, // BUTTON
  message: {
    id: '123456789012345678'
  }
};

module.exports = {
  // Classes
  ActionRowBuilder: jest.fn(() => ({
    addComponents: jest.fn().mockReturnThis(),
    setComponents: jest.fn().mockReturnThis()
  })),
  ButtonBuilder: jest.fn(() => ({
    setCustomId: jest.fn().mockReturnThis(),
    setLabel: jest.fn().mockReturnThis(),
    setStyle: jest.fn().mockReturnThis(),
    setEmoji: jest.fn().mockReturnThis()
  })),
  ModalBuilder: jest.fn(() => ({
    setCustomId: jest.fn().mockReturnThis(),
    setTitle: jest.fn().mockReturnThis(),
    addComponents: jest.fn().mockReturnThis()
  })),
  TextInputBuilder: jest.fn(() => ({
    setCustomId: jest.fn().mockReturnThis(),
    setLabel: jest.fn().mockReturnThis(),
    setStyle: jest.fn().mockReturnThis(),
    setPlaceholder: jest.fn().mockReturnThis(),
    setRequired: jest.fn().mockReturnThis(),
    setMinLength: jest.fn().mockReturnThis(),
    setMaxLength: jest.fn().mockReturnThis()
  })),

  // Enums
  ButtonStyle: {
    Primary: 1,
    Secondary: 2,
    Success: 3,
    Danger: 4,
    Link: 5
  },
  ComponentType: {
    ActionRow: 1,
    Button: 2,
    SelectMenu: 3,
    TextInput: 4
  },
  TextInputStyle: {
    Short: 1,
    Paragraph: 2
  },
  MessageFlags: {
    Ephemeral: 64
  },

  // Mock objects
  mockUser,
  mockGuild,
  mockGuildMember,
  mockRole,
  mockChannel,
  mockInteraction,
  mockButtonInteraction
};