module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: './',
  moduleNameMapper: {
    '^src/(.*)': ['<rootDir>/src/$1'],
    '^test/(.*)': ['<rootDir>/test/$1'],
  },
  testRegex: '.*\\..*spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  globalSetup: './test/globalSetup.ts',
  globalTeardown: './test/globalTeardown.ts',
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: 'coverage/',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },
};
