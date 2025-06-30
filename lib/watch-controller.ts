/**
 * Watch Mode Controller
 * Manages watch mode lifecycle, coordinates services, and handles state transitions
 * Extracted from cli.ts to reduce monolithic architecture and improve testability
 */

import { EventEmitter } from "node:events";
import type { CLIFlags } from "../utils/types.js";
import type { OrchestratorService } from "../services/orchestrator-service.js";
import type { SessionManager } from "../services/session-manager.js";
import type { DeveloperWatchDisplay } from "./watch-display-v2.js";
import type { CodeQualityOrchestrator } from "./orchestrator.js";
import type { Violation as OrchestratorViolation } from "../utils/violation-types.js";
import { WatchStateManager } from "../services/watch-state-manager.js";
import { processViolationSummary } from "./cli.js";

export interface WatchControllerConfig {
  flags: CLIFlags;
  orchestrator: OrchestratorService;
  sessionManager: SessionManager;
  display: DeveloperWatchDisplay;
  legacyOrchestrator: CodeQualityOrchestrator;
  colors: any; // Color scheme from cli.ts
}

/**
 * WatchController manages the complete watch mode lifecycle
 * - Handles session restoration/creation
 * - Coordinates analysis and display updates
 * - Manages graceful shutdown
 * - Prevents race conditions through explicit state management
 */
