/** @type {import('ts-jest').JestConfigWithTsJest} */
// jest.config.js

process.env.DISABLE_LOGGING = true;
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleDirectories: ['node_modules', '<rootDir>/'],
  setupFiles: ['dotenv/config'],
};
