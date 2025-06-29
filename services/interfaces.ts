/**
 * Service Interfaces for Code Quality Orchestrator
 * Defines contracts for module separation and clean architecture
 */

import type {
  Violation as OrchestratorViolation
} from '../utils/violation-types.js';

import type {
  Violation,
  // NewViolation,
  // RuleCheck,
  ViolationHistory,
  RuleSchedule,
  NewRuleSchedule,
  DashboardData,
  ViolationQueryParameters,
  HistoryQueryParameters
} from '../database/types.js';

// ============================================================================
// Simple type definitions for missing types
// ============================================================================

export interface RuleCheckResult {
  rule: string;
  engine: 'typescript' | 'eslint';
  checkId?: number;
  success: boolean;
  violationCount: number;
  executionTime: number;
  error?: string;
  filesChecked?: number;
  filesWithViolations?: number;
  violations?: any[];
}

// ============================================================================
// Core Service Interfaces
// ============================================================================

/**
 * Storage Service Interface
 * Handles all database operations and data persistence
 */
export interface IStorageService {
  // Violation Management
  storeViolations(violations: OrchestratorViolation[]): Promise<{
    inserted: number;
    updated: number;
    errors: string[];
  }>;

  getViolations(parameters?: ViolationQueryParameters): Promise<Violation[]>;
  getViolationSummary(): Promise<any[]>;
  resolveViolations(hashes: string[]): Promise<number>;

  // Rule Check Management
  startRuleCheck(rule: string, engine: 'typescript' | 'eslint'): Promise<number>;
  completeRuleCheck(
    checkId: number,
    violationsFound: number,
    executionTimeMs: number,
    filesChecked?: number,
    filesWithViolations?: number
  ): Promise<void>;
  failRuleCheck(checkId: number, errorMessage: string): Promise<void>;

  // Historical Analysis
  recordViolationDeltas(checkId: number, currentViolationHashes: string[]): Promise<{
    added: number;
    removed: number;
    unchanged: number;
  }>;
  getViolationHistory(parameters?: HistoryQueryParameters): Promise<ViolationHistory[]>;

  // Rule Scheduling
  upsertRuleSchedule(schedule: NewRuleSchedule): Promise<number>;
  getNextRulesToCheck(limit?: number): Promise<RuleSchedule[]>;

  // Dashboard and Analytics
  getDashboardData(): Promise<DashboardData>;

  // Performance and Maintenance
  recordPerformanceMetric(type: string, value: number, unit: string, context?: string): Promise<void>;
  cleanupOldData(): Promise<any>;
  getStorageStats(): Promise<any>;
}

/**
 * Polling Service Interface
 * Manages rule execution scheduling and coordination
 */
export interface IPollingService {
  // Lifecycle Management
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isRunning(): boolean;

  // Rule Scheduling
  scheduleRule(rule: string, engine: 'typescript' | 'eslint', frequencyMs?: number): Promise<void>;
  unscheduleRule(rule: string, engine: 'typescript' | 'eslint'): Promise<void>;
  getScheduledRules(): Promise<RuleSchedule[]>;

  // Execution Control
  executeRule(rule: string, engine: 'typescript' | 'eslint'): Promise<RuleCheckResult>;
  executeNextRules(maxConcurrent?: number): Promise<RuleCheckResult[]>;

  // Configuration
  setDefaultFrequency(frequencyMs: number): void;
  setMaxConcurrentChecks(max: number): void;
  enableAdaptivePolling(enabled: boolean): void;

  // Events
  on(event: 'ruleStarted', listener: (rule: string, engine: string) => void): void;
  on(event: 'ruleCompleted', listener: (result: RuleCheckResult) => void): void;
  on(event: 'ruleFailed', listener: (rule: string, engine: string, error: Error) => void): void;
  on(event: 'cycleCompleted', listener: (results: RuleCheckResult[]) => void): void;
}

/**
 * Analysis Service Interface
 * Provides historical analysis and delta computation
 */
export interface IAnalysisService {
  // Delta Analysis
  computeViolationDeltas(
    previousViolations: string[],
    currentViolations: string[]
  ): {
    added: string[];
    removed: string[];
    unchanged: string[];
  };

  // Historical Analysis
  getViolationTrends(timeRange: TimeRange): Promise<ViolationTrend[]>;
  getRulePerformanceAnalysis(ruleId?: string): Promise<RulePerformanceAnalysis[]>;
  getFileQualityTrends(filePath?: string): Promise<FileQualityTrend[]>;

  // Statistical Analysis
  calculateViolationStats(timeRange: TimeRange): Promise<ViolationStats>;
  identifyProblemFiles(threshold?: number): Promise<ProblemFile[]>;
  detectRuleFlakyness(minRuns?: number): Promise<FlakyRule[]>;

  // Predictive Analysis
  predictViolationGrowth(timeRange: TimeRange): Promise<ViolationPrediction>;
  recommendRuleFrequencies(): Promise<RuleFrequencyRecommendation[]>;

  // Report Generation
  generateQualityReport(timeRange: TimeRange): Promise<QualityReport>;
  generateRuleEfficiencyReport(): Promise<RuleEfficiencyReport>;
}

