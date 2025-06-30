/**
 * @vitest-environment node
 */

import { describe, it, expect, vi } from 'vitest';
import { 
  replaceAll, 
  arrayAt, 
  NodeVersion, 
  checkEnvironmentCompatibility 
} from '../../../utils/node-compatibility.ts';

describe('Node.js Compatibility Utilities', () => {
  describe('replaceAll', () => {
    it('should replace all occurrences of a string', () => {
      expect(replaceAll('hello world hello', 'hello', 'hi')).toBe('hi world hi');
    });

    it('should handle regex replacements', () => {
      expect(replaceAll('Hello World', /[A-Z]/g, 'X')).toBe('Xello Xorld');
    });

    it('should handle empty search string like native replaceAll', () => {
      // Native replaceAll with empty string replaces between every character
      expect(replaceAll('hello', '', 'x')).toBe('xhxexlxlxox');
    });

    it('should handle special characters', () => {
      expect(replaceAll('a.b.c', '.', '-')).toBe('a-b-c');
    });

    it('should throw error for non-string input', () => {
      expect(() => replaceAll(123, 'x', 'y')).toThrow('First argument must be a string');
    });
  });

  describe('arrayAt', () => {
    it('should return element at positive index', () => {
      const arr = ['a', 'b', 'c'];
      expect(arrayAt(arr, 0)).toBe('a');
      expect(arrayAt(arr, 1)).toBe('b');
      expect(arrayAt(arr, 2)).toBe('c');
    });

    it('should return element at negative index', () => {
      const arr = ['a', 'b', 'c'];
      expect(arrayAt(arr, -1)).toBe('c');
      expect(arrayAt(arr, -2)).toBe('b');
      expect(arrayAt(arr, -3)).toBe('a');
    });

    it('should return undefined for out-of-bounds indices', () => {
      const arr = ['a', 'b'];
      expect(arrayAt(arr, 5)).toBeUndefined();
      expect(arrayAt(arr, -5)).toBeUndefined();
    });

    it('should handle empty arrays', () => {
      expect(arrayAt([], 0)).toBeUndefined();
      expect(arrayAt([], -1)).toBeUndefined();
    });

    it('should throw error for non-array input', () => {
      expect(() => arrayAt('not an array', 0)).toThrow('First argument must be an array');
    });
  });

  describe('NodeVersion', () => {
    it('should detect current Node version', () => {
      const version = NodeVersion.getMajorMinor();
      expect(typeof version).toBe('number');
      expect(version).toBeGreaterThan(0);
    });

    it('should get major version number', () => {
      const major = NodeVersion.getMajor();
      expect(typeof major).toBe('number');
      expect(major).toBeGreaterThanOrEqual(18); // Our minimum requirement
    });

    it('should check feature support correctly', () => {
      // These should all be true since we require Node 18+
      expect(NodeVersion.supports.nodePrefix()).toBe(true);
      expect(NodeVersion.supports.replaceAll()).toBe(true);
      expect(NodeVersion.supports.arrayAt()).toBe(true);
    });

    it('should identify LTS versions', () => {
      const isLTS = NodeVersion.isLTS();
      expect(typeof isLTS).toBe('boolean');
      // If we're running Node 18, 20, or 22, it should be LTS
      const major = NodeVersion.getMajor();
      if ([18, 20, 22].includes(major)) {
        expect(isLTS).toBe(true);
      }
    });
  });

  describe('checkEnvironmentCompatibility', () => {
    it('should return compatibility information', () => {
      const compat = checkEnvironmentCompatibility();
      
      expect(compat).toHaveProperty('compatible');
      expect(compat).toHaveProperty('version');
      expect(compat).toHaveProperty('warnings');
      expect(compat).toHaveProperty('recommendations');
      
      expect(typeof compat.compatible).toBe('boolean');
      expect(typeof compat.version).toBe('string');
      expect(Array.isArray(compat.warnings)).toBe(true);
      expect(Array.isArray(compat.recommendations)).toBe(true);
    });

    it('should be compatible with supported Node versions', () => {
      const major = NodeVersion.getMajor();
      const compat = checkEnvironmentCompatibility();
      
      if (major >= 18) {
        expect(compat.compatible).toBe(true);
        expect(compat.warnings).toHaveLength(0);
      }
    });
  });

  describe('Feature Detection', () => {
    it('should handle native vs fallback implementations gracefully', () => {
      // Test that our fallbacks work even when native methods exist
      const testString = 'hello-world-test';
      const result = replaceAll(testString, '-', '_');
      expect(result).toBe('hello_world_test');
      
      const testArray = [1, 2, 3, 4, 5];
      const lastElement = arrayAt(testArray, -1);
      expect(lastElement).toBe(5);
    });
  });

  describe('Error Handling', () => {
    it('should provide meaningful error messages', () => {
      expect(() => replaceAll(null, 'x', 'y')).toThrow();
      expect(() => arrayAt(null, 0)).toThrow();
    });

    it('should handle edge cases gracefully', () => {
      // Empty inputs
      expect(replaceAll('', 'x', 'y')).toBe('');
      expect(arrayAt([], 0)).toBeUndefined();
      
      // Boundary conditions
      expect(arrayAt([1], -1)).toBe(1);
      expect(arrayAt([1], -2)).toBeUndefined();
    });
  });
});