/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/sql/**/*.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  maxWorkers: 1,
  testTimeout: 120000,
};
