/**
 * Database utility functions for Code Quality Orchestrator
 * Includes hashing, deduplication, and data transformation helpers
 */

import { createHash } from 'node:crypto';
import type { Violation as ViolationType } from '../utils/violation-types.js';
import type { NewViolation, ViolationDelta } from './types.js';

// ============================================================================
// Hash Generation for Deduplication
// ============================================================================

/**
 * Generate a consistent hash for violation deduplication
 * Hash includes: file_path + rule_id + message (excludes line_number for stability)
 * This makes violations more stable across code edits that shift line numbers
 */
export function generateViolationHash(violation: {
  file_path: string;
  line_number?: number | null;
  rule_id?: string | null;
  message: string;
}): string {
  // Normalize the message to make it more stable
  const normalizedMessage = violation.message
    .replaceAll(/line \d+/g, 'line X')  // Replace specific line numbers in messages
    .replaceAll(/\d+:\d+/g, 'X:Y')     // Replace line:column references
    .trim();

  const hashInput = [
    violation.file_path,
    // Intentionally exclude line_number for logical stability across edits
    violation.rule_id || 'unknown',
    normalizedMessage
  ].join('|');

  return createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Convert orchestrator violation to database violation format
 */
export function violationToDatabaseFormat(violation: ViolationType): NewViolation {
  const hash = generateViolationHash({
    file_path: violation.file,
    line_number: violation.line,
    rule_id: violation.rule || violation.code || 'unknown',
    message: violation.message || 'No message provided'
  });

  return {
    file_path: violation.file,
    rule_id: violation.rule || violation.code || 'unknown',
    category: violation.category,
    severity: violation.severity,
    source: violation.source as 'typescript' | 'eslint',
    message: violation.message || 'No message provided',
    line_number: violation.line || null, // eslint-disable-line unicorn/no-null
    column_number: violation.column || null, // eslint-disable-line unicorn/no-null
    code_snippet: violation.code || null, // eslint-disable-line unicorn/no-null
    hash
    // first_seen_at and last_seen_at will use DEFAULT CURRENT_TIMESTAMP
    // status will use DEFAULT 'active'
  };
}

/**
 * Convert multiple violations to database format with batch processing
 */
export function violationsToDatabaseFormat(violations: ViolationType[]): NewViolation[] {
  return violations.map(violation => violationToDatabaseFormat(violation));
}

// ============================================================================
// Delta Computation for Historical Tracking
// ============================================================================

/**
 * Compare two sets of violation hashes to compute deltas
 */
export function computeViolationDeltas(
  previousHashes: string[],
  currentHashes: string[]
): ViolationDelta[] {
  const previousSet = new Set(previousHashes);
  const currentSet = new Set(currentHashes);
  const deltas: ViolationDelta[] = [];

  // Find added violations
  for (const hash of currentHashes) {
    if (!previousSet.has(hash)) {
      deltas.push({
        violation_hash: hash,
        action: 'added'
      });
    }
  }

  // Find removed violations
  for (const hash of previousHashes) {
    if (!currentSet.has(hash)) {
      deltas.push({
        violation_hash: hash,
        action: 'removed'
      });
    }
  }

  // Find unchanged violations (useful for analytics)
  for (const hash of currentHashes) {
    if (previousSet.has(hash)) {
      deltas.push({
        violation_hash: hash,
        action: 'unchanged'
      });
    }
  }

  return deltas;
}

/**
 * Batch process deltas for database insertion
 */
export function prepareDeltasForInsertion(
  checkId: number,
  deltas: ViolationDelta[]
): Array<{
  check_id: number;
  violation_hash: string;
  action: 'added' | 'removed' | 'modified' | 'unchanged';
  previous_line: number | null;
  previous_message: string | null;
}> {
  return deltas.map(delta => ({
    check_id: checkId,
    violation_hash: delta.violation_hash,
    action: delta.action,
    previous_line: delta.previous_line || null, // eslint-disable-line unicorn/no-null
    previous_message: delta.previous_message || null // eslint-disable-line unicorn/no-null
  }));
}

// ============================================================================
// Data Formatting and Transformation
// ============================================================================

/**
 * Format datetime for SQLite storage
 */
export function formatDateTimeForDatabase(date: Date = new Date()): string {
  return date.toISOString();
}


/**
 * Batch array into chunks for efficient database operations
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
}


// ============================================================================
// Query Helpers
// ============================================================================


// ============================================================================
// Performance Monitoring Helpers
// ============================================================================

/**
 * Create performance metric entry
 */
export function createPerformanceMetric(
  type: string,
  value: number,
  unit: string,
  context?: string
) {
  return {
    metric_type: type,
    metric_value: value,
    metric_unit: unit,
    context: context || null, // eslint-disable-line unicorn/no-null
    recorded_at: formatDateTimeForDatabase()
  };
}


// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate violation data before database insertion
 */
export function validateViolation(violation: Partial<NewViolation>): string[] {
  const errors: string[] = [];

  if (!violation.file_path?.trim()) {
    errors.push('file_path is required');
  }

  if (!violation.rule_id?.trim()) {
    errors.push('rule_id is required');
  }

  if (!violation.category?.trim()) {
    errors.push('category is required');
  }

  if (!['error', 'warn', 'info'].includes(violation.severity as string)) {
    errors.push('severity must be error, warn, or info');
  }

  if (!['typescript', 'eslint', 'unused-exports'].includes(violation.source as string)) {
    errors.push('source must be typescript, eslint, or unused-exports');
  }

  if (!violation.message?.trim()) {
    errors.push('message is required');
  }

  if (!violation.hash?.trim()) {
    errors.push('hash is required');
  }

  return errors;
}

/**
 * Validate and clean violation data
 */
export function sanitizeViolation(violation: NewViolation): NewViolation {
  return {
    ...violation,
    file_path: violation.file_path.trim(),
    rule_id: violation.rule_id.trim(),
    category: violation.category.trim(),
    message: violation.message.trim(),
    code_snippet: violation.code_snippet?.trim() || null
  };
}
