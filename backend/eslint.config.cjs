const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // Global ignore list for vendor, build, generated, and non-backend artifacts
  {
    ignores: [
      '**/node_modules/**',
      '**/vendor/**',
      '**/coverage/**',
      '**/logs/**',
      '**/storage/**',
      '**/resources/**',
      '**/app/Http/**',
      '**/public/**',
      '**/dist/**',
      '**/build/**',
      '**/*.log',
      'vite.config.js',
      'backend-structure.txt'
    ]
  },

  // Base configuration for runtime backend CommonJS files
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-duplicate-case': 'error',
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
      'no-invalid-regexp': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': 'off',
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      'no-regex-spaces': 'off'
    }
  },

  // Dedicated configuration for Jest test files and test setup
  {
    files: [
      'tests/**/*.js',
      '__tests__/**/*.js',
      '**/*.test.js',
      '**/*.spec.js'
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.commonjs,
        ...globals.jest,
        createTestUser: 'readonly',
        __AUTH_TEST_DATABASE_URI__: 'writable'
      }
    },
    rules: {
      'no-unused-vars': 'off'
    }
  },

  // Operational scripts, seeders, and migration CLI files
  {
    files: [
      'scripts/**/*.js',
      'database/**/*.js'
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.commonjs
      }
    },
    rules: {
      'no-console': 'off'
    }
  }
];
