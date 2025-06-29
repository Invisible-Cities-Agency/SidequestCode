#!/usr/bin/env tsx
/**
 * Test script for services and Kysely ORM configuration
 * Verifies StorageService and ConfigManager integration
 */

import { ConfigManager } from './services/config-manager.js';
import { getStorageService } from './services/storage-service.js';
import type { Violation as OrchestratorViolation } from './utils/violation-types.js';

async function testServices() {
  console.log('🔧 Testing Code Quality Orchestrator Services...\n');

  try {
    // Create test configuration
    console.log('1. Creating test configuration...');
    const configManager = ConfigManager.createEnvironmentConfig('test');
    const config = configManager.getConfig();
    console.log(`✅ Test config created with database: ${config.database.path}`);
    console.log(`   - Batch size: ${config.performance.batchSize}`);
    console.log(`   - History retention: ${config.database.maxHistoryDays} days`);
    console.log(`   - Performance metrics: ${config.monitoring.enablePerformanceMetrics}`);
    console.log('');

    // Initialize services
    console.log('2. Initializing services...');
    const { storageService } = await configManager.initializeServices();
    console.log('✅ Services initialized successfully\n');

    // Test storage service with sample violations
    console.log('3. Testing violation storage...');
    const testViolations: OrchestratorViolation[] = [
      {
        file: 'src/components/Button.tsx',
        line: 15,
        column: 8,
        message: 'Record<string, unknown> should use branded interface',
        category: 'record-type',
        severity: 'info',
        source: 'typescript',
        rule: 'record-type-check',
        code: 'Record<string, unknown>'
      },
      {
        file: 'src/utils/helpers.ts',
        line: 42,
        column: 12,
        message: 'console.log statements should be removed',
        category: 'code-quality',
        severity: 'warn',
        source: 'eslint',
        rule: 'no-console',
        code: 'console.log'
      },
      {
        file: 'src/types/api.ts',
        line: 8,
        column: 1,
        message: 'Type alias using unknown type',
        category: 'type-alias',
        severity: 'error',
        source: 'typescript',
        rule: 'type-alias-check',
        code: 'type ApiResponse = Record<string, unknown>;'
      }
    ];

    const storeResult = await storageService.storeViolations(testViolations);
    console.log(`✅ Stored violations: ${storeResult.inserted} inserted, ${storeResult.updated} updated`);
    if (storeResult.errors.length > 0) {
      console.log(`⚠️  Errors: ${storeResult.errors.join(', ')}`);
    }
    console.log('');

    // Test violation queries
    console.log('4. Testing violation queries...');

    // Get all violations
    const allViolations = await storageService.getViolations();
    console.log(`✅ Found ${allViolations.length} total violations`);

    // Get violations by category
    const typeViolations = await storageService.getViolations({
      categories: ['record-type', 'type-alias']
    });
    console.log(`✅ Found ${typeViolations.length} type-related violations`);

    // Get violations by severity
    const errorViolations = await storageService.getViolations({
      severities: ['error']
    });
    console.log(`✅ Found ${errorViolations.length} error-level violations`);
    console.log('');

    // Test violation summary
    console.log('5. Testing violation summary...');
    const summary = await storageService.getViolationSummary();
    console.log(`✅ Generated summary with ${summary.length} categories:`);
    for (const item of summary) {
      console.log(`   - ${item.category} (${item.source}): ${item.count} violations, ${item.affected_files} files`);
    }
    console.log('');

    // Test rule check tracking
    console.log('6. Testing rule check tracking...');

    // Start a rule check
    const checkId = await storageService.startRuleCheck('record-type-check', 'typescript');
    console.log(`✅ Started rule check with ID: ${checkId}`);

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    // Complete the rule check
    await storageService.completeRuleCheck(checkId, 2, 150, 10, 3);
    console.log('✅ Completed rule check');
    console.log('');

    // Test violation deltas
    console.log('7. Testing violation deltas...');

    // Record initial state
    const initialHashes = allViolations.map(v => v.hash);
    const deltaResult = await storageService.recordViolationDeltas(checkId, initialHashes);
    console.log(`✅ Recorded deltas: ${deltaResult.added} added, ${deltaResult.removed} removed, ${deltaResult.unchanged} unchanged`);

    // Add a new violation and test delta tracking
    const newViolation: OrchestratorViolation = {
      file: 'src/new-file.ts',
      line: 1,
      column: 1,
      message: 'New violation for delta testing',
      category: 'test',
      severity: 'info',
      source: 'typescript',
      rule: 'test-rule',
      code: 'test code'
    };

    await storageService.storeViolations([newViolation]);
    const newCheckId = await storageService.startRuleCheck('test-rule', 'typescript');
    const updatedViolations = await storageService.getViolations();
    const newHashes = updatedViolations.map(v => v.hash);

    const newDeltaResult = await storageService.recordViolationDeltas(newCheckId, newHashes);
    console.log(`✅ New deltas: ${newDeltaResult.added} added, ${newDeltaResult.removed} removed, ${newDeltaResult.unchanged} unchanged`);
    console.log('');

    // Test rule scheduling
    console.log('8. Testing rule scheduling...');

    // Create rule schedules
    const scheduleId = await storageService.upsertRuleSchedule({
      rule_id: 'record-type-check',
      engine: 'typescript',
      enabled: 1,
      priority: 1,
      check_frequency_ms: 30_000
    });
    console.log(`✅ Created rule schedule with ID: ${scheduleId}`);

    // Get next rules to check
    const nextRules = await storageService.getNextRulesToCheck(5);
    console.log(`✅ Found ${nextRules.length} rules ready to check`);
    for (const rule of nextRules) {
      console.log(`   - ${rule.rule_id} (${rule.engine}): priority ${rule.priority}`);
    }
    console.log('');

    // Test performance metrics
    console.log('9. Testing performance metrics...');
    await storageService.recordPerformanceMetric('test_operation', 250.5, 'ms', 'test context');
    console.log('✅ Performance metric recorded');
    console.log('');

    // Test dashboard data
    console.log('10. Testing dashboard data...');
    const dashboardData = await storageService.getDashboardData();
    console.log('✅ Dashboard data generated:');
    console.log(`   - Active violations: ${dashboardData.active_violations}`);
    console.log(`   - Files affected: ${dashboardData.total_files_affected}`);
    console.log(`   - Summary categories: ${dashboardData.summary.length}`);
    console.log(`   - Rule performance items: ${dashboardData.rule_performance.length}`);
    console.log(`   - Recent history items: ${dashboardData.recent_history.length}`);
    console.log('');

    // Test health check
    console.log('11. Testing health check...');
    const healthStatus = await configManager.healthCheck();
    console.log('✅ Health check results:');
    console.log(`   - Database: ${healthStatus.database ? '✅' : '❌'}`);
    console.log(`   - Storage Service: ${healthStatus.storageService ? '✅' : '❌'}`);
    console.log(`   - Overall: ${healthStatus.overall ? '✅' : '❌'}`);
    console.log('');

    // Test system stats
    console.log('12. Testing system statistics...');
    const systemStats = await configManager.getSystemStats();
    console.log('✅ System statistics:');
    console.log(`   - Uptime: ${Math.round(systemStats.performance.uptime)}s`);
    console.log(`   - Memory: ${Math.round(systemStats.performance.memoryUsage.heapUsed / 1024 / 1024)}MB`);
    if (systemStats.database) {
      console.log(`   - DB Violations: ${systemStats.database.violations_count}`);
      console.log(`   - DB Size: ${systemStats.database.database_size_mb}MB`);
    }
    if (systemStats.storage) {
      console.log(`   - Active Violations: ${systemStats.storage.activeViolations}`);
      console.log(`   - History Records: ${systemStats.storage.totalHistoryRecords}`);
    }
    console.log('');

    // Test maintenance
    console.log('13. Testing maintenance operations...');
    const maintenanceResult = await configManager.performMaintenance();
    console.log('✅ Maintenance completed:');
    if (maintenanceResult.dataCleanup) {
      console.log(`   - History cleaned: ${maintenanceResult.dataCleanup.violationHistoryDeleted} records`);
      console.log(`   - Metrics cleaned: ${maintenanceResult.dataCleanup.performanceMetricsDeleted} records`);
    }
    console.log(`   - Database optimized: ${maintenanceResult.databaseOptimization}`);
    if (maintenanceResult.errors.length > 0) {
      console.log(`   - Errors: ${maintenanceResult.errors.join(', ')}`);
    }
    console.log('');

    console.log('🎉 All service tests passed!\n');

    // Cleanup
    await configManager.shutdown();
    console.log('🧹 Services shut down cleanly');

  } catch (error) {
    console.error('❌ Service test failed:', error);
    process.exit(1);
  }
}

// Run tests
testServices();
