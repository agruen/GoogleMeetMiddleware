/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['**/?(*.)+(test).ts'],
  // Source files use ESM-style ".js" specifiers; map them back to the TS files.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
};
