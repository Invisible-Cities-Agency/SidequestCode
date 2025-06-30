/**
 * @fileoverview Zod Validation Schemas
 *
 * Comprehensive validation schemas for external data boundaries.
 * Provides runtime type safety for CLI arguments, external process outputs,
 * configuration files, and environment variables.
 */

import { z } from "zod";

// =============================================================================
// CLI FLAGS AND ARGUMENTS
// =============================================================================

/**
 * CLI Flags validation schema
 * Validates all command-line flags to prevent injection attacks
 */
export const CLIFlagsSchema = z
  .object({
    help: z.boolean().default(false),
    helpMarkdown: z.boolean().default(false),
    helpQuick: z.boolean().default(false),
    aiContext: z.boolean().default(false),
    watch: z.boolean().default(false),
    includeAny: z.boolean().default(false),
    includeESLint: z.boolean().default(false),
    eslintOnly: z.boolean().default(false),
    targetPath: z
      .string()
      .regex(/^[\w./-]+$/, "Invalid target path characters")
      .max(256, "Target path too long")
      .default("."),
    verbose: z.boolean().default(false),
    strict: z.boolean().default(false),
    noCrossoverCheck: z.boolean().default(false),
    failOnCrossover: z.boolean().default(false),
    usePersistence: z.boolean().default(true),
    showBurndown: z.boolean().default(false),
    resetSession: z.boolean().default(false),
    resumeSession: z.boolean().default(false),
    debugTerminal: z.boolean().default(false),
    dataDir: z
      .string()
      .regex(/^[\w./-]+$/, "Invalid data directory path")
      .max(256, "Data directory path too long")
      .default("./data"),
    generatePRD: z.boolean().default(false),
    installShortcuts: z.boolean().default(false),
    configAction: z
      .string()
      .regex(/^(show|edit|reset)$/, "Invalid config action")
      .optional(),
  })
  .strict();

export type ValidatedCLIFlags = z.infer<typeof CLIFlagsSchema>;

// =============================================================================
// ENVIRONMENT VARIABLES
// =============================================================================

/**
 * Environment variables validation schema
 * Validates environment variables to prevent malicious injection
 */
export const EnvironmentSchema = z
  .object({
    CQO_DB_PATH: z
      .string()
      .regex(/^[\w./-]+$/, "Invalid database path characters")
      .max(512, "Database path too long")
      .optional(),
    TERM_COLOR_MODE: z.enum(["light", "dark", "auto"]).optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    DEBUG: z.string().optional(),
    CI: z.string().optional(),
  })
  .strict();

export type ValidatedEnvironment = z.infer<typeof EnvironmentSchema>;

// =============================================================================
// TYPESCRIPT CONFIGURATION
// =============================================================================

/**
 * TypeScript configuration validation schema
 * Validates tsconfig.json structure to prevent malicious configurations
 */
export const TSConfigSchema = z
  .object({
    compilerOptions: z
      .object({
        strict: z.boolean().optional(),
        exactOptionalPropertyTypes: z.boolean().optional(),
        noUncheckedIndexedAccess: z.boolean().optional(),
        noImplicitAny: z.boolean().optional(),
        target: z.string().optional(),
        module: z.string().optional(),
        lib: z.array(z.string()).optional(),
        outDir: z.string().optional(),
        rootDir: z.string().optional(),
        baseUrl: z.string().optional(),
        paths: z.record(z.array(z.string())).optional(),
        esModuleInterop: z.boolean().optional(),
        allowSyntheticDefaultImports: z.boolean().optional(),
        moduleResolution: z.string().optional(),
      })
      .optional(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    extends: z.string().optional(),
  })
  .passthrough(); // Allow additional TypeScript options

export type ValidatedTSConfig = z.infer<typeof TSConfigSchema>;

// =============================================================================
// ESLINT OUTPUT VALIDATION
// =============================================================================

/**
 * Complete ESLint output validation schema
 * Validates ESLint JSON output with inline schema definitions
 */
export const ESLintOutputSchema = z
  .array(
    z
      .object({
        filePath: z
          .string()
          .max(512, "File path too long")
          .regex(/\.(ts|tsx|js|jsx)$/, "Invalid file extension"),
        messages: z.array(
          z
            .object({
              ruleId: z.string().nullable(),
              severity: z.number().min(0).max(2),
              message: z.string().max(1000, "Message too long"),
              line: z.number().positive().max(100_000, "Line number too large"),
              column: z
                .number()
                .positive()
                .max(1000, "Column number too large")
                .optional(),
              nodeType: z.string().nullable().optional(),
              messageId: z.string().optional(),
              endLine: z.number().positive().optional(),
              endColumn: z.number().positive().optional(),
              fix: z
                .object({
                  range: z.tuple([z.number(), z.number()]),
                  text: z.string(),
                })
                .optional(),
              suggestions: z.array(z.any()).optional(),
              suppressions: z.array(z.any()).optional(),
            })
            .passthrough(),
        ), // Allow additional ESLint fields
        suppressedMessages: z.array(z.any()).optional(),
        errorCount: z.number().min(0).max(10_000, "Error count too large"),
        fatalErrorCount: z
          .number()
          .min(0)
          .max(10_000, "Fatal error count too large"),
        warningCount: z.number().min(0).max(10_000, "Warning count too large"),
        fixableErrorCount: z
          .number()
          .min(0)
          .max(10_000, "Fixable error count too large"),
        fixableWarningCount: z
          .number()
          .min(0)
          .max(10_000, "Fixable warning count too large"),
        usedDeprecatedRules: z
          .array(
            z.object({
              ruleId: z.string(),
              replacedBy: z.array(z.string()),
            }),
          )
          .optional(),
        source: z.string().optional(),
      })
      .passthrough(), // Allow additional ESLint fields
  )
  .max(1000, "Too many files in ESLint output");

export type ValidatedESLintOutput = z.infer<typeof ESLintOutputSchema>;

// TypeScript engine uses regex parsing instead of Zod validation for performance

// =============================================================================
// PACKAGE.JSON VALIDATION
// =============================================================================

/**
 * Package.json validation schema
 * Validates package.json structure for dependency checking
 */
export const PackageJsonSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    dependencies: z.record(z.string()).optional(),
    devDependencies: z.record(z.string()).optional(),
    peerDependencies: z.record(z.string()).optional(),
    scripts: z.record(z.string()).optional(),
  })
  .passthrough(); // Allow additional package.json fields

