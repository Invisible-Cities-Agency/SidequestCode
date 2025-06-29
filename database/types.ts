/**
 * Database schema types for Kysely ORM
 * Matches the SQLite schema defined in schema.sql
 */

import type { Generated, Insertable, Selectable } from 'kysely';

// ============================================================================
// Table Interfaces
// ============================================================================

interface ViolationTable {
  id: Generated<number>;
  file_path: string;
  rule_id: string;
  category: string;
  severity: 'error' | 'warn' | 'info';
  source: 'typescript' | 'eslint';
  message: string;
  line_number: number | null;
  column_number: number | null;
  code_snippet: string | null;
  hash: string; // SHA-256 hash for deduplication
  first_seen_at: Generated<string>; // ISO datetime string
  last_seen_at: Generated<string>; // ISO datetime string
  status: Generated<'active' | 'resolved' | 'ignored'>;
}

interface RuleCheckTable {
  id: Generated<number>;
  rule_id: string;
  engine: 'typescript' | 'eslint';
  started_at: Generated<string>;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  violations_found: Generated<number>;
  execution_time_ms: number | null;
  error_message: string | null;
  files_checked: Generated<number>;
  files_with_violations: Generated<number>;
}

interface ViolationHistoryTable {
  id: Generated<number>;
  check_id: number;
  violation_hash: string;
  action: 'added' | 'removed' | 'modified' | 'unchanged';
  previous_line: number | null;
  previous_message: string | null;
  recorded_at: Generated<string>;
}

interface RuleScheduleTable {
  id: Generated<number>;
  rule_id: string;
  engine: 'typescript' | 'eslint';
  enabled: Generated<boolean>;
  priority: Generated<number>;
  check_frequency_ms: Generated<number>;
  last_run_at: string | null;
  next_run_at: string | null;
  consecutive_zero_count: Generated<number>;
  avg_execution_time_ms: Generated<number>;
  avg_violations_found: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

interface WatchSessionTable {
  id: Generated<number>;
  session_start: Generated<string>;
  session_end: string | null;
  total_checks: Generated<number>;
  total_violations_start: Generated<number>;
  total_violations_end: Generated<number>;
  configuration: string | null; // JSON string
  user_agent: string | null;
}

interface PerformanceMetricTable {
  id: Generated<number>;
  metric_type: string;
  metric_value: number;
  metric_unit: string;
  context: string | null;
  recorded_at: Generated<string>;
}

// ============================================================================
// Database Schema Interface
// ============================================================================

export interface DatabaseSchema {
  violations: ViolationTable;
  rule_checks: RuleCheckTable;
  violation_history: ViolationHistoryTable;
  rule_schedules: RuleScheduleTable;
  watch_sessions: WatchSessionTable;
  performance_metrics: PerformanceMetricTable;
}

// ============================================================================
// Helper Types for CRUD Operations
// ============================================================================

export type Violation = Selectable<ViolationTable>;
export type NewViolation = Insertable<ViolationTable>;
export type ViolationHistory = Selectable<ViolationHistoryTable>;
export type RuleSchedule = Selectable<RuleScheduleTable>;
export type NewRuleSchedule = Insertable<RuleScheduleTable>;



// ============================================================================
// Business Logic Types
// ============================================================================

export interface ViolationSummaryItem {
  category: string;
  source: 'typescript' | 'eslint';
  severity: 'error' | 'warn' | 'info';
  count: number;
  affected_files: number;
  first_occurrence: string;
  last_occurrence: string;
}

export interface RulePerformanceItem {
  rule_id: string;
  engine: 'typescript' | 'eslint';
  enabled: boolean;
  avg_execution_time_ms: number;
  avg_violations_found: number;
  consecutive_zero_count: number;
  last_run_at: string | null;
  next_run_at: string | null;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
}


export interface ViolationDelta {
  violation_hash: string;
  action: 'added' | 'removed' | 'modified' | 'unchanged';
  previous_line?: number;
  previous_message?: string;
  current_violation?: Violation;
}


// ============================================================================
// Configuration Types
// ============================================================================

export interface DatabaseConfig {
  path: string;
  enableWAL?: boolean;
  pragmas?: Record<string, string | number>;
  migrations?: {
    enabled: boolean;
    path: string;
  };
}

export interface StorageServiceConfig {
  database: DatabaseConfig;
  batchSize?: number;
  maxHistoryAge?: number; // Days to keep violation history
  enablePerformanceMetrics?: boolean;
}

// ============================================================================
// Query Result Types
// ============================================================================

export interface ViolationQueryParameters {
  status?: 'active' | 'resolved' | 'ignored';
  categories?: string[];
  sources?: ('typescript' | 'eslint')[];
  severities?: ('error' | 'warn' | 'info')[];
  file_paths?: string[];
  limit?: number;
  offset?: number;
  since?: string; // ISO datetime string
}

export interface HistoryQueryParameters {
  since?: string;
  until?: string;
  actions?: ('added' | 'removed' | 'modified' | 'unchanged')[];
  rule_ids?: string[];
  limit?: number;
  offset?: number;
}

export interface DashboardData {
  summary: ViolationSummaryItem[];
  rule_performance: RulePerformanceItem[];
  recent_history: ViolationHistory[];
  active_violations: number;
  total_files_affected: number;
  last_check_time: string | null;
  next_scheduled_check: string | null;
}
