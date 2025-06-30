/**
 * Clean Watch Mode Display - Developer-Focused Metrics
 * Shows current state, trends, and actionable insights
 */

import {
  getCategoryLabel,
  type Violation as OrchestratorViolation,
} from "../utils/violation-types.js";
import { detectTerminalModeHeuristic } from "./terminal-detector.js";
import { ANSI_CODES, isESLintCategory } from "../shared/constants.js";
import type {
  ColorScheme,
  WatchState,
  ViolationSummary,
  TodayProgressData,
  ConsoleBackup,
  TerminalMode,
} from "../shared/types.js";

export class DeveloperWatchDisplay {
  private state: WatchState;
  private colors: ColorScheme;
  private consoleBackup: ConsoleBackup | undefined = undefined;

  constructor() {
    this.state = {
      isInitialized: false,
      sessionStart: Date.now(),
      lastUpdate: 0,
      baseline: undefined,
      current: { total: 0, bySource: {}, byCategory: {} },
      viewMode: "dashboard", // 'dashboard' | 'tidy' | 'burndown'
      currentViolations: [],
    };
    this.colors = this.createColorScheme();
    this.setupKeyboardHandling();
    this.captureOutput();
  }

  private colorModeOverride: TerminalMode | undefined = undefined;

  private createColorScheme(): ColorScheme {
    const mode: TerminalMode =
      this.colorModeOverride || detectTerminalModeHeuristic();
    const colorSet = mode === "dark" ? ANSI_CODES.DARK : ANSI_CODES.LIGHT;

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
      accent: colorSet.ACCENT,
    };
  }

  /**
   * Toggle between light and dark color schemes
   */
  private toggleColorScheme(): void {
    if (this.colorModeOverride === undefined) {
      // First toggle - determine current mode and switch to opposite
      const currentMode = detectTerminalModeHeuristic();
      this.colorModeOverride = currentMode === "dark" ? "light" : "dark";
    } else {
      // Toggle between the two modes
      this.colorModeOverride =
        this.colorModeOverride === "dark" ? "light" : "dark";
    }

    // Recreate color scheme with new mode
    this.colors = this.createColorScheme();
  }

  private captureOutput(): void {
    // Store original console methods for restoration
    if (!this.consoleBackup) {
      this.consoleBackup = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        stderrWrite: process.stderr.write,
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
      this.consoleBackup = undefined;
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
      process.stdin.setEncoding("utf8");

      process.stdin.on("data", (key: string) => {
        // Handle keyboard shortcuts
        switch (key) {
          case "\u0014": {
            // Ctrl+T - Tidy view
            this.state.viewMode = "tidy";
            this.renderCurrentView().catch(console.error);
            break;
          }
          case "\u0002": {
            // Ctrl+B - Burndown mode
            this.state.viewMode = "burndown";
            this.renderCurrentView().catch(console.error);
            break;
          }
          case " ": {
            // Spacebar - Manual refresh in burndown mode
            if (this.state.viewMode === "burndown") {
              this.renderCurrentView().catch(console.error);
            }
            break;
          }
          case "\u000D": {
            // Ctrl+M - Monitor mode (back to dashboard)
            this.state.viewMode = "dashboard";
            this.renderCurrentView().catch(console.error);
            break;
          }
          case "\u0004": {
            // Ctrl+D - Toggle dark/light mode
            this.toggleColorScheme();
            this.renderCurrentView().catch(console.error);
            break;
          }
          case "\u001B": {
            // Escape - back to dashboard
            this.state.viewMode = "dashboard";
            this.renderCurrentView().catch(console.error);
            break;
          }
          case "\u0003": {
            // Ctrl+C - Exit
            process.stdin.setRawMode(false);
            process.exit(0);
          }
          // No default
        }
      });
    }
  }

  /**
   * Render the current view based on state.viewMode
   */
  private renderCurrentView(): Promise<void> {
    if (this.state.viewMode === "tidy") {
      this.renderTidyView();
    } else if (this.state.viewMode === "burndown") {
      this.renderBurndownView();
    } else {
      this.renderDashboardView();
    }
    return Promise.resolve();
  }

  /**
   * Render a clean diagnostic view showing only actual issues
   */
  private renderTidyView(): void {
    // Clear screen completely and reset position
    process.stdout.write("\u001B[?25l"); // Hide cursor
    process.stdout.write("\u001B[2J"); // Clear entire screen
    process.stdout.write("\u001B[3J"); // Clear scrollback buffer
    process.stdout.write("\u001B[H"); // Move cursor to home
    process.stdout.write(
      `${this.colors.bold}${this.colors.info}🔍 Comprehensive Analysis View${this.colors.reset}\n`,
    );
    process.stdout.write(
      `${this.colors.secondary}Shows all findings (errors, warnings, and info)${this.colors.reset}\n`,
    );
    process.stdout.write(
      `${this.colors.secondary}${"─".repeat(80)}${this.colors.reset}\n\n`,
    );

    if (this.state.currentViolations.length === 0) {
      process.stdout.write(
        `${this.colors.success}✅ No violations found - all clear!${this.colors.reset}\n\n`,
      );
    } else {
      // Group violations by file for cleaner display
      const violationsByFile = new Map<
        string,
        typeof this.state.currentViolations
      >();

      for (const violation of this.state.currentViolations) {
        if (!violationsByFile.has(violation.file)) {
          violationsByFile.set(violation.file, []);
        }
        violationsByFile.get(violation.file)!.push(violation);
      }

      // Display each file's violations
      for (const [file, violations] of violationsByFile) {
        const severityIcon = violations.some((v) => v.severity === "error")
          ? "❌"
          : violations.some((v) => v.severity === "warn")
            ? "⚠️"
            : "ℹ️";

        process.stdout.write(
          `${severityIcon} ${this.colors.info}${file}${this.colors.reset} ${this.colors.secondary}(${violations.length} issues)${this.colors.reset}\n`,
        );

        // Show each violation in compact format with severity indicators
        for (const violation of violations.slice(0, 5)) {
          // Limit to 5 per file for tidiness
          const sourceIcon =
            violation.source === "typescript"
              ? "📝"
              : violation.source === "eslint"
                ? "🔍"
                : "🗂️";
          const severityColor =
            violation.severity === "error"
              ? this.colors.error
              : violation.severity === "warn"
                ? this.colors.warning
                : this.colors.muted;
          const severityLabel =
            violation.severity === "info"
              ? `${this.colors.muted}[info]${this.colors.reset} `
              : "";
          process.stdout.write(
            `  ${sourceIcon} ${severityColor}Line ${violation.line}:${this.colors.reset} ${severityLabel}${violation.message}\n`,
          );
        }

        if (violations.length > 5) {
          process.stdout.write(
            `  ${this.colors.secondary}... and ${violations.length - 5} more issues${this.colors.reset}\n`,
          );
        }
        process.stdout.write("\n");
      }
    }

    process.stdout.write(
      `${this.colors.muted}Press Ctrl+T or Esc to return to dashboard | Ctrl+C to stop watching...${this.colors.reset}\n`,
    );
    process.stdout.write("\u001B[?25h"); // Show cursor
  }

  /**
   * Render the full dashboard view (original view)
   */
  private renderDashboardView(): void {
    // Clear screen completely and reset position
    process.stdout.write("\u001B[?25l"); // Hide cursor
    process.stdout.write("\u001B[2J"); // Clear entire screen
    process.stdout.write("\u001B[3J"); // Clear scrollback buffer
    process.stdout.write("\u001B[H"); // Move cursor to home
    this.state.isInitialized = false;
    // The next updateDisplay call will recreate the dashboard
  }

  /**
   * Render the burndown progress view for active fixing sessions
   */
  private renderBurndownView(
    checksCount?: number,
    actionableViolations?: OrchestratorViolation[],
  ): void {
    const { colors } = this;
    const { sessionStart, currentViolations, baseline, current } = this.state;

    // Use filtered actionable violations (errors + warnings only) instead of all violations
    const displayViolations =
      actionableViolations ||
      this.filterActionableViolations(currentViolations);
    const sessionDuration = Math.floor((Date.now() - sessionStart) / 1000);
    const timestamp = new Date().toLocaleTimeString();

    // Clear screen completely and reset position
    process.stdout.write("\u001B[?25l"); // Hide cursor
    process.stdout.write("\u001B[2J"); // Clear entire screen
    process.stdout.write("\u001B[3J"); // Clear scrollback buffer
    process.stdout.write("\u001B[H"); // Move cursor to home
    process.stdout.write(
      `${colors.bold}${colors.error}🔥 SideQuest Burndown Dashboard${colors.reset}\n`,
    );
    process.stdout.write(
      `${colors.secondary}Showing actionable issues only (errors + warnings)${colors.reset}\n`,
    );
    process.stdout.write(`${colors.muted}${"─".repeat(60)}${colors.reset}\n\n`);

    process.stdout.write(
      `Session Goal: Fix Critical Issues • Started: ${timestamp} • ${Math.floor(sessionDuration / 60)}m ${sessionDuration % 60}s • Checks: ${checksCount || 0}\n\n`,
    );

    // Progress This Session
    process.stdout.write("Progress This Session:\n");
    process.stdout.write(`${colors.muted}${"─".repeat(60)}${colors.reset}\n`);

    // Find the largest category to show as "working on"
    const currentData = this.processViolations(displayViolations);
    const topCategory = Object.entries(currentData.byCategory).sort(
      ([, a], [, b]) => b - a,
    )[0];

    if (topCategory) {
      const [categoryKey, count] = topCategory;
      const categoryName = this.getCategoryDisplayName(categoryKey);
      process.stdout.write(
        `▶️ Working on: ${categoryName} (${count} remaining)\n`,
      );
    } else {
      process.stdout.write("▶️ Working on: No issues found\n");
    }

    // Calculate session progress if baseline exists
    let fixedIssues = 0;
    let addedIssues = 0;
    if (baseline) {
      const baselineTotal = baseline.total;
      const currentTotal = current.total;
      const netChange = currentTotal - baselineTotal;

      if (netChange < 0) {
        fixedIssues = Math.abs(netChange);
      } else if (netChange > 0) {
        addedIssues = netChange;
      }
    }

    process.stdout.write(`✅ Fixed: ${fixedIssues} issues\n`);
    process.stdout.write(`📈 Added: ${addedIssues} new issues\n`);
    process.stdout.write(
      `📊 Net Progress: ${fixedIssues - addedIssues >= 0 ? "+" : ""}${fixedIssues - addedIssues}\n\n`,
    );

    // Burndown Progress by Category
    process.stdout.write(
      "Burndown Progress:                                  Start → Current (Change)\n",
    );
    process.stdout.write(`${colors.muted}${"─".repeat(60)}${colors.reset}\n`);

    // Get real-time data from actionable violations only
    const violationData = this.processViolations(displayViolations);

    // Show meaningful progress bars based on reduction from baseline
    process.stdout.write("🔍 ESLint Categories:\n");
    const eslintCategoryData = [
      { key: "unused-vars", name: "Unused Variables", severity: "⚠️" },
      { key: "modernization", name: "Modernization", severity: "ℹ️" },
      { key: "style", name: "Code Style", severity: "⚠️" },
      { key: "code-quality", name: "Code Quality", severity: "⚠️" },
      { key: "other-eslint", name: "Other ESLint", severity: "ℹ️" },
    ];

    for (const category of eslintCategoryData) {
      const currentCount = violationData.byCategory[category.key] || 0;
      const baselineCount = baseline?.byCategory[category.key] || currentCount;

      if (currentCount > 0 || baselineCount > 0) {
        const change = currentCount - baselineCount;
        const changeText =
          change === 0 ? "±0" : change > 0 ? `+${change}` : `${change}`;
        const changeColor =
          change > 0
            ? colors.error
            : change < 0
              ? colors.success
              : colors.muted;

        // Create burndown progress bar: shows current vs baseline
        const burndownBar = this.createBurndownBar(baselineCount, currentCount);

        process.stdout.write(
          `  ${category.severity} ${category.name.padEnd(18)} ${baselineCount.toString().padStart(2)} → ${currentCount.toString().padStart(2)} ${changeColor}(${changeText})${colors.reset} ${burndownBar}\n`,
        );
      }
    }

    process.stdout.write("\n📝 TypeScript Categories:\n");
    const tsCategoryData = [
      { key: "best-practices", name: "Best Practices", severity: "ℹ️" },
      { key: "type-alias", name: "Type Issues", severity: "❌" },
      { key: "inheritance", name: "Class/Override", severity: "ℹ️" },
    ];

    for (const category of tsCategoryData) {
      const currentCount = violationData.byCategory[category.key] || 0;
      const baselineCount = baseline?.byCategory[category.key] || currentCount;

      if (currentCount > 0 || baselineCount > 0) {
        const change = currentCount - baselineCount;
        const changeText =
          change === 0 ? "±0" : change > 0 ? `+${change}` : `${change}`;
        const changeColor =
          change > 0
            ? colors.error
            : change < 0
              ? colors.success
              : colors.muted;

        const burndownBar = this.createBurndownBar(baselineCount, currentCount);

        process.stdout.write(
          `  ${category.severity} ${category.name.padEnd(18)} ${baselineCount.toString().padStart(2)} → ${currentCount.toString().padStart(2)} ${changeColor}(${changeText})${colors.reset} ${burndownBar}\n`,
        );
      }
    }

    // Unused Exports
    const unusedExportsCount = violationData.bySource["unused-exports"] || 0;
    const baselineUnusedExports =
      baseline?.bySource["unused-exports"] || unusedExportsCount;
    if (unusedExportsCount > 0 || baselineUnusedExports > 0) {
      const change = unusedExportsCount - baselineUnusedExports;
      const changeText =
        change === 0 ? "±0" : change > 0 ? `+${change}` : `${change}`;
      const changeColor =
        change > 0 ? colors.error : change < 0 ? colors.success : colors.muted;
      const burndownBar = this.createBurndownBar(
        baselineUnusedExports,
        unusedExportsCount,
      );

      process.stdout.write(
        `\n🗂️ Unused Exports       ${baselineUnusedExports.toString().padStart(2)} → ${unusedExportsCount.toString().padStart(2)} ${changeColor}(${changeText})${colors.reset} ${burndownBar}\n\n`,
      );
    }

    // Zod Validation Health (using real-time data)
    const zodViolations = displayViolations.filter(
      (v) => v.source === "zod-detection",
    );
    if (zodViolations.length > 0) {
      process.stdout.write("🛡️ Zod Validation Health\n");
      process.stdout.write(`${colors.muted}${"─".repeat(60)}${colors.reset}\n`);

      // Extract real coverage data from violations
      const coverageViolation = zodViolations.find(
        (v) => v.message && v.message.includes("coverage is"),
      );
      const parseRatioViolation = zodViolations.find(
        (v) => v.message && v.message.includes("parse() vs"),
      );

      let coverage = "0";
      let unsafeCalls = "0";

      if (coverageViolation?.message) {
        const coverageMatch = coverageViolation.message.match(
          /coverage is ([.\\d]+)%/,
        );
        if (coverageMatch) {
          coverage = coverageMatch[1] || "0";
        }
      }

      if (parseRatioViolation?.message) {
        const parseMatch = parseRatioViolation.message.match(
          /(\\d+) \\.parse\\(\\)/,
        );
        if (parseMatch) {
          unsafeCalls = parseMatch[1] || "0";
        }
      }

      const coverageNumber = Number.parseFloat(coverage);
      const progressBars = Math.floor((coverageNumber / 100) * 30);
      const emptyBars = 30 - progressBars;

      process.stdout.write(
        `Coverage: ${coverage}% ${"█".repeat(progressBars)}${"░".repeat(emptyBars)} Target: 70%\n`,
      );
      process.stdout.write(
        `Parse Safety: ${unsafeCalls} unsafe calls need fixing\n\n`,
      );
    }

    // Quick Wins (using real-time data)
    process.stdout.write("Quick Wins Available:\n");
    process.stdout.write(`${colors.muted}${"─".repeat(60)}${colors.reset}\n`);
    const styleCount = violationData.byCategory["style"] || 0;
    const modernizationCount = violationData.byCategory["modernization"] || 0;
    const codeQualityCount = violationData.byCategory["code-quality"] || 0;
    const bestPracticesCount = violationData.byCategory["best-practices"] || 0;

    if (styleCount > 0) {
      process.stdout.write(
        `• ${styleCount} Code Style issues (ESLint --fix can resolve most)\n`,
      );
    }
    if (modernizationCount > 0) {
      process.stdout.write(
        `• ${modernizationCount} Modernization opportunities (prefer-const, unicorn rules)\n`,
      );
    }
    if (codeQualityCount > 0) {
      process.stdout.write(
        `• ${codeQualityCount} Code Quality improvements (undef, console, await)\n`,
      );
    }
    if (bestPracticesCount > 0) {
      process.stdout.write(
        `• ${bestPracticesCount} Best Practice improvements\n`,
      );
    }
    if (
      styleCount === 0 &&
      modernizationCount === 0 &&
      codeQualityCount === 0 &&
      bestPracticesCount === 0
    ) {
      process.stdout.write(
        "• No quick wins available - focus on manual fixes\n",
      );
    }
    process.stdout.write("\n");

    process.stdout.write(
      `Session Stats: ${fixedIssues} fixed • ${current.total} remaining • ETA: --:-- (${fixedIssues > 0 ? "progress detected!" : "start fixing to estimate"})\n`,
    );
    process.stdout.write(
      `${colors.muted}Ctrl+M: Monitor • Ctrl+T: Tidy • Ctrl+D: Toggle Colors • Ctrl+C: Exit${colors.reset}\n`,
    );
    process.stdout.write("\u001B[?25h"); // Show cursor
  }

  /**
   * Create a burndown progress bar showing reduction from baseline
   */
  private createBurndownBar(
    baseline: number,
    current: number,
    width: number = 20,
  ): string {
    if (baseline === 0 && current === 0) {
      return "░".repeat(width);
    }

    const maxCount = Math.max(baseline, current, 1);
    const baselineBar = Math.floor((baseline / maxCount) * width);
    const currentBar = Math.floor((current / maxCount) * width);

    if (current <= baseline) {
      // Progress made (reduction) - show green completed portion
      const completed = baselineBar - currentBar;
      const remaining = currentBar;
      const empty = width - baselineBar;
      return (
        "🟩".repeat(completed) + "🟨".repeat(remaining) + "░".repeat(empty)
      );
    } else {
      // Regression (increase) - show red
      const baseline_portion = baselineBar;
      const increase = currentBar - baselineBar;
      const empty = width - currentBar;
      return (
        "🟨".repeat(baseline_portion) +
        "🟥".repeat(increase) +
        "░".repeat(empty)
      );
    }
  }

  /**
   * Filter violations to show only actionable issues (errors + warnings)
   * Info-level items are just noise in watch mode
   */
  private filterActionableViolations(
    violations: OrchestratorViolation[],
  ): OrchestratorViolation[] {
    return violations.filter(
      (violation) =>
        violation.severity === "error" || violation.severity === "warn",
    );
  }

  /**
   * Get display name for category keys
   */
  private getCategoryDisplayName(categoryKey: string): string {
    const displayNames: Record<string, string> = {
      "unused-vars": "Unused Variables",
      "other-eslint": "Other ESLint",
      modernization: "Modernization",
      style: "Code Style",
      "best-practices": "Best Practices",
      "type-alias": "Type Issues",
      inheritance: "Class/Override",
      "unused-code": "Unused Code",
      "code-quality": "Code Quality",
    };

    return (
      displayNames[categoryKey] ||
      categoryKey
        .replaceAll("-", " ")
        .replaceAll(/\b\w/g, (l) => l.toUpperCase())
    );
  }

  async updateDisplay(
    violations: OrchestratorViolation[],
    checksCount: number,
    orchestrator?: any,
  ): Promise<void> {
    // Store current violations for all view modes
    this.state.currentViolations = violations;

    // Check for setup/configuration issues first (critical)
    const setupIssues = violations.filter((v) => v.category === "setup-issue");

    // Filter violations for actionable display (errors + warnings only)
    const actionableViolations = this.filterActionableViolations(violations);

    // If in tidy mode, show ALL violations (comprehensive view)
    if (this.state.viewMode === "tidy") {
      this.renderTidyView();
      return;
    }

    // If in burndown mode, show actionable violations only
    if (this.state.viewMode === "burndown") {
      this.renderBurndownView(checksCount, actionableViolations);
      return;
    }

    // Process actionable violations for dashboard mode (watch focus)
    const current = this.processViolations(actionableViolations);

    // Set baseline on first run (race condition fixed by state management)
    if (!this.state.baseline) {
      this.state.baseline = { ...current };
    }

    this.state.current = current;
    this.state.lastUpdate = Date.now();

    // Get today's data if orchestrator is provided
    let todayData: TodayProgressData | undefined = undefined;
    if (orchestrator) {
      try {
        const analysisService = orchestrator.getAnalysisService();
        // Get stats for all violations to show meaningful progress data
        // TODO: Fix this to properly filter by today when database schema is updated
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const stats = await analysisService.calculateViolationStats({
          start: yesterday,
          end: new Date(),
        });

        todayData = {
          total: stats.total,
          filesAffected: stats.filesAffected,
          avgPerFile: stats.avgPerFile,
        };
      } catch (error) {
        // Log error in debug mode, continue without today's data
        if (process.env["DEBUG"]) {
          console.error("[WatchDisplay] Failed to get today's data:", error);
        }
      }
    }

    // Clear screen and render
    this.render(checksCount, todayData, setupIssues);
  }

  private processViolations(
    violations: OrchestratorViolation[],
  ): ViolationSummary {
    const bySource: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, Record<string, number>> = {};
    const byCategoryBySource: Record<string, Record<string, number>> = {};

    for (const violation of violations) {
      bySource[violation.source] = (bySource[violation.source] || 0) + 1;
      byCategory[violation.category] =
        (byCategory[violation.category] || 0) + 1;

      // Track severity by source
      if (!bySeverity[violation.source]) {
        bySeverity[violation.source] = {};
      }
      bySeverity[violation.source]![violation.severity] =
        (bySeverity[violation.source]![violation.severity] || 0) + 1;

      // Track categories by source
      if (!byCategoryBySource[violation.source]) {
        byCategoryBySource[violation.source] = {};
      }
      byCategoryBySource[violation.source]![violation.category] =
        (byCategoryBySource[violation.source]![violation.category] || 0) + 1;
    }

    return {
      total: violations.length,
      bySource,
      byCategory,
      bySeverity,
      byCategoryBySource,
    };
  }

  private render(
    checksCount: number,
    todayData?: TodayProgressData | null,
    setupIssues?: OrchestratorViolation[],
  ): void {
    const { colors } = this;
    const { lastUpdate, sessionStart, current, baseline } = this.state;
    const sessionDuration = Math.floor((lastUpdate - sessionStart) / 1000);
    const timestamp = new Date().toLocaleTimeString();

    // Clear screen completely and reset position
    process.stdout.write("\u001B[?25l"); // Hide cursor
    process.stdout.write("\u001B[2J"); // Clear entire screen
    process.stdout.write("\u001B[3J"); // Clear scrollback buffer
    process.stdout.write("\u001B[H"); // Move cursor to home

    // Header
    process.stdout.write(
      `${colors.bold}${colors.accent}🔍 Code Quality Monitor${colors.reset}\n`,
    );
    process.stdout.write(
      `${colors.secondary}Showing actionable issues only (errors + warnings)${colors.reset}\n`,
    );
    process.stdout.write(`${colors.muted}${"─".repeat(60)}${colors.reset}\n\n`);

    // ⚠️ CRITICAL: Setup/Configuration Issues (shown prominently)
    if (setupIssues && setupIssues.length > 0) {
      process.stdout.write(
        `${colors.bold}${colors.error}⚠️  SETUP ISSUES DETECTED${colors.reset}\n`,
      );
      process.stdout.write(`${colors.error}${"━".repeat(60)}${colors.reset}\n`);

      for (const issue of setupIssues) {
        const toolName =
          issue.source === "typescript"
            ? "TypeScript"
            : issue.source === "eslint"
              ? "ESLint"
              : issue.source.toUpperCase();
        process.stdout.write(
          `${colors.error}🚨 ${toolName} Configuration Problem:${colors.reset}\n`,
        );

        // Extract the main error message (first line of the detailed message)
        const mainMessage = issue.message?.split("\n")[0] || issue.code;
        process.stdout.write(
          `   ${colors.warning}${mainMessage}${colors.reset}\n`,
        );

        // Show fix suggestion if available
        if (issue.fixSuggestion) {
          process.stdout.write(
            `   ${colors.info}💡 Fix: ${issue.fixSuggestion}${colors.reset}\n`,
          );
        }
        process.stdout.write("\n");
      }

      process.stdout.write(`${colors.error}${"━".repeat(60)}${colors.reset}\n`);
      process.stdout.write(
        `${colors.warning}⚡ Fix these setup issues first - analysis may be incomplete!${colors.reset}\n\n`,
      );
    }

    // Current Status
    const baseline_ = baseline!;
    const totalDelta = current.total - baseline_.total;
    const deltaColor =
      totalDelta > 0
        ? colors.error
        : totalDelta < 0
          ? colors.success
          : colors.muted;
    const deltaText =
      totalDelta === 0 ? "" : ` (${totalDelta > 0 ? "+" : ""}${totalDelta})`;

    process.stdout.write(
      `${colors.bold}Current Issues: ${colors.primary}${current.total}${deltaColor}${deltaText}${colors.reset}\n`,
    );
    process.stdout.write(
      `${colors.muted}Last check: ${timestamp} | Session: ${sessionDuration}s | Checks: ${checksCount}${colors.reset}\n\n`,
    );

    // By Source with severity breakdown (excluding zod-detection which has its own section)
    if (Object.keys(current.bySource).length > 0) {
      process.stdout.write(`${colors.warning}By Source:${colors.reset}\n`);
      for (const [source, count] of Object.entries(current.bySource).sort(
        ([, a], [, b]) => b - a,
      )) {
        // Skip zod-detection as it has its own dedicated section
        if (source === "zod-detection") {
          continue;
        }

        const baselineCount = baseline_.bySource[source] || 0;
        const delta = count - baselineCount;
        const deltaString =
          delta === 0 ? "" : ` (${delta > 0 ? "+" : ""}${delta})`;
        const deltaColor =
          delta > 0 ? colors.error : delta < 0 ? colors.success : colors.reset;
        const icon =
          source === "typescript"
            ? "📝"
            : source === "unused-exports"
              ? "🗂️"
              : "🔍";

        process.stdout.write(
          `  ${icon} ${colors.info}${source}:${colors.reset} ${colors.primary}${count}${deltaColor}${deltaString}${colors.reset}\n`,
        );

        // Show severity breakdown for ESLint only (TypeScript errors are mostly all "error" severity)
        if (
          current.bySeverity &&
          current.bySeverity[source] &&
          source === "eslint"
        ) {
          const severities = current.bySeverity[source];
          const severityOrder = ["error", "warn", "info"];
          for (const severity of severityOrder) {
            if (severities[severity]) {
              const sevIcon =
                severity === "error" ? "❌" : severity === "warn" ? "⚠️" : "ℹ️";
              process.stdout.write(
                `    ${sevIcon} ${colors.secondary}${severity}:${colors.reset} ${colors.primary}${severities[severity]}${colors.reset}\n`,
              );
            }
          }
        }

        // Show top categories for ESLint and TypeScript (limit to top 5 to avoid clutter)
        if (
          current.byCategoryBySource &&
          current.byCategoryBySource[source] &&
          (source === "eslint" || source === "typescript")
        ) {
          const categories = Object.entries(current.byCategoryBySource[source])
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

          for (const [category, categoryCount] of categories) {
            const displayLabel = getCategoryLabel(category as any);
            process.stdout.write(
              `    • ${colors.secondary}${displayLabel}:${colors.reset} ${colors.primary}${categoryCount}${colors.reset}\n`,
            );
          }
        }
      }
      process.stdout.write("\n");
    }

    // Enhanced Zod Analysis Section (if Zod violations exist) - show even in actionable mode since it's contextual
    const allViolations = this.state.currentViolations; // Use all violations for Zod context
    const zodViolations = allViolations.filter(
      (v) => v.source === "zod-detection",
    );
    if (zodViolations.length > 0) {
      this.renderZodAnalysisSection(zodViolations);
    }

    // Top Issues (by category)
    const topCategories = Object.entries(current.byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    if (topCategories.length > 0) {
      process.stdout.write(`${colors.warning}Top Issues:${colors.reset}\n`);

      for (const [category, count] of topCategories) {
        const baselineCount = baseline_.byCategory[category] || 0;
        const delta = count - baselineCount;
        const deltaString =
          delta === 0 ? "" : ` (${delta > 0 ? "+" : ""}${delta})`;
        const deltaColor =
          delta > 0 ? colors.error : delta < 0 ? colors.success : colors.reset;

        // Determine severity and icon
        const isESLintViolation = isESLintCategory(category);
        const severity = this.getSeverity(category);
        const severityIcon =
          severity === "error" ? "❌" : severity === "warn" ? "⚠️" : "ℹ️";
        const sourceIcon = isESLintViolation ? "🔍" : "📝";

        const displayLabel = getCategoryLabel(category as any);
        process.stdout.write(
          `  ${severityIcon} ${sourceIcon} ${colors.info}${displayLabel}:${colors.reset} ${colors.primary}${count}${deltaColor}${deltaString}${colors.reset}\n`,
        );
      }
    }

    // Session Summary - show detailed breakdown
    process.stdout.write(`\n${colors.muted}Session Summary:${colors.reset}\n`);

    // Calculate positive and negative changes separately
    let newIssues = 0;
    let resolvedIssues = 0;

    for (const [category, count] of Object.entries(current.byCategory)) {
      const baselineCount = baseline_.byCategory[category] || 0;
      const delta = count - baselineCount;

      if (delta > 0) {
        newIssues += delta;
      } else if (delta < 0) {
        resolvedIssues += Math.abs(delta);
      }
    }

    // Show detailed breakdown
    if (newIssues > 0) {
      process.stdout.write(
        `${colors.error}  📈 +${newIssues} new issues found${colors.reset}\n`,
      );
    }
    if (resolvedIssues > 0) {
      process.stdout.write(
        `${colors.success}  📉 ${resolvedIssues} issues resolved${colors.reset}\n`,
      );
    }

    // Show net change in blue
    const netChange = newIssues - resolvedIssues;
    if (netChange !== 0) {
      const netColor = colors.info; // Blue for net change
      const netIcon = netChange > 0 ? "🔺" : "🔻";
      const netSign = netChange > 0 ? "+" : "";
      process.stdout.write(
        `${netColor}  ${netIcon} Net: ${netSign}${netChange}${colors.reset}\n`,
      );
    } else if (newIssues === 0 && resolvedIssues === 0) {
      process.stdout.write(
        `${colors.muted}  ➡️  No changes this session${colors.reset}\n`,
      );
    } else {
      process.stdout.write(
        `${colors.info}  ⚖️  Net: No change (${newIssues} new, ${resolvedIssues} resolved)${colors.reset}\n`,
      );
    }

    // Today's Progress
    if (todayData) {
      process.stdout.write(
        `\n${colors.muted}Today's Progress:${colors.reset}\n`,
      );
      process.stdout.write(
        `${colors.accent}  📅 Total issues processed: ${colors.primary}${todayData.total}${colors.reset}\n`,
      );
      process.stdout.write(
        `${colors.accent}  📁 Files affected: ${colors.primary}${todayData.filesAffected}${colors.reset}\n`,
      );
      if (todayData.avgPerFile > 0) {
        process.stdout.write(
          `${colors.accent}  📊 Avg per file: ${colors.primary}${todayData.avgPerFile.toFixed(1)}${colors.reset}\n`,
        );
      }
    }

    process.stdout.write(
      `\n${colors.muted}Ctrl+B: Burndown • Ctrl+T: Comprehensive • Ctrl+D: Toggle Colors • Ctrl+C: Exit${colors.reset}\n`,
    );
    process.stdout.write("\u001B[?25h"); // Show cursor
  }

  /**
   * Render enhanced Zod analysis section with coverage metrics
   */
  private renderZodAnalysisSection(
    zodViolations: OrchestratorViolation[],
  ): void {
    const { colors } = this;

    process.stdout.write(
      `${colors.bold}${colors.accent}🛡️ Zod Analysis${colors.reset}\n`,
    );
    process.stdout.write(`${colors.muted}${"─".repeat(60)}${colors.reset}\n`);

    // Extract Zod coverage data from violations
    const coverageViolation = zodViolations.find(
      (v) => v.message && v.message.includes("coverage is"),
    );
    const parseRatioViolation = zodViolations.find(
      (v) => v.message && v.message.includes("parse() vs"),
    );
    const baselineViolation = zodViolations.find(
      (v) => v.message && v.message.includes("Target "),
    );

    // Extract coverage percentage
    let coverage = "0";
    let usedSchemas = "0";
    let totalSchemas = "0";
    if (coverageViolation && coverageViolation.message) {
      const coverageMatch = coverageViolation.message.match(
        /coverage is ([\d.]+)% \((\d+)\/(\d+) schemas used\)/,
      );
      if (coverageMatch) {
        coverage = coverageMatch[1] || "0";
        usedSchemas = coverageMatch[2] || "0";
        totalSchemas = coverageMatch[3] || "0";
      }
    }

    // Extract parse safety data
    let parseCallsCount = "0";
    let safeParseCallsCount = "0";
    if (parseRatioViolation && parseRatioViolation.message) {
      const parseMatch = parseRatioViolation.message.match(
        /(\d+) \.parse\(\) vs (\d+) \.safeParse\(\)/,
      );
      if (parseMatch) {
        parseCallsCount = parseMatch[1] || "0";
        safeParseCallsCount = parseMatch[2] || "0";
      }
    }

    // Extract risk level from coverage percentage
    const coverageNumber = Number.parseFloat(coverage);
    let riskLevel = "High";
    let riskColor = colors.error;
    if (coverageNumber >= 80) {
      riskLevel = "Low";
      riskColor = colors.success;
    } else if (coverageNumber >= 50) {
      riskLevel = "Medium";
      riskColor = colors.warning;
    }

    // Extract baseline recommendation
    let baseline = "General TypeScript project: Target 70%+ coverage";
    if (baselineViolation && baselineViolation.message) {
      const baselineMatch = baselineViolation.message.match(/Target ([^.]+)\./);
      if (baselineMatch) {
        baseline = `Target ${baselineMatch[1]}`;
      }
    }

    // Display coverage metrics prominently
    process.stdout.write(
      `${colors.secondary}  Coverage: ${colors.primary}${coverage}%${colors.reset} ${colors.secondary}(${usedSchemas}/${totalSchemas} schemas used)${colors.reset}\n`,
    );
    process.stdout.write(
      `${colors.secondary}  Risk Level: ${riskColor}${riskLevel}${colors.reset}\n`,
    );
    process.stdout.write(
      `${colors.secondary}  Parse Safety: ${colors.primary}${parseCallsCount} unsafe${colors.reset}${colors.secondary}, ${colors.primary}${safeParseCallsCount} safe${colors.reset} ${colors.secondary}calls${colors.reset}\n`,
    );
    process.stdout.write(
      `${colors.secondary}  Baseline: ${colors.info}${baseline}${colors.reset}\n\n`,
    );
  }

  private getSeverity(category: string): "error" | "warn" | "info" {
    // Error categories
    if (["type-alias", "no-explicit-any"].includes(category)) {
      return "error";
    }

    // Warning categories
    if (
      [
        "annotation",
        "cast",
        "unused-vars",
        "code-quality",
        "return-type",
        "style",
      ].includes(category)
    ) {
      return "warn";
    }

    // Default to info
    return "info";
  }

  /**
   * Restore display state from a previous session
   */
  restoreFromSession(sessionData: {
    sessionStart: number;
    baseline: ViolationSummary | undefined;
    current: ViolationSummary;
    viewMode: string;
  }): void {
    this.state.sessionStart = sessionData.sessionStart;
    this.state.baseline = sessionData.baseline;
    this.state.current = sessionData.current;
    this.state.viewMode = sessionData.viewMode as
      | "dashboard"
      | "tidy"
      | "burndown";
    this.state.isInitialized = true;
  }

  /**
   * Wait for initial analysis to complete before allowing display updates
   * This prevents race conditions where display shows before analysis finishes
   */
  async waitForInitialAnalysis(): Promise<void> {
    // This is called by the controller to ensure proper sequencing
    // The needsBaselineRefresh flag handles the actual synchronization
    return Promise.resolve();
  }

  /**
   * Check if display is ready for updates
   */
  isReady(): boolean {
    return this.state.isInitialized;
  }

  /**
   * Reset baseline to force refresh on next update
   * Used when resuming sessions to prevent stale delta calculations
   */
  resetBaseline(): void {
    this.state.baseline = undefined;
  }

  shutdown(): void {
    this.restoreOutput();
    // Restore stdin if it was modified
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    process.stdout.write("\u001B[?25h"); // Show cursor
  }
}

// Singleton
let displayInstance: DeveloperWatchDisplay | undefined;

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
  displayInstance = undefined;
}