export type ValidatedPackageJson = z.infer<typeof PackageJsonSchema>;

// User preferences use manual JSON parsing for now
// Ripgrep validation not implemented yet

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Safe JSON parsing with Zod validation
 * Prevents JSON injection attacks by validating structure
 */
export function safeJsonParse<T>(
  json: string,
  schema: z.ZodSchema<T>,
  context: string = "unknown",
): T {
  try {
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);

    if (!result.success) {
      throw new Error(`Invalid ${context} format: ${result.error.message}`);
    }

    return result.data;
  } catch (error: any) {
    if (error.message.includes("Invalid")) {
      throw error; // Re-throw validation errors
    }
    throw new Error(`Failed to parse ${context} JSON: ${error.message}`);
  }
}

/**
 * Safe environment variable access with validation
 * Validates environment variables to prevent injection
 */
export function safeEnvironmentAccess(): ValidatedEnvironment {
  const environment = {
    CQO_DB_PATH: process.env["CQO_DB_PATH"],
    TERM_COLOR_MODE: process.env["TERM_COLOR_MODE"],
    NODE_ENV: process.env["NODE_ENV"],
    DEBUG: process.env["DEBUG"],
    CI: process.env["CI"],
  };

  const result = EnvironmentSchema.safeParse(environment);

  if (!result.success) {
    console.warn(
      `[Security] Invalid environment variables detected: ${result.error.message}`,
    );
    // Return safe defaults instead of throwing
    return {
      CQO_DB_PATH: undefined,
      TERM_COLOR_MODE: undefined,
      NODE_ENV: undefined,
      DEBUG: undefined,
      CI: undefined,
    };
  }

  return result.data;
}

/**
 * Safe CLI arguments parsing with validation
 * Validates command-line arguments to prevent injection
 */
export function safeCLIArgumentsParse(arguments_: string[]): ValidatedCLIFlags {
  // Extract flags from command line arguments
  const flags = {
    help: arguments_.includes("--help") || arguments_.includes("-h"),
    helpMarkdown: arguments_.includes("--help-markdown"),
    helpQuick: arguments_.includes("--help-quick"),
    aiContext: arguments_.includes("--ai-context"),
    watch: arguments_.includes("--watch"),
    includeAny: arguments_.includes("--include-any"),
    includeESLint: arguments_.includes("--include-eslint"),
    eslintOnly: arguments_.includes("--eslint-only"),
    targetPath: (() => {
      const pathIndex = arguments_.indexOf("--path");
      if (pathIndex !== -1 && pathIndex + 1 < arguments_.length) {
        return arguments_[pathIndex + 1] || ".";
      }
      return ".";
    })(),
    verbose: arguments_.includes("--verbose"),
    strict: arguments_.includes("--strict"),
    noCrossoverCheck: arguments_.includes("--no-crossover-check"),
    failOnCrossover: arguments_.includes("--fail-on-crossover"),
    usePersistence: !arguments_.includes("--no-persistence"),
    showBurndown: arguments_.includes("--burndown"),
    resetSession: arguments_.includes("--reset-session"),
    resumeSession: arguments_.includes("--resume"),
    debugTerminal: arguments_.includes("--debug-terminal"),
    dataDir: (() => {
      const dataDirectoryIndex = arguments_.indexOf("--data-dir");
      if (
        dataDirectoryIndex !== -1 &&
        dataDirectoryIndex + 1 < arguments_.length
      ) {
        return arguments_[dataDirectoryIndex + 1] || "./data";
      }
      return "./data";
    })(),
    generatePRD: arguments_.includes("--prd"),
    installShortcuts: arguments_.includes("--install-shortcuts"),
    configAction: (() => {
      const configIndex = arguments_.indexOf("--config");
      if (configIndex === -1) {
        return; // No --config flag provided
      }
      const nextArgument = arguments_[configIndex + 1];
      if (nextArgument && !nextArgument.startsWith("--")) {
        return nextArgument; // --config show, --config reset, --config edit
      }
      return "show"; // Default to show if just --config
    })(),
  };

  const result = CLIFlagsSchema.safeParse(flags);

  if (!result.success) {
    throw new Error(`Invalid command-line arguments: ${result.error.message}`);
  }

  return result.data;
}

// File path validation not implemented yet
