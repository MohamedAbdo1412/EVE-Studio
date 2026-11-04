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
import {
  TEXT_MEMORY_BYTES,
  validateTextReference,
} from '../../packages/eve-binary/textMemory.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');
export const HARDWARE_ROOT = path.join(REPO_ROOT, 'hardware');

const TIMING_RTL = path.join('rtl', 'video', 'eve_video_timing.sv');
const TIMING_TB = path.join('testbench', 'tb_eve_video_timing.sv');
const RENDERER_RTL = path.join('rtl', 'renderer', 'eve_renderer.sv');
const RENDERER_TB = path.join('testbench', 'tb_eve_frame_capture.sv');

const FRAME_OBJECT_LIMIT = 16;
const FRAME_TEXT_BYTES = TEXT_MEMORY_BYTES;
const FRAME_FONT_BYTES = 4096;
const MAX_FRAME_PIXELS = 1920 * 1080;
const RTL_TYPES = new Set([1, 2, 3]);
const RTL_TYPE_NAMES = { 1: 'RECT', 2: 'BORDER_RECT', 3: 'TEXT' };

const FRAME_SUMMARY_RE =
  /^FRAME_SUMMARY\s+width=(\d+)\s+height=(\d+)\s+objects=(\d+)\s+visible=(\d+)\s+coverage=(\d+)\s+checks=(\d+)\s+mismatches=(\d+)\s+zero=(\d+)\s+background=(\d+)\s+non_background=(\d+)\s+unique_colors=(\d+)\s+text_trailing=(\d+)\s+text_repeat=(\d+)\s+text_blank=(\d+)\s+glyph_zero=(\d+)\s+checksum=([0-9a-fA-F]+)\s+errors=(\d+)\s*$/m;

function fnv1a64Pixels(pixels) {
  let checksum = 0n;
  const prime = 1099511628211n;
  const mask = (1n << 64n) - 1n;
  for (let index = 0; index < pixels.length; index += 3) {
    const color = (pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2];
    checksum = ((checksum * prime) ^ BigInt(color)) & mask;
  }
  return checksum.toString(16).padStart(16, '0');
}

function pixelStatistics(pixels, backgroundHex) {
  const background = Number.parseInt(backgroundHex, 16);
  const backgroundRgb = background & 0xffffff;
  const seen = new Set();
  let zero = 0;
  let nonBackground = 0;
  for (let index = 0; index < pixels.length; index += 3) {
    const color = (pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2];
    seen.add(color);
    if (color === 0) zero += 1;
    if (color !== backgroundRgb) nonBackground += 1;
  }
  return {
    zero,
    nonBackground,
    background: pixels.length / 3 - nonBackground,
    uniqueColors: seen.size,
  };
}


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

/**
 * Parse the frame-capture testbench verdict.
 *
 * A bare PASS string is never enough: the log must contain one complete
 * FRAME_SUMMARY line, zero errors, zero pixel mismatches, sane dimensions and a
 * checksum that matches the PPM bytes the backend actually read.
 */
