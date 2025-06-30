Testing Architecture – SideQuest Code Quality Orchestrator

## Overview

This document outlines the testing architecture for the SideQuest Code Quality Orchestrator, focusing on comprehensive test strategies using Vitest. The testing approach supports performance optimization, service-oriented architecture validation, and runtime safety through Zod validation.

## Testing Philosophy

The testing architecture embodies core principles for a robust, maintainable CLI tool:

- **Service Layer Validation**: Each service (Orchestrator, Storage, Analysis, ViolationTracker) is tested in isolation with comprehensive mock systems
- **Database Operations**: SQLite operations are tested with scenario-based mocks covering connection failures, data corruption, and performance pressure
- **Runtime Type Safety**: Zod validation schemas are tested for external boundary protection (CLI args, environment variables, configuration files)
- **Security Testing**: Path traversal prevention, injection attack protection, and sanitization validation
- **Performance Monitoring**: Memory usage tracking, operation timing, and scalability testing
- **Error Recovery**: Testing graceful degradation and service resilience patterns

## Context-Driven Development Pattern

The testing development follows a systematic service-oriented approach:

1. **Service Implementation**: Complete core service functionality with proper interfaces
2. **Mock System Creation**: Build comprehensive mocks with scenario-based testing patterns
3. **Unit Testing**: Test individual service methods with edge case coverage
4. **Integration Testing**: Test service coordination and cross-boundary interactions
5. **Performance Testing**: Validate memory usage, timing, and scalability constraints
6. **Security Testing**: Verify input validation, sanitization, and boundary protection
7. **Error Recovery Testing**: Test graceful degradation and service resilience
8. **Documentation**: Update testing methodology based on discovered patterns

## Vitest Configuration

The testing environment is optimized for Node.js CLI tools with ESM support:

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: [".vitest/setup-core.mjs"],
    globals: true,
    include: [".vitest/**/*.test.{mjs,ts}"],
    exclude: ["node_modules/**", "dist/**"],
    testTimeout: 30000,
    hookTimeout: 10000,
    isolate: true,
    pool: "forks",
    poolOptions: { forks: { isolate: true } },
  },
  resolve: {
    alias: {
      "@": "./src",
      "@/utils": "./utils",
      "@/engines": "./engines",
      "@/services": "./services",
      "@/database": "./database",
    },
  },
});
```

### Key Configuration Features

- **ESM Support**: Uses `.mjs` files for proper ES module testing
- **Mock Isolation**: Each test runs in isolated forks for clean mock state
- **Extended Timeouts**: Accommodates database operations and file system tests
- **Node Environment**: Optimized for CLI tool testing with file system access

## Directory Structure

The testing architecture follows a service-oriented structure with comprehensive mock systems:

```
.vitest/
├── setup-core.mjs               # Core test setup with global utilities
├── core/                        # Core service testing (unit-level)
│   ├── services/               # Service layer tests
│   │   ├── orchestrator-service.test.mjs    # Main coordinator testing
│   │   ├── storage-service.test.mjs         # Database operations testing
│   │   ├── analysis-service.test.mjs        # Analysis coordination testing
│   │   └── violation-tracker.test.mjs       # Violation tracking testing
│   ├── engines/                # Analysis engine testing
│   │   ├── typescript-engine.test.mjs       # TypeScript compilation testing
│   │   ├── eslint-engine.test.mjs           # ESLint rule testing
│   │   └── zod-detection-engine.test.mjs    # Zod schema detection testing
│   └── utils/                  # Utility function testing
├── edge/                       # Edge case and error condition testing
├── integration/                # Cross-service integration testing
└── mocks/                      # Centralized mock systems
    ├── orchestrator.mjs        # Service coordination mocks
    ├── database-mocks.mjs      # SQLite and Kysely mocks
    └── engine-mocks.mjs        # Analysis engine mocks
