/**
 * Execution utilities for running external commands
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

export const execPromise = promisify(exec);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  maxBuffer?: number;
}