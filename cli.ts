#!/usr/bin/env node
/**
 * @fileoverview CLI interface for the Code Quality Orchestrator
 * 
 * Provides command-line interface using the new SQLite + Kysely persistence system
 * with enhanced capabilities including historical analysis and burndown metrics.
 */

import { 
  createOrchestratorService,
  resetAllServices,
  type OrchestratorConfig,
  type HealthCheckResult
} from './services/index.js';
import type { Violation as OrchestratorViolation } from './utils/violation-types.js';
// ViolationSummaryItem no longer needed - using live data only
import { getDeveloperWatchDisplay, resetDeveloperWatchDisplay } from './watch-display-v2.js';
import { detectTerminalBackground, detectTerminalModeHeuristic, debugTerminalEnvironment } from './terminal-detector.js';
import { isESLintCategory } from './shared/constants.js';

// Import the old orchestrator temporarily for compatibility
import { CodeQualityOrchestrator } from './orchestrator.js';
import type { OrchestratorResult } from './orchestrator.js';

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  help: args.includes('--help') || args.includes('-h'),
  watch: args.includes('--watch'),
  includeAny: args.includes('--include-any'),
  includeESLint: args.includes('--include-eslint'),
  eslintOnly: args.includes('--eslint-only'),
  targetPath: (() => {
    const pathIndex = args.indexOf('--path');
    if (pathIndex !== -1 && pathIndex + 1 < args.length) {
      return args[pathIndex + 1];
    }
    return 'app';
  })(),
  colorScheme: (() => {
    const schemeIndex = args.indexOf('--color-scheme');
    if (schemeIndex !== -1 && schemeIndex + 1 < args.length) {
      const scheme = args[schemeIndex + 1];
      if (['auto', 'light', 'dark'].includes(scheme)) {
        return scheme;
      }
    }
    return 'auto';
  })(),
  outputJson: args.includes('--json'),
  strict: args.includes('--strict'),
  noCrossoverCheck: args.includes('--no-crossover-check'),
  failOnCrossover: args.includes('--fail-on-crossover'),
  // New flags for enhanced persistence features
  usePersistence: !args.includes('--no-persistence'),
  showBurndown: args.includes('--burndown'),
  resetSession: args.includes('--reset-session'),
  debugTerminal: args.includes('--debug-terminal')
};

// Handle color scheme detection and setting
if (flags.colorScheme === 'light') {
  process.env.TERM_COLOR_MODE = 'light';
} else if (flags.colorScheme === 'dark') {
  process.env.TERM_COLOR_MODE = 'dark';
} else if (flags.colorScheme === 'auto') {
  // Auto-detection will happen in the display system
  delete process.env.TERM_COLOR_MODE;
}

/**
 * Display help information
 */
function showHelp(): void {
  console.log(`
📊 Code Quality Orchestrator

COMMON COMMANDS:
  npm run :watch           Watch mode with auto-detected colors
  npm run watch:light      Watch mode for light terminals (Novel/Man Page)
  npm run watch:dark       Watch mode for dark terminals
  npm run watch:enhanced   Watch mode with ESLint included
  npm run burndown         Show historical violation trends
  npm run reset-session   Reset session baseline

ANALYSIS OPTIONS:
  --watch                  Enable real-time watch mode
  --include-eslint         Include ESLint violations
  --include-any            Include TypeScript 'any' violations
  --path <dir>             Target directory (default: app)
  --color-scheme <mode>    Color mode: auto, light, dark

OUTPUT OPTIONS:
  --json                   JSON output format
  --burndown               Show burndown analysis

EXAMPLES:
  # Start watching with auto-detected colors
  npm run :watch

  # Force light mode for Novel terminal
  npm run watch:light

  # Force dark mode for black terminals
  npm run watch:dark

  # Watch with ESLint analysis
  npm run watch:enhanced

  # One-time analysis with ESLint
  npx tsx cli.ts --include-eslint

  # Show violation trends over time
  npm run burndown

  # Debug color detection
  npm run debug-terminal

TROUBLESHOOTING:
  If colors look wrong, use explicit mode:
  npm run watch:dark    # For black/dark terminals
  npm run watch:light   # For white/light terminals

FEATURES:
  🚀 Automatic terminal color detection (OSC + heuristics)
  📊 SQLite persistence with historical tracking
  📈 Burndown metrics and trend analysis
  ⚡ Real-time updates with smooth UX
  🎨 APCA-compliant light/dark color schemes
`);
}

