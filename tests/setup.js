require('dotenv').config({ path: '.env.test' });

// Mock console to avoid noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Mock process.exit
global.process.exit = jest.fn();

// Set test environment
process.env.NODE_ENV = 'test';