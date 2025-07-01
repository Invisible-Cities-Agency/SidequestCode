/**
 * @fileoverview Code Archaeology Engine
 *
 * Comprehensive code archaeology system that bundles ts-prune and jscpd
 * to detect unused exports, dead code, and code duplication patterns.
 * Positions SideQuest as a technical debt relief system.
 */

import { BaseAuditEngine } from './base-engine.js';
import type {
  Violation,
  EngineConfig,
  ViolationCategory,
  DeadCodeViolation,
  CodeDuplicationViolation,
  ArchaeologyReport,
  ArchaeologyRecommendation,
  ArchaeologyAnnotation
} from '../utils/violation-types.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';

/**
 * Configuration interface for CodeArchaeologyEngine
 */
export interface ArchaeologyEngineConfig extends EngineConfig {
  options: {
    targetPath: string;
    deadCode?: {
      enabled: boolean;
      ignorePatterns?: string[];
      includeTests?: boolean;
    };
    duplication?: {
      enabled: boolean;
      minLines?: number;
      minTokens?: number;
      threshold?: number;
    };
  };
}

// Type definitions for tool outputs (interfaces removed as they're not used in current implementation)
// Future versions may use these for more structured parsing

/**
 * Code Archaeology Engine for detecting technical debt
 *
 * Integrates ts-prune for dead code detection and jscpd for duplication analysis.
 * Provides comprehensive code health insights and actionable remediation suggestions.
 */
export class CodeArchaeologyEngine extends BaseAuditEngine {
  constructor(config: ArchaeologyEngineConfig) {
    super('CodeArchaeology', 'archaeology', config);
  }

  /**
   * Create a dead code violation with specific metadata
   */
  private createDeadCodeViolation(
    file: string,
    line: number,
    code: string,
    deadCodeType: 'unused-export' | 'unreachable-code' | 'unused-import',
    exportName?: string,
    importSource?: string,
    confidence?: number
  ): DeadCodeViolation {
    // Calculate confidence based on export patterns and usage context
    const calculatedConfidence =
      confidence ??
      this.calculateDeadCodeConfidence(deadCodeType, exportName, file);
    const baseViolation = this.createViolation(
      file,
      line,
      code,
      'dead-code',
      'warn',
      deadCodeType,
      this.getDeadCodeMessage(deadCodeType, exportName, importSource)
    );

    return {
      ...baseViolation,
      category: 'dead-code',
      source: 'archaeology',
      deadCodeType,
      confidence: calculatedConfidence,
      metadata: {
        ...(exportName && { exportName }),
        ...(importSource && { importSource }),
        isReExport: false, // Could be enhanced to detect re-exports
        removalImpact: this.assessRemovalImpact(deadCodeType, exportName)
      }
    };
  }

  /**
   * Create a code duplication violation with specific metadata
   */
  private createDuplicationViolation(
    file: string,
    line: number,
    code: string,
    similarity: number,
    tokenCount: number,
    duplicateFiles: string[],
    duplicateLines: { start: number; end: number }
  ): CodeDuplicationViolation {
    const baseViolation = this.createViolation(
      file,
      line,
      code,
      'code-duplication',
      'info',
      'code-duplication',
      `This code is duplicated in ${duplicateFiles.join(', ')}. Consider extracting to a shared function.`
    );

    return {
      ...baseViolation,
      category: 'code-duplication',
      source: 'archaeology',
      similarity,
      tokenCount,
      duplicateFiles,
      metadata: {
        duplicationType:
          similarity >= 95
            ? 'exact'
            : (similarity >= 80
              ? 'structural'
              : 'semantic'),
        duplicateLines,
        refactoringApproach: this.suggestRefactoringApproach(
          tokenCount,
          similarity
        ),
        fixEffort: this.assessFixEffort(tokenCount, duplicateFiles.length)
      }
    };
  }

  /**
   * Generate appropriate message for dead code violations
   */
  private getDeadCodeMessage(
    type: 'unused-export' | 'unreachable-code' | 'unused-import',
    exportName?: string,
    importSource?: string
  ): string {
    switch (type) {
    case 'unused-export': {
      return `Unused export: ${exportName || 'unknown'}`;
    }
    case 'unreachable-code': {
      return 'Unreachable code detected';
    }
    case 'unused-import': {
      return `Unused import from: ${importSource || 'unknown'}`;
    }
    default: {
      return 'Dead code detected';
    }
    }
  }

