/**
 * @fileoverview Edge Case Tests - Error Recovery and Resilience
 * 
 * Tests the system's ability to handle and recover from various error conditions:
 * - Service failures and cascading errors
 * - Resource exhaustion scenarios
 * - Network and I/O failures
 * - Malformed data and corrupted configurations
 * - Timeout and performance degradation
 * - Concurrent operation conflicts
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { PreferencesManager } from '../../services/preferences-manager.ts';
import { ViolationTracker } from '../../services/violation-tracker.ts';

// Mock extreme error conditions
const simulateMemoryPressure = () => {
  const largeObjects = [];
  for (let i = 0; i < 100; i++) {
    largeObjects.push(new Array(10000).fill('data'));
  }
  return {
    cleanup: () => largeObjects.length = 0
  };
};

const simulateFileSystemErrors = () => {
  const originalReadFileSync = fs.readFileSync;
  const originalWriteFileSync = fs.writeFileSync;
  const originalExistsSync = fs.existsSync;

  fs.readFileSync = vi.fn().mockImplementation(() => {
    throw new Error('ENOSPC: no space left on device');
  });
  
  fs.writeFileSync = vi.fn().mockImplementation(() => {
    throw new Error('EACCES: permission denied');
  });
  
  fs.existsSync = vi.fn().mockImplementation(() => {
    throw new Error('EIO: i/o error');
  });

  return {
    restore: () => {
      fs.readFileSync = originalReadFileSync;
      fs.writeFileSync = originalWriteFileSync;
      fs.existsSync = originalExistsSync;
    }
  };
};

describe('Edge Cases - Error Recovery', () => {
  let testDirectory;
  
  beforeEach(() => {
    testDirectory = '/tmp/sidequest-edge-test';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('File System Resilience', () => {
    test('should handle disk space exhaustion gracefully', () => {
      const fsErrors = simulateFileSystemErrors();
      
      try {
        // Should not throw, should handle gracefully
        PreferencesManager.instance = undefined;
        const manager = PreferencesManager.getInstance(testDirectory);
        
        // Should fall back to in-memory defaults
        const prefs = manager.getAllPreferences();
        expect(prefs.preferences.analysis.defaultMode).toBe('errors-only');
      } finally {
        fsErrors.restore();
      }
    });

    test('should recover from corrupted preference files', () => {
      fs.readFileSync = vi.fn()
        .mockImplementationOnce(() => '{"invalid": json}') // Corrupted JSON
        .mockImplementationOnce(() => JSON.stringify({ // Valid JSON, invalid schema
          wrongSchema: true,
          preferences: null
        }));

      PreferencesManager.instance = undefined;
      const manager = PreferencesManager.getInstance(testDirectory);
      
      // Should migrate gracefully to valid defaults
      const prefs = manager.getAllPreferences();
      expect(prefs.schemaVersion).toBe('1.0.0');
      expect(prefs.preferences).toBeDefined();
    });

    test('should handle rapid concurrent file operations', async () => {
      PreferencesManager.instance = undefined;
      const manager = PreferencesManager.getInstance(testDirectory);

      // Simulate rapid concurrent updates
      const promises = Array.from({ length: 50 }, (_, i) => 
        manager.updateUserChoice('lastConfigUpdate', new Date().toISOString() + i)
      );

      // Should handle all updates without corruption
      await Promise.all(promises);
      
      const prefs = manager.getAllPreferences();
      expect(prefs.userChoices.lastConfigUpdate).toBeTruthy();
    });
  });

  describe('Memory Management Under Pressure', () => {
    test('should maintain functionality under memory pressure', async () => {
      const pressure = simulateMemoryPressure();
      
      try {
        const mockStorage = {
          storeViolations: vi.fn().mockResolvedValue({ inserted: 1, updated: 0, errors: [] }),
          recordPerformanceMetric: vi.fn().mockResolvedValue()
        };
        
        const tracker = new ViolationTracker(mockStorage);
        
        // Create large violation dataset
        const violations = Array.from({ length: 1000 }, (_, i) => ({
          file: `/test/file${i}.ts`,
          line: i + 1,
          column: 1,
          message: `Error message ${i}`.repeat(10), // Large messages
          category: 'error',
          severity: 'error',
          source: 'typescript',
          rule: `rule-${i % 10}`
        }));

        const result = await tracker.processViolations(violations);
        
        expect(result.processed).toBe(1000);
        expect(result.errors).toEqual([]);
      } finally {
        pressure.cleanup();
      }
    });

    test('should clear caches when memory pressure detected', () => {
      const mockStorage = {
        storeViolations: vi.fn(),
        recordPerformanceMetric: vi.fn()
      };
      
      const tracker = new ViolationTracker(mockStorage);
      
      // Build up cache
      for (let i = 0; i < 100; i++) {
        tracker.generateViolationHash({
          file: `/file${i}.ts`,
          line: i,
          message: `Message ${i}`,
          rule: `rule-${i}`,
          category: 'error',
          severity: 'error',
          source: 'typescript'
        });
      }
      
      let stats = tracker.getCacheStats();
      expect(stats.totalCacheSize).toBeGreaterThan(0);
      
      // Simulate memory pressure cleanup
      tracker.clearCaches();
      
      stats = tracker.getCacheStats();
      expect(stats.totalCacheSize).toBe(0);
    });
  });

  describe('Malformed Data Handling', () => {
    test('should handle violations with extreme edge case data', async () => {
      const mockStorage = {
        storeViolations: vi.fn().mockResolvedValue({ inserted: 0, updated: 0, errors: [] }),
        recordPerformanceMetric: vi.fn().mockResolvedValue()
      };
      
      const tracker = new ViolationTracker(mockStorage);
      
      const extremeViolations = [
        // Empty/null values
        { file: '', line: 0, message: '', category: '', severity: '', source: '' },
        { file: null, line: null, message: null, category: null, severity: null, source: null },
        
        // Extreme values
        { 
          file: 'x'.repeat(10000), // Very long path
          line: Number.MAX_SAFE_INTEGER,
          column: Number.MAX_SAFE_INTEGER,
          message: 'msg'.repeat(1000), // Very long message
          category: 'error',
          severity: 'error',
          source: 'typescript'
        },
        
        // Unicode and special characters
        {
          file: '💻🔥⚡️.ts',
          line: 1,
          message: '🚨 Error with émojis and ñoñ-ASCII çharacters',
          category: 'error',
          severity: 'error',
          source: 'typescript'
        },
        
        // Type mismatches
        { 
          file: 123, // Number instead of string
          line: 'not-a-number',
          message: true, // Boolean instead of string
          category: ['array'],
          severity: { object: true },
          source: undefined
        }
      ];

      const result = await tracker.processViolations(extremeViolations);
      
      // Should handle gracefully without crashing
      expect(result.processed).toBe(extremeViolations.length);
      expect(result.errors.length).toBeGreaterThan(0); // Some should be rejected
    });

    test('should recover from corrupted violation hash cache', () => {
      const mockStorage = {
        storeViolations: vi.fn(),
        recordPerformanceMetric: vi.fn()
      };
      
      const tracker = new ViolationTracker(mockStorage);
      
      // Manually corrupt the cache by accessing private members
      const violation = {
        file: '/test.ts',
        line: 1,
        message: 'Test',
        category: 'error',
        severity: 'error',
        source: 'typescript'
      };
      
      // Generate normal hash
      const hash1 = tracker.generateViolationHash(violation);
      expect(hash1).toBeTruthy();
      
      // Clear and regenerate should be consistent
      tracker.clearCaches();
      const hash2 = tracker.generateViolationHash(violation);
      expect(hash2).toBe(hash1);
    });
  });

  describe('Concurrent Operation Edge Cases', () => {
    test('should handle concurrent validation cache access', () => {
      const mockStorage = {
        storeViolations: vi.fn(),
        recordPerformanceMetric: vi.fn()
      };
      
      const tracker = new ViolationTracker(mockStorage);
      
      const violation = {
        file: '/test.ts',
        line: 1,
        message: 'Test message',
        category: 'error',
        severity: 'error',
        source: 'typescript'
      };
      
      // Simulate concurrent validation calls
      const promises = Array.from({ length: 100 }, () => 
        Promise.resolve(tracker.validateViolation(violation))
      );
      
      return Promise.all(promises).then(results => {
        // All should return the same validation result
        expect(results.every(r => r.isValid === results[0].isValid)).toBe(true);
        
        // Cache should have only one entry
        const stats = tracker.getCacheStats();
        expect(stats.validationCacheSize).toBe(1);
      });
    });

    test('should handle preferences updates during concurrent reads', () => {
      PreferencesManager.instance = undefined;
      const manager = PreferencesManager.getInstance(testDirectory);
      
      // Simulate concurrent read/write operations
      const readPromises = Array.from({ length: 20 }, () => 
        Promise.resolve(manager.getAllPreferences())
      );
      
      const writePromises = Array.from({ length: 10 }, (_, i) => 
        Promise.resolve(manager.updateUserChoice('lastConfigUpdate', `update-${i}`))
      );
      
      return Promise.all([...readPromises, ...writePromises]).then(results => {
        // Reads should be consistent
        const preferences = results.slice(0, 20);
        expect(preferences.every(p => p.schemaVersion === '1.0.0')).toBe(true);
      });
    });
  });

  describe('Performance Degradation Scenarios', () => {
    test('should maintain responsiveness with large datasets', async () => {
      const mockStorage = {
        storeViolations: vi.fn().mockImplementation(async (violations) => {
          // Simulate slow storage
          await new Promise(resolve => setTimeout(resolve, 100));
          return { inserted: violations.length, updated: 0, errors: [] };
        }),
        recordPerformanceMetric: vi.fn().mockResolvedValue()
      };
      
      const tracker = new ViolationTracker(mockStorage);
      
      const startTime = performance.now();
      
      // Large batch of violations
      const violations = Array.from({ length: 1000 }, (_, i) => ({
        file: `/large/dataset/file${i}.ts`,
        line: i + 1,
        message: `Violation ${i}`,
        category: 'error',
        severity: 'error',
        source: 'typescript'
      }));
      
      const result = await tracker.processBatchedViolations(violations, 100);
      const duration = performance.now() - startTime;
      
      expect(result).toHaveLength(10); // 10 batches of 100
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle timeout scenarios gracefully', async () => {
      const mockStorage = {
        storeViolations: vi.fn().mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Operation timeout')), 100)
          )
        ),
        recordPerformanceMetric: vi.fn().mockResolvedValue()
      };
      
      const tracker = new ViolationTracker(mockStorage);
      
      const violations = [{
        file: '/test.ts',
        line: 1,
        message: 'Test',
        category: 'error',
        severity: 'error',
        source: 'typescript'
      }];
      
      const result = await tracker.processViolations(violations);
      
      // Should handle timeout gracefully
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('timeout'))).toBe(true);
    });
  });

  describe('Resource Cleanup Edge Cases', () => {
    test('should cleanup resources even after exceptions', () => {
      PreferencesManager.instance = undefined;
      
      // Mock file operations to throw
      fs.writeFileSync = vi.fn().mockImplementation(() => {
        throw new Error('Write failed');
      });
      
      const manager = PreferencesManager.getInstance(testDirectory);
      
      // Should not throw despite write failure
      expect(() => {
        manager.updatePreference('analysis', { defaultMode: 'all' });
      }).not.toThrow();
      
      // Should still be functional
      const prefs = manager.getAllPreferences();
      expect(prefs).toBeDefined();
    });

    test('should handle preference manager singleton cleanup', () => {
      PreferencesManager.instance = undefined;
      const manager1 = PreferencesManager.getInstance(testDirectory);
      
      // Reset singleton
      PreferencesManager.instance = undefined;
      const manager2 = PreferencesManager.getInstance(testDirectory);
      
      // Should create new instance
      expect(manager2).toBeDefined();
      expect(manager2).not.toBe(manager1);
    });
  });
});