/**
 * Get color scheme for terminal output with light/dark mode support
 */
function getColorScheme() {
  const colorMode = process.env.TERM_COLOR_MODE || detectTerminalMode();
  
  if (colorMode === 'light') {
    // Light mode: Replicate macOS Terminal "Man Page" theme colors
    return {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      primary: '\x1b[30m',    // Black text (Man Page style)
      secondary: '\x1b[90m',  // Dark gray
      info: '\x1b[34m',       // Deep blue 
      success: '\x1b[32m',    // Deep green
      warning: '\x1b[33m',    // Amber/brown
      error: '\x1b[31m',      // Deep red
      muted: '\x1b[37m',      // Medium gray
      header: '\x1b[35m'      // Purple (Man Page style)
    };
  } else {
    // Dark mode: Replicate macOS Terminal "Pro" theme colors
    return {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      primary: '\x1b[97m',    // Bright white (Pro theme style)
      secondary: '\x1b[37m',  // Light gray
      info: '\x1b[94m',       // Bright blue (Pro theme blue)
      success: '\x1b[92m',    // Bright green (Pro theme green)
      warning: '\x1b[93m',    // Bright yellow (Pro theme yellow)
      error: '\x1b[91m',      // Bright red (Pro theme red)
      muted: '\x1b[90m',      // Dim gray
      header: '\x1b[96m'      // Bright cyan (Pro theme cyan)
    };
  }
}

/**
 * Detect terminal color mode using various heuristics
 */
function detectTerminalMode(): 'light' | 'dark' {
  return detectTerminalModeHeuristic();
}

// Removed old complex display function - using clean developer display instead

/**
 * Display burndown analysis
 */
async function displayBurndownAnalysis(orchestrator: any): Promise<void> {
  const colors = getColorScheme();
  
  console.log(`${colors.bold}${colors.header}📈 Burndown Analysis${colors.reset}\n`);
  
  try {
    const analysisService = orchestrator.getAnalysisService();
    const timeRange = {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      end: new Date()
    };
    
    // Get violation trends
    const trends = await analysisService.getViolationTrends(timeRange);
    const stats = await analysisService.calculateViolationStats(timeRange);
    
    console.log(`${colors.warning}24-Hour Summary:${colors.reset}`);
    console.log(`${colors.secondary}  Total violations: ${colors.primary}${stats.total}${colors.reset}`);
    console.log(`${colors.secondary}  Files affected: ${colors.primary}${stats.filesAffected}${colors.reset}`);
    console.log(`${colors.secondary}  Avg per file: ${colors.primary}${stats.avgPerFile.toFixed(1)}${colors.reset}\n`);
    
    // Show category breakdown
    console.log(`${colors.warning}By Category:${colors.reset}`);
    Object.entries(stats.byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([category, count]) => {
        const percentage = ((count / stats.total) * 100).toFixed(1);
        console.log(`  ${colors.info}${category}:${colors.reset} ${colors.primary}${count}${colors.reset} ${colors.secondary}(${percentage}%)${colors.reset}`);
      });
    
    // Show rule recommendations
    const recommendations = await analysisService.recommendRuleFrequencies();
    if (recommendations.length > 0) {
      console.log(`\n${colors.warning}Rule Frequency Recommendations:${colors.reset}`);
      recommendations.slice(0, 5).forEach(rec => {
        const currentFreq = Math.round(rec.currentFrequency / 1000);
        const recommendedFreq = Math.round(rec.recommendedFrequency / 1000);
        console.log(`  ${colors.info}${rec.ruleId}:${colors.reset} ${currentFreq}s → ${recommendedFreq}s ${colors.secondary}(${rec.reasoning})${colors.reset}`);
      });
    }
    
  } catch (error) {
    console.log(`${colors.error}Error generating burndown analysis: ${error}${colors.reset}`);
  }
}

