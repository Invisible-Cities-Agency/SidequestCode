/**
 * Watch State Manager
 * Manages watch mode state transitions and coordinates between analysis and display
 * Prevents race conditions by enforcing explicit state machine
 */

import { EventEmitter } from "node:events";

export type WatchPhase =
  | "initializing" // Setting up services
  | "analyzing" // Running analysis (blocks display updates)
  | "ready" // Analysis complete, ready for display
  | "running" // Normal watch cycle
  | "paused" // Temporarily paused
  | "error" // Error state
  | "shutdown"; // Shutting down

export interface WatchStateData {
  phase: WatchPhase;
  checksCount: number;
  sessionId: string | null;
  sessionStart: number;
  lastAnalysisTime: number;
  lastError: Error | null;
  analysisInProgress: boolean;
  metadata: {
    cwd: string;
    nodeVersion: string;
    platform: string;
    flags: Record<string, unknown>;
  };
}

export interface StateTransition {
  from: WatchPhase;
  to: WatchPhase;
  timestamp: number;
  reason?: string | undefined;
}

/**
 * State machine for watch mode lifecycle
 * Enforces valid transitions and prevents race conditions
 */
export class WatchStateManager extends EventEmitter {
  private state: WatchStateData;
  private transitionHistory: StateTransition[] = [];

  // Valid state transitions
  private readonly validTransitions: Map<WatchPhase, WatchPhase[]> = new Map([
    ["initializing", ["analyzing", "error", "shutdown"]],
    ["analyzing", ["ready", "error", "shutdown"]],
    ["ready", ["running", "analyzing", "paused", "error", "shutdown"]],
    ["running", ["analyzing", "paused", "error", "shutdown"]],
    ["paused", ["running", "analyzing", "error", "shutdown"]],
    ["error", ["running", "analyzing", "shutdown"]],
    ["shutdown", []], // Terminal state
  ]);

  constructor(
    sessionId: string | null = null,
    metadata: Partial<WatchStateData["metadata"]> = {},
  ) {
    super();

    this.state = {
      phase: "initializing",
      checksCount: 0,
      sessionId,
      sessionStart: Date.now(),
      lastAnalysisTime: 0,
      lastError: null,
      analysisInProgress: false,
      metadata: {
        cwd: process.cwd(),
        nodeVersion: process.version,
        platform: process.platform,
        flags: {},
        ...metadata,
      },
    };
  }

  /**
   * Transition to a new phase with validation
   */
  transition(toPhase: WatchPhase, reason?: string): boolean {
    const fromPhase = this.state.phase;

    // Check if transition is valid
    const validNextPhases = this.validTransitions.get(fromPhase) || [];
    if (!validNextPhases.includes(toPhase)) {
      this.emit("invalidTransition", { from: fromPhase, to: toPhase, reason });
      return false;
    }

    // Record transition
    const transition: StateTransition = {
      from: fromPhase,
      to: toPhase,
      timestamp: Date.now(),
      reason,
    };

    // Update state
    this.state.phase = toPhase;
    this.transitionHistory.push(transition);

    // Handle phase-specific logic
    this.handlePhaseTransition(transition);

    // Emit events
    this.emit("stateChange", transition);
    this.emit(`enter:${toPhase}`, this.state);

    if (fromPhase !== toPhase) {
      this.emit(`exit:${fromPhase}`, this.state);
    }

    return true;
  }

  /**
   * Handle phase-specific logic
   */
  private handlePhaseTransition(transition: StateTransition): void {
    const { to } = transition;

    switch (to) {
      case "analyzing":
        this.state.analysisInProgress = true;
        this.state.lastAnalysisTime = Date.now();
        break;

      case "ready":
      case "running":
        this.state.analysisInProgress = false;
        break;

      case "error":
        this.state.analysisInProgress = false;
        break;

      case "shutdown":
        this.state.analysisInProgress = false;
        break;
    }
  }

  /**
   * Start analysis cycle (only if allowed)
   */
  startAnalysis(): boolean {
    if (!this.canStartAnalysis()) {
      return false;
    }

    return this.transition("analyzing", "analysis_cycle_start");
  }

  /**
   * Complete analysis cycle
   */
  completeAnalysis(): boolean {
    if (this.state.phase !== "analyzing") {
      return false;
    }

    this.state.checksCount++;

    // Transition to ready if this is first analysis, otherwise back to running
    const nextPhase = this.state.checksCount === 1 ? "ready" : "running";
    return this.transition(nextPhase, "analysis_cycle_complete");
  }

  /**
   * Handle analysis error
   */
  handleAnalysisError(error: Error): boolean {
    this.state.lastError = error;
    return this.transition("error", `analysis_error: ${error.message}`);
  }

  /**
   * Recover from error state
   */
  recover(): boolean {
    if (this.state.phase !== "error") {
      return false;
    }

    return this.transition("running", "error_recovery");
  }

  /**
   * Pause watch mode
   */
  pause(): boolean {
    if (!["running", "ready"].includes(this.state.phase)) {
      return false;
    }

    return this.transition("paused", "user_pause");
  }

  /**
   * Resume from pause
   */
  resume(): boolean {
    if (this.state.phase !== "paused") {
      return false;
    }

    return this.transition("running", "user_resume");
  }

  /**
   * Shutdown (terminal state)
   */
  shutdown(reason?: string): boolean {
    return this.transition("shutdown", reason || "user_shutdown");
  }

  /**
   * Check if analysis can be started
   */
  canStartAnalysis(): boolean {
    return (
      ["ready", "running"].includes(this.state.phase) &&
      !this.state.analysisInProgress
    );
  }

  /**
   * Check if display updates are allowed
   */
  canUpdateDisplay(): boolean {
    return (
      ["ready", "running"].includes(this.state.phase) &&
      !this.state.analysisInProgress
    );
  }

  /**
   * Check if watch mode is active
   */
  isActive(): boolean {
    return !["shutdown", "error"].includes(this.state.phase);
  }

  /**
   * Check if currently analyzing
   */
  isAnalyzing(): boolean {
    return this.state.analysisInProgress;
  }

  /**
   * Get current state (read-only)
   */
  getState(): Readonly<WatchStateData> {
    return { ...this.state };
  }

  /**
   * Get current phase
   */
  getPhase(): WatchPhase {
    return this.state.phase;
  }

  /**
   * Get checks count
   */
  getChecksCount(): number {
    return this.state.checksCount;
  }

  /**
   * Update session ID
   */
  setSessionId(sessionId: string): void {
    this.state.sessionId = sessionId;
  }

  /**
   * Get transition history
   */
  getTransitionHistory(): readonly StateTransition[] {
    return [...this.transitionHistory];
  }

  /**
   * Get state summary for debugging
   */
  getStateSummary(): string {
    const { phase, checksCount, analysisInProgress, lastError } = this.state;
    const uptime = Date.now() - this.state.sessionStart;

    return [
      `Phase: ${phase}`,
      `Checks: ${checksCount}`,
      `Analyzing: ${analysisInProgress}`,
      `Uptime: ${Math.floor(uptime / 1000)}s`,
      lastError ? `Last Error: ${lastError.message}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  /**
   * Validate current state integrity
   */
  validateState(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const { phase, analysisInProgress, checksCount } = this.state;

    // Check analysis flag consistency
    if (phase === "analyzing" && !analysisInProgress) {
      issues.push("Phase is analyzing but analysisInProgress is false");
    }

    if (phase !== "analyzing" && analysisInProgress) {
      issues.push("analysisInProgress is true but phase is not analyzing");
    }

    // Check checks count
    if (checksCount < 0) {
      issues.push("checksCount cannot be negative");
    }

    // Check session timing
    if (this.state.lastAnalysisTime > Date.now()) {
      issues.push("lastAnalysisTime is in the future");
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
