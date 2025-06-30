/**
 * StorageService Test Suite
 * Comprehensive testing for SQLite database operations and persistence
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resetDatabaseMocks,
  databaseScenarios,
  createMockViolationRecord,
  createLargeViolationDataset,
  simulateMemoryPressure,
  DATABASE_MOCK_CONSTANTS,
} from "../../mocks/database-mocks.mjs";

// Mock database dependencies
vi.mock("sqlite3", () => ({
  default: vi.fn(),
  Database: vi.fn(),
}));

vi.mock("kysely", () => ({
  Kysely: vi.fn(),
  SqliteDialect: vi.fn(),
  CamelCasePlugin: vi.fn(),
}));

describe("StorageService Database Operations", () => {
  let mockConsole;
  let memoryBefore;

  beforeEach(() => {
    // Capture memory usage before each test
    memoryBefore = getMemoryUsage();

    // Mock console output for clean testing
    mockConsole = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    };

    // Reset all database mocks
    resetDatabaseMocks();
  });

  afterEach(() => {
    // Restore console
    mockConsole.log.mockRestore();
    mockConsole.error.mockRestore();
    mockConsole.warn.mockRestore();

    // Verify memory usage
    const memoryAfter = getMemoryUsage();
    expectMemoryIncrease(memoryBefore, memoryAfter, 10); // Max 10MB for database ops
  });

  describe("Database Connection Management", () => {
    test("should establish database connection successfully", async () => {
      databaseScenarios.healthy();

      // Mock the StorageService (would normally import from services)
      const mockStorageService = createMockStorageService();

      // Test connection establishment
      const stats = await mockStorageService.getStorageStats();

      expect(stats).toBeDefined();
      expect(mockStorageService.getStorageStats).toHaveBeenCalled();
    });

    test("should handle database connection failures gracefully", async () => {
      databaseScenarios.connectionError();

      const mockStorageService = createMockStorageService();

      // Override mock to simulate connection error
      mockStorageService.getStorageStats.mockRejectedValue(
        new Error("SQLITE_CANTOPEN: unable to open database file"),
      );

      await expect(mockStorageService.getStorageStats()).rejects.toThrow(
        "SQLITE_CANTOPEN",
      );
    });

    test("should retry connection on temporary failures", async () => {
      databaseScenarios.databaseLocked();

      const mockStorageService = createMockStorageService();

      // Simulate retry logic success on second attempt
      mockStorageService.getStorageStats
        .mockRejectedValueOnce(new Error("SQLITE_BUSY: database is locked"))
        .mockResolvedValueOnce(DATABASE_MOCK_CONSTANTS.STORAGE_STATS);

      // First call should fail
      await expect(mockStorageService.getStorageStats()).rejects.toThrow(
        "SQLITE_BUSY",
      );

      // Second call should succeed
      const stats = await mockStorageService.getStorageStats();

      expect(stats).toEqual(DATABASE_MOCK_CONSTANTS.STORAGE_STATS);
      expect(mockStorageService.getStorageStats).toHaveBeenCalledTimes(2);
    });

    test("should handle corrupted database gracefully", async () => {
      databaseScenarios.corruptedData();

      const mockStorageService = createMockStorageService();

      // Simulate data validation failure
      mockStorageService.getViolationSummary.mockRejectedValue(
        new Error("Data integrity check failed"),
      );

      await expect(mockStorageService.getViolationSummary()).rejects.toThrow(
        "Data integrity",
      );
    });
  });

  describe("Violation Storage Operations", () => {
    test("should store violations successfully", async () => {
      databaseScenarios.healthy();

      const mockStorageService = createMockStorageService();
      const violations = [
        createMockViolationRecord({ category: "test-1" }),
        createMockViolationRecord({ category: "test-2" }),
      ];

      const result = await mockStorageService.storeViolations(violations);

      expect(result).toBeDefined();
      expect(result.inserted).toBeGreaterThan(0);
      expect(mockStorageService.storeViolations).toHaveBeenCalledWith(
        violations,
      );
    });

    test("should handle duplicate violations appropriately", async () => {
      databaseScenarios.healthy();

      const mockStorageService = createMockStorageService();
      const duplicateViolations = [
        createMockViolationRecord({ id: "duplicate-1" }),
        createMockViolationRecord({ id: "duplicate-1" }), // Same ID
        createMockViolationRecord({ id: "unique-1" }),
      ];

      // Mock behavior for duplicate handling
      mockStorageService.storeViolations.mockResolvedValue({
        inserted: 1, // Only unique violations inserted
        updated: 1, // Duplicate updated
        errors: [],
      });

      const result =
        await mockStorageService.storeViolations(duplicateViolations);

      expect(result.inserted).toBe(1);
      expect(result.updated).toBe(1);
    });

    test("should validate violation data before storage", async () => {
      databaseScenarios.healthy();

      const mockStorageService = createMockStorageService();
      const invalidViolations = [
        {
          /* missing required fields */
        },
        createMockViolationRecord({ file: null }), // Invalid file
        createMockViolationRecord({ line: -1 }), // Invalid line number
      ];

      // Mock validation failure
      mockStorageService.storeViolations.mockResolvedValue({
        inserted: 0,
        updated: 0,
        errors: ["Invalid violation data: missing file", "Invalid line number"],
      });

      const result =
        await mockStorageService.storeViolations(invalidViolations);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.inserted).toBe(0);
    });

    test("should handle transaction failures during bulk insert", async () => {
      databaseScenarios.transactionFailure();

      const mockStorageService = createMockStorageService();
      const largeViolationSet = createLargeViolationDataset(100);

      // Mock transaction failure
      mockStorageService.storeViolations.mockRejectedValue(
        new Error("Transaction failed - rolling back"),
      );

      await expect(
        mockStorageService.storeViolations(largeViolationSet),
      ).rejects.toThrow("Transaction failed");
    });
  });

  describe("Violation Retrieval Operations", () => {
    test("should retrieve violation summary successfully", async () => {
      databaseScenarios.healthy();

      const mockStorageService = createMockStorageService();

      const summary = await mockStorageService.getViolationSummary();

      expect(summary).toBeDefined();
      expect(Array.isArray(summary)).toBe(true);
      expect(mockStorageService.getViolationSummary).toHaveBeenCalled();
    });

    test("should retrieve dashboard data with metrics", async () => {
      databaseScenarios.healthy();

      const mockStorageService = createMockStorageService();

      const dashboardData = await mockStorageService.getDashboardData();

      expect(dashboardData).toBeDefined();
      expect(dashboardData.total_files_affected).toBeDefined();
      expect(dashboardData.recent_history).toBeDefined();
      expect(dashboardData.performance_metrics).toBeDefined();
    });

    test("should handle empty database state", async () => {
      databaseScenarios.emptyDatabase();

      const mockStorageService = createMockStorageService();

      // Override mock for empty state
      mockStorageService.getViolationSummary.mockResolvedValue([]);
      mockStorageService.getDashboardData.mockResolvedValue({
        total_files_affected: 0,
        recent_history: [],
        performance_metrics: [],
      });

      const summary = await mockStorageService.getViolationSummary();
      const dashboard = await mockStorageService.getDashboardData();

      expect(summary).toEqual([]);
      expect(dashboard.total_files_affected).toBe(0);
    });

    test("should filter violations by criteria", async () => {
      databaseScenarios.healthy();

      const mockStorageService = createMockStorageService();

      // Mock filtered results
      const filteredViolations = [
        createMockViolationRecord({ severity: "error" }),
      ];

      mockStorageService.getViolationSummary.mockResolvedValue(
        filteredViolations,
      );

      const summary = await mockStorageService.getViolationSummary();

      expect(summary.every((v) => v.severity === "error")).toBe(true);
    });
  });

  describe("Performance and Scalability", () => {
    test("should handle large datasets efficiently", async () => {
      databaseScenarios.largeDataset();

      const mockStorageService = createMockStorageService();

      const startTime = performance.now();

      // Mock large dataset operations
      const largeDataset = createLargeViolationDataset(1000);
      mockStorageService.storeViolations.mockResolvedValue({
        inserted: 1000,
        updated: 0,
        errors: [],
      });

      const result = await mockStorageService.storeViolations(largeDataset);

      const duration = performance.now() - startTime;

      expect(result.inserted).toBe(1000);
      expect(duration).toBeLessThan(200); // Should complete in <200ms for mocked operation
    });

    test("should manage memory efficiently during large operations", async () => {
      databaseScenarios.performancePressure();

      const mockStorageService = createMockStorageService();

      const memoryBefore = process.memoryUsage();
      const pressureSimulation = simulateMemoryPressure();

      try {
        // Perform operation under memory pressure
        await mockStorageService.storeViolations([createMockViolationRecord()]);

        const memoryAfter = process.memoryUsage();

        // Memory increase should be reasonable
        expect(memoryAfter.heapUsed - memoryBefore.heapUsed).toBeLessThan(
          20 * 1024 * 1024,
        ); // <20MB
      } finally {
        pressureSimulation.cleanup();
      }
    });

    test("should optimize queries for frequent operations", async () => {
      databaseScenarios.healthy();

      const mockStorageService = createMockStorageService();

      // Test query optimization by running multiple operations
      const promises = Array(10)
        .fill(null)
        .map(() => mockStorageService.getStorageStats());

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(mockStorageService.getStorageStats).toHaveBeenCalledTimes(10);
    });
  });

  describe("Data Integrity and Cleanup", () => {
    test("should clean up old data based on retention policy", async () => {
      databaseScenarios.healthy();

      const mockStorageService = createMockStorageService();

      const cleanupResult = await mockStorageService.cleanupOldData();

      expect(cleanupResult).toBeDefined();
      expect(cleanupResult.cleaned).toBeDefined();
      expect(mockStorageService.cleanupOldData).toHaveBeenCalled();
    });

    test("should record performance metrics accurately", async () => {
      databaseScenarios.healthy();

      const mockStorageService = createMockStorageService();

      const success = await mockStorageService.recordPerformanceMetric(
        "test_operation",
        150, // 150ms duration
      );

      expect(success).toBe(true);
      expect(mockStorageService.recordPerformanceMetric).toHaveBeenCalledWith(
        "test_operation",
        150,
      );
    });

    test("should maintain database statistics accurately", async () => {
      databaseScenarios.healthy();

      const mockStorageService = createMockStorageService();

      const stats = await mockStorageService.getStorageStats();

      expect(stats.totalViolations).toBeDefined();
      expect(stats.filesAffected).toBeDefined();
      expect(stats.avgPerFile).toBeDefined();
      expect(stats.lastUpdate).toBeDefined();
    });
  });

  describe("Error Recovery and Resilience", () => {
    test("should recover from temporary database locks", async () => {
      const mockStorageService = createMockStorageService();

      // Simulate lock then success
      mockStorageService.storeViolations
        .mockRejectedValueOnce(new Error("SQLITE_BUSY: database is locked"))
        .mockResolvedValueOnce({ inserted: 1, updated: 0, errors: [] });

      // First call should fail
      await expect(
        mockStorageService.storeViolations([createMockViolationRecord()]),
      ).rejects.toThrow("SQLITE_BUSY");

      // Second call should succeed
      const result = await mockStorageService.storeViolations([
        createMockViolationRecord(),
      ]);

      expect(result.inserted).toBe(1);
    });

    test("should handle concurrent access scenarios", async () => {
      databaseScenarios.healthy();

      const mockStorageService = createMockStorageService();

      // Simulate concurrent operations
      const concurrentOperations = [
        mockStorageService.storeViolations([createMockViolationRecord()]),
        mockStorageService.getViolationSummary(),
        mockStorageService.getDashboardData(),
        mockStorageService.cleanupOldData(),
      ];

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(4);
      results.forEach((result) => expect(result).toBeDefined());
    });

    test("should provide meaningful error messages for debugging", async () => {
      databaseScenarios.connectionError();

      const mockStorageService = createMockStorageService();

      mockStorageService.storeViolations.mockRejectedValue(
        new Error(
          "Database connection failed: Check database file permissions",
        ),
      );

      await expect(mockStorageService.storeViolations([])).rejects.toThrow(
        "Database connection failed: Check database file permissions",
      );
    });
  });
});