  /**
   * Assess the impact of removing dead code
   */
  private assessRemovalImpact(
    type: 'unused-export' | 'unreachable-code' | 'unused-import',
    exportName?: string
  ): 'low' | 'medium' | 'high' {
    if (type === 'unused-import') {
      return 'low';
    }
    if (type === 'unreachable-code') {
      return 'medium';
    }

    // Test-related exports are low impact
    if (exportName?.includes('test') || exportName?.includes('Test')) {
      return 'low';
    }

    // CLI command functions might be used dynamically - higher impact to remove
    const cliPatterns = [
      'generate',
      'handle',
      'show',
      'display',
      'create',
      'run'
    ];
    if (
      exportName &&
      cliPatterns.some((pattern) => exportName.toLowerCase().includes(pattern))
    ) {
      return 'high';
    }

    // Public API patterns (interfaces, types, configs) - higher impact
    const publicApiPatterns = [
      'Config',
      'Interface',
      'Type',
      'Schema',
      'Options'
    ];
    if (
      exportName &&
      publicApiPatterns.some((pattern) => exportName.includes(pattern))
    ) {
      return 'high';
    }

    // Utility functions that might be part of public API
    const utilityPatterns = ['is', 'validate', 'check', 'get', 'create'];
    if (
      exportName &&
      utilityPatterns.some((pattern) =>
        exportName.toLowerCase().startsWith(pattern)
      )
    ) {
      return 'medium';
    }

    return 'medium'; // Default for unused exports
  }

  /**
   * Suggest refactoring approach based on duplication characteristics
   */
  private suggestRefactoringApproach(
    tokenCount: number,
    similarity: number
  ):
    | 'extract-function'
    | 'extract-constant'
    | 'extract-module'
    | 'pattern-matching' {
    if (similarity >= 95 && tokenCount < 50) {
      return 'extract-constant';
    }
    if (similarity >= 95 && tokenCount < 200) {
      return 'extract-function';
    }
    if (similarity >= 95) {
      return 'extract-module';
    }
    return 'pattern-matching';
  }

  /**
   * Assess effort required to fix duplication
   */
  private assessFixEffort(
    tokenCount: number,
    duplicateCount: number
  ): 'low' | 'medium' | 'high' {
    if (tokenCount < 50 && duplicateCount <= 2) {
      return 'low';
    }
    if (tokenCount < 200 && duplicateCount <= 3) {
      return 'medium';
    }
    return 'high';
  }

  /**
   * Check if code has archaeology exclusion annotations
   */
  private async checkArchaeologyAnnotations(
    filePath: string,
    line: number,
    _exportName?: string
  ): Promise<{
    excluded: boolean;
    annotation?: ArchaeologyAnnotation;
    shouldRecheck?: boolean;
  }> {
    try {
      const fullPath = path.join(process.cwd(), filePath);
      const content = await readFile(fullPath, 'utf8');
      const lines = content.split('\n');

      // Look for JSDoc comments in the 10 lines before the export
      const startLine = Math.max(0, line - 10);
      const endLine = Math.min(lines.length, line);

      let inJSDocument = false;
      let jsdocContent = '';

      for (let index = startLine; index < endLine; index++) {
        const currentLine = lines[index]?.trim() || '';

        if (currentLine.includes('/**')) {
          inJSDocument = true;
          jsdocContent = currentLine;
        } else if (inJSDocument) {
          jsdocContent += `\n${currentLine}`;
          if (currentLine.includes('*/')) {
            inJSDocument = false;

            // Parse archaeology annotations from JSDoc
            const annotation = this.parseArchaeologyAnnotation(jsdocContent);
            if (annotation) {
              const shouldRecheck = this.shouldRecheckAnnotation(annotation);
              return {
                excluded: true,
                annotation,
                shouldRecheck
              };
            }
            jsdocContent = '';
          }
        }
      }

      return { excluded: false };
    } catch {
      // If we can't read the file, don't exclude
      return { excluded: false };
    }
  }

