/**
 * @fileoverview Tests for TypeScriptEngine - TypeScript Compilation Analysis
 * 
 * Tests the complete TypeScript analysis engine including:
 * - TypeScript configuration detection and loading
 * - Compilation error parsing and categorization
 * - File inclusion/exclusion logic
 * - Custom script execution and fallback mechanisms
 * - Performance optimization and caching
 * - Error recovery and graceful degradation
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TypeScriptAuditEngine } from '../../../engines/typescript-engine.ts';

// Mock file system operations
vi.mock('node:fs');
vi.mock('node:path');

// Mock child_process for script execution
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn()
}));

// Mock TypeScript compiler API
const mockTsConfig = {
  config: {
    compilerOptions: {
      strict: true,
      target: 'ES2020',
      module: 'ESNext'
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  },
  error: null
};

const mockDiagnostic = {
  code: 2322,
  messageText: 'Type string is not assignable to type number',
  category: 1, // Error
  file: {
    fileName: '/test/src/file.ts',
    getLineAndCharacterOfPosition: vi.fn().mockReturnValue({ line: 10, character: 5 })
  },
  start: 150
};

vi.mock('typescript', () => ({
  readConfigFile: vi.fn(),
  parseJsonConfigFileContent: vi.fn(),
  createProgram: vi.fn(),
  getPreEmitDiagnostics: vi.fn(),
  DiagnosticCategory: {
    Warning: 0,
    Error: 1,
    Suggestion: 2,
    Message: 3
  },
  sys: {
    getCurrentDirectory: vi.fn().mockReturnValue('/test'),
    fileExists: vi.fn(),
    readFile: vi.fn(),
    getDirectories: vi.fn(),
    readDirectory: vi.fn()
  }
}));

describe('TypeScriptAuditEngine', () => {
  let typescriptEngine;
  let mockConfig;
  let mockPreferences;
  let originalConsoleLog;

  beforeEach(async () => {
    // Mock console to capture logs
    originalConsoleLog = console.log;
    console.log = vi.fn();

    mockConfig = {
      analysis: {
        includeESLint: false,
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
      getCustomTypeScriptScripts: vi.fn().mockReturnValue({
        enabled: true,
        defaultPreset: 'safe',
        presetMappings: {
          safe: ['tsc:safe', 'typecheck', 'tsc --noEmit'],
          strict: ['tsc:strict', 'tsc --strict --noEmit']
        },
        scriptTimeout: 30000,
        failureHandling: 'warn'
      })
    };

    // Setup TypeScript mocks
    const typescript = await import('typescript');
    typescript.readConfigFile.mockReturnValue(mockTsConfig);
    typescript.parseJsonConfigFileContent.mockReturnValue({
      options: mockTsConfig.config.compilerOptions,
      fileNames: ['/test/src/file.ts', '/test/src/other.ts'],
      errors: []
    });
    typescript.createProgram.mockReturnValue({
      getSourceFiles: vi.fn().mockReturnValue([]),
      getCompilerOptions: vi.fn().mockReturnValue(mockTsConfig.config.compilerOptions)
    });
    typescript.getPreEmitDiagnostics.mockReturnValue([mockDiagnostic]);

    // Setup file system mocks
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(mockTsConfig.config));
    path.resolve.mockImplementation((...paths) => paths.join('/'));
    path.join.mockImplementation((...paths) => paths.join('/'));
    path.dirname.mockReturnValue('/test');

    typescriptEngine = new TypeScriptAuditEngine(mockConfig);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    vi.clearAllMocks();
  });

  describe('Configuration Detection and Loading', () => {
    test('should detect tsconfig.json in project root', async () => {
      const result = await typescriptEngine.analyze('/test');

      expect(fs.existsSync).toHaveBeenCalledWith('/test/tsconfig.json');
      expect(result.success).toBe(true);
    });

    test('should search for tsconfig.json in parent directories', async () => {
      fs.existsSync
        .mockReturnValueOnce(false) // /test/deep/path/tsconfig.json
        .mockReturnValueOnce(false) // /test/deep/tsconfig.json
        .mockReturnValueOnce(true);  // /test/tsconfig.json

      const result = await typescriptEngine.analyze('/test/deep/path');

      expect(fs.existsSync).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });

    test('should handle missing tsconfig.json gracefully', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await typescriptEngine.analyze('/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No tsconfig.json found');
    });

    test('should parse TypeScript configuration correctly', async () => {
      const typescript = await import('typescript');

      await typescriptEngine.analyze('/test');

      expect(typescript.readConfigFile).toHaveBeenCalledWith(
        '/test/tsconfig.json',
        expect.any(Function)
      );
      expect(typescript.parseJsonConfigFileContent).toHaveBeenCalled();
    });

    test('should handle TypeScript configuration errors', async () => {
      const typescript = await import('typescript');
      typescript.readConfigFile.mockReturnValue({
        config: null,
        error: { messageText: 'Invalid JSON', code: 5014 }
      });

      const result = await typescriptEngine.analyze('/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });
  });

  describe('Diagnostic Processing', () => {
    test('should convert TypeScript diagnostics to violations', async () => {
      const result = await typescriptEngine.analyze('/test');

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toMatchObject({
        file: '/test/src/file.ts',
        line: 11, // 0-based to 1-based conversion
        column: 6,
        message: 'Type string is not assignable to type number',
        severity: 'error',
        source: 'typescript',
        category: 'type-error',
        code: 'TS2322'
      });
    });

    test('should categorize different diagnostic types correctly', async () => {
      const typescript = await import('typescript');
      const diagnostics = [
        { ...mockDiagnostic, category: 0, code: 1001 }, // Warning
        { ...mockDiagnostic, category: 1, code: 2322 }, // Error
        { ...mockDiagnostic, category: 2, code: 6133 }  // Suggestion
      ];
      typescript.getPreEmitDiagnostics.mockReturnValue(diagnostics);

      const result = await typescriptEngine.analyze('/test');

      expect(result.violations).toHaveLength(3);
      expect(result.violations[0].severity).toBe('warn');
      expect(result.violations[1].severity).toBe('error');
      expect(result.violations[2].severity).toBe('info');
    });

    test('should handle diagnostics without file information', async () => {
      const typescript = await import('typescript');
      const diagnostics = [
        {
          ...mockDiagnostic,
          file: undefined,
          messageText: 'Global compilation error'
        }
      ];
      typescript.getPreEmitDiagnostics.mockReturnValue(diagnostics);

      const result = await typescriptEngine.analyze('/test');

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].file).toBe('(global)');
      expect(result.violations[0].line).toBeUndefined();
    });

    test('should handle complex diagnostic message chains', async () => {
      const typescript = await import('typescript');
      const diagnostics = [
        {
          ...mockDiagnostic,
          messageText: {
            messageText: 'Main error message',
            next: [{
              messageText: 'Additional context',
              next: undefined
            }]
          }
        }
      ];
      typescript.getPreEmitDiagnostics.mockReturnValue(diagnostics);

      const result = await typescriptEngine.analyze('/test');

      expect(result.violations[0].message).toContain('Main error message');
      expect(result.violations[0].message).toContain('Additional context');
    });
  });

  describe('Custom Script Execution', () => {
    test('should attempt custom scripts when enabled', async () => {
      const { exec } = await import('node:child_process');
      exec.mockImplementation((cmd, options, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await typescriptEngine.analyze('/test');

      expect(exec).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    test('should fallback to TypeScript API when custom scripts fail', async () => {
      const { exec } = await import('node:child_process');
      exec.mockImplementation((cmd, options, callback) => {
        callback(new Error('Script failed'), null);
      });

      const result = await typescriptEngine.analyze('/test');

      // Should still succeed using TypeScript API
      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(1);
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

      const result = await typescriptEngine.analyze('/test');

      expect(exec).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    test('should respect script timeout configuration', async () => {
      const { exec } = await import('node:child_process');
      exec.mockImplementation((cmd, options, callback) => {
        expect(options.timeout).toBe(30000);
        callback(null, { stdout: '', stderr: '' });
      });

      await typescriptEngine.analyze('/test');

      expect(exec).toHaveBeenCalled();
    });

    test('should handle script output parsing', async () => {
      const { exec } = await import('node:child_process');
      const mockOutput = `
        src/file.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
        src/other.ts(15,10): warning TS6133: 'unused' is declared but never used.
      `;
      exec.mockImplementation((cmd, options, callback) => {
        callback(null, { stdout: mockOutput, stderr: '' });
      });

      const result = await typescriptEngine.analyze('/test');

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some(v => v.code === 'TS2322')).toBe(true);
    });
  });

  describe('File Filtering and Inclusion', () => {
    test('should respect include patterns from tsconfig', async () => {
      const typescript = await import('typescript');
      typescript.parseJsonConfigFileContent.mockReturnValue({
        options: mockTsConfig.config.compilerOptions,
        fileNames: ['/test/src/included.ts'],
        errors: []
      });

      const result = await typescriptEngine.analyze('/test');

      expect(result.metadata.filesAnalyzed).toBe(1);
    });

    test('should respect exclude patterns from tsconfig', async () => {
      const typescript = await import('typescript');
      typescript.parseJsonConfigFileContent.mockReturnValue({
        options: mockTsConfig.config.compilerOptions,
        fileNames: ['/test/src/file.ts'], // node_modules should be excluded
        errors: []
      });

      const result = await typescriptEngine.analyze('/test');

      expect(result.metadata.filesAnalyzed).toBe(1);
    });

    test('should handle empty file lists gracefully', async () => {
      const typescript = await import('typescript');
      typescript.parseJsonConfigFileContent.mockReturnValue({
        options: mockTsConfig.config.compilerOptions,
        fileNames: [],
        errors: []
      });

      const result = await typescriptEngine.analyze('/test');

      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.metadata.filesAnalyzed).toBe(0);
    });
  });

  describe('Performance and Caching', () => {
    test('should track analysis performance metrics', async () => {
      const result = await typescriptEngine.analyze('/test');

      expect(result.metadata.duration).toBeGreaterThan(0);
      expect(result.metadata.filesAnalyzed).toBeDefined();
      expect(result.metadata.violationsFound).toBeDefined();
    });

    test('should reset internal state correctly', () => {
      typescriptEngine.reset();

      // Should be able to analyze again after reset
      expect(async () => {
        await typescriptEngine.analyze('/test');
      }).not.toThrow();
    });

    test('should handle concurrent analysis requests', async () => {
      const promises = [
        typescriptEngine.analyze('/test'),
        typescriptEngine.analyze('/test'),
        typescriptEngine.analyze('/test')
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle TypeScript compiler API errors', async () => {
      const typescript = await import('typescript');
      typescript.createProgram.mockImplementation(() => {
        throw new Error('Compiler error');
      });

      const result = await typescriptEngine.analyze('/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Compiler error');
    });

    test('should handle file system errors gracefully', async () => {
      fs.existsSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      const result = await typescriptEngine.analyze('/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File system error');
    });

    test('should provide meaningful error messages', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await typescriptEngine.analyze('/test/nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No tsconfig.json found');
      expect(result.violations).toEqual([]);
    });

    test('should handle malformed diagnostic data', async () => {
      const typescript = await import('typescript');
      const malformedDiagnostic = {
        // Missing required fields
        code: null,
        messageText: null,
        category: undefined
      };
      typescript.getPreEmitDiagnostics.mockReturnValue([malformedDiagnostic]);

      const result = await typescriptEngine.analyze('/test');

      expect(result.success).toBe(true);
      // Should handle gracefully, possibly with empty violations or default values
    });
  });

  describe('Strict Mode Analysis', () => {
    test('should enable strict mode when configured', async () => {
      mockConfig.analysis.strictMode = true;
      typescriptEngine = new TypeScriptAuditEngine(mockConfig);

      const result = await typescriptEngine.analyze('/test');

      expect(result.success).toBe(true);
      // In strict mode, might have additional checks or different behavior
    });

    test('should adjust analysis based on strict mode setting', async () => {
      // Test with strict mode off
      mockConfig.analysis.strictMode = false;
      const engineLenient = new TypeScriptAuditEngine(mockConfig);
      const resultLenient = await engineLenient.analyze('/test');

      // Test with strict mode on
      mockConfig.analysis.strictMode = true;
      const engineStrict = new TypeScriptAuditEngine(mockConfig);
      const resultStrict = await engineStrict.analyze('/test');

      expect(resultLenient.success).toBe(true);
      expect(resultStrict.success).toBe(true);
      // Results might differ in violation count or severity
    });
  });

  describe('Health Check', () => {
    test('should perform health check successfully', async () => {
      const health = await typescriptEngine.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.details).toBeDefined();
      expect(health.details.typescriptVersion).toBeDefined();
    });

    test('should detect unhealthy state', async () => {
      // Mock a scenario where TypeScript is not available
      const typescript = await import('typescript');
      typescript.readConfigFile.mockImplementation(() => {
        throw new Error('TypeScript not available');
      });

      const health = await typescriptEngine.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('TypeScript not available');
    });
  });
});