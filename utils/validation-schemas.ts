/**
 * @fileoverview Zod Validation Schemas
 * 
 * Comprehensive validation schemas for external data boundaries.
 * Provides runtime type safety for CLI arguments, external process outputs,
 * configuration files, and environment variables.
 */

import { z } from 'zod';

// =============================================================================
// CLI FLAGS AND ARGUMENTS
// =============================================================================

/**
 * CLI Flags validation schema
 * Validates all command-line flags to prevent injection attacks
 */
export const CLIFlagsSchema = z.object({
  help: z.boolean().default(false),
  helpMarkdown: z.boolean().default(false),
  helpQuick: z.boolean().default(false),
  aiContext: z.boolean().default(false),
  watch: z.boolean().default(false),
  includeAny: z.boolean().default(false),
  includeESLint: z.boolean().default(false),
  eslintOnly: z.boolean().default(false),
  targetPath: z.string()
    .regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid target path characters')
    .max(256, 'Target path too long')
    .default('.'),
  verbose: z.boolean().default(false),
  strict: z.boolean().default(false),
  noCrossoverCheck: z.boolean().default(false),
  failOnCrossover: z.boolean().default(false),
  usePersistence: z.boolean().default(true),
  showBurndown: z.boolean().default(false),
  resetSession: z.boolean().default(false),
  debugTerminal: z.boolean().default(false),
  dataDir: z.string()
    .regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid data directory path')
    .max(256, 'Data directory path too long')
    .default('./data'),
  generatePRD: z.boolean().default(false),
  configAction: z.string()
    .regex(/^(show|edit|reset)$/, 'Invalid config action')
    .optional(),
  skipSetup: z.boolean().default(false),
}).strict();

export type ValidatedCLIFlags = z.infer<typeof CLIFlagsSchema>;

// =============================================================================
// ENVIRONMENT VARIABLES
// =============================================================================

/**
 * Environment variables validation schema
 * Validates environment variables to prevent malicious injection
 */
export const EnvironmentSchema = z.object({
  CQO_DB_PATH: z.string()
    .regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid database path characters')
    .max(512, 'Database path too long')
    .optional(),
  TERM_COLOR_MODE: z.enum(['light', 'dark', 'auto']).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  DEBUG: z.string().optional(),
  CI: z.string().optional(),
}).strict();

export type ValidatedEnvironment = z.infer<typeof EnvironmentSchema>;

// =============================================================================
// TYPESCRIPT CONFIGURATION
// =============================================================================

/**
 * TypeScript configuration validation schema
 * Validates tsconfig.json structure to prevent malicious configurations
 */
export const TSConfigSchema = z.object({
  compilerOptions: z.object({
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
  }).optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  extends: z.string().optional(),
}).passthrough(); // Allow additional TypeScript options

export type ValidatedTSConfig = z.infer<typeof TSConfigSchema>;

// =============================================================================
// ESLINT OUTPUT VALIDATION
// =============================================================================

/**
 * ESLint result message validation schema
 */
export const ESLintMessageSchema = z.object({
  ruleId: z.string().nullable(),
  severity: z.number().min(0).max(2),
  message: z.string().max(1000, 'Message too long'),
  line: z.number().positive().max(100000, 'Line number too large'),
  column: z.number().positive().max(1000, 'Column number too large').optional(),
  nodeType: z.string().optional(),
  messageId: z.string().optional(),
  endLine: z.number().positive().optional(),
  endColumn: z.number().positive().optional(),
  fix: z.object({
    range: z.tuple([z.number(), z.number()]),
    text: z.string(),
  }).optional(),
  suggestions: z.array(z.any()).optional(),
  suppressions: z.array(z.any()).optional(),
}).passthrough(); // Allow additional ESLint fields

/**
 * ESLint file result validation schema
 */
export const ESLintFileResultSchema = z.object({
  filePath: z.string()
    .max(512, 'File path too long')
    .regex(/\.(ts|tsx|js|jsx)$/, 'Invalid file extension'),
  messages: z.array(ESLintMessageSchema),
  suppressedMessages: z.array(ESLintMessageSchema).optional(),
  errorCount: z.number().min(0).max(10000, 'Error count too large'),
  fatalErrorCount: z.number().min(0).max(10000, 'Fatal error count too large'),
  warningCount: z.number().min(0).max(10000, 'Warning count too large'),
  fixableErrorCount: z.number().min(0).max(10000, 'Fixable error count too large'),
  fixableWarningCount: z.number().min(0).max(10000, 'Fixable warning count too large'),
  usedDeprecatedRules: z.array(z.object({
    ruleId: z.string(),
    replacedBy: z.array(z.string()),
  })).optional(),
  source: z.string().optional(),
}).passthrough(); // Allow additional ESLint fields

/**
 * Complete ESLint output validation schema
 */
export const ESLintOutputSchema = z.array(ESLintFileResultSchema)
  .max(1000, 'Too many files in ESLint output');

export type ValidatedESLintOutput = z.infer<typeof ESLintOutputSchema>;

// =============================================================================
// TYPESCRIPT COMPILER OUTPUT
// =============================================================================

/**
 * TypeScript compiler error validation schema
 * Validates tsc output to prevent malicious error injection
 */
export const TypeScriptErrorSchema = z.object({
  file: z.string()
    .max(512, 'File path too long')
    .regex(/\.(ts|tsx)$/, 'Invalid TypeScript file extension'),
  line: z.number().positive().max(100000, 'Line number too large'),
  column: z.number().positive().max(1000, 'Column number too large'),
  severity: z.enum(['error', 'warning']),
  code: z.string()
    .regex(/^TS\d{4,5}$/, 'Invalid TypeScript error code format')
    .max(10, 'Error code too long'),
  message: z.string().max(1000, 'Error message too long'),
}).strict();

