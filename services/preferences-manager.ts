/**
 * @fileoverview User Preferences Manager - Configuration-Agnostic User Settings
 *
 * Manages persistent user preferences and educational prompts for the Code Quality Orchestrator.
 * This system respects user choices while providing gentle guidance toward best practices.
 *
 * Key Features:
 * - Singleton pattern for consistent preferences across sessions
 * - Schema migration for forward compatibility
 * - Educational warnings (TypeScript/ESLint separation) with user control
 * - Configuration-agnostic defaults that don't impose opinions
 * - Project-scoped or global preference storage options
 *
 * Architecture:
 * The preferences system operates on three levels:
 * 1. **Default Preferences**: Conservative, non-opinionated defaults
 * 2. **User Overrides**: Saved choices that persist across sessions
 * 3. **Runtime Configuration**: CLI flags that override preferences
 *
 * Educational Philosophy:
 * - Suggest best practices but never force them
 * - One-time educational prompts with "don't show again" options
 * - Respect user expertise level and preference for guidance
 *
 * @example Basic Usage
 * ```typescript
 * const prefs = PreferencesManager.getInstance('./project-data');
 *
 * // Check if user wants separation guidance
 * if (prefs.shouldShowTscEslintWarning()) {
 *   const choice = await prefs.showTscEslintSeparationWarning();
 *   console.log('User chose:', choice);
 * }
 *
 * // Get user's analysis preferences
 * const mode = prefs.getAnalysisMode(); // 'errors-only' | 'warnings-and-errors' | 'all'
 * const colors = prefs.getColorScheme(); // 'auto' | 'light' | 'dark'
 * ```
 *
 * @example Configuration Management
 * ```typescript
 * // Update specific preference section
 * prefs.updatePreference('display', {
 *   colorScheme: 'dark',
 *   verboseOutput: true
 * });
 *
 * // Reset everything to defaults
 * prefs.resetToDefaults();
 *
 * // Get full config for debugging
 * const allPrefs = prefs.getAllPreferences();
 * ```
 *
 * @author SideQuest
 * @version 1.0.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Complete user preferences schema with comprehensive settings
 *
 * This interface defines all configurable aspects of the tool behavior.
 * Each section has a specific purpose in the configuration-agnostic design.
 */
interface UserPreferences {
  schemaVersion: string;
  preferences: {
    analysis: {
      defaultMode: 'errors-only' | 'warnings-and-errors' | 'all';
      strictMode: boolean;
      includePatternChecking: boolean;
    };
    warnings: {
      showTscEslintSeparationWarning: boolean;
      showPerformanceWarnings: boolean;
      showConfigurationHints: boolean;
    };
    display: {
      colorScheme: 'auto' | 'light' | 'dark';
      verboseOutput: boolean;
      showProgressIndicators: boolean;
    };
    watch: {
      autoDetectConfigChanges: boolean;
      debounceMs: number;
      intervalMs: number;
    };
  };
  userChoices: {
    hasSeenTscEslintWarning: boolean;
    hasConfiguredSeparationOfConcerns: boolean;
    hasCompletedFirstRun: boolean;
    preferredEngine: 'typescript-only' | 'eslint-only' | 'both-separate' | 'both-mixed';
    lastConfigUpdate: string | null;
  };
}

export class PreferencesManager {
  private static instance: PreferencesManager;
  private preferencesPath: string;
  private preferences: UserPreferences;

  private constructor(dataDirectory?: string) {
    // Store preferences in user's data directory or project-specific location
    const baseDirectory = dataDirectory || path.join(os.homedir(), '.sidequest-cqo');
    this.preferencesPath = path.join(baseDirectory, 'user-preferences.json');

    // Ensure directory exists
    if (!fs.existsSync(baseDirectory)) {
      fs.mkdirSync(baseDirectory, { recursive: true });
    }

    this.preferences = this.loadPreferences();
  }

  public static getInstance(dataDirectory?: string): PreferencesManager {
    if (!PreferencesManager.instance) {
      PreferencesManager.instance = new PreferencesManager(dataDirectory);
    }
    return PreferencesManager.instance;
  }

