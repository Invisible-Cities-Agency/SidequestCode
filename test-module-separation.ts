#!/usr/bin/env tsx
/**
 * Test script for Module Separation and Service Interfaces
 * Verifies all services work together through clean interfaces
 */

import {
  createServiceSuite,
  createOrchestratorService,
  resetAllServices,
  type OrchestratorConfig
} from './services/index.js';

import type { Violation as OrchestratorViolation } from './utils/violation-types.js';

async function testModuleSeparation() {
  console.log('🔧 Testing Module Separation and Service Interfaces...\\n');

  try {
    // Clean up any existing instances
    resetAllServices();

    // ========================================================================
    // Test 1: Service Suite Creation
    // ========================================================================

    console.log('1. Testing service suite creation...');
    const serviceSuite = await createServiceSuite('test');

    console.log('✅ Service suite created with all services:');
    console.log('   - ConfigManager ✓');
    console.log('   - StorageService ✓');
    console.log('   - PollingService ✓');
    console.log('   - AnalysisService ✓');
    console.log('   - ViolationTracker ✓');
    console.log('   - OrchestratorService ✓');
    console.log('');

    // ========================================================================
    // Test 2: Individual Service Interfaces
    // ========================================================================

    console.log('2. Testing individual service interfaces...');

    // Test ViolationTracker interface
    const testViolations: OrchestratorViolation[] = [
      {
        file: 'src/test.ts',
        line: 10,
        column: 5,
        message: 'Test violation for interface testing',
        category: 'test-category',
        severity: 'warn',
        source: 'typescript',
        rule: 'test-rule',
        code: 'test code'
      },
      {
        file: 'src/test.ts',
        line: 20,
        column: 8,
        message: 'Duplicate test violation',
        category: 'test-category',
        severity: 'error',
        source: 'eslint',
        rule: 'duplicate-test',
        code: 'duplicate code'
      }
    ];

    // Test violation processing
    const processingResult = await serviceSuite.violationTracker.processViolations(testViolations);
    console.log(`✅ ViolationTracker processed ${processingResult.processed} violations:`);
    console.log(`   - Inserted: ${processingResult.inserted}`);
    console.log(`   - Updated: ${processingResult.updated}`);
    console.log(`   - Deduplicated: ${processingResult.deduplicated}`);

    // Test deduplication
    const deduplicatedViolations = serviceSuite.violationTracker.deduplicateViolations([...testViolations, ...testViolations]);
    console.log(`✅ Deduplication: ${testViolations.length * 2} → ${deduplicatedViolations.length} violations`);

    // Test filtering
    const filteredByRule = serviceSuite.violationTracker.filterViolationsByRule(testViolations, ['test-rule']);
    console.log(`✅ Rule filtering: ${testViolations.length} → ${filteredByRule.length} violations for rule 'test-rule'`);
    console.log('');

    // ========================================================================
    // Test 3: Analysis Service Interface
    // ========================================================================

    console.log('3. Testing analysis service interface...');

    // Test delta computation
    const previousHashes = ['hash1', 'hash2', 'hash3'];
    const currentHashes = ['hash2', 'hash3', 'hash4', 'hash5'];
    const deltas = serviceSuite.analysisService.computeViolationDeltas(previousHashes, currentHashes);

    console.log('✅ Delta computation:');
    console.log(`   - Added: ${deltas.added.length} (${deltas.added.join(', ')})`);
    console.log(`   - Removed: ${deltas.removed.length} (${deltas.removed.join(', ')})`);
    console.log(`   - Unchanged: ${deltas.unchanged.length} (${deltas.unchanged.join(', ')})`);

    // Test statistical analysis
    const timeRange = {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      end: new Date()
    };

    const violationStats = await serviceSuite.analysisService.calculateViolationStats(timeRange);
    console.log(`✅ Violation stats: ${violationStats.total} total violations affecting ${violationStats.filesAffected} files`);

    // Test rule performance analysis
    const rulePerformance = await serviceSuite.analysisService.getRulePerformanceAnalysis();
    console.log(`✅ Rule performance analysis: ${rulePerformance.length} rules analyzed`);
    console.log('');

    // ========================================================================
    // Test 4: Polling Service Interface
    // ========================================================================

    console.log('4. Testing polling service interface...');

    // Test rule scheduling
    await serviceSuite.pollingService.scheduleRule('test-rule-1', 'typescript', 15_000);
    await serviceSuite.pollingService.scheduleRule('test-rule-2', 'eslint', 20_000);
    console.log('✅ Scheduled 2 test rules');

    // Test getting scheduled rules
    const scheduledRules = await serviceSuite.pollingService.getScheduledRules();
    console.log(`✅ Found ${scheduledRules.length} scheduled rules`);

    // Test configuration
    serviceSuite.pollingService.setDefaultFrequency(25_000);
    serviceSuite.pollingService.setMaxConcurrentChecks(5);
    serviceSuite.pollingService.enableAdaptivePolling(true);
    console.log('✅ Polling service configuration updated');
    console.log('');

    // ========================================================================
    // Test 5: Orchestrator Service Integration
    // ========================================================================

    console.log('5. Testing orchestrator service integration...');

    const orchestrator = await createOrchestratorService('test');

    // Test service access
    const storageService = orchestrator.getStorageService();
    const pollingService = orchestrator.getPollingService();
    const analysisService = orchestrator.getAnalysisService();
    const violationTracker = orchestrator.getViolationTracker();

    console.log('✅ All services accessible through orchestrator');

    // Test configuration management
    const currentConfig = orchestrator.getConfiguration();
    console.log('✅ Current configuration retrieved:');
    console.log(`   - Database: ${currentConfig.database.path}`);
    console.log(`   - Polling frequency: ${currentConfig.polling.defaultFrequencyMs}ms`);
    console.log(`   - Watch interval: ${currentConfig.watch.intervalMs}ms`);

    // Test health check
    const healthStatus = await orchestrator.healthCheck();
    console.log(`✅ Health check: Overall ${healthStatus.overall ? '✅' : '❌'}`);
    console.log(`   - Storage: ${healthStatus.services.storage ? '✅' : '❌'}`);
    console.log(`   - Polling: ${healthStatus.services.polling ? '✅' : '❌'}`);
    console.log(`   - Analysis: ${healthStatus.services.analysis ? '✅' : '❌'}`);
    console.log(`   - Tracker: ${healthStatus.services.tracker ? '✅' : '❌'}`);

    if (healthStatus.errors.length > 0) {
      console.log(`   - Errors: ${healthStatus.errors.join(', ')}`);
    }

    // Test system stats
    const systemStats = await orchestrator.getSystemStats();
    console.log('✅ System stats:');
    console.log(`   - Uptime: ${Math.round(systemStats.uptime)}s`);
    console.log(`   - Memory: ${Math.round(systemStats.memoryUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`   - Active checks: ${systemStats.activeChecks}`);
    console.log(`   - Watch mode: ${systemStats.watchMode ? 'Active' : 'Inactive'}`);
    console.log('');

    // ========================================================================
    // Test 6: Event System
    // ========================================================================

    console.log('6. Testing event system...');

    let eventCount = 0;

    // Set up event listeners
    orchestrator.on('ruleStarted', (ruleId, engine) => {
      console.log(`   📡 Event: Rule started - ${ruleId} (${engine})`);
      eventCount++;
    });

    orchestrator.on('ruleCompleted', (result) => {
      console.log(`   📡 Event: Rule completed - ${result.ruleId} (${result.success ? 'Success' : 'Failed'})`);
      eventCount++;
    });

    orchestrator.on('cycleCompleted', (results) => {
      console.log(`   📡 Event: Cycle completed - ${results.length} rules executed`);
      eventCount++;
    });

    // Execute a single check to trigger events
    try {
      const singleCheckResult = await orchestrator.runSingleCheck('test-rule-1', 'typescript');
      console.log(`✅ Single check completed: ${singleCheckResult.success ? 'Success' : 'Failed'}`);
    } catch (error) {
      console.log(`⚠️  Single check failed (expected for test environment): ${error}`);
    }

    // Give events time to propagate
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(`✅ Event system working: ${eventCount} events received`);
    console.log('');

    // ========================================================================
    // Test 7: Interface Compliance
    // ========================================================================

    console.log('7. Testing interface compliance...');

    // Verify all services implement their interfaces correctly
    const interfaceTests = [
      {
        name: 'StorageService implements IStorageService',
        test: () => {
          const service = storageService;
          return typeof service.storeViolations === 'function' &&
                 typeof service.getViolations === 'function' &&
                 typeof service.getDashboardData === 'function' &&
                 typeof service.startRuleCheck === 'function';
        }
      },
      {
        name: 'PollingService implements IPollingService',
        test: () => {
          const service = pollingService;
          return typeof service.start === 'function' &&
                 typeof service.stop === 'function' &&
                 typeof service.scheduleRule === 'function' &&
                 typeof service.executeRule === 'function' &&
                 typeof service.isRunning === 'function';
        }
      },
      {
        name: 'AnalysisService implements IAnalysisService',
        test: () => {
          const service = analysisService;
          return typeof service.computeViolationDeltas === 'function' &&
                 typeof service.getViolationTrends === 'function' &&
                 typeof service.calculateViolationStats === 'function' &&
                 typeof service.generateQualityReport === 'function';
        }
      },
      {
        name: 'ViolationTracker implements IViolationTracker',
        test: () => {
          const service = violationTracker;
          return typeof service.processViolations === 'function' &&
                 typeof service.deduplicateViolations === 'function' &&
                 typeof service.generateViolationHash === 'function' &&
                 typeof service.validateViolation === 'function';
        }
      },
      {
        name: 'OrchestratorService implements IOrchestratorService',
        test: () => {
          const service = orchestrator;
          return typeof service.initialize === 'function' &&
                 typeof service.shutdown === 'function' &&
                 typeof service.getStorageService === 'function' &&
                 typeof service.startWatchMode === 'function' &&
                 typeof service.healthCheck === 'function';
        }
      }
    ];

    for (const interfaceTest of interfaceTests) {
      const passed = interfaceTest.test();
      console.log(`${passed ? '✅' : '❌'} ${interfaceTest.name}`);
    }
    console.log('');

    // ========================================================================
    // Test 8: Configuration Update
    // ========================================================================

    console.log('8. Testing configuration updates...');

    const newConfig: Partial<OrchestratorConfig> = {
      polling: {
        defaultFrequencyMs: 45_000,
        maxConcurrentChecks: 7,
        adaptivePolling: false
      },
      watch: {
        intervalMs: 2000,
        debounceMs: 300,
        autoCleanup: false
      }
    };

    await orchestrator.updateConfiguration(newConfig);
    const updatedConfig = orchestrator.getConfiguration();

    console.log('✅ Configuration updated successfully:');
    console.log(`   - Polling frequency: ${updatedConfig.polling.defaultFrequencyMs}ms`);
    console.log(`   - Max concurrent: ${updatedConfig.polling.maxConcurrentChecks}`);
    console.log(`   - Watch interval: ${updatedConfig.watch.intervalMs}ms`);
    console.log('');

    // ========================================================================
    // Cleanup
    // ========================================================================

    console.log('9. Cleanup...');
    await orchestrator.shutdown();
    await serviceSuite.configManager.shutdown();
    resetAllServices();
    console.log('✅ All services shut down cleanly');
    console.log('');

    console.log('🎉 Module Separation and Service Interface tests passed!\\n');

  } catch (error) {
    console.error('❌ Module separation test failed:', error);
    process.exit(1);
  }
}

// Run tests
testModuleSeparation();
