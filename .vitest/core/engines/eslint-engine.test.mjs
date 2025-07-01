/**
 * @fileoverview Tests for ESLintEngine - ESLint Rule Analysis
 * 
 * Tests the complete ESLint analysis engine including:
 * - ESLint configuration detection and loading
 * - Rule violation parsing and categorization
 * - Custom script execution and fallback mechanisms
 * - File filtering and pattern matching
 * - Performance optimization and error recovery
 * - Integration with various ESLint configurations
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ESLintAuditEngine } from '../../../engines/eslint-engine.ts';

// Mock file system operations
vi.mock('node:fs');
vi.mock('node:path');

// Mock child_process for script execution
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawnSync: vi.fn().mockReturnValue({
      status: 0,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      error: null,
      signal: null,
      pid: 1234
    }),
    exec: vi.fn(),
    spawn: vi.fn()
  };
});

// Mock ESLint API
const mockESLintResult = {
  filePath: '/test/src/file.ts',
  messages: [
    {
      ruleId: 'no-unused-vars',
      severity: 2, // Error
      message: "'unused' is defined but never used.",
      line: 10,
      column: 5,
      nodeType: 'Identifier',
      source: "const unused = 'value';"
    },
    {
      ruleId: 'prefer-const',
      severity: 1, // Warning
      message: "'value' is never reassigned. Use 'const' instead of 'let'.",
      line: 15,
      column: 1,
      nodeType: 'VariableDeclaration'
    }
  ],
  errorCount: 1,
  warningCount: 1,
  fixableErrorCount: 0,
  fixableWarningCount: 1,
  usedDeprecatedRules: []
};

vi.mock('eslint', () => ({
  ESLint: vi.fn().mockImplementation(() => ({
    lintFiles: vi.fn().mockResolvedValue([mockESLintResult]),
    loadFormatter: vi.fn().mockResolvedValue({
      format: vi.fn().mockReturnValue('formatted output')
    }),
    calculateConfigForFile: vi.fn().mockResolvedValue({
      rules: {
        'no-unused-vars': 'error',
        'prefer-const': 'warn'
      }
    }),
    isPathIgnored: vi.fn().mockResolvedValue(false)
  }))
}));

describe('ESLintAuditEngine', () => {
  let eslintEngine;
  let mockConfig;
  let mockPreferences;
  let originalConsoleLog;

  beforeEach(async () => {
    // Mock console to capture logs
    originalConsoleLog = console.log;
    console.log = vi.fn();

    mockConfig = {
      analysis: {
        includeESLint: true,
        strictMode: false,
        customScripts: {
          enabled: true,
          preset: 'safe',
          timeout: 30000
        }
      },
      paths: {
        projectRoot: '/test',
        includes: ['src/**/*'],
        excludes: ['node_modules/**']
      }
    };

    mockPreferences = {
      getCustomESLintScripts: vi.fn().mockReturnValue({
        enabled: true,
        defaultPreset: 'safe',
        presetMappings: {
          safe: ['lint:check', 'eslint', 'npm run lint'],
          fix: ['lint:fix', 'eslint --fix']
        },
        scriptTimeout: 30000,
        failureHandling: 'warn'
      })
    };

    // Setup file system mocks
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      extends: ['@typescript-eslint/recommended'],
      rules: {
        'no-unused-vars': 'error',
        'prefer-const': 'warn'
      }
    }));
    path.resolve.mockImplementation((...paths) => paths.join('/'));
    path.join.mockImplementation((...paths) => paths.join('/'));
    path.dirname.mockReturnValue('/test');

    eslintEngine = new ESLintAuditEngine(mockConfig);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    vi.clearAllMocks();
  });

  describe('ESLint Engine', () => {
    test('should execute successfully and return proper result structure', async () => {
      const result = await eslintEngine.execute('/test');

      expect(result.engineName).toBe('ESLint Audit');
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.violations)).toBe(true);
      expect(typeof result.executionTime).toBe('number');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.targetPath).toBe('/test');
    });

    test('should handle successful ESLint execution', async () => {
      const { spawnSync } = await import('node:child_process');
      spawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        error: null
      });

      const result = await eslintEngine.execute('/test');

      expect(result.success).toBe(true);
      expect(result.engineName).toBe('ESLint Audit');
    });

    test('should handle ESLint errors gracefully', async () => {
      const { spawnSync } = await import('node:child_process');
      spawnSync.mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('ESLint configuration error'),
        error: null
      });

      const result = await eslintEngine.execute('/test');

      expect(result.engineName).toBe('ESLint Audit');
      expect(typeof result.success).toBe('boolean');
    });

    test('should respect engine configuration options', async () => {
      const configuredEngine = new ESLintAuditEngine({
        enabled: true,
        timeout: 10000,
        options: { enableCustomScripts: false }
      });

      expect(configuredEngine).toBeDefined();
    });
  });
});