  /**
   * Load preferences from file or create defaults
   */
  private loadPreferences(): UserPreferences {
    try {
      if (fs.existsSync(this.preferencesPath)) {
        const content = fs.readFileSync(this.preferencesPath, 'utf8');
        const loaded = JSON.parse(content) as UserPreferences;

        // Validate and migrate if needed
        return this.migratePreferences(loaded);
      }
    } catch (error) {
      console.warn(`[Preferences] Could not load preferences: ${error}`);
    }

    // Return defaults
    return this.getDefaultPreferences();
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      schemaVersion: '1.0.0',
      preferences: {
        analysis: {
          defaultMode: 'errors-only', // Conservative default
          strictMode: false,
          includePatternChecking: false
        },
        warnings: {
          showTscEslintSeparationWarning: true, // Important best practice
          showPerformanceWarnings: true,
          showConfigurationHints: true
        },
        display: {
          colorScheme: 'auto',
          verboseOutput: false,
          showProgressIndicators: true
        },
        watch: {
          autoDetectConfigChanges: true,
          debounceMs: 500,
          intervalMs: 3000
        }
      },
      userChoices: {
        hasSeenTscEslintWarning: false,
        hasConfiguredSeparationOfConcerns: false,
        hasCompletedFirstRun: false,
        preferredEngine: 'typescript-only', // Safe default
        lastConfigUpdate: null
      }
    };
  }

  /**
   * Migrate preferences between schema versions
   */
  private migratePreferences(loaded: any): UserPreferences {
    // For now, just ensure all required fields exist
    const defaults = this.getDefaultPreferences();

    return {
      ...defaults,
      ...loaded,
      preferences: {
        ...defaults.preferences,
        ...loaded.preferences,
        analysis: {
          ...defaults.preferences.analysis,
          ...loaded.preferences?.analysis
        },
        warnings: {
          ...defaults.preferences.warnings,
          ...loaded.preferences?.warnings
        },
        display: {
          ...defaults.preferences.display,
          ...loaded.preferences?.display
        },
        watch: {
          ...defaults.preferences.watch,
          ...loaded.preferences?.watch
        }
      },
      userChoices: {
        ...defaults.userChoices,
        ...loaded.userChoices
      }
    };
  }

  /**
   * Save preferences to file
   */
  private savePreferences(): void {
    try {
      this.preferences.userChoices.lastConfigUpdate = new Date().toISOString();
      const content = JSON.stringify(this.preferences, undefined, 2);
      fs.writeFileSync(this.preferencesPath, content, 'utf8');
    } catch (error) {
      console.warn(`[Preferences] Could not save preferences: ${error}`);
    }
  }

  /**
   * Check if user should see TypeScript/ESLint separation warning
   */
  public shouldShowTscEslintWarning(): boolean {
    return this.preferences.preferences.warnings.showTscEslintSeparationWarning &&
           !this.preferences.userChoices.hasSeenTscEslintWarning;
  }

  /**
   * Show TypeScript/ESLint separation warning and get user choice
   */
  public showTscEslintSeparationWarning(): Promise<'typescript-only' | 'both-separate' | 'both-mixed' | 'disable-warning'> {
    console.log(`
🔧 Configuration Best Practice Recommendation

We detected that you're using both TypeScript compilation checking and ESLint.
For optimal performance and clarity, we recommend:

  ✅ TypeScript: Type safety, compilation errors (tsc --noEmit)
  ✅ ESLint: Code style, best practices, custom rules

This separation avoids:
  ❌ Duplicate rule execution
  ❌ Conflicting error messages  
  ❌ Performance overhead
  ❌ Configuration complexity

How would you like to proceed?

1) TypeScript only (recommended for type safety focus)
2) Both tools with separation of concerns (recommended for full analysis)
3) Both tools mixed (current setup, may have overlap)
4) Don't show this warning again

Your choice will be saved and can be changed in preferences.
`);

    // In a real implementation, this would use a proper prompt library
    // For now, we'll simulate the choice
    const choice = 'both-separate' as 'both-separate' | 'disable-warning'; // Default safe choice

    this.preferences.userChoices.hasSeenTscEslintWarning = true;
    this.preferences.userChoices.preferredEngine = choice === 'disable-warning' ? 'both-mixed' : choice;

    if (choice === 'disable-warning') {
      this.preferences.preferences.warnings.showTscEslintSeparationWarning = false;
    }

    this.savePreferences();
    return Promise.resolve(choice);
  }

  /**
   * Get user's preferred analysis mode
   */
  public getAnalysisMode(): 'errors-only' | 'warnings-and-errors' | 'all' {
    return this.preferences.preferences.analysis.defaultMode;
  }

  /**
   * Get user's strict mode preference
   */
  public getStrictMode(): boolean {
    return this.preferences.preferences.analysis.strictMode;
  }

  /**
   * Get user's color scheme preference
   */
  public getColorScheme(): 'auto' | 'light' | 'dark' {
    return this.preferences.preferences.display.colorScheme;
  }

  /**
   * Update user preference
   */
  public updatePreference<K extends keyof UserPreferences['preferences']>(
    section: K,
    updates: Partial<UserPreferences['preferences'][K]>
  ): void {
    this.preferences.preferences[section] = {
      ...this.preferences.preferences[section],
      ...updates
    };
    this.savePreferences();
  }

  /**
   * Get all preferences (for debugging/config display)
   */
  public getAllPreferences(): UserPreferences {
    return { ...this.preferences };
  }

  /**
   * Reset preferences to defaults
   */
  public resetToDefaults(): void {
    this.preferences = this.getDefaultPreferences();
    this.savePreferences();
  }

  /**
   * Update user choice/state
   */
  public updateUserChoice<K extends keyof UserPreferences['userChoices']>(
    key: K,
    value: UserPreferences['userChoices'][K]
  ): void {
    this.preferences.userChoices[key] = value;
    this.savePreferences();
  }

  /**
   * Check if user has configured separation of concerns
   */
  public hasSeparationOfConcerns(): boolean {
    return this.preferences.userChoices.hasConfiguredSeparationOfConcerns ||
           this.preferences.userChoices.preferredEngine === 'both-separate';
  }
}
