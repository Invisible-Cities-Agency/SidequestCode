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
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  
  // Dark mode colors (Terminal Pro theme)
  DARK: {
    PRIMARY: '\x1b[97m',      // Bright white
    SECONDARY: '\x1b[37m',    // Light gray  
    SUCCESS: '\x1b[92m',      // Bright green
    WARNING: '\x1b[93m',      // Bright yellow
    ERROR: '\x1b[91m',        // Bright red
    INFO: '\x1b[94m',         // Bright blue
    MUTED: '\x1b[90m',        // Dark gray
    ACCENT: '\x1b[96m'        // Bright cyan
  },
  
  // Light mode colors (Terminal Man Page theme)
  LIGHT: {
    PRIMARY: '\x1b[30m',      // Black
    SECONDARY: '\x1b[90m',    // Dark gray
    SUCCESS: '\x1b[32m',      // Dark green
    WARNING: '\x1b[33m',      // Brown/amber
    ERROR: '\x1b[31m',        // Dark red
    INFO: '\x1b[34m',         // Dark blue
    MUTED: '\x1b[37m',        // Light gray
    ACCENT: '\x1b[35m'        // Purple
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

export function isValidSeverity(severity: string): severity is typeof VALIDATION_RULES.SEVERITY_LEVELS[number] {
  return VALIDATION_RULES.SEVERITY_LEVELS.includes(severity as any);
}

export function isValidSource(source: string): source is typeof VALIDATION_RULES.SOURCE_TYPES[number] {
  return VALIDATION_RULES.SOURCE_TYPES.includes(source as any);
}