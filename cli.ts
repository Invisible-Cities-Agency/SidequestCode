#!/usr/bin/env node
/**
 * @fileoverview CLI interface for SideQuest Code Quality Orchestrator
 *
 * Configuration-agnostic TypeScript and ESLint orchestrator that respects your project setup.
 * Features include:
 * - Interactive first-run setup with best practices guidance
 * - TypeScript compilation checking using client's exact tsconfig.json
 * - Optional ESLint integration with separation of concerns warnings
 * - User preferences system with persistent configuration
 * - Real-time watch mode with intelligent terminal color detection
 * - SQLite persistence for historical tracking and performance optimization
 *
 * @example
 * ```bash
 * # First run triggers interactive setup
 * sidequest --watch
 *
 * # Configuration management
 * sidequest --config show
 * sidequest --config edit
 *
 * # Analysis modes
 * sidequest --watch                    # TypeScript only (default)
 * sidequest --watch --include-eslint   # Add ESLint (optional)
 * ```
 *
 * @author SideQuest
 * @version 0.1.0-alpha.2
 */

import {
  createOrchestratorService,
  resetAllServices
} from './services/index.js';
import type { Violation as OrchestratorViolation, OrchestratorResult } from './utils/violation-types.js';
// ViolationSummaryItem no longer needed - using live data only
import { getDeveloperWatchDisplay, resetDeveloperWatchDisplay } from './watch-display-v2.js';
import { detectTerminalBackground, detectTerminalModeHeuristic, debugTerminalEnvironment } from './terminal-detector.js';
import { isESLintCategory } from './shared/constants.js';
import type { CLIFlags, OrchestratorConfigInput } from './utils/types.js';

// Import the old orchestrator temporarily for compatibility
import { CodeQualityOrchestrator } from './orchestrator.js';

// Parse command line arguments
const arguments_ = process.argv.slice(2);
const flags: CLIFlags = {
  help: arguments_.includes('--help') || arguments_.includes('-h'),
  watch: arguments_.includes('--watch'),
  includeAny: arguments_.includes('--include-any'),
  includeESLint: arguments_.includes('--include-eslint'),
  eslintOnly: arguments_.includes('--eslint-only'),
  targetPath: (() => {
    const pathIndex = arguments_.indexOf('--path');
    if (pathIndex !== -1 && pathIndex + 1 < arguments_.length) {
      return arguments_[pathIndex + 1];
    }
    return '.';
  })() as string,
  colorScheme: (() => {
    const schemeIndex = arguments_.indexOf('--color-scheme');
    if (schemeIndex !== -1 && schemeIndex + 1 < arguments_.length) {
      const scheme = arguments_[schemeIndex + 1];
      if (scheme && ['auto', 'light', 'dark'].includes(scheme)) {
        return scheme as 'auto' | 'light' | 'dark';
      }
    }
    return 'auto' as const;
  })(),
  verbose: arguments_.includes('--verbose'),
  strict: arguments_.includes('--strict'),
  noCrossoverCheck: arguments_.includes('--no-crossover-check'),
  failOnCrossover: arguments_.includes('--fail-on-crossover'),
  // New flags for enhanced persistence features
  usePersistence: !arguments_.includes('--no-persistence'),
  showBurndown: arguments_.includes('--burndown'),
  resetSession: arguments_.includes('--reset-session'),
  debugTerminal: arguments_.includes('--debug-terminal'),
  dataDir: (() => {
    const dataDirIndex = arguments_.indexOf('--data-dir');
    if (dataDirIndex !== -1 && dataDirIndex + 1 < arguments_.length) {
      return arguments_[dataDirIndex + 1] || './data';
    }
    return './data';
  })(),
  generatePRD: arguments_.includes('--prd'),
  configAction: (() => {
    const configIndex = arguments_.indexOf('--config');
    if (configIndex !== -1) {
      const nextArgument = arguments_[configIndex + 1];
      if (nextArgument && !nextArgument.startsWith('--')) {
        return nextArgument; // --config show, --config reset, --config edit
      }
      return 'show'; // Default to show if just --config
    }
    return undefined;
  })(),
  skipSetup: arguments_.includes('--skip-setup')
};

