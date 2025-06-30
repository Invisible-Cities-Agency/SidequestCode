/**
 * Database Mock System
 * Comprehensive mocks for SQLite and Kysely operations
 */

import { vi } from "vitest";

// Mock constants for consistent database testing
export const DATABASE_MOCK_CONSTANTS = {
  CONNECTION_STRING: "test-database.db",
  VIOLATION_RECORD: {
    id: "test-violation-123",
    file: "src/test.ts",
    line: 42,
    column: 10,
    message: "Test violation message",
    category: "test-category",
    severity: "warn",
    source: "typescript",
    rule: "test-rule",
    created_at: new Date().toISOString(),
    session_id: "test-session-456",
  },

  DASHBOARD_DATA: {
    total_files_affected: 15,
    total_violations: 42,
    recent_history: [
      { date: "2024-01-01", violations: 45 },
      { date: "2024-01-02", violations: 42 },
    ],
    performance_metrics: [
      { operation: "store_violations", avg_duration_ms: 25 },
      { operation: "query_violations", avg_duration_ms: 15 },
    ],
  },

  STORAGE_STATS: {
    totalViolations: 42,
    filesAffected: 15,
    avgPerFile: 2.8,
    lastUpdate: new Date().toISOString(),
    databaseSize: "2.5MB",
  },
};

// Mock SQLite connection with comprehensive method coverage
export const mockSQLiteConnection = {
  prepare: vi.fn(),
  exec: vi.fn(),
  close: vi.fn(),
  pragma: vi.fn(),
  transaction: vi.fn(),

  // Mock for prepared statements
  _mockPreparedStatement: {
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(),
    finalize: vi.fn(),
  },

  reset() {
    this.prepare.mockReset();
    this.exec.mockReset();
    this.close.mockReset();
    this.pragma.mockReset();
    this.transaction.mockReset();

    // Default implementations
    this.prepare.mockReturnValue(this._mockPreparedStatement);
    this.exec.mockReturnValue({ changes: 1, lastInsertRowid: 1 });
    this.close.mockResolvedValue();
    this.pragma.mockReturnValue([{ busy_timeout: 30000 }]);
    this.transaction.mockImplementation((fn) => fn());
  },
};

// Mock Kysely database instance
export const mockKyselyDatabase = {
  selectFrom: vi.fn(),
  insertInto: vi.fn(),
  updateTable: vi.fn(),
  deleteFrom: vi.fn(),
  schema: vi.fn(),
  destroy: vi.fn(),

  // Query builder chain mocks
  _mockQueryBuilder: {
    select: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    execute: vi.fn(),
    executeTakeFirst: vi.fn(),
    values: vi.fn(),
    set: vi.fn(),
    returning: vi.fn(),
  },

  reset() {
    this.selectFrom.mockReset();
    this.insertInto.mockReset();
    this.updateTable.mockReset();
    this.deleteFrom.mockReset();
    this.schema.mockReset();
    this.destroy.mockReset();

    // Setup chainable methods
    const chainableMock = {
      ...this._mockQueryBuilder,
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
      executeTakeFirst: vi.fn().mockResolvedValue(null),
    };

    this.selectFrom.mockReturnValue(chainableMock);
    this.insertInto.mockReturnValue(chainableMock);
    this.updateTable.mockReturnValue(chainableMock);
    this.deleteFrom.mockReturnValue(chainableMock);
    this.destroy.mockResolvedValue();
  },
};

