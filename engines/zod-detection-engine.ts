/**
 * @fileoverview Zod Detection Engine
 *
 * Detects Zod usage patterns and anti-patterns:
 * - Unused schemas (defined but never parsed)
 * - Over-validation (validating internal type-safe data)
 * - Missing validation (external APIs without schemas)
 */

import { BaseAuditEngine } from "./base-engine.js";
import type { Violation } from "../utils/violation-types.js";
import { spawnSync } from "node:child_process";
import {
  PackageJsonSchema,
  type ValidatedPackageJson,
} from "../utils/validation-schemas.js";

interface ZodUsage {
  schemaDefinitions: Array<{ file: string; line: number; name: string }>;
  parseUsages: Array<{ file: string; line: number; schema: string }>;
  safeParsUsages: Array<{ file: string; line: number; schema: string }>;
}

export class ZodDetectionEngine extends BaseAuditEngine {
  constructor(config: any = {}) {
    super("Zod Detection", "zod-detection", {
      enabled: true,
      priority: 3,
      timeout: 30_000,
      allowFailure: true,
      ...config,
    });
  }

  /**
   * Filter out non-Zod .parse() calls (JSON.parse, parseInt, etc.)
   */
  private isNonZodParse(schemaName: string, content: string): boolean {
    // Common false positives
    const nonZodParsers = ["JSON", "parseInt", "parseFloat", "Date", "Number"];
    if (nonZodParsers.includes(schemaName)) {
      return true;
    }

    // Check if it's JSON.parse() specifically
    if (content.includes("JSON.parse(")) {
      return true;
    }

    // Check if it's in a string literal (comments, error messages, etc.)
    if (content.includes("'") && content.includes("schema.parse(")) {
      return true;
    }
    if (content.includes('"') && content.includes("schema.parse(")) {
      return true;
    }
    if (content.includes("`") && content.includes("schema.parse(")) {
      return true;
    }

    // Check if it's a built-in parse method
    if (
      content.includes(`${schemaName}.parse(`) &&
      (content.includes("parseInt") || content.includes("parseFloat"))
    ) {
      return true;
    }

    return false;
  }

  async analyze(targetPath: string, _options: any = {}): Promise<Violation[]> {
    const violations: Violation[] = [];

    try {
      // Check if Zod is installed
      const hasZod = await this.hasZodDependency();
      if (!hasZod) {
        console.log(
          "[Zod Detection] Zod not detected in project - skipping analysis",
        );
        return [];
      }

      console.log("[Zod Detection] Analyzing Zod usage patterns...");

      const zodUsage = this.analyzeZodUsage(targetPath);

      // Detect unused schemas
      const unusedSchemas = this.findUnusedSchemas(zodUsage);
      if (unusedSchemas && Array.isArray(unusedSchemas)) {
        violations.push(...unusedSchemas);
      }

      // Detect over-validation patterns
      const overValidations = this.findOverValidations(zodUsage);
      if (overValidations && Array.isArray(overValidations)) {
        violations.push(...overValidations);
      }

      // Detect missing validation opportunities
      const missingValidations = this.findMissingValidations(targetPath);
      if (missingValidations && Array.isArray(missingValidations)) {
        violations.push(...missingValidations);
      }

      // Calculate runtime validation coverage
      const coverage = this.calculateValidationCoverage(zodUsage, targetPath);

      // Add coverage-based suggestions
      const coverageSuggestions = this.generateCoverageSuggestions(coverage);
      if (coverageSuggestions && Array.isArray(coverageSuggestions)) {
        violations.push(...coverageSuggestions);
      }

      return violations;
    } catch (error: any) {
      console.error("[Zod Detection] Analysis failed:", error);
      if (this.config.allowFailure) {
        console.warn(
          "[Zod Detection] Analysis failed but continuing due to allowFailure setting",
        );
        return [];
      }
      throw error;
    }
  }

