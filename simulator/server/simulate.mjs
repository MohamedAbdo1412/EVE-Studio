/**
 * Real HDL simulation jobs.
 *
 * Every function here shells out to Icarus Verilog and returns the log the tool
 * actually produced. There is no JavaScript renderer in this path.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './tools.mjs';
import { parseRom, HEADER_FIELDS } from '../../packages/eve-binary/rom.js';
import { framePackageFromRom } from '../../packages/eve-binary/framePackage.js';
import { sha256Hex } from '../../packages/eve-binary/checksums.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');
export const HARDWARE_ROOT = path.join(REPO_ROOT, 'hardware');

const TIMING_RTL = path.join('rtl', 'video', 'eve_video_timing.sv');
const TIMING_TB = path.join('testbench', 'tb_eve_video_timing.sv');
const RENDERER_RTL = path.join('rtl', 'renderer', 'eve_renderer.sv');
const RENDERER_TB = path.join('testbench', 'tb_eve_frame_capture.sv');

const FRAME_OBJECT_LIMIT = 16;
const FRAME_TEXT_BYTES = 4096;
const FRAME_FONT_BYTES = 4096;
const MAX_FRAME_PIXELS = 1920 * 1080;

function unavailable(tool) {
  return {
    ok: false,
    status: 'UNAVAILABLE',
    detail: `${tool} is not installed. No simulation was run.`,
    log: '',
  };
}

function toolFor(tools, id) {
  if (tools?.byId?.[id]) return tools.byId[id];
  return tools?.tools?.find((tool) => tool.id === id) || null;
}

function parseVerdict(log) {
  const pass = /^PASS:/m.test(log);
  const fail = /^FAIL:/m.test(log);
  if (pass && !fail) return 'PASS';
  if (fail) return 'FAIL';
  return 'UNKNOWN';
}

async function compileAndRun({
  tools,
  env,
  cwd,
  rtl,
  testbench,
  runArgs = [],
  timeoutMs,
  onChunk,
}) {
  const iverilog = toolFor(tools, 'iverilog');
  const vvp = toolFor(tools, 'vvp');
  if (!iverilog?.available) return { unavailable: 'iverilog' };
  if (!vvp?.available) return { unavailable: 'vvp' };

  const work = await mkdtemp(path.join(tmpdir(), 'eve-sim-'));
  const output = path.join(work, 'sim.vvp');
  const sources = Array.isArray(rtl) ? rtl : [rtl];
  const compile = await runProcess({
    command: iverilog.command || 'iverilog',
    args: ['-g2012', '-Wall', '-o', output, ...sources, testbench],
    cwd,
    timeoutMs: 60_000,
    env,
    onChunk: onChunk ? (chunk) => onChunk({ phase: 'compile', ...chunk }) : undefined,
  });
  if (!compile.ok) {
    await rm(work, { recursive: true, force: true });
    return {
      compile: { ...compile, phase: 'compile' },
      status: compile.state === 'timeout' ? 'TIMEOUT' : 'COMPILE_ERROR',
    };
  }

  const run = await runProcess({
    command: vvp.command || 'vvp',
    args: [output, ...runArgs],
    cwd,
    timeoutMs,
    env,
    maxOutputBytes: 4 * 1024 * 1024,
    onChunk: onChunk ? (chunk) => onChunk({ phase: 'run', ...chunk }) : undefined,
  });
  return { work, compile, run };
}

/**
 * Run the timing testbench.
 *
 * @param {object} options
 * @param {'fast'|'full'} [options.profile]
 */