export class WatchController extends EventEmitter {
  private config: WatchControllerConfig;
  private stateManager: WatchStateManager;
  private watchInterval: ReturnType<typeof setInterval> | null = null;
  private watchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WatchControllerConfig) {
    super();
    this.config = config;
    this.stateManager = new WatchStateManager(null, {
      flags: config.flags as Record<string, unknown>,
    });

    // Forward state manager events
    this.stateManager.on("stateChange", (transition) => {
      this.emit("stateChange", transition);
    });

    this.stateManager.on("invalidTransition", (attempt) => {
      this.emit("invalidTransition", attempt);
    });
  }

  /**
   * Start watch mode with proper lifecycle management
   */
  async start(): Promise<void> {
    const { flags, orchestrator, sessionManager, display, colors } =
      this.config;

    try {
      // Handle session restoration or creation
      let session = null;
      if (flags.resumeSession) {
        session = await sessionManager.loadSession();
        if (session && sessionManager.canResumeSession(session, flags)) {
          this.stateManager.setSessionId(session.id);
          console.log(
            `${colors.success}🔄 Resuming previous session (${session.checksCount} checks, ${Math.floor((Date.now() - session.startTime) / 60000)}min ago)...${colors.reset}`,
          );

          // Restore display state but mark that baseline needs refresh
          display.restoreFromSession({
            sessionStart: session.startTime,
            baseline: session.baseline,
            current: session.current,
            viewMode: session.viewMode,
          });
        } else {
          console.log(
            `${colors.warning}⚠️  Cannot resume previous session, starting fresh...${colors.reset}`,
          );
          session = null;
        }
      }

      if (!session) {
        session = await sessionManager.createSession(flags);
        this.stateManager.setSessionId(session.id);
      }

      // Start orchestrator watch mode
      await orchestrator.startWatchMode({
        intervalMs: 3000,
        debounceMs: 500,
        autoCleanup: true,
        maxConcurrentChecks: 3,
      });

      // Enable silent mode for services during watch
      orchestrator.setSilentMode(true);

      console.log(
        `${colors.bold}${colors.info}Starting Enhanced Code Quality Watch...${colors.reset}`,
      );

      // Perform initial analysis before starting watch cycle
      this.stateManager.startAnalysis();
      await this.runAnalysisCycle();
      this.stateManager.completeAnalysis();

      // Start watch cycle
      this.watchInterval = setInterval(() => {
        if (this.stateManager.canStartAnalysis()) {
          this.stateManager.startAnalysis();
          this.runAnalysisCycle()
            .then(() => this.stateManager.completeAnalysis())
            .catch((error) => this.handleError(error));
        }
      }, 3000);

      // Safety timeout (10 minutes)
      this.watchTimeout = setTimeout(
        () => this.shutdown("timeout"),
        10 * 60 * 1000,
      );

      // Setup graceful shutdown handlers
      this.setupShutdownHandlers();
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Run a single analysis cycle
   */
  private async runAnalysisCycle(): Promise<void> {
    const { legacyOrchestrator, orchestrator, sessionManager, display, flags } =
      this.config;

    try {
      // Get current violations using legacy orchestrator
      const result = await legacyOrchestrator.analyze();
      const checksCount = this.stateManager.getChecksCount() + 1;

      // Process violations with persistence (for historical tracking)
      await this.processViolationsWithPersistence(result.violations);

      // Update session state
      const current = processViolationSummary(result.violations);
      await sessionManager.updateSession({
        checksCount,
        current,
        baseline: undefined, // Let display manage baseline
      });

      if (flags.verbose) {
        const enhancedResult = {
          ...result,
          database: {
            dashboard: await orchestrator
              .getStorageService()
              .getDashboardData(),
          },
        };
        console.log(JSON.stringify(enhancedResult, undefined, 2));
      } else {
        // Only update display if analysis is allowed (prevents race conditions)
        if (this.stateManager.canUpdateDisplay()) {
          await display.updateDisplay(
            result.violations,
            checksCount,
            orchestrator,
          );
        }
      }

      // Emit success event
      this.emit("analysisComplete", {
        checksCount,
        violationCount: result.violations.length,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Process violations with persistence system
   */
  private async processViolationsWithPersistence(
    violations: OrchestratorViolation[],
  ): Promise<void> {
    const { orchestrator } = this.config;
    try {
      const violationTracker = orchestrator.getViolationTracker();
      await violationTracker.processViolations(violations);
    } catch (error) {
      console.warn("Failed to process violations with persistence:", error);
    }
  }

  /**
   * Handle watch mode errors with comprehensive diagnostics
   */
  private async handleError(error: unknown): Promise<void> {
    const { sessionManager, colors } = this.config;

    const errorObj = error instanceof Error ? error : new Error(String(error));
    const timestamp = new Date().toISOString();

    // Update state manager with error
    this.stateManager.handleAnalysisError(errorObj);

    const errorDetails = {
      timestamp,
      error: errorObj.message,
      stack: errorObj.stack,
      checksCount: this.stateManager.getChecksCount(),
      phase: this.stateManager.getPhase(),
      cwd: process.cwd(),
      nodeVersion: process.version,
      platform: process.platform,
    };

    // Log to console with user-friendly message
    console.error(
      `\n${colors.error}🚨 Watch Mode Error at ${timestamp}${colors.reset}`,
    );
    console.error(
      `${colors.warning}Reason: ${errorObj.message}${colors.reset}`,
    );
    console.error(
      `${colors.secondary}Check ${this.stateManager.getChecksCount()} failed. Watch mode continuing...${colors.reset}\n`,
    );

    // Log error to session
    await sessionManager.logError(
      errorObj,
      this.stateManager.getChecksCount(),
      {
        nodeVersion: process.version,
        platform: process.platform,
      },
    );

    // Log detailed error to file for debugging
    await this.logErrorToFile(errorDetails);

    // Emit error event for potential recovery
    this.emit("error", errorObj, this.stateManager.getChecksCount());

    // Try to recover to running state
    setTimeout(() => {
      this.stateManager.recover();
    }, 5000);
  }

  /**
   * Log error details to file system
   */
  private async logErrorToFile(errorDetails: any): Promise<void> {
    const { colors } = this.config;

    try {
      const { existsSync, mkdirSync, appendFileSync } = await import("node:fs");
      const { join } = await import("node:path");

      const logDir = join(process.cwd(), ".sidequest-logs");
      const logFile = join(logDir, "watch-errors.log");

      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      const logEntry = `${JSON.stringify(errorDetails, null, 2)}\n\n`;
      appendFileSync(logFile, logEntry);

      console.error(
        `${colors.info}📝 Error logged to: ${logFile}${colors.reset}`,
      );
    } catch (logError) {
      const logErrorObj =
        logError instanceof Error ? logError : new Error(String(logError));
      console.error(
        `${colors.warning}⚠️  Could not log error details: ${logErrorObj.message}${colors.reset}`,
      );
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const handler = () => this.shutdown("interrupt");
    process.on("SIGINT", handler);
    process.on("SIGTERM", handler);
  }

  /**
   * Shutdown watch mode gracefully
   */
  async shutdown(
    reason: "timeout" | "interrupt" | "error" = "interrupt",
  ): Promise<void> {
    const { orchestrator, display } = this.config;

    // Update state manager
    this.stateManager.shutdown(reason);

    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    if (this.watchTimeout) {
      clearTimeout(this.watchTimeout);
      this.watchTimeout = null;
    }

    try {
      await orchestrator.stopWatchMode();
      await orchestrator.shutdown();
    } catch (error) {
      console.warn("Error during orchestrator shutdown:", error);
    }

    // Clean shutdown of display system
    display.shutdown();

    const reasonMessages = {
      timeout: "⏰ Watch mode timeout reached (10 minutes). Stopping...",
      interrupt: "👋 Enhanced Code Quality Orchestrator watch stopped.",
      error: "💥 Watch mode stopped due to critical error.",
    };

    console.log(`\n\n${reasonMessages[reason]}`);

    this.emit("shutdown", reason);
    process.exit(reason === "error" ? 1 : 0);
  }

  /**
   * Get current state (read-only)
   */
  getState() {
    return this.stateManager.getState();
  }

  /**
   * Get current phase
   */
  getPhase() {
    return this.stateManager.getPhase();
  }

  /**
   * Check if watch mode is ready for display updates
   */
  isReady(): boolean {
    return this.stateManager.canUpdateDisplay();
  }

  /**
   * Get state summary for debugging
   */
  getStateSummary(): string {
    return this.stateManager.getStateSummary();
  }
}
