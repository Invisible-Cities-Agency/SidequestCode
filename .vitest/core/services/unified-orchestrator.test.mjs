/**
 * @fileoverview Tests for UnifiedOrchestrator - Main Service Coordination
 * 
 * Tests the complete orchestration system including:
 * - Service initialization and health monitoring
 * - Analysis coordination between TypeScript and ESLint
 * - Watch mode file monitoring and event handling
 * - Error recovery and graceful degradation
 * - Performance monitoring and resource management
 * - Event emission and subscriber management
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { UnifiedOrchestrator } from '../../../services/unified-orchestrator.ts';

// Mock dependencies
const createMockAnalysisService = () => ({
  analyzeProject: vi.fn(),
  reset: vi.fn(),
  healthCheck: vi.fn()
});

const createMockStorageService = () => ({
  storeViolations: vi.fn(),
  getStorageStats: vi.fn(),
  recordPerformanceMetric: vi.fn(),
  cleanupOldData: vi.fn()
});

const createMockViolationTracker = () => ({
  processViolations: vi.fn(),
  setSilentMode: vi.fn(),
  clearCaches: vi.fn(),
  getCacheStats: vi.fn()
});

const createMockPollingService = () => {
  const mockEmitter = new EventEmitter();
  return {
    start: vi.fn(),
    stop: vi.fn(),
    updateConfig: vi.fn(),
    isRunning: vi.fn(),
    on: mockEmitter.on.bind(mockEmitter),
    emit: mockEmitter.emit.bind(mockEmitter),
    removeListener: mockEmitter.removeListener.bind(mockEmitter)
  };
};

const createMockConfigManager = () => ({
  loadConfiguration: vi.fn(),
  validateConfiguration: vi.fn(),
  getEffectiveConfig: vi.fn()
});

// Mock service factories
vi.mock('../../../services/index.ts', () => ({
  createAnalysisService: () => createMockAnalysisService(),
  createStorageService: () => createMockStorageService(),
  createViolationTracker: () => createMockViolationTracker(),
  createPollingService: () => createMockPollingService(),
  createConfigManager: () => createMockConfigManager()
}));

describe('UnifiedOrchestrator', () => {
  let orchestrator;
  let mockServices;
  let originalConsoleLog;

  beforeEach(() => {
    // Mock console to capture logs
    originalConsoleLog = console.log;
    console.log = vi.fn();

    // Create orchestrator with mocked services
    orchestrator = new UnifiedOrchestrator();
    
    // Get references to mocked services for test setup
    mockServices = {
      analysis: orchestrator.analysisService,
      storage: orchestrator.storageService,
      violationTracker: orchestrator.violationTracker,
      polling: orchestrator.pollingService,
      config: orchestrator.configManager
    };

    // Setup default successful responses
    mockServices.analysis.analyzeProject.mockResolvedValue({
      violations: [
        { file: '/test/file.ts', line: 1, message: 'Test error', severity: 'error', source: 'typescript', category: 'error' }
      ],
      summary: { total: 1, errors: 1, warnings: 0 },
      metadata: { duration: 100, filesAnalyzed: 1 }
    });

    mockServices.analysis.healthCheck.mockResolvedValue({ healthy: true });
    
    mockServices.storage.getStorageStats.mockResolvedValue({
      totalViolations: 0,
      activeViolations: 0,
      totalRuleChecks: 0,
      totalHistoryRecords: 0
    });

    mockServices.violationTracker.processViolations.mockResolvedValue({
      processed: 1,
      inserted: 1,
      updated: 0,
      deduplicated: 0,
      errors: []
    });

    mockServices.violationTracker.getCacheStats.mockReturnValue({
      validationCacheSize: 0,
      hashCacheSize: 0,
      totalCacheSize: 0
    });

    mockServices.config.loadConfiguration.mockReturnValue({
      analysis: { includeESLint: false, strictMode: false },
      watch: { enabled: false, debounceMs: 500 }
    });

    mockServices.config.getEffectiveConfig.mockReturnValue({
      analysis: { includeESLint: false, strictMode: false },
      watch: { enabled: false, debounceMs: 500 }
    });

    mockServices.polling.isRunning.mockReturnValue(false);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    vi.clearAllMocks();
  });

  describe('Initialization and Health', () => {
    test('should initialize all services successfully', async () => {
      const health = await orchestrator.healthCheck();

      expect(health.overall).toBe(true);
      expect(health.services).toBeDefined();
      expect(health.errors).toEqual([]);
      expect(mockServices.analysis.healthCheck).toHaveBeenCalled();
    });

    test('should handle service initialization failures', async () => {
      mockServices.analysis.healthCheck.mockRejectedValue(new Error('Analysis service failed'));

      const health = await orchestrator.healthCheck();

      expect(health.overall).toBe(false);
      expect(health.errors.length).toBeGreaterThan(0);
      expect(health.errors.some(error => error.includes('Analysis service failed'))).toBe(true);
    });

    test('should provide detailed service status', async () => {
      const health = await orchestrator.healthCheck();

      expect(health.services.analysis).toBeDefined();
      expect(health.services.storage).toBeDefined();
      expect(health.services.tracker).toBeDefined();
      expect(health.services.polling).toBeDefined();
    });

    test('should include performance metrics in health check', async () => {
      const health = await orchestrator.healthCheck();

      expect(health.performance).toBeDefined();
      expect(health.performance.cacheStats).toBeDefined();
      expect(health.performance.storageStats).toBeDefined();
    });
  });

  describe('Analysis Operations', () => {
    test('should run TypeScript-only analysis successfully', async () => {
      const result = await orchestrator.runAnalysis('/test/project', {
        includeESLint: false,
        silent: false
      });

      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.summary.total).toBe(1);
      expect(mockServices.analysis.analyzeProject).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({ includeESLint: false })
      );
    });

    test('should run combined TypeScript and ESLint analysis', async () => {
      const result = await orchestrator.runAnalysis('/test/project', {
        includeESLint: true,
        silent: false
      });

      expect(result.success).toBe(true);
      expect(mockServices.analysis.analyzeProject).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({ includeESLint: true })
      );
    });

    test('should handle analysis failures gracefully', async () => {
      mockServices.analysis.analyzeProject.mockRejectedValue(new Error('Analysis failed'));

      const result = await orchestrator.runAnalysis('/test/project');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Analysis failed');
      expect(result.violations).toEqual([]);
    });

    test('should process violations after successful analysis', async () => {
      await orchestrator.runAnalysis('/test/project');

      expect(mockServices.violationTracker.processViolations).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ file: '/test/file.ts' })
        ])
      );
    });

    test('should record performance metrics during analysis', async () => {
      await orchestrator.runAnalysis('/test/project');

      expect(mockServices.storage.recordPerformanceMetric).toHaveBeenCalledWith(
        'full_analysis',
        expect.any(Number),
        'ms',
        expect.any(String)
      );
    });

    test('should handle silent mode correctly', async () => {
      mockServices.violationTracker.setSilentMode = vi.fn();

      await orchestrator.runAnalysis('/test/project', { silent: true });

      expect(mockServices.violationTracker.setSilentMode).toHaveBeenCalledWith(true);
    });
  });

  describe('Watch Mode Operations', () => {
    test('should start watch mode successfully', async () => {
      const result = await orchestrator.startWatchMode('/test/project', {
        debounceMs: 1000
      });

      expect(result.success).toBe(true);
      expect(mockServices.polling.start).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({ debounceMs: 1000 })
      );
    });

    test('should prevent starting watch mode when already running', async () => {
      mockServices.polling.isRunning.mockReturnValue(true);

      const result = await orchestrator.startWatchMode('/test/project');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already running');
      expect(mockServices.polling.start).not.toHaveBeenCalled();
    });

    test('should stop watch mode successfully', async () => {
      mockServices.polling.isRunning.mockReturnValue(true);

      const result = await orchestrator.stopWatchMode();

      expect(result.success).toBe(true);
      expect(mockServices.polling.stop).toHaveBeenCalled();
    });

    test('should handle watch mode start failures', async () => {
      mockServices.polling.start.mockRejectedValue(new Error('Polling failed'));

      const result = await orchestrator.startWatchMode('/test/project');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Polling failed');
    });

    test('should handle file change events during watch mode', async () => {
      // Start watch mode
      await orchestrator.startWatchMode('/test/project');

      // Simulate file change event
      mockServices.polling.emit('change', {
        type: 'change',
        files: ['/test/file.ts'],
        timestamp: Date.now()
      });

      // Allow event processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockServices.analysis.analyzeProject).toHaveBeenCalled();
    });

    test('should emit watch events to subscribers', async () => {
      const mockSubscriber = vi.fn();
      orchestrator.onWatchEvent(mockSubscriber);

      await orchestrator.startWatchMode('/test/project');

      // Simulate file change
      mockServices.polling.emit('change', {
        type: 'change',
        files: ['/test/file.ts'],
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSubscriber).toHaveBeenCalled();
    });
  });

  describe('Event Management', () => {
    test('should add watch event subscribers', () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();

      orchestrator.onWatchEvent(subscriber1);
      orchestrator.onWatchEvent(subscriber2);

      expect(orchestrator.watchEventSubscribers).toHaveLength(2);
    });

    test('should remove watch event subscribers', () => {
      const subscriber = vi.fn();

      orchestrator.onWatchEvent(subscriber);
      expect(orchestrator.watchEventSubscribers).toHaveLength(1);

      orchestrator.offWatchEvent(subscriber);
      expect(orchestrator.watchEventSubscribers).toHaveLength(0);
    });

    test('should emit events to all subscribers', async () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();

      orchestrator.onWatchEvent(subscriber1);
      orchestrator.onWatchEvent(subscriber2);

      await orchestrator.startWatchMode('/test/project');

      // Simulate event
      mockServices.polling.emit('change', {
        type: 'change',
        files: ['/test/file.ts'],
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(subscriber1).toHaveBeenCalled();
      expect(subscriber2).toHaveBeenCalled();
    });
  });

  describe('Configuration Management', () => {
    test('should update watch configuration', async () => {
      const newConfig = { debounceMs: 2000, intervalMs: 5000 };

      const result = await orchestrator.updateWatchConfig(newConfig);

      expect(result.success).toBe(true);
      expect(mockServices.polling.updateConfig).toHaveBeenCalledWith(newConfig);
    });

    test('should handle configuration update failures', async () => {
      mockServices.polling.updateConfig.mockRejectedValue(new Error('Config update failed'));

      const result = await orchestrator.updateWatchConfig({ debounceMs: 1000 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Config update failed');
    });
  });

  describe('Resource Management', () => {
    test('should reset all services', async () => {
      await orchestrator.reset();

      expect(mockServices.analysis.reset).toHaveBeenCalled();
      expect(mockServices.violationTracker.clearCaches).toHaveBeenCalled();
    });

    test('should cleanup resources properly', async () => {
      // Start watch mode first
      await orchestrator.startWatchMode('/test/project');

      await orchestrator.cleanup();

      expect(mockServices.polling.stop).toHaveBeenCalled();
      expect(orchestrator.watchEventSubscribers).toHaveLength(0);
    });

    test('should get comprehensive status', async () => {
      const status = await orchestrator.getStatus();

      expect(status.watchMode).toBeDefined();
      expect(status.health).toBeDefined();
      expect(status.performance).toBeDefined();
      expect(status.lastActivity).toBeDefined();
    });
  });

  describe('Error Recovery', () => {
    test('should handle polling service errors gracefully', async () => {
      await orchestrator.startWatchMode('/test/project');

      // Simulate polling error
      mockServices.polling.emit('error', new Error('Polling error'));

      // Should not crash and should log the error
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[UnifiedOrchestrator] Polling error')
      );
    });

    test('should recover from analysis failures in watch mode', async () => {
      await orchestrator.startWatchMode('/test/project');

      // Make analysis fail
      mockServices.analysis.analyzeProject.mockRejectedValueOnce(new Error('Analysis failed'));

      // Simulate file change
      mockServices.polling.emit('change', {
        type: 'change',
        files: ['/test/file.ts'],
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not crash and should continue working
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Watch analysis error')
      );
    });

    test('should maintain service health despite individual failures', async () => {
      mockServices.storage.getStorageStats.mockRejectedValue(new Error('Storage error'));

      const health = await orchestrator.healthCheck();

      // Should still report overall health status
      expect(health.overall).toBe(false);
      expect(health.errors.some(error => error.includes('Storage error'))).toBe(true);
    });
  });

  describe('Performance Monitoring', () => {
    test('should track watch mode performance', async () => {
      await orchestrator.startWatchMode('/test/project');

      // Simulate multiple file changes
      for (let i = 0; i < 3; i++) {
        mockServices.polling.emit('change', {
          type: 'change',
          files: [`/test/file${i}.ts`],
          timestamp: Date.now()
        });
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const status = await orchestrator.getStatus();
      expect(status.performance.analysisCount).toBeGreaterThan(0);
    });

    test('should maintain activity timestamps', async () => {
      const initialStatus = await orchestrator.getStatus();
      
      await orchestrator.runAnalysis('/test/project');
      
      const updatedStatus = await orchestrator.getStatus();
      expect(new Date(updatedStatus.lastActivity.lastAnalysis)).toBeInstanceOf(Date);
      expect(updatedStatus.lastActivity.lastAnalysis).not.toBe(initialStatus.lastActivity.lastAnalysis);
    });
  });
});