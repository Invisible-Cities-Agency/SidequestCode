/**
 * Violation Tracker Service for Code Quality Orchestrator
 * Manages violation lifecycle and deduplication
 */

// import { createHash } from 'crypto';
import type {
  IViolationTracker,
  IStorageService,
  ProcessingResult,
  ValidationResult,
} from "./interfaces.js";

import type { Violation as OrchestratorViolation } from "../utils/violation-types.js";
import { generateViolationHash } from "../database/utils.js";

// ============================================================================
// Violation Tracker Implementation
// ============================================================================

export class ViolationTracker implements IViolationTracker {
  private storageService: IStorageService;
  private validationCache = new Map<string, ValidationResult>();
  private hashCache = new Map<string, string>();
  private silent: boolean = false;

  constructor(storageService: IStorageService) {
    this.storageService = storageService;
  }

  setSilentMode(silent: boolean): void {
    this.silent = silent;
  }

  // ========================================================================
  // Violation Processing
  // ========================================================================

  async processViolations(
    violations: OrchestratorViolation[],
  ): Promise<ProcessingResult> {
    const startTime = performance.now();

    if (!this.silent) {
      console.log(
        `[ViolationTracker] Processing ${violations.length} violations...`,
      );
    }
    // Completely silent in silent mode - no debug logs during watch

    // Step 1: Deduplicate violations
    const deduplicated = this.deduplicateViolations(violations);
    const deduplicatedCount = violations.length - deduplicated.length;

    // Step 2: Validate violations
    const validated: OrchestratorViolation[] = [];
    const errors: string[] = [];

    for (const violation of deduplicated) {
      const validationResult = this.validateViolation(violation);
      if (validationResult.isValid) {
        validated.push(this.sanitizeViolation(violation));
      } else {
        errors.push(
          `Invalid violation in ${violation.file}:${violation.line} - ${validationResult.errors.join(", ")}`,
        );
      }
    }

    // Step 3: Store validated violations
    let inserted = 0;
    let updated = 0;

    if (validated.length > 0) {
      if (!this.silent) {
        console.log(
          `[ViolationTracker] Storing ${validated.length} validated violations to database`,
        );
      }
      const storeResult = await this.storageService.storeViolations(validated);
      inserted = storeResult.inserted;
      updated = storeResult.updated;
      errors.push(...storeResult.errors);
      if (!this.silent) {
        console.log(
          `[ViolationTracker] Storage result: inserted=${inserted}, updated=${updated}, errors=${storeResult.errors.length}`,
        );
      }
    } else {
      if (!this.silent) {
        console.log(
          `[ViolationTracker] No validated violations to store (original=${violations.length}, deduplicated=${deduplicated.length}, validated=${validated.length})`,
        );
      }
    }

    const executionTime = performance.now() - startTime;

    // Record performance metric
    await this.storageService.recordPerformanceMetric(
      "violation_processing",
      executionTime,
      "ms",
      `processed: ${violations.length}, validated: ${validated.length}`,
    );

    const result: ProcessingResult = {
      processed: violations.length,
      inserted,
      updated,
      deduplicated: deduplicatedCount,
      errors,
    };

    if (!this.silent) {
      console.log(
        `[ViolationTracker] Processing completed in ${Math.round(executionTime)}ms:`,
        result,
      );
    }
    return result;
  }

  deduplicateViolations(
    violations: OrchestratorViolation[],
  ): OrchestratorViolation[] {
    const seenHashes = new Set<string>();
    const deduplicated: OrchestratorViolation[] = [];

    for (const violation of violations) {
      const hash = this.generateViolationHash(violation);

      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        deduplicated.push(violation);
      }
    }

