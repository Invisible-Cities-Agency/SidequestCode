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
} from '../services/index.js';
import type { Violation as OrchestratorViolation, OrchestratorResult } from '../utils/violation-types.js';
// ViolationSummaryItem no longer needed - using live data only
import { getDeveloperWatchDisplay, resetDeveloperWatchDisplay } from './watch-display-v2.js';
import { detectTerminalBackground, detectTerminalModeHeuristic, debugTerminalEnvironment } from './terminal-detector.js';
import { isESLintCategory } from '../shared/constants.js';
import type { CLIFlags, OrchestratorConfigInput } from '../utils/types.js';

// Import the old orchestrator temporarily for compatibility
import { CodeQualityOrchestrator } from './orchestrator.js';

// Parse command line arguments with Zod validation for security
import { safeCLIArgsParse as safeCLIArgumentsParse, safeEnvironmentAccess } from '../utils/validation-schemas.js';

// Static imports for better testability
import { writeFile } from 'node:fs/promises';

const arguments_ = process.argv.slice(2);

// Validate environment variables for security
const validatedEnvironment = safeEnvironmentAccess();

// Use secure CLI argument parsing with Zod validation
let flags: CLIFlags;
try {
  flags = safeCLIArgumentsParse(arguments_) as CLIFlags;
  if (validatedEnvironment.DEBUG) {
    console.log('[Security] CLI arguments validated successfully');
  }
} catch (error: any) {
  console.error(`[Security Error] ${error.message}`);
  console.error('Falling back to safe defaults...');
  // Use safe default flags if validation fails
  flags = {
    help: false,
    helpMarkdown: false,
    helpQuick: false,
    aiContext: false,
    watch: false,
    includeAny: false,
    includeESLint: false,
    eslintOnly: false,
    targetPath: '.',
    verbose: false,
    strict: false,
    noCrossoverCheck: false,
    failOnCrossover: false,
    usePersistence: true,
    showBurndown: false,
    resetSession: false,
    debugTerminal: false,
    dataDir: './data',
    generatePRD: false,
    configAction: undefined,
    skipSetup: false
  };
}

// Color scheme is now handled via keyboard shortcuts in watch mode (Ctrl+D)

/**
 * Show comprehensive AI/LLM context and guidance
 */
function showAIContext(): void {
  console.log(`{
  "tool": "SideQuest Code Quality Orchestrator",
  "purpose": "Run configuration-agnostic TypeScript and ESLint analysis tailored to your project's existing setup. SideQuest avoids overwriting your configs while surfacing the highest-priority issues first.",
  "llm_guidance": {
    "preferred_commands": {
      "analysis": [
        "npm run sidequest:report",            // TypeScript violations (non-interactive)
        "npm run sidequest:report:eslint",     // Style violations (ESLint-only)
        "npm run sidequest:report:strict"      // Strict mode for deep inference and edge cases
      ],
      "description": "These commands return clean, machine-readable JSON with no prompts. Use them to analyze codebases without side effects."
    },
    "avoid_commands": [
      "npm run sidequest:start",              // Enables watch mode – too noisy for LLMs
      "npm run sidequest:config",            // Triggers interactive config wizard
      "npx tsx cli.ts"                       // Inconsistent behavior in some shells
    ],
    "workflow": {
      "step_1": "Run 'npm run sidequest:report' to catch TypeScript errors.",
      "step_2": "Resolve all TS compilation issues first – they block builds.",
      "step_3": "Optionally run 'npm run sidequest:report:eslint' for style and lint rules.",
      "step_4": "Validate with 'npm run typecheck' and 'npm run test'."
    }
  },
  "rationale": {
    "separation_of_concerns": {
      "why": "TypeScript enforces type safety; ESLint enforces code style. Mixing them causes conflicts and slows down analysis.",
      "benefit": "TS-only checks run 3–5× faster and reduce noise in watch mode.",
      "outcome": "Users get faster feedback and clearer error segmentation."
    }
  },
  "type_guidance": {
    "strategy": "Replace 'any' with meaningful types using docs, 'node_modules', or known interfaces.",
    "avoid": "'unknown' is not a safe placeholder. Prefer explicitly defined interfaces.",
    "validation": "Consider Zod for enhanced runtime type safety at external boundaries (APIs, user input). Optional but recommended - SideQuest will detect and analyze Zod usage patterns if present."
  },
  "recommended_libraries": {
    "typescript": {
      "type-fest": "Utility types (e.g., 'PackageJson', 'Merge') by Sindre Sorhus.",
      "ts-reset": "Safe TS defaults by Matt Pocock – improves behavior of 'Object', 'includes', etc.",
      "zod": "Schema-based validation with automatic TS inference.",
      "utility-types": "Extra tools for structural typing and transformation."
    },
    "eslint": {
      "eslint-config-xo-typescript": "Strict but clean ruleset by Sindre Sorhus.",
      "@typescript-eslint/eslint-plugin": "Official TypeScript linting rules.",
      "eslint-config-turbo": "Optimized for Vercel-style monorepos.",
      "eslint-plugin-total-typescript": "Matt Pocock's plugin for inference-aware linting."
    },
    "tools": {
      "tsup": "Fast TypeScript bundler (uses esbuild under the hood).",
      "tsx": "Fast alternative to ts-node for running scripts.",
      "type-challenges": "Excellent resource to learn deep TS pattern mastery.",
      "ripgrep": "Essential tool: Use 'rg' instead of 'grep' for blazing-fast code searches."
    }
  },
  "watch_mode": {
    "command": "npm run sidequest:start",
    "usage": "Enables real-time feedback during dev.",
    "note": "Use for iterative workflows. Avoid with LLMs unless batching changes with a human in the loop."
  },
  "type_discovery": {
    "best_practices": [
      "Check official docs for accurate types.",
      "Browse '@types' packages and source code inside 'node_modules'.",
      "Avoid masking issues with 'any' or overuse of utility types – prefer clarity over cleverness.",
      "Use 'rg' (ripgrep) instead of 'grep' or 'find' for efficient codebase searches - much faster for type fixing workflows."
    ]
  },
  "if_confused": {
    "recovery": "Run 'npm run sidequest:ai-context' to reload LLM context.",
    "npx_warning": "If 'npx' fails, prefer 'npm run' for consistency and reliability."
  },
  "philosophy": "SideQuest exists to help – not enforce. LLMs should focus on reducing noise, highlighting meaningful violations, and guiding users toward clean, type-safe, maintainable code."
}`);
}

