/**
 * Polling Service for Code Quality Orchestrator
 * Handles rule execution scheduling and coordination
 */

import { EventEmitter } from 'node:events';
import type { IPollingService, IStorageService, RuleCheckResult } from './interfaces.js';
import type { RuleSchedule } from '../database/types.js';

// ============================================================================
// Polling Service Implementation
// ============================================================================

export class PollingService extends EventEmitter implements IPollingService {
  private storageService: IStorageService;
  private isActive = false;
  private isPaused = false;
  private pollingInterval: ReturnType<typeof setTimeout> | undefined = undefined;
  private activeChecks = new Map<string, Promise<RuleCheckResult>>();

  // Configuration
  private defaultFrequencyMs = 30_000; // 30 seconds
  private maxConcurrentChecks = 3;
  // private adaptivePollingEnabled = true;
  private pollingIntervalMs = 5000; // Check for scheduled rules every 5 seconds

  constructor(storageService: IStorageService) {
    super();
    this.storageService = storageService;
  }

  // ========================================================================
  // Lifecycle Management
  // ========================================================================

  start(): Promise<void> {
    if (this.isActive) {
      console.log('[PollingService] Already running');
      return Promise.resolve();
    }

    console.log('[PollingService] Starting polling service...');
    this.isActive = true;
    this.isPaused = false;

    // Start the main polling loop
    this.pollingInterval = setInterval(async() => {
      if (!this.isPaused) {
        await this.executePollCycle();
      }
    }, this.pollingIntervalMs);

    console.log('[PollingService] Polling service started');
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    if (!this.isActive) {
      console.log('[PollingService] Already stopped');
      return;
    }

    console.log('[PollingService] Stopping polling service...');
    this.isActive = false;

    // Clear polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }

    // Wait for active checks to complete
    if (this.activeChecks.size > 0) {
      console.log(`[PollingService] Waiting for ${this.activeChecks.size} active checks to complete...`);
      await Promise.allSettled(this.activeChecks.values());
      this.activeChecks.clear();
    }

    console.log('[PollingService] Polling service stopped');
  }

  pause(): Promise<void> {
    if (!this.isActive) {
      throw new Error('Cannot pause: polling service is not running');
    }

    console.log('[PollingService] Pausing polling service...');
    this.isPaused = true;
    return Promise.resolve();
  }

  resume(): Promise<void> {
    if (!this.isActive) {
      throw new Error('Cannot resume: polling service is not running');
    }

    if (!this.isPaused) {
      console.log('[PollingService] Already running (not paused)');
      return Promise.resolve();
    }

    console.log('[PollingService] Resuming polling service...');
    this.isPaused = false;
    return Promise.resolve();
  }

  isRunning(): boolean {
    return this.isActive && !this.isPaused;
  }

  // ========================================================================
  // Rule Scheduling
  // ========================================================================

  async scheduleRule(rule: string, engine: 'typescript' | 'eslint', frequencyMs?: number): Promise<void> {
    const frequency = frequencyMs || this.defaultFrequencyMs;

    console.log(`[PollingService] Scheduling rule ${rule} (${engine}) with frequency ${frequency}ms`);

    await this.storageService.upsertRuleSchedule({
      rule_id: rule,
      engine,
      enabled: true,
      priority: 1,
      check_frequency_ms: frequency
    });
  }

  async unscheduleRule(rule: string, engine: 'typescript' | 'eslint'): Promise<void> {
    console.log(`[PollingService] Unscheduling rule ${rule} (${engine})`);

    await this.storageService.upsertRuleSchedule({
      rule_id: rule,
      engine,
      enabled: false,
      priority: 999,
      check_frequency_ms: this.defaultFrequencyMs
    });
  }

  async getScheduledRules(): Promise<RuleSchedule[]> {
    return await this.storageService.getNextRulesToCheck(100); // Get all enabled rules
  }

  // ========================================================================
  // Execution Control
  // ========================================================================

  async executeRule(rule: string, engine: 'typescript' | 'eslint'): Promise<RuleCheckResult> {
    const checkKey = `${rule}:${engine}`;

    // Check if this rule is already running
    if (this.activeChecks.has(checkKey)) {
      console.log(`[PollingService] Rule ${rule} (${engine}) is already running`);
      return await this.activeChecks.get(checkKey)!;
    }

    // Start the rule check
    const checkPromise = this.performRuleCheck(rule, engine);
    this.activeChecks.set(checkKey, checkPromise);

    try {
      const result = await checkPromise;
      return result;
    } finally {
      this.activeChecks.delete(checkKey);
    }
  }

  async executeNextRules(maxConcurrent?: number): Promise<RuleCheckResult[]> {
    const maxRules = maxConcurrent || this.maxConcurrentChecks;
    const availableSlots = maxRules - this.activeChecks.size;

    if (availableSlots <= 0) {
      console.log('[PollingService] No available slots for rule execution');
      return [];
    }

    // Get next rules to check
    const nextRules = await this.storageService.getNextRulesToCheck(availableSlots);

    if (nextRules.length === 0) {
      return [];
    }

    console.log(`[PollingService] Executing ${nextRules.length} rules...`);

    // Execute rules concurrently
    const promises = nextRules.map(rule =>
      this.executeRule(rule.rule_id, rule.engine as 'typescript' | 'eslint')
    );

    const results = await Promise.allSettled(promises);

    // Extract successful results
    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<RuleCheckResult> =>
        result.status === 'fulfilled'
      )
      .map(result => result.value);