```

### Key Structure Features

- **Service-Oriented**: Tests mirror the service architecture
- **Mock Isolation**: Centralized mock systems with scenario-based testing
- **ESM Files**: `.mjs` extensions for proper ES module support
- **Comprehensive Coverage**: Core, edge, and integration test layers

## Test Scripts

Comprehensive test scripts for targeted execution and development workflow:

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts --reporter=verbose",
    "test:core": "vitest run '.vitest/core/**/*.test.{mjs,ts}' --reporter=verbose",
    "test:edge": "vitest run '.vitest/edge/**/*.test.{mjs,ts}' --reporter=verbose",
    "test:integration": "vitest run '.vitest/integration/**/*.test.{mjs,ts}' --reporter=verbose",
    "test:watch": "vitest watch '.vitest/core/**/*.test.{mjs,ts}'",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:ci": "vitest run --reporter=json --outputFile=./test-results.json"
  }
}
```

### Script Usage Patterns

- **`npm test`**: Complete test suite execution
- **`npm run test:core`**: Service layer and engine unit tests
- **`npm run test:edge`**: Error conditions and edge case testing
- **`npm run test:watch`**: Development mode with live reload
- **`npm run test:ui`**: Visual test interface for debugging

## Testing Patterns and Examples

### Service-Layer Testing Pattern

**Orchestrator Service Testing** - Main coordinator with service dependency management:

```javascript
describe("OrchestratorService Core Tests", () => {
  test("should coordinate service initialization", async () => {
    testScenarios.success();
    const orchestrator = createOrchestratorService();

    const health = await orchestrator.healthCheck();

    expect(health.overall).toBe(true);
    expect(health.services.storage).toBe(true);
    expect(health.services.analysis).toBe(true);
  });

  test("should handle service failures gracefully", async () => {
    testScenarios.storageError();
    const orchestrator = createOrchestratorService();

    const health = await orchestrator.healthCheck();

    expect(health.overall).toBe(false);
    expect(health.errors.length).toBeGreaterThan(0);
  });
});
```

### Database Operations Testing Pattern

**Storage Service Testing** - SQLite operations with scenario-based mocks:

```javascript
describe("StorageService Database Operations", () => {
  test("should handle database connection failures gracefully", async () => {
    databaseScenarios.connectionError();
    const mockStorageService = createMockStorageService();

    mockStorageService.getStorageStats.mockRejectedValue(
      new Error("SQLITE_CANTOPEN: unable to open database file"),
    );

    await expect(mockStorageService.getStorageStats()).rejects.toThrow(
      "SQLITE_CANTOPEN",
    );
  });

  test("should handle large datasets efficiently", async () => {
    databaseScenarios.largeDataset();
    const largeDataset = createLargeViolationDataset(1000);

    const result = await mockStorageService.storeViolations(largeDataset);

    expect(result.inserted).toBe(1000);
    expect(duration).toBeLessThan(200); // Performance validation
  });
});
```

### Mock System Architecture

**Scenario-Based Testing** - Comprehensive mock states for different operational conditions:

```javascript
export const testScenarios = {
  success() {
    // Normal operation state
    mockStorageService.reset();
    mockOrchestrator.healthCheck.mockResolvedValue({
      overall: true,
      services: { storage: true, analysis: true, tracker: true },
    });
  },

  storageError() {
    // Database failure simulation
    mockStorageService.storeViolations.mockRejectedValue(
      new Error("Storage failure"),
    );
    mockOrchestrator.healthCheck.mockResolvedValue({
      overall: false,
      services: { storage: false, analysis: true, tracker: true },
      errors: ["Storage service failed: Storage failure"],
    });
  },
};
```

### Performance and Memory Testing

**Memory Management Validation** - Ensuring efficient resource usage:

```javascript
test("should manage memory efficiently during large operations", async () => {
  const memoryBefore = process.memoryUsage();
  const pressureSimulation = simulateMemoryPressure();

  try {
    await mockStorageService.storeViolations([createMockViolationRecord()]);
    const memoryAfter = process.memoryUsage();

    expect(memoryAfter.heapUsed - memoryBefore.heapUsed).toBeLessThan(
      20 * 1024 * 1024,
    );
  } finally {
    pressureSimulation.cleanup();
  }
});
```

## Quality Gates and Success Metrics

### Test Coverage Requirements

- **Service Layer Coverage**: Minimum 90% line coverage for core services
- **Database Operations**: 85% coverage for SQLite and persistence operations
- **Error Recovery**: 80% coverage for error handling and graceful degradation
- **Security Validation**: 95% coverage for input validation and sanitization
- **Performance Testing**: Memory and timing validation for all major operations

