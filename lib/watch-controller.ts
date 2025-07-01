/**
 * Watch Mode Controller
 * Manages watch mode lifecycle, coordinates services, and handles state transitions
 * Extracted from cli.ts to reduce monolithic architecture and improve testability
 */

import { EventEmitter } from 'node:events';
import type { CLIFlags } from '../utils/types.js';
import type { ColorScheme } from '../shared/types.js';
import type {
  OrchestratorResult,
  Violation as OrchestratorViolation
} from '../utils/violation-types.js';
// OrchestratorService import removed - using UnifiedOrchestrator only
import type { SessionManager } from '../services/session-manager.js';
import type { DeveloperWatchDisplay } from './watch-display-v2.js';
import type { UnifiedOrchestrator } from '../services/unified-orchestrator.js';
import { WatchStateManager } from '../services/watch-state-manager.js';
import { processViolationSummary } from './cli.js';
import { debugLog } from '../utils/debug-logger.js';

export interface WatchControllerConfig {
  flags: CLIFlags;
  orchestrator: UnifiedOrchestrator; // Using unified orchestrator for all functionality
  sessionManager: SessionManager;
  display: DeveloperWatchDisplay;
  legacyOrchestrator: UnifiedOrchestrator; // Using unified orchestrator
  colors: ColorScheme; // Color scheme from cli.ts
}

/**
 * WatchController manages the complete watch mode lifecycle
 * - Handles session restoration/creation
 * - Coordinates analysis and display updates
 * - Manages graceful shutdown
 * - Prevents race conditions through explicit state management
 */
// eslint-disable-next-line unicorn/prefer-event-target
export class WatchController extends EventEmitter {
  private config: WatchControllerConfig;
  private stateManager: WatchStateManager;
  private watchInterval: ReturnType<typeof setInterval> | undefined = undefined;
  private watchTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

  constructor(config: WatchControllerConfig) {
    super();
    debugLog('WatchController', 'Constructor started');
    this.config = config;
    debugLog('WatchController', 'Config assigned');
    this.stateManager = new WatchStateManager(undefined, {
      flags: config.flags as Record<string, unknown>
    });
    debugLog('WatchController', 'State manager created');

    // Forward state manager events
    this.stateManager.on('stateChange', (transition) => {
      this.emit('stateChange', transition);
    });

    this.stateManager.on('invalidTransition', (attempt) => {
      this.emit('invalidTransition', attempt);
    });
    debugLog('WatchController', 'Constructor completed successfully');
  }

