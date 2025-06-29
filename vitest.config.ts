/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    // Test environment - Node.js for CLI tool
    environment: 'node',

    // Setup files for global configuration
    setupFiles: ['.vitest/setup-core.mjs'],

    // Global test settings for professional CLI testing
    globals: true,
    clearMocks: true,
    restoreMocks: true,

    // File patterns for organized test structure
    include: ['.vitest/**/*.test.{mjs,ts,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.next/**',
      '.nuxt/**',
      '.vercel/**',
      'coverage/**',
      '__tests__/**' // Keep example tests separate
    ],

    // Test timeouts for CLI tool testing
    testTimeout: 30_000,
    hookTimeout: 10_000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: 'coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.config.ts',
        '**/*.config.js',
        '.vitest/**',
        'setup.sh',
        'install.sh'
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    },

    // Reporter configuration
    reporter: ['verbose', 'json'],
    outputFile: {
      json: './test-results.json'
    },

    // Setup files
    setupFiles: [],

    // Test isolation for reliable testing
    isolate: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        isolate: true
      }
    },

    // Performance and memory
    maxConcurrency: 5,
    minWorkers: 1,
    maxWorkers: 4,

    // File watching
    watchExclude: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '*.db',
      '*.sqlite*',
      '.git/**'
    ],

    // Dependencies handling
    deps: {
      external: [
        // Database dependencies that might cause issues in tests
        'sqlite3',
        'better-sqlite3'
      ]
    },

    // Environment variables for testing
    env: {
      NODE_ENV: 'test',
      CI: 'true',
      TERM_COLOR_MODE: 'dark', // Consistent color mode for tests
      DEBUG: '' // Disable debug logging in tests unless explicitly set
    },

    // Retry configuration
    retry: 2,

    // Bail on first failure in CI
    bail: process.env.CI ? 1 : 0,

    // Test isolation
    isolate: true,

    // Sequence configuration for deterministic test order
    sequence: {
      concurrent: false,
      shuffle: false,
      hooks: 'stack'
    }
  },

  // Path resolution for clean imports
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '@/services': resolve(__dirname, 'services'),
      '@/utils': resolve(__dirname, 'utils'),
      '@/shared': resolve(__dirname, 'shared'),
      '@/database': resolve(__dirname, 'database'),
      '@/engines': resolve(__dirname, 'engines'),
      '@/lib': resolve(__dirname, '.') // For compatibility
    }
  },

  // Define for compile-time constants
  define: {
    __TEST__: true,
    __DEV__: false
  }
});
