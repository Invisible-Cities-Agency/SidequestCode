/**
 * Clean Watch Mode Display - Developer-Focused Metrics
 * Shows current state, trends, and actionable insights
 */

import type { Violation as OrchestratorViolation } from './utils/violation-types.js';
import { getCategoryLabel } from './utils/violation-types.js';
import { detectTerminalModeHeuristic } from './terminal-detector.js';
import {
  ANSI_CODES,
  isESLintCategory
} from './shared/constants.js';
import type {
  ColorScheme,
  WatchState,
  ViolationSummary,
  TodayProgressData,
  ConsoleBackup,
  TerminalMode
} from './shared/types.js';

export class DeveloperWatchDisplay {
  private state: WatchState;
  private colors: ColorScheme;
  private consoleBackup: ConsoleBackup | null = null;

  constructor() {
    this.state = {
      isInitialized: false,
      sessionStart: Date.now(),
      lastUpdate: 0,
      baseline: null,
      current: { total: 0, bySource: {}, byCategory: {} },
      viewMode: 'dashboard',
      currentViolations: []
    };
    this.colors = this.createColorScheme();
    this.setupKeyboardHandling();
    this.captureOutput();
  }

  private createColorScheme(): ColorScheme {
    const mode: TerminalMode = detectTerminalModeHeuristic();
    const colorSet = mode === 'dark' ? ANSI_CODES.DARK : ANSI_CODES.LIGHT;

    return {
      reset: ANSI_CODES.RESET,
      bold: ANSI_CODES.BOLD,
      dim: ANSI_CODES.DIM,
      primary: colorSet.PRIMARY,
      secondary: colorSet.SECONDARY,
      success: colorSet.SUCCESS,
      warning: colorSet.WARNING,
      error: colorSet.ERROR,
      info: colorSet.INFO,
      muted: colorSet.MUTED,
      accent: colorSet.ACCENT
    };
  }

  private captureOutput(): void {
    // Store original console methods for restoration
    if (!this.consoleBackup) {
      this.consoleBackup = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        stderrWrite: process.stderr.write
      };
    }

