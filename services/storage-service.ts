/**
 * Storage Service for Code Quality Orchestrator
 * Provides high-level database operations with optimized batch processing
 */

import { getDatabase } from '../database/connection.js';
import { sql } from 'kysely';
import { 
  violationsToDbFormat, 
  computeViolationDeltas, 
  prepareDeltasForInsertion,
  chunk,
  formatDateTimeForDb,
  createPerformanceMetric,
  validateViolation,
  sanitizeViolation
} from '../database/utils.js';
import type { 
  DatabaseSchema,
  NewViolation,
  Violation,
  RuleCheck,
  NewRuleCheck,
  ViolationHistory,
  RuleSchedule,
  NewRuleSchedule,
  RuleScheduleUpdate,
  ViolationSummaryItem,
  RulePerformanceItem,
  ViolationQueryParams,
  HistoryQueryParams,
  DashboardData,
  StorageServiceConfig
} from '../database/types.js';
import type { Violation as OrchestratorViolation } from '../utils/violation-types.js';

// ============================================================================
// Storage Service Class
// ============================================================================

export class StorageService {
  private config: StorageServiceConfig;
  private batchSize: number;
  private maxHistoryAge: number; // Days
  private enableMetrics: boolean;

  constructor(config: Partial<StorageServiceConfig> = {}) {
    this.config = {
      database: config.database || { path: './data/code-quality.db' },
      batchSize: config.batchSize || 100,
      maxHistoryAge: config.maxHistoryAge || 30,
      enablePerformanceMetrics: config.enablePerformanceMetrics || true
    };
    
    this.batchSize = this.config.batchSize!;
    this.maxHistoryAge = this.config.maxHistoryAge!;
    this.enableMetrics = this.config.enablePerformanceMetrics!;
  }

  // ========================================================================
  // Violation Management
  // ========================================================================

  /**
   * Store violations with batch processing and deduplication
   */
  async storeViolations(violations: OrchestratorViolation[]): Promise<{
    inserted: number;
    updated: number;
    errors: string[];
  }> {
    const startTime = performance.now();
    const db = getDatabase();
    
    // Convert to database format
    const dbViolations = violationsToDbFormat(violations);
    
    // Validate all violations
    const errors: string[] = [];
    const validViolations: NewViolation[] = [];
    
    for (const violation of dbViolations) {
      const validationErrors = validateViolation(violation);
      if (validationErrors.length > 0) {
        errors.push(`Violation ${violation.hash}: ${validationErrors.join(', ')}`);
      } else {
        validViolations.push(sanitizeViolation(violation));
      }
    }

    let inserted = 0;
    let updated = 0;

    if (validViolations.length > 0) {
      // Process in batches for performance
      const batches = chunk(validViolations, this.batchSize);
      
      for (const batch of batches) {
        const result = await db.transaction().execute(async (trx) => {
          let batchInserted = 0;
          let batchUpdated = 0;
          
          for (const violation of batch) {
            try {
              // Try to insert, handle conflicts by updating last_seen_at
              const insertResult = await trx
                .insertInto('violations')
                .values(violation)
                .onConflict(oc => oc
                  .column('hash')
                  .doUpdateSet({
                    last_seen_at: formatDateTimeForDb(),
                    status: 'active' // Reactivate if previously resolved
                  })
                )
                .returning(['id'])
                .executeTakeFirst();
              
              if (insertResult) {
                // Check if this was an insert or update by querying the violation
                const existingViolation = await trx
                  .selectFrom('violations')
                  .select(['first_seen_at', 'last_seen_at'])
                  .where('hash', '=', violation.hash)
                  .executeTakeFirst();
                
                if (existingViolation?.first_seen_at === existingViolation?.last_seen_at) {
                  batchInserted++;
                } else {
                  batchUpdated++;
                }
              }
            } catch (error) {
              errors.push(`Failed to store violation ${violation.hash}: ${error}`);
            }
          }
          
          return { batchInserted, batchUpdated };
        });
        
        inserted += result.batchInserted;
        updated += result.batchUpdated;
      }
    }

    const executionTime = performance.now() - startTime;
    
    // Record performance metric
    if (this.enableMetrics) {
      await this.recordPerformanceMetric(
        'violation_storage',
        executionTime,
        'ms',
        `violations: ${violations.length}, batches: ${Math.ceil(validViolations.length / this.batchSize)}`
      );
    }

    return { inserted, updated, errors };
  }

