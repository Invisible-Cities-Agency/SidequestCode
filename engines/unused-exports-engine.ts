/**
 * Unused Exports Engine for Code Quality Orchestrator
 * Detects unused TypeScript exports using ts-unused-exports
 */

import { execPromise } from '../utils/exec-utils.js';
import { BaseAuditEngine } from './base-engine.js';
import type { Violation, ViolationCategory, ViolationSeverity } from '../utils/violation-types.js';

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
      // Run ts-unused-exports command
      const { stdout, stderr } = await execPromise('npx ts-unused-exports tsconfig.json --showLineNumber', {
        cwd: process.cwd(),
        timeout: this.config.timeout || 30_000
      });

      if (stderr && !stdout) {
        throw new Error(`ts-unused-exports failed: ${stderr}`);
      }

      return this.parseUnusedExportsOutput(stdout);
    } catch (error: any) {
      // ts-unused-exports exits with code 1 when it finds unused exports, this is expected
      if (error.code === 1 && error.stdout) {
        console.log(`[UnusedExportsEngine] Found unused exports, processing results...`);
        return this.parseUnusedExportsOutput(error.stdout);
      }
      
      console.error(`[UnusedExportsEngine] Unexpected error:`, error);
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
    const lines = output.split('\n').filter(line => line.trim());

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
      const match = line.match(/^(.+?)\[(\d+),(\d+)\]:\s*(.+)$/);
      if (match) {
        const [, filePath, lineStr, columnStr, exportName] = match;
        if (!filePath || !lineStr || !columnStr || !exportName) continue;
        
        const lineNumber = parseInt(lineStr, 10);
        const columnNumber = parseInt(columnStr, 10);

        // Convert absolute path to relative
        const relativePath = filePath.replace(process.cwd() + '/', '');

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
  private categorizeUnusedExport(filePath: string, exportName: string): ViolationCategory {
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
   * Determine severity based on context
   */
  private getSeverityForUnusedExport(filePath: string, exportName: string): ViolationSeverity {
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
    if (!code) return undefined;

    return `Consider removing unused export '${code}' if it's not needed, or keep it if it's part of the public API`;
  }
}