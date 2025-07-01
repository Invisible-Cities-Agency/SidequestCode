/**
 * @fileoverview Tests for ViolationTracker - Violation Lifecycle Management
 * 
 * Tests the complete violation tracking system including:
 * - Violation processing and deduplication
 * - Validation and sanitization
 * - Hash generation and caching
 * - Lifecycle management (resolved, ignored, reactivated)
 * - Filtering and batch operations
 * - Performance optimization
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViolationTracker } from '../../../services/violation-tracker.ts';

// Mock storage service
const createMockStorageService = () => ({
  storeViolations: vi.fn(),
  resolveViolations: vi.fn(),
  recordPerformanceMetric: vi.fn()
});

// Mock violation data
const createMockViolation = (overrides = {}) => ({
  file: '/test/file.ts',
  line: 10,
  column: 5,
  message: 'Test violation message',
  category: 'error',
  severity: 'error',
  source: 'typescript',
  rule: 'test-rule',
  code: 'TS1234',
  ...overrides
});

describe('ViolationTracker', () => {
  let violationTracker;
  let mockStorageService;
  let originalConsoleLog;

  beforeEach(() => {
    mockStorageService = createMockStorageService();
    violationTracker = new ViolationTracker(mockStorageService);
    
    // Mock console.log to capture logs
    originalConsoleLog = console.log;
    console.log = vi.fn();
    
    // Default successful responses
    mockStorageService.storeViolations.mockResolvedValue({
      inserted: 5,
      updated: 2,
      errors: []
    });
    mockStorageService.resolveViolations.mockResolvedValue(3);
    mockStorageService.recordPerformanceMetric.mockResolvedValue();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    vi.clearAllMocks();
  });

  describe('Violation Processing', () => {
    test('should process violations successfully', async () => {
      const violations = [
        createMockViolation({ file: '/test/file1.ts' }),
        createMockViolation({ file: '/test/file2.ts' }),
        createMockViolation({ file: '/test/file3.ts' })
      ];

      const result = await violationTracker.processViolations(violations);

      expect(result.processed).toBe(3);
      expect(result.inserted).toBe(5);
      expect(result.updated).toBe(2);
      expect(result.errors).toEqual([]);
      expect(mockStorageService.storeViolations).toHaveBeenCalledWith(violations);
    });

    test('should handle empty violation list', async () => {
      const result = await violationTracker.processViolations([]);

      expect(result.processed).toBe(0);
      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(0);
      expect(mockStorageService.storeViolations).not.toHaveBeenCalled();
    });

    test('should deduplicate violations before processing', async () => {
      const violations = [
        createMockViolation({ file: '/test/file.ts', line: 10, rule: 'same-rule', message: 'same message' }),
        createMockViolation({ file: '/test/file.ts', line: 10, rule: 'same-rule', message: 'same message' }), // Duplicate
        createMockViolation({ file: '/test/file.ts', line: 20, rule: 'different-rule', message: 'different message' })
      ];

      const result = await violationTracker.processViolations(violations);

      expect(result.processed).toBe(3);
      expect(result.deduplicated).toBe(1);
      
      // Should only store 2 unique violations
      const storedViolations = mockStorageService.storeViolations.mock.calls[0][0];
      expect(storedViolations).toHaveLength(2);
    });

    test('should validate violations and filter invalid ones', async () => {
      const violations = [
        createMockViolation({ file: '/test/valid.ts' }),
        createMockViolation({ file: '', message: '' }), // Invalid
        createMockViolation({ file: '/test/valid2.ts', line: -1 }) // Invalid line
      ];

      const result = await violationTracker.processViolations(violations);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('File path is required'))).toBe(true);
    });

    test('should record performance metrics', async () => {
      const violations = [createMockViolation()];

      await violationTracker.processViolations(violations);

      expect(mockStorageService.recordPerformanceMetric).toHaveBeenCalledWith(
        'violation_processing',
        expect.any(Number),
        'ms',
        expect.stringContaining('processed: 1')
      );
    });

    test('should operate in silent mode', async () => {
      violationTracker.setSilentMode(true);
      const violations = [createMockViolation()];

      await violationTracker.processViolations(violations);

      // Should not have logged anything in silent mode
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('Violation Deduplication', () => {
    test('should deduplicate identical violations', () => {
      const violations = [
        createMockViolation({ file: '/test/file.ts', line: 10, message: 'error', rule: 'same-rule' }),
        createMockViolation({ file: '/test/file.ts', line: 10, message: 'error', rule: 'same-rule' }),
        createMockViolation({ file: '/test/file.ts', line: 20, message: 'different error', rule: 'different-rule' })
      ];

      const deduplicated = violationTracker.deduplicateViolations(violations);

      expect(deduplicated).toHaveLength(2);
    });

    test('should preserve different violations', () => {
      const violations = [
        createMockViolation({ file: '/test/file1.ts', rule: 'rule1', message: 'msg1' }),
        createMockViolation({ file: '/test/file2.ts', rule: 'rule2', message: 'msg2' }),
        createMockViolation({ file: '/test/file1.ts', line: 20, rule: 'rule3', message: 'msg3' })
      ];

      const deduplicated = violationTracker.deduplicateViolations(violations);

      expect(deduplicated).toHaveLength(3);
    });
  });

  describe('Hash Generation and Validation', () => {
    test('should generate consistent hashes for identical violations', () => {
      const violation1 = createMockViolation({ file: '/test/file.ts' });
      const violation2 = createMockViolation({ file: '/test/file.ts' });

      const hash1 = violationTracker.generateViolationHash(violation1);
      const hash2 = violationTracker.generateViolationHash(violation2);

      expect(hash1).toBe(hash2);
      expect(hash1).toBeTruthy();
    });

    test('should generate different hashes for different violations', () => {
      const violation1 = createMockViolation({ file: '/test/file1.ts' });
      const violation2 = createMockViolation({ file: '/test/file2.ts' });

      const hash1 = violationTracker.generateViolationHash(violation1);
      const hash2 = violationTracker.generateViolationHash(violation2);

      expect(hash1).not.toBe(hash2);
    });

    test('should cache hash generation results', () => {
      const violation = createMockViolation();

      const hash1 = violationTracker.generateViolationHash(violation);
      const hash2 = violationTracker.generateViolationHash(violation);

      expect(hash1).toBe(hash2);
      
      const stats = violationTracker.getCacheStats();
      expect(stats.hashCacheSize).toBe(1);
    });

    test('should validate violation hashes correctly', () => {
      const violation = createMockViolation();
      const hash = violationTracker.generateViolationHash(violation);

      expect(violationTracker.validateViolationHash(violation, hash)).toBe(true);
      expect(violationTracker.validateViolationHash(violation, 'invalid-hash')).toBe(false);
    });
  });

  describe('Violation Validation', () => {
    test('should validate required fields', () => {
      const validViolation = createMockViolation();
      const result = violationTracker.validateViolation(validViolation);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject violations with missing file', () => {
      const violation = createMockViolation({ file: '' });
      const result = violationTracker.validateViolation(violation);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File path is required');
    });

    test('should reject violations with missing message', () => {
      const violation = createMockViolation({ message: '' });
      const result = violationTracker.validateViolation(violation);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message is required');
    });

    test('should validate line and column numbers', () => {
      const violationInvalidLine = createMockViolation({ line: -1 });
      const violationInvalidColumn = createMockViolation({ column: -1 });

      const result1 = violationTracker.validateViolation(violationInvalidLine);
      const result2 = violationTracker.validateViolation(violationInvalidColumn);

      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain('Line number must be a positive integer');
      
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('Column number must be a non-negative integer');
    });

    test('should validate severity values', () => {
      const violation = createMockViolation({ severity: 'invalid' });
      const result = violationTracker.validateViolation(violation);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Severity must be one of: error, warn, info');
    });

    test('should cache validation results', () => {
      const violation = createMockViolation();

      violationTracker.validateViolation(violation);
      violationTracker.validateViolation(violation);

      const stats = violationTracker.getCacheStats();
      expect(stats.validationCacheSize).toBe(1);
    });
  });

  describe('Violation Sanitization', () => {
    test('should sanitize violation data', () => {
      const violation = createMockViolation({
        file: '  /test/file.ts  ',
        message: '  Error message  ',
        rule: '  test-rule  '
      });

      const sanitized = violationTracker.sanitizeViolation(violation);

      expect(sanitized.file).toBe('/test/file.ts');
      expect(sanitized.message).toBe('Error message');
      expect(sanitized.rule).toBe('test-rule');
    });

    test('should handle undefined optional fields', () => {
      const violation = createMockViolation({
        rule: undefined,
        code: undefined,
        column: undefined
      });

      const sanitized = violationTracker.sanitizeViolation(violation);

      expect(sanitized.rule).toBeUndefined();
      expect(sanitized.code).toBeUndefined();
      expect(sanitized.column).toBeUndefined();
    });
  });

  describe('Lifecycle Management', () => {
    test('should mark violations as resolved', async () => {
      const hashes = ['hash1', 'hash2', 'hash3'];

      const result = await violationTracker.markAsResolved(hashes);

      expect(result).toBe(3);
      expect(mockStorageService.resolveViolations).toHaveBeenCalledWith(hashes);
    });

    test('should mark violations as ignored', async () => {
      const hashes = ['hash1', 'hash2'];

      const result = await violationTracker.markAsIgnored(hashes);

      expect(result).toBe(2);
      // Note: This tests the placeholder implementation
    });

    test('should reactivate violations', async () => {
      const hashes = ['hash1', 'hash2'];

      const result = await violationTracker.reactivateViolations(hashes);

      expect(result).toBe(2);
      // Note: This tests the placeholder implementation
    });
  });

  describe('Filtering Operations', () => {
    test('should filter violations by rule', () => {
      const violations = [
        createMockViolation({ rule: 'rule1' }),
        createMockViolation({ rule: 'rule2' }),
        createMockViolation({ rule: 'rule1' })
      ];

      const filtered = violationTracker.filterViolationsByRule(violations, ['rule1']);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(v => v.rule === 'rule1')).toBe(true);
    });

    test('should filter violations by severity', () => {
      const violations = [
        createMockViolation({ severity: 'error' }),
        createMockViolation({ severity: 'warn' }),
        createMockViolation({ severity: 'error' })
      ];

      const filtered = violationTracker.filterViolationsBySeverity(violations, ['error']);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(v => v.severity === 'error')).toBe(true);
    });

    test('should filter violations by file', () => {
      const violations = [
        createMockViolation({ file: '/test/file1.ts' }),
        createMockViolation({ file: '/test/file2.ts' }),
        createMockViolation({ file: '/test/file1.ts' })
      ];

      const filtered = violationTracker.filterViolationsByFile(violations, ['/test/file1.ts']);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(v => v.file === '/test/file1.ts')).toBe(true);
    });

    test('should apply multiple filters', () => {
      const violations = [
        createMockViolation({ rule: 'rule1', severity: 'error', file: '/test/file1.ts', category: 'syntax' }),
        createMockViolation({ rule: 'rule2', severity: 'warn', file: '/test/file2.ts', category: 'style' }),
        createMockViolation({ rule: 'rule1', severity: 'error', file: '/test/file1.ts', category: 'syntax' })
      ];

      const filtered = violationTracker.applyFilters(violations, {
        ruleIds: ['rule1'],
        severities: ['error'],
        categories: ['syntax']
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.every(v => v.rule === 'rule1' && v.severity === 'error' && v.category === 'syntax')).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    test('should process violations in batches', async () => {
      const violations = Array.from({ length: 250 }, (_, i) => 
        createMockViolation({ file: `/test/file${i}.ts` })
      );

      const results = await violationTracker.processBatchedViolations(violations, 100);

      expect(results).toHaveLength(3); // 250 violations in batches of 100
      expect(mockStorageService.storeViolations).toHaveBeenCalledTimes(3);
    });

    test('should aggregate batch results', () => {
      const batchResults = [
        { processed: 100, inserted: 80, updated: 20, deduplicated: 5, errors: ['error1'] },
        { processed: 100, inserted: 70, updated: 30, deduplicated: 3, errors: ['error2'] },
        { processed: 50, inserted: 40, updated: 10, deduplicated: 2, errors: [] }
      ];

      const aggregated = violationTracker.aggregateBatchResults(batchResults);

      expect(aggregated.processed).toBe(250);
      expect(aggregated.inserted).toBe(190);
      expect(aggregated.updated).toBe(60);
      expect(aggregated.deduplicated).toBe(10);
      expect(aggregated.errors).toEqual(['error1', 'error2']);
    });
  });

  describe('Cache Management', () => {
    test('should provide cache statistics', () => {
      const violation = createMockViolation();

      // Generate some cache entries
      violationTracker.generateViolationHash(violation);
      violationTracker.validateViolation(violation);

      const stats = violationTracker.getCacheStats();

      expect(stats.hashCacheSize).toBe(1);
      expect(stats.validationCacheSize).toBe(1);
      expect(stats.totalCacheSize).toBe(2);
    });

    test('should clear caches', () => {
      const violation = createMockViolation();

      // Generate some cache entries
      violationTracker.generateViolationHash(violation);
      violationTracker.validateViolation(violation);

      let stats = violationTracker.getCacheStats();
      expect(stats.totalCacheSize).toBe(2);

      violationTracker.clearCaches();

      stats = violationTracker.getCacheStats();
      expect(stats.totalCacheSize).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle storage service errors gracefully', async () => {
      mockStorageService.storeViolations.mockRejectedValue(new Error('Storage error'));

      const violations = [createMockViolation()];
      const result = await violationTracker.processViolations(violations);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('Storage error'))).toBe(true);
      expect(result.processed).toBe(1);
      expect(result.inserted).toBe(0);
    });

    test('should handle performance metric recording errors', async () => {
      mockStorageService.recordPerformanceMetric.mockRejectedValue(new Error('Metrics error'));

      const violations = [createMockViolation()];

      // Should not throw despite metrics error
      await expect(violationTracker.processViolations(violations)).resolves.toBeDefined();
    });
  });
});