/**
 * Shared constants for Code Quality Orchestrator
 * Centralizes magic numbers, category definitions, and other constants
 */

// ============================================================================
// Violation Categories
// ============================================================================

export const VIOLATION_CATEGORIES = {
  ESLINT: [
    'code-quality',
    'style',
    'architecture',
    'modernization',
    'unused-vars',
    'legacy-type-rule',
    'return-type',
    'no-explicit-any',
    'other-eslint'
  ] as const,

  TYPESCRIPT: [
    'type-alias',
    'annotation',
    'cast',
    'record-type',
    'generic-unknown',
    'unknown-reference',
    'branded-type',
    'generic-constraint'
  ] as const
} as const;

// ============================================================================
// ANSI Color Codes
// ============================================================================

export const ANSI_CODES = {
  RESET: '\u001B[0m',
  BOLD: '\u001B[1m',
  DIM: '\u001B[2m',

  // Dark mode colors (Terminal Pro theme)
  DARK: {
    PRIMARY: '\u001B[97m', // Bright white
    SECONDARY: '\u001B[37m', // Light gray
    SUCCESS: '\u001B[92m', // Bright green
    WARNING: '\u001B[93m', // Bright yellow
    ERROR: '\u001B[91m', // Bright red
    INFO: '\u001B[94m', // Bright blue
    MUTED: '\u001B[90m', // Dark gray
    ACCENT: '\u001B[96m' // Bright cyan
  },

  // Light mode colors (optimized for light terminals)
  LIGHT: {
    PRIMARY: '\u001B[30m', // Black - primary text
    SECONDARY: '\u001B[30m', // Black - secondary text (was too light)
    SUCCESS: '\u001B[32m', // Dark green - positive changes
    WARNING: '\u001B[38;5;208m\u001B[1m', // Bold orange - better accessibility than yellow
    ERROR: '\u001B[31m\u001B[1m', // Bold dark red - errors
    INFO: '\u001B[36m', // Dark cyan - better than blue on light
    MUTED: '\u001B[30m', // Black - totals should be readable (was dark gray)
    ACCENT: '\u001B[35m' // Purple/magenta - accent color
  }
} as const;

// ============================================================================
// Terminal Detection
// ============================================================================

export const TERMINAL_DETECTION = {
  OSC_TIMEOUT_MS: 300,
  LUMINANCE_THRESHOLD: 0.3,
  RETRY_ATTEMPTS: 3,
  FALLBACK_MODE: 'dark' as const
} as const;

// ============================================================================
// Display Configuration
// ============================================================================

export const DISPLAY_CONFIG = {
  MAX_CATEGORY_DISPLAY: 15,
  UPDATE_DEBOUNCE_MS: 100,
  HEADER_SEPARATOR_LENGTH: 60,
  MAX_MESSAGE_LENGTH: 500
} as const;

// ============================================================================
// Performance Thresholds
// ============================================================================

export const PERFORMANCE_THRESHOLDS = {
  WATCH_CYCLE_MAX_MS: 5000,
  VIOLATION_PROCESSING_MAX_MS: 2000,
  DATABASE_QUERY_MAX_MS: 1000,
  MEMORY_WARNING_MB: 100
} as const;

// ============================================================================
// Validation Rules
// ============================================================================

export const VALIDATION_RULES = {
  SEVERITY_LEVELS: ['error', 'warn', 'info'] as const,
  SOURCE_TYPES: ['typescript', 'eslint'] as const,
  FILE_EXTENSIONS: ['.ts', '.tsx', '.js', '.jsx'] as const,
  MIN_LINE_NUMBER: 1,
  MIN_COLUMN_NUMBER: 0
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

export function isESLintCategory(category: string): boolean {
  return VIOLATION_CATEGORIES.ESLINT.includes(category as any);
}

export function isTypeScriptCategory(category: string): boolean {
  return VIOLATION_CATEGORIES.TYPESCRIPT.includes(category as any);
}

export function isValidSeverity(
  severity: string
): severity is (typeof VALIDATION_RULES.SEVERITY_LEVELS)[number] {
  return VALIDATION_RULES.SEVERITY_LEVELS.includes(severity as any);
}

export function isValidSource(
  source: string
): source is (typeof VALIDATION_RULES.SOURCE_TYPES)[number] {
  return VALIDATION_RULES.SOURCE_TYPES.includes(source as any);
}
