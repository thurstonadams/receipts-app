// Jest config for pure-TS unit tests. We intentionally don't pull in
// jest-expo / @testing-library/react-native yet — those require a much
// heavier setup (RN + JSDOM + native mocks). This config only runs the
// pure logic tests under __tests__ folders and *.test.ts files.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react', esModuleInterop: true } }],
  },
  // Silence module-resolution for RN/Expo modules that pure-logic tests
  // don't actually need to execute. Individual test files can jest.mock
  // specific modules if they import files that transitively require them.
  moduleNameMapper: {
    '^react-native$': '<rootDir>/__mocks__/empty.js',
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/empty.js',
    '^expo-sharing$': '<rootDir>/__mocks__/empty.js',
    '^expo-image-manipulator$': '<rootDir>/__mocks__/empty.js',
    '^expo-print$': '<rootDir>/__mocks__/empty.js',
    '^expo-mail-composer$': '<rootDir>/__mocks__/empty.js',
    // Stub the supabase client for pure-logic tests that transitively
    // import lib/reports.ts (which pulls supabase in for its network calls
    // but exposes pure helpers we want to test).
    '\\./supabase$': '<rootDir>/__mocks__/supabase-stub.js',
  },
};