export function parseFrameVerdict(log, { width, height, checksum: expectedChecksum, zeroPixels, checks }) {
  const summaryMatch = log.match(FRAME_SUMMARY_RE);
  if (!summaryMatch) {
    return {
      verdict: /^FAIL:/m.test(log) ? 'FAIL' : 'UNKNOWN',
      reason: 'The capture log did not contain a complete FRAME_SUMMARY.',
      summary: null,
    };
  }
  const summary = {
    width: Number(summaryMatch[1]),
    height: Number(summaryMatch[2]),
    objects: Number(summaryMatch[3]),
    visibleObjects: Number(summaryMatch[4]),
    coverage: Number(summaryMatch[5]),
    checks: Number(summaryMatch[6]),
    mismatches: Number(summaryMatch[7]),
    zeroPixels: Number(summaryMatch[8]),
    backgroundPixels: Number(summaryMatch[9]),
    nonBackgroundPixels: Number(summaryMatch[10]),
    uniqueColors: Number(summaryMatch[11]),
    textTrailingPixels: Number(summaryMatch[12]),
    textRepeatPixels: Number(summaryMatch[13]),
    textBlankPixels: Number(summaryMatch[14]),
    glyphZeroPixels: Number(summaryMatch[15]),
    checksum: summaryMatch[16].toLowerCase().padStart(16, '0'),
    errors: Number(summaryMatch[17]),
  };

  if (/^FAIL:/m.test(log)) {
    return { verdict: 'FAIL', reason: 'The testbench reported a failure.', summary };
  }
  if (!/^PASS: RTL FUNCTIONAL RENDERER CAPTURE/m.test(log)) {
    return { verdict: 'UNKNOWN', reason: 'No PASS line for RTL FUNCTIONAL RENDERER CAPTURE.', summary };
  }
  if (summary.errors !== 0) {
    return { verdict: 'FAIL', reason: `The testbench reported ${summary.errors} error(s).`, summary };
  }
  if (summary.mismatches !== 0) {
    return { verdict: 'FAIL', reason: `The reference check found ${summary.mismatches} mismatched pixel(s).`, summary };
  }
  if (summary.width !== width || summary.height !== height) {
    return {
      verdict: 'FAIL',
      reason: `Summary dimensions ${summary.width}x${summary.height} do not match the PPM ${width}x${height}.`,
      summary,
    };
  }
  if (summary.checks !== width * height) {
    return {
      verdict: 'FAIL',
      reason: `Summary checked ${summary.checks} pixels; expected ${width * height}.`,
      summary,
    };
  }
  if (checks != null && summary.checks !== checks) {
    return { verdict: 'FAIL', reason: 'Summary pixel count does not match the capture.', summary };
  }
  if (summary.checksum !== expectedChecksum) {
    return {
      verdict: 'FAIL',
      reason: `Summary checksum ${summary.checksum} does not match the captured PPM ${expectedChecksum}.`,
      summary,
    };
  }
  if (zeroPixels != null && summary.zeroPixels !== zeroPixels) {
    return { verdict: 'FAIL', reason: 'Summary zero-pixel count does not match the captured PPM.', summary };
  }
  if (summary.visibleObjects > 0 && summary.zeroPixels === summary.checks) {
    return { verdict: 'FAIL', reason: 'The capture is entirely black although objects are visible.', summary };
  }
  if (summary.visibleObjects > 0 && summary.nonBackgroundPixels === 0) {
    return { verdict: 'FAIL', reason: 'No non-background pixels were rendered.', summary };
  }
  if (summary.coverage !== summary.visibleObjects) {
    return {
      verdict: 'FAIL',
      reason: `Object coverage ${summary.coverage}/${summary.visibleObjects}.`,
      summary,
    };
  }
  return { verdict: 'PASS', reason: '', summary };
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

export function validateFramePackage(pkg) {
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
  const objectTypes = [];
  for (let index = 0; index < oamLines.length; index += 1) {
    const line = oamLines[index].trim();
    if (!/^[0-9a-fA-F]{40}$/.test(line)) {
      throw new Error('each OAM record must be exactly 40 hex characters (160 bits)');
    }
    const word = BigInt(`0x${line}`);
    const type = Number(word & 0x7n);
    objectTypes.push(type);
    if (!RTL_TYPES.has(type)) {
      throw new Error(
        `OAM object ${index} has RTL type ${type}. The reference renderer supports only ` +
          `${[...RTL_TYPES].map((value) => `${value} (${RTL_TYPE_NAMES[value]})`).join(', ')}. ` +
          'Unsupported objects must be reported by the frame exporter, not packed into OAM.',
      );
    }
    if (type === 3) {
      const textOffset = Number((word >> 111n) & 0xfffn);
      const textLength = Number((word >> 123n) & 0xffn);
      const check = validateTextReference(textOffset, textLength, { label: `OAM text object ${index}` });
      if (!check.ok) throw new Error(check.error);
    }
  }

  const countHexBytes = (text) => (text.trim() ? text.trim().split(/\r?\n/).length : 0);
  if (countHexBytes(pkg.textHex) !== FRAME_TEXT_BYTES) {
    throw new Error(`textHex must contain exactly ${FRAME_TEXT_BYTES} bytes`);
  }
  if (countHexBytes(pkg.fontHex) !== FRAME_FONT_BYTES) {
    throw new Error(`fontHex must contain exactly ${FRAME_FONT_BYTES} bytes`);
  }
  const malformed = (text) => text
    .trim()
    .split(/\r?\n/)
    .findIndex((line) => !/^[0-9a-fA-F]{2}$/.test(line.trim()));
  if (malformed(pkg.textHex) !== -1) throw new Error('textHex contains a non-byte value');
  if (malformed(pkg.fontHex) !== -1) throw new Error('fontHex contains a non-byte value');

  const diagnostics =
    pkg.diagnostics && typeof pkg.diagnostics === 'object' ? pkg.diagnostics : null;
  return { width, height, objectCount, background: meta[3].toLowerCase(), objectTypes, diagnostics };
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
  let frameDiagnostics = framePackage?.diagnostics ?? null;
  if (!pkg && romBase64) {
    const romBytes = Buffer.from(String(romBase64), 'base64');
    const parsed = parseRom(romBytes, { verifyChecksums: true });
    if (!parsed.ok) {
      return { ok: false, status: 'BAD_ROM', detail: `ROM failed validation: ${parsed.error}`, log: '' };
    }
    const frame = framePackageFromRom(parsed, {
      pageIndex: Number.isInteger(pageIndex) ? pageIndex : undefined,
    });
    pkg = {
      meta: frame.meta,
      oamHex: frame.oamHex,
      textHex: frame.textHex,
      fontHex: frame.fontHex,
      diagnostics: frame.diagnostics,
    };
    romWarnings = frame.warnings;
    frameDiagnostics = frame.diagnostics;
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
  const rawDiagnostics = frameInfo.diagnostics || frameDiagnostics || {};
  const unsupportedList = Array.isArray(rawDiagnostics.unsupported) ? rawDiagnostics.unsupported : [];
  const missingAssetList = Array.isArray(rawDiagnostics.missingAssets)
    ? rawDiagnostics.missingAssets
    : [];
  const unsupportedObjectCount = Number.isFinite(Number(rawDiagnostics.unsupportedObjectCount))
    ? Number(rawDiagnostics.unsupportedObjectCount)
    : unsupportedList.length;
  const missingAssetCount = Number.isFinite(Number(rawDiagnostics.missingAssetCount))
    ? Number(rawDiagnostics.missingAssetCount)
    : missingAssetList.length;
  const renderedObjectCount = Number.isFinite(Number(rawDiagnostics.renderedObjectCount))
    ? Number(rawDiagnostics.renderedObjectCount)
    : frameInfo.objectCount;
  const framePackageStatus =
    unsupportedObjectCount > 0 || missingAssetCount > 0 ? 'PARTIAL' : 'COMPLETE';
  const diagnostics = {
    status: framePackageStatus,
    renderedObjectCount,
    unsupportedObjectCount,
    missingAssetCount,
    unsupported: unsupportedList,
    missingAssets: missingAssetList,
  };
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
    const statistics = pixelStatistics(parsed.pixels, frameInfo.background);
    const captureChecksum = fnv1a64Pixels(parsed.pixels);
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
    const frameVerdict =
      first.outcome.run.state === 'timeout'
        ? { verdict: 'TIMEOUT', reason: 'Simulation exceeded the time limit.', summary: null }
        : parseFrameVerdict(first.outcome.run.log, {
            width: parsed.width,
            height: parsed.height,
            checksum: captureChecksum,
            zeroPixels: statistics.zero,
            checks: parsed.width * parsed.height,
          });
    const verdict = frameVerdict.verdict;
    const captureStatus = verdict === 'PASS' ? diagnostics.status : 'FAILED';
    const detail =
      verdict === 'PASS'
        ? diagnostics.status === 'PARTIAL'
          ? `Icarus rendered ${parsed.width}x${parsed.height} from HDL in ${first.outcome.run.durationMs} ms. ` +
            `This is a PARTIAL frame: ${diagnostics.unsupportedObjectCount} unsupported object(s), ` +
            `${diagnostics.missingAssetCount} missing asset(s).`
          : `Icarus rendered ${parsed.width}x${parsed.height} from HDL in ${first.outcome.run.durationMs} ms.`
        : verdict === 'TIMEOUT'
          ? 'Simulation exceeded the time limit before completing the frame.'
          : frameVerdict.reason || 'The frame-capture testbench did not produce a complete valid summary.';
    return {
      ok: verdict === 'PASS',
      status: verdict,
      detail,
      width: parsed.width,
      height: parsed.height,
      frame: {
        ...frameInfo,
        objects: frameInfo.objectCount,
        renderedObjectCount: diagnostics.renderedObjectCount,
        unsupportedObjectCount: diagnostics.unsupportedObjectCount,
        missingAssetCount: diagnostics.missingAssetCount,
        unsupported: diagnostics.unsupported,
        missingAssets: diagnostics.missingAssets,
        status: captureStatus,
        pageIndex: Number.isInteger(pageIndex) ? pageIndex : null,
        rom: romHeader,
        warnings: romWarnings,
      },
      capture: {
        status: captureStatus,
        expectedChecks: statistics.background + statistics.nonBackground,
        checks: frameVerdict.summary?.checks ?? parsed.width * parsed.height,
        mismatches: frameVerdict.summary?.mismatches ?? null,
        zeroPixels: statistics.zero,
        backgroundPixels: statistics.background,
        nonBackgroundPixels: statistics.nonBackground,
        uniqueColors: statistics.uniqueColors,
        checksum: captureChecksum,
        errors: frameVerdict.summary?.errors ?? null,
        coverage: frameVerdict.summary?.coverage ?? null,
        visibleObjects: frameVerdict.summary?.visibleObjects ?? null,
        textTrailingPixels: frameVerdict.summary?.textTrailingPixels ?? null,
        textRepeatPixels: frameVerdict.summary?.textRepeatPixels ?? null,
        textBlankPixels: frameVerdict.summary?.textBlankPixels ?? null,
        glyphZeroPixels: frameVerdict.summary?.glyphZeroPixels ?? null,
        summary: frameVerdict.summary,
        reason: frameVerdict.reason || null,
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
