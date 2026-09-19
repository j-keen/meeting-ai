import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'reports/**',
      'docs/**',
      'coverage/**',
      '.claude/**',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-use-before-define': ['warn', { functions: false, classes: false }],
    },
  },
  {
    files: ['api/**/*.js', 'dev-server.js', 'server.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['supabase-client.js', 'supabase-sync.js', 'supabase-auth.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        supabase: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
];