// Handle color scheme detection and setting
switch (flags.colorScheme) {
case 'light': {
  process.env['TERM_COLOR_MODE'] = 'light';

  break;
}
case 'dark': {
  process.env['TERM_COLOR_MODE'] = 'dark';

  break;
}
case 'auto': {
  // Auto-detection will happen in the display system
  delete process.env['TERM_COLOR_MODE'];

  break;
}
// No default
}

/**
 * Display help information
 */
function showHelp(): void {
  console.log(`
📊 SideQuest Code Quality Orchestrator
Configuration-agnostic TypeScript and ESLint analysis that respects your project setup

COMMON COMMANDS:
  sidequest --watch                    Watch mode with auto-detected colors
  npm run sidequest:watch:light        Watch mode for light terminals (Novel/Man Page)
  npm run sidequest:watch:dark         Watch mode for dark terminals
  npm run sidequest:watch:eslint       Watch mode with ESLint included (optional)

FOR LLMS/AI ASSISTANTS (Machine-Readable JSON):
  npm run sidequest:report             Clean JSON output, no interactive prompts
  npm run sidequest:report:eslint      Include ESLint violations (JSON)
  npm run sidequest:report:strict      Strict mode analysis (JSON)

OTHER COMMANDS:
  npm run sidequest:prd                Generate PRD file for task management
  npm run sidequest:burndown           Show historical violation trends
  npm run sidequest:session:reset      Reset session baseline

ANALYSIS OPTIONS:
  --watch                  Enable real-time watch mode
  --include-eslint         Include ESLint violations (optional)
  --include-any            Include TypeScript 'any' pattern violations (optional)
  --path <dir>             Target directory (default: app)
  --color-scheme <mode>    Color mode: auto, light, dark
  --data-dir <dir>         Database directory (default: ./data)

OUTPUT OPTIONS:
  --verbose                Detailed JSON output format
  --burndown               Show burndown analysis
  --prd                    Generate PRD file for task master ingestion

CONFIGURATION:
  --config [action]        Manage user preferences
                          show (default) - Display current preferences
                          edit - Open preferences in editor
                          reset - Reset to defaults
  --skip-setup            Skip first-run interactive setup

EXAMPLES:
  # Start watching with auto-detected colors
  sidequest --watch

  # Force light mode for Novel terminal
  sidequest --watch --color-scheme light

  # Force dark mode for black terminals
  sidequest --watch --color-scheme dark

  # Watch with ESLint analysis
  sidequest --watch --include-eslint

  # One-time analysis with ESLint
  sidequest --include-eslint

  # Generate verbose JSON output
  sidequest --verbose

  # Generate PRD file for task master
  sidequest --prd

  # Custom data directory (project-scoped)
  sidequest --data-dir ./project-data

  # Global data directory (user-scoped)
  sidequest --data-dir ~/.cqo-data

  # Show violation trends over time
  sidequest --burndown

  # Debug color detection
  sidequest --debug-terminal

  # Show current configuration
  sidequest --config

  # Edit preferences
  sidequest --config edit

  # Reset preferences to defaults
  sidequest --config reset

TROUBLESHOOTING:
  If colors look wrong, use explicit mode:
  sidequest --watch --color-scheme dark    # For black/dark terminals
  sidequest --watch --color-scheme light   # For white/light terminals

FEATURES:
  🚀 Automatic terminal color detection (OSC + heuristics)
  📊 SQLite persistence with historical tracking
  📈 Burndown metrics and trend analysis
  ⚡ Real-time updates with smooth UX
  🎨 APCA-compliant light/dark color schemes
  📂 Configurable data directory for project or global storage

DATA DIRECTORY:
  By default, creates './data/' in current working directory.
  Use --data-dir to specify custom location:
  
  Project mode:  --data-dir ./project-data
  Global mode:   --data-dir ~/.cqo-data
  Temp mode:     --data-dir /tmp/cqo-analysis

TROUBLESHOOTING:
  Setup running every time?
    First-run setup should only happen once. If it keeps running:
    • Check ~/.sidequest-cqo/user-preferences.json exists
    • Try: npm run sidequest:config:reset

  Command not found: sidequest:start?
    Don't use: npm sidequest:start
    Use:       npm run sidequest:start

  Want to skip interactive setup?
    Use: npm run sidequest:report (for LLMs/automation)
    Or:  npm run sidequest:skip-setup

  Colors look wrong?
    npm run sidequest:watch:dark    # Force dark mode
    npm run sidequest:watch:light   # Force light mode
    npm run sidequest:debug:terminal # Debug detection
`);
}

