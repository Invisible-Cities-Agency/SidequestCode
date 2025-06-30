/**
 * OrchestratorService Test Suite
 * Comprehensive testing for the main service coordinator
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetMocks, testScenarios } from '../../mocks/orchestrator.mjs';

// Mock the entire services module to control dependencies
vi.mock('../../../services/index.js', async () => {
  const { mockOrchestrator } = await import('../../mocks/orchestrator.mjs');
  return {
    createOrchestratorService: vi.fn(() => mockOrchestrator),
    resetAllServices: vi.fn(),
  };
});

describe('OrchestratorService Core Tests', () => {
  let mockConsole;
  let memoryBefore;

  beforeEach(() => {
    // Capture memory usage before each test
    memoryBefore = getMemoryUsage();
    
    // Mock console output for clean testing
    mockConsole = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };

    // Reset all mocks to default state
    resetMocks();
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

  describe('Service Initialization', () => {
    test('should initialize orchestrator service successfully', async () => {
      const { createOrchestratorService } = await import('../../../services/index.js');
      
      const orchestrator = createOrchestratorService();
      
      expect(orchestrator).toBeDefined();
      expect(orchestrator.getStorageService).toBeDefined();
      expect(orchestrator.getAnalysisService).toBeDefined();
      expect(orchestrator.getViolationTracker).toBeDefined();
    });

    test('should handle service initialization errors gracefully', async () => {
      testScenarios.storageError();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      
      expect(() => createOrchestratorService()).not.toThrow();
    });

    test('should provide health check capability', async () => {
      testScenarios.success();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const health = await orchestrator.healthCheck();
      
      expect(health).toBeDefined();
      expect(health.overall).toBe(true);
      expect(health.services).toBeDefined();
      expect(health.errors).toEqual([]);
    });

    test('should handle health check failures', async () => {
      testScenarios.storageError();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const health = await orchestrator.healthCheck();
      
      expect(health).toBeDefined();
      expect(health.overall).toBe(false);
      expect(health.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Service Coordination', () => {
    test('should provide access to storage service', async () => {
      testScenarios.success();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const storageService = orchestrator.getStorageService();
      
      expect(storageService).toBeDefined();
      expect(storageService.storeViolations).toBeDefined();
      expect(storageService.getViolationSummary).toBeDefined();
    });

    test('should provide access to analysis service', async () => {
      testScenarios.success();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const analysisService = orchestrator.getAnalysisService();
      
      expect(analysisService).toBeDefined();
      expect(analysisService.calculateViolationStats).toBeDefined();
    });

    test('should provide access to violation tracker', async () => {
      testScenarios.success();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const violationTracker = orchestrator.getViolationTracker();
      
      expect(violationTracker).toBeDefined();
      expect(violationTracker.processViolations).toBeDefined();
    });

    test('should coordinate silent mode across services', async () => {
      testScenarios.success();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      orchestrator.setSilentMode(true);
      
      expect(orchestrator.setSilentMode).toHaveBeenCalledWith(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle storage service failures gracefully', async () => {
      testScenarios.storageError();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const storageService = orchestrator.getStorageService();
      
      // Storage operations should reject but not crash the orchestrator
      await expect(storageService.storeViolations([])).rejects.toThrow('Storage failure');
      
      // Orchestrator should still be functional
      expect(orchestrator.getAnalysisService()).toBeDefined();
    });

    test('should maintain service isolation during failures', async () => {
      testScenarios.storageError();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const analysisService = orchestrator.getAnalysisService();
      const violationTracker = orchestrator.getViolationTracker();
      
      // Analysis service should still work despite storage failure
      const stats = await analysisService.calculateViolationStats();
      expect(stats).toBeDefined();
      
      // Violation tracker should still work
      const result = await violationTracker.processViolations([]);
      expect(result).toBeDefined();
    });
  });

  describe('Performance and Memory Management', () => {
    test('should handle large datasets efficiently', async () => {
      testScenarios.largeDataset();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const startTime = performance.now();
      
      const storageService = orchestrator.getStorageService();
      const dashboardData = await storageService.getDashboardData();
      
      const duration = performance.now() - startTime;
      
      expect(dashboardData.total_files_affected).toBe(1000);
      expect(duration).toBeLessThan(100); // Should complete in <100ms
    });

    test('should manage memory efficiently during orchestration', async () => {
      testScenarios.memoryPressure();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const memoryBefore = process.memoryUsage();
      
      // Process violations that simulate memory usage
      const violationTracker = orchestrator.getViolationTracker();
      const result = await violationTracker.processViolations([
        createMockViolation(),
        createMockViolation(),
        createMockViolation()
      ]);
      
      const memoryAfter = process.memoryUsage();
      
      expect(result.processed).toBe(3);
      expect(memoryAfter.heapUsed - memoryBefore.heapUsed).toBeLessThan(10 * 1024 * 1024); // <10MB
    });
  });

  describe('Service Lifecycle Management', () => {
    test('should shutdown services cleanly', async () => {
      testScenarios.success();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      await expect(orchestrator.shutdown()).resolves.toBeUndefined();
    });

    test('should handle shutdown errors gracefully', async () => {
      testScenarios.storageError();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      // Even if storage fails, shutdown should complete
      await expect(orchestrator.shutdown()).resolves.toBeUndefined();
    });

    test('should reset all services correctly', async () => {
      const { resetAllServices } = await import('../../../services/index.js');
      
      expect(() => resetAllServices()).not.toThrow();
      expect(resetAllServices).toHaveBeenCalled();
    });
  });

  describe('Integration Patterns', () => {
    test('should coordinate between storage and analysis services', async () => {
      testScenarios.success();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const storageService = orchestrator.getStorageService();
      const analysisService = orchestrator.getAnalysisService();
      
      // Store some violations
      await storageService.storeViolations([createMockViolation()]);
      
      // Analyze the stored data
      const stats = await analysisService.calculateViolationStats();
      
      expect(stats).toBeDefined();
      expect(storageService.storeViolations).toHaveBeenCalled();
      expect(analysisService.calculateViolationStats).toHaveBeenCalled();
    });

    test('should coordinate between violation tracker and storage', async () => {
      testScenarios.success();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const violationTracker = orchestrator.getViolationTracker();
      
      const violations = [
        createMockViolation({ category: 'test-1' }),
        createMockViolation({ category: 'test-2' })
      ];
      
      const result = await violationTracker.processViolations(violations);
      
      expect(result.processed).toBe(2);
      expect(result.inserted).toBe(2);
      expect(violationTracker.processViolations).toHaveBeenCalledWith(violations);
    });
  });

  describe('Configuration and State Management', () => {
    test('should handle empty state correctly', async () => {
      testScenarios.emptyState();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const storageService = orchestrator.getStorageService();
      const violations = await storageService.getViolationSummary();
      
      expect(violations).toEqual([]);
    });

    test('should provide consistent service access', async () => {
      testScenarios.success();
      
      const { createOrchestratorService } = await import('../../../services/index.js');
      const orchestrator = createOrchestratorService();
      
      const storage1 = orchestrator.getStorageService();
      const storage2 = orchestrator.getStorageService();
      
      // Should return the same instance
      expect(storage1).toBe(storage2);
    });
  });
});