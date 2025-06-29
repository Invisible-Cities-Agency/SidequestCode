/**
 * Clean Watch Mode Display - Developer-Focused Metrics
 * Shows current state, trends, and actionable insights
 */

import type { Violation as OrchestratorViolation } from './utils/violation-types.js';
import { detectTerminalModeHeuristic } from './terminal-detector.js';
import { 
  ANSI_CODES, 
  DISPLAY_CONFIG, 
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
      current: { total: 0, bySource: {}, byCategory: {} }
    };
    this.colors = this.createColorScheme();
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

  async updateDisplay(violations: OrchestratorViolation[], checksCount: number, orchestrator?: any): Promise<void> {
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
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        
        const stats = await analysisService.calculateViolationStats({
          start: startOfDay,
          end: endOfDay
        });
        
        todayData = {
          total: stats.total,
          filesAffected: stats.filesAffected,
          avgPerFile: stats.avgPerFile
        };
      } catch (error) {
        // Log error in debug mode, continue without today's data
        if (process.env.DEBUG) {
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
    
    for (const violation of violations) {
      bySource[violation.source] = (bySource[violation.source] || 0) + 1;
      byCategory[violation.category] = (byCategory[violation.category] || 0) + 1;
    }
    
    return {
      total: violations.length,
      bySource,
      byCategory
    };
  }

  private render(checksCount: number, todayData?: TodayProgressData | null): void {
    const { colors } = this;
    const sessionDuration = Math.floor((this.state.lastUpdate - this.state.sessionStart) / 1000);
    const timestamp = new Date().toLocaleTimeString();
    
    // Clear screen
    process.stdout.write('\x1b[2J\x1b[H');
    
    // Header
    process.stdout.write(`${colors.bold}${colors.accent}🔍 Code Quality Monitor${colors.reset}\n`);
    process.stdout.write(`${colors.muted}${'─'.repeat(60)}${colors.reset}\n\n`);
    
    // Current Status
    const current = this.state.current;
    const baseline = this.state.baseline!;
    const totalDelta = current.total - baseline.total;
    const deltaColor = totalDelta > 0 ? colors.error : totalDelta < 0 ? colors.success : colors.muted;
    const deltaText = totalDelta !== 0 ? ` (${totalDelta > 0 ? '+' : ''}${totalDelta})` : '';
    
    process.stdout.write(`${colors.bold}Current Issues: ${colors.primary}${current.total}${deltaColor}${deltaText}${colors.reset}\n`);
    process.stdout.write(`${colors.muted}Last check: ${timestamp} | Session: ${sessionDuration}s | Checks: ${checksCount}${colors.reset}\n\n`);
    
    // By Source
    if (Object.keys(current.bySource).length > 0) {
      process.stdout.write(`${colors.warning}By Source:${colors.reset}\n`);
      for (const [source, count] of Object.entries(current.bySource).sort(([,a], [,b]) => b - a)) {
        const baselineCount = baseline.bySource[source] || 0;
        const delta = count - baselineCount;
        const deltaStr = delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta})` : '';
        const deltaColor = delta > 0 ? colors.error : delta < 0 ? colors.success : colors.reset;
        const icon = source === 'typescript' ? '📝' : '🔍';
        
        process.stdout.write(`  ${icon} ${colors.info}${source}:${colors.reset} ${colors.primary}${count}${deltaColor}${deltaStr}${colors.reset}\n`);
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
        const deltaStr = delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta})` : '';
        const deltaColor = delta > 0 ? colors.error : delta < 0 ? colors.success : colors.reset;
        
        // Determine severity and icon
        const isESLintViolation = isESLintCategory(category);
        const severity = this.getSeverity(category);
        const severityIcon = severity === 'error' ? '❌' : severity === 'warn' ? '⚠️' : 'ℹ️';
        const sourceIcon = isESLintViolation ? '🔍' : '📝';
        
        process.stdout.write(`  ${severityIcon} ${sourceIcon} ${colors.info}${category}:${colors.reset} ${colors.primary}${count}${deltaColor}${deltaStr}${colors.reset}\n`);
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
      process.stdout.write(`${colors.success}  📉 -${resolvedIssues} issues resolved${colors.reset}\n`);
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
    
    process.stdout.write(`\n${colors.muted}Press Ctrl+C to stop monitoring...${colors.reset}\n`);
  }

  private getSeverity(category: string): 'error' | 'warn' | 'info' {
    // Error categories
    if (['type-alias', 'no-explicit-any'].includes(category)) return 'error';
    
    // Warning categories  
    if (['annotation', 'cast', 'unused-vars', 'code-quality', 'return-type', 'style'].includes(category)) return 'warn';
    
    // Default to info
    return 'info';
  }

  shutdown(): void {
    this.restoreOutput();
    process.stdout.write('\x1b[?25h'); // Show cursor
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