  /**
   * Start watch mode with proper lifecycle management
   */
  async start(): Promise<void> {
    const { flags, orchestrator, sessionManager, display, colors } =
      this.config;

    // Pre-flight checks
    debugLog('WatchController', 'Starting pre-flight checks...');
    debugLog('WatchController', `Working directory: ${process.cwd()}`);
    debugLog('WatchController', `Node version: ${process.version}`);
    debugLog('WatchController', `Platform: ${process.platform}`);
    debugLog('WatchController', 'Flags configuration', flags);

    try {
      // Handle session restoration or creation
      let session = undefined;
      if (flags.resumeSession) {
        session = await sessionManager.loadSession();
        if (session && sessionManager.canResumeSession(session, flags)) {
          this.stateManager.setSessionId(session.id);
          debugLog('WatchController', 'Resuming previous session', {
            sessionId: session.id,
            checksCount: session.checksCount,
            minutesAgo: Math.floor((Date.now() - session.startTime) / 60_000)
          });
          console.log(
            `${colors.success}🔄 Resuming previous session (${session.checksCount} checks, ${Math.floor((Date.now() - session.startTime) / 60_000)}min ago)...${colors.reset}`
          );

          // Restore display state but mark that baseline needs refresh
          display.restoreFromSession({
            sessionStart: session.startTime,
            baseline: session.baseline,
            current: session.current,
            viewMode: session.viewMode
          });
        } else {
          debugLog(
            'WatchController',
            'Cannot resume previous session, starting fresh'
          );
          console.log(
            `${colors.warning}⚠️  Cannot resume previous session, starting fresh...${colors.reset}`
          );
          session = undefined;
        }
      }

      if (!session) {
        debugLog('WatchController', 'Creating new session');
        session = await sessionManager.createSession(flags);
        this.stateManager.setSessionId(session.id);
        debugLog('WatchController', 'New session created', {
          sessionId: session.id
        });
      }

      // Start orchestrator watch mode
      debugLog(
        'WatchController',
        'Starting orchestrator watch mode with config',
        {
          intervalMs: 3000,
          debounceMs: 500,
          autoCleanup: true,
          maxConcurrentChecks: 3
        }
      );
      await orchestrator.startWatchMode({
        intervalMs: 3000,
        debounceMs: 500,
        autoCleanup: true,
        maxConcurrentChecks: 3
      });

      // Enable silent mode for services during watch
      debugLog('WatchController', 'Enabling silent mode for orchestrator');
      orchestrator.setSilentMode(true);

      console.log(
        `${colors.bold}${colors.info}Starting Enhanced Code Quality Watch...${colors.reset}`
      );

      // Perform initial analysis before starting watch cycle
      debugLog('WatchController', 'Starting initial analysis cycle...');
      this.stateManager.startAnalysis();

      let initialAnalysisResult: OrchestratorResult | undefined = undefined;
      await Promise.race([
        this.runAnalysisCycle().then((result) => {
          initialAnalysisResult = result;
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Initial analysis timeout after 120s')),
            120_000
          )
        )
      ]);

      this.stateManager.completeAnalysis();
      debugLog(
        'WatchController',
        'Initial analysis completed, starting watch cycle...'
      );

      // Force an initial display update now that we're in 'ready' state
      debugLog(
        'WatchController',
        'Performing initial display update after state transition'
      );
      if (this.stateManager.canUpdateDisplay()) {
        try {
          // Use the stored result from initial analysis instead of running again
          if (initialAnalysisResult && 'violations' in initialAnalysisResult) {
            const violations = (
              initialAnalysisResult as { violations: OrchestratorViolation[] }
            ).violations;
            await display.updateDisplay(
              violations,
              this.stateManager.getChecksCount(),
              orchestrator
            );
            debugLog(
              'WatchController',
              'Initial display update completed successfully'
            );
          } else {
            debugLog(
              'WatchController',
              'No initial analysis result available for display'
            );
          }
        } catch (error) {
          debugLog('WatchController', 'Initial display update failed', error);
        }
      } else {
        debugLog(
          'WatchController',
          'Cannot perform initial display update - not allowed in current state',
          {
            phase: this.stateManager.getPhase(),
            canUpdate: this.stateManager.canUpdateDisplay()
          }
        );
      }

      // Start watch cycle
      this.watchInterval = setInterval(() => {
        if (this.stateManager.canStartAnalysis()) {
          this.stateManager.startAnalysis();
          this.runAnalysisCycle()
            .then(() => this.stateManager.completeAnalysis())
            .catch((error) => this.handleError(error));
        }
      }, 3000);

      // Initial inactivity timeout (10 minutes) - will be reset on activity
      this.resetTimeout();

      // Setup graceful shutdown handlers
      this.setupShutdownHandlers();
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Reset the inactivity timeout (called on any activity)
   */
  private resetTimeout(): void {
    if (this.watchTimeout) {
      clearTimeout(this.watchTimeout);
    }

    // Reset 10-minute inactivity timeout
    this.watchTimeout = setTimeout(
      () => this.shutdown('timeout'),
      10 * 60 * 1000
    );

    debugLog('WatchController', 'Inactivity timeout reset (10 minutes)');
  }

  /**
   * Run a single analysis cycle
   */
  private async runAnalysisCycle(): Promise<any> {
    const { legacyOrchestrator, orchestrator, sessionManager, display, flags } =
      this.config;

    try {
      debugLog('WatchController', 'Starting analysis cycle...');

      // Reset timeout on any analysis activity
      this.resetTimeout();

      // Get current violations using legacy orchestrator with timeout
      debugLog('WatchController', 'Running legacy orchestrator analysis...');
      const result = (await Promise.race([
        legacyOrchestrator.analyze(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Analysis timeout after 60s')),
            60_000
          )
        )
      ])) as any;
      debugLog(
        'WatchController',
        `Analysis completed, found ${result.violations?.length || 0} violations`
      );

      const checksCount = this.stateManager.getChecksCount() + 1;

      // Note: Persistence is now handled automatically by UnifiedOrchestrator

      // Update session state
      debugLog('WatchController', 'Updating session state...');
      const current = processViolationSummary(result.violations);
      await sessionManager.updateSession({
        checksCount,
        current,
        baseline: undefined // Let display manage baseline
      });
      debugLog('WatchController', 'Session state updated', {
        checksCount,
        violationTotal: current.total
      });

      if (flags.verbose) {
        debugLog(
          'WatchController',
          'Getting dashboard data for verbose output...'
        );
        const enhancedResult = {
          ...result,
          database: {
            dashboard: (await Promise.race([
              orchestrator.getStorageService().getDashboardData(),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error('Dashboard data timeout after 30s')),
                  30_000
                )
              )
            ])) as any
          }
        };
        console.log(JSON.stringify(enhancedResult, undefined, 2));
      } else {
        // Only update display if analysis is allowed (prevents race conditions)
        debugLog('WatchController', 'Checking if display update is allowed', {
          canUpdate: this.stateManager.canUpdateDisplay(),
          phase: this.stateManager.getPhase(),
          analysisInProgress: this.stateManager.isAnalyzing(),
          stateSummary: this.stateManager.getStateSummary()
        });
        if (this.stateManager.canUpdateDisplay()) {
          debugLog(
            'WatchController',
            'Calling display.updateDisplay with violations',
            {
              violationCount: result.violations.length,
              checksCount
            }
          );
          await display.updateDisplay(
            result.violations,
            checksCount,
            orchestrator
          );
          debugLog('WatchController', 'Display update completed');
        } else {
          debugLog(
            'WatchController',
            'Display update skipped - not allowed in current state'
          );
        }
      }

