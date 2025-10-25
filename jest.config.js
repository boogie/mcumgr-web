module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'js/**/*.js',
    '!js/index.js', // UI-heavy, requires full DOM mocking
  ],
  coverageThreshold: {
    global: {
      branches: 69,
      functions: 75,
      lines: 74,
      statements: 73
    }
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  globals: {
    'navigator': {}
  }
};