  /**
   * Get violations with flexible filtering
   */
  async getViolations(params: ViolationQueryParams = {}): Promise<Violation[]> {
    const db = getDatabase();
    let query = db.selectFrom('violations').selectAll();

    // Apply filters
    if (params.status) {
      query = query.where('status', '=', params.status);
    }
    
    if (params.categories && params.categories.length > 0) {
      query = query.where('category', 'in', params.categories);
    }
    
    if (params.sources && params.sources.length > 0) {
      query = query.where('source', 'in', params.sources);
    }
    
    if (params.severities && params.severities.length > 0) {
      query = query.where('severity', 'in', params.severities);
    }
    
    if (params.file_paths && params.file_paths.length > 0) {
      query = query.where('file_path', 'in', params.file_paths);
    }
    
    if (params.since) {
      query = query.where('last_seen_at', '>=', params.since);
    }

    // Apply pagination
    if (params.limit) {
      query = query.limit(Math.min(params.limit, 1000)); // Cap at 1000
    }
    
    if (params.offset) {
      query = query.offset(params.offset);
    }

    // Order by most recent first
    query = query.orderBy('last_seen_at', 'desc');

    return await query.execute();
  }

  /**
   * Get violation summary for dashboard
   */
  async getViolationSummary(): Promise<ViolationSummaryItem[]> {
    const db = getDatabase();
    
    return await db
      .selectFrom('violation_summary')
      .selectAll()
      .execute();
  }

  /**
   * Mark violations as resolved
   */
  async resolveViolations(hashes: string[]): Promise<number> {
    const db = getDatabase();
    
    const result = await db
      .updateTable('violations')
      .set({ 
        status: 'resolved',
        last_seen_at: formatDateTimeForDb()
      })
      .where('hash', 'in', hashes)
      .where('status', '=', 'active')
      .execute();
    
    return Number(result.numUpdatedRows || 0);
  }

  // ========================================================================
  // Rule Check Management
  // ========================================================================

  /**
   * Start a new rule check
   */
  async startRuleCheck(ruleId: string, engine: 'typescript' | 'eslint'): Promise<number> {
    const db = getDatabase();
    
    const result = await db
      .insertInto('rule_checks')
      .values({
        rule_id: ruleId,
        engine,
        status: 'running',
        started_at: formatDateTimeForDb()
      })
      .returning('id')
      .executeTakeFirst();
    
    return result?.id || 0;
  }

  /**
   * Complete a rule check with results
   */
  async completeRuleCheck(
    checkId: number, 
    violationsFound: number, 
    executionTimeMs: number,
    filesChecked: number = 0,
    filesWithViolations: number = 0
  ): Promise<void> {
    const db = getDatabase();
    
    await db
      .updateTable('rule_checks')
      .set({
        status: 'completed',
        completed_at: formatDateTimeForDb(),
        violations_found: violationsFound,
        execution_time_ms: executionTimeMs,
        files_checked: filesChecked,
        files_with_violations: filesWithViolations
      })
      .where('id', '=', checkId)
      .execute();
  }

  /**
   * Mark rule check as failed
   */
  async failRuleCheck(checkId: number, errorMessage: string): Promise<void> {
    const db = getDatabase();
    
    await db
      .updateTable('rule_checks')
      .set({
        status: 'failed',
        completed_at: formatDateTimeForDb(),
        error_message: errorMessage
      })
      .where('id', '=', checkId)
      .execute();
  }

  // ========================================================================
  // Historical Analysis
  // ========================================================================

  /**
   * Record violation deltas for historical tracking
   */
  async recordViolationDeltas(
    checkId: number, 
    currentViolationHashes: string[]
  ): Promise<{
    added: number;
    removed: number;
    unchanged: number;
  }> {
    const db = getDatabase();
    
    // Get previous active violation hashes
    const previousViolations = await db
      .selectFrom('violations')
      .select('hash')
      .where('status', '=', 'active')
      .execute();
    
    const previousHashes = previousViolations.map(v => v.hash);
    
    // Compute deltas
    const deltas = computeViolationDeltas(previousHashes, currentViolationHashes);
    
    // Prepare for insertion
    const deltaRecords = prepareDeltasForInsertion(checkId, deltas);
    
    // Insert in batches
    if (deltaRecords.length > 0) {
      const batches = chunk(deltaRecords, this.batchSize);
      
      for (const batch of batches) {
        await db
          .insertInto('violation_history')
          .values(batch)
          .execute();
      }
    }
    
    // Count by action type
    const counts = {
      added: deltas.filter(d => d.action === 'added').length,
      removed: deltas.filter(d => d.action === 'removed').length,
      unchanged: deltas.filter(d => d.action === 'unchanged').length
    };
    
    return counts;
  }