/**
 * Get color scheme for terminal output with light/dark mode support
 */
function getColorScheme() {
  const colorMode = process.env['TERM_COLOR_MODE'] || detectTerminalMode();

  if (colorMode === 'light') {
    // Light mode: Replicate macOS Terminal "Man Page" theme colors
    return {
      reset: '\u001B[0m',
      bold: '\u001B[1m',
      primary: '\u001B[30m',    // Black text (Man Page style)
      secondary: '\u001B[90m',  // Dark gray
      info: '\u001B[34m',       // Deep blue
      success: '\u001B[32m',    // Deep green
      warning: '\u001B[33m',    // Amber/brown
      error: '\u001B[31m',      // Deep red
      muted: '\u001B[37m',      // Medium gray
      header: '\u001B[35m'      // Purple (Man Page style)
    };
  } else {
    // Dark mode: Replicate macOS Terminal "Pro" theme colors
    return {
      reset: '\u001B[0m',
      bold: '\u001B[1m',
      primary: '\u001B[97m',    // Bright white (Pro theme style)
      secondary: '\u001B[37m',  // Light gray
      info: '\u001B[94m',       // Bright blue (Pro theme blue)
      success: '\u001B[92m',    // Bright green (Pro theme green)
      warning: '\u001B[93m',    // Bright yellow (Pro theme yellow)
      error: '\u001B[91m',      // Bright red (Pro theme red)
      muted: '\u001B[90m',      // Dim gray
      header: '\u001B[96m'      // Bright cyan (Pro theme cyan)
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
    await analysisService.getViolationTrends(timeRange);
    const stats = await analysisService.calculateViolationStats(timeRange);

    console.log(`${colors.warning}24-Hour Summary:${colors.reset}`);
    console.log(`${colors.secondary}  Total violations: ${colors.primary}${stats.total}${colors.reset}`);
    console.log(`${colors.secondary}  Files affected: ${colors.primary}${stats.filesAffected}${colors.reset}`);
    console.log(`${colors.secondary}  Avg per file: ${colors.primary}${stats.avgPerFile.toFixed(1)}${colors.reset}\n`);

    // Show category breakdown
    console.log(`${colors.warning}By Category:${colors.reset}`);
    Object.entries(stats.byCategory)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10)
      .forEach(([category, count]) => {
        const percentage = (((count as number) / stats.total) * 100).toFixed(1);
        console.log(`  ${colors.info}${category}:${colors.reset} ${colors.primary}${count}${colors.reset} ${colors.secondary}(${percentage}%)${colors.reset}`);
      });

    // Show rule recommendations
    const recommendations = await analysisService.recommendRuleFrequencies();
    if (recommendations.length > 0) {
      console.log(`\n${colors.warning}Rule Frequency Recommendations:${colors.reset}`);
      recommendations.slice(0, 5).forEach((rec: any) => {
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
    if (process.env['DEBUG']) {
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

  if (summary.bySource.typescript > 0 || summary.bySource.eslint > 0 || summary.bySource['unused-exports'] > 0) {
    console.log(`\n${colors.warning}By Source:${colors.reset}`);
    if (summary.bySource.typescript > 0) {
      console.log(`  📝 ${colors.info}TypeScript:${colors.reset} ${colors.primary}${summary.bySource.typescript}${colors.reset}`);
    }
    if (summary.bySource.eslint > 0) {
      console.log(`  🔍 ${colors.info}ESLint:${colors.reset} ${colors.primary}${summary.bySource.eslint}${colors.reset}`);
    }
    if (summary.bySource['unused-exports'] > 0) {
      console.log(`  🗂️ ${colors.info}Unused Exports:${colors.reset} ${colors.primary}${summary.bySource['unused-exports']}${colors.reset}`);
    }
  }

  console.log(`\n${colors.warning}By Category:${colors.reset}`);
  Object.entries(summary.byCategory)
    .sort(([, a], [, b]) => (b) - (a))
    .forEach(([category, count]) => {
      const isESLint = isESLintCategory(category);
      const prefix = isESLint ? '🔍' : '📝';
      const severity = violations.find((v: any) => v.category === category)?.severity || 'info';
      const severityIcon = severity === 'error' ? '❌' : (severity === 'warn' ? '⚠️' : 'ℹ️');

      console.log(`  ${severityIcon} ${prefix} ${colors.info}${category}:${colors.reset} ${colors.primary}${count}${colors.reset}`);
    });

  console.log(`\n${colors.muted}Analysis completed in ${totalExecutionTime}ms${colors.reset}`);
}

/**
 * Generate PRD file for Claude Task Master ingestion
 */
async function generatePRD(violations: OrchestratorViolation[], targetPath: string): Promise<void> {
  const colors = getColorScheme();
  const timestamp = new Date().toISOString().split('T')[0];

  // Analyze violations for PRD content
  const totalViolations = violations.length;
  const filesAffected = new Set(violations.map(v => v.file)).size;
  const categoryBreakdown = violations.reduce((accumulator, v) => {
    accumulator[v.category] = (accumulator[v.category] || 0) + 1;
    return accumulator;
  }, {} as Record<string, number>);

  const topCategories = Object.entries(categoryBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([category, count]) => ({ category, count, percentage: ((count / totalViolations) * 100).toFixed(1) }));

  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warn').length;

  // Generate PRD content
  const prdContent = `# Code Quality Improvement PRD
Generated: ${timestamp}
Target: ${targetPath}

## Executive Summary

This codebase requires systematic code quality improvements to address ${totalViolations} violations across ${filesAffected} files. The analysis reveals patterns that can be addressed through focused development tasks.

## Problem Statement

**Current State:**
- ${errorCount} errors requiring immediate attention
- ${warningCount} warnings impacting code quality
- ${filesAffected} files affected across the codebase
- Primary issues in: ${topCategories.slice(0, 3).map(c => c.category).join(', ')}

**Impact:**
- Developer productivity hindered by type safety issues
- Code maintainability reduced by linting violations
- Technical debt accumulating in core files

## Solution Overview

Implement a systematic code quality improvement process targeting the highest-impact violations first.

## Detailed Requirements

### Priority 1: Critical Errors (${errorCount} items)
${errorCount > 0 ?
    violations.filter(v => v.severity === 'error').slice(0, 5).map(v =>
      `- **${v.category}**: ${v.message} (${v.file}:${v.line})`
    ).join('\n')
    : '- No critical errors found'}

### Priority 2: High-Impact Categories
${topCategories.slice(0, 5).map(cat =>
    `- **${cat.category}**: ${cat.count} violations (${cat.percentage}% of total)`
  ).join('\n')}

### Priority 3: File-Based Cleanup
Top affected files for focused remediation:
${[...new Set(violations.map(v => v.file))]
    .map(file => ({
      file,
      count: violations.filter(v => v.file === file).length
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(f => `- ${f.file}: ${f.count} violations`)
    .join('\n')}

## Technical Approach

### Phase 1: Foundation (Week 1)
1. Set up automated linting and type checking
2. Fix critical errors preventing builds
3. Establish baseline metrics

### Phase 2: Systematic Cleanup (Weeks 2-3)
1. Address top 3 violation categories systematically
2. Implement proper TypeScript patterns
3. Refactor highest-impact files

### Phase 3: Prevention (Week 4)
1. Add pre-commit hooks
2. Configure CI/CD quality gates
3. Document coding standards

## Acceptance Criteria

- [ ] Zero critical errors (type checking passes)
- [ ] Reduce total violations by 80%
- [ ] All modified files pass linting
- [ ] Quality metrics tracked and improving

## Risk Assessment

**Low Risk:**
- Automated tooling reduces human error
- Incremental approach allows for testing
- Focus on highest-impact items first

**Mitigation:**
- Thorough testing after each phase
- Rollback plan for any breaking changes
- Continuous integration validation

## Success Metrics

- Violation count: ${totalViolations} → Target: <${Math.ceil(totalViolations * 0.2)}
- Files affected: ${filesAffected} → Target: <${Math.ceil(filesAffected * 0.5)}
- Build time: Measure and maintain/improve
- Developer satisfaction: Survey before/after

## Implementation Timeline

**Week 1:** Foundation setup and critical fixes
**Week 2:** Top category remediation (${topCategories.slice(0, 2).map(c => c.category).join(', ')})
**Week 3:** File-focused cleanup and remaining violations
**Week 4:** Prevention systems and documentation

## Resource Requirements

- 1 Senior Developer (40 hours)
- 1 Junior Developer for testing (20 hours)
- Code review bandwidth (10 hours)

---
*Generated by SideQuest Code Quality Orchestrator*
*For task ingestion by: https://github.com/eyaltoledano/claude-task-master*
`;

  // Write PRD file
  const prdPath = `${targetPath}/CODE_QUALITY_PRD.md`;

  try {
    const fs = await import('node:fs/promises');
    await fs.writeFile(prdPath, prdContent, 'utf-8');
    console.log(`${colors.success}✅ PRD generated: ${prdPath}${colors.reset}`);
    console.log(`${colors.info}📋 Ready for Claude Task Master ingestion${colors.reset}`);
  } catch (error) {
    console.error(`${colors.error}❌ Failed to write PRD file: ${error}${colors.reset}`);
  }
}

/**
 * Check for first-time setup and run if needed
 */
async function checkAndRunFirstTimeSetup(): Promise<boolean> {
  try {
    const { InteractiveSetup } = await import('./services/interactive-setup.js');

    if (InteractiveSetup.shouldRunSetup(flags.dataDir)) {
      const colors = getColorScheme();
      const setup = new InteractiveSetup(colors, flags.dataDir);
      await setup.runSetup();
      return true; // Setup was run
    }

    return false; // No setup needed
  } catch (error) {
    console.warn('[Setup] Could not run first-time setup:', error);
    return false;
  }
}

/**
 * Handle configuration commands
 */
async function handleConfigCommand(action: string): Promise<void> {
  const colors = getColorScheme();

  try {
    // Import preferences manager
    const { PreferencesManager } = await import('./services/preferences-manager.js');
    const prefs = PreferencesManager.getInstance(flags.dataDir);

    switch (action) {
    case 'show': {
      console.log(`${colors.bold}${colors.header}📋 Current User Preferences${colors.reset}\n`);
      const allPrefs = prefs.getAllPreferences();
      console.log(JSON.stringify(allPrefs, null, 2));
      break;
    }

    case 'edit': {
      console.log(`${colors.info}Opening preferences file in editor...${colors.reset}`);
      // TODO: Open in user's preferred editor
      console.log(`${colors.secondary}Edit: ~/.sidequest-cqo/user-preferences.json${colors.reset}`);
      break;
    }

    case 'reset': {
      console.log(`${colors.warning}⚠️  Resetting all preferences to defaults...${colors.reset}`);
      prefs.resetToDefaults();
      console.log(`${colors.success}✅ Preferences reset successfully${colors.reset}`);
      break;
    }

    default: {
      console.log(`${colors.error}❌ Unknown config action: ${action}${colors.reset}`);
      console.log(`${colors.secondary}Available actions: show, edit, reset${colors.reset}`);
      break;
    }
    }

  } catch (error) {
    console.error(`${colors.error}❌ Configuration error: ${error}${colors.reset}`);
  }
}

/**
 * Intercept and provide helpful suggestions for common user errors
 */
function interceptCommonErrors(): void {
  const arguments_ = new Set(process.argv.slice(2));
  const colors = getColorScheme();

  // Check for npm run sidequest --watch (common mistake)
  if (process.env['npm_command'] === 'run-script' && process.env['npm_config_argv']) {
    try {
      const npmArguments = JSON.parse(process.env['npm_config_argv']);
      if (npmArguments.original?.includes('--watch')) {
        console.log(`${colors.warning}💡 Command Suggestion${colors.reset}

It looks like you tried: ${colors.error}npm run sidequest --watch${colors.reset}

Try one of these instead:
  ${colors.success}npm run sidequest:start${colors.reset}              # Start watching (recommended)
  ${colors.success}npm run sidequest:watch:dark${colors.reset}         # Force dark theme
  ${colors.success}npm run sidequest:watch:light${colors.reset}        # Force light theme
  ${colors.success}npm run sidequest:watch:eslint${colors.reset}       # Include ESLint

${colors.info}Note:${colors.reset} npm doesn't support flags after script names. Use the specific script instead.
`);
        process.exit(0);
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // Check for direct sidequest command without npm run
  if (process.argv[1]?.includes('cli.ts') && !(process as any).parent) {
    const hasWatchFlag = arguments_.has('--watch');
    if (hasWatchFlag && !arguments_.has('--skip-setup')) {
      console.log(`${colors.info}💡 First Time Setup${colors.reset}

You're running SideQuest for the first time! 
Setup will run automatically, then you can use the watch mode.

To skip setup in the future:
  ${colors.success}npm run sidequest:start${colors.reset}              # Uses your saved preferences
  ${colors.success}npm run sidequest:report${colors.reset}             # Clean JSON output (for LLMs)

${colors.secondary}Continuing with setup...${colors.reset}
`);
    }
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  // Intercept common user errors before processing
  interceptCommonErrors();

  if (flags.help) {
    showHelp();
    process.exit(0);
  }

  // Handle configuration commands
  if (flags.configAction) {
    await handleConfigCommand(flags.configAction);
    process.exit(0);
  }

  // Check for first-run setup (unless skipped)
  if (!flags.skipSetup) {
    const needsSetup = await checkAndRunFirstTimeSetup();
    if (needsSetup) {
      // Setup was run, exit to let user try again with their preferences
      console.log(`\n${getColorScheme().info}Now try: ${getColorScheme().bold}sidequest --watch${getColorScheme().reset}`);
      process.exit(0);
    }
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

    console.log('\nFinal color mode:', process.env['TERM_COLOR_MODE'] || oscDetection || heuristicMode);
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

      // Create enhanced orchestrator service with custom data directory if specified
      const config = flags.dataDir === './data' ?
        undefined :
        { database: { path: `${flags.dataDir}/code-quality.db` } };

      const orchestrator = await createOrchestratorService('development', config);

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
              priority: 1, timeout: 30_000, allowFailure: false
            },
            eslint: {
              enabled: true, // Always enabled in watch mode for comprehensive analysis
              options: { roundRobin: false, maxWarnings: 1000, timeout: 30_000 },
              priority: 2, timeout: 35_000, allowFailure: true
            },
            unusedExports: {
              enabled: true, // Always enabled for comprehensive analysis
              options: {},
              priority: 3, timeout: 30_000, allowFailure: true
            }
          },
          output: { console: false }, // SILENT: No console output during watch mode
          deduplication: { enabled: true, strategy: 'exact' as const },
          crossover: { enabled: !flags.noCrossoverCheck, warnOnTypeAwareRules: true, warnOnDuplicateViolations: true, failOnCrossover: flags.failOnCrossover }
        });

        // Get the clean developer display
        const watchDisplay = getDeveloperWatchDisplay();

        // Enable silent mode for services during watch
        orchestrator.setSilentMode(true);

        // Watch cycle with persistence
        const runEnhancedWatchCycle = async() => {
          try {
            // Get current violations using legacy orchestrator
            const result = await legacyOrchestrator.analyze();
            checksCount++;

            // Process violations with persistence (for historical tracking)
            await processViolationsWithPersistence(result.violations, orchestrator);

            if (flags.verbose) {
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
        const watchTimeout = setTimeout(async() => {
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
        process.on('SIGINT', async() => {
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
              priority: 1, timeout: 30_000, allowFailure: false
            },
            eslint: {
              enabled: true, // Always enabled for comprehensive analysis
              options: { roundRobin: false, maxWarnings: 1000, timeout: 30_000 },
              priority: 2, timeout: 35_000, allowFailure: true
            },
            unusedExports: {
              enabled: true, // Always enabled for comprehensive analysis
              options: {},
              priority: 3, timeout: 30_000, allowFailure: true
            }
          },
          output: { console: !flags.verbose, ...(flags.verbose ? { json: 'stdout' } : {}) },
          deduplication: { enabled: true, strategy: 'exact' as const },
          crossover: { enabled: !flags.noCrossoverCheck, warnOnTypeAwareRules: true, warnOnDuplicateViolations: true, failOnCrossover: flags.failOnCrossover }
        });

        const result = await legacyOrchestrator.analyze();

        // Process with persistence
        await processViolationsWithPersistence(result.violations, orchestrator);

        // Generate PRD if requested
        if (flags.generatePRD) {
          await generatePRD(result.violations, flags.targetPath);
        }

        if (flags.verbose) {
          try {
            const enhancedResult = {
              ...result,
              database: {
                summary: await orchestrator.getStorageService().getViolationSummary(),
                dashboard: await orchestrator.getStorageService().getDashboardData()
              }
            };
            console.log(JSON.stringify(enhancedResult, null, 2));
          } catch (error) {
            // Fallback if dashboard data fails - still show violations
            console.log(JSON.stringify(result, null, 2));
            if (flags.verbose) {
              console.warn('[Warning] Database dashboard data unavailable:', error);
            }
          }
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
    const config: OrchestratorConfigInput = {
      targetPath: flags.targetPath,
      watch: { enabled: flags.watch, interval: 3000, debounce: 500 },
      engines: {
        typescript: {
          enabled: !flags.eslintOnly,
          options: { includeAny: flags.includeAny, strict: flags.strict, targetPath: flags.targetPath },
          priority: 1, timeout: 30_000, allowFailure: false
        },
        eslint: {
          enabled: flags.includeESLint || flags.eslintOnly,
          options: { roundRobin: true, maxWarnings: 500, timeout: 30_000 },
          priority: 2, timeout: 35_000, allowFailure: true
        },
        unusedExports: {
          enabled: !flags.eslintOnly, // Enable unless ESLint-only mode
          options: {},
          priority: 3, timeout: 30_000, allowFailure: true
        }
      },
      output: {
        console: !flags.verbose,
        ...(flags.verbose ? { json: 'stdout' } : {})
      },
      deduplication: { enabled: true, strategy: 'exact' as const },
      crossover: { enabled: !flags.noCrossoverCheck, warnOnTypeAwareRules: true, warnOnDuplicateViolations: true, failOnCrossover: flags.failOnCrossover }
    };

    const orchestrator = new CodeQualityOrchestrator(config);
    const result = await orchestrator.analyze();

    // Generate PRD if requested
    if (flags.generatePRD) {
      await generatePRD(result.violations, flags.targetPath);
    }

    if (flags.verbose) {
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