  /**
   * Parse archaeology exclusion annotation from JSDoc content
   */
  private parseArchaeologyAnnotation(
    jsdocContent: string
  ): ArchaeologyAnnotation | undefined {
    // Match: @archaeology-exclude permanent|temporary "reason"
    const excludeMatch = jsdocContent.match(
      /@archaeology-exclude\s+(permanent|temporary)\s+"([^"]+)"/
    );

    if (!excludeMatch) {
      return undefined;
    }

    const type = excludeMatch[1] as 'permanent' | 'temporary';
    const reason = excludeMatch[2];

    if (!reason) {
      return undefined;
    }

    // Extract optional fields
    const sinceMatch = jsdocContent.match(/@since\s+(\S+)/);
    const recheckMatch = jsdocContent.match(
      /@archaeology-recheck-after\s+(\S+)/
    );
    const authorMatch = jsdocContent.match(/@author\s+([^\n]+)/);
    const issueMatch = jsdocContent.match(/@is{2}ue\s+(\S+)/);

    const annotation: ArchaeologyAnnotation = {
      type,
      reason
    };

    if (sinceMatch?.[1]) {
      annotation.since = sinceMatch[1];
    }

    if (recheckMatch?.[1]) {
      annotation.recheckAfter = recheckMatch[1];
    }

    const author = authorMatch?.[1]?.trim();
    const issue = issueMatch?.[1];

    if (author || issue) {
      annotation.metadata = {};
      if (author) {
        annotation.metadata.author = author;
      }
      if (issue) {
        annotation.metadata.issue = issue;
      }
    }

    return annotation;
  }

  /**
   * Check if a temporary annotation should trigger a recheck
   */
  private shouldRecheckAnnotation(annotation: ArchaeologyAnnotation): boolean {
    if (annotation.type === 'permanent') {
      return false;
    }
    if (!annotation.recheckAfter) {
      return false;
    }

    // Simple version comparison - could be enhanced with semver
    const currentVersion = this.getCurrentVersion();
    if (!currentVersion) {
      return false;
    }

    return this.compareVersions(currentVersion, annotation.recheckAfter) >= 0;
  }

  /**
   * Get current project version from package.json
   */
  private getCurrentVersion(): string | undefined {
    try {
      // This is a simplified version - in production might want to cache this
      const packageJson = require(path.join(process.cwd(), 'package.json'));
      return packageJson.version;
    } catch {
      return undefined;
    }
  }

  /**
   * Simple version comparison (could be enhanced with semver library)
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (
      let index = 0;
      index < Math.max(v1Parts.length, v2Parts.length);
      index++
    ) {
      const v1Part = v1Parts[index] || 0;
      const v2Part = v2Parts[index] || 0;

      if (v1Part > v2Part) {
        return 1;
      }
      if (v1Part < v2Part) {
        return -1;
      }
    }

    return 0;
  }

  /**
   * Calculate confidence score for dead code detection
   */
  private calculateDeadCodeConfidence(
    type: 'unused-export' | 'unreachable-code' | 'unused-import',
    exportName?: string,
    filePath?: string
  ): number {
    let confidence = 0.9; // Base confidence

    // Different base confidence for different types
    if (type === 'unused-import') {
      confidence = 0.95; // Higher confidence for unused imports
    } else if (type === 'unreachable-code') {
      confidence = 0.85; // Medium confidence for unreachable code
    }

    // Lower confidence for potential CLI functions
    const cliPatterns = [
      'generate',
      'handle',
      'show',
      'display',
      'create',
      'run'
    ];
    if (
      exportName &&
      cliPatterns.some((pattern) => exportName.toLowerCase().includes(pattern))
    ) {
      confidence = 0.6; // Lower confidence - might be used dynamically
    }

    // Lower confidence for public API patterns
    const publicApiPatterns = [
      'Config',
      'Interface',
      'Type',
      'Schema',
      'Options',
      'Error'
    ];
    if (
      exportName &&
      publicApiPatterns.some((pattern) => exportName.includes(pattern))
    ) {
      confidence = 0.7; // Might be part of public API
    }

    // Lower confidence for service factory patterns
    if (
      exportName &&
      (exportName.startsWith('get') || exportName.startsWith('create'))
    ) {
      confidence = 0.6; // Factory functions often used dynamically
    }

    // Higher confidence for obvious utility functions
    if (exportName && exportName.startsWith('is') && exportName.length > 2) {
      confidence = 0.95; // Boolean utility functions are usually straightforward
    }

    // Lower confidence for config files
    if (filePath?.includes('config') || filePath?.includes('.config.')) {
      confidence = Math.min(confidence, 0.8); // Config files often have dynamic usage
    }

    // Higher confidence for test files
    if (
      filePath?.includes('test') ||
      filePath?.includes('.spec.') ||
      filePath?.includes('.test.')
    ) {
      confidence = 0.95; // Test files are usually self-contained
    }

    return Math.round(confidence * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Main analysis method that orchestrates dead code and duplication detection
   */
  protected async analyze(
    targetPath: string,
    _options: Record<string, unknown> = {}
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
    const config = this.config as ArchaeologyEngineConfig;

    // Run dead code analysis if enabled
    if (config.options.deadCode?.enabled !== false) {
      const deadCodeViolations = await this.analyzeDeadCode(targetPath);
      violations.push(...deadCodeViolations);
    }

    // Run duplication analysis if enabled
    if (config.options.duplication?.enabled !== false) {
      const duplicationViolations = await this.analyzeDuplication(targetPath);
      violations.push(...duplicationViolations);
    }

    return violations;
  }

  /**
   * Detect unused exports and dead code using ts-prune
   */
  async analyzeDeadCode(targetPath: string): Promise<Violation[]> {
    try {
      const config = this.config as ArchaeologyEngineConfig;
      const tsPruneArguments = [
        '--project',
        path.join(targetPath, 'tsconfig.json')
      ];

      // Add ignore patterns if configured
      if (config.options.deadCode?.ignorePatterns?.length) {
        tsPruneArguments.push(
          '--ignore',
          config.options.deadCode.ignorePatterns.join('|')
        );
      }

      const output = await this.runCommand(
        'npx',
        ['ts-prune', ...tsPruneArguments],
        targetPath
      );
      return await this.parseTsPruneOutput(output, targetPath);
    } catch (error) {
      console.warn(`[CodeArchaeology] Dead code analysis failed: ${error}`);
      return [];
    }
  }

  /**
   * Detect code duplication using jscpd
   */
  async analyzeDuplication(targetPath: string): Promise<Violation[]> {
    try {
      const config = this.config as ArchaeologyEngineConfig;
      const jscpdArguments = [
        '--format',
        'typescript,javascript',
        '--reporters',
        'json',
        '--silent'
      ];

      // Configure thresholds
      if (config.options.duplication?.minLines) {
        jscpdArguments.push(
          '--min-lines',
          config.options.duplication.minLines.toString()
        );
      }
      if (config.options.duplication?.minTokens) {
        jscpdArguments.push(
          '--min-tokens',
          config.options.duplication.minTokens.toString()
        );
      }

      // Create temporary output file
      const outputFile = path.join(tmpdir(), `jscpd-${Date.now()}.json`);
      jscpdArguments.push('--output', outputFile, targetPath);

      await this.runCommand('npx', ['jscpd', ...jscpdArguments], targetPath);

      try {
        const outputContent = await import('node:fs').then((fs) =>
          fs.promises.readFile(outputFile, 'utf8')
        );
        const violations = this.parseJscpdOutput(outputContent, targetPath);

        // Clean up temp file
        await unlink(outputFile).catch(() => {}); // Ignore cleanup errors

        return violations;
      } catch (parseError) {
        console.warn(
          `[CodeArchaeology] Failed to parse jscpd output: ${parseError}`
        );
        return [];
      }
    } catch (error) {
      console.warn(`[CodeArchaeology] Duplication analysis failed: ${error}`);
      return [];
    }
  }

  /**
   * Parse ts-prune output into violations
   */
  private async parseTsPruneOutput(
    output: string,
    targetPath: string
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
    const lines = output
      .trim()
      .split('\n')
      .filter((line) => line.trim());

    // Process all lines in parallel to avoid blocking
    const linePromises = lines.map(async(line) => {
      // ts-prune output format: "file:line - exportName (type)"
      const match = line.match(/^(.+):(\d+) - (.+?)( \(.*\))?$/);
      if (!match) {
        return;
      }

      const [, filePath, lineNumber, exportName] = match;

      if (!filePath || !lineNumber || !exportName) {
        return;
      }

      // Make path relative to target
      const relativePath = filePath.startsWith(targetPath)
        ? filePath.slice(targetPath.length + 1)
        : filePath;

      // Check for archaeology exclusion annotations
      const annotationCheck = await this.checkArchaeologyAnnotations(
        relativePath,
        Number.parseInt(lineNumber, 10),
        exportName
      );

      if (annotationCheck.excluded) {
        // Skip this violation if it's permanently excluded
        if (annotationCheck.annotation?.type === 'permanent') {
          return;
        }

        // For temporary exclusions, check if we should recheck
        if (!annotationCheck.shouldRecheck) {
          return;
        }

        // If we should recheck, create a special violation with lower severity
        return this.createDeadCodeViolation(
          relativePath,
          Number.parseInt(lineNumber, 10),
          `Unused export (recheck needed): ${exportName}`,
          'unused-export',
          exportName,
          undefined, // importSource
          0.4 // Lower confidence due to temporary exclusion expiry
        );
      } else {
        // Normal processing for non-excluded items
        return this.createDeadCodeViolation(
          relativePath,
          Number.parseInt(lineNumber, 10),
          `Unused export: ${exportName}`,
          'unused-export',
          exportName // confidence - will be calculated
        );
      }
    });

    const results = await Promise.all(linePromises);
    violations.push(
      ...results.filter((v): v is DeadCodeViolation => v !== undefined)
    );

    return violations;
  }

  /**
   * Parse jscpd output into violations
   */
  private parseJscpdOutput(output: string, targetPath: string): Violation[] {
    const violations: Violation[] = [];

    try {
      const result = JSON.parse(output);

      if (result.duplicates && Array.isArray(result.duplicates)) {
        for (const duplicate of result.duplicates) {
          const firstFile = duplicate.firstFile?.name;
          const secondFile = duplicate.secondFile?.name;

          if (firstFile && secondFile) {
            // Make paths relative
            const relativeFirst = firstFile.startsWith(targetPath)
              ? firstFile.slice(targetPath.length + 1)
              : firstFile;
            const relativeSecond = secondFile.startsWith(targetPath)
              ? secondFile.slice(targetPath.length + 1)
              : secondFile;

            // Create violation for first occurrence
            violations.push(
              this.createDuplicationViolation(
                relativeFirst,
                duplicate.firstFile?.start || 1,
                `Duplicated code block (${duplicate.lines} lines)`,
                duplicate.percentage || 100,
                duplicate.tokens || 50,
                [relativeSecond],
                {
                  start: duplicate.firstFile?.start || 1,
                  end:
                    duplicate.firstFile?.end ||
                    (duplicate.firstFile?.start || 1) + (duplicate.lines || 0)
                }
              )
            );
          }
        }
      }
    } catch (error) {
      console.warn(`[CodeArchaeology] Failed to parse jscpd JSON: ${error}`);
    }

    return violations;
  }

  /**
   * Run a command and return its output
   */
  // eslint-disable-next-line require-await
  private async runCommand(
    command: string,
    arguments_: string[],
    cwd: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, arguments_, {
        cwd,
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', reject);

      // Handle abort signal
      if (this.abortController?.signal.aborted) {
        child.kill();
        reject(new Error('Analysis was aborted'));
      }

      this.abortController?.signal.addEventListener('abort', () => {
        child.kill();
        reject(new Error('Analysis was aborted'));
      });
    });
  }

  /**
   * Generate fix suggestions for archaeology violations
   */
  protected override generateFixSuggestion(
    category: ViolationCategory,
    rule?: string,
    _code?: string
  ): string | undefined {
    switch (category) {
    case 'dead-code': {
      if (rule === 'unused-export') {
        return "Remove the unused export or add it to an ignore pattern if it's part of a public API";
      }
      return 'Remove the unused code to reduce bundle size and improve maintainability';
    }

    case 'code-duplication': {
      return 'Extract duplicate code into a shared function, utility, or component to improve maintainability';
    }

    default: {
      return undefined;
    }
    }
  }

  /**
   * Generate comprehensive archaeology report
   */
  async generateArchaeologyReport(
    targetPath: string
  ): Promise<ArchaeologyReport> {
    const violations = await this.analyze(targetPath);

    const deadCodeViolations = violations.filter(
      (v) => v.category === 'dead-code'
    );
    const duplicationViolations = violations.filter(
      (v) => v.category === 'code-duplication'
    );

    const deadCodeFiles = [...new Set(deadCodeViolations.map((v) => v.file))];
    const duplicationFiles = [
      ...new Set(duplicationViolations.map((v) => v.file))
    ];

    // Calculate a simple technical debt score (0-100, lower is better)
    const deadCodeScore = Math.min(deadCodeViolations.length * 2, 50);
    const duplicationScore = Math.min(duplicationViolations.length * 3, 50);
    const technicalDebtScore = deadCodeScore + duplicationScore;

    const deadCodeViolationsTyped = deadCodeViolations as DeadCodeViolation[];
    const duplicationViolationsTyped =
      duplicationViolations as CodeDuplicationViolation[];

    // Calculate total lines of duplicated code
    let totalDuplicatedLines = 0;
    for (const v of duplicationViolationsTyped) {
      const match = v.code.match(/\((\d+) lines\)/);
      totalDuplicatedLines += match?.[1] ? Number.parseInt(match[1], 10) : 1;
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      deadCodeViolationsTyped,
      duplicationViolationsTyped
    );

    return {
      summary: {
        totalViolations: violations.length,
        deadCodeCount: deadCodeViolations.length,
        duplicationCount: duplicationViolations.length,
        filesAnalyzed: new Set([...deadCodeFiles, ...duplicationFiles]).size,
        healthScore: Math.max(0, 100 - technicalDebtScore)
      },
      deadCode: {
        unusedExports: deadCodeViolationsTyped.filter(
          (v) => v.deadCodeType === 'unused-export'
        ),
        unreachableCode: deadCodeViolationsTyped.filter(
          (v) => v.deadCodeType === 'unreachable-code'
        ),
        unusedImports: deadCodeViolationsTyped.filter(
          (v) => v.deadCodeType === 'unused-import'
        ),
        totalDeadLines: deadCodeViolations.length // Simplified - could be enhanced
      },
      duplication: {
        exactDuplicates: duplicationViolationsTyped.filter(
          (v) => v.metadata.duplicationType === 'exact'
        ),
        structuralDuplicates: duplicationViolationsTyped.filter(
          (v) => v.metadata.duplicationType === 'structural'
        ),
        fileMetrics: this.calculateFileMetrics(duplicationViolationsTyped),
        overallDuplication:
          duplicationFiles.length > 0
            ? (totalDuplicatedLines / (duplicationFiles.length * 100)) * 100
            : 0
      },
      recommendations,
      technicalDebt: {
        estimatedFixTimeHours: this.estimateFixTime(
          deadCodeViolationsTyped,
          duplicationViolationsTyped
        ),
        complexityScore: Math.min(10, Math.floor(technicalDebtScore / 10)),
        maintainabilityIndex: Math.max(0, 100 - technicalDebtScore)
      }
    };
  }

  /**
   * Generate actionable recommendations based on violations
   */
  private generateRecommendations(
    deadCodeViolations: DeadCodeViolation[],
    duplicationViolations: CodeDuplicationViolation[]
  ): {
    highPriority: ArchaeologyRecommendation[];
    mediumPriority: ArchaeologyRecommendation[];
    lowPriority: ArchaeologyRecommendation[];
  } {
    const recommendations: ArchaeologyRecommendation[] = [];

    // High-priority: Unused exports with high impact
    const highImpactDeadCode = deadCodeViolations.filter(
      (v) => v.metadata.removalImpact === 'high'
    );
    if (highImpactDeadCode.length > 0) {
      recommendations.push({
        type: 'remove-dead-code',
        description: `Remove ${highImpactDeadCode.length} high-impact unused exports`,
        affectedFiles: [...new Set(highImpactDeadCode.map((v) => v.file))],
        effort: 'medium',
        impact: 'high',
        actionSteps: [
          "Review each unused export to ensure it's not part of a public API",
          'Remove unused exports and update any related documentation',
          'Run tests to ensure no hidden dependencies'
        ],
        riskLevel: 'medium'
      });
    }

    // Medium-priority: Exact duplicates
    const exactDuplicates = duplicationViolations.filter(
      (v) => v.metadata.duplicationType === 'exact'
    );
    if (exactDuplicates.length > 0) {
      recommendations.push({
        type: 'extract-duplicate',
        description: `Extract ${exactDuplicates.length} exact code duplicates into shared utilities`,
        affectedFiles: [...new Set(exactDuplicates.map((v) => v.file))],
        effort: 'medium',
        impact: 'medium',
        actionSteps: [
          'Identify the duplicated code patterns',
          'Extract common code into utility functions',
          'Update all occurrences to use the shared utilities',
          'Add tests for the new shared utilities'
        ],
        riskLevel: 'low'
      });
    }

    // Low-priority: Unused imports
    const unusedImports = deadCodeViolations.filter(
      (v) => v.deadCodeType === 'unused-import'
    );
    if (unusedImports.length > 0) {
      recommendations.push({
        type: 'improve-imports',
        description: `Clean up ${unusedImports.length} unused imports`,
        affectedFiles: [...new Set(unusedImports.map((v) => v.file))],
        effort: 'low',
        impact: 'low',
        actionSteps: [
          'Remove unused import statements',
          'Run linter to catch any remaining issues',
          'Update import organization if needed'
        ],
        riskLevel: 'low'
      });
    }

    // Categorize by priority
    return {
      highPriority: recommendations.filter((r) => r.impact === 'high'),
      mediumPriority: recommendations.filter((r) => r.impact === 'medium'),
      lowPriority: recommendations.filter((r) => r.impact === 'low')
    };
  }

  /**
   * Calculate file-level duplication metrics
   */
  private calculateFileMetrics(
    duplicationViolations: CodeDuplicationViolation[]
  ): Record<
    string,
    { duplicatedLines: number; totalLines: number; percentage: number }
  > {
    const fileMetrics: Record<
      string,
      { duplicatedLines: number; totalLines: number; percentage: number }
    > = {};

    for (const violation of duplicationViolations) {
      const file = violation.file;
      if (!fileMetrics[file]) {
        fileMetrics[file] = {
          duplicatedLines: 0,
          totalLines: 100,
          percentage: 0
        }; // Simplified
      }

      const lines =
        violation.metadata.duplicateLines.end -
        violation.metadata.duplicateLines.start +
        1;
      fileMetrics[file].duplicatedLines += lines;
      fileMetrics[file].percentage =
        (fileMetrics[file].duplicatedLines / fileMetrics[file].totalLines) *
        100;
    }

    return fileMetrics;
  }

  /**
   * Estimate time required to fix all violations
   */
  private estimateFixTime(
    deadCodeViolations: DeadCodeViolation[],
    duplicationViolations: CodeDuplicationViolation[]
  ): number {
    let totalHours = 0;

    // Dead code: 5 minutes per unused export, 15 minutes per unreachable code
    for (const violation of deadCodeViolations) {
      switch (violation.deadCodeType) {
      case 'unused-export': {
        totalHours += 0.1; // 6 minutes
        break;
      }
      case 'unreachable-code': {
        totalHours += 0.25; // 15 minutes
        break;
      }
      case 'unused-import': {
        totalHours += 0.05; // 3 minutes
        break;
      }
      }
    }

    // Duplication: Based on fix effort
    for (const violation of duplicationViolations) {
      switch (violation.metadata.fixEffort) {
      case 'low': {
        totalHours += 0.5; // 30 minutes
        break;
      }
      case 'medium': {
        totalHours += 1; // 1 hour
        break;
      }
      case 'high': {
        totalHours += 2; // 2 hours
        break;
      }
      }
    }

    return Math.round(totalHours * 10) / 10; // Round to 1 decimal place
  }
}
