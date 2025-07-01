/**
 * @fileoverview Tests for PreferencesManager - User Configuration Management
 *
 * Tests the complete preferences system including:
 * - Schema migration and validation
 * - User choice persistence
 * - Educational warning system
 * - Configuration-agnostic defaults
 * - File system operations
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { PreferencesManager } from "../../../services/preferences-manager.ts";

describe("PreferencesManager", () => {
  let testDirectory;
  let preferencesManager;
  let originalConsoleWarn;

  beforeEach(() => {
    // Create temporary directory for testing
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sidequest-test-"));

    // Mock console.warn to capture warnings
    originalConsoleWarn = console.warn;
    console.warn = () => {};

    // Reset singleton instance
    PreferencesManager.instance = undefined;

    preferencesManager = PreferencesManager.getInstance(testDirectory);
  });

  afterEach(() => {
    // Restore console.warn
    console.warn = originalConsoleWarn;

    // Clean up test directory
    if (fs.existsSync(testDirectory)) {
      fs.rmSync(testDirectory, { recursive: true, force: true });
    }

    // Reset singleton
    PreferencesManager.instance = undefined;
  });

  describe("Initialization and Defaults", () => {
    test("should create preferences directory if it does not exist", () => {
      expect(fs.existsSync(testDirectory)).toBe(true);
    });

    test("should load default preferences on first run", () => {
      const prefs = preferencesManager.getAllPreferences();

      expect(prefs.schemaVersion).toBe("1.0.0");
      expect(prefs.preferences.analysis.defaultMode).toBe("errors-only");
      expect(prefs.preferences.warnings.showTscEslintSeparationWarning).toBe(
        true,
      );
      expect(prefs.userChoices.hasCompletedFirstRun).toBe(false);
    });

    test("should use conservative defaults for analysis", () => {
      const analysisMode = preferencesManager.getAnalysisMode();
      const strictMode = preferencesManager.getStrictMode();

      expect(analysisMode).toBe("errors-only");
      expect(strictMode).toBe(false);
    });

    test("should default to auto color scheme", () => {
      const colorScheme = preferencesManager.getColorScheme();
      expect(colorScheme).toBe("auto");
    });
  });

  describe("File Persistence", () => {
    test("should save preferences to file", () => {
      const preferencesPath = path.join(testDirectory, "user-preferences.json");

      // Update a preference to trigger save
      preferencesManager.updatePreference("analysis", {
        defaultMode: "warnings-and-errors",
      });

      expect(fs.existsSync(preferencesPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
      expect(saved.preferences.analysis.defaultMode).toBe(
        "warnings-and-errors",
      );
    });

    test("should load existing preferences from file", () => {
      const preferencesPath = path.join(testDirectory, "user-preferences.json");

      // Create test preferences file
      const testPrefs = {
        schemaVersion: "1.0.0",
        preferences: {
          analysis: {
            defaultMode: "all",
            strictMode: true,
            includePatternChecking: true,
          },
          warnings: {
            showTscEslintSeparationWarning: false,
            showPerformanceWarnings: true,
            showConfigurationHints: true,
          },
          display: {
            colorScheme: "dark",
            verboseOutput: true,
            showProgressIndicators: false,
          },
          watch: {
            autoDetectConfigChanges: false,
            debounceMs: 1000,
            intervalMs: 5000,
          },
        },
        userChoices: {
          hasSeenTscEslintWarning: true,
          hasConfiguredSeparationOfConcerns: true,
          hasCompletedFirstRun: true,
          preferredEngine: "both-separate",
          lastConfigUpdate: "2023-01-01T00:00:00.000Z",
        },
      };

      fs.writeFileSync(preferencesPath, JSON.stringify(testPrefs, null, 2));

      // Create new instance to test loading
      PreferencesManager.instance = undefined;
      const newManager = PreferencesManager.getInstance(testDirectory);

      const loaded = newManager.getAllPreferences();
      expect(loaded.preferences.analysis.defaultMode).toBe("all");
      expect(loaded.preferences.display.colorScheme).toBe("dark");
      expect(loaded.userChoices.hasCompletedFirstRun).toBe(true);
    });

    test("should handle corrupted preferences file gracefully", () => {
      const preferencesPath = path.join(testDirectory, "user-preferences.json");

      // Write invalid JSON
      fs.writeFileSync(preferencesPath, "invalid json content");

      // Create new instance to test error handling
      PreferencesManager.instance = undefined;
      const newManager = PreferencesManager.getInstance(testDirectory);

      // Should fall back to defaults
      const prefs = newManager.getAllPreferences();
      expect(prefs.preferences.analysis.defaultMode).toBe("errors-only");
    });
  });

  describe("Schema Migration", () => {
    test("should migrate incomplete preferences with defaults", () => {
      const preferencesPath = path.join(testDirectory, "user-preferences.json");

      // Create incomplete preferences (missing some fields)
      const incompletePrefs = {
        schemaVersion: "1.0.0",
        preferences: {
          analysis: { defaultMode: "all" },
          // Missing other sections
        },
        userChoices: {
          hasCompletedFirstRun: true,
          // Missing other fields
        },
      };

      fs.writeFileSync(
        preferencesPath,
        JSON.stringify(incompletePrefs, null, 2),
      );

      // Create new instance to test migration
      PreferencesManager.instance = undefined;
      const newManager = PreferencesManager.getInstance(testDirectory);

      const migrated = newManager.getAllPreferences();

      // Should preserve existing values
      expect(migrated.preferences.analysis.defaultMode).toBe("all");
      expect(migrated.userChoices.hasCompletedFirstRun).toBe(true);

      // Should add missing defaults
      expect(migrated.preferences.analysis.strictMode).toBe(false);
      expect(migrated.preferences.warnings.showTscEslintSeparationWarning).toBe(
        true,
      );
      expect(migrated.userChoices.hasSeenTscEslintWarning).toBe(false);
    });
  });

  describe("User Choice Management", () => {
    test("should update user choices correctly", () => {
      preferencesManager.updateUserChoice("hasCompletedFirstRun", true);
      preferencesManager.updateUserChoice("preferredEngine", "both-separate");

      const prefs = preferencesManager.getAllPreferences();
      expect(prefs.userChoices.hasCompletedFirstRun).toBe(true);
      expect(prefs.userChoices.preferredEngine).toBe("both-separate");
      expect(prefs.userChoices.lastConfigUpdate).toBeTruthy();
    });

    test("should persist user choices across instances", () => {
      preferencesManager.updateUserChoice("hasSeenTscEslintWarning", true);

      // Create new instance
      PreferencesManager.instance = undefined;
      const newManager = PreferencesManager.getInstance(testDirectory);

      const prefs = newManager.getAllPreferences();
      expect(prefs.userChoices.hasSeenTscEslintWarning).toBe(true);
    });
  });

  describe("Educational Warning System", () => {
    test("should show TypeScript/ESLint separation warning by default", () => {
      expect(preferencesManager.shouldShowTscEslintWarning()).toBe(true);
    });

    test("should not show warning after user has seen it", () => {
      preferencesManager.updateUserChoice("hasSeenTscEslintWarning", true);
      expect(preferencesManager.shouldShowTscEslintWarning()).toBe(false);
    });

    test("should not show warning if disabled in preferences", () => {
      preferencesManager.updatePreference("warnings", {
        showTscEslintSeparationWarning: false,
      });
      expect(preferencesManager.shouldShowTscEslintWarning()).toBe(false);
    });

    test("should handle separation warning response correctly", async () => {
      const choice = await preferencesManager.showTscEslintSeparationWarning();

      expect(choice).toBe("both-separate");
      expect(preferencesManager.shouldShowTscEslintWarning()).toBe(false);

      const prefs = preferencesManager.getAllPreferences();
      expect(prefs.userChoices.hasSeenTscEslintWarning).toBe(true);
      expect(prefs.userChoices.preferredEngine).toBe("both-separate");
    });
  });

  describe("Preference Updates", () => {
    test("should update analysis preferences", () => {
      preferencesManager.updatePreference("analysis", {
        defaultMode: "warnings-and-errors",
        strictMode: true,
      });

      expect(preferencesManager.getAnalysisMode()).toBe("warnings-and-errors");
      expect(preferencesManager.getStrictMode()).toBe(true);
    });

    test("should update display preferences", () => {
      preferencesManager.updatePreference("display", {
        colorScheme: "dark",
        verboseOutput: true,
      });

      expect(preferencesManager.getColorScheme()).toBe("dark");

      const prefs = preferencesManager.getAllPreferences();
      expect(prefs.preferences.display.verboseOutput).toBe(true);
    });

    test("should update watch preferences", () => {
      preferencesManager.updatePreference("watch", {
        debounceMs: 1000,
        intervalMs: 5000,
      });

      const prefs = preferencesManager.getAllPreferences();
      expect(prefs.preferences.watch.debounceMs).toBe(1000);
      expect(prefs.preferences.watch.intervalMs).toBe(5000);
    });
  });

  describe("Custom Script Configuration", () => {
    test("should have default TypeScript script mappings", () => {
      const prefs = preferencesManager.getAllPreferences();
      const tsScripts = prefs.preferences.customTypeScriptScripts;

      expect(tsScripts?.enabled).toBe(true);
      expect(tsScripts?.defaultPreset).toBe("safe");
      expect(tsScripts?.presetMappings.safe).toContain("tsc:safe");
      expect(tsScripts?.scriptTimeout).toBe(60_000);
    });

    test("should have default ESLint script mappings", () => {
      const prefs = preferencesManager.getAllPreferences();
      const eslintScripts = prefs.preferences.customESLintScripts;

      expect(eslintScripts?.enabled).toBe(true);
      expect(eslintScripts?.defaultPreset).toBe("safe");
      expect(eslintScripts?.presetMappings.safe).toContain("lint:check");
      expect(eslintScripts?.failureHandling).toBe("warn");
    });

    test("should update custom script preferences", () => {
      preferencesManager.updatePreference("customTypeScriptScripts", {
        enabled: false,
        scriptTimeout: 30_000,
      });

      const prefs = preferencesManager.getAllPreferences();
      expect(prefs.preferences.customTypeScriptScripts?.enabled).toBe(false);
      expect(prefs.preferences.customTypeScriptScripts?.scriptTimeout).toBe(
        30_000,
      );
    });
  });

  describe("Configuration State Queries", () => {
    test("should detect separation of concerns configuration", () => {
      expect(preferencesManager.hasSeparationOfConcerns()).toBe(false);

      preferencesManager.updateUserChoice("preferredEngine", "both-separate");
      expect(preferencesManager.hasSeparationOfConcerns()).toBe(true);

      preferencesManager.updateUserChoice(
        "hasConfiguredSeparationOfConcerns",
        true,
      );
      expect(preferencesManager.hasSeparationOfConcerns()).toBe(true);
    });
  });

  describe("Reset and Cleanup", () => {
    test("should reset to defaults correctly", () => {
      // Make some changes
      preferencesManager.updatePreference("analysis", { defaultMode: "all" });
      preferencesManager.updateUserChoice("hasCompletedFirstRun", true);

      // Reset
      preferencesManager.resetToDefaults();

      const prefs = preferencesManager.getAllPreferences();
      expect(prefs.preferences.analysis.defaultMode).toBe("errors-only");
      expect(prefs.userChoices.hasCompletedFirstRun).toBe(false);
    });

    test("should preserve file after reset", () => {
      preferencesManager.resetToDefaults();

      const preferencesPath = path.join(testDirectory, "user-preferences.json");
      expect(fs.existsSync(preferencesPath)).toBe(true);
    });
  });

  describe("Singleton Pattern", () => {
    test("should return same instance for same directory", () => {
      const instance1 = PreferencesManager.getInstance(testDirectory);
      const instance2 = PreferencesManager.getInstance(testDirectory);

      expect(instance1).toBe(instance2);
    });

    test("should maintain state across getInstance calls", () => {
      const instance1 = PreferencesManager.getInstance(testDirectory);
      instance1.updateUserChoice("hasCompletedFirstRun", true);

      const instance2 = PreferencesManager.getInstance(testDirectory);
      const prefs = instance2.getAllPreferences();

      expect(prefs.userChoices.hasCompletedFirstRun).toBe(true);
    });
  });
});