/**
 * Show markdown-formatted help for documentation and human readability
 */
function showMarkdownHelp(): void {
  console.log(`# SideQuest Code Quality Orchestrator

Configuration-agnostic TypeScript and ESLint analysis that respects your project setup.

## 🚀 Quick Start

### For Humans (Interactive)
\`\`\`bash
npm run sidequest:start              # Real-time watch mode
npm run sidequest:config             # Manage preferences
\`\`\`

### For LLMs/Automation (JSON Output)
\`\`\`bash
npm run sidequest:report             # TypeScript violations only
npm run sidequest:report:eslint      # Include ESLint analysis
npm run sidequest:ai-context         # Full LLM guidance
\`\`\`

## 🎯 Core Philosophy

**Separation of Concerns**: TypeScript handles type safety, ESLint handles code style.
- **3-5x faster** analysis when separated
- **Clearer error segmentation** for developers
- **No rule conflicts** between tools

## 📊 Analysis Modes

| Command | Purpose | Output | Speed |
|---------|---------|---------|--------|
| \`sidequest:report\` | TypeScript compilation errors | JSON | ⚡ Fast |
| \`sidequest:report:eslint\` | Style + type violations | JSON | 🐌 Thorough |
| \`sidequest:start\` | Real-time monitoring | Interactive | 🔄 Continuous |

## 🔧 Type Safety Best Practices

### Replace \`any\` with Proper Types
1. **Check documentation** for official type definitions
2. **Inspect \`node_modules/@types\`** for accurate interfaces  
3. **Use Zod** for runtime validation of unknown data
4. **Avoid \`unknown\` as placeholder** - create explicit interfaces

### Recommended Libraries
- **type-fest**: Essential utility types by Sindre Sorhus
- **ts-reset**: Safer TypeScript defaults by Matt Pocock
- **eslint-config-xo-typescript**: Strict but clean ESLint rules

## 🐛 Troubleshooting

**Setup running every time?**
- Tool auto-detects first run based on preferences + database existence
- Reset: \`npm run sidequest:config:reset\`

**Colors wrong?**
- \`npm run sidequest:watch:dark\` or \`npm run sidequest:watch:light\`

**Command not found?**
- Use \`npm run sidequest:*\` (not \`npm sidequest:*\`)

## 💡 Help & Context

- \`npm run sidequest:help\` - This help
- \`npm run sidequest:help:quick\` - One-liner summary  
- \`npm run sidequest:ai-context\` - Full LLM guidance
`);
}

/**
 * Show quick one-liner help for tooltips and inline guidance
 */
