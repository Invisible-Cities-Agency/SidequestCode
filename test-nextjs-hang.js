#!/usr/bin/env node

/**
 * Test script to reproduce NextJS watch mode hang
 * Run this from the NextJS project directory
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the built CLI
const cliPath = path.join(__dirname, 'dist', 'lib', 'cli.js');

console.log('🔍 Testing SideQuest watch mode hang...');
console.log('📁 Target: /Users/ianarmstrong/www/POCMA/NextJS');
console.log(`🎯 CLI: ${cliPath}`);
console.log('');

// Change to NextJS directory and run watch mode with debug
const child = spawn('node', [cliPath, '--watch', '--debug'], {
  cwd: '/Users/ianarmstrong/www/POCMA/NextJS',
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: '--no-warnings'
  }
});

// Set a timeout to kill the process if it hangs
const timeout = setTimeout(() => {
  console.log('');
  console.log('❌ Process hung for 30 seconds, killing...');
  child.kill('SIGTERM');
  process.exit(1);
}, 30_000);

child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  if (signal) {
    console.log(`🔪 Process killed with signal: ${signal}`);
  } else {
    console.log(`✅ Process exited with code: ${code}`);
  }
});

child.on('error', (error) => {
  clearTimeout(timeout);
  console.error('❌ Error running process:', error);
  process.exit(1);
});
