/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Global test settings
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    
    // File patterns
    include: [
      '**/*.test.ts',
      '**/*.spec.ts',
      '.vitest/**/*.test.ts'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.next/**',
      '.nuxt/**',
      '.vercel/**',
      'coverage/**'
    ],
    
    // Test timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
    
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
    
    // Workers and concurrency
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
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
      DEBUG: '', // Disable debug logging in tests unless explicitly set
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
  
  // Path resolution
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '@services': resolve(__dirname, 'services'),
      '@utils': resolve(__dirname, 'utils'),
      '@shared': resolve(__dirname, 'shared'),
      '@database': resolve(__dirname, 'database'),
      '@engines': resolve(__dirname, 'engines')
    }
  },
  
  // Define for compile-time constants
  define: {
    __TEST__: true,
    __DEV__: false
  }
});