function showQuickHelp(): void {
  console.log("SideQuest: Use 'sidequest:report' for clean TS analysis, 'sidequest:start' for watch mode. Separates TS (types) from ESLint (style) for 3x speed. Run 'sidequest:ai-context' for full LLM guidance.");
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

  Command not found: sidequest:watch?
    Don't use: npm sidequest:watch
    Use:       npm run sidequest:watch

  Want to skip interactive setup?
    Use: npm run sidequest:report (for LLMs/automation)
    Or:  Delete ~/.sidequest-cqo/ and ./data/ if setup is corrupted

  Colors look wrong?
    In watch mode: Press Ctrl+D to toggle light/dark mode
    For debugging: npm run sidequest:debug:terminal
`);
}

/**
 * Get color scheme for terminal output with light/dark mode support
 */
function getColorScheme() {
  const colorMode = validatedEnvironment.TERM_COLOR_MODE || detectTerminalMode();

  return colorMode === 'light' ? {
    // Light mode: Replicate macOS Terminal "Man Page" theme colors
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
  } : {
    // Dark mode: Replicate macOS Terminal "Pro" theme colors
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
    if (validatedEnvironment.DEBUG) {
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
    if (summary.bySource['zod-detection'] > 0) {
      console.log(`  🛡️ ${colors.info}Zod Detection:${colors.reset} ${colors.primary}${summary.bySource['zod-detection']}${colors.reset}`);
    }
  }

  // Enhanced Zod Analysis Section
  if (summary.bySource['zod-detection'] > 0) {
    displayZodAnalysisSection(violations, colors);
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
 * Display enhanced Zod analysis section with coverage metrics
 */
function displayZodAnalysisSection(violations: OrchestratorViolation[], colors: any): void {
  console.log(`\n${colors.bold}${colors.header}🛡️ Zod Analysis${colors.reset}`);

  // Extract Zod coverage data from violations
  const zodViolations = violations.filter(v => v.source === 'zod-detection');
  const coverageViolation = zodViolations.find(v => v.message && v.message.includes('coverage is'));
  const parseRatioViolation = zodViolations.find(v => v.message && v.message.includes('parse() vs'));
  const baselineViolation = zodViolations.find(v => v.message && v.message.includes('Target '));

  // Extract coverage percentage
  let coverage = '0';
  let usedSchemas = '0';
  let totalSchemas = '0';
  if (coverageViolation && coverageViolation.message) {
    const coverageMatch = coverageViolation.message.match(/coverage is ([\d.]+)% \((\d+)\/(\d+) schemas used\)/);
    if (coverageMatch) {
      coverage = coverageMatch[1] || '0';
      usedSchemas = coverageMatch[2] || '0';
      totalSchemas = coverageMatch[3] || '0';
    }
  }

  // Extract parse safety data
  let parseCallsCount = '0';
  let safeParseCallsCount = '0';
  if (parseRatioViolation && parseRatioViolation.message) {
    const parseMatch = parseRatioViolation.message.match(/(\d+) \.parse\(\) vs (\d+) \.safeParse\(\)/);
    if (parseMatch) {
      parseCallsCount = parseMatch[1] || '0';
      safeParseCallsCount = parseMatch[2] || '0';
    }
  }

  // Extract risk level from coverage percentage
  const coverageNumber = Number.parseFloat(coverage);
  let riskLevel = 'High';
  let riskColor = colors.error;
  if (coverageNumber >= 80) {
    riskLevel = 'Low';
    riskColor = colors.success;
  } else if (coverageNumber >= 50) {
    riskLevel = 'Medium';
    riskColor = colors.warning;
  }

  // Extract baseline recommendation
  let baseline = 'General TypeScript project: Target 70%+ coverage';
  if (baselineViolation && baselineViolation.message) {
    const baselineMatch = baselineViolation.message.match(/Target ([^.]+)\./);
    if (baselineMatch) {
      baseline = `Target ${baselineMatch[1]}`;
    }
  }

  // Display coverage metrics prominently
  console.log(`${colors.secondary}  Coverage: ${colors.primary}${coverage}%${colors.reset} ${colors.secondary}(${usedSchemas}/${totalSchemas} schemas used)${colors.reset}`);
  console.log(`${colors.secondary}  Risk Level: ${riskColor}${riskLevel}${colors.reset}`);
  console.log(`${colors.secondary}  Parse Safety: ${colors.primary}${parseCallsCount} unsafe${colors.reset}${colors.secondary}, ${colors.primary}${safeParseCallsCount} safe${colors.reset} ${colors.secondary}calls${colors.reset}`);
  console.log(`${colors.secondary}  Baseline: ${colors.info}${baseline}${colors.reset}`);
}

/**
 * Generate PRD file for Claude Task Master ingestion
 */
export async function generatePRD(violations: OrchestratorViolation[], targetPath: string): Promise<void> {
  const colors = getColorScheme();
  const timestamp = new Date().toISOString().split('T')[0];

  // Analyze violations for PRD content
  const totalViolations = violations.length;
  const filesAffected = new Set(violations.map(v => v.file)).size;
  const categoryBreakdown: Record<string, number> = {};
  for (const violation of violations) {
    categoryBreakdown[violation.category] = (categoryBreakdown[violation.category] || 0) + 1;
  }

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
    await writeFile(prdPath, prdContent, 'utf8');
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
    const { InteractiveSetup } = await import('../services/interactive-setup.js');

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
    const { PreferencesManager } = await import('../services/preferences-manager.js');
    const prefs = PreferencesManager.getInstance(flags.dataDir);

    switch (action) {
    case 'show': {
      console.log(`${colors.bold}${colors.header}📋 Current User Preferences${colors.reset}\n`);
      const allPrefs = prefs.getAllPreferences();
      console.log(JSON.stringify(allPrefs, undefined, 2));
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

  // Check for unknown npm script attempts
  if (process.env['npm_command'] === 'run-script' && process.env['npm_lifecycle_event']) {
    const scriptName = process.env['npm_lifecycle_event'];

    // Check for common sidequest: variations that don't exist
    if (scriptName && scriptName.startsWith('sidequest') && !scriptName.includes(':')) {
      console.log(`${colors.error}❌ Script Not Found${colors.reset}

The command "${colors.error}npm run ${scriptName}${colors.reset}" doesn't exist.

${colors.info}Are you a human?${colors.reset}
  ${colors.success}npm run sidequest:help${colors.reset}               # Standard help
  ${colors.success}npm run sidequest:help:markdown${colors.reset}      # Formatted documentation

${colors.info}Are you an LLM?${colors.reset}
  ${colors.success}npm run sidequest:ai-context${colors.reset}         # Full machine-structured context

${colors.secondary}Common commands:${colors.reset}
  ${colors.success}npm run sidequest:start${colors.reset}              # Watch mode (humans)
  ${colors.success}npm run sidequest:report${colors.reset}             # Analysis (LLMs)
  ${colors.success}npm run sidequest:config${colors.reset}             # Configuration
`);
      process.exit(0);
    }
  }

  // Check for direct npx tsx cli.ts usage (suggest LLM context recovery)
  // Only show for truly direct usage, not when npm scripts call the same command
  if (process.argv[1]?.includes('cli.ts') &&
      !process.env['npm_command'] &&
      !process.env['npm_lifecycle_event'] &&
      !process.env['npm_lifecycle_script']) {

    const isLikelyLLM = [...arguments_].some(argument => argument.includes('--verbose') || argument.includes('--skip-setup'));

    if (isLikelyLLM) {
      console.log(`${colors.warning}💡 LLM Context Recovery${colors.reset}

It looks like you're running the CLI directly with npx. 
${colors.info}Are you an LLM that's lost context?${colors.reset}

Run this to restore full context:
  ${colors.success}npm run sidequest:ai-context${colors.reset}

${colors.secondary}For consistent behavior, prefer npm scripts:${colors.reset}
  ${colors.success}npm run sidequest:report${colors.reset}             # Clean JSON analysis
  ${colors.success}npm run sidequest:start${colors.reset}              # Watch mode

${colors.secondary}Continuing with your command...${colors.reset}
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

  if (flags.helpMarkdown) {
    showMarkdownHelp();
    process.exit(0);
  }

  if (flags.helpQuick) {
    showQuickHelp();
    process.exit(0);
  }

  if (flags.aiContext) {
    showAIContext();
    process.exit(0);
  }

  // Handle configuration commands
  if (flags.configAction) {
    await handleConfigCommand(flags.configAction);
    process.exit(0);
  }

  // Check for first-run setup (smart detection)
  // Only skip setup if explicitly requested OR if running in automation mode (verbose + skip-setup)
  const isAutomationMode = flags.verbose && flags.skipSetup;
  const isExplicitSkip = flags.skipSetup && !flags.verbose; // User explicitly doesn't want setup

  if (!isAutomationMode && !isExplicitSkip) {
    const needsSetup = await checkAndRunFirstTimeSetup();
    if (needsSetup) {
      // Setup was run, exit to let user try again with their preferences
      console.log(`\n${getColorScheme().info}Now try: ${getColorScheme().bold}npm run sidequest:start${getColorScheme().reset}`);
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
              console.log(JSON.stringify(enhancedResult, undefined, 2));
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
            console.log(JSON.stringify(enhancedResult, undefined, 2));
          } catch (error) {
            // Fallback if dashboard data fails - still show violations
            console.log(JSON.stringify(result, undefined, 2));
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
      console.log(JSON.stringify(result, undefined, 2));
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
