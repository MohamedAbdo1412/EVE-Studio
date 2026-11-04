import { describe, expect, it } from 'vitest';
import { parseFrameVerdict, validateFramePackage } from '../simulator/server/simulate.mjs';
import { packObject, hexWord160 } from '../packages/eve-binary/framePackage.js';

const WIDTH = 96;
const HEIGHT = 64;
const CHECKS = WIDTH * HEIGHT;
const CHECKSUM = 'ad50cbb7d707bfda';

function summary(overrides = {}) {
  const values = {
    width: WIDTH,
    height: HEIGHT,
    objects: 4,
    visible: 4,
    coverage: 4,
    checks: CHECKS,
    mismatches: 0,
    zero: 0,
    background: 4159,
    nonBackground: 1985,
    uniqueColors: 5,
    textTrailing: 256,
    textRepeat: 640,
    textBlank: 351,
    glyphZero: 19,
    checksum: CHECKSUM,
    errors: 0,
    ...overrides,
  };
  return (
    `FRAME_SUMMARY width=${values.width} height=${values.height} objects=${values.objects} ` +
    `visible=${values.visible} coverage=${values.coverage} checks=${values.checks} ` +
    `mismatches=${values.mismatches} zero=${values.zero} background=${values.background} ` +
    `non_background=${values.nonBackground} unique_colors=${values.uniqueColors} ` +
    `text_trailing=${values.textTrailing} text_repeat=${values.textRepeat} ` +
    `text_blank=${values.textBlank} glyph_zero=${values.glyphZero} ` +
    `checksum=${values.checksum} errors=${values.errors}`
  );
}

function verdict(log, overrides = {}) {
  return parseFrameVerdict(log, {
    width: WIDTH,
    height: HEIGHT,
    checksum: CHECKSUM,
    zeroPixels: 0,
    checks: CHECKS,
    ...overrides,
  });
}

const PASS_LINE =
  'PASS: RTL FUNCTIONAL RENDERER CAPTURE verified 96x64, 4/4 objects covered, 6144 pixel checks, 0 errors, non-background 1985, unique colors 5, checksum ad50cbb7d707bfda';

describe('strict frame-capture verdict parsing', () => {
  it('accepts PASS only with a matching complete summary', () => {
    const result = verdict(`${summary()}\n${PASS_LINE}`);
    expect(result.verdict).toBe('PASS');
    expect(result.summary).toMatchObject({
      width: WIDTH,
      height: HEIGHT,
      checks: CHECKS,
      mismatches: 0,
      zeroPixels: 0,
      nonBackgroundPixels: 1985,
      uniqueColors: 5,
      checksum: CHECKSUM,
      errors: 0,
    });
  });

  it('rejects a bare PASS string without a summary', () => {
    const result = verdict('PASS: RTL FUNCTIONAL RENDERER CAPTURE');
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reason).toMatch(/FRAME_SUMMARY/);
  });

  it('rejects a reaching PASS line paired with a FAIL line', () => {
    const result = verdict(`FAIL: coverage 2/4\n${summary()}\n${PASS_LINE}`);
    expect(result.verdict).toBe('FAIL');
  });

  it('rejects any non-zero error count', () => {
    const result = verdict(`${summary({ errors: 1 })}\n${PASS_LINE}`);
    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toMatch(/1 error/);
  });

  it('rejects mismatched pixels', () => {
    const result = verdict(`${summary({ mismatches: 3 })}\n${PASS_LINE}`);
    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toMatch(/mismatched pixel/);
  });

  it('rejects a checksum that does not match the captured PPM', () => {
    const result = verdict(
      `${summary({ checksum: '0000000000000000' })}\n${PASS_LINE}`,
      { checksum: CHECKSUM },
    );
    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toMatch(/checksum/);
  });

  it('rejects zero-pixel count mismatches and black captures', () => {
    expect(verdict(`${summary({ zero: 1 })}\n${PASS_LINE}`).verdict).toBe('FAIL');
    const black = verdict(
      `${summary({ zero: CHECKS, background: 0, nonBackground: 0 })}\n${PASS_LINE}`,
      { zeroPixels: CHECKS },
    );
    expect(black.verdict).toBe('FAIL');
    expect(black.reason).toMatch(/entirely black/);
  });

  it('rejects a capture with no non-background pixels', () => {
    const result = verdict(`${summary({ background: CHECKS, nonBackground: 0 })}\n${PASS_LINE}`);
    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toMatch(/non-background/i);
  });

  it('rejects missing object coverage', () => {
    const result = verdict(`${summary({ coverage: 2 })}\n${PASS_LINE}`);
    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toMatch(/coverage 2\/4/);
  });

  it('rejects dimension and check-count disagreements with the PPM', () => {
    expect(verdict(`${summary({ width: 64 })}\n${PASS_LINE}`).verdict).toBe('FAIL');
    expect(verdict(`${summary({ checks: 100 })}\n${PASS_LINE}`).verdict).toBe('FAIL');
  });

  it('reports FAIL when the testbench failed before printing a summary', () => {
    const result = verdict('FAIL: cannot open frame.meta');
    expect(result.verdict).toBe('FAIL');
  });
});

