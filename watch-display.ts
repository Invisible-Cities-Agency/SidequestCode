/**
 * Stateful Watch Mode Display System
 * Provides smooth, non-flashing updates with zone-based rendering
 */

import type { Violation as OrchestratorViolation } from './utils/violation-types.js';
import type { ViolationSummaryItem } from './database/types.js';
import { detectTerminalBackground, detectTerminalModeHeuristic } from './terminal-detector.js';

// ============================================================================
// Display State Management
// ============================================================================

interface CategoryState {
  count: number;
  delta: number;
  trend: 'up' | 'down' | 'stable';
  files: number;
  lastUpdate: number;
}

interface WatchDisplayState {
  isInitialized: boolean;
  lastTotalViolations: number;
  lastFilesAffected: number;
  lastTimestamp: string;
  lastSessionDuration: number;
  lastChecksCount: number;
  categories: Map<string, CategoryState>;
  sessionStart: number;
  sessionBaseline: Map<string, number>;
  isSessionBaselineSet: boolean;
  detectedColorMode: 'light' | 'dark' | null;
  originalStderr: typeof process.stderr.write | null;
  originalStdout: typeof process.stdout.write | null;
}

class StatefulWatchDisplay {
  private state: WatchDisplayState;
  private colors: any;

  constructor() {
    this.state = {
      isInitialized: false,
      lastTotalViolations: 0,
      lastFilesAffected: 0,
      lastTimestamp: '',
      lastSessionDuration: 0,
      lastChecksCount: 0,
      categories: new Map(),
      sessionStart: Date.now(),
      sessionBaseline: new Map(),
      isSessionBaselineSet: false,
      detectedColorMode: null,
      originalStderr: null,
      originalStdout: null
    };
    this.colors = this.getColorScheme();
  }

  private getColorScheme() {
    // Auto-detect terminal background or use environment variable
    const colorMode = process.env.TERM_COLOR_MODE ||
                     this.state.detectedColorMode ||
                     this.detectTerminalMode();

    if (colorMode === 'light') {
      // Light mode: Replicate macOS Terminal "Man Page" theme colors
      return {
        reset: '\u001B[0m',
        bold: '\u001B[1m',
        primary: '\u001B[30m',      // Black text (Man Page style)
        secondary: '\u001B[90m',    // Dark gray
        info: '\u001B[34m',         // Deep blue
        success: '\u001B[32m',      // Deep green
        warning: '\u001B[33m',      // Amber/brown
        error: '\u001B[31m',        // Deep red
        muted: '\u001B[37m',        // Medium gray
        header: '\u001B[35m',       // Purple (Man Page style)
        // Delta colors optimized for cream/light backgrounds
        deltaUp: '\u001B[31m',      // Deep red for increases
        deltaDown: '\u001B[32m',    // Deep green for decreases
        deltaStable: '\u001B[90m'   // Dark gray for no change
      };
    } else {
      // Dark mode: Replicate macOS Terminal "Pro" theme colors
      return {
        reset: '\u001B[0m',
        bold: '\u001B[1m',
        primary: '\u001B[97m',      // Bright white (Pro theme style)
        secondary: '\u001B[37m',    // Light gray
        info: '\u001B[94m',         // Bright blue (Pro theme blue)
        success: '\u001B[92m',      // Bright green (Pro theme green)
        warning: '\u001B[93m',      // Bright yellow (Pro theme yellow)
        error: '\u001B[91m',        // Bright red (Pro theme red)
        muted: '\u001B[90m',        // Dim gray
        header: '\u001B[96m',       // Bright cyan (Pro theme cyan)
        // Delta colors optimized for dark/black backgrounds
        deltaUp: '\u001B[91m',      // Bright red for increases
        deltaDown: '\u001B[92m',    // Bright green for decreases
        deltaStable: '\u001B[90m'   // Dim gray for no change
      };
    }
  }

  /**
   * Detect terminal color mode using heuristics (fallback method)
   */
  private detectTerminalMode(): 'light' | 'dark' {
    return detectTerminalModeHeuristic();
  }

