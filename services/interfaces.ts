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
  storeViolations(_violations: OrchestratorViolation[]): Promise<{
    inserted: number;
    updated: number;
    errors: string[];
  }>;

  getViolations(_parameters?: ViolationQueryParameters): Promise<Violation[]>;
  getViolationSummary(): Promise<any[]>;
  resolveViolations(_hashes: string[]): Promise<number>;

  // Rule Check Management
  startRuleCheck(_rule: string, _engine: 'typescript' | 'eslint'): Promise<number>;
  completeRuleCheck(
    _checkId: number,
    _violationsFound: number,
    _executionTimeMs: number,
    _filesChecked?: number,
    _filesWithViolations?: number
  ): Promise<void>;
  failRuleCheck(_checkId: number, _errorMessage: string): Promise<void>;

  // Historical Analysis
  recordViolationDeltas(_checkId: number, _currentViolationHashes: string[]): Promise<{
    added: number;
    removed: number;
    unchanged: number;
  }>;
  getViolationHistory(_parameters?: HistoryQueryParameters): Promise<ViolationHistory[]>;

  // Rule Scheduling
  upsertRuleSchedule(_schedule: NewRuleSchedule): Promise<number>;
  getNextRulesToCheck(_limit?: number): Promise<RuleSchedule[]>;

  // Dashboard and Analytics
  getDashboardData(): Promise<DashboardData>;

  // Performance and Maintenance
  recordPerformanceMetric(_type: string, _value: number, _unit: string, _context?: string): Promise<void>;
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
  scheduleRule(_rule: string, _engine: 'typescript' | 'eslint', _frequencyMs?: number): Promise<void>;
  unscheduleRule(_rule: string, _engine: 'typescript' | 'eslint'): Promise<void>;
  getScheduledRules(): Promise<RuleSchedule[]>;

  // Execution Control
  executeRule(_rule: string, _engine: 'typescript' | 'eslint'): Promise<RuleCheckResult>;
  executeNextRules(_maxConcurrent?: number): Promise<RuleCheckResult[]>;

  // Configuration
  setDefaultFrequency(_frequencyMs: number): void;
  setMaxConcurrentChecks(_max: number): void;
  enableAdaptivePolling(_enabled: boolean): void;

  // Events
  on(_event: 'ruleStarted', _listener: (_rule: string, _engine: string) => void): void;
  on(_event: 'ruleCompleted', _listener: (_result: RuleCheckResult) => void): void;
  on(_event: 'ruleFailed', _listener: (_rule: string, _engine: string, _error: Error) => void): void;
  on(_event: 'cycleCompleted', _listener: (_results: RuleCheckResult[]) => void): void;
}

/**
 * Analysis Service Interface
 * Provides historical analysis and delta computation
 */
export interface IAnalysisService {
  // Delta Analysis
  computeViolationDeltas(
    _previousViolations: string[],
    _currentViolations: string[]
  ): {
    added: string[];
    removed: string[];
    unchanged: string[];
  };

  // Historical Analysis
  getViolationTrends(_timeRange: TimeRange): Promise<ViolationTrend[]>;
  getRulePerformanceAnalysis(_ruleId?: string): RulePerformanceAnalysis[];
  getFileQualityTrends(_filePath?: string): Promise<FileQualityTrend[]>;

  // Statistical Analysis
  calculateViolationStats(_timeRange: TimeRange): Promise<ViolationStats>;
  identifyProblemFiles(_threshold?: number): Promise<ProblemFile[]>;
  detectRuleFlakyness(_minRuns?: number): FlakyRule[];

  // Predictive Analysis
  predictViolationGrowth(_timeRange: TimeRange): Promise<ViolationPrediction>;
  recommendRuleFrequencies(): RuleFrequencyRecommendation[];

  // Report Generation
  generateQualityReport(_timeRange: TimeRange): Promise<QualityReport>;
  generateRuleEfficiencyReport(): Promise<RuleEfficiencyReport>;
}

/**
 * Violation Tracker Interface
 * Manages violation lifecycle and deduplication
 */
export interface IViolationTracker {
  // Violation Processing
  processViolations(_violations: OrchestratorViolation[]): Promise<ProcessingResult>;
  deduplicateViolations(_violations: OrchestratorViolation[]): OrchestratorViolation[];

  // Lifecycle Management
  markAsResolved(_violationHashes: string[]): Promise<number>;
  markAsIgnored(_violationHashes: string[]): Promise<number>;
  reactivateViolations(_violationHashes: string[]): Promise<number>;

  // Hash Management
  generateViolationHash(_violation: OrchestratorViolation): string;
  validateViolationHash(_violation: OrchestratorViolation, _hash: string): boolean;

  // Filtering and Querying
  filterViolationsByRule(_violations: OrchestratorViolation[], _ruleIds: string[]): OrchestratorViolation[];
  filterViolationsBySeverity(_violations: OrchestratorViolation[], _severities: string[]): OrchestratorViolation[];
  filterViolationsByFile(_violations: OrchestratorViolation[], _filePaths: string[]): OrchestratorViolation[];

  // Validation
  validateViolation(_violation: OrchestratorViolation): ValidationResult;
  sanitizeViolation(_violation: OrchestratorViolation): OrchestratorViolation;

  // Configuration
  setSilentMode(_silent: boolean): void;
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
  startWatchMode(_options?: WatchModeOptions): Promise<void>;
  stopWatchMode(): Promise<void>;
  isWatchModeActive(): boolean;

  // Manual Operations
  runSingleCheck(_rule: string, _engine: 'typescript' | 'eslint'): Promise<RuleCheckResult>;
  runAllChecks(): Promise<RuleCheckResult[]>;

  // Configuration
  updateConfiguration(_config: Partial<OrchestratorConfig>): Promise<void>;
  getConfiguration(): OrchestratorConfig;

  // Health and Monitoring
  healthCheck(): Promise<HealthCheckResult>;
  getSystemStats(): Promise<SystemStats>;

  // Events
  on(_event: string, _listener: (..._arguments: any[]) => void): void;
  off(_event: string, _listener: (..._arguments: any[]) => void): void;
  emit(_event: string, ..._arguments: any[]): void;
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
  memoryUsage: ReturnType<typeof process.memoryUsage>;
  database: any;
  storage: any;
  activeChecks: number;
  watchMode: boolean;
}