/**
 * Process violations using the new persistence system
 */
async function processViolationsWithPersistence(
  violations: OrchestratorViolation[], 
  orchestrator: any
): Promise<void> {
  try {
    const violationTracker = orchestrator.getViolationTracker();
    const processingResult = await violationTracker.processViolations(violations);
    
    // Log processing results in debug mode
    if (process.env.DEBUG) {
      console.log('[Persistence] Processing result:', processingResult);
    }
  } catch (error) {
    console.error('[Persistence] Failed to process violations:', error);
  }
}

/**
 * Legacy display function for compatibility
 */
function displayConsoleResults(result: OrchestratorResult): void {
  const colors = getColorScheme();
  const { violations, summary, totalExecutionTime } = result;

  console.log(`\n${colors.bold}${colors.header}📊 Code Quality Analysis Results${colors.reset}`);
  console.log(`${colors.secondary}Total violations: ${colors.primary}${summary.total}${colors.reset}`);
  
  if (summary.bySource.typescript > 0 || summary.bySource.eslint > 0) {
    console.log(`\n${colors.warning}By Source:${colors.reset}`);
    if (summary.bySource.typescript > 0) {
      console.log(`  📝 ${colors.info}TypeScript:${colors.reset} ${colors.primary}${summary.bySource.typescript}${colors.reset}`);
    }
    if (summary.bySource.eslint > 0) {
      console.log(`  🔍 ${colors.info}ESLint:${colors.reset} ${colors.primary}${summary.bySource.eslint}${colors.reset}`);
    }
  }

  console.log(`\n${colors.warning}By Category:${colors.reset}`);
  Object.entries(summary.byCategory)
    .sort(([, a], [, b]) => b - a)
    .forEach(([category, count]) => {
      const isESLint = isESLintCategory(category);
      const prefix = isESLint ? '🔍' : '📝';
      const severity = violations.find(v => v.category === category)?.severity || 'info';
      const severityIcon = severity === 'error' ? '❌' : severity === 'warn' ? '⚠️' : 'ℹ️';
      
      console.log(`  ${severityIcon} ${prefix} ${colors.info}${category}:${colors.reset} ${colors.primary}${count}${colors.reset}`);
    });

  console.log(`\n${colors.muted}Analysis completed in ${totalExecutionTime}ms${colors.reset}`);
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  if (flags.help) {
    showHelp();
    process.exit(0);
  }

  // Show terminal debug info if requested
  if (flags.debugTerminal) {
    debugTerminalEnvironment();
    
    console.log('\n=== Color Detection Test ===');
    const heuristicMode = detectTerminalModeHeuristic();
    console.log('Heuristic detection:', heuristicMode);
    
    console.log('\nTesting OSC background detection...');
    const oscDetection = await detectTerminalBackground();
    console.log('OSC detection result:', oscDetection || 'Not supported/failed');
    
    console.log('\nFinal color mode:', process.env.TERM_COLOR_MODE || oscDetection || heuristicMode);
    process.exit(0);
  }

  const colors = getColorScheme();

  // Determine which system to use
  const usePersistence = flags.usePersistence;
  
  if (usePersistence) {
    console.log(`${colors.info}🚀 Using enhanced SQLite persistence system...${colors.reset}`);
    
    try {
      // Reset services if requested
      if (flags.resetSession) {
        resetAllServices();
        resetDeveloperWatchDisplay(); // Also reset the display state
        console.log(`${colors.warning}♻️  Session reset - starting fresh...${colors.reset}`);
      }

      // Create enhanced orchestrator service
      const orchestrator = await createOrchestratorService('development');
      
      // Show burndown analysis if requested
      if (flags.showBurndown) {
        await displayBurndownAnalysis(orchestrator);
        await orchestrator.shutdown();
        return;
      }

      // Health check
      const health = await orchestrator.healthCheck();
      if (!health.overall) {
        console.log(`${colors.warning}⚠️  Health check warnings: ${health.errors.join(', ')}${colors.reset}`);
      }

      if (flags.watch) {
        // Enhanced watch mode with persistence
        console.log(`${colors.bold}${colors.info}Starting Enhanced Code Quality Watch...${colors.reset}`);
        
        let checksCount = 0;
        const sessionStart = Date.now();
        
        // Start watch mode with orchestrator service
        await orchestrator.startWatchMode({
          intervalMs: 3000,
          debounceMs: 500,
          autoCleanup: true,
          maxConcurrentChecks: 3
        });

        // Create legacy orchestrator for violation collection (SILENT mode for watch)
        const legacyOrchestrator = new CodeQualityOrchestrator({
          targetPath: flags.targetPath,
          watch: { enabled: false, interval: 3000, debounce: 500 },
          engines: {
            typescript: {
              enabled: !flags.eslintOnly,
              options: { includeAny: flags.includeAny, strict: flags.strict, targetPath: flags.targetPath },
              priority: 1, timeout: 30000, allowFailure: false
            },
            eslint: {
              enabled: flags.includeESLint || flags.eslintOnly,
              options: { roundRobin: false, maxWarnings: 1000, timeout: 30000 },
              priority: 2, timeout: 35000, allowFailure: true
            }
          },
          output: { console: false }, // SILENT: No console output during watch mode
          deduplication: { enabled: true, strategy: 'exact' },
          crossover: { enabled: !flags.noCrossoverCheck, warnOnTypeAwareRules: true, warnOnDuplicateViolations: true, failOnCrossover: flags.failOnCrossover }
        });

        // Get the clean developer display
        const watchDisplay = getDeveloperWatchDisplay();
        
        // Enable silent mode for services during watch
        orchestrator.setSilentMode(true);
        
        // Watch cycle with persistence
        const runEnhancedWatchCycle = async () => {
          try {
            // Get current violations using legacy orchestrator
            const result = await legacyOrchestrator.analyze();
            checksCount++;
            
            // Process violations with persistence (for historical tracking)
            await processViolationsWithPersistence(result.violations, orchestrator);
            
            if (flags.outputJson) {
              const enhancedResult = {
                ...result,
                database: {
                  dashboard: await orchestrator.getStorageService().getDashboardData()
                }
              };
              console.log(JSON.stringify(enhancedResult, null, 2));
            } else {
              // Use the clean developer display for clear metrics
              await watchDisplay.updateDisplay(result.violations, checksCount, orchestrator);
            }
          } catch (error) {
            console.error('[Enhanced Watch] Analysis failed:', error);
          }
        };

        // Initial run
        await runEnhancedWatchCycle();

        // Set up interval
        const watchInterval = setInterval(runEnhancedWatchCycle, 3000);
        
        // Safety timeout (10 minutes)
        const watchTimeout = setTimeout(async () => {
          console.log('\n\n⏰ Watch mode timeout reached (10 minutes). Stopping...');
          clearInterval(watchInterval);
          await orchestrator.stopWatchMode();
          await orchestrator.shutdown();
          
          // Clean shutdown of display system
          watchDisplay.shutdown();
          resetDeveloperWatchDisplay();
          
          process.exit(0);
        }, 10 * 60 * 1000);

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
          clearInterval(watchInterval);
          clearTimeout(watchTimeout);
          await orchestrator.stopWatchMode();
          await orchestrator.shutdown();
          
          // Clean shutdown of display system
          watchDisplay.shutdown();
          resetDeveloperWatchDisplay();
          
          console.log('\n\n👋 Enhanced Code Quality Orchestrator watch stopped.');
          process.exit(0);
        });

      } else {
        // Single run mode with persistence
        console.log(`${colors.info}Running Enhanced Code Quality Analysis...${colors.reset}`);
        
        // Use legacy orchestrator for analysis, new system for persistence
        const legacyOrchestrator = new CodeQualityOrchestrator({
          targetPath: flags.targetPath,
          watch: { enabled: false, interval: 3000, debounce: 500 },
          engines: {
            typescript: {
              enabled: !flags.eslintOnly,
              options: { includeAny: flags.includeAny, strict: flags.strict, targetPath: flags.targetPath },
              priority: 1, timeout: 30000, allowFailure: false
            },
            eslint: {
              enabled: flags.includeESLint || flags.eslintOnly,
              options: { roundRobin: false, maxWarnings: 1000, timeout: 30000 },
              priority: 2, timeout: 35000, allowFailure: true
            }
          },
          output: { console: !flags.outputJson, json: flags.outputJson ? 'stdout' : undefined },
          deduplication: { enabled: true, strategy: 'exact' },
          crossover: { enabled: !flags.noCrossoverCheck, warnOnTypeAwareRules: true, warnOnDuplicateViolations: true, failOnCrossover: flags.failOnCrossover }
        });

        const result = await legacyOrchestrator.analyze();
        
        // Process with persistence
        await processViolationsWithPersistence(result.violations, orchestrator);
        
        if (flags.outputJson) {
          const enhancedResult = {
            ...result,
            database: {
              summary: await orchestrator.getStorageService().getViolationSummary(),
              dashboard: await orchestrator.getStorageService().getDashboardData()
            }
          };
          console.log(JSON.stringify(enhancedResult, null, 2));
        } else {
          displayConsoleResults(result);
          
          // Show enhanced summary
          const summary = await orchestrator.getStorageService().getViolationSummary();
          if (summary.length > 0) {
            console.log(`\n${colors.info}📊 Database Summary:${colors.reset}`);
            summary.slice(0, 5).forEach(item => {
              console.log(`  ${colors.secondary}${item.category}: ${colors.primary}${item.count}${colors.reset} ${colors.secondary}(${item.affected_files} files)${colors.reset}`);
            });
          }
        }
        
        await orchestrator.shutdown();
      }

    } catch (error) {
      console.error('[Enhanced Orchestrator] Error:', error);
      process.exit(1);
    }

  } else {
    // Legacy mode
    console.log(`${colors.warning}⚠️  Using legacy in-memory mode...${colors.reset}`);
    
    // Fallback to original implementation
    const config = {
      targetPath: flags.targetPath,
      watch: { enabled: flags.watch, interval: 3000, debounce: 500 },
      engines: {
        typescript: {
          enabled: !flags.eslintOnly,
          options: { includeAny: flags.includeAny, strict: flags.strict, targetPath: flags.targetPath },
          priority: 1, timeout: 30000, allowFailure: false
        },
        eslint: {
          enabled: flags.includeESLint || flags.eslintOnly,
          options: { roundRobin: true, maxWarnings: 500, timeout: 30000 },
          priority: 2, timeout: 35000, allowFailure: true
        }
      },
      output: { console: !flags.outputJson, json: flags.outputJson ? 'stdout' : undefined },
      deduplication: { enabled: true, strategy: 'exact' },
      crossover: { enabled: !flags.noCrossoverCheck, warnOnTypeAwareRules: true, warnOnDuplicateViolations: true, failOnCrossover: flags.failOnCrossover }
    };

    const orchestrator = new CodeQualityOrchestrator(config);
    const result = await orchestrator.analyze();
    
    if (flags.outputJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      displayConsoleResults(result);
    }
  }
}

// Execute main function
main().catch(error => {
  console.error('[CLI] Unexpected error:', error);
  process.exit(1);
});