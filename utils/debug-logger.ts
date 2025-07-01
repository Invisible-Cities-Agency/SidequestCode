/**
 * @fileoverview Debug Logger Utility
 *
 * Provides conditional debug logging that can be enabled with --debug flag.
 * Logs are timestamped and categorized for better troubleshooting.
 */

interface DebugLogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  component: string;
  message: string;
  data?: any;
}

export class DebugLogger {
  private static isDebugEnabled = false;
  private static logs: DebugLogEntry[] = [];
  private static maxLogs = 1000; // Keep last 1000 debug entries

  /**
   * Enable debug mode globally
   */
  static enable(): void {
    this.isDebugEnabled = true;
    this.debug("DebugLogger", "Debug logging enabled");
  }

  /**
   * Disable debug mode
   */
  static disable(): void {
    this.isDebugEnabled = false;
  }

  /**
   * Check if debug mode is enabled
   */
  static get enabled(): boolean {
    return this.isDebugEnabled;
  }

  /**
   * Debug level logging (only shows when debug enabled)
   */
  static debug(component: string, message: string, data?: any): void {
    if (!this.isDebugEnabled) {
      return;
    }

    const entry = this.createLogEntry("debug", component, message, data);
    this.addLogEntry(entry);

    const timestamp = entry.timestamp.slice(11, 23); // Show only time with ms
    const prefix = `[${timestamp}] [DEBUG:${component}]`;

    if (data === undefined) {
      console.log(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`, data);
    }
  }

  /**
   * Info level logging (always shows)
   */
  static info(component: string, message: string, data?: any): void {
    const entry = this.createLogEntry("info", component, message, data);
    this.addLogEntry(entry);

    if (this.isDebugEnabled) {
      const timestamp = entry.timestamp.slice(11, 23);
      const prefix = `[${timestamp}] [INFO:${component}]`;

      if (data === undefined) {
        console.log(`${prefix} ${message}`);
      } else {
        console.log(`${prefix} ${message}`, data);
      }
    }
  }

  /**
   * Warning level logging (always shows)
   */
  static warn(component: string, message: string, data?: any): void {
    const entry = this.createLogEntry("warn", component, message, data);
    this.addLogEntry(entry);

    const timestamp = entry.timestamp.slice(11, 23);
    const prefix = `[${timestamp}] [WARN:${component}]`;

    if (data === undefined) {
      console.warn(`${prefix} ${message}`);
    } else {
      console.warn(`${prefix} ${message}`, data);
    }
  }

  /**
   * Error level logging (always shows)
   */
  static error(component: string, message: string, data?: any): void {
    const entry = this.createLogEntry("error", component, message, data);
    this.addLogEntry(entry);

    const timestamp = entry.timestamp.slice(11, 23);
    const prefix = `[${timestamp}] [ERROR:${component}]`;

    if (data === undefined) {
      console.error(`${prefix} ${message}`);
    } else {
      console.error(`${prefix} ${message}`, data);
    }
  }

  /**
   * Get all debug logs (useful for diagnostics)
   */
  static getLogs(): DebugLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs for a specific component
   */
  static getLogsForComponent(component: string): DebugLogEntry[] {
    return this.logs.filter((log) => log.component === component);
  }

  /**
   * Clear all logs
   */
  static clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs to string for debugging
   */
  static exportLogs(): string {
    return this.logs
      .map((log) => {
        const timestamp = log.timestamp.slice(11, 23);
        const dataString = log.data ? ` ${JSON.stringify(log.data)}` : "";
        return `[${timestamp}] [${log.level.toUpperCase()}:${log.component}] ${log.message}${dataString}`;
      })
      .join("\n");
  }

  /**
   * Write logs to file (for persistent debugging)
   */
  static async writeLogsToFile(filePath?: string): Promise<void> {
    try {
      const { writeFile } = await import("node:fs/promises");
      // eslint-disable-next-line unicorn/import-style
      const pathModule = await import("node:path");
      const path = pathModule.default;

      const logDirectory = path.join(process.cwd(), ".sidequest-logs");
      const logFile =
        filePath ||
        path.join(
          logDirectory,
          `debug-${new Date().toISOString().split("T")[0]}.log`,
        );

      // Ensure directory exists
      const { existsSync, mkdirSync } = await import("node:fs");
      if (!existsSync(logDirectory)) {
        mkdirSync(logDirectory, { recursive: true });
      }

      const logContent = `# SideQuest Debug Log - ${new Date().toISOString()}\n\n${this.exportLogs()}`;
      await writeFile(logFile, logContent);

      if (this.isDebugEnabled) {
        console.log(`[DebugLogger] Logs written to: ${logFile}`);
      }
    } catch (error) {
      console.error("[DebugLogger] Failed to write logs to file:", error);
    }
  }

  /**
   * Create a log entry with timestamp
   */
  private static createLogEntry(
    level: DebugLogEntry["level"],
    component: string,
    message: string,
    data?: any,
  ): DebugLogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      data,
    };
  }

  /**
   * Add log entry and manage log rotation
   */
  private static addLogEntry(entry: DebugLogEntry): void {
    this.logs.push(entry);

    // Rotate logs if we exceed max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }
}

/**
 * Convenience function for debug logging
 */
export function debugLog(component: string, message: string, data?: any): void {
  DebugLogger.debug(component, message, data);
}

/**
 * Convenience function for info logging
 */
export function infoLog(component: string, message: string, data?: any): void {
  DebugLogger.info(component, message, data);
}

/**
 * Convenience function for warn logging
 */
export function warnLog(component: string, message: string, data?: any): void {
  DebugLogger.warn(component, message, data);
}

/**
 * Convenience function for error logging
 */
export function errorLog(component: string, message: string, data?: any): void {
  DebugLogger.error(component, message, data);
}
