/**
 * Core test setup for Code Quality Orchestrator
 * Professional testing architecture patterns for Node.js CLI tools
 */

import { vi, beforeEach, afterEach } from "vitest";

// Global test configuration
globalThis.__TEST__ = true;
globalThis.__DEV__ = false;

// Set consistent environment for tests
process.env.NODE_ENV = "test";
process.env.CI = "true";
process.env.TERM_COLOR_MODE = "dark"; // Consistent color mode for tests
process.env.DEBUG = ""; // Disable debug logging unless explicitly set

// Global mocks
vi.mock("sqlite3", () => ({
  default: vi.fn(),
  Database: vi.fn(),
}));

// Console capture for CLI testing
let originalConsole;

beforeEach(() => {
  // Reset environment for each test
  process.env.TERM_COLOR_MODE = "dark";
  delete process.env.DEBUG;

  // Store original console methods
  originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  };
});

afterEach(() => {
  // Clear all mocks
  vi.clearAllMocks();

  // Restore console methods
  if (originalConsole) {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
  }

  // Reset environment
  process.env.NODE_ENV = "test";
  process.env.CI = "true";

  // Clear branded type registrations if they exist
  if (typeof clearBrandRegistry === "function") {
    clearBrandRegistry();
  }

  // Reset memory profilers for edge runtime testing
  if (
    process.env.RUNTIME === "edge" &&
    typeof resetEdgeMemoryProfilers === "function"
  ) {
    resetEdgeMemoryProfilers();
  }
});

// Error handling for unhandled promises
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Global utilities for tests
globalThis.createMockViolation = (overrides = {}) => ({
  file: "test.ts",
  line: 1,
  column: 1,
  message: "Test violation",
  category: "test-category",
  severity: "warn",
  source: "typescript",
  ruleId: "test-rule",
  ...overrides,
});

globalThis.createMockStorageService = () => ({
  storeViolations: vi
    .fn()
    .mockResolvedValue({ inserted: 1, updated: 0, errors: [] }),
  getViolationSummary: vi.fn().mockResolvedValue([]),
  getDashboardData: vi.fn().mockResolvedValue({
    total_files_affected: 0,
    recent_history: [],
    performance_metrics: [],
  }),
  cleanupOldData: vi.fn().mockResolvedValue({ cleaned: 0 }),
  recordPerformanceMetric: vi.fn().mockResolvedValue(true),
  getStorageStats: vi.fn().mockResolvedValue({
    totalViolations: 0,
    filesAffected: 0,
    avgPerFile: 0,
    lastUpdate: new Date().toISOString(),
  }),
});

globalThis.createMockOrchestrator = () => ({
  getAnalysisService: vi.fn(() => ({
    calculateViolationStats: vi.fn(),
  })),
  getStorageService: vi.fn(() => createMockStorageService()),
  getViolationTracker: vi.fn(),
  setSilentMode: vi.fn(),
  healthCheck: vi.fn(),
  shutdown: vi.fn(),
});

// Memory testing utilities
globalThis.getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
  };
};

globalThis.expectMemoryIncrease = (before, after, maxIncreaseMB = 10) => {
  const increaseMB = (after.heapUsed - before.heapUsed) / (1024 * 1024);
  expect(increaseMB).toBeLessThan(maxIncreaseMB);
};

console.log(
  " Core test setup complete - Code Quality Orchestrator testing ready",
);