  /**
   * Attempt to detect terminal background color using OSC escape sequences
   * This is called asynchronously during initialization
   */
  private async detectBackgroundColorAsync(): Promise<void> {
    try {
      const detectedMode = await detectTerminalBackground();
      if (detectedMode && detectedMode !== this.state.detectedColorMode) {
        this.state.detectedColorMode = detectedMode;
        // Refresh color scheme with new detection
        this.colors = this.getColorScheme();
      }
    } catch {
      // Detection failed, keep using heuristics
    }
  }

  /**
   * Initialize the display (one-time full render)
   */
  async initializeDisplay(): Promise<void> {
    if (this.state.isInitialized) {return;}

    // Start background color detection (async, non-blocking)
    this.detectBackgroundColorAsync();

    // Clear screen and hide cursor BEFORE capturing output
    process.stdout.write('\u001B[2J\u001B[H\u001B[?25l');

    // Draw static layout using direct writes (before output capture)
    process.stdout.write(`${this.colors.bold}${this.colors.header}📊 Code Quality Watch (Enhanced)${this.colors.reset}\n`);
    process.stdout.write(`${this.colors.secondary}${'─'.repeat(80)}${this.colors.reset}\n\n`);

    // Reserve space for dynamic content (lines 3-30)
    process.stdout.write('\n'); // Line 3 - will be filled by updateDisplay
    process.stdout.write(`${this.colors.secondary}Last updated: --:--:-- | Session: --s | Files affected: --${this.colors.reset}\n\n`);

    process.stdout.write(`${this.colors.warning}By Source:${this.colors.reset}\n`);
    process.stdout.write(`  📝 ${this.colors.info}TypeScript:${this.colors.reset} ${this.colors.primary}--${this.colors.reset}\n`);
    process.stdout.write(`  🔍 ${this.colors.info}ESLint:${this.colors.reset} ${this.colors.primary}--${this.colors.reset}\n\n`);

    process.stdout.write(`${this.colors.warning}By Category (with deltas):${this.colors.reset}\n`);

    // Reserve space for category lines (we'll update these)
    for (let index = 0; index < 15; index++) {
      process.stdout.write('\n'); // Empty lines to be filled
    }

    process.stdout.write(`\n${this.colors.muted}Session Stats:${this.colors.reset}\n`);
    process.stdout.write(`${this.colors.secondary}  Checks: ${this.colors.primary}--${this.colors.reset} ${this.colors.secondary}| DB Records: ${this.colors.primary}--${this.colors.reset}\n`);

    process.stdout.write(`\n${this.colors.muted}Press Ctrl+C to stop watching...${this.colors.reset}\n`);

    // NOW capture output to prevent future interference
    this.captureOutput();

    this.state.isInitialized = true;
  }

  /**
   * Update specific zone without full redraw - enhanced for stability
   */
  private updateZone(line: number, content: string): void {
    // Only update if content has actually changed or is different from current state
    // Save cursor, move to line, clear line, write content, restore cursor
    const originalStdout = this.state.originalStdout!;
    originalStdout.call(process.stdout, `\u001B[s\u001B[${line};1H\u001B[2K${content}\u001B[u`);
  }

  /**
   * Process violations and calculate deltas
   */
  private processViolations(summary: ViolationSummaryItem[]): void {
    const now = Date.now();
    const newCategories = new Map<string, CategoryState>();

    // Set session baseline on first run
    if (!this.state.isSessionBaselineSet) {
      for (const item of summary) {
        this.state.sessionBaseline.set(item.category, item.count);
      }
      this.state.isSessionBaselineSet = true;
    }

    // Process each category
    for (const item of summary) {
      const previousState = this.state.categories.get(item.category);
      const sessionBaseline = this.state.sessionBaseline.get(item.category) || 0;
      const delta = previousState ? item.count - previousState.count : 0;
      const sessionDelta = item.count - sessionBaseline;

      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (delta > 0) {trend = 'up';}
      else if (delta < 0) {trend = 'down';}

      newCategories.set(item.category, {
        count: item.count,
        delta: sessionDelta, // Use session delta for more meaningful context
        trend,
        files: item.affected_files,
        lastUpdate: now
      });
    }

    this.state.categories = newCategories;
  }