// Database scenario helpers for different operational states
export const databaseScenarios = {
  // Normal operation scenario
  healthy() {
    mockSQLiteConnection.reset();
    mockKyselyDatabase.reset();

    // Setup successful operations
    mockKyselyDatabase._mockQueryBuilder.execute.mockResolvedValue([
      DATABASE_MOCK_CONSTANTS.VIOLATION_RECORD,
    ]);
    mockKyselyDatabase._mockQueryBuilder.executeTakeFirst.mockResolvedValue(
      DATABASE_MOCK_CONSTANTS.VIOLATION_RECORD,
    );
  },

  // Database connection failure
  connectionError() {
    mockSQLiteConnection.reset();
    mockKyselyDatabase.reset();

    // Simulate connection failures
    mockSQLiteConnection.prepare.mockImplementation(() => {
      throw new Error("SQLITE_CANTOPEN: unable to open database file");
    });

    mockKyselyDatabase.selectFrom.mockImplementation(() => {
      throw new Error("Database connection failed");
    });
  },

  // Database locked scenario
  databaseLocked() {
    mockSQLiteConnection.reset();
    mockKyselyDatabase.reset();

    // Simulate database lock
    mockSQLiteConnection.exec.mockImplementation(() => {
      throw new Error("SQLITE_BUSY: database is locked");
    });

    mockKyselyDatabase._mockQueryBuilder.execute.mockRejectedValue(
      new Error("SQLITE_BUSY: database is locked"),
    );
  },

  // Corrupted database scenario
  corruptedData() {
    mockSQLiteConnection.reset();
    mockKyselyDatabase.reset();

    // Return corrupted/unexpected data
    mockKyselyDatabase._mockQueryBuilder.execute.mockResolvedValue([
      { ...DATABASE_MOCK_CONSTANTS.VIOLATION_RECORD, id: null }, // Invalid data
      "invalid-string-record", // Wrong type
    ]);
  },

  // Large dataset scenario for performance testing
  largeDataset() {
    mockSQLiteConnection.reset();
    mockKyselyDatabase.reset();

    // Generate large dataset
    const largeViolationSet = Array(1000)
      .fill(null)
      .map((_, i) => ({
        ...DATABASE_MOCK_CONSTANTS.VIOLATION_RECORD,
        id: `violation-${i}`,
        file: `src/file-${i}.ts`,
        line: i + 1,
      }));

    mockKyselyDatabase._mockQueryBuilder.execute.mockResolvedValue(
      largeViolationSet,
    );

    // Simulate slower queries for large datasets
    mockKyselyDatabase._mockQueryBuilder.execute.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(largeViolationSet), 50),
        ),
    );
  },

  // Empty database scenario
  emptyDatabase() {
    mockSQLiteConnection.reset();
    mockKyselyDatabase.reset();

    // Return empty results
    mockKyselyDatabase._mockQueryBuilder.execute.mockResolvedValue([]);
    mockKyselyDatabase._mockQueryBuilder.executeTakeFirst.mockResolvedValue(
      null,
    );
  },

  // Transaction failure scenario
  transactionFailure() {
    mockSQLiteConnection.reset();
    mockKyselyDatabase.reset();

    // Simulate transaction rollback
    mockSQLiteConnection.transaction.mockImplementation((fn) => {
      try {
        fn();
        throw new Error("Transaction failed - rolling back");
      } catch (error) {
        throw error;
      }
    });
  },

  // Schema migration scenario
  schemaMigration() {
    mockSQLiteConnection.reset();
    mockKyselyDatabase.reset();

    // Simulate schema changes
    mockKyselyDatabase.schema.mockReturnValue({
      createTable: vi.fn().mockReturnValue({
        addColumn: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue(),
        }),
      }),
      alterTable: vi.fn().mockReturnValue({
        addColumn: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue(),
        }),
      }),
    });
  },

  // Performance pressure scenario
  performancePressure() {
    mockSQLiteConnection.reset();
    mockKyselyDatabase.reset();

    // Simulate slow operations
    mockKyselyDatabase._mockQueryBuilder.execute.mockImplementation(
      () =>
        new Promise((resolve) => {
          // Simulate memory pressure
          const largeBuffer = new Array(10000).fill("performance-test");

          setTimeout(() => {
            largeBuffer.length = 0; // Cleanup
            resolve([DATABASE_MOCK_CONSTANTS.VIOLATION_RECORD]);
          }, 100);
        }),
    );
  },
};

// Global reset function for clean test isolation
export const resetDatabaseMocks = () => {
  vi.clearAllMocks();

  mockSQLiteConnection.reset();
  mockKyselyDatabase.reset();
};

// Performance testing helpers
export const createMockViolationRecord = (overrides = {}) => ({
  ...DATABASE_MOCK_CONSTANTS.VIOLATION_RECORD,
  ...overrides,
});

export const createLargeViolationDataset = (size = 1000) => {
  return Array(size)
    .fill(null)
    .map((_, i) =>
      createMockViolationRecord({
        id: `perf-test-${i}`,
        file: `src/performance-${i}.ts`,
        line: i + 1,
      }),
    );
};

// Memory testing utilities
export const simulateMemoryPressure = () => {
  const largeData = new Array(5000).fill("x".repeat(1000));

  return {
    cleanup: () => {
      largeData.length = 0;
    },
    getSize: () => largeData.length,
  };
};

// Initialize with healthy scenario
databaseScenarios.healthy();
