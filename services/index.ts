/**
 * Services Module Index
 * Clean exports for all Code Quality Orchestrator services
 */

// ============================================================================
// Interface Exports
// ============================================================================

export type {
  IStorageService,
  IPollingService,
  IAnalysisService,
  IViolationTracker,
  IOrchestratorService,
  
  // Supporting Types
  TimeRange,
  ViolationTrend,
  RulePerformanceAnalysis,
  FileQualityTrend,
  ViolationStats,
  ProblemFile,
  FlakyRule,
  ViolationPrediction,
  RuleFrequencyRecommendation,
  QualityReport,
  RuleEfficiencyReport,
  ProcessingResult,
  ValidationResult,
  WatchModeOptions,
  OrchestratorConfig,
  HealthCheckResult,
  SystemStats
} from './interfaces.js';

// ============================================================================
// Service Implementation Exports
// ============================================================================

// Storage Service
export {
  StorageService,
  getStorageService,
  resetStorageService
} from './storage-service.js';

// Polling Service
export {
  PollingService,
  getPollingService,
  resetPollingService
} from './polling-service.js';

// Analysis Service
export {
  AnalysisService,
  getAnalysisService,
  resetAnalysisService
} from './analysis-service.js';

// Violation Tracker
export {
  ViolationTracker,
  getViolationTracker,
  resetViolationTracker
} from './violation-tracker.js';

// Configuration Manager
export {
  ConfigManager,
  DEFAULT_CONFIG,
  validateConfig,
  getEnvironmentConfig
} from './config-manager.js';

// Main Orchestrator Service
export {
  OrchestratorService,
  getOrchestratorService,
  resetOrchestratorService,
  createOrchestratorService
} from './orchestrator-service.js';

// ============================================================================
// Convenience Factory Functions
// ============================================================================

import { ConfigManager } from './config-manager.js';
import { getStorageService } from './storage-service.js';
import { getPollingService } from './polling-service.js';
import { getAnalysisService } from './analysis-service.js';
import { getViolationTracker } from './violation-tracker.js';
import { createOrchestratorService } from './orchestrator-service.js';

/**
 * Create a complete service suite for a given environment
 */
export async function createServiceSuite(
  environment: 'development' | 'test' | 'production' = 'development'
) {
  const configManager = ConfigManager.createEnvironmentConfig(environment);
  const { storageService } = await configManager.initializeServices();
  
  return {
    configManager,
    storageService,
    pollingService: getPollingService(storageService),
    analysisService: getAnalysisService(storageService),
    violationTracker: getViolationTracker(storageService),
    orchestratorService: await createOrchestratorService(environment)
  };
}

// Import reset functions directly for synchronous access
import { resetStorageService } from './storage-service.js';
import { resetPollingService } from './polling-service.js';
import { resetAnalysisService } from './analysis-service.js';
import { resetViolationTracker } from './violation-tracker.js';
import { resetOrchestratorService } from './orchestrator-service.js';

/**
 * Reset all service instances (useful for testing)
 */
export function resetAllServices(): void {
  resetStorageService();
  resetPollingService();
  resetAnalysisService();
  resetViolationTracker();
  resetOrchestratorService();
}