  /**
   * Update the display with new data (zone-based updates only)
   */
  async updateDisplay(
    violations: OrchestratorViolation[],
    summary: ViolationSummaryItem[],
    orchestrator: any,
    sessionStart: number,
    checksCount: number
  ): Promise<void> {
    // Only initialize once, then do targeted updates
    if (!this.state.isInitialized) {
      await this.initializeDisplay();
    }

    const timestamp = new Date().toLocaleTimeString();
    const sessionDuration = Math.floor((Date.now() - sessionStart) / 1000);
    const dashboardData = await orchestrator.getStorageService().getDashboardData();

    // Process violations for delta calculation
    this.processViolations(summary);

    // Calculate actual live violations count from current data
    const currentViolationsCount = violations.length;

    // Update total violations count (line 3)
    if (this.state.lastTotalViolations !== currentViolationsCount) {
      const deltaText = this.state.lastTotalViolations > 0
        ? ` (${currentViolationsCount > this.state.lastTotalViolations ? '+' : ''}${currentViolationsCount - this.state.lastTotalViolations})`
        : '';
      const deltaColor = currentViolationsCount > this.state.lastTotalViolations
        ? this.colors.deltaUp
        : (currentViolationsCount < this.state.lastTotalViolations
          ? this.colors.deltaDown
          : this.colors.deltaStable);

      this.updateZone(3,
        `${this.colors.bold}${this.colors.primary}Current Violations:${this.colors.reset} ${this.colors.primary}${currentViolationsCount}${this.colors.reset}${deltaColor}${deltaText}${this.colors.reset} 📊`
      );
      this.state.lastTotalViolations = currentViolationsCount;
    }

    // Update timestamp and session info (line 4)
    const statusLine = `${this.colors.secondary}Last updated: ${timestamp} | Session: ${sessionDuration}s | Files affected: ${dashboardData.total_files_affected}${this.colors.reset}`;
    if (this.state.lastTimestamp !== timestamp || this.state.lastFilesAffected !== dashboardData.total_files_affected) {
      this.updateZone(4, statusLine);
      this.state.lastTimestamp = timestamp;
      this.state.lastFilesAffected = dashboardData.total_files_affected;
    }

    // Update source breakdown (lines 6-7)
    const sourceBreakdown = violations.reduce((accumulator, v) => {
      accumulator[v.source] = (accumulator[v.source] || 0) + 1;
      return accumulator;
    }, {} as Record<string, number>);

    const typescriptCount = sourceBreakdown.typescript || 0;
    const eslintCount = sourceBreakdown.eslint || 0;

    this.updateZone(6, `  📝 ${this.colors.info}TypeScript:${this.colors.reset} ${this.colors.primary}${typescriptCount}${this.colors.reset}`);
    this.updateZone(7, `  🔍 ${this.colors.info}ESLint:${this.colors.reset} ${this.colors.primary}${eslintCount}${this.colors.reset}`);

    // Update categories (lines 9-24) - this is the key improvement
    const lineOffset = 9;
    const sortedCategories = [...this.state.categories.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 15);

    for (let index = 0; index < 15; index++) {
      const currentLine = lineOffset + index;

      if (index < sortedCategories.length) {
        const [category, state] = sortedCategories[index];
        const isESLint = ['code-quality', 'style', 'architecture', 'modernization', 'unused-vars', 'legacy-type-rule', 'return-type', 'no-explicit-any', 'other-eslint', 'explicit-function-return-type'].includes(category);
        const prefix = isESLint ? '🔍' : '📝';

        // Determine severity icon from summary
        const summaryItem = summary.find(s => s.category === category);
        const severityIcon = summaryItem?.severity === 'error' ? '❌' : (summaryItem?.severity === 'warn' ? '⚠️' : 'ℹ️');

        // Format delta with color
        let deltaText = '';
        let deltaColor = this.colors.deltaStable;

        if (state.delta !== 0) {
          const sign = state.delta > 0 ? '+' : '';
          deltaText = ` (${sign}${state.delta})`;
          deltaColor = state.delta > 0 ? this.colors.deltaUp : this.colors.deltaDown;
        }

        // Trend arrows
        const trendIcon = state.trend === 'up' ? '📈' : (state.trend === 'down' ? '📉' : '➡️');

        const categoryLine = `  ${severityIcon} ${prefix} ${this.colors.info}${category}:${this.colors.reset} ${this.colors.primary}${state.count}${this.colors.reset}${deltaColor}${deltaText}${this.colors.reset} ${this.colors.secondary}(${state.files} files)${this.colors.reset} ${trendIcon}`;

        this.updateZone(currentLine, categoryLine);
      } else {
        // Clear unused lines
        this.updateZone(currentLine, '');
      }
    }

    // Update session stats (line 26)
    if (this.state.lastChecksCount !== checksCount) {
      this.updateZone(26, `${this.colors.secondary}  Checks: ${this.colors.primary}${checksCount}${this.colors.reset} ${this.colors.secondary}| DB Records: ${this.colors.primary}${dashboardData.recent_history.length}${this.colors.reset}`);
      this.state.lastChecksCount = checksCount;
    }
  }

