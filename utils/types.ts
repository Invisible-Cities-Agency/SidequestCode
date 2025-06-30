/**
 * Clean type utilities using type-fest patterns
 * For code quality that Reddit can't criticize
 */

import type { Simplify } from 'type-fest';

/**
 * Clean deduplication strategy enum
 */
type DeduplicationStrategy = 'exact' | 'similar' | 'location';

/**
 * Simplified CLI flags interface
 */
export interface CLIFlags extends Record<string, unknown> {
  readonly help: boolean;
  readonly helpMarkdown: boolean;
  readonly helpQuick: boolean;
  readonly aiContext: boolean;
  readonly watch: boolean;
  readonly includeAny: boolean;
  readonly includeESLint: boolean;
  readonly eslintOnly: boolean;
  readonly targetPath: string;
  readonly verbose: boolean;
  readonly strict: boolean;
  readonly noCrossoverCheck: boolean;
  readonly failOnCrossover: boolean;
  readonly usePersistence: boolean;
  readonly showBurndown: boolean;
  readonly resetSession: boolean;
  readonly debugTerminal: boolean;
  readonly dataDir: string;
  readonly generatePRD: boolean;
  readonly configAction: string | undefined;
}

/**
 * Ensure proper orchestrator config typing
 */
export type OrchestratorConfigInput = Simplify<{
  targetPath: string;
  watch: {
    enabled: boolean;
    interval: number;
    debounce: number;
  };
  engines: {
    typescript: {
      enabled: boolean;
      options: {
        includeAny: boolean;
        strict: boolean;
        targetPath: string;
      };
      priority: number;
      timeout: number;
      allowFailure: boolean;
    };
    eslint: {
      enabled: boolean;
      options: {
        roundRobin: boolean;
        maxWarnings: number;
        timeout: number;
      };
      priority: number;
      timeout: number;
      allowFailure: boolean;
    };
    unusedExports: {
      enabled: boolean;
      options: Record<string, unknown>;
      priority: number;
      timeout: number;
      allowFailure: boolean;
    };
  };
  output: {
    console: boolean;
    json?: string;
  };
  deduplication: {
    enabled: boolean;
    strategy: DeduplicationStrategy;
  };
  crossover: {
    enabled: boolean;
    warnOnTypeAwareRules: boolean;
    warnOnDuplicateViolations: boolean;
    failOnCrossover: boolean;
  };
}>;