export type ValidatedTypeScriptError = z.infer<typeof TypeScriptErrorSchema>;

// =============================================================================
// PACKAGE.JSON VALIDATION
// =============================================================================

/**
 * Package.json validation schema
 * Validates package.json structure for dependency checking
 */
export const PackageJsonSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  dependencies: z.record(z.string()).optional(),
  devDependencies: z.record(z.string()).optional(),
  peerDependencies: z.record(z.string()).optional(),
  scripts: z.record(z.string()).optional(),
}).passthrough(); // Allow additional package.json fields

export type ValidatedPackageJson = z.infer<typeof PackageJsonSchema>;

// =============================================================================
// USER PREFERENCES VALIDATION
// =============================================================================

/**
 * User preferences validation schema
 * Validates user configuration to prevent malicious preferences
 */
export const UserPreferencesSchema = z.object({
  hasCompletedFirstRun: z.boolean().default(false),
  analysisScope: z.enum(['errors-only', 'warnings', 'complete']).default('errors-only'),
  terminalColorPreference: z.enum(['auto', 'light', 'dark']).default('auto'),
  showToolSeparationWarning: z.boolean().default(true),
  showEducationalHints: z.boolean().default(true),
}).strict();

export type ValidatedUserPreferences = z.infer<typeof UserPreferencesSchema>;

// =============================================================================
// RIPGREP OUTPUT VALIDATION
// =============================================================================

/**
 * Ripgrep output line validation schema
 * Validates rg command output to prevent injection attacks
 */
export const RipgrepLineSchema = z.object({
  file: z.string()
    .max(512, 'File path too long')
    .regex(/\.(ts|tsx|js|jsx)$/, 'Invalid file extension'),
  line: z.number().positive().max(100000, 'Line number too large'),
  content: z.string().max(2000, 'Line content too long'),
}).strict();

export type ValidatedRipgrepLine = z.infer<typeof RipgrepLineSchema>;

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
  context: string = 'unknown'
): T {
  try {
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);
    
    if (!result.success) {
      throw new Error(`Invalid ${context} format: ${result.error.message}`);
    }
    
    return result.data;
  } catch (error: any) {
    if (error.message.includes('Invalid')) {
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
  const env = {
    CQO_DB_PATH: process.env['CQO_DB_PATH'],
    TERM_COLOR_MODE: process.env['TERM_COLOR_MODE'],
    NODE_ENV: process.env['NODE_ENV'],
    DEBUG: process.env['DEBUG'],
    CI: process.env['CI'],
  };
  
  const result = EnvironmentSchema.safeParse(env);
  
  if (!result.success) {
    console.warn(`[Security] Invalid environment variables detected: ${result.error.message}`);
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
export function safeCLIArgsParse(args: string[]): ValidatedCLIFlags {
  // Extract flags from command line arguments  
  const flags = {
    help: args.includes('--help') || args.includes('-h'),
    helpMarkdown: args.includes('--help-markdown'),
    helpQuick: args.includes('--help-quick'),
    aiContext: args.includes('--ai-context'),
    watch: args.includes('--watch'),
    includeAny: args.includes('--include-any'),
    includeESLint: args.includes('--include-eslint'),
    eslintOnly: args.includes('--eslint-only'),
    targetPath: (() => {
      const pathIndex = args.indexOf('--path');
      if (pathIndex !== -1 && pathIndex + 1 < args.length) {
        return args[pathIndex + 1] || '.';
      }
      return '.';
    })(),
    verbose: args.includes('--verbose'),
    strict: args.includes('--strict'),
    noCrossoverCheck: args.includes('--no-crossover-check'),
    failOnCrossover: args.includes('--fail-on-crossover'),
    usePersistence: !args.includes('--no-persistence'),
    showBurndown: args.includes('--burndown'),
    resetSession: args.includes('--reset-session'),
    debugTerminal: args.includes('--debug-terminal'),
    dataDir: (() => {
      const dataDirectoryIndex = args.indexOf('--data-dir');
      if (dataDirectoryIndex !== -1 && dataDirectoryIndex + 1 < args.length) {
        return args[dataDirectoryIndex + 1] || './data';
      }
      return './data';
    })(),
    generatePRD: args.includes('--prd'),
    configAction: (() => {
      const configIndex = args.indexOf('--config');
      if (configIndex === -1) {
        return undefined; // No --config flag provided
      }
      const nextArgument = args[configIndex + 1];
      if (nextArgument && !nextArgument.startsWith('--')) {
        return nextArgument; // --config show, --config reset, --config edit
      }
      return 'show'; // Default to show if just --config
    })(),
    skipSetup: args.includes('--skip-setup'),
  };
  
  const result = CLIFlagsSchema.safeParse(flags);
  
  if (!result.success) {
    throw new Error(`Invalid command-line arguments: ${result.error.message}`);
  }
  
  return result.data;
}

/**
 * Security validation for file paths
 * Prevents path traversal attacks
 */
export const FilePathSchema = z.string()
  .max(512, 'File path too long')
  .regex(/^[^<>:"|?*\x00-\x1f]+$/, 'Invalid characters in file path')
  .refine(path => !path.includes('..'), 'Path traversal not allowed')
  .refine(path => !path.startsWith('/etc'), 'System directory access not allowed')
  .refine(path => !path.startsWith('/root'), 'Root directory access not allowed');

export type ValidatedFilePath = z.infer<typeof FilePathSchema>;