    // Log any failures
    results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .forEach((result, index) => {
        const rule = nextRules[index];
        if (rule) {
          console.error(`[PollingService] Failed to execute rule ${rule.rule_id} (${rule.engine}):`, result.reason);
          this.emit('ruleFailed', rule.rule_id, rule.engine, result.reason);
        }
      });

    return successfulResults;
  }

  // ========================================================================
  // Configuration
  // ========================================================================

  setDefaultFrequency(frequencyMs: number): void {
    if (frequencyMs < 1000) {
      throw new Error('Default frequency must be at least 1000ms');
    }
    this.defaultFrequencyMs = frequencyMs;
    console.log(`[PollingService] Default frequency set to ${frequencyMs}ms`);
  }

  setMaxConcurrentChecks(max: number): void {
    if (max < 1) {
      throw new Error('Max concurrent checks must be at least 1');
    }
    this.maxConcurrentChecks = max;
    console.log(`[PollingService] Max concurrent checks set to ${max}`);
  }

  enableAdaptivePolling(enabled: boolean): void {
    // this.adaptivePollingEnabled = enabled;
    console.log(`[PollingService] Adaptive polling ${enabled ? 'enabled' : 'disabled'}`);
  }

  // ========================================================================
  // Private Implementation
  // ========================================================================

  private async executePollCycle(): Promise<void> {
    try {
      const startTime = performance.now();

      // Execute next scheduled rules
      const results = await this.executeNextRules();

      if (results.length > 0) {
        const executionTime = performance.now() - startTime;
        console.log(`[PollingService] Poll cycle completed: ${results.length} rules executed in ${Math.round(executionTime)}ms`);

        // Record performance metric
        await this.storageService.recordPerformanceMetric(
          'polling_cycle',
          executionTime,
          'ms',
          `rules: ${results.length}`
        );

        // Emit cycle completed event
        this.emit('cycleCompleted', results);
      }
    } catch (error) {
      console.error('[PollingService] Error in poll cycle:', error);
    }
  }

  private async performRuleCheck(rule: string, engine: 'typescript' | 'eslint'): Promise<RuleCheckResult> {
    const startTime = performance.now();

    console.log(`[PollingService] Starting rule check: ${rule} (${engine})`);
    this.emit('ruleStarted', rule, engine);

    // Start the rule check in storage
    const checkId = await this.storageService.startRuleCheck(rule, engine);

    try {
      // Simulate rule execution (replace with actual rule execution logic)
      const executionResult = await this.simulateRuleExecution(rule, engine);

      const executionTime = performance.now() - startTime;

      // Complete the rule check
      await this.storageService.completeRuleCheck(
        checkId,
        executionResult.violationsFound,
        Math.round(executionTime),
        executionResult.filesChecked,
        executionResult.filesWithViolations
      );

      const result: RuleCheckResult = {
        rule,
        engine,
        checkId,
        success: true,
        violationCount: executionResult.violationsFound,
        executionTime: Math.round(executionTime),
        filesChecked: executionResult.filesChecked,
        filesWithViolations: executionResult.filesWithViolations,
        violations: executionResult.violations || []
      };

      console.log(`[PollingService] Rule check completed: ${rule} (${engine}) - ${result.violationCount} violations in ${result.executionTime}ms`);
      this.emit('ruleCompleted', result);

      return result;

    } catch (error) {
      const executionTime = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark rule check as failed
      await this.storageService.failRuleCheck(checkId, errorMessage);

      const result: RuleCheckResult = {
        rule,
        engine,
        checkId,
        success: false,
        error: errorMessage,
        executionTime: Math.round(executionTime),
        violationCount: 0,
        violations: []
      };

      console.error(`[PollingService] Rule check failed: ${rule} (${engine}) - ${errorMessage}`);
      this.emit('ruleFailed', rule, engine, error);

      return result;
    }
  }

  private async simulateRuleExecution(_rule: string, _engine: 'typescript' | 'eslint'): Promise<{
    violationsFound: number;
    filesChecked: number;
    filesWithViolations: number;
    violations?: any[];
  }> {
    // Simulate execution time based on rule complexity
    const baseTime = Math.random() * 200 + 50; // 50-250ms
    await new Promise(resolve => setTimeout(resolve, baseTime));

    // Simulate different outcomes based on rule
    const isFlaky = Math.random() < 0.1; // 10% chance of flaky behavior
    const violationsFound = isFlaky ? 0 : Math.floor(Math.random() * 10);
    const filesChecked = Math.floor(Math.random() * 50) + 10;
    const filesWithViolations = Math.min(violationsFound, filesChecked);

    return {
      violationsFound,
      filesChecked,
      filesWithViolations
    };
  }
}

// ============================================================================
// Service Factory
// ============================================================================

let pollingServiceInstance: PollingService | undefined;

/**
 * Get or create polling service instance
 */
export function getPollingService(storageService: IStorageService): PollingService {
  if (!pollingServiceInstance) {
    pollingServiceInstance = new PollingService(storageService);
  }
  return pollingServiceInstance;
}

/**
 * Reset polling service instance (useful for testing)
 */
export function resetPollingService(): void {
  if (pollingServiceInstance && // Stop the service if it's running
    pollingServiceInstance.isRunning()) {
    pollingServiceInstance.stop().catch(console.error);
  }
  pollingServiceInstance = undefined;
}
