module.exports = {
  root: true,
  env: {
    node: true,
    es6: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:promise/recommended',
    'plugin:import/recommended',
  ],
  plugins: ['@typescript-eslint', 'import', 'promise'],
  rules: {
    '@typescript-eslint/ban-ts-comment': 'warn',
    'import/namespace': 'off',
    'import/named': 'off',
    'import/no-unresolved': 'off',
    'import/order': [
      'warn',
      {
        pathGroups: [
          {
            pattern: 'src/**',
            group: 'parent',
            position: 'before',
          },
        ],
        groups: ['builtin', 'external', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc' /* sort in ascending order. Options: ['ignore', 'asc', 'desc'] */,
          caseInsensitive: true /* ignore case. Options: [true, false] */,
        },
      },
    ],
  },
};
