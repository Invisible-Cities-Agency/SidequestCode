/**
 * @fileoverview TypeScript Compilation Engine
 *
 * Runs the client's TypeScript compiler configuration without imposing opinions.
 * Reports compilation errors exactly as TypeScript reports them.
 * Respects the client's tsconfig.json and compiler options.
 */

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { BaseAuditEngine } from "./base-engine.js";
import type {
  Violation,
  ViolationCategory,
  ViolationSeverity,
} from "../utils/violation-types.js";
import {
  safeJsonParse,
  TSConfigSchema,
  type ValidatedTSConfig,
} from "../utils/validation-schemas.js";
import { debugLog } from "../utils/debug-logger.js";
import { getPreferencesManager } from "../services/index.js";

/**
 * Engine for TypeScript compilation validation
 *
 * Runs `tsc --noEmit` using the client's tsconfig.json without modification.
 * Reports TypeScript compiler errors without categorization or opinion.
 * Optional: Includes pattern-based checks for unknown/any usage.
 */
export class TypeScriptAuditEngine extends BaseAuditEngine {
  private readonly baseDir: string;

  constructor(config?: {
    enabled?: boolean;
    options?: {
      includeAny?: boolean; // Optional pattern checking
      strict?: boolean; // For pattern checks only
      targetPath?: string;
      checkCompilation?: boolean; // Primary function: run tsc --noEmit
      enableCustomScripts?: boolean; // Run custom TSC scripts if found
      customScriptPreset?: string; // Preset to use for custom scripts (default: safe)
    };
    priority?: number;
    timeout?: number;
    allowFailure?: boolean;
  }) {
    const defaultConfig = {
      enabled: true,
      options: {
        includeAny: false, // Optional pattern checking
        strict: false, // For pattern checks only
        targetPath: "app",
        checkCompilation: true, // Primary function: run tsc --noEmit
        enableCustomScripts: true, // Automatically detect and run custom TSC scripts
        customScriptPreset: "safe", // Use safe preset to avoid overwhelming output
      },
      priority: 1,
      timeout: 30_000,
      allowFailure: false,
    };
    const mergedConfig = { ...defaultConfig, ...config };
    super("TypeScript Compiler", "typescript", mergedConfig);
    this.baseDir = process.cwd();
  }

  /**
   * Analyze TypeScript files for compilation errors and optional pattern violations
   */
  protected async analyze(
    targetPath: string,
    options: Record<string, unknown> = {},
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
    const checkCompilation =
      options["checkCompilation"] ??
      this.config.options["checkCompilation"] ??
      true;
    const includeAny =
      options["includeAny"] ?? this.config.options["includeAny"] ?? false;
    // Get custom script configuration from user preferences
    let enableCustomScripts = true;
    let customScriptPreset = "safe";
    
    try {
      const preferencesManager = getPreferencesManager();
      const preferences = preferencesManager.getAllPreferences();
      const customScriptConfig = preferences.preferences?.customTypeScriptScripts;
      
      enableCustomScripts = customScriptConfig?.enabled ?? true;
      customScriptPreset = customScriptConfig?.defaultPreset ?? "safe";
      
      // Allow override from options
      enableCustomScripts = (options["enableCustomScripts"] ?? this.config.options?.["enableCustomScripts"] ?? enableCustomScripts) as boolean;
      customScriptPreset = (options["customScriptPreset"] ?? this.config.options?.["customScriptPreset"] ?? customScriptPreset) as string;
    } catch (error) {
      // Fallback to defaults if config is unavailable
      debugLog("TypeScriptEngine", "Using fallback custom script config", { error: String(error) });
      enableCustomScripts = (options["enableCustomScripts"] ?? this.config.options?.["enableCustomScripts"] ?? true) as boolean;
      customScriptPreset = (options["customScriptPreset"] ?? this.config.options?.["customScriptPreset"] ?? "safe") as string;
    }
    const searchPath = path.join(this.baseDir, targetPath);

    // FIRST: Run TypeScript compiler to catch actual compilation errors
    if (checkCompilation) {
      const compilationViolations = await Promise.resolve(
        this.checkTypeScriptCompilation(searchPath),
      );
      violations.push(...compilationViolations);
    }

    // SECOND: Run custom TypeScript quality scripts if available
    if (enableCustomScripts) {
      debugLog("TypeScriptEngine", "Checking for custom TypeScript scripts", {
        enableCustomScripts,
        customScriptPreset,
        baseDir: this.baseDir,
      });
      const customViolations = await this.runCustomTypeScriptScripts(
        customScriptPreset as string,
      );
      debugLog("TypeScriptEngine", "Custom script violations found", {
        count: customViolations.length,
      });
      violations.push(...customViolations);
    }

    // OPTIONAL: Run pattern-based checks for unknown/any usage
    if (includeAny) {
      const patternViolations = this.checkPatternViolations(
        targetPath,
        options,
      );
      violations.push(...patternViolations);
    }

    return violations;
  }