export async function runTimingVerification({
  profile = 'fast',
  tools,
  env = process.env,
  timeoutMs = 240_000,
  onChunk,
} = {}) {
  if (!['fast', 'full'].includes(profile)) {
    return { ok: false, status: 'BAD_REQUEST', detail: `Unknown timing profile "${profile}"`, log: '' };
  }
  const iverilog = toolFor(tools, 'iverilog');
  if (!iverilog?.available) return unavailable('Icarus Verilog');
  const vvp = toolFor(tools, 'vvp');
  if (!vvp?.available) return unavailable('VVP');

  const outcome = await compileAndRun({
    tools,
    env,
    cwd: HARDWARE_ROOT,
    rtl: TIMING_RTL,
    testbench: TIMING_TB,
    runArgs: profile === 'full' ? ['+PROFILE=full'] : [],
    timeoutMs,
    onChunk,
  });
  if (outcome.unavailable) return unavailable(outcome.unavailable);
  if (!outcome.run) {
    return {
      ok: false,
      status: outcome.status,
      profile,
      detail:
        outcome.status === 'TIMEOUT'
          ? 'Icarus compilation exceeded the time limit.'
          : 'Icarus rejected the RTL or testbench.',
      log: outcome.compile.log,
      durationMs: outcome.compile.durationMs,
      command: { tool: 'iverilog', args: outcome.compile.args },
    };
  }

  const log = [outcome.compile.log, outcome.run.log].filter(Boolean).join('\n');
  const verdict = outcome.run.state === 'timeout' ? 'TIMEOUT' : parseVerdict(outcome.run.log);
  return {
    ok: verdict === 'PASS',
    status: verdict,
    profile,
    detail:
      verdict === 'PASS'
        ? `Icarus verified ${profile === 'full' ? '1920x1080 @ 30 Hz reference' : '320x180 fast functional'} timing.`
        : verdict === 'TIMEOUT'
          ? 'Simulation exceeded the time limit before completing the frame.'
          : 'Icarus reported a timing testbench failure or produced no verdict.',
    log,
    durationMs: outcome.compile.durationMs + outcome.run.durationMs,
    command: {
      compile: [outcome.compile.command, ...outcome.compile.args].join(' '),
      run: [outcome.run.command, ...outcome.run.args].join(' '),
    },
  };
}

function validateFramePackage(pkg) {
  if (!pkg || typeof pkg !== 'object') throw new Error('framePackage object is required');
  for (const key of ['meta', 'oamHex', 'textHex', 'fontHex']) {
    if (typeof pkg[key] !== 'string') throw new Error(`framePackage.${key} must be a string`);
  }
  const meta = pkg.meta.trim().split(/\s+/);
  if (meta.length !== 4) throw new Error('frame.meta must be "<width> <height> <objectCount> <bgRGBHex>"');
  const width = Number(meta[0]);
  const height = Number(meta[1]);
  const objectCount = Number(meta[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('frame.meta width and height must be positive integers');
  }
  if (width * height > MAX_FRAME_PIXELS) {
    throw new Error(`Frame ${width}x${height} exceeds the ${MAX_FRAME_PIXELS}-pixel backend limit`);
  }
  if (!Number.isInteger(objectCount) || objectCount < 0 || objectCount > FRAME_OBJECT_LIMIT) {
    throw new Error(`objectCount must be 0..${FRAME_OBJECT_LIMIT}; the RTL renderer does not truncate objects`);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(meta[3])) throw new Error('background must be a 6-digit RGB hex value');

  const oamLines = pkg.oamHex.trim() ? pkg.oamHex.trim().split(/\r?\n/) : [];
  if (oamLines.length !== objectCount) {
    throw new Error(`oamHex has ${oamLines.length} objects but frame.meta declares ${objectCount}`);
  }
  for (const line of oamLines) {
    if (!/^[0-9a-fA-F]{40}$/.test(line.trim())) {
      throw new Error('each OAM record must be exactly 40 hex characters (160 bits)');
    }
  }

  const countHexBytes = (text) => (text.trim() ? text.trim().split(/\r?\n/).length : 0);
  if (countHexBytes(pkg.textHex) !== FRAME_TEXT_BYTES) {
    throw new Error(`textHex must contain exactly ${FRAME_TEXT_BYTES} bytes`);
  }
  if (countHexBytes(pkg.fontHex) !== FRAME_FONT_BYTES) {
    throw new Error(`fontHex must contain exactly ${FRAME_FONT_BYTES} bytes`);
  }
  return { width, height, objectCount, background: meta[3].toLowerCase() };
}

function parsePpm(bytes) {
  const headerText = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 256))).toString('latin1');
  const match = headerText.match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  if (!match) throw new Error('RTL capture did not produce a valid binary PPM (P6)');
  const width = Number(match[1]);
  const height = Number(match[2]);
  const maxValue = Number(match[3]);
  if (maxValue !== 255) throw new Error(`Unsupported PPM max value ${maxValue}`);
  const pixelOffset = match[0].length;
  const expected = width * height * 3;
  const pixels = bytes.subarray(pixelOffset, pixelOffset + expected);
  if (pixels.length !== expected) {
    throw new Error(`PPM is ${pixels.length} pixel bytes, expected ${expected}`);
  }
  return { width, height, pixels, byteLength: bytes.length };
}