  /**
   * Get violation history for analysis
   */
  async getViolationHistory(params: HistoryQueryParams = {}): Promise<ViolationHistory[]> {
    const db = getDatabase();
    let query = db
      .selectFrom('violation_history')
      .selectAll()
      .orderBy('recorded_at', 'desc');

    // Apply filters
    if (params.since) {
      query = query.where('recorded_at', '>=', params.since);
    }
    
    if (params.until) {
      query = query.where('recorded_at', '<=', params.until);
    }
    
    if (params.actions && params.actions.length > 0) {
      query = query.where('action', 'in', params.actions);
    }
    
    if (params.rule_ids && params.rule_ids.length > 0) {
      query = query
        .innerJoin('rule_checks', 'violation_history.check_id', 'rule_checks.id')
        .where('rule_checks.rule_id', 'in', params.rule_ids);
    }

    // Apply pagination
    if (params.limit) {
      query = query.limit(Math.min(params.limit, 1000));
    }
    
    if (params.offset) {
      query = query.offset(params.offset);
    }

    return await query.execute();
  }

  // ========================================================================
  // Rule Scheduling
  // ========================================================================

  /**
   * Initialize or update rule schedule
   */
  async upsertRuleSchedule(schedule: NewRuleSchedule): Promise<number> {
    const db = getDatabase();
    
    const result = await db
      .insertInto('rule_schedules')
      .values({
        ...schedule,
        created_at: formatDateTimeForDb(),
        updated_at: formatDateTimeForDb()
      })
      .onConflict(oc => oc
        .columns(['rule_id', 'engine'])
        .doUpdateSet({
          enabled: schedule.enabled,
          priority: schedule.priority,
          check_frequency_ms: schedule.check_frequency_ms,
          updated_at: formatDateTimeForDb()
        })
      )
      .returning('id')
      .executeTakeFirst();
    
    return result?.id || 0;
  }

  /**
   * Get next rules to check based on schedule
   */
  async getNextRulesToCheck(limit: number = 5): Promise<RuleSchedule[]> {
    const db = getDatabase();
    
    const now = formatDateTimeForDb();
    
    return await db
      .selectFrom('rule_schedules')
      .selectAll()
      .where('enabled', '=', 1) // SQLite uses 1 for true
      .where(eb => eb.or([
        eb('next_run_at', 'is', null),
        eb('next_run_at', '<=', now)
      ]))
      .orderBy('priority', 'asc')
      .orderBy('next_run_at', 'asc')
      .limit(limit)
      .execute();
  }

  /**
   * Get rule performance data
   */
  async getRulePerformance(): Promise<RulePerformanceItem[]> {
    const db = getDatabase();
    
    return await db
      .selectFrom('rule_performance')
      .selectAll()
      .execute();
  }

  // ========================================================================
  // Dashboard Data
  // ========================================================================

  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData(): Promise<DashboardData> {
    const db = getDatabase();
    
    const [
      summary,
      rulePerformance,
      recentHistory,
      activeViolationsResult,
      filesAffectedResult,
      lastCheckResult,
      nextCheckResult
    ] = await Promise.all([
      this.getViolationSummary(),
      this.getRulePerformance(),
      this.getViolationHistory({ limit: 20 }),
      db.selectFrom('violations').select(eb => eb.fn.count('id').as('count')).where('status', '=', 'active').executeTakeFirst(),
      db.selectFrom('violations').select(sql`COUNT(DISTINCT file_path) as count`).where('status', '=', 'active').executeTakeFirst(),
      db.selectFrom('rule_checks').select('completed_at').where('status', '=', 'completed').orderBy('completed_at', 'desc').limit(1).executeTakeFirst(),
      db.selectFrom('rule_schedules').select('next_run_at').where('enabled', '=', 1).where('next_run_at', 'is not', null).orderBy('next_run_at', 'asc').limit(1).executeTakeFirst()
    ]);

    return {
      summary,
      rule_performance: rulePerformance,
      recent_history: recentHistory,
      active_violations: Number(activeViolationsResult?.count || 0),
      total_files_affected: Number(filesAffectedResult?.count || 0),
      last_check_time: lastCheckResult?.completed_at || null,
      next_scheduled_check: nextCheckResult?.next_run_at || null
    };
  }

