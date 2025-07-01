/**
 * @fileoverview Interactive First-Run Setup
 *
 * Provides a friendly onboarding experience for new users to configure
 * their preferences and understand best practices.
 */

import * as fs from 'node:fs';
import { PreferencesManager } from './preferences-manager.js';

interface SetupChoices {
  analysisMode: 'errors-only' | 'warnings-and-errors' | 'all';
  toolSeparation: 'typescript-only' | 'both-separate' | 'both-mixed';
  colorScheme: 'auto' | 'light' | 'dark';
  verboseOutput: boolean;
  enableWarnings: boolean;
}

export class InteractiveSetup {
  private colors: any;
  private prefs: PreferencesManager;

  constructor(colors: any, dataDirectory?: string) {
    this.colors = colors;
    this.prefs = PreferencesManager.getInstance(dataDirectory);
  }

  /**
   * Check if user needs first-run setup
   */
  public needsSetup(): boolean {
    const allPrefs = this.prefs.getAllPreferences();
    return !allPrefs.userChoices.hasCompletedFirstRun;
  }

  /**
   * Run interactive first-time setup
   */
  public runSetup(): void {
    console.log(`
${this.colors.bold}${this.colors.header}🚀 Welcome to SideQuest Code Quality Orchestrator!${this.colors.reset}

Let's configure your preferences for the best experience.
This will only take a minute and can be changed anytime with ${this.colors.info}--config${this.colors.reset}.

${this.colors.secondary}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${this.colors.reset}
`);

    const choices: SetupChoices = {
      analysisMode: this.askAnalysisMode(),
      toolSeparation: this.askToolSeparation(),
      colorScheme: this.askColorScheme(),
      verboseOutput: this.askVerboseOutput(),
      enableWarnings: this.askWarnings()
    };

    this.applyChoices(choices);
    this.showSetupComplete(choices);
  }

  /**
   * Ask about analysis mode preference
   */
  private askAnalysisMode(): 'errors-only' | 'warnings-and-errors' | 'all' {
    console.log(`${this.colors.warning}📊 Analysis Scope${this.colors.reset}

How comprehensive should the default analysis be?

${this.colors.success}1) Errors only${this.colors.reset} ${this.colors.secondary}(recommended)${this.colors.reset}
   Focus on compilation errors and critical issues
   ✅ Fast, focused results
   ✅ Good for daily development

${this.colors.info}2) Warnings and errors${this.colors.reset}
   Include warnings alongside errors
   ✅ More thorough analysis
   ⚠️  More output to review

${this.colors.muted}3) Everything${this.colors.reset}
   Include all violations (errors, warnings, info)
   ✅ Complete analysis
   ⚠️  Can be verbose
`);

    // Simulate user input (in real implementation, use readline or similar)
    const choice = this.simulateUserChoice(['1', '2', '3'], '1');

    switch (choice) {
    case '1': {
      return 'errors-only';
    }
    case '2': {
      return 'warnings-and-errors';
    }
    case '3': {
      return 'all';
    }
    default: {
      return 'errors-only';
    }
    }
  }

  /**
   * Ask about TypeScript/ESLint separation
   */
  private askToolSeparation():
    | 'typescript-only'
    | 'both-separate'
    | 'both-mixed' {
    console.log(`
${this.colors.warning}🔧 Tool Configuration${this.colors.reset}

How would you like to handle TypeScript and ESLint?

${this.colors.success}1) TypeScript only${this.colors.reset} ${this.colors.secondary}(recommended for TypeScript focus)${this.colors.reset}
   Use TypeScript compiler for type checking
   ✅ Fast, focused on compilation errors
   ✅ No rule overlap or conflicts

${this.colors.info}2) Both tools, separate concerns${this.colors.reset} ${this.colors.secondary}(recommended for full analysis)${this.colors.reset}
   TypeScript: Type safety and compilation
   ESLint: Code style and best practices
   ✅ Best of both worlds
   ✅ Clear separation of responsibilities

${this.colors.muted}3) Both tools, mixed${this.colors.reset}
   Use both with potential overlap
   ⚠️  May have duplicate or conflicting rules
   ⚠️  Performance impact
`);

    const choice = this.simulateUserChoice(['1', '2', '3'], '2');

    switch (choice) {
    case '1': {
      return 'typescript-only';
    }
    case '2': {
      return 'both-separate';
    }
    case '3': {
      return 'both-mixed';
    }
    default: {
      return 'both-separate';
    }
    }
  }

  /**
   * Ask about color scheme preference
   */
  private askColorScheme(): 'auto' | 'light' | 'dark' {
    console.log(`
${this.colors.warning}🎨 Terminal Colors${this.colors.reset}

What's your terminal color preference?

${this.colors.success}1) Auto-detect${this.colors.reset} ${this.colors.secondary}(recommended)${this.colors.reset}
   Automatically detect your terminal's background
   ✅ Works with most terminals
   ✅ Adapts to theme changes

${this.colors.info}2) Light theme${this.colors.reset}
   Optimized for light backgrounds (Novel, Man Page)
   ✅ High contrast on white/light backgrounds

${this.colors.info}3) Dark theme${this.colors.reset}
   Optimized for dark backgrounds (Terminal Pro)
   ✅ High contrast on black/dark backgrounds
`);

    const choice = this.simulateUserChoice(['1', '2', '3'], '1');

    switch (choice) {
    case '1': {
      return 'auto';
    }
    case '2': {
      return 'light';
    }
    case '3': {
      return 'dark';
    }
    default: {
      return 'auto';
    }
    }
  }

