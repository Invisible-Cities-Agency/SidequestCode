/**
 * @fileoverview PRD Generation Tests
 * Tests the PRD file generation functionality for Claude Task Master integration
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import { writeFile } from "node:fs/promises";

// Mock fs module completely
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn().mockReturnValue(undefined),
  };
});

// Mock node:fs/promises specifically for static imports
vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}));

describe("PRD Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should generate comprehensive PRD content", async () => {
    // Mock violation data
    const mockViolations = [
      createMockViolation({
        category: "type-annotation",
        severity: "error",
        file: "src/types.ts",
        message: "Missing type annotation",
      }),
      createMockViolation({
        category: "type-annotation",
        severity: "warn",
        file: "src/utils.ts",
        message: "Implicit any type",
      }),
      createMockViolation({
        category: "eslint-style",
        severity: "warn",
        file: "src/types.ts",
        message: "Missing semicolon",
      }),
      createMockViolation({
        category: "unused-vars",
        severity: "warn",
        file: "src/components.ts",
        message: "Unused variable",
      }),
    ];

    // Import the function dynamically to avoid top-level issues
    const { generatePRD } = await import("../../../lib/cli.ts");

    await generatePRD(mockViolations, "./test-project");

    // Verify writeFile was called
    expect(writeFile).toHaveBeenCalledOnce();

    const [filePath, content] = writeFile.mock.calls[0];

    // Verify file path
    expect(filePath).toBe("./test-project/CODE_QUALITY_PRD.md");

    // Verify content structure
    expect(content).toContain("# Code Quality Improvement PRD");
    expect(content).toContain("Generated:");
    expect(content).toContain("Target: ./test-project");

    // Verify metrics
    expect(content).toContain("4 violations across 3 files");
    expect(content).toContain("1 errors requiring immediate attention");
    expect(content).toContain("3 warnings impacting code quality");

    // Verify category analysis
    expect(content).toContain("type-annotation");
    expect(content).toContain("eslint-style");
    expect(content).toContain("unused-vars");

    // Verify file breakdown
    expect(content).toContain("src/types.ts: 2 violations");
    expect(content).toContain("src/utils.ts: 1 violations");
    expect(content).toContain("src/components.ts: 1 violations");

    // Verify structure sections
    expect(content).toContain("## Executive Summary");
    expect(content).toContain("## Problem Statement");
    expect(content).toContain("## Solution Overview");
    expect(content).toContain("## Detailed Requirements");
    expect(content).toContain("## Technical Approach");
    expect(content).toContain("## Acceptance Criteria");
    expect(content).toContain("## Risk Assessment");
    expect(content).toContain("## Success Metrics");
    expect(content).toContain("## Implementation Timeline");
    expect(content).toContain("## Resource Requirements");

    // Verify task master reference
    expect(content).toContain(
      "https://github.com/eyaltoledano/claude-task-master",
    );
  });

  test("should handle empty violations gracefully", async () => {
    const { generatePRD } = await import("../../../lib/cli.ts");

    await generatePRD([], "./empty-project");

    expect(writeFile).toHaveBeenCalledOnce();

    const [, content] = writeFile.mock.calls[0];

    expect(content).toContain("0 violations across 0 files");
    expect(content).toContain("0 errors requiring immediate attention");
    expect(content).toContain("0 warnings impacting code quality");
    expect(content).toContain("- No critical errors found");
  });

  test("should prioritize errors over warnings", async () => {
    const mockViolations = [
      createMockViolation({
        category: "critical-error",
        severity: "error",
        file: "src/critical.ts",
        message: "Build breaking error",
      }),
      ...Array(10)
        .fill(null)
        .map(() =>
          createMockViolation({
            category: "style-warning",
            severity: "warn",
            message: "Style issue",
          }),
        ),
    ];

    const { generatePRD } = await import("../../../lib/cli.ts");

    await generatePRD(mockViolations, "./priority-test");

    const [, content] = writeFile.mock.calls[0];

    // Critical errors should be listed first
    expect(content).toContain("### Priority 1: Critical Errors (1 items)");
    expect(content).toContain("**critical-error**: Build breaking error");
  });

  test("should calculate percentages correctly", async () => {
    const mockViolations = [
      createMockViolation({ category: "type-issue" }),
      createMockViolation({ category: "type-issue" }),
      createMockViolation({ category: "type-issue" }),
      createMockViolation({ category: "style-issue" }),
    ];

    const { generatePRD } = await import("../../../lib/cli.ts");

    await generatePRD(mockViolations, "./percentage-test");

    const [, content] = writeFile.mock.calls[0];

    expect(content).toContain("**type-issue**: 3 violations (75.0% of total)");
    expect(content).toContain("**style-issue**: 1 violations (25.0% of total)");
  });

  test("should set realistic targets in success metrics", async () => {
    const mockViolations = Array(100)
      .fill(null)
      .map(() => createMockViolation({ category: "test-category" }));

    const { generatePRD } = await import("../../../lib/cli.ts");

    await generatePRD(mockViolations, "./metrics-test");

    const [, content] = writeFile.mock.calls[0];

    // Should target 80% reduction (20 violations remaining)
    expect(content).toContain("Violation count: 100 → Target: <20");
  });

  test("should handle file write errors gracefully", async () => {
    // Mock console.error to avoid noise in test output
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock writeFile to reject
    writeFile.mockRejectedValueOnce(new Error("Permission denied"));

    const { generatePRD } = await import("../../../lib/cli.ts");

    await generatePRD([createMockViolation()], "./error-test");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "❌ Failed to write PRD file: Error: Permission denied",
      ),
    );

    consoleSpy.mockRestore();
  });
});

// Helper function to create mock violations for testing
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