/**
 * Run the RTL renderer testbench and return its pixels.
 *
 * @param {object} options
 * @param {object} [options.framePackage]  meta/oamHex/textHex/fontHex
 * @param {string} [options.romBase64]     16 MiB EVE ROM (alternative input)
 * @param {boolean} [options.checkDeterminism]
 */
export async function runFrameCapture({
  framePackage,
  romBase64,
  pageIndex,
  tools,
  env = process.env,
  timeoutMs = 240_000,
  checkDeterminism = false,
  onChunk,
} = {}) {
  const iverilog = toolFor(tools, 'iverilog');
  if (!iverilog?.available) return unavailable('Icarus Verilog');
  const vvp = toolFor(tools, 'vvp');
  if (!vvp?.available) return unavailable('VVP');

  let pkg = framePackage;
  let romHeader = null;
  let romWarnings = [];
  if (!pkg && romBase64) {
    const romBytes = Buffer.from(String(romBase64), 'base64');
    const parsed = parseRom(romBytes, { verifyChecksums: true });
    if (!parsed.ok) {
      return { ok: false, status: 'BAD_ROM', detail: `ROM failed validation: ${parsed.error}`, log: '' };
    }
    const frame = framePackageFromRom(parsed, {
      pageIndex: Number.isInteger(pageIndex) ? pageIndex : undefined,
    });
    pkg = { meta: frame.meta, oamHex: frame.oamHex, textHex: frame.textHex, fontHex: frame.fontHex };
    romWarnings = frame.warnings;
    romHeader = {
      format: parsed.header.format,
      width: parsed.header.width,
      height: parsed.header.height,
      buildId: `0x${parsed.header.buildId.toString(16).toUpperCase().padStart(8, '0')}`,
      sha256: parsed.header.sha256,
      usedBytes: parsed.header.usedBytes,
      initialPage: parsed.header.initialPage,
    };
  }

  let frameInfo;
  try {
    frameInfo = validateFramePackage(pkg);
  } catch (error) {
    return { ok: false, status: 'BAD_FRAME_PACKAGE', detail: error.message, log: '' };
  }
  if (frameInfo.objectCount === 0) {
    // Still valid: the renderer outputs the background for every pixel.
  }

  const work = await mkdtemp(path.join(tmpdir(), 'eve-frame-'));
  const frameDir = path.join(work, 'frame');
  await mkdir(frameDir, { recursive: true });
  try {
    await writeFile(path.join(frameDir, 'frame.meta'), pkg.meta, 'utf8');
    await writeFile(path.join(frameDir, 'oam.hex'), pkg.oamHex, 'utf8');
    await writeFile(path.join(frameDir, 'text.hex'), pkg.textHex, 'utf8');
    await writeFile(path.join(frameDir, 'font.hex'), pkg.fontHex, 'utf8');

    const runOnce = async (suffix) => {
      const ppmPath = path.join(work, `frame-${suffix}.ppm`);
      const outcome = await compileAndRun({
        tools,
        env,
        cwd: HARDWARE_ROOT,
        rtl: RENDERER_RTL,
        testbench: RENDERER_TB,
        runArgs: [`+DIR=${frameDir}`, `+OUT=${ppmPath}`],
        timeoutMs,
        onChunk,
      });
      if (outcome.unavailable) return { unavailable: outcome.unavailable };
      if (!outcome.run) return { compileFailure: outcome };
      let ppm;
      try {
        ppm = await readFile(ppmPath);
      } catch {
        return { missingPpm: outcome };
      }
      return { outcome, ppm };
    };

    const first = await runOnce('a');
    if (first.unavailable) return unavailable(first.unavailable);
    if (first.compileFailure) {
      return {
        ok: false,
        status: first.compileFailure.status,
        detail: 'Icarus rejected the RTL or frame-capture testbench.',
        log: first.compileFailure.compile.log,
      };
    }
    if (first.missingPpm) {
      return {
        ok: false,
        status: 'NO_CAPTURE',
        detail: 'The testbench ran but did not write a PPM image.',
        log: [first.missingPpm.compile.log, first.missingPpm.run.log].filter(Boolean).join('\n'),
      };
    }

    const parsed = parsePpm(first.ppm);
    const pixelSha256 = sha256Hex(parsed.pixels);
    let deterministic = null;
    let secondLog = '';
    if (checkDeterminism) {
      const second = await runOnce('b');
      if (second.missingPpm || second.compileFailure) {
        deterministic = false;
      } else {
        const again = parsePpm(second.ppm);
        deterministic = sha256Hex(again.pixels) === pixelSha256;
        secondLog = second.outcome.run.log;
      }
    }

    const log = [
      first.outcome.compile.log,
      first.outcome.run.log,
      secondLog,
    ]
      .filter(Boolean)
      .join('\n');
    const verdict = first.outcome.run.state === 'timeout' ? 'TIMEOUT' : parseVerdict(first.outcome.run.log);
    return {
      ok: verdict === 'PASS',
      status: verdict,
      detail:
        verdict === 'PASS'
          ? `Icarus rendered ${parsed.width}x${parsed.height} from HDL in ${first.outcome.run.durationMs} ms.`
          : 'The frame-capture testbench did not report PASS.',
      width: parsed.width,
      height: parsed.height,
      frame: {
        ...frameInfo,
        objects: frameInfo.objectCount,
        pageIndex: Number.isInteger(pageIndex) ? pageIndex : null,
        rom: romHeader,
        warnings: romWarnings,
      },
      pixels: {
        rgbBase64: Buffer.from(parsed.pixels).toString('base64'),
        sha256: pixelSha256,
        byteLength: parsed.pixels.length,
        ppmBytes: parsed.byteLength,
      },
      deterministic,
      log,
      durationMs: first.outcome.compile.durationMs + first.outcome.run.durationMs,
      command: {
        compile: [first.outcome.compile.command, ...first.outcome.compile.args].join(' '),
        run: [first.outcome.run.command, ...first.outcome.run.args].join(' '),
      },
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Run the flash and/or SDRAM memory testbenches.
 *
 * Each selected test compiles real RTL plus its model and testbench with
 * Icarus, runs the resulting VVP and reports the verdict and counters printed
 * by the simulator. No memory timing is computed in JavaScript.
 *
 * @param {object} options
 * @param {'flash'|'sdram'|'all'} [options.device]
 */
export async function runMemoryVerification({
  device = 'all',
  tools,
  env = process.env,
  timeoutMs = 300_000,
  onChunk,
} = {}) {
  const selected = device === 'all' ? ['flash', 'sdram'] : [device];
  if (selected.some((id) => !['flash', 'sdram'].includes(id))) {
    return { ok: false, status: 'BAD_REQUEST', detail: `Unknown memory device "${device}"`, log: '' };
  }
  const iverilog = toolFor(tools, 'iverilog');
  if (!iverilog?.available) return unavailable('Icarus Verilog');
  const vvp = toolFor(tools, 'vvp');
  if (!vvp?.available) return unavailable('VVP');

  const tests = {
    flash: {
      title: 'W25Q128JV page/sector model',
      rtl: [path.join('rtl', 'flash', 'w25q128jv_model.sv'), path.join('rtl', 'flash', 'eve_flash_writer.sv')],
      testbench: path.join('testbench', 'tb_eve_flash_writer.sv'),
      summaryPattern: /PASS: W25Q128JV page\/sector model verified \((\d+) page programs, (\d+) sector erases, range guard, page-cross detection\)/,
      metrics: (match) => ({
        pagePrograms: Number(match[1]),
        sectorErases: Number(match[2]),
      }),
      notes: [
        'Command-layer model. Physical SPI pin timing (tPP, tSE, tRES1) is not simulated.',
        '16 MiB capacity, 256-byte program pages and 4 KiB erase sectors; request delays are shortened simulation values.',
      ],
    },
    sdram: {
      title: 'IS42S16400J-6 timing model',
      rtl: [path.join('rtl', 'ram', 'is42s16400j_model.sv'), path.join('rtl', 'ram', 'eve_sdram_ctrl.sv')],
      testbench: path.join('testbench', 'tb_eve_sdram.sv'),
      summaryPattern: /PASS: IS42S16400J-6 timing verified \(ACT (\d+), READ (\d+), WRITE (\d+), PRE (\d+), REF (\d+), max refresh gap (\d+) cycles\)/,
      metrics: (match) => ({
        activates: Number(match[1]),
        reads: Number(match[2]),
        writes: Number(match[3]),
        precharges: Number(match[4]),
        refreshes: Number(match[5]),
        maxRefreshGap: Number(match[6]),
      }),
      notes: [
        'Reference -6 timings: CL=3, tRCD=3, tRP=3, tRAS=7, tRC=10, tWR=2, tMRD=2, tRFC=12 cycles.',
        'Refresh interval target is 2604 cycles; power-up wait is 33200 cycles. These are simulation parameters, not board qualification.',
        'Cycle-level command timing only; pinout, package and signal integrity are not qualified.',
        'Clock is an abstract 10 ns simulation clock; physical board timing closure is not claimed.',
      ],
    },
  };

  const results = [];
  for (const id of selected) {
    const spec = tests[id];
    const outcome = await compileAndRun({
      tools,
      env,
      cwd: HARDWARE_ROOT,
      rtl: spec.rtl,
      testbench: spec.testbench,
      runArgs: [],
      timeoutMs,
      onChunk,
    });
    if (outcome.unavailable) {
      return { ...unavailable(outcome.unavailable), device: id, results };
    }
    if (!outcome.run) {
      results.push({
        id,
        title: spec.title,
        ok: false,
        status: outcome.status,
        detail:
          outcome.status === 'TIMEOUT'
            ? 'Icarus compilation exceeded the time limit.'
            : 'Icarus rejected the RTL, model or testbench.',
        log: outcome.compile.log,
        durationMs: outcome.compile.durationMs,
        metrics: null,
        notes: spec.notes,
        command: {
          compile: [outcome.compile.command, ...outcome.compile.args].join(' '),
        },
      });
      continue;
    }

    const log = [outcome.compile.log, outcome.run.log].filter(Boolean).join('\n');
    const verdict = outcome.run.state === 'timeout' ? 'TIMEOUT' : parseVerdict(outcome.run.log);
    const match = outcome.run.log.match(spec.summaryPattern);
    results.push({
      id,
      title: spec.title,
      ok: verdict === 'PASS',
      status: verdict,
      detail:
        verdict === 'PASS'
          ? `${spec.title} passed under Icarus.`
          : verdict === 'TIMEOUT'
            ? 'Simulation exceeded the time limit.'
            : 'The testbench reported a failure or produced no verdict.',
      log,
      durationMs: outcome.compile.durationMs + outcome.run.durationMs,
      metrics: match ? spec.metrics(match) : null,
      notes: spec.notes,
      command: {
        compile: [outcome.compile.command, ...outcome.compile.args].join(' '),
        run: [outcome.run.command, ...outcome.run.args].join(' '),
      },
    });
  }

  const ok = results.length > 0 && results.every((result) => result.ok);
  return {
    ok,
    status: ok ? 'PASS' : results.some((result) => result.status === 'TIMEOUT') ? 'TIMEOUT' : 'FAIL',
    device,
    detail: ok
      ? `${results.length} memory testbench${results.length === 1 ? '' : 'es'} passed under Icarus.`
      : 'One or more memory testbenches did not pass.',
    results,
  };
}

export function readHeaderField(bytes, offset, size = 4) {
  if (size === 2) return bytes[offset] | (bytes[offset + 1] << 8);
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

export { HEADER_FIELDS };
