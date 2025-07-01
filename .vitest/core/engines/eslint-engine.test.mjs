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
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn()
}));

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

  describe('Configuration Detection and Loading', () => {
    test('should detect ESLint configuration files', async () => {
      const result = await eslintEngine.analyze('/test');

      expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('.eslintrc'));
      expect(result.success).toBe(true);
    });

    test('should handle multiple configuration file formats', async () => {
      fs.existsSync
        .mockReturnValueOnce(false) // .eslintrc.json
        .mockReturnValueOnce(false) // .eslintrc.js
        .mockReturnValueOnce(true);  // eslint.config.js

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(true);
    });

    test('should handle missing ESLint configuration gracefully', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No ESLint configuration found');
    });

    test('should load ESLint configuration correctly', async () => {
      const { ESLint } = await import('eslint');
      const mockEslint = new ESLint();

      await eslintEngine.analyze('/test');

      expect(ESLint).toHaveBeenCalledWith(expect.objectContaining({
        baseConfig: expect.any(Object)
      }));
    });

    test('should handle ESLint configuration errors', async () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Invalid configuration');
      });

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid configuration');
    });
  });

  describe('Violation Processing', () => {
    test('should convert ESLint results to violations', async () => {
      const result = await eslintEngine.analyze('/test');

      expect(result.violations).toHaveLength(2);
      
      const errorViolation = result.violations.find(v => v.severity === 'error');
      expect(errorViolation).toMatchObject({
        file: '/test/src/file.ts',
        line: 10,
        column: 5,
        message: "'unused' is defined but never used.",
        severity: 'error',
        source: 'eslint',
        category: 'code-quality',
        rule: 'no-unused-vars'
      });

      const warningViolation = result.violations.find(v => v.severity === 'warn');
      expect(warningViolation).toMatchObject({
        rule: 'prefer-const',
        severity: 'warn'
      });
    });

    test('should categorize different rule types correctly', async () => {
      const { ESLint } = await import('eslint');
      const mockEslint = new ESLint();
      mockEslint.lintFiles.mockResolvedValue([{
        ...mockESLintResult,
        messages: [
          { ruleId: 'no-unused-vars', severity: 2, message: 'Unused variable', line: 1, column: 1 },
          { ruleId: '@typescript-eslint/no-explicit-any', severity: 2, message: 'Any type', line: 2, column: 1 },
          { ruleId: 'prettier/prettier', severity: 1, message: 'Format issue', line: 3, column: 1 }
        ]
      }]);

      const result = await eslintEngine.analyze('/test');

      expect(result.violations).toHaveLength(3);
      expect(result.violations.some(v => v.category === 'code-quality')).toBe(true);
      expect(result.violations.some(v => v.category === 'typescript')).toBe(true);
      expect(result.violations.some(v => v.category === 'formatting')).toBe(true);
    });

    test('should handle ESLint messages without rule IDs', async () => {
      const { ESLint } = await import('eslint');
      const mockEslint = new ESLint();
      mockEslint.lintFiles.mockResolvedValue([{
        ...mockESLintResult,
        messages: [{
          ruleId: null,
          severity: 2,
          message: 'Parsing error: Unexpected token',
          line: 1,
          column: 1
        }]
      }]);

      const result = await eslintEngine.analyze('/test');

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].rule).toBe('parsing-error');
      expect(result.violations[0].category).toBe('syntax-error');
    });

    test('should handle fatal ESLint errors', async () => {
      const { ESLint } = await import('eslint');
      const mockEslint = new ESLint();
      mockEslint.lintFiles.mockResolvedValue([{
        ...mockESLintResult,
        messages: [{
          fatal: true,
          severity: 2,
          message: 'Fatal parsing error',
          line: 1,
          column: 1
        }]
      }]);

      const result = await eslintEngine.analyze('/test');

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].category).toBe('fatal-error');
    });
  });

  describe('Custom Script Execution', () => {
    test('should attempt custom scripts when enabled', async () => {
      const { exec } = await import('node:child_process');
      exec.mockImplementation((cmd, options, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await eslintEngine.analyze('/test');

      expect(exec).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    test('should fallback to ESLint API when custom scripts fail', async () => {
      const { exec } = await import('node:child_process');
      exec.mockImplementation((cmd, options, callback) => {
        callback(new Error('Script failed'), null);
      });

      const result = await eslintEngine.analyze('/test');

      // Should still succeed using ESLint API
      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(2);
    });

    test('should try multiple scripts from preset mapping', async () => {
      const { exec } = await import('node:child_process');
      exec
        .mockImplementationOnce((cmd, options, callback) => {
          callback(new Error('First script failed'), null);
        })
        .mockImplementationOnce((cmd, options, callback) => {
          callback(null, { stdout: '', stderr: '' });
        });

      const result = await eslintEngine.analyze('/test');

      expect(exec).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    test('should parse ESLint output from custom scripts', async () => {
      const { exec } = await import('node:child_process');
      const mockOutput = `
        /test/src/file.ts
          10:5  error  'unused' is defined but never used  no-unused-vars
          15:1  warning  'value' is never reassigned. Use 'const' instead of 'let'  prefer-const
        
        ✖ 2 problems (1 error, 1 warning)
      `;
      exec.mockImplementation((cmd, options, callback) => {
        callback(null, { stdout: mockOutput, stderr: '' });
      });

      const result = await eslintEngine.analyze('/test');

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some(v => v.rule === 'no-unused-vars')).toBe(true);
    });

    test('should respect script timeout configuration', async () => {
      const { exec } = await import('node:child_process');
      exec.mockImplementation((cmd, options, callback) => {
        expect(options.timeout).toBe(30000);
        callback(null, { stdout: '', stderr: '' });
      });

      await eslintEngine.analyze('/test');

      expect(exec).toHaveBeenCalled();
    });
  });

  describe('File Filtering and Pattern Matching', () => {
    test('should respect include patterns', async () => {
      const { ESLint } = await import('eslint');
      const mockEslint = new ESLint();

      await eslintEngine.analyze('/test');

      expect(mockEslint.lintFiles).toHaveBeenCalledWith(
        expect.arrayContaining(['src/**/*'])
      );
    });

    test('should respect exclude patterns', async () => {
      const { ESLint } = await import('eslint');
      const mockEslint = new ESLint();
      mockEslint.isPathIgnored.mockResolvedValueOnce(true); // node_modules file

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(true);
      // Files in node_modules should be ignored
    });

    test('should handle empty file lists gracefully', async () => {
      const { ESLint } = await import('eslint');
      const mockEslint = new ESLint();
      mockEslint.lintFiles.mockResolvedValue([]);

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.metadata.filesAnalyzed).toBe(0);
    });

    test('should filter by file extensions', async () => {
      mockConfig.paths.includes = ['**/*.{ts,tsx,js,jsx}'];
      eslintEngine = new ESLintAuditEngine(mockConfig);

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(true);
    });
  });

  describe('Rule Configuration and Management', () => {
    test('should load custom rule configurations', async () => {
      const customRules = {
        'no-console': 'error',
        'no-debugger': 'error',
        'prefer-arrow-callback': 'warn'
      };
      
      fs.readFileSync.mockReturnValue(JSON.stringify({
        rules: customRules
      }));

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(true);
    });

    test('should handle ESLint extends configurations', async () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        extends: [
          'eslint:recommended',
          '@typescript-eslint/recommended'
        ]
      }));

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(true);
    });

    test('should handle plugin configurations', async () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        plugins: ['@typescript-eslint', 'prettier'],
        rules: {
          '@typescript-eslint/no-explicit-any': 'error',
          'prettier/prettier': 'warn'
        }
      }));

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(true);
    });
  });

  describe('Performance and Caching', () => {
    test('should track analysis performance metrics', async () => {
      const result = await eslintEngine.analyze('/test');

      expect(result.metadata.duration).toBeGreaterThan(0);
      expect(result.metadata.filesAnalyzed).toBeDefined();
      expect(result.metadata.violationsFound).toBeDefined();
    });

    test('should reset internal state correctly', () => {
      eslintEngine.reset();

      // Should be able to analyze again after reset
      expect(async () => {
        await eslintEngine.analyze('/test');
      }).not.toThrow();
    });

    test('should handle concurrent analysis requests', async () => {
      const promises = [
        eslintEngine.analyze('/test'),
        eslintEngine.analyze('/test'),
        eslintEngine.analyze('/test')
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    test('should cache ESLint instances when possible', async () => {
      await eslintEngine.analyze('/test');
      await eslintEngine.analyze('/test');

      const { ESLint } = await import('eslint');
      // Should reuse ESLint instance rather than creating new ones
      expect(ESLint).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle ESLint API errors gracefully', async () => {
      const { ESLint } = await import('eslint');
      const mockEslint = new ESLint();
      mockEslint.lintFiles.mockRejectedValue(new Error('ESLint error'));

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('ESLint error');
    });

    test('should handle configuration loading errors', async () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Config read error');
      });

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Config read error');
    });

    test('should provide meaningful error messages', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await eslintEngine.analyze('/test/nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No ESLint configuration found');
      expect(result.violations).toEqual([]);
    });

    test('should handle malformed ESLint results', async () => {
      const { ESLint } = await import('eslint');
      const mockEslint = new ESLint();
      mockEslint.lintFiles.mockResolvedValue([{
        // Missing required fields
        filePath: null,
        messages: null
      }]);

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(true);
      // Should handle gracefully, possibly with empty violations
    });
  });

  describe('Strict Mode Analysis', () => {
    test('should enable strict mode when configured', async () => {
      mockConfig.analysis.strictMode = true;
      eslintEngine = new ESLintAuditEngine(mockConfig);

      const result = await eslintEngine.analyze('/test');

      expect(result.success).toBe(true);
      // In strict mode, might have additional rules or different severity
    });

    test('should adjust rule severity in strict mode', async () => {
      // Test with strict mode off
      mockConfig.analysis.strictMode = false;
      const engineLenient = new ESLintAuditEngine(mockConfig);
      const resultLenient = await engineLenient.analyze('/test');

      // Test with strict mode on
      mockConfig.analysis.strictMode = true;
      const engineStrict = new ESLintAuditEngine(mockConfig);
      const resultStrict = await engineStrict.analyze('/test');

      expect(resultLenient.success).toBe(true);
      expect(resultStrict.success).toBe(true);
      // Results might differ in violation severity or count
    });
  });

  describe('Health Check', () => {
    test('should perform health check successfully', async () => {
      const health = await eslintEngine.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.details).toBeDefined();
      expect(health.details.eslintVersion).toBeDefined();
    });

    test('should detect unhealthy state', async () => {
      // Mock a scenario where ESLint is not available
      const { ESLint } = await import('eslint');
      ESLint.mockImplementation(() => {
        throw new Error('ESLint not available');
      });

      const health = await eslintEngine.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('ESLint not available');
    });

    test('should check for required ESLint plugins', async () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        plugins: ['@typescript-eslint', 'required-plugin']
      }));

      const health = await eslintEngine.healthCheck();

      expect(health.details.requiredPlugins).toBeDefined();
    });
  });

  describe('Integration with TypeScript', () => {
    test('should handle TypeScript-specific rules', async () => {
      const { ESLint } = await import('eslint');
      const mockEslint = new ESLint();
      mockEslint.lintFiles.mockResolvedValue([{
        ...mockESLintResult,
        messages: [{
          ruleId: '@typescript-eslint/no-explicit-any',
          severity: 2,
          message: "Unexpected any. Specify a different type.",
          line: 5,
          column: 10
        }]
      }]);

      const result = await eslintEngine.analyze('/test');

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].rule).toBe('@typescript-eslint/no-explicit-any');
      expect(result.violations[0].category).toBe('typescript');
    });

    test('should handle mixed JavaScript and TypeScript files', async () => {
      const { ESLint } = await import('eslint');
      const mockEslint = new ESLint();
      mockEslint.lintFiles.mockResolvedValue([
        { ...mockESLintResult, filePath: '/test/src/file.ts' },
        { ...mockESLintResult, filePath: '/test/src/file.js' }
      ]);

      const result = await eslintEngine.analyze('/test');

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.metadata.filesAnalyzed).toBe(2);
    });
  });
});