  // ========================================================================
  // Performance and Maintenance
  // ========================================================================

  /**
   * Record performance metric
   */
  async recordPerformanceMetric(
    type: string, 
    value: number, 
    unit: string, 
    context?: string
  ): Promise<void> {
    if (!this.enableMetrics) return;
    
    const db = getDatabase();
    const metric = createPerformanceMetric(type, value, unit, context);
    
    await db
      .insertInto('performance_metrics')
      .values(metric)
      .execute();
  }

  /**
   * Clean up old historical data
   */
  async cleanupOldData(): Promise<{
    violationHistoryDeleted: number;
    performanceMetricsDeleted: number;
    resolvedViolationsDeleted: number;
  }> {
    const db = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.maxHistoryAge);
    const cutoffDateString = formatDateTimeForDb(cutoffDate);
    
    const [historyResult, metricsResult, violationsResult] = await Promise.all([
      // Clean old violation history
      db.deleteFrom('violation_history')
        .where('recorded_at', '<', cutoffDateString)
        .execute(),
      
      // Clean old performance metrics
      db.deleteFrom('performance_metrics')
        .where('recorded_at', '<', cutoffDateString)
        .execute(),
      
      // Clean old resolved violations
      db.deleteFrom('violations')
        .where('status', '=', 'resolved')
        .where('last_seen_at', '<', cutoffDateString)
        .execute()
    ]);

    return {
      violationHistoryDeleted: Number(historyResult.numDeletedRows || 0),
      performanceMetricsDeleted: Number(metricsResult.numDeletedRows || 0),
      resolvedViolationsDeleted: Number(violationsResult.numDeletedRows || 0)
    };
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalViolations: number;
    activeViolations: number;
    totalRuleChecks: number;
    totalHistoryRecords: number;
    oldestViolation: string | null;
    newestViolation: string | null;
  }> {
    const db = getDatabase();
    
    const [
      totalViolationsResult,
      activeViolationsResult,
      ruleChecksResult,
      historyResult,
      oldestResult,
      newestResult
    ] = await Promise.all([
      db.selectFrom('violations').select(eb => eb.fn.count('id').as('count')).executeTakeFirst(),
      db.selectFrom('violations').select(eb => eb.fn.count('id').as('count')).where('status', '=', 'active').executeTakeFirst(),
      db.selectFrom('rule_checks').select(eb => eb.fn.count('id').as('count')).executeTakeFirst(),
      db.selectFrom('violation_history').select(eb => eb.fn.count('id').as('count')).executeTakeFirst(),
      db.selectFrom('violations').select('first_seen_at').orderBy('first_seen_at', 'asc').limit(1).executeTakeFirst(),
      db.selectFrom('violations').select('last_seen_at').orderBy('last_seen_at', 'desc').limit(1).executeTakeFirst()
    ]);

    return {
      totalViolations: Number(totalViolationsResult?.count || 0),
      activeViolations: Number(activeViolationsResult?.count || 0),
      totalRuleChecks: Number(ruleChecksResult?.count || 0),
      totalHistoryRecords: Number(historyResult?.count || 0),
      oldestViolation: oldestResult?.first_seen_at || null,
      newestViolation: newestResult?.last_seen_at || null
    };
  }
}

// ============================================================================
// Service Factory and Singleton
// ============================================================================

let storageServiceInstance: StorageService | null = null;

/**
 * Get or create storage service instance
 */
export function getStorageService(config?: Partial<StorageServiceConfig>): StorageService {
  if (!storageServiceInstance) {
    storageServiceInstance = new StorageService(config);
  }
  return storageServiceInstance;
}

/**
 * Reset storage service instance (useful for testing)
 */
export function resetStorageService(): void {
  storageServiceInstance = null;
}