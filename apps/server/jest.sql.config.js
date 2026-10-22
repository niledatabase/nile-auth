// Set this on Node's real process before Jest creates its sandboxed process.
// In particular, pg's deprecated implicit query queue must fail this suite.
process.throwDeprecation = true;

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/sql/**/*.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  maxWorkers: 1,
  testTimeout: 120000,
};