  /**
   * Ask about verbose output preference
   */
  private askVerboseOutput(): boolean {
    console.log(`
${this.colors.warning}📝 Output Detail${this.colors.reset}

How detailed should the output be by default?

${this.colors.success}1) Concise${this.colors.reset} ${this.colors.secondary}(recommended)${this.colors.reset}
   Show summary and key violations
   ✅ Easy to scan and understand
   ✅ Good for daily use

${this.colors.info}2) Verbose${this.colors.reset}
   Show detailed JSON output
   ✅ Complete information
   ✅ Good for debugging
`);

    const choice = this.simulateUserChoice(['1', '2'], '1');
    return choice === '2';
  }

  /**
   * Ask about warnings and hints
   */
  private askWarnings(): boolean {
    console.log(`
${this.colors.warning}💡 Helpful Hints${this.colors.reset}

Would you like to see helpful warnings and configuration hints?

${this.colors.success}1) Yes${this.colors.reset} ${this.colors.secondary}(recommended)${this.colors.reset}
   Show performance tips, best practices, and configuration hints
   ✅ Learn optimization techniques
   ✅ Get guidance on best practices
   ℹ️  Can be disabled later

${this.colors.muted}2) No${this.colors.reset}
   Minimal output, no educational content
   ✅ Clean, quiet operation
`);

    const choice = this.simulateUserChoice(['1', '2'], '1');
    return choice === '1';
  }

  /**
   * Apply user choices to preferences
   */
  private applyChoices(choices: SetupChoices): void {
    // Update analysis preferences
    this.prefs.updatePreference('analysis', {
      defaultMode: choices.analysisMode,
      includePatternChecking: choices.analysisMode === 'all'
    });

    // Update display preferences
    this.prefs.updatePreference('display', {
      colorScheme: choices.colorScheme,
      verboseOutput: choices.verboseOutput
    });

    // Update warning preferences
    this.prefs.updatePreference('warnings', {
      showTscEslintSeparationWarning:
        choices.enableWarnings && choices.toolSeparation === 'both-mixed',
      showPerformanceWarnings: choices.enableWarnings,
      showConfigurationHints: choices.enableWarnings
    });

    // Mark setup as complete and store tool preference
    this.prefs.updateUserChoice('hasCompletedFirstRun', true);
    this.prefs.updateUserChoice('preferredEngine', choices.toolSeparation);
    this.prefs.updateUserChoice(
      'hasConfiguredSeparationOfConcerns',
      choices.toolSeparation !== 'both-mixed'
    );
  }

  /**
   * Show setup completion message
   */
  private showSetupComplete(choices: SetupChoices): void {
    console.log(`
${this.colors.bold}${this.colors.success}✅ Setup Complete!${this.colors.reset}

Your preferences have been saved:

${this.colors.info}📊 Analysis:${this.colors.reset} ${choices.analysisMode}
${this.colors.info}🔧 Tools:${this.colors.reset} ${choices.toolSeparation}
${this.colors.info}🎨 Colors:${this.colors.reset} ${choices.colorScheme}
${this.colors.info}📝 Output:${this.colors.reset} ${choices.verboseOutput ? 'verbose' : 'concise'}
${this.colors.info}💡 Hints:${this.colors.reset} ${choices.enableWarnings ? 'enabled' : 'disabled'}

${this.colors.secondary}You can change these anytime with:${this.colors.reset}
  ${this.colors.info}sidequest --config${this.colors.reset}     Show current settings
  ${this.colors.info}sidequest --config edit${this.colors.reset} Edit preferences
  ${this.colors.info}sidequest --config reset${this.colors.reset} Reset to defaults

${this.colors.secondary}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${this.colors.reset}

${this.colors.bold}Ready to analyze your code!${this.colors.reset}

${this.colors.success}Next steps:${this.colors.reset}
  ${this.colors.info}npm run sidequest:start${this.colors.reset}        # Start real-time monitoring
  ${this.colors.info}npm run sidequest:report${this.colors.reset}       # One-time analysis (JSON)
  ${this.colors.info}npm run sidequest:config${this.colors.reset}       # View/edit these settings

${this.colors.warning}Setup is now complete!${this.colors.reset} Future runs will skip this step.
`);
  }

  /**
   * Simulate user choice (in real implementation, use readline)
   */
  private simulateUserChoice(
    _options: string[],
    defaultChoice: string
  ): string {
    // In a real implementation, this would use readline to get user input
    // For now, return the default choice
    console.log(
      `${this.colors.secondary}[Simulating choice: ${defaultChoice}]${this.colors.reset}\n`
    );
    return defaultChoice;
  }

  /**
   * Check if this is a first run and should show setup
   *
   * Smart detection that checks:
   * 1. User preferences exist and show setup completion
   * 2. Database directory exists (indicates previous usage)
   */
  public static shouldRunSetup(dataDirectory?: string): boolean {
    try {
      // Check user preferences first
      const prefs = PreferencesManager.getInstance(dataDirectory);
      const allPrefs = prefs.getAllPreferences();

      // If user explicitly completed setup, don't run again
      if (allPrefs.userChoices.hasCompletedFirstRun) {
        return false;
      }

      // Check if database directory exists (indicates previous usage)
      const databaseDirectory = dataDirectory || './data';
      if (fs.existsSync(databaseDirectory)) {
        // Database exists but no preferences - probably corrupted preferences
        // Skip setup to avoid annoying existing users
        return false;
      }

      // Truly first run - no preferences and no database
      return true;
    } catch {
      // If we can't determine state, check for database existence
      const databaseDirectory = dataDirectory || './data';
      return !fs.existsSync(databaseDirectory);
    }
  }
}