  /**
   * Run TypeScript compiler to detect compilation errors
   */
  private checkTypeScriptCompilation(searchPath: string): Violation[] {
    const violations: Violation[] = [];

    // Find tsconfig.json
    const tsConfigPath = this.findTsConfig(searchPath);
    if (!tsConfigPath) {
      // If no tsconfig, try to run tsc on the directory directly
      return this.runTscOnDirectory(searchPath);
    }

    // Store client's TypeScript configuration in database for fast access
    this.cacheTypeScriptConfig(tsConfigPath);

    try {
      // Run tsc --noEmit with the found tsconfig (respecting their exact configuration)
      const result = spawnSync(
        "npx",
        ["tsc", "--noEmit", "--project", tsConfigPath],
        {
          encoding: "utf8",
          cwd: this.baseDir,
          signal: this.abortController?.signal,
        },
      );

      if (result.error) {
        console.warn(
          "[TypeScript Engine] Failed to run tsc:",
          result.error.message,
        );
        // Add warning violation instead of silently returning empty
        violations.push(
          this.createViolation(
            "typescript-setup",
            1,
            `TypeScript compiler failed: ${result.error.message}`,
            "setup-issue",
            "error",
            "TS-SETUP-001",
            `Failed to run TypeScript compiler. This may indicate TypeScript is not installed or configured properly. Error: ${result.error.message}`,
          ),
        );
        return violations;
      }

      // Parse TypeScript compiler output
      if (result.stderr) {
        const compilationViolations = this.parseTypeScriptErrors(
          result.stderr,
          tsConfigPath,
        );
        violations.push(...compilationViolations);
      }

      // Some errors might be in stdout
      if (result.stdout && result.stdout.includes("error TS")) {
        const compilationViolations = this.parseTypeScriptErrors(
          result.stdout,
          tsConfigPath,
        );
        violations.push(...compilationViolations);
      }
    } catch (error) {
      console.warn(
        "[TypeScript Engine] TypeScript compilation check failed:",
        error,
      );
      // Add warning violation for unexpected errors
      violations.push(
        this.createViolation(
          "typescript-setup",
          1,
          `TypeScript compilation check failed: ${error}`,
          "setup-issue",
          "error",
          "TS-SETUP-002",
          `TypeScript compilation check encountered an unexpected error. This may indicate a configuration issue. Error: ${error}`,
        ),
      );
    }

    return violations;
  }

  /**
   * Find tsconfig.json starting from search path and moving up
   */
  private findTsConfig(searchPath: string): string | null {
    let currentDirectory = searchPath;

    while (currentDirectory !== path.dirname(currentDirectory)) {
      const tsConfigPath = path.join(currentDirectory, "tsconfig.json");
      if (fs.existsSync(tsConfigPath)) {
        return tsConfigPath;
      }
      currentDirectory = path.dirname(currentDirectory);
    }

    // Check project root
    const rootTsConfig = path.join(this.baseDir, "tsconfig.json");
    if (fs.existsSync(rootTsConfig)) {
      return rootTsConfig;
    }

    return null;
  }

  /**
   * Run tsc directly on directory when no tsconfig found
   */
  private runTscOnDirectory(searchPath: string): Violation[] {
    const violations: Violation[] = [];

    try {
      const result = spawnSync(
        "npx",
        [
          "tsc",
          "--noEmit",
          "--target",
          "ES2024",
          "--module",
          "ESNext",
          "--strict",
          `${searchPath}/**/*.ts`,
        ],
        {
          encoding: "utf8",
          cwd: this.baseDir,
          signal: this.abortController?.signal,
        },
      );

      if (result.stderr) {
        const compilationViolations = this.parseTypeScriptErrors(result.stderr);
        violations.push(...compilationViolations);
      }
    } catch (error) {
      console.warn("[TypeScript Engine] Direct tsc compilation failed:", error);
      // Add warning violation for direct compilation failures
      violations.push(
        this.createViolation(
          "typescript-setup",
          1,
          `Direct TypeScript compilation failed: ${error}`,
          "setup-issue",
          "error",
          "TS-SETUP-003",
          `Direct TypeScript compilation failed when no tsconfig.json was found. This may indicate TypeScript is not installed. Error: ${error}`,
        ),
      );
    }

    return violations;
  }

