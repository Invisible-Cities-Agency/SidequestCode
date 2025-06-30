/**
 * Services Module Index
 * Clean exports for all Code Quality Orchestrator services
 */

// ============================================================================
// Interface Exports
// ============================================================================

// Most interface types removed - only used internally

// ============================================================================
// Service Implementation Exports
// ============================================================================

// Only export what's actually used
export { createOrchestratorService } from './orchestrator-service.js';

// ============================================================================
// Convenience Factory Functions
// ============================================================================

// Unused convenience imports removed

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
