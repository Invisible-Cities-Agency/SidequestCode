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
export { ConfigManager } from './config-manager.js';
export { PreferencesManager } from './preferences-manager.js';

// Export unified orchestrator components
export {
  UnifiedOrchestrator,
  getUnifiedOrchestrator,
  resetUnifiedOrchestrator,
  createUnifiedOrchestrator,
  createDefaultUnifiedConfig
} from './unified-orchestrator.js';

// Import classes for getter functions
import { PreferencesManager } from './preferences-manager.js';

// Export preferences manager getter function
export function getPreferencesManager(): PreferencesManager {
  return PreferencesManager.getInstance();
}

// ============================================================================
// Convenience Factory Functions
// ============================================================================

// Unused convenience imports removed

// Import reset functions directly for synchronous access
import { resetStorageService } from './storage-service.js';
import { resetPollingService } from './polling-service.js';
import { resetAnalysisService } from './analysis-service.js';
import { resetViolationTracker } from './violation-tracker.js';
import { resetUnifiedOrchestrator } from './unified-orchestrator.js';

/**
 * Reset all service instances (useful for testing)
 */
export function resetAllServices(): void {
  resetStorageService();
  resetPollingService();
  resetAnalysisService();
  resetViolationTracker();
  resetUnifiedOrchestrator();
}
