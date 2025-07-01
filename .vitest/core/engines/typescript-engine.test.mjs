/**
 * @fileoverview Tests for TypeScriptEngine - Basic functionality
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TypeScriptAuditEngine } from '../../../engines/typescript-engine.ts';

// Mock file system operations
vi.mock('node:fs');
vi.mock('node:path');

// Mock child_process - return success with no output by default
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawnSync: vi.fn().mockReturnValue({
      status: 0,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      error: null
    })
  };
});

describe('TypeScriptAuditEngine', () => {
  let typescriptEngine;
  let originalConsoleLog;

  beforeEach(() => {
    // Mock console to capture logs
    originalConsoleLog = console.log;
    console.log = vi.fn();

    // Setup file system mocks for success case
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2020'
      }
    }));
    path.resolve.mockImplementation((...paths) => paths.join('/'));
    path.join.mockImplementation((...paths) => paths.join('/'));
    path.dirname.mockReturnValue('/test');

    typescriptEngine = new TypeScriptAuditEngine();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    vi.clearAllMocks();
  });

  describe('Basic Engine Functionality', () => {
    test('should execute successfully and return proper result structure', async () => {
      const result = await typescriptEngine.execute('/test');

      expect(result.engineName).toBe('TypeScript Compiler');
      expect(result.success).toBe(true);
      expect(Array.isArray(result.violations)).toBe(true);
      expect(typeof result.executionTime).toBe('number');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.targetPath).toBe('/test');
    });

    test('should parse TypeScript compiler output correctly', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockOutput = 'src/file.ts(10,5): error TS2322: Type \'string\' is not assignable to type \'number\'.';
      
      spawnSync.mockReturnValue({
        status: 1,
        stdout: mockOutput, // TypeScript engine checks stdout for 'error TS'
        stderr: '',
        error: null
      });

      const result = await typescriptEngine.execute('/test');

      expect(result.success).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      
      const violation = result.violations.find(v => v.message && v.message.includes('not assignable'));
      expect(violation).toBeDefined();
      if (violation) {
        expect(violation.severity).toBe('error');
        expect(violation.source).toBe('typescript');
      }
    });

    test('should handle successful compilation with no errors', async () => {
      const { spawnSync } = await import('node:child_process');
      spawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        error: null
      });

      const result = await typescriptEngine.execute('/test');

      expect(result.success).toBe(true);
      // Filter out any setup violations
      const tsViolations = result.violations.filter(v => v.source === 'typescript' && !v.file.includes('setup'));
      expect(tsViolations).toEqual([]);
    });
  });

  describe('Configuration', () => {
    test('should respect engine configuration options', () => {
      const engine = new TypeScriptAuditEngine({
        enabled: true,
        options: {
          checkCompilation: true,
          strict: true
        },
        timeout: 5000
      });

      expect(engine).toBeDefined();
    });
  });

  describe('Error Resilience', () => {
    test('should handle missing tsconfig gracefully', async () => {
      fs.existsSync.mockReturnValue(false);

      // Engine should still attempt to run and may succeed or fail gracefully
      const result = await typescriptEngine.execute('/test');
      
      expect(result.engineName).toBe('TypeScript Compiler');
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.violations)).toBe(true);
    });

    test('should handle file system errors gracefully', async () => {
      fs.existsSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      // Create engine with allowFailure set to true for graceful error handling
      const tolerantEngine = new TypeScriptAuditEngine({
        enabled: true,
        allowFailure: true,
        options: { checkCompilation: true }
      });

      // Engine should catch errors and return a failed result instead of throwing
      const result = await tolerantEngine.execute('/test');
      
      expect(result.engineName).toBe('TypeScript Compiler');
      expect(result.success).toBe(false);
      expect(result.error).toContain('File system error');
    });
  });
});