    // Override console methods to silence output during watch mode
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};
    process.stderr.write = () => true;
  }

  private restoreOutput(): void {
    if (this.consoleBackup) {
      console.log = this.consoleBackup.log;
      console.error = this.consoleBackup.error;
      console.warn = this.consoleBackup.warn;
      process.stderr.write = this.consoleBackup.stderrWrite;
      this.consoleBackup = null;
    }
  }

  /**
   * Set up keyboard input handling for view mode toggle
   */
  private setupKeyboardHandling(): void {
    // Enable raw mode to capture individual keystrokes
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      process.stdin.on('data', (key: string) => {
        // Handle Ctrl+T (0x14 in ASCII) - toggle view mode
        if (key === '\u0014') {
          this.toggleViewMode();
        }
        // Handle Esc (0x1B in ASCII) - return to dashboard if in tidy mode
        else if (key === '\u001B') {
          if (this.state.viewMode === 'tidy') {
            this.state.viewMode = 'dashboard';
            this.renderCurrentView().catch(console.error);
          }
        }
        // Handle Ctrl+C (0x03 in ASCII) - let it pass through normally
        else if (key === '\u0003') {
          process.stdin.setRawMode(false);
          process.exit(0);
        }
      });
    }
  }

  /**
   * Toggle between dashboard and tidy view modes
   */
  private toggleViewMode(): void {
    this.state.viewMode = this.state.viewMode === 'dashboard' ? 'tidy' : 'dashboard';
    this.renderCurrentView().catch(console.error);
  }

  /**
   * Render the current view based on state.viewMode
   */
  private async renderCurrentView(): Promise<void> {
    if (this.state.viewMode === 'tidy') {
      this.renderTidyView();
    } else {
      this.renderDashboardView();
    }
  }

  /**
   * Render a clean diagnostic view showing only actual issues
   */
  private renderTidyView(): void {
    // Clear screen and show header
    process.stdout.write('\u001B[2J\u001B[H');
    process.stdout.write(`${this.colors.bold}${this.colors.info}🔍 Tidy Diagnostics View${this.colors.reset}\n`);
    process.stdout.write(`${this.colors.secondary}${'─'.repeat(80)}${this.colors.reset}\n\n`);

    if (this.state.currentViolations.length === 0) {
      process.stdout.write(`${this.colors.success}✅ No violations found - all clear!${this.colors.reset}\n\n`);
    } else {
      // Group violations by file for cleaner display
      const violationsByFile = new Map<string, typeof this.state.currentViolations>();
      
      for (const violation of this.state.currentViolations) {
        if (!violationsByFile.has(violation.file)) {
          violationsByFile.set(violation.file, []);
        }
        violationsByFile.get(violation.file)!.push(violation);
      }

      // Display each file's violations
      for (const [file, violations] of violationsByFile) {
        const severityIcon = violations.some(v => v.severity === 'error') ? '❌' : 
                           violations.some(v => v.severity === 'warn') ? '⚠️' : 'ℹ️';
        
        process.stdout.write(`${severityIcon} ${this.colors.info}${file}${this.colors.reset} ${this.colors.secondary}(${violations.length} issues)${this.colors.reset}\n`);
        
        // Show each violation in compact format
        for (const violation of violations.slice(0, 5)) { // Limit to 5 per file for tidiness
          const sourceIcon = violation.source === 'typescript' ? '📝' : 
                            violation.source === 'eslint' ? '🔍' : '🗂️';
          process.stdout.write(`  ${sourceIcon} ${this.colors.secondary}Line ${violation.line}:${this.colors.reset} ${violation.message}\n`);
        }
        
        if (violations.length > 5) {
          process.stdout.write(`  ${this.colors.secondary}... and ${violations.length - 5} more issues${this.colors.reset}\n`);
        }
        process.stdout.write('\n');
      }
    }

    process.stdout.write(`${this.colors.muted}Press Ctrl+T or Esc to return to dashboard | Ctrl+C to stop watching...${this.colors.reset}\n`);
  }

  /**
   * Render the full dashboard view (original view)
   */
  private renderDashboardView(): void {
    // Clear screen and recreate the dashboard
    this.state.isInitialized = false;
    // The next updateDisplay call will recreate the dashboard
  }

  async updateDisplay(violations: OrchestratorViolation[], checksCount: number, orchestrator?: any): Promise<void> {
    // Store current violations for tidy view
    this.state.currentViolations = violations;

    // If in tidy mode, just update the tidy view and return
    if (this.state.viewMode === 'tidy') {
      this.renderTidyView();
      return;
    }

    // Process current violations
    const current = this.processViolations(violations);

    // Set baseline on first run
    if (!this.state.baseline) {
      this.state.baseline = { ...current };
    }

    this.state.current = current;
    this.state.lastUpdate = Date.now();

    // Get today's data if orchestrator is provided
    let todayData: TodayProgressData | null = null;
    if (orchestrator) {
      try {
        const analysisService = orchestrator.getAnalysisService();
        // Get stats for all violations to show meaningful progress data
        // TODO: Fix this to properly filter by today when database schema is updated
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const stats = await analysisService.calculateViolationStats({
          start: yesterday,
          end: new Date()
        });

        todayData = {
          total: stats.total,
          filesAffected: stats.filesAffected,
          avgPerFile: stats.avgPerFile
        };
      } catch (error) {
        // Log error in debug mode, continue without today's data
        if (process.env['DEBUG']) {
          console.error('[WatchDisplay] Failed to get today\'s data:', error);
        }
      }
    }

    // Clear screen and render
    this.render(checksCount, todayData);
  }

  private processViolations(violations: OrchestratorViolation[]): ViolationSummary {
    const bySource: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, Record<string, number>> = {};
    const byCategoryBySource: Record<string, Record<string, number>> = {};

    for (const violation of violations) {
      bySource[violation.source] = (bySource[violation.source] || 0) + 1;
      byCategory[violation.category] = (byCategory[violation.category] || 0) + 1;
      
      // Track severity by source
      if (!bySeverity[violation.source]) {
        bySeverity[violation.source] = {};
      }
      bySeverity[violation.source][violation.severity] = (bySeverity[violation.source][violation.severity] || 0) + 1;
      
      // Track categories by source
      if (!byCategoryBySource[violation.source]) {
        byCategoryBySource[violation.source] = {};
      }
      byCategoryBySource[violation.source][violation.category] = (byCategoryBySource[violation.source][violation.category] || 0) + 1;
    }

    return {
      total: violations.length,
      bySource,
      byCategory,
      bySeverity,
      byCategoryBySource
    };
  }

  private render(checksCount: number, todayData?: TodayProgressData | null): void {
    const { colors } = this;
    const sessionDuration = Math.floor((this.state.lastUpdate - this.state.sessionStart) / 1000);
    const timestamp = new Date().toLocaleTimeString();

    // Clear screen
    process.stdout.write('\u001B[2J\u001B[H');

    // Header
    process.stdout.write(`${colors.bold}${colors.accent}🔍 Code Quality Monitor${colors.reset}\n`);
    process.stdout.write(`${colors.muted}${'─'.repeat(60)}${colors.reset}\n\n`);

    // Current Status
    const current = this.state.current;
    const baseline = this.state.baseline!;
    const totalDelta = current.total - baseline.total;
    const deltaColor = totalDelta > 0 ? colors.error : (totalDelta < 0 ? colors.success : colors.muted);
    const deltaText = totalDelta === 0 ? '' : ` (${totalDelta > 0 ? '+' : ''}${totalDelta})`;

    process.stdout.write(`${colors.bold}Current Issues: ${colors.primary}${current.total}${deltaColor}${deltaText}${colors.reset}\n`);
    process.stdout.write(`${colors.muted}Last check: ${timestamp} | Session: ${sessionDuration}s | Checks: ${checksCount}${colors.reset}\n\n`);

    // By Source with severity breakdown
    if (Object.keys(current.bySource).length > 0) {
      process.stdout.write(`${colors.warning}By Source:${colors.reset}\n`);
      for (const [source, count] of Object.entries(current.bySource).sort(([,a], [,b]) => b - a)) {
        const baselineCount = baseline.bySource[source] || 0;
        const delta = count - baselineCount;
        const deltaString = delta === 0 ? '' : ` (${delta > 0 ? '+' : ''}${delta})`;
        const deltaColor = delta > 0 ? colors.error : (delta < 0 ? colors.success : colors.reset);
        const icon = source === 'typescript' ? '📝' : 
                     source === 'unused-exports' ? '🗂️' : '🔍';

        process.stdout.write(`  ${icon} ${colors.info}${source}:${colors.reset} ${colors.primary}${count}${deltaColor}${deltaString}${colors.reset}\n`);
        
        // Show severity breakdown for ESLint only (TypeScript errors are mostly all "error" severity)
        if (current.bySeverity && current.bySeverity[source] && source === 'eslint') {
          const severities = current.bySeverity[source];
          const severityOrder = ['error', 'warn', 'info'];
          for (const severity of severityOrder) {
            if (severities[severity]) {
              const sevIcon = severity === 'error' ? '❌' : (severity === 'warn' ? '⚠️' : 'ℹ️');
              process.stdout.write(`    ${sevIcon} ${colors.secondary}${severity}:${colors.reset} ${colors.primary}${severities[severity]}${colors.reset}\n`);
            }
          }
        }
        
        // Show top categories for ESLint and TypeScript (limit to top 5 to avoid clutter)
        if (current.byCategoryBySource && current.byCategoryBySource[source] && (source === 'eslint' || source === 'typescript')) {
          const categories = Object.entries(current.byCategoryBySource[source])
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);
          
          for (const [category, categoryCount] of categories) {
            const displayLabel = getCategoryLabel(category as any);
            process.stdout.write(`    • ${colors.secondary}${displayLabel}:${colors.reset} ${colors.primary}${categoryCount}${colors.reset}\n`);
          }
        }
      }
      process.stdout.write('\n');
    }

    // Top Issues (by category)
    const topCategories = Object.entries(current.byCategory)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);

    if (topCategories.length > 0) {
      process.stdout.write(`${colors.warning}Top Issues:${colors.reset}\n`);

      for (const [category, count] of topCategories) {
        const baselineCount = baseline.byCategory[category] || 0;
        const delta = count - baselineCount;
        const deltaString = delta === 0 ? '' : ` (${delta > 0 ? '+' : ''}${delta})`;
        const deltaColor = delta > 0 ? colors.error : (delta < 0 ? colors.success : colors.reset);

        // Determine severity and icon
        const isESLintViolation = isESLintCategory(category);
        const severity = this.getSeverity(category);
        const severityIcon = severity === 'error' ? '❌' : (severity === 'warn' ? '⚠️' : 'ℹ️');
        const sourceIcon = isESLintViolation ? '🔍' : '📝';

        const displayLabel = getCategoryLabel(category as any);
        process.stdout.write(`  ${severityIcon} ${sourceIcon} ${colors.info}${displayLabel}:${colors.reset} ${colors.primary}${count}${deltaColor}${deltaString}${colors.reset}\n`);
      }
    }

    // Session Summary - show detailed breakdown
    process.stdout.write(`\n${colors.muted}Session Summary:${colors.reset}\n`);

    // Calculate positive and negative changes separately
    let newIssues = 0;
    let resolvedIssues = 0;

    for (const [category, count] of Object.entries(current.byCategory)) {
      const baselineCount = baseline.byCategory[category] || 0;
      const delta = count - baselineCount;

      if (delta > 0) {
        newIssues += delta;
      } else if (delta < 0) {
        resolvedIssues += Math.abs(delta);
      }
    }

    // Show detailed breakdown
    if (newIssues > 0) {
      process.stdout.write(`${colors.error}  📈 +${newIssues} new issues found${colors.reset}\n`);
    }
    if (resolvedIssues > 0) {
      process.stdout.write(`${colors.success}  📉 ${resolvedIssues} issues resolved${colors.reset}\n`);
    }

    // Show net change in blue
    const netChange = newIssues - resolvedIssues;
    if (netChange !== 0) {
      const netColor = colors.info; // Blue for net change
      const netIcon = netChange > 0 ? '🔺' : '🔻';
      const netSign = netChange > 0 ? '+' : '';
      process.stdout.write(`${netColor}  ${netIcon} Net: ${netSign}${netChange}${colors.reset}\n`);
    } else if (newIssues === 0 && resolvedIssues === 0) {
      process.stdout.write(`${colors.muted}  ➡️  No changes this session${colors.reset}\n`);
    } else {
      process.stdout.write(`${colors.info}  ⚖️  Net: No change (${newIssues} new, ${resolvedIssues} resolved)${colors.reset}\n`);
    }

    // Today's Progress
    if (todayData) {
      process.stdout.write(`\n${colors.muted}Today's Progress:${colors.reset}\n`);
      process.stdout.write(`${colors.accent}  📅 Total issues processed: ${colors.primary}${todayData.total}${colors.reset}\n`);
      process.stdout.write(`${colors.accent}  📁 Files affected: ${colors.primary}${todayData.filesAffected}${colors.reset}\n`);
      if (todayData.avgPerFile > 0) {
        process.stdout.write(`${colors.accent}  📊 Avg per file: ${colors.primary}${todayData.avgPerFile.toFixed(1)}${colors.reset}\n`);
      }
    }

    process.stdout.write(`\n${colors.muted}Press Ctrl+T for tidy diagnostics view | Ctrl+C to stop monitoring...${colors.reset}\n`);
  }

  private getSeverity(category: string): 'error' | 'warn' | 'info' {
    // Error categories
    if (['type-alias', 'no-explicit-any'].includes(category)) {return 'error';}

    // Warning categories
    if (['annotation', 'cast', 'unused-vars', 'code-quality', 'return-type', 'style'].includes(category)) {return 'warn';}

    // Default to info
    return 'info';
  }

  shutdown(): void {
    this.restoreOutput();
    // Restore stdin if it was modified
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    process.stdout.write('\u001B[?25h'); // Show cursor
  }
}

// Singleton
let displayInstance: DeveloperWatchDisplay | null = null;

export function getDeveloperWatchDisplay(): DeveloperWatchDisplay {
  if (!displayInstance) {
    displayInstance = new DeveloperWatchDisplay();
  }
  return displayInstance;
}

export function resetDeveloperWatchDisplay(): void {
  if (displayInstance) {
    displayInstance.shutdown();
  }
  displayInstance = null;
}
