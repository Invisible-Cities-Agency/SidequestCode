/**
 * Orchestrator Mock System
 * Professional mock system for Code Quality Orchestrator testing
 */

import { vi } from "vitest";

// Mock constants for consistent testing
export const MOCK_CONSTANTS = {
  VIOLATION_METADATA: {
    file: "test.ts",
    line: 1,
    column: 1,
    message: "Test violation message",
    category: "test-category",
    severity: "warn",
    source: "typescript",
    ruleId: "test-rule",
  },

  STORAGE_STATS: {
    totalViolations: 42,
    filesAffected: 15,
    avgPerFile: 2.8,
    lastUpdate: new Date().toISOString(),
  },

  DASHBOARD_DATA: {
    total_files_affected: 15,
    recent_history: [],
    performance_metrics: [],
  },
};

// Shared mock instances with proper cleanup
export const mockStorageService = {
  storeViolations: vi.fn(),
  getViolationSummary: vi.fn(),
  getDashboardData: vi.fn(),
  cleanupOldData: vi.fn(),
  recordPerformanceMetric: vi.fn(),
  getStorageStats: vi.fn(),

  // Reset method for clean test isolation
  reset() {
    this.storeViolations.mockReset();
    this.getViolationSummary.mockReset();
    this.getDashboardData.mockReset();
    this.cleanupOldData.mockReset();
    this.recordPerformanceMetric.mockReset();
    this.getStorageStats.mockReset();

    // Restore default implementations
    this.storeViolations.mockResolvedValue({
      inserted: 1,
      updated: 0,
      errors: [],
    });
    this.getViolationSummary.mockResolvedValue([]);
    this.getDashboardData.mockResolvedValue(MOCK_CONSTANTS.DASHBOARD_DATA);
    this.cleanupOldData.mockResolvedValue({ cleaned: 0 });
    this.recordPerformanceMetric.mockResolvedValue(true);
    this.getStorageStats.mockResolvedValue(MOCK_CONSTANTS.STORAGE_STATS);
  },
};

export const mockAnalysisService = {
  calculateViolationStats: vi.fn(),
  getViolationTrends: vi.fn(),
  recommendRuleFrequencies: vi.fn(),

  reset() {
    this.calculateViolationStats.mockReset();
    this.getViolationTrends.mockReset();
    this.recommendRuleFrequencies.mockReset();

    // Default implementations
    this.calculateViolationStats.mockResolvedValue(
      MOCK_CONSTANTS.STORAGE_STATS,
    );
    this.getViolationTrends.mockResolvedValue([]);
    this.recommendRuleFrequencies.mockResolvedValue([]);
  },
};

export const mockViolationTracker = {
  processViolations: vi.fn(),
  deduplicateViolations: vi.fn(),
  setSilentMode: vi.fn(),
  clearCaches: vi.fn(),

  reset() {
    this.processViolations.mockReset();
    this.deduplicateViolations.mockReset();
    this.setSilentMode.mockReset();
    this.clearCaches.mockReset();

    // Default implementations
    this.processViolations.mockImplementation(async (violations) => ({
      processed: violations.length,
      inserted: violations.length,
      updated: 0,
      deduplicated: 0,
      errors: [],
    }));
    this.deduplicateViolations.mockImplementation((violations) => violations);
    this.setSilentMode.mockImplementation(() => {});
    this.clearCaches.mockImplementation(() => {});
  },
};

export const mockOrchestrator = {
  getStorageService: vi.fn(() => mockStorageService),
  getAnalysisService: vi.fn(() => mockAnalysisService),
  getViolationTracker: vi.fn(() => mockViolationTracker),
  setSilentMode: vi.fn(),
  healthCheck: vi.fn(),
  shutdown: vi.fn(),

  reset() {
    this.getStorageService.mockReturnValue(mockStorageService);
    this.getAnalysisService.mockReturnValue(mockAnalysisService);
    this.getViolationTracker.mockReturnValue(mockViolationTracker);
    this.setSilentMode.mockImplementation(() => {});
    this.healthCheck.mockResolvedValue({
      overall: true,
      services: { storage: true, analysis: true, tracker: true },
      errors: [],
    });
    this.shutdown.mockResolvedValue();
  },
};

// Test scenario helpers for different states
export const testScenarios = {
  // Successful operation scenario
  success() {
    mockStorageService.reset();
    mockAnalysisService.reset();
    mockViolationTracker.reset();
    mockOrchestrator.reset();
  },

  // Error scenario
  storageError() {
    mockStorageService.reset();
    mockStorageService.storeViolations.mockRejectedValue(
      new Error("Storage failure"),
    );
    mockStorageService.getDashboardData.mockRejectedValue(
      new Error("Database unavailable"),
    );

    // Update orchestrator health check for error scenario
    mockOrchestrator.reset();
    mockOrchestrator.healthCheck.mockResolvedValue({
      overall: false,
      services: { storage: false, analysis: true, tracker: true },
      errors: ["Storage service failed: Storage failure"],
    });
  },

  // Performance scenario with large data
  largeDataset() {
    mockStorageService.reset();
    mockStorageService.getDashboardData.mockResolvedValue({
      ...MOCK_CONSTANTS.DASHBOARD_DATA,
      total_files_affected: 1000,
    });

    mockAnalysisService.reset();
    mockAnalysisService.calculateViolationStats.mockResolvedValue({
      ...MOCK_CONSTANTS.STORAGE_STATS,
      totalViolations: 5000,
      filesAffected: 1000,
    });
  },

  // Empty state scenario
  emptyState() {
    mockStorageService.reset();
    mockStorageService.getViolationSummary.mockResolvedValue([]);
    mockStorageService.getDashboardData.mockResolvedValue({
      total_files_affected: 0,
      recent_history: [],
      performance_metrics: [],
    });

    mockAnalysisService.reset();
    mockAnalysisService.calculateViolationStats.mockResolvedValue({
      totalViolations: 0,
      filesAffected: 0,
      avgPerFile: 0,
    });
  },

  // Memory pressure scenario
  memoryPressure() {
    mockStorageService.reset();
    mockViolationTracker.reset();

    // Simulate memory-intensive operations
    mockViolationTracker.processViolations.mockImplementation(
      async (violations) => {
        // Simulate memory usage
        const largeBuffer = new Array(10000).fill("memory-test");

        const result = {
          processed: violations.length,
          inserted: violations.length,
          updated: 0,
          deduplicated: 0,
          errors: [],
        };

        // Clean up buffer
        largeBuffer.length = 0;

        return result;
      },
    );
  },
};

// Global reset function for clean test isolation
export const resetMocks = () => {
  vi.clearAllMocks();

  mockStorageService.reset();
  mockAnalysisService.reset();
  mockViolationTracker.reset();
  mockOrchestrator.reset();
};

// Initialize with default scenario
testScenarios.success();
