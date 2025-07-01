/**
 * Configuration Bridge for Unified Orchestrator
 * 
 * Provides utilities to convert legacy CLI flags and configurations
 * to the new UnifiedOrchestratorConfig format, enabling seamless
 * migration from dual orchestrator architecture.
 */

import type { UnifiedOrchestratorConfig } from "../services/unified-orchestrator.js";

/**
 * CLI flags interface (extracted from existing CLI implementation)
 */
export interface CLIFlags {
  targetPath: string;
  eslintOnly?: boolean;
  includeAny?: boolean;
  strict?: boolean;
  verbose?: boolean;
  generatePRD?: boolean;
  noCrossoverCheck?: boolean;
  failOnCrossover?: boolean;
  watch?: boolean;
}

// convertLegacyToUnifiedConfig function removed - no longer needed 
// since legacy orchestrator has been fully replaced

/**
 * Create unified orchestrator configuration from CLI flags
 */
export function createUnifiedConfigFromFlags(flags: CLIFlags): UnifiedOrchestratorConfig {
  return {
    // Analysis Configuration
    targetPath: flags.targetPath,
    engines: {
      typescript: {
        enabled: !flags.eslintOnly,
        options: {
          includeAny: flags.includeAny || false,
          strict: flags.strict || false,
          targetPath: flags.targetPath,
        },
        priority: 1,
        timeout: 30_000,
        allowFailure: false,
      },
      eslint: {
        enabled: true,
        options: {
          includeTypescriptRules: !flags.eslintOnly,
          targetPath: flags.targetPath,
        },
        priority: 2,
        timeout: 60_000,
        allowFailure: false,
      },
      unusedExports: {
        enabled: true,
        options: {
          targetPath: flags.targetPath,
        },
        priority: 3,
        timeout: 30_000,
        allowFailure: true,
      },
      zodDetection: {
        enabled: true,
        options: {
          targetPath: flags.targetPath,
        },
        priority: 4,
        timeout: 15_000,
        allowFailure: true,
      },
    },
    deduplication: {
      enabled: true,
      strategy: "exact",
    },
    crossover: {
      enabled: !flags.noCrossoverCheck,
      warnOnTypeAwareRules: true,
      warnOnDuplicateViolations: true,
      failOnCrossover: flags.failOnCrossover || false,
    },
    output: {
      console: !flags.verbose, // Console output disabled in verbose mode (JSON only)
      ...(flags.verbose ? { json: "stdout" } : {}),
    },
    
    // Service Configuration
    database: {
      path: "./data/dev-code-quality.db",
      enableWAL: true,
      maxHistoryDays: 30,
    },
    polling: {
      defaultFrequencyMs: 30_000,
      maxConcurrentChecks: 3,
      adaptivePolling: true,
    },
    watch: {
      intervalMs: 3000,
      debounceMs: 500,
      autoCleanup: true,
    },
    performance: {
      batchSize: 100,
      enableMetrics: true,
    },
  };
}

/**
 * Create watch mode configuration from CLI flags
 */
export function createWatchModeConfig(flags: CLIFlags): UnifiedOrchestratorConfig {
  const baseConfig = createUnifiedConfigFromFlags(flags);
  
  // Watch mode specific adjustments
  return {
    ...baseConfig,
    engines: {
      ...baseConfig.engines,
      // In watch mode, always enable ESLint for comprehensive analysis
      eslint: {
        ...baseConfig.engines.eslint!,
        enabled: true,
      },
    },
    output: {
      // In watch mode, always use console output for real-time display
      console: true,
    },
    watch: {
      intervalMs: 3000,
      debounceMs: 500,
      autoCleanup: true,
    },
  };
}

/**
 * Create PRD generation configuration from CLI flags
 */
export function createPRDConfig(flags: CLIFlags): UnifiedOrchestratorConfig {
  const baseConfig = createUnifiedConfigFromFlags(flags);
  
  // PRD generation specific adjustments
  return {
    ...baseConfig,
    engines: {
      typescript: {
        enabled: true, // Always enable TypeScript for comprehensive PRD analysis
        options: {
          includeAny: true, // Include any-type violations for PRD
          strict: true, // Use strict mode for comprehensive analysis
          targetPath: flags.targetPath,
        },
        priority: 1,
        timeout: 60_000, // Longer timeout for comprehensive analysis
        allowFailure: false,
      },
      eslint: {
        enabled: true, // Always enable ESLint for comprehensive PRD analysis
        options: {
          includeTypescriptRules: true,
          targetPath: flags.targetPath,
        },
        priority: 2,
        timeout: 120_000, // Longer timeout for comprehensive analysis
        allowFailure: false,
      },
      unusedExports: {
        enabled: true,
        options: {
          targetPath: flags.targetPath,
        },
        priority: 3,
        timeout: 60_000,
        allowFailure: true,
      },
      zodDetection: {
        enabled: true,
        options: {
          targetPath: flags.targetPath,
        },
        priority: 4,
        timeout: 30_000,
        allowFailure: true,
      },
    },
    crossover: {
      enabled: true, // Always enable crossover detection for PRD
      warnOnTypeAwareRules: true,
      warnOnDuplicateViolations: true,
      failOnCrossover: false, // Don't fail PRD generation on crossover issues
    },
    output: {
      console: false, // Disable console output for PRD generation
    },
  };
}