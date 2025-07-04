/**
 * Session Manager for Watch Mode Persistence
 * Handles session state, recovery, and resumption capabilities
 */

import { writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import type { ViolationSummary } from "../shared/types.js";

export interface WatchSession {
  id: string;
  startTime: number;
  lastUpdate: number;
  checksCount: number;
  baseline: ViolationSummary | undefined;
  current: ViolationSummary;
  viewMode: "dashboard" | "tidy" | "burndown";
  errors: SessionError[];
  metadata: {
    cwd: string;
    nodeVersion: string;
    platform: string;
    flags: Record<string, unknown>;
  };
}

export interface SessionError {
  timestamp: number;
  error: string;
  stack: string | undefined;
  checksCount: number;
  context: Record<string, unknown> | undefined;
}

export class SessionManager {
  private sessionFile: string;
  private currentSession: WatchSession | undefined = undefined;

  constructor(dataDirectory: string = "./data") {
    this.sessionFile = path.join(dataDirectory, "watch-session.json");
  }

  /**
   * Create a new watch session
   */
  async createSession(flags: Record<string, unknown>): Promise<WatchSession> {
    const sessionId = `watch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.currentSession = {
      id: sessionId,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      checksCount: 0,
      baseline: undefined,
      current: { total: 0, bySource: {}, byCategory: {} },
      viewMode: "dashboard",
      errors: [],
      metadata: {
        cwd: process.cwd(),
        nodeVersion: process.version,
        platform: process.platform,
        flags,
      },
    };

    await this.saveSession();
    return this.currentSession;
  }

  /**
   * Load existing session from disk
   */
  async loadSession(): Promise<WatchSession | undefined> {
    try {
      await access(this.sessionFile);
      const content = await readFile(this.sessionFile, "utf8");
      const session = JSON.parse(content) as WatchSession;

      // Validate session is recent (within 24 hours)
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (Date.now() - session.lastUpdate > maxAge) {
        console.log("⏰ Previous session too old, starting fresh...");
        return undefined;
      }

      this.currentSession = session;
      return session;
    } catch {
      return undefined; // No session file or invalid format
    }
  }

  /**
   * Update current session state
   */
  async updateSession(updates: Partial<WatchSession>): Promise<void> {
    if (!this.currentSession) {
      throw new Error("No active session to update");
    }

    Object.assign(this.currentSession, updates, {
      lastUpdate: Date.now(),
    });

    await this.saveSession();
  }

  /**
   * Log an error to the current session
   */
  async logError(
    error: Error,
    checksCount: number,
    context?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.currentSession) {
      return; // No session to log to
    }

    const sessionError: SessionError = {
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack,
      checksCount,
      context,
    };

    this.currentSession.errors.push(sessionError);

    // Keep only last 10 errors to prevent file bloat
    if (this.currentSession.errors.length > 10) {
      this.currentSession.errors = this.currentSession.errors.slice(-10);
    }

    await this.saveSession();
  }

  /**
   * Get current session
   */
  getCurrentSession(): WatchSession | undefined {
    return this.currentSession;
  }

  /**
   * Clear current session
   */
  async clearSession(): Promise<void> {
    this.currentSession = undefined;
    try {
      const { existsSync, unlinkSync } = await import("node:fs");
      if (existsSync(this.sessionFile)) {
        unlinkSync(this.sessionFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Get session statistics for display
   */
  getSessionStats():
    | {
        duration: number;
        checksCount: number;
        errorCount: number;
        lastError: SessionError | undefined;
        progressMade: boolean;
      }
    | undefined {
    if (!this.currentSession) {
      return undefined;
    }

    const duration = Date.now() - this.currentSession.startTime;
    const progressMade =
      this.currentSession.baseline &&
      this.currentSession.current.total < this.currentSession.baseline.total;

    return {
      duration,
      checksCount: this.currentSession.checksCount,
      errorCount: this.currentSession.errors.length,
      lastError: this.currentSession.errors.at(-1),
      progressMade: !!progressMade,
    };
  }

  /**
   * Check if session can be resumed safely
   */
  canResumeSession(
    session: WatchSession,
    currentFlags: Record<string, unknown>,
  ): boolean {
    // Check if critical flags match
    const criticalFlags = ["targetPath", "strict", "eslintOnly"];
    for (const flag of criticalFlags) {
      if (session.metadata.flags[flag] !== currentFlags[flag]) {
        return false;
      }
    }

    // Check if working directory matches
    if (session.metadata.cwd !== process.cwd()) {
      return false;
    }

    // Check if there are too many recent errors
    const recentErrors = session.errors.filter(
      (error) => Date.now() - error.timestamp < 5 * 60 * 1000, // 5 minutes
    );
    if (recentErrors.length > 3) {
      return false; // Too many recent errors, might be unstable
    }

    return true;
  }

  /**
   * Save session to disk
   */
  private async saveSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      const { existsSync, mkdirSync } = await import("node:fs");
      // eslint-disable-next-line unicorn/import-style
      const pathModule = await import("node:path");
      const path = pathModule.default;

      // Ensure directory exists
      const directory = path.dirname(this.sessionFile);
      if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true });
      }

      const content = JSON.stringify(this.currentSession, undefined, 2);
      await writeFile(this.sessionFile, content, "utf8");
    } catch (error) {
      const errorObject =
        error instanceof Error ? error : new Error(String(error));
      console.warn("⚠️  Failed to save session state:", errorObject.message);
    }
  }
}