  /**
   * Capture stderr and stdout to prevent interference with positioned updates
   */
  private captureOutput(): void {
    // Store original methods
    this.state.originalStderr = process.stderr.write;
    this.state.originalStdout = process.stdout.write;

    // Intercept stderr (npm warnings, debug output, etc.)
    process.stderr.write = (chunk: any, encoding?: any, callback?: any): boolean => {
      // Silently drop ALL stderr during watch mode to prevent scrolling
      if (typeof encoding === 'function') {
        encoding();
      } else if (callback) {
        callback();
      }
      return true;
    };

    // Intercept stdout writes that aren't our positioned updates
    const originalStdoutWrite = this.state.originalStdout;
    process.stdout.write = (chunk: any, encoding?: any, callback?: any): boolean => {
      const chunkString = chunk.toString();

      // Allow our ANSI positioned updates through (cursor save/restore + positioning)
      if (chunkString.includes('\u001B[s') && chunkString.includes('\u001B[u')) {
        return originalStdoutWrite.call(process.stdout, chunk, encoding, callback);
      }

      // Allow clear screen and cursor control during initialization
      if (chunkString.includes('\u001B[2J') || chunkString.includes('\u001B[?25')) {
        return originalStdoutWrite.call(process.stdout, chunk, encoding, callback);
      }

      // Allow our static layout writes during initialization (before capture is active)
      if (!this.state.isInitialized && (chunkString.includes('📊') || chunkString.includes('─'))) {
        return originalStdoutWrite.call(process.stdout, chunk, encoding, callback);
      }

      // Silently drop ALL other stdout writes during watch mode
      if (typeof encoding === 'function') {
        encoding();
      } else if (callback) {
        callback();
      }
      return true;
    };

    // Also intercept console methods that might bypass stdout
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    console.log = (...arguments_: any[]) => {
      // Silently drop console.log during watch mode
    };

    console.error = (...arguments_: any[]) => {
      // Silently drop console.error during watch mode
    };

    console.warn = (...arguments_: any[]) => {
      // Silently drop console.warn during watch mode
    };

    // Store original console methods for restoration
    (this.state as any).originalConsoleLog = originalConsoleLog;
    (this.state as any).originalConsoleError = originalConsoleError;
    (this.state as any).originalConsoleWarn = originalConsoleWarn;
  }

  /**
   * Restore original output streams
   */
  private restoreOutput(): void {
    if (this.state.originalStderr) {
      process.stderr.write = this.state.originalStderr;
    }
    if (this.state.originalStdout) {
      process.stdout.write = this.state.originalStdout;
    }

    // Restore console methods
    if ((this.state as any).originalConsoleLog) {
      console.log = (this.state as any).originalConsoleLog;
    }
    if ((this.state as any).originalConsoleError) {
      console.error = (this.state as any).originalConsoleError;
    }
    if ((this.state as any).originalConsoleWarn) {
      console.warn = (this.state as any).originalConsoleWarn;
    }
  }

  /**
   * Clean shutdown
   */
  shutdown(): void {
    this.restoreOutput();
    process.stdout.write('\u001B[?25h'); // Show cursor
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let displayInstance: StatefulWatchDisplay | null = null;

export function getWatchDisplay(): StatefulWatchDisplay {
  if (!displayInstance) {
    displayInstance = new StatefulWatchDisplay();
  }
  return displayInstance;
}

export function resetWatchDisplay(): void {
  if (displayInstance) {
    displayInstance.shutdown();
  }
  displayInstance = null;
}