  /**
   * Parse TypeScript compiler error output into violations
   */
  private parseTypeScriptErrors(
    errorOutput: string,
    _tsConfigPath?: string,
  ): Violation[] {
    const violations: Violation[] = [];
    const lines = errorOutput.split("\n");

    for (const line of lines) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      // Match TypeScript error format: file(line,col): error TSxxxx: message
      const match = line.match(
        /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/,
      );
      if (match) {
        const [, filePath, lineString, , severityString, ruleCode, message] =
          match;
        if (!filePath || !lineString || !message) {
          continue;
        }

        const line = Number.parseInt(lineString, 10);
        // const _column = parseInt(colStr || '0', 10);

        // Make path relative to base directory
        const relativePath = path.relative(this.baseDir, filePath);

        // Use TypeScript's own severity determination
        const severity: ViolationSeverity =
          severityString === "error" ? "error" : "warn";

        // Get category from database mapping or use default
        const category: ViolationCategory = this.getCategoryForRule(
          ruleCode || "TS0000",
        );

        violations.push(
          this.createViolation(
            relativePath,
            line,
            message.trim(),
            category,
            severity,
            ruleCode || "TS0000",
            message.trim(),
          ),
        );
      }
    }

    return violations;
  }

  /**
   * Cache TypeScript configuration in database for fast access during watch mode
   */
  private cacheTypeScriptConfig(tsConfigPath: string): void {
    try {
      const configContent = fs.readFileSync(tsConfigPath, "utf8");

      // Use Zod validation for secure tsconfig.json parsing
      const config: ValidatedTSConfig = safeJsonParse(
        configContent,
        TSConfigSchema,
        "tsconfig.json",
      );
      console.log("[Security] TypeScript configuration validated successfully");

      // Store in database (pseudo-code - would need actual DB connection)
      // This ensures watch mode and reports can access client configuration quickly
      const configSummary = {
        path: tsConfigPath,
        strict: config.compilerOptions?.strict ?? false,
        exactOptionalPropertyTypes:
          config.compilerOptions?.exactOptionalPropertyTypes ?? false,
        noUncheckedIndexedAccess:
          config.compilerOptions?.noUncheckedIndexedAccess ?? false,
        noImplicitAny: config.compilerOptions?.noImplicitAny ?? false,
        target: config.compilerOptions?.target ?? "ES5",
        module: config.compilerOptions?.module ?? "CommonJS",
        lastScanned: new Date().toISOString(),
      };

      // Log configuration discovery (without imposing opinion)
      console.log(
        `[TypeScript Engine] Client configuration loaded: ${tsConfigPath}`,
      );
      console.log(`[TypeScript Engine] Strict mode: ${configSummary.strict}`);
      console.log(`[TypeScript Engine] Target: ${configSummary.target}`);

      // TODO: Store configSummary in database for watch mode access
    } catch (error: any) {
      console.warn(
        "[TypeScript Engine] Could not validate TypeScript config:",
        error.message,
      );
      console.warn(
        "[TypeScript Engine] Continuing with default configuration...",
      );
    }
  }

  /**
   * Get category for rule from database mapping or create new mapping
   * Uses dynamic database-driven approach instead of hard-coded mappings
   */
  private getCategoryForRule(ruleCode: string): ViolationCategory {
    // TODO: Implement database lookup for rule category mapping
    // For now, use pattern-based fallback until database service is connected
    return this.getDefaultCategoryFromPattern(ruleCode);
  }

  /**
   * Pattern-based fallback for rule categorization until database is integrated
   */
  private getDefaultCategoryFromPattern(ruleCode: string): ViolationCategory {
    const numericCode = ruleCode.replace("TS", "");

    // Module resolution and import/export issues
    if (
      [
        "2307",
        "2305",
        "2306",
        "1016",
        "1259",
        "1192",
        "1149",
        "2451",
        "2393",
        "2440",
        "2300",
        "1038",
        "2339",
      ].includes(numericCode)
    ) {
      return "module-resolution";
    }

    // Null safety and undefined issues
    if (
      [
        "2532",
        "2533",
        "2531",
        "18048",
        "18047",
        "2454",
        "2722",
        "2721",
        "2345",
        "2322",
        "2349",
      ].includes(numericCode)
    ) {
      return "null-safety";
    }

    // Type annotation and type issues (most 7xxx codes and common type errors)
    if (
      /^7\d{3}$/.test(numericCode) ||
      ["2322", "2304", "2314", "2315", "2344", "2362", "2355", "2741"].includes(
        numericCode,
      )
    ) {
      return "type-alias";
    }

    // Unused code issues (6xxx codes and specific unused patterns)
    if (
      /^6\d{3}$/.test(numericCode) ||
      ["2695", "2578"].includes(numericCode)
    ) {
      return "unused-code";
    }

    // Class/inheritance and override issues
    if (
      [
        "4114",
        "2515",
        "2564",
        "2334",
        "2335",
        "2336",
        "2337",
        "2510",
        "2511",
        "2512",
        "2513",
        "2416",
        "2417",
      ].includes(numericCode)
    ) {
      return "inheritance";
    }

    // Index access and element access issues
    if (["4111", "2339", "2740", "2538", "7053"].includes(numericCode)) {
      return "index-access";
    }

    // Strict config and exactOptionalPropertyTypes issues
    if (["2375", "2379", "2412", "2783", "2784"].includes(numericCode)) {
      return "strict-config";
    }

    // Setup and configuration issues
    if (ruleCode.startsWith("TS-SETUP-")) {
      return "setup-issue";
    }

    // Syntax and parsing errors
    if (
      /^1\d{3}$/.test(numericCode) ||
      ["1005", "1109", "1161", "1434"].includes(numericCode)
    ) {
      return "syntax-error";
    }

    // Modernization (decorators, async/await, newer TS features)
    if (
      [
        "1206",
        "1207",
        "1208",
        "1219",
        "1308",
        "1353",
        "2794",
        "2705",
        "2706",
      ].includes(numericCode)
    ) {
      return "modernization";
    }

    // Generic/template issues
    if (["2313", "2314", "2430"].includes(numericCode)) {
      return "generic-constraint";
    }

    // Syntax/parsing errors (1xxx codes)
    if (/^1\d{3}$/.test(numericCode)) {
      return "syntax-error";
    }

    // Everything else is type-alias (type system issues)
    return "type-alias";
  }

  /**
   * Run pattern-based checks for unknown/any usage (legacy functionality)
   */
  private checkPatternViolations(
    targetPath: string,
    options: Record<string, unknown>,
  ): Violation[] {
    const violations: Violation[] = [];
    const includeAny =
      options["includeAny"] || this.config.options["includeAny"];
    const strict = options["strict"] || this.config.options["strict"];
    const searchPath = path.join(this.baseDir, targetPath);

    // Get search patterns based on configuration
    const patterns = this.getSearchPatterns(includeAny as boolean);
    const seen = new Set<string>();

    // Run ripgrep for each pattern
    for (const pattern of patterns) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      try {
        const result = spawnSync(
          "rg",
          [
            "--no-heading",
            "--line-number",
            "--glob",
            "*.ts",
            "--glob",
            "*.tsx",
            "-e",
            pattern,
            searchPath,
          ],
          {
            encoding: "utf8",
            signal: this.abortController?.signal,
          },
        );

        if (result.error) {
          continue; // Skip pattern if ripgrep fails
        }

        // Process results
        result.stdout.split("\n").forEach((line) => {
          if (line.trim()) {
            seen.add(line.trim());
          }
        });
      } catch {
        continue; // Skip pattern if ripgrep fails
      }
    }

    // Process found pattern violations
    for (const entry of seen) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      const [filePath, lineString, ...rest] = entry.split(":");
      const lineNumber = Number.parseInt(lineString || "0", 10);
      const code = rest.join(":").trim();

      // Skip invalid entries
      if (!filePath || Number.isNaN(lineNumber) || !code) {
        continue;
      }

      // Apply filtering rules
      if (this.shouldSkipViolation(code, filePath, strict as boolean)) {
        continue;
      }

      const { category, severity } = this.categorizePatternViolation(code);
      const relativePath = path.relative(this.baseDir, filePath);

      violations.push(
        this.createViolation(
          relativePath,
          lineNumber,
          code,
          category,
          severity,
          "pattern-check",
          this.generatePatternViolationMessage(category, code),
        ),
      );
    }

    return violations;
  }

  /**
   * Get search patterns for ripgrep based on configuration
   */
  private getSearchPatterns(includeAny: boolean): string[] {
    const patterns = [
      String.raw`:\s*unknown\b`,
      String.raw`=\s*unknown\b`,
      "<unknown>",
      "as unknown",
      "Record<string, unknown>",
    ];

    if (includeAny) {
      patterns.push(
        String.raw`:\s*any\b`,
        String.raw`=\s*any\b`,
        "<any>",
        "as any",
      );
    }

    return patterns;
  }

  /**
   * Determine if a pattern violation should be skipped based on filtering rules
   */
  private shouldSkipViolation(
    code: string,
    filePath: string,
    strict: boolean,
  ): boolean {
    // Skip if already using BrandedUnknown
    if (/BrandedUnknown/.test(code)) {
      return true;
    }

    // Skip comments
    if (/^\s*(\/\/|\*|\/\*)/.test(code)) {
      return true;
    }

    // In non-strict mode, skip legitimate usage patterns
    if (!strict && this.isLegitimateUsage(code, filePath)) {
      return true;
    }

    return false;
  }

  /**
   * Check if unknown/any usage is legitimate based on established patterns
   */
  private isLegitimateUsage(code: string, filePath: string): boolean {
    // TypeScript Declaration Files (.d.ts)
    if (filePath.endsWith(".d.ts")) {
      return true;
    }

    // Type Guard Functions
    if (
      /function\s+\w*(is|validate)\w*\s*\([^)]*value\s*:\s*unknown\s*\)/.test(
        code,
      )
    ) {
      return true;
    }

    // Error Handling Patterns
    if (
      /catch\s*\([^)]*error\s*:\s*unknown\s*\)/.test(code) ||
      /error\s*instanceof\s+Error\s*\?/.test(code)
    ) {
      return true;
    }

    // API Boundary Validation with Zod
    if (
      /\.parse\(.*unknown.*\)/.test(code) ||
      /schema\.parse\(/.test(code) ||
      /validateSchema\(/.test(code)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Categorize pattern-based violations (legacy functionality)
   */
  private categorizePatternViolation(code: string): {
    category: ViolationCategory;
    severity: ViolationSeverity;
  } {
    // Explicit any usage (no-explicit-any equivalent)
    if (/:\s*any\s*([&),;=\]|}]|$)/.test(code)) {
      return { category: "no-explicit-any", severity: "error" };
    }

    // Type alias definitions
    if (/^(export\s+)?type\s+\w+.*=.*unknown/.test(code)) {
      return { category: "type-alias", severity: "error" };
    }

    // Type annotations in parameters/variables (unknown)
    if (/:\s*unknown\s*([&),;=\]|}]|$)/.test(code)) {
      return { category: "annotation", severity: "warn" };
    }

    // Type casting
    if (/(as\s+(unknown|any)|<(unknown|any)>)/.test(code)) {
      return { category: "cast", severity: "warn" };
    }

    // Record types
    if (/Record<.*,\s*(unknown|any)>/.test(code)) {
      return { category: "record-type", severity: "info" };
    }

    // References to unknown in expressions
    if (/\bunknown\b/.test(code)) {
      return { category: "unknown-reference", severity: "info" };
    }

    // Default fallback
    return { category: "other", severity: "info" };
  }

  /**
   * Generate human-readable violation messages for pattern violations
   */
  private generatePatternViolationMessage(
    category: ViolationCategory,
    _code: string,
  ): string {
    switch (category) {
      case "no-explicit-any": {
        return "Explicit any type usage - replace with specific type or branded unknown";
      }
      case "type-alias": {
        return "Type alias uses unknown/any - consider defining proper interface";
      }
      case "annotation": {
        return "Parameter/variable uses unknown - consider specific typing or branded unknown";
      }
      case "cast": {
        return "Type casting to unknown/any - consider type guards or validation";
      }
      case "record-type": {
        return "Record type uses unknown - consider specific value types or branded unknown";
      }
      case "unknown-reference": {
        return "Reference to unknown type - verify if proper typing is possible";
      }
      default: {
        return "Type system violation detected - review for proper typing";
      }
    }
  }

  /**
   * Provide fix suggestions for TypeScript violations
   */
  protected override generateFixSuggestion(
    category: ViolationCategory,
    rule?: string,
    _code?: string,
  ): string | undefined {
    // For TypeScript compiler errors, let the compiler message speak for itself
    if (rule?.startsWith("TS")) {
      return "Refer to TypeScript error message for specific fix guidance";
    }

    // For pattern violations (legacy functionality)
    switch (category) {
      case "type-alias": {
        return "Define a proper interface based on the actual data structure";
      }
      case "annotation": {
        return "Add specific type annotation based on expected value type";
      }
      case "cast": {
        return "Use Zod validation with schema.parse() instead of type casting";
      }
      case "record-type": {
        return "Replace Record<string, unknown> with specific property types";
      }
      default: {
        return "Review TypeScript configuration and error message for guidance";
      }
    }
  }

  /**
   * Detect and run custom TypeScript quality scripts
   */
  private async runCustomTypeScriptScripts(
    preset: string,
  ): Promise<Violation[]> {
    const violations: Violation[] = [];

    try {
      // Check for package.json
      const packageJsonPath = path.join(this.baseDir, "package.json");
      debugLog("TypeScriptEngine", "Checking for package.json", {
        packageJsonPath,
        exists: fs.existsSync(packageJsonPath),
      });

      if (!fs.existsSync(packageJsonPath)) {
        debugLog(
          "TypeScriptEngine",
          "No package.json found, skipping custom scripts",
        );
        return violations;
      }

      // Read and parse package.json
      const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
      const packageJson = JSON.parse(packageJsonContent);

      debugLog("TypeScriptEngine", "package.json parsed", {
        hasScripts: !!packageJson.scripts,
        scriptCount: packageJson.scripts
          ? Object.keys(packageJson.scripts).length
          : 0,
      });

      if (!packageJson.scripts) {
        debugLog("TypeScriptEngine", "No scripts section in package.json");
        return violations;
      }

      // Detect custom TypeScript scripts
      const customScripts = this.detectCustomTypeScriptScripts(
        packageJson.scripts,
      );
      debugLog("TypeScriptEngine", "Custom script detection results", {
        customScripts,
        count: customScripts.length,
      });

      if (customScripts.length === 0) {
        return violations;
      }

      // Check for TypeScript quality system directory
      const hasTypeScriptSystem = this.hasCustomTypeScriptSystem();
      debugLog("TypeScriptEngine", "TypeScript system detection", {
        hasTypeScriptSystem,
        customScripts: customScripts.length,
      });

      if (!hasTypeScriptSystem) {
        debugLog("TypeScriptEngine", "No custom TypeScript system detected");
        return violations;
      }

      // Run the most appropriate custom script
      const scriptToRun = this.selectBestCustomScript(customScripts, preset);
      debugLog("TypeScriptEngine", "Selected script to run", {
        scriptToRun,
        preset,
        availableScripts: customScripts,
      });

      if (scriptToRun) {
        debugLog("TypeScriptEngine", "Executing custom TypeScript script", {
          scriptName: scriptToRun,
        });
        const customViolations = await this.executeCustomTypeScriptScript(
          scriptToRun,
          preset,
        );
        debugLog("TypeScriptEngine", "Custom script execution complete", {
          violationsFound: customViolations.length,
        });
        violations.push(...customViolations);
      } else {
        debugLog("TypeScriptEngine", "No suitable custom script found to run");
      }
    } catch (error) {
      console.warn(
        "[TypeScript Engine] Failed to run custom TypeScript scripts:",
        error,
      );
      // Don't fail the entire analysis if custom scripts fail
    }

    return violations;
  }

  /**
   * Detect custom TypeScript scripts in package.json
   */
  private detectCustomTypeScriptScripts(
    scripts: Record<string, string>,
  ): string[] {
    const customScripts: string[] = [];

    for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
      // Look for scripts that start with 'tsc:' or 'type-check:'
      if (
        (scriptName.startsWith("tsc:") ||
          scriptName.startsWith("type-check:")) &&
        !scriptName.includes("legacy") &&
        !scriptName.includes("original")
      ) {
        // Check if it's a custom quality script (not just tsc --noEmit)
        if (
          scriptCommand.includes("scripts/typescript/") ||
          scriptCommand.includes("run-all.js") ||
          scriptCommand.includes("--preset")
        ) {
          customScripts.push(scriptName);
        }
      }
    }

    return customScripts;
  }

  /**
   * Check if the project has a custom TypeScript quality system
   */
  private hasCustomTypeScriptSystem(): boolean {
    const typeScriptSystemPaths = [
      path.join(this.baseDir, "scripts/typescript/config.js"),
      path.join(this.baseDir, "scripts/typescript/run-all.js"),
      path.join(this.baseDir, "scripts/typescript"),
    ];

    return typeScriptSystemPaths.some((tsPath) => fs.existsSync(tsPath));
  }

  /**
   * Select the best custom script to run based on preset and user configuration
   */
  private selectBestCustomScript(
    customScripts: string[],
    preset: string,
  ): string | null {
    try {
      // Get user preferences for custom script mappings
      const preferencesManager = getPreferencesManager();
      const preferences = preferencesManager.getAllPreferences();
      const customScriptConfig = preferences.preferences?.customTypeScriptScripts;

      // Use configured preset mappings if available
      const presetMappings = customScriptConfig?.presetMappings || {};
      const preferredScripts = presetMappings[preset];

      if (preferredScripts && Array.isArray(preferredScripts)) {
        // Find the first preferred script that exists
        for (const preferredScript of preferredScripts) {
          if (customScripts.includes(preferredScript)) {
            debugLog("TypeScriptEngine", "Selected script from user config", {
              preset,
              selectedScript: preferredScript,
              configuredPreferences: preferredScripts,
            });
            return preferredScript;
          }
        }
      }

      // Fallback to default mappings if no user config or no matches
      const defaultMappings: Record<string, string[]> = {
        safe: ["tsc:safe", "type-check", "tsc:dev"],
        strict: ["tsc:strict", "type-check:strict", "tsc:ci"],
        dev: ["tsc:dev", "tsc:safe", "type-check"],
        ci: ["tsc:ci", "tsc:strict", "type-check:strict"],
      };

      const fallbackScripts = defaultMappings[preset] || defaultMappings["safe"] || [];
      
      for (const fallbackScript of fallbackScripts) {
        if (customScripts.includes(fallbackScript)) {
          debugLog("TypeScriptEngine", "Selected script from fallback defaults", {
            preset,
            selectedScript: fallbackScript,
            fallbackPreferences: fallbackScripts,
          });
          return fallbackScript;
        }
      }

      // Final fallback to the first available custom script
      const firstScript = customScripts[0] || null;
      if (firstScript) {
        debugLog("TypeScriptEngine", "Selected first available script", {
          selectedScript: firstScript,
          allScripts: customScripts,
        });
      }
      
      return firstScript;
    } catch (error) {
      debugLog("TypeScriptEngine", "Error selecting custom script, using fallback", {
        error: String(error),
        availableScripts: customScripts,
      });
      
      // Error fallback - just return first script
      return customScripts[0] || null;
    }
  }

  /**
   * Execute a custom TypeScript script and parse its output
   */
  private async executeCustomTypeScriptScript(
    scriptName: string,
    _preset: string,
  ): Promise<Violation[]> {
    const violations: Violation[] = [];

    try {
      // Get configured timeout
      let scriptTimeout = 60000; // Default 60 seconds
      try {
        const preferencesManager = getPreferencesManager();
        const preferences = preferencesManager.getAllPreferences();
        const customScriptConfig = preferences.preferences?.customTypeScriptScripts;
        scriptTimeout = customScriptConfig?.scriptTimeout ?? 60000;
      } catch (error) {
        debugLog("TypeScriptEngine", "Using default script timeout", { error: String(error) });
      }

      // Determine the package manager
      const packageManager = this.detectPackageManager();
      const runCommand =
        packageManager === "yarn" ? "yarn" : `${packageManager} run`;

      // Execute the custom script
      const command = runCommand.split(" ")[0];
      if (!command) {
        throw new Error(`Invalid package manager command: ${runCommand}`);
      }

      debugLog("TypeScriptEngine", "Executing custom script with config", {
        scriptName,
        packageManager,
        timeout: scriptTimeout,
      });

      const result = spawnSync(
        command,
        [...(packageManager === "yarn" ? [] : ["run"]), scriptName],
        {
          encoding: "utf8",
          cwd: this.baseDir,
          timeout: scriptTimeout,
          signal: this.abortController?.signal,
        },
      );

      if (result.error) {
        console.warn(
          `[TypeScript Engine] Failed to run custom script ${scriptName}:`,
          result.error.message,
        );
        return violations;
      }

      // Parse the output to extract violations
      const customViolations = this.parseCustomScriptOutput(
        result.stdout || "",
        result.stderr || "",
        scriptName,
      );

      violations.push(...customViolations);
    } catch (error) {
      console.warn(
        `[TypeScript Engine] Error executing custom script ${scriptName}:`,
        error,
      );
    }

    return violations;
  }

  /**
   * Parse output from custom TypeScript scripts
   */
  private parseCustomScriptOutput(
    stdout: string,
    stderr: string,
    scriptName: string,
  ): Violation[] {
    const violations: Violation[] = [];
    const output = stdout + stderr;

    // Look for common custom script error patterns
    const errorPatterns = [
      // Pattern: filename(line,col): message
      /^(.+?)\((\d+),(\d+)\):\s*(.+)$/gm,
      // Pattern: filename:line:col: message
      /^(.+?):(\d+):(\d+):\s*(.+)$/gm,
      // Pattern: Error: message in filename:line
      /Error:\s*(.+?)\s+in\s+(.+?):(\d+)/gm,
      // Pattern: [rule-name] message (filename:line:col)
      /\[([^\]]+)\]\s*(.+?)\s*\((.+?):(\d+):(\d+)\)/gm,
    ];

    for (const pattern of errorPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const violation = this.createCustomScriptViolation(match, scriptName);
        if (violation) {
          violations.push(violation);
        }
      }
    }

    // If no specific patterns matched, look for summary information
    if (violations.length === 0) {
      const summaryMatch = output.match(/(\d+)\s+(error|warning)s?\s+found/i);
      if (summaryMatch && summaryMatch[1] && summaryMatch[2]) {
        const count = parseInt(summaryMatch[1], 10);
        const severity = summaryMatch[2].toLowerCase() as ViolationSeverity;

        if (count > 0) {
          violations.push(
            this.createViolation(
              "custom-script-summary",
              1,
              `Custom TypeScript script '${scriptName}' found ${count} ${severity}s`,
              "type-quality",
              severity,
              `CUSTOM-${scriptName.toUpperCase()}`,
              `The custom TypeScript quality script '${scriptName}' detected ${count} ${severity}s. Run '${scriptName}' directly for detailed output.`,
            ),
          );
        }
      }
    }

    return violations;
  }

  /**
   * Create a violation from custom script output
   */
  private createCustomScriptViolation(
    match: RegExpExecArray,
    scriptName: string,
  ): Violation | null {
    try {
      // Different patterns have different capture groups
      let filePath: string;
      let line: number;
      let message: string;
      let ruleName: string | undefined;

      if (match.length === 5 && match[1] && match[2] && match[3] && match[4]) {
        // Pattern: filename(line,col): message
        filePath = match[1];
        line = parseInt(match[2], 10);
        message = match[4];
      } else if (
        match.length === 6 &&
        match[1] &&
        match[2] &&
        match[3] &&
        match[4] &&
        match[5]
      ) {
        // Pattern: [rule-name] message (filename:line:col)
        ruleName = match[1];
        message = match[2];
        filePath = match[3];
        line = parseInt(match[4], 10);
      } else {
        return null;
      }

      // Determine severity based on script name and message
      const severity: ViolationSeverity = this.determineCustomScriptSeverity(
        scriptName,
        message,
      );

      // Categorize the violation
      const category = this.categorizeCustomScriptViolation(
        scriptName,
        ruleName || "",
        message,
      );

      return this.createViolation(
        filePath,
        line,
        message,
        category,
        severity,
        ruleName
          ? `CUSTOM-${ruleName.toUpperCase()}`
          : `CUSTOM-${scriptName.toUpperCase()}`,
        `Custom TypeScript quality check detected: ${message}`,
      );
    } catch (error) {
      console.warn(
        "[TypeScript Engine] Failed to parse custom script violation:",
        error,
      );
      return null;
    }
  }

  /**
   * Determine severity for custom script violations
   */
  private determineCustomScriptSeverity(
    scriptName: string,
    message: string,
  ): ViolationSeverity {
    // High severity scripts/messages
    if (
      scriptName.includes("floating-promises") ||
      scriptName.includes("unsafe") ||
      message.toLowerCase().includes("error")
    ) {
      return "error";
    }

    // Medium severity
    if (
      scriptName.includes("explicit-any") ||
      scriptName.includes("return-type") ||
      message.toLowerCase().includes("warning")
    ) {
      return "warn";
    }

    // Default to info for architectural/quality checks
    return "info";
  }

  /**
   * Categorize custom script violations
   */
  private categorizeCustomScriptViolation(
    scriptName: string,
    ruleName: string,
    message: string,
  ): ViolationCategory {
    // Map common custom script types to categories
    if (
      scriptName.includes("floating-promises") ||
      ruleName.includes("floating-promises")
    ) {
      return "async-issues";
    }

    if (
      scriptName.includes("explicit-any") ||
      ruleName.includes("explicit-any") ||
      message.includes("any")
    ) {
      return "no-explicit-any";
    }

    if (
      scriptName.includes("return-type") ||
      ruleName.includes("return-type")
    ) {
      return "annotation";
    }

    if (
      scriptName.includes("domain") ||
      scriptName.includes("layer") ||
      ruleName.includes("domain")
    ) {
      return "architecture";
    }

    if (scriptName.includes("branded") || ruleName.includes("branded")) {
      return "type-alias";
    }

    // Default category
    return "type-quality";
  }

  /**
   * Detect the package manager being used
   */
  private detectPackageManager(): string {
    if (fs.existsSync(path.join(this.baseDir, "pnpm-lock.yaml"))) {
      return "pnpm";
    }
    if (fs.existsSync(path.join(this.baseDir, "yarn.lock"))) {
      return "yarn";
    }
    if (fs.existsSync(path.join(this.baseDir, "bun.lockb"))) {
      return "bun";
    }
    return "npm";
  }
}