/**
 * Violation Tracker Interface
 * Manages violation lifecycle and deduplication
 */
export interface IViolationTracker {
  // Violation Processing
  processViolations(violations: OrchestratorViolation[]): Promise<ProcessingResult>;
  deduplicateViolations(violations: OrchestratorViolation[]): OrchestratorViolation[];

  // Lifecycle Management
  markAsResolved(violationHashes: string[]): Promise<number>;
  markAsIgnored(violationHashes: string[]): Promise<number>;
  reactivateViolations(violationHashes: string[]): Promise<number>;

  // Hash Management
  generateViolationHash(violation: OrchestratorViolation): string;
  validateViolationHash(violation: OrchestratorViolation, hash: string): boolean;

  // Filtering and Querying
  filterViolationsByRule(violations: OrchestratorViolation[], ruleIds: string[]): OrchestratorViolation[];
  filterViolationsBySeverity(violations: OrchestratorViolation[], severities: string[]): OrchestratorViolation[];
  filterViolationsByFile(violations: OrchestratorViolation[], filePaths: string[]): OrchestratorViolation[];

  // Validation
  validateViolation(violation: OrchestratorViolation): ValidationResult;
  sanitizeViolation(violation: OrchestratorViolation): OrchestratorViolation;

  // Configuration
  setSilentMode(silent: boolean): void;
}

/**
 * Orchestrator Service Interface
 * Main coordination service that brings all services together
 */
export interface IOrchestratorService {
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Services Access
  getStorageService(): IStorageService;
  getPollingService(): IPollingService;
  getAnalysisService(): IAnalysisService;
  getViolationTracker(): IViolationTracker;

  // Watch Mode
  startWatchMode(options?: WatchModeOptions): Promise<void>;
  stopWatchMode(): Promise<void>;
  isWatchModeActive(): boolean;

  // Manual Operations
  runSingleCheck(rule: string, engine: 'typescript' | 'eslint'): Promise<RuleCheckResult>;
  runAllChecks(): Promise<RuleCheckResult[]>;

  // Configuration
  updateConfiguration(config: Partial<OrchestratorConfig>): Promise<void>;
  getConfiguration(): OrchestratorConfig;

  // Health and Monitoring
  healthCheck(): Promise<HealthCheckResult>;
  getSystemStats(): Promise<SystemStats>;

  // Events
  on(event: string, listener: (...arguments_: any[]) => void): void;
  off(event: string, listener: (...arguments_: any[]) => void): void;
  emit(event: string, ...arguments_: any[]): void;
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface ViolationTrend {
  date: string;
  count: number;
  severity: string;
  category: string;
}

export interface RulePerformanceAnalysis {
  rule: string;
  engine: string;
  avgExecutionTime: number;
  avgViolationsFound: number;
  successRate: number;
  lastRun: string;
  trend: 'improving' | 'stable' | 'degrading';
}

export interface FileQualityTrend {
  filePath: string;
  violationCount: number;
  trend: 'improving' | 'stable' | 'degrading';
  categories: string[];
}

export interface ViolationStats {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  bySource: Record<string, number>;
  avgPerFile: number;
  filesAffected: number;
}

export interface ProblemFile {
  filePath: string;
  violationCount: number;
  severityScore: number;
  categories: string[];
  lastModified: string;
}

export interface FlakyRule {
  rule: string;
  engine: string;
  varianceScore: number;
  runCount: number;
  avgViolations: number;
  stdDeviation: number;
}

export interface ViolationPrediction {
  projectedGrowth: number;
  confidence: number;
  timeframe: string;
  factors: string[];
}

export interface RuleFrequencyRecommendation {
  rule: string;
  engine: string;
  currentFrequency: number;
  recommendedFrequency: number;
  reasoning: string;
}

export interface QualityReport {
  timeRange: TimeRange;
  summary: ViolationStats;
  trends: ViolationTrend[];
  problemFiles: ProblemFile[];
  rulePerformance: RulePerformanceAnalysis[];
  recommendations: string[];
}

export interface RuleEfficiencyReport {
  totalRules: number;
  activeRules: number;
  avgExecutionTime: number;
  resourceUtilization: number;
  recommendations: RuleFrequencyRecommendation[];
}

export interface ProcessingResult {
  processed: number;
  inserted: number;
  updated: number;
  deduplicated: number;
  errors: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface WatchModeOptions {
  intervalMs?: number;
  debounceMs?: number;
  autoCleanup?: boolean;
  maxConcurrentChecks?: number;
}

export interface OrchestratorConfig {
  database: {
    path: string;
    enableWAL: boolean;
    maxHistoryDays: number;
  };
  polling: {
    defaultFrequencyMs: number;
    maxConcurrentChecks: number;
    adaptivePolling: boolean;
  };
  watch: {
    intervalMs: number;
    debounceMs: number;
    autoCleanup: boolean;
  };
  performance: {
    batchSize: number;
    enableMetrics: boolean;
  };
}

export interface HealthCheckResult {
  overall: boolean;
  services: {
    storage: boolean;
    polling: boolean;
    analysis: boolean;
    tracker: boolean;
  };
  errors: string[];
}

export interface SystemStats {
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  database: any;
  storage: any;
  activeChecks: number;
  watchMode: boolean;
}