function hexBytes(count) {
  return `${Array.from({ length: count }, () => '00').join('\n')}\n`;
}

function validPackage(overrides = {}) {
  const rect = hexWord160(
    packObject({ type: 1, x: 0, y: 0, width: 10, height: 10, fillColor: 0x204060 }),
  );
  return {
    meta: `96 64 1 101820\n`,
    oamHex: `${rect}\n`,
    textHex: hexBytes(4096),
    fontHex: hexBytes(4096),
    ...overrides,
  };
}

describe('frame package backend validation', () => {
  it('accepts a valid supported package', () => {
    const result = validateFramePackage(validPackage());
    expect(result).toMatchObject({
      width: 96,
      height: 64,
      objectCount: 1,
      background: '101820',
    });
    expect(result.objectTypes).toEqual([1]);
  });

  it('rejects unsupported RTL object types instead of rendering them', () => {
    const circle = hexWord160(
      packObject({ type: 4, x: 0, y: 0, width: 10, height: 10, fillColor: 0xffffff }),
    );
    expect(() => validateFramePackage(validPackage({ oamHex: `${circle}\n` }))).toThrow(
      /type 4.*not|supports only/i,
    );
  });

  it('rejects text offsets that the renderer cannot address', () => {
    // Build a structurally valid TEXT word, then force an out-of-range range.
    // packObject itself refuses this, so the backend must reject it too.
    const base = packObject({ type: 3, x: 0, y: 0, width: 8, height: 8, textOffset: 0, textLength: 1 });
    const rangeMask = 0xfffn << 111n;
    const lengthMask = 0xffn << 123n;
    const forced = (base & ~rangeMask & ~lengthMask) | (4095n << 111n) | (2n << 123n);
    const text = hexWord160(forced);
    expect(() => validateFramePackage(validPackage({ oamHex: `${text}\n` }))).toThrow(
      /text memory/,
    );
  });

  it('rejects malformed OAM, meta and text files', () => {
    expect(() => validateFramePackage(validPackage({ oamHex: 'abcd\n' }))).toThrow(/40 hex/);
    expect(() => validateFramePackage(validPackage({ meta: '96 64\n' }))).toThrow(/frame.meta/);
    expect(() => validateFramePackage(validPackage({ textHex: '00\n01\n' }))).toThrow(
      /4096 bytes/,
    );
    expect(() => validateFramePackage(validPackage({ fontHex: `${'zz\n'.repeat(4096)}` }))).toThrow(
      /non-byte/,
    );
  });

  it('carries structured PARTIAL diagnostics through to the backend', () => {
    const pkg = validPackage({
      diagnostics: {
        status: 'PARTIAL',
        renderedObjectCount: 1,
        unsupportedObjectCount: 2,
        missingAssetCount: 1,
        unsupported: [{ type: 9, typeName: 'CIRCLE', pageObjectIndex: 2, reason: 'not implemented' }],
        missingAssets: [{ kind: 'font', reason: 'missing atlas' }],
      },
    });
    const result = validateFramePackage(pkg);
    expect(result.diagnostics).toMatchObject({
      status: 'PARTIAL',
      unsupportedObjectCount: 2,
      missingAssetCount: 1,
    });
  });
});
