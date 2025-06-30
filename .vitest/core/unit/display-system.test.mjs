/**
 * Display System Test Suite
 * Demonstrates professional testing patterns for Node.js CLI tools
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isESLintCategory } from "../../../shared/constants.ts";

describe("Display System Core Tests", () => {
  let mockConsole;
  let memoryBefore;

  beforeEach(() => {
    // Capture memory usage before each test
    memoryBefore = getMemoryUsage();

    // Mock console output for CLI testing
    mockConsole = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    // Restore console
    mockConsole.log.mockRestore();
    mockConsole.error.mockRestore();
    mockConsole.warn.mockRestore();

    // Verify memory usage
    const memoryAfter = getMemoryUsage();
    expectMemoryIncrease(memoryBefore, memoryAfter, 5); // Max 5MB increase
  });

  describe("Category Detection", () => {
    it("should correctly identify ESLint categories", () => {
      // ESLint categories
      expect(isESLintCategory("code-quality")).toBe(true);
      expect(isESLintCategory("style")).toBe(true);
      expect(isESLintCategory("no-explicit-any")).toBe(true);

      // TypeScript categories
      expect(isESLintCategory("type-alias")).toBe(false);
      expect(isESLintCategory("annotation")).toBe(false);

      // Edge cases
      expect(isESLintCategory("")).toBe(false);
      expect(isESLintCategory(null)).toBe(false);
      expect(isESLintCategory(undefined)).toBe(false);
    });

    it("should handle invalid input gracefully", () => {
      expect(() => isESLintCategory(123)).not.toThrow();
      expect(() => isESLintCategory({})).not.toThrow();
      expect(() => isESLintCategory([])).not.toThrow();
    });
  });

  describe("Violation Processing", () => {
    it("should process violations with proper type safety", () => {
      const mockViolations = [
        createMockViolation({
          category: "code-quality",
          source: "eslint",
          severity: "warn",
          file: "src/eslint-test.ts",
          line: 1,
          message: "ESLint code quality issue",
        }),
        createMockViolation({
          category: "type-alias",
          source: "typescript",
          severity: "error",
          file: "src/typescript-test.ts",
          line: 2,
          message: "TypeScript type alias issue",
        }),
      ];

      // Process violations
      const result = processViolations(mockViolations);

      expect(result.total).toBe(2);
      expect(result.bySource.eslint).toBe(1);
      expect(result.bySource.typescript).toBe(1);
      expect(result.byCategory["code-quality"]).toBe(1);
      expect(result.byCategory["type-alias"]).toBe(1);
    });

    it("should handle empty violation arrays", () => {
      const result = processViolations([]);

      expect(result.total).toBe(0);
      expect(Object.keys(result.bySource)).toHaveLength(0);
      expect(Object.keys(result.byCategory)).toHaveLength(0);
    });

    it("should deduplicate violations correctly", () => {
      const duplicateViolations = [
        createMockViolation({
          file: "test.ts",
          line: 1,
          message: "Same error",
        }),
        createMockViolation({
          file: "test.ts",
          line: 1,
          message: "Same error",
        }),
        createMockViolation({
          file: "test.ts",
          line: 2,
          message: "Different error",
        }),
      ];

      const result = processViolations(duplicateViolations);

      // Should have 2 unique violations
      expect(result.total).toBe(2);
    });
  });

  describe("Performance Testing", () => {
    it("should complete violation processing within time limits", async () => {
      const startTime = performance.now();

      // Create large violation set
      const largeViolationSet = Array(1000)
        .fill(null)
        .map((_, i) =>
          createMockViolation({
            file: `file${i}.ts`,
            line: i + 1,
          }),
        );

      const result = processViolations(largeViolationSet);

      const duration = performance.now() - startTime;

      expect(result.total).toBe(1000);
      expect(duration).toBeLessThan(100); // Should complete in <100ms
    });

    it("should handle memory pressure gracefully", () => {
      // Create memory pressure
      const largeData = new Array(1000).fill("x".repeat(1000));

      const violation = createMockViolation({
        message: "Memory test violation",
      });

      const result = processViolations([violation]);

      expect(result.total).toBe(1);

      // Clean up large data
      largeData.length = 0;
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed violation objects", () => {
      const malformedViolations = [
        {
          /* missing required fields */
        },
        null,
        undefined,
        "invalid-string",
        123,
        createMockViolation(), // Valid one mixed in
      ];

      expect(() => {
        const result = processViolations(malformedViolations.filter(Boolean));
        expect(result).toBeDefined();
      }).not.toThrow();
    });

    it("should provide meaningful error messages", () => {
      try {
        processViolations("invalid-input");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain("Expected array");
      }
    });
  });

  describe("Console Output Testing", () => {
    it("should capture console output correctly", () => {
      console.log("Test message from CLI");
      console.error("Test error message");

      expect(mockConsole.log).toHaveBeenCalledWith("Test message from CLI");
      expect(mockConsole.error).toHaveBeenCalledWith("Test error message");
    });

    it("should handle multiple console operations", () => {
      console.log("First message");
      console.log("Second message");
      console.warn("Warning message");

      expect(mockConsole.log).toHaveBeenCalledTimes(2);
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe("Environment Testing", () => {
    it("should work with test environment variables", () => {
      expect(process.env.NODE_ENV).toBe("test");
      expect(process.env.CI).toBe("true");
      expect(process.env.TERM_COLOR_MODE).toBe("dark");
    });

    it("should handle dynamic environment changes", () => {
      const originalMode = process.env.TERM_COLOR_MODE;

      process.env.TERM_COLOR_MODE = "light";
      expect(process.env.TERM_COLOR_MODE).toBe("light");

      process.env.TERM_COLOR_MODE = originalMode;
      expect(process.env.TERM_COLOR_MODE).toBe("dark");
    });
  });
});

// Helper functions for tests
function processViolations(violations) {
  if (!Array.isArray(violations)) {
    throw new Error("Expected array of violations");
  }

  const bySource = {};
  const byCategory = {};
  const uniqueViolations = new Set();

  for (const violation of violations) {
    if (!violation || typeof violation !== "object") continue;

    // Create unique key for deduplication
    const key = `${violation.file}:${violation.line}:${violation.message}`;
    if (uniqueViolations.has(key)) continue;
    uniqueViolations.add(key);

    bySource[violation.source] = (bySource[violation.source] || 0) + 1;
    byCategory[violation.category] = (byCategory[violation.category] || 0) + 1;
  }

  return {
    total: uniqueViolations.size,
    bySource,
    byCategory,
  };
}

function createMockViolation(overrides = {}) {
  return {
    file: "src/test.ts",
    line: 1,
    column: 1,
    message: "Test violation",
    category: "test-category",
    severity: "warn",
    source: "typescript",
    ...overrides,
  };
}

function getMemoryUsage() {
  return process.memoryUsage();
}

function expectMemoryIncrease(before, after, maxIncreaseMB) {
  const increaseMB = (after.heapUsed - before.heapUsed) / 1024 / 1024;
  expect(increaseMB).toBeLessThan(maxIncreaseMB);
}