    return deduplicated;
  }

  // ========================================================================
  // Lifecycle Management
  // ========================================================================

  async markAsResolved(violationHashes: string[]): Promise<number> {
    console.log(
      `[ViolationTracker] Marking ${violationHashes.length} violations as resolved`,
    );

    return await this.storageService.resolveViolations(violationHashes);
  }

  markAsIgnored(violationHashes: string[]): Promise<number> {
    console.log(
      `[ViolationTracker] Marking ${violationHashes.length} violations as ignored`,
    );

    // Note: StorageService doesn't have markAsIgnored method yet,
    // this would need to be implemented similarly to resolveViolations
    // For now, we'll log the operation
    console.log(
      "markAsIgnored operation logged - implementation needed in StorageService",
    );
    return Promise.resolve(violationHashes.length);
  }

  reactivateViolations(violationHashes: string[]): Promise<number> {
    console.log(
      `[ViolationTracker] Reactivating ${violationHashes.length} violations`,
    );

    // Note: StorageService doesn't have reactivateViolations method yet
    // This would need to be implemented to set status back to 'active'
    console.log(
      "reactivateViolations operation logged - implementation needed in StorageService",
    );
    return Promise.resolve(violationHashes.length);
  }

  // ========================================================================
  // Hash Management
  // ========================================================================

  generateViolationHash(violation: OrchestratorViolation): string {
    // Create cache key for this violation
    const cacheKey = `${violation.file}:${violation.line}:${violation.rule}:${violation.message}`;

    // Check cache first
    if (this.hashCache.has(cacheKey)) {
      return this.hashCache.get(cacheKey)!;
    }

    // Use the utility function to generate hash
    const hash = generateViolationHash({
      file_path: violation.file,
      line_number: violation.line || null,
      rule_id: violation.rule || null,
      message: violation.message || "",
    });

    // Cache the result
    this.hashCache.set(cacheKey, hash);

    return hash;
  }

  validateViolationHash(
    violation: OrchestratorViolation,
    hash: string,
  ): boolean {
    const computedHash = this.generateViolationHash(violation);
    return computedHash === hash;
  }

  // ========================================================================
  // Filtering and Querying
  // ========================================================================

  filterViolationsByRule(
    violations: OrchestratorViolation[],
    ruleIds: string[],
  ): OrchestratorViolation[] {
    const ruleSet = new Set(ruleIds);
    return violations.filter(
      (violation) => violation.rule && ruleSet.has(violation.rule),
    );
  }

  filterViolationsBySeverity(
    violations: OrchestratorViolation[],
    severities: string[],
  ): OrchestratorViolation[] {
    const severitySet = new Set(severities);
    return violations.filter((violation) =>
      severitySet.has(violation.severity),
    );
  }

  filterViolationsByFile(
    violations: OrchestratorViolation[],
    filePaths: string[],
  ): OrchestratorViolation[] {
    const fileSet = new Set(filePaths);
    return violations.filter((violation) => fileSet.has(violation.file));
  }

  // ========================================================================
  // Validation
  // ========================================================================

  validateViolation(violation: OrchestratorViolation): ValidationResult {
    // Create cache key
    const cacheKey = `${violation.file}:${violation.line}:${violation.message}`;

    // Check cache first
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey)!;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!violation.file || violation.file.trim().length === 0) {
      errors.push("File path is required");
    }

    if (!violation.message || violation.message.trim().length === 0) {
      errors.push("Message is required");
    }

    if (!violation.category || violation.category.trim().length === 0) {
      errors.push("Category is required");
    }

    if (!violation.severity || violation.severity.trim().length === 0) {
      errors.push("Severity is required");
    }

    if (!violation.source || violation.source.trim().length === 0) {
      errors.push("Source is required");
    }

    // Field format validation
    if (
      violation.line !== undefined &&
      (violation.line < 1 || !Number.isInteger(violation.line))
    ) {
      errors.push("Line number must be a positive integer");
    }

    if (
      violation.column !== undefined &&
      (violation.column < 0 || !Number.isInteger(violation.column))
    ) {
      errors.push("Column number must be a non-negative integer");
    }

    // Severity validation
    const validSeverities = ["error", "warn", "info"];
    if (violation.severity && !validSeverities.includes(violation.severity)) {
      errors.push(`Severity must be one of: ${validSeverities.join(", ")}`);
    }

    // Source validation
    const validSources = ["typescript", "eslint"];
    if (violation.source && !validSources.includes(violation.source)) {
      warnings.push(
        `Unusual source '${violation.source}' - expected one of: ${validSources.join(", ")}`,
      );
    }

    // File path validation
    if (violation.file && !/\.(ts|tsx|js|jsx)$/.test(violation.file)) {
      warnings.push(
        `File '${violation.file}' does not have a typical TypeScript/JavaScript extension`,
      );
    }

    // Message length validation
    if (violation.message && violation.message.length > 500) {
      warnings.push("Message is unusually long (>500 characters)");
    }

    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
    };

    // Cache the result
    this.validationCache.set(cacheKey, result);

    return result;
  }

  sanitizeViolation(violation: OrchestratorViolation): OrchestratorViolation {
    const result: any = {
      file: violation.file?.trim() || "",
      message: violation.message?.trim() || "",
      category: (violation.category?.trim() || "unknown") as any,
      severity: (violation.severity?.trim() || "info") as any,
      source: (violation.source?.trim() || "unknown") as any,
    };

    if (violation.line !== undefined) {
      result.line = violation.line;
    }
    if (violation.column !== undefined) {
      result.column = violation.column;
    }
    if (violation.rule !== undefined) {
      result.rule = violation.rule.trim() || undefined;
    }
    if (violation.code !== undefined) {
      result.code = violation.code.trim() || undefined;
    }

    return result;
  }

  // ========================================================================
  // Cache Management
  // ========================================================================

  /**
   * Clear internal caches to free memory
   */
  clearCaches(): void {
    this.validationCache.clear();
    this.hashCache.clear();
    console.log("[ViolationTracker] Caches cleared");
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    validationCacheSize: number;
    hashCacheSize: number;
    totalCacheSize: number;
  } {
    return {
      validationCacheSize: this.validationCache.size,
      hashCacheSize: this.hashCache.size,
      totalCacheSize: this.validationCache.size + this.hashCache.size,
    };
  }

  // ========================================================================
  // Batch Operations
  // ========================================================================

  /**
   * Process violations in batches for better performance
   */
  async processBatchedViolations(
    violations: OrchestratorViolation[],
    batchSize: number = 100,
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    for (let index = 0; index < violations.length; index += batchSize) {
      const batch = violations.slice(index, index + batchSize);
      const result = await this.processViolations(batch);
      results.push(result);
    }

    return results;
  }

  /**
   * Get aggregated statistics from batch processing results
   */
  aggregateBatchResults(results: ProcessingResult[]): ProcessingResult {
    const total = {
      processed: 0,
      inserted: 0,
      updated: 0,
      deduplicated: 0,
      errors: [] as string[],
    };

    for (const result of results) {
      total.processed += result.processed;
      total.inserted += result.inserted;
      total.updated += result.updated;
      total.deduplicated += result.deduplicated;
      total.errors.push(...result.errors);
    }

    return total;
  }

  // ========================================================================
  // Advanced Filtering
  // ========================================================================

  /**
   * Apply multiple filters to violations
   */
  applyFilters(
    violations: OrchestratorViolation[],
    filters: {
      ruleIds?: string[];
      severities?: string[];
      filePaths?: string[];
      categories?: string[];
      sources?: string[];
    },
  ): OrchestratorViolation[] {
    let filtered = violations;

    if (filters.ruleIds) {
      filtered = this.filterViolationsByRule(filtered, filters.ruleIds);
    }

    if (filters.severities) {
      filtered = this.filterViolationsBySeverity(filtered, filters.severities);
    }

    if (filters.filePaths) {
      filtered = this.filterViolationsByFile(filtered, filters.filePaths);
    }

    if (filters.categories) {
      filtered = filtered.filter((v) =>
        filters.categories!.includes(v.category),
      );
    }

    if (filters.sources) {
      filtered = filtered.filter((v) => filters.sources!.includes(v.source));
    }

    return filtered;
  }
}

// ============================================================================
// Service Factory
// ============================================================================

let violationTrackerInstance: ViolationTracker | undefined;

/**
 * Get or create violation tracker instance
 */
export function getViolationTracker(
  storageService: IStorageService,
): ViolationTracker {
  if (!violationTrackerInstance) {
    violationTrackerInstance = new ViolationTracker(storageService);
  }
  return violationTrackerInstance;
}

/**
 * Reset violation tracker instance (useful for testing)
 */
export function resetViolationTracker(): void {
  if (violationTrackerInstance) {
    violationTrackerInstance.clearCaches();
  }
  violationTrackerInstance = undefined;
}
