module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: './',
  moduleNameMapper: {
    '^src/(.*)': ['<rootDir>/src/$1'],
    '^test/(.*)': ['<rootDir>/test/$1'],
  },
  testRegex: '.*\\..*spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { isolatedModules: true }],
  },
  globalSetup: './test/globalSetup.ts',
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: 'coverage/',
  testEnvironment: 'node',
};
