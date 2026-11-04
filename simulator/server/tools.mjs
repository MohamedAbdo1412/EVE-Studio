/**
 * Native tool detection and bounded process execution.
 *
 * Nothing here reports success for a tool unless the executable actually ran.
 * Every result carries the exact command line that produced it.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

export const TOOL_DEFINITIONS = Object.freeze([
  {
    id: 'iverilog',
    label: 'Icarus Verilog compiler',
    commands: ['iverilog', 'iverilog.exe'],
    versionArgs: ['-V'],
    role: 'Compiles RTL and testbenches',
  },
  {
    id: 'vvp',
    label: 'Icarus VVP runtime',
    commands: ['vvp', 'vvp.exe'],
    versionArgs: ['-V'],
    role: 'Executes the compiled simulation',
  },
  {
    id: 'yosys',
    label: 'Yosys',
    commands: ['yosys', 'yosys.exe'],
    versionArgs: ['-V'],
    role: 'Synthesis checks (not a Gowin bitstream)',
  },
  {
    id: 'verilator',
    label: 'Verilator',
    commands: ['verilator', 'verilator_bin', 'verilator.exe', 'verilator_bin.exe'],
    versionArgs: ['--version'],
    role: 'Lint and alternative simulation',
  },
  {
    id: 'platformio',
    label: 'PlatformIO Core',
    commands: ['pio', 'pio.exe', 'platformio'],
    versionArgs: ['--version'],
    role: 'ESP32 firmware compilation (separate from HDL)',
  },
]);

function withToolPath(env) {
  const additions = [];
  if (env.EVE_TOOL_BIN) additions.push(env.EVE_TOOL_BIN);
  if (env.EVE_OSS_CAD_SUITE) {
    additions.push(path.join(env.EVE_OSS_CAD_SUITE, 'bin'));
    additions.push(env.EVE_OSS_CAD_SUITE);
  }
  if (!additions.length) return env;
  return { ...env, PATH: [...additions, env.PATH || ''].join(path.delimiter) };
}

/**
 * Run a process with a hard timeout and output cap.
 *
 * @returns {Promise<{ok:boolean,state:'completed'|'timeout'|'spawn-error',code:number|null,signal:string|null,
 *   stdout:string,stderr:string,log:string,durationMs:number,command:string,args:string[]}>}
 */
export function runProcess({
  command,
  args = [],
  cwd,
  timeoutMs = 30_000,
  maxOutputBytes = 2 * 1024 * 1024,
  env = process.env,
  onChunk,
}) {
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let total = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const child = spawn(command, args, {
      cwd,
      env: withToolPath(env),
      windowsHide: true,
      shell: false,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, Math.max(100, timeoutMs));

    const append = (chunk, stream) => {
      const text = chunk.toString('utf8');
      if (stream === 'stdout') stdout += text;
      else stderr += text;
      total += text.length;
      if (total > maxOutputBytes) {
        truncated = true;
        const keep = Math.max(0, maxOutputBytes - Math.floor(maxOutputBytes / 2));
        stdout = stdout.slice(0, keep);
        stderr = stderr.slice(0, Math.max(0, maxOutputBytes - keep));
      }
      onChunk?.({ stream, text });
    };

    child.stdout.on('data', (chunk) => append(chunk, 'stdout'));
    child.stderr.on('data', (chunk) => append(chunk, 'stderr'));

    const finish = (state, code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const exitCode = timedOut ? null : code;
      const ok = state === 'completed' && !timedOut && code === 0;
      const log = [stdout, stderr].filter(Boolean).join('\n').trim();
      resolve({
        ok,
        state: timedOut ? 'timeout' : state,
        code: exitCode,
        signal,
        stdout,
        stderr,
        log: truncated ? `${log}\n[output truncated at ${maxOutputBytes} bytes]` : log,
        truncated,
        durationMs: Date.now() - started,
        command,
        args,
      });
    };

    child.on('error', (error) => {
      stderr += `\n${error.message}`;
      finish('spawn-error', null, null);
    });
    child.on('close', (code, signal) => finish('completed', code, signal));
  });
}

async function probeTool(definition, env) {
  let last = null;
  for (const command of definition.commands) {
    const result = await runProcess({
      command,
      args: definition.versionArgs,
      timeoutMs: 8_000,
      maxOutputBytes: 64 * 1024,
      env,
    });
    if (result.state !== 'spawn-error') {
      const versionLine = `${result.stdout}\n${result.stderr}`
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      return {
        id: definition.id,
        label: definition.label,
        role: definition.role,
        available: result.ok,
        command,
        version: result.ok ? versionLine || 'version output unavailable' : null,
        detail: result.ok
          ? `Verified by running "${command} ${definition.versionArgs.join(' ')}".`
          : `Executable was found but the version probe failed: ${versionLine || 'no output'}`,
        probe: {
          state: result.state,
          code: result.code,
          durationMs: result.durationMs,
        },
      };
    }
    last = result;
  }
  return {
    id: definition.id,
    label: definition.label,
    role: definition.role,
    available: false,
    command: null,
    version: null,
    detail:
      definition.id === 'platformio'
        ? 'PlatformIO was not found on PATH. Firmware stays SOURCE GENERATED — TOOLCHAIN NOT AVAILABLE.'
        : `${definition.label} was not found. This capability is reported as unavailable.`,
    probe: { state: last?.state || 'spawn-error', code: last?.code ?? null, durationMs: last?.durationMs || 0 },
  };
}

export async function detectTools({ env = process.env } = {}) {
  const tools = await Promise.all(TOOL_DEFINITIONS.map((definition) => probeTool(definition, env)));
  const byId = Object.fromEntries(tools.map((tool) => [tool.id, tool]));
  return {
    tools,
    byId,
    hdlReady: Boolean(byId.iverilog?.available && byId.vvp?.available),
    summary: {
      available: tools.filter((tool) => tool.available).length,
      total: tools.length,
      hdl: byId.iverilog?.available
        ? byId.vvp?.available
          ? 'Icarus compile and run available'
          : 'iverilog found, vvp missing'
        : 'Icarus Verilog not available',
    },
    checkedAt: new Date().toISOString(),
    environment: {
      pathAdditions: [env.EVE_TOOL_BIN, env.EVE_OSS_CAD_SUITE].filter(Boolean),
    },
  };
}