### Code Quality Standards

- **TypeScript Compilation**: Zero compilation errors with strict mode
- **ESLint Validation**: Zero ESLint violations across the codebase
- **Zod Validation**: All external boundaries protected with runtime type checking
- **Service Architecture**: Proper dependency injection and service isolation
- **Mock System**: Comprehensive scenario-based testing patterns

### Performance Benchmarks

- **Test Execution**: Full test suite completes in under 30 seconds
- **Memory Usage**: Individual tests use less than 10MB heap increase
- **Database Operations**: Mock database operations complete in under 200ms
- **Service Coordination**: Health checks and service startup under 100ms

### Security Testing Requirements

- **Input Validation**: All CLI arguments, environment variables, and config files validated
- **Path Traversal Prevention**: File system access properly sanitized
- **Injection Protection**: Command execution and database queries safely parameterized
- **Error Information**: No sensitive information leaked in error messages

## Continuous Integration Pipeline

Comprehensive CI/CD pipeline for quality assurance and alpha release preparation:

```yaml
name: SideQuest Code Quality Orchestrator CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: "npm"

      - run: npm ci

      # Code Quality Validation
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run sidequest:report # Self-analysis validation

      # Comprehensive Test Suite
      - run: npm run test:core
      - run: npm run test:edge
      - run: npm run test:integration
      - run: npm run test:coverage

      # Performance and Security Validation
      - run: npm run test --reporter=json
      - run: npm run build # Ensure clean compilation

      # Coverage Reporting
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  alpha-release-check:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - run: npm ci
      - run: npm run sidequest:report:strict # Strict mode validation
      - run: npm run build
      - run: npm pack --dry-run # Validate package contents
```

### CI Pipeline Features

- **Multi-Node Testing**: Validates compatibility across Node.js 18, 20, and 22
- **Self-Analysis**: Uses SideQuest's own reporting to validate code quality
- **Alpha Release Validation**: Strict mode analysis and package validation
- **Performance Monitoring**: Test execution timing and memory usage tracking

## Development Workflow Integration

### Task Completion Criteria

Every major development task follows this validation pattern:

#### Service Implementation Checklist

- [ ] **Core Functionality**: Implement service with proper interface compliance
- [ ] **Mock System**: Create comprehensive mocks with scenario-based testing
- [ ] **Unit Tests**: Write service method tests covering all public interfaces
- [ ] **Edge Case Testing**: Test error conditions, boundary cases, and failure modes
- [ ] **Performance Testing**: Validate memory usage and operation timing
- [ ] **Security Testing**: Verify input validation and sanitization
- [ ] **Integration Testing**: Test service coordination and dependencies
- [ ] **Documentation**: Update testing methodology and service documentation
- [ ] **Quality Validation**: Ensure clean SideQuest report and test pass rate
- [ ] **Task Completion**: Mark as complete only after all criteria met

### Testing-First Development Pattern

The project follows a service-oriented testing approach:

1. **Service Design**: Define service interfaces and responsibilities
2. **Mock Creation**: Build scenario-based mocks before implementation
3. **Test Writing**: Create comprehensive test suites covering expected behavior
4. **Implementation**: Build service functionality to satisfy test requirements
5. **Edge Case Testing**: Add error condition and boundary testing
6. **Performance Testing**: Validate resource usage and operation efficiency
7. **Integration Testing**: Test cross-service coordination and dependencies
8. **Quality Validation**: Run full SideQuest analysis and test suite
9. **Documentation**: Update testing patterns and service documentation

### Alpha Release Readiness Criteria

The codebase is considered alpha-ready when:

- **Test Coverage**: 90%+ coverage across service layer with 100% test pass rate
- **Code Quality**: Zero TypeScript errors, zero ESLint violations
- **Security**: All external boundaries protected with Zod validation
- **Performance**: All tests complete in under 30 seconds with memory efficiency
- **Self-Analysis**: Clean SideQuest report with zero violations
- **Documentation**: Complete testing methodology and service documentation
- **CI/CD**: All pipeline checks passing across Node.js versions

This testing architecture ensures the SideQuest Code Quality Orchestrator maintains enterprise-grade reliability, security, and performance standards suitable for production deployment.
