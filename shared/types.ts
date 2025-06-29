/**
 * Shared TypeScript types for Code Quality Orchestrator
 * Provides type safety for color schemes, configurations, and interfaces
 */

// ============================================================================
// Color System Types
// ============================================================================

export interface ColorScheme {
  readonly reset: string;
  readonly bold: string;
  readonly dim: string;
  readonly primary: string;
  readonly secondary: string;
  readonly success: string;
  readonly warning: string;
  readonly error: string;
  readonly info: string;
  readonly muted: string;
  readonly accent: string;
}

export type TerminalMode = 'light' | 'dark';

// ============================================================================
// Display System Types
// ============================================================================

export interface WatchState {
  isInitialized: boolean;
  sessionStart: number;
  lastUpdate: number;
  baseline: ViolationSummary | null;
  current: ViolationSummary;
  viewMode: 'dashboard' | 'tidy';
  currentViolations: import('../utils/violation-types.js').Violation[];
}

export interface ViolationSummary {
  readonly total: number;
  readonly bySource: Readonly<Record<string, number>>;
  readonly byCategory: Readonly<Record<string, number>>;
  readonly bySeverity?: Readonly<Record<string, Record<string, number>>>;
  readonly byCategoryBySource?: Readonly<Record<string, Record<string, number>>>;
}

export interface TodayProgressData {
  readonly total: number;
  readonly filesAffected: number;
  readonly avgPerFile: number;
}

// ============================================================================
// Console Management Types
// ============================================================================

export interface ConsoleBackup {
  readonly log: typeof console.log;
  readonly error: typeof console.error;
  readonly warn: typeof console.warn;
  readonly stderrWrite: typeof process.stderr.write;
}

// ============================================================================
// Terminal Detection Types
// ============================================================================

export interface TerminalCapabilities {
  readonly supportsOSC: boolean;
  readonly supportsTrueColor: boolean;
  readonly supports256Color: boolean;
  readonly supportsBasicColor: boolean;
}

export interface ColorDetectionResult {
  readonly mode: TerminalMode;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly method: 'osc' | 'heuristic' | 'fallback';
  readonly backgroundColor?: string;
  readonly luminance?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface DisplayConfiguration {
  readonly maxCategories: number;
  readonly updateDebounceMs: number;
  readonly showTodayProgress: boolean;
  readonly colorMode: TerminalMode | 'auto';
}

export interface ValidationConfiguration {
  readonly strictMode: boolean;
  readonly maxMessageLength: number;
  readonly allowedFileExtensions: readonly string[];
  readonly requiredFields: readonly string[];
}

// ============================================================================
// Error Types
// ============================================================================

export class DisplayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DisplayError';
  }
}

export class TerminalDetectionError extends Error {
  constructor(
    message: string,
    public readonly method: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'TerminalDetectionError';
  }
}

// ============================================================================
// Event System Types
// ============================================================================

export interface WatchDisplayEvents {
  'initialized': [];
  'updated': [violations: number, checksCount: number];
  'baselineSet': [baseline: ViolationSummary];
  'error': [error: DisplayError];
  'shutdown': [];
}

export type EventListener<T extends readonly unknown[]> = (...arguments_: T) => void;

export interface TypedEventEmitter<TEvents extends Record<string, readonly unknown[]>> {
  on<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): void;
  off<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): void;
  emit<K extends keyof TEvents>(event: K, ...arguments_: TEvents[K]): void;
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type NonEmptyArray<T> = [T, ...T[]];

export type RequireField<T, K extends keyof T> = T & Required<Pick<T, K>>;

// ============================================================================
// Type Guards
// ============================================================================

export function isColorScheme(object: unknown): object is ColorScheme {
  if (typeof object !== 'object' || object === null) {return false;}

  const scheme = object as Record<string, unknown>;
  const requiredKeys: (keyof ColorScheme)[] = [
    'reset', 'bold', 'dim', 'primary', 'secondary',
    'success', 'warning', 'error', 'info', 'muted', 'accent'
  ];

  return requiredKeys.every(key => typeof scheme[key] === 'string');
}

export function isTerminalMode(value: string): value is TerminalMode {
  return value === 'light' || value === 'dark';
}

export function isViolationSummary(object: unknown): object is ViolationSummary {
  if (typeof object !== 'object' || object === null) {return false;}

  const summary = object as Record<string, unknown>;
  return (
    typeof summary['total'] === 'number' &&
    typeof summary['bySource'] === 'object' &&
    typeof summary['byCategory'] === 'object' &&
    summary['bySource'] !== undefined &&
    summary['byCategory'] !== undefined
  );
}