      // Emit success event
      this.emit('analysisComplete', {
        checksCount,
        violationCount: result.violations.length
      });

      // Return the result for initial display update
      return result;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  // processViolationsWithPersistence method removed -
  // persistence is now handled automatically by UnifiedOrchestrator

  /**
   * Handle watch mode errors with comprehensive diagnostics
   */
  private async handleError(error: unknown): Promise<void> {
    const { sessionManager, colors } = this.config;

    const errorObject =
      error instanceof Error ? error : new Error(String(error));
    const timestamp = new Date().toISOString();

    // Update state manager with error
    this.stateManager.handleAnalysisError(errorObject);

    const errorDetails = {
      timestamp,
      error: errorObject.message,
      stack: errorObject.stack,
      checksCount: this.stateManager.getChecksCount(),
      phase: this.stateManager.getPhase(),
      cwd: process.cwd(),
      nodeVersion: process.version,
      platform: process.platform
    };

    // Log to console with user-friendly message
    console.error(
      `\n${colors.error}🚨 Watch Mode Error at ${timestamp}${colors.reset}`
    );
    console.error(
      `${colors.warning}Reason: ${errorObject.message}${colors.reset}`
    );
    console.error(
      `${colors.secondary}Check ${this.stateManager.getChecksCount()} failed. Watch mode continuing...${colors.reset}\n`
    );

    // Log error to session
    await sessionManager.logError(
      errorObject,
      this.stateManager.getChecksCount(),
      {
        nodeVersion: process.version,
        platform: process.platform
      }
    );

    // Log detailed error to file for debugging
    await this.logErrorToFile(errorDetails);

    // Emit error event for potential recovery
    this.emit('error', errorObject, this.stateManager.getChecksCount());

    // Try to recover to running state
    setTimeout(() => {
      this.stateManager.recover();
    }, 5000);
  }

  /**
   * Log error details to file system
   */
  private async logErrorToFile(errorDetails: unknown): Promise<void> {
    const { colors } = this.config;

    try {
      const { existsSync, mkdirSync, appendFileSync } = await import('node:fs');
      // eslint-disable-next-line unicorn/import-style
      const pathModule = await import('node:path');
      const path = pathModule.default;

      const logDirectory = path.join(process.cwd(), '.sidequest-logs');
      const logFile = path.join(logDirectory, 'watch-errors.log');

      if (!existsSync(logDirectory)) {
        mkdirSync(logDirectory, { recursive: true });
      }

      const logEntry = `${JSON.stringify(errorDetails, undefined, 2)}\n\n`;
      appendFileSync(logFile, logEntry);

      console.error(
        `${colors.info}📝 Error logged to: ${logFile}${colors.reset}`
      );
    } catch (logError) {
      const logErrorObject =
        logError instanceof Error ? logError : new Error(String(logError));
      console.error(
        `${colors.warning}⚠️  Could not log error details: ${logErrorObject.message}${colors.reset}`
      );
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    process.on('SIGINT', this.handleShutdownSignal.bind(this));
    process.on('SIGTERM', this.handleShutdownSignal.bind(this));
  }

  private handleShutdownSignal(): void {
    this.shutdown('interrupt');
  }

  /**
   * Shutdown watch mode gracefully
   */
  async shutdown(
    reason: 'timeout' | 'interrupt' | 'error' = 'interrupt'
  ): Promise<void> {
    const { orchestrator, display } = this.config;

    // Update state manager
    this.stateManager.shutdown(reason);

    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = undefined;
    }

    if (this.watchTimeout) {
      clearTimeout(this.watchTimeout);
      this.watchTimeout = undefined;
    }

    try {
      await orchestrator.stopWatchMode();
      await orchestrator.shutdown();
    } catch (error) {
      console.warn('Error during orchestrator shutdown:', error);
    }

    // Clean shutdown of display system
    display.shutdown();

    const reasonMessages = {
      timeout: '⏰ Watch mode stopped after 10 minutes of inactivity.',
      interrupt: '👋 Enhanced Code Quality Orchestrator watch stopped.',
      error: '💥 Watch mode stopped due to critical error.'
    };

    console.log(`\n\n${reasonMessages[reason]}`);

    this.emit('shutdown', reason);
    process.exit(reason === 'error' ? 1 : 0);
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