  private async hasZodDependency(): Promise<boolean> {
    try {
      const packageJsonModule = await import(`${process.cwd()}/package.json`);

      // Validate package.json structure with Zod for security
      const packageJson: ValidatedPackageJson = PackageJsonSchema.parse(
        packageJsonModule.default || packageJsonModule,
      );
      console.log("[Security] package.json structure validated successfully");

      return !!(
        packageJson.dependencies?.["zod"] ||
        packageJson.devDependencies?.["zod"]
      );
    } catch (error: any) {
      console.warn(
        "[Zod Detection] Could not validate package.json:",
        error.message,
      );
      return false;
    }
  }

  private analyzeZodUsage(baseDirectory: string): ZodUsage {
    const usage: ZodUsage = {
      schemaDefinitions: [],
      parseUsages: [],
      safeParsUsages: [],
    };

    // Find schema definitions (z.object, z.string, z.array, etc.)
    const schemaResult = spawnSync(
      "rg",
      [
        "--type",
        "ts",
        "--line-number",
        String.raw`z\.(object|string|number|boolean|array|record|union|intersection|literal|enum)\(`,
        ".",
      ],
      {
        encoding: "utf8",
        cwd: baseDirectory,
      },
    );

    if (schemaResult.stdout) {
      for (const line of schemaResult.stdout.split("\n")) {
        if (line.trim()) {
          const match = line.match(/^([^:]+):(\d+):(.*)/);
          if (match) {
            const [, file, lineNumber, content] = match;
            if (file && lineNumber && content) {
              const schemaMatch = content.match(/(\w+)\s*=.*z\.\w+/);
              if (schemaMatch) {
                usage.schemaDefinitions.push({
                  file: file.replace(`${baseDirectory}/`, ""),
                  line: Number.parseInt(lineNumber, 10),
                  name: schemaMatch[1] || "unknown",
                });
              }
            }
          }
        }
      }
    }

    // Find .parse() usages - but only for Zod schemas, not JSON.parse() etc.
    const parseResult = spawnSync(
      "rg",
      [
        "--type",
        "ts",
        "--line-number",
        String.raw`[a-zA-Z_][a-zA-Z0-9_]*\.parse\(`, // Only match variable.parse(), not JSON.parse()
        ".",
      ],
      {
        encoding: "utf8",
        cwd: baseDirectory,
      },
    );

    if (parseResult.stdout) {
      for (const line of parseResult.stdout.split("\n")) {
        if (line.trim()) {
          const match = line.match(/^([^:]+):(\d+):(.*)/);
          if (match) {
            const [, file, lineNumber, content] = match;
            if (file && lineNumber && content) {
              const parseMatch = content.match(/(\w+)\.parse\(/);
              if (parseMatch) {
                const schemaName = parseMatch[1];

                // Filter out obvious false positives
                if (schemaName && !this.isNonZodParse(schemaName, content)) {
                  usage.parseUsages.push({
                    file: file.replace(`${baseDirectory}/`, ""),
                    line: Number.parseInt(lineNumber, 10),
                    schema: schemaName,
                  });
                }
              }
            }
          }
        }
      }
    }

    // Find .safeParse() usages
    const safeParseResult = spawnSync(
      "rg",
      ["--type", "ts", "--line-number", String.raw`\.safeParse\(`, "."],
      {
        encoding: "utf8",
        cwd: baseDirectory,
      },
    );

    if (safeParseResult.stdout) {
      for (const line of safeParseResult.stdout.split("\n")) {
        if (line.trim()) {
          const match = line.match(/^([^:]+):(\d+):(.*)/);
          if (match) {
            const [, file, lineNumber, content] = match;
            if (file && lineNumber && content) {
              const safeParseMatch = content.match(/(\w+)\.safeParse\(/);
              if (safeParseMatch) {
                usage.safeParsUsages.push({
                  file: file.replace(`${baseDirectory}/`, ""),
                  line: Number.parseInt(lineNumber, 10),
                  schema: safeParseMatch[1] || "unknown",
                });
              }
            }
          }
        }
      }
    }

    // Find safeJsonParse() utility function usages - CRITICAL FIX for missed detections
    const safeJsonParseResult = spawnSync(
      "rg",
      ["--type", "ts", "--line-number", String.raw`safeJsonParse\(`, "."],
      {
        encoding: "utf8",
        cwd: baseDirectory,
      },
    );

    if (safeJsonParseResult.stdout) {
      for (const line of safeJsonParseResult.stdout.split("\n")) {
        if (line.trim()) {
          const match = line.match(/^([^:]+):(\d+):(.*)/);
          if (match) {
            const [, file, lineNumber, content] = match;
            if (file && lineNumber && content) {
              // Match pattern: safeJsonParse(data, SchemaName, description)
              const safeJsonMatch = content.match(
                /safeJsonParse\([^,]+,\s*(\w+Schema)\s*,/,
              );
              if (safeJsonMatch && safeJsonMatch[1]) {
                const schemaName = safeJsonMatch[1];
                usage.safeParsUsages.push({
                  file: file.replace(`${baseDirectory}/`, ""),
                  line: Number.parseInt(lineNumber, 10),
                  schema: schemaName,
                });
              }
            }
          }
        }
      }
    }

    return usage;
  }

  private findUnusedSchemas(usage: ZodUsage): Violation[] {
    const violations: Violation[] = [];
    const usedSchemas = new Set([
      ...usage.parseUsages.map((u) => u.schema),
      ...usage.safeParsUsages.map((u) => u.schema),
    ]);

    for (const schema of usage.schemaDefinitions) {
      if (!usedSchemas.has(schema.name)) {
        violations.push({
          file: schema.file,
          line: schema.line,
          code: `Unused Zod schema '${schema.name}'`,
          category: "unused-code",
          severity: "warn",
          source: this.source,
          rule: "zod-unused-schema",
          message: `Zod schema '${schema.name}' is defined but never used with .parse(), .safeParse(), or safeJsonParse()`,
          fixSuggestion: `Remove unused schema '${schema.name}' or add validation calls`,
        });
      }
    }

    return violations;
  }

  private findOverValidations(usage: ZodUsage): Violation[] {
    const violations: Violation[] = [];

    // Look for Zod validation inside TypeScript functions with typed parameters
    // This is a simplified heuristic - in practice you'd want more sophisticated analysis
    for (const parseUsage of [...usage.parseUsages, ...usage.safeParsUsages]) {
      // Check if this appears to be validating already type-safe data
      // Heuristic: look for validation in non-boundary files
      if (
        parseUsage.file.endsWith(".ts") &&
        !parseUsage.file.includes("api") &&
        !parseUsage.file.includes("external") &&
        !parseUsage.file.includes("validation") &&
        !parseUsage.file.includes("schema") &&
        !parseUsage.file.includes("cli") &&
        !parseUsage.file.includes("config") &&
        !this.isLikelyExternalDataValidation(parseUsage)
      ) {
        violations.push({
          file: parseUsage.file,
          line: parseUsage.line,
          code: "Potential over-validation with Zod",
          category: "best-practices",
          severity: "info",
          source: this.source,
          rule: "zod-potential-over-validation",
          message:
            "Consider if Zod validation is needed here - TypeScript may provide sufficient type safety",
          fixSuggestion:
            "Review if this data is already type-safe and consider using TypeScript types instead",
        });
      }
    }

    return violations;
  }

  private findMissingValidations(baseDirectory: string): Violation[] {
    const violations: Violation[] = [];

    // Look for external API calls without Zod validation
    const apiCallResult = spawnSync(
      "rg",
      [
        "--type",
        "ts",
        "--line-number",
        String.raw`(fetch\(|axios\.|request\()`,
        ".",
      ],
      {
        encoding: "utf8",
        cwd: baseDirectory,
      },
    );

    if (apiCallResult.stdout) {
      for (const line of apiCallResult.stdout.split("\n")) {
        if (line.trim()) {
          const match = line.match(/^([^:]+):(\d+):(.*)/);
          if (match) {
            const [, file, lineNumber] = match;
            if (file && lineNumber) {
              violations.push({
                file: file.replace(`${baseDirectory}/`, ""),
                line: Number.parseInt(lineNumber, 10),
                code: "External API call without Zod validation",
                category: "best-practices",
                severity: "info",
                source: this.source,
                rule: "zod-missing-validation",
                message:
                  "Consider adding Zod validation for external API responses",
                fixSuggestion:
                  "Add Zod schema to validate and type external API responses",
              });
            }
          }
        }
      }
    }

    return violations;
  }

  /**
   * Calculate runtime validation coverage metrics
   */
  private calculateValidationCoverage(usage: ZodUsage, baseDirectory: string) {
    const totalSchemas = usage.schemaDefinitions.length;
    const usedSchemas = new Set([
      ...usage.parseUsages.map((u) => u.schema),
      ...usage.safeParsUsages.map((u) => u.schema),
    ]).size;

    const coverage = totalSchemas > 0 ? (usedSchemas / totalSchemas) * 100 : 0;

    return {
      totalSchemas,
      usedSchemas,
      unusedSchemas: totalSchemas - usedSchemas,
      coveragePercentage: Number(coverage.toFixed(1)),
      validationCallsTotal:
        usage.parseUsages.length + usage.safeParsUsages.length,
      parseCallsCount: usage.parseUsages.length,
      safeParseCallsCount: usage.safeParsUsages.length,
      riskLevel: this.assessRiskLevel(coverage, usage),
      baseline: this.getBaselineRecommendation(baseDirectory),
    };
  }

  /**
   * Generate coverage-based suggestions and violations
   */
  private generateCoverageSuggestions(coverage: any): Violation[] {
    const suggestions: Violation[] = [];

    // Only report coverage issues if there are actually Zod schemas defined
    if (coverage.totalSchemas === 0) {
      // No Zod schemas found - this is fine, don't report as an issue
      return suggestions;
    }

    // Coverage too low (only when schemas exist)
    if (coverage.coveragePercentage < 70) {
      suggestions.push({
        file: "package.json",
        line: 1,
        code: `Low Zod validation coverage: ${coverage.coveragePercentage}%`,
        category: "code-quality",
        severity: "warn",
        source: this.source,
        rule: "zod-low-coverage",
        message: `Runtime validation coverage is ${coverage.coveragePercentage}% (${coverage.usedSchemas}/${coverage.totalSchemas} schemas used). Consider increasing validation for better type safety.`,
        fixSuggestion:
          "Target 80%+ validation coverage. Add .parse() or .safeParse() calls for unused schemas.",
      });
    }

    // Too many unsafe parse() calls (only check if we have actual Zod usage)
    const unsafeParseRatio =
      coverage.parseCallsCount / Math.max(coverage.validationCallsTotal, 1);
    if (
      coverage.validationCallsTotal > 0 &&
      unsafeParseRatio > 0.7 &&
      coverage.parseCallsCount > 5
    ) {
      suggestions.push({
        file: "zod-usage",
        line: 1,
        code: `High ratio of unsafe .parse() calls: ${(unsafeParseRatio * 100).toFixed(1)}%`,
        category: "best-practices",
        severity: "info",
        source: this.source,
        rule: "zod-unsafe-parse-ratio",
        message: `${coverage.parseCallsCount} .parse() vs ${coverage.safeParseCallsCount} .safeParse() calls. Consider using .safeParse() for better error handling.`,
        fixSuggestion:
          "Replace .parse() with .safeParse() for external data validation to avoid throwing exceptions.",
      });
    }

    // Perfect coverage recognition
    if (coverage.coveragePercentage === 100 && coverage.totalSchemas > 0) {
      suggestions.push({
        file: "zod-coverage",
        line: 1,
        code: "Excellent Zod validation coverage: 100%",
        category: "code-quality",
        severity: "info",
        source: this.source,
        rule: "zod-excellent-coverage",
        message: `Perfect validation coverage achieved! All ${coverage.totalSchemas} Zod schemas are actively used.`,
        fixSuggestion:
          "Maintain this excellent validation discipline in future code changes.",
      });
    }

    return suggestions;
  }

  /**
   * Assess risk level based on coverage and usage patterns
   */
  private assessRiskLevel(
    coverage: number,
    usage: ZodUsage,
  ): "low" | "medium" | "high" {
    const hasExternalAPIs =
      usage.parseUsages.length + usage.safeParsUsages.length > 0;

    if (coverage >= 80 && hasExternalAPIs) {
      return "low";
    }
    if (coverage >= 50 || !hasExternalAPIs) {
      return "medium";
    }
    return "high";
  }

  /**
   * Get baseline recommendation based on project characteristics
   */
  private getBaselineRecommendation(baseDirectory: string): string {
    // Detect project type to provide contextual baselines
    const hasAPI = this.hasPattern(baseDirectory, "(api|routes|handlers)");
    const hasDatabase = this.hasPattern(
      baseDirectory,
      "(prisma|sequelize|mongoose|database)",
    );
    const hasExternalServices = this.hasPattern(
      baseDirectory,
      "(fetch|axios|http)",
    );

    if (hasAPI && hasDatabase && hasExternalServices) {
      return "Full-stack app: Target 85%+ coverage. Focus on API inputs, DB queries, and external service responses.";
    } else if (hasAPI) {
      return "API service: Target 90%+ coverage. Validate all request/response data at boundaries.";
    } else if (hasExternalServices) {
      return "External service integration: Target 80%+ coverage. Focus on validating external API responses.";
    } else {
      return "General TypeScript project: Target 70%+ coverage for external data sources and user inputs.";
    }
  }

  /**
   * Check if baseDir contains files matching a pattern
   */
  private hasPattern(baseDirectory: string, pattern: string): boolean {
    try {
      const result = spawnSync("rg", ["-l", "--type", "ts", pattern, "."], {
        cwd: baseDirectory,
        encoding: "utf8",
      });
      return !!result.stdout && result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  protected categorizeViolation(
    _message: string,
    _category?: string,
    _rule?: string,
    code?: string,
  ): string | undefined {
    if (!code) {
      return undefined;
    }

    if (code.includes("unused")) {
      return "unused-validation";
    }
    if (code.includes("over-validation")) {
      return "over-validation";
    }
    if (code.includes("missing")) {
      return "missing-validation";
    }

    return "zod-analysis";
  }

  protected override generateFixSuggestion(
    _message: string,
    _category?: string,
    _rule?: string,
    code?: string,
  ): string | undefined {
    if (!code) {
      return undefined;
    }

    if (code.includes("unused")) {
      return "Remove the unused Zod schema or add .parse()/.safeParse() calls where needed";
    }
    if (code.includes("over-validation")) {
      return "Consider using TypeScript types instead of runtime validation for internal data";
    }
    if (code.includes("missing")) {
      return "Add Zod schema validation for external data sources to ensure type safety at runtime";
    }

    return "Review Zod usage patterns for optimal type safety";
  }

  /**
   * Check if this appears to be validating external/untrusted data
   */
  private isLikelyExternalDataValidation(parseUsage: {
    file: string;
    line: number;
    schema: string;
  }): boolean {
    // Common patterns that indicate external data validation
    const externalDataPatterns = [
      "JSON.parse",
      "process.env",
      "process.argv",
      "arguments_",
      "package.json",
      "stdin",
      "http",
      "fetch",
      "request",
      "import(",
      "require(",
    ];

    // Check if the schema name suggests external data
    const externalSchemaPatterns = [
      "environment",
      "cli",
      "args",
      "package",
      "config",
      "json",
      "external",
    ];

    return (
      externalDataPatterns.some((pattern) =>
        parseUsage.schema.toLowerCase().includes(pattern),
      ) ||
      externalSchemaPatterns.some((pattern) =>
        parseUsage.schema.toLowerCase().includes(pattern),
      )
    );
  }
}
