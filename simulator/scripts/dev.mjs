#!/usr/bin/env node
/**
 * Start the EVE Simulator backend and Vite UI together.
 *
 * This is a convenience launcher only. It does not install tools or fabricate
 * results: the backend probes the native executables on every fresh request.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIMULATOR_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(SIMULATOR_ROOT, '..');

const viteBin = [
  path.join(SIMULATOR_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
  path.join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
].find((candidate) => existsSync(candidate));

if (!viteBin) {
  console.error('Vite was not found. Run "npm install" at the repository root first.');
  process.exit(1);
}

const env = { ...process.env };
if (!env.EVE_OSS_CAD_SUITE) {
  const portable = path.join(tmpdir(), 'eve-tools', 'oss-cad-suite');
  if (existsSync(portable)) {
    env.EVE_OSS_CAD_SUITE = portable;
    console.log(`Discovered portable OSS CAD Suite: ${portable}`);
  }
}
if (!env.EVE_TOOL_BIN && process.env.EVE_OSS_CAD_SUITE) {
  env.EVE_TOOL_BIN = path.join(process.env.EVE_OSS_CAD_SUITE, 'bin');
}

const children = [];
let shuttingDown = false;

function start(label, command, args, options) {
  const child = spawn(command, args, {
    cwd: SIMULATOR_ROOT,
    env,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  children.push({ label, child });
  child.on('error', (error) => {
    console.error(`[${label}] failed to start: ${error.message}`);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.log(`[${label}] exited (${signal || code}).`);
    shutdown(code ?? 1);
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) {
      try {
        child.kill();
      } catch {
        // Best-effort shutdown.
      }
    }
  }
  setTimeout(() => process.exit(code), 250).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Starting EVE Simulator backend on http://127.0.0.1:5174 ...');
start('backend', process.execPath, ['server/index.mjs']);

console.log('Starting EVE Simulator UI on http://127.0.0.1:5175 ...');
start('ui', process.execPath, [viteBin, '--port', '5175', '--strictPort']);
