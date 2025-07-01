/**
 * Unused Exports Engine for Code Quality Orchestrator
 * Detects unused TypeScript exports using ts-unused-exports
 */

import { execPromise } from '../utils/exec-utils.js';
import { BaseAuditEngine } from './base-engine.js';
import type {
  Violation,
  ViolationCategory,
  ViolationSeverity
} from '../utils/violation-types.js';

/**
 * Engine that analyzes TypeScript exports to find unused code
 */
export class UnusedExportsEngine extends BaseAuditEngine {
  constructor() {
    super('Unused Exports Analysis', 'unused-exports', {
      enabled: true,
      options: {},
      priority: 3,
      timeout: 30_000,
      allowFailure: true
    });
  }

  /**
   * Analyze TypeScript project for unused exports
   */
  protected async analyze(
    _targetPath: string,
    _options: Record<string, unknown>
  ): Promise<Violation[]> {
    try {
      // Run ts-unused-exports command with smart filtering to reduce false positives
      const command = [
        'npx ts-unused-exports tsconfig.json',
        '--showLineNumber',
        '--allowUnusedTypes', // Allow unused type/interface exports (often part of public API)
        '--excludeDeclarationFiles', // Skip .d.ts files
        '--ignoreTestFiles', // Focus on production code
        '--ignoreLocallyUsed', // Don't report exports used in same file
        '--excludePathsFromReport="shared/types;shared/constants;utils/types"' // Exclude likely public API files
      ].join(' ');

      const { stdout, stderr } = await execPromise(command, {
        cwd: process.cwd(),
        timeout: this.config.timeout || 30_000
      });

      if (stderr && !stdout) {
        throw new Error(`ts-unused-exports failed: ${stderr}`);
      }

      return this.parseUnusedExportsOutput(stdout);
    } catch (error: unknown) {
      // ts-unused-exports exits with code 1 when it finds unused exports, this is expected
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 1 &&
        'stdout' in error &&
        error.stdout
      ) {
        console.log(
          '[UnusedExportsEngine] Found unused exports, processing results...'
        );
        return this.parseUnusedExportsOutput(error.stdout as string);
      }

      console.error('[UnusedExportsEngine] Unexpected error:', error);
      if (this.config.allowFailure) {
        console.warn(`[UnusedExportsEngine] Analysis failed: ${error}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Parse ts-unused-exports output into violations
   */
  private parseUnusedExportsOutput(output: string): Violation[] {
    const violations: Violation[] = [];
    const lines = output.split('\n').filter((line) => line.trim());

    // let moduleCount = 0;
    // let currentFile = '';

    for (const line of lines) {
      // Skip the summary line
      if (line.includes('modules with unused exports')) {
        const match = line.match(/(\d+) modules with unused exports/);
        if (match) {
          // moduleCount = parseInt(match[1], 10);
        }
        continue;
      }

      // Parse file paths with line numbers: /path/file.ts[line,column]: exportName
      const match = line.match(/^(.+?)\[(\d+),(\d+)]:\s*(.+)$/);
      if (match) {
        const [, filePath, lineString, columnString, exportName] = match;
        if (!filePath || !lineString || !columnString || !exportName) {
          continue;
        }

        const lineNumber = Number.parseInt(lineString, 10);
        const columnNumber = Number.parseInt(columnString, 10);

        // Convert absolute path to relative
        const relativePath = filePath.replace(`${process.cwd()}/`, '');

        violations.push({
          file: relativePath,
          line: lineNumber,
          column: columnNumber,
          message: `Unused export '${exportName}' - consider removing if not needed`,
          code: exportName,
          category: this.categorizeUnusedExport(relativePath, exportName),
          severity: this.getSeverityForUnusedExport(relativePath, exportName),
          source: 'unused-exports',
          rule: 'unused-export'
        });
      }
    }

    return violations;
  }

  /**
   * Categorize unused exports based on file path and export name
   */
  private categorizeUnusedExport(
    filePath: string,
    exportName: string
  ): ViolationCategory {
    // Public API indicators - likely intentional exports
    if (this.isLikelyPublicAPI(filePath, exportName)) {
      return 'best-practices'; // Lower severity for potential public API
    }

    // Type definitions are usually less critical
    if (filePath.includes('/types.ts') || filePath.endsWith('types.ts')) {
      return 'unused-code';
    }

    // Configuration exports might be intentional for future use
    if (filePath.includes('config') || exportName.includes('Config')) {
      return 'unused-code';
    }

    // Test files and utilities
    if (filePath.includes('test') || filePath.includes('spec')) {
      return 'unused-code';
    }

    // Default category for unused exports
    return 'unused-code';
  }

  /**
   * Detect patterns that suggest this export is part of a public API
   */
  private isLikelyPublicAPI(filePath: string, exportName: string): boolean {
    // Service classes that likely have factory functions
    if (
      exportName.endsWith('Service') ||
      exportName.endsWith('Engine') ||
      exportName.endsWith('Manager')
    ) {
      return true;
    }

    // Class constructors that are likely used indirectly
    if (
      exportName.endsWith('Display') ||
      exportName.endsWith('Tracker') ||
      exportName.endsWith('Detector')
    ) {
      return true;
    }

    // Index files are usually public API entry points
    if (filePath.endsWith('/index.ts') || filePath.endsWith('index.ts')) {
      return true;
    }

    // Shared modules are often public API
    if (filePath.includes('/shared/') || filePath.includes('shared/')) {
      return true;
    }

    // Configuration and constants often exported for external use
    if (
      exportName.includes('DEFAULT_') ||
      exportName.includes('VALIDATION_') ||
      exportName.includes('CONFIG')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Determine severity based on context
   */
  private getSeverityForUnusedExport(
    filePath: string,
    exportName: string
  ): ViolationSeverity {
    // Likely public API exports should be informational only
    if (this.isLikelyPublicAPI(filePath, exportName)) {
      return 'info'; // Low severity - might be intentional public API
    }

    // Core API exports should be warnings (might be used externally)
    if (filePath.includes('index.ts') || exportName === 'default') {
      return 'warn';
    }

    // Test files are lower priority
    if (filePath.includes('test') || filePath.includes('spec')) {
      return 'info';
    }

    // Type definitions are informational
    if (filePath.includes('/types.ts') || filePath.endsWith('types.ts')) {
      return 'info';
    }

    // Default to info level for unused exports
    return 'info';
  }

  /**
   * Generate fix suggestion for unused exports
   */
  protected override generateFixSuggestion(
    _category: ViolationCategory,
    _rule?: string,
    code?: string
  ): string | undefined {
    if (!code) {
      return undefined;
    }

    return `Consider removing unused export '${code}' if it's not needed, or keep it if it's part of the public API`;
  }
}
