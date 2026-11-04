import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FIXTURE = fileURLToPath(new URL('../hardware/fixtures/eve64-frame.ppm', import.meta.url));

const WIDTH = 96;
const HEIGHT = 64;
const BACKGROUND = 0x101820;
const TEXT_FILL = 0xffffff;
const GLYPH_ZERO_FILL = 0xffcc00;

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

function parsePpm(bytes) {
  const text = bytes.toString('latin1', 0, Math.min(bytes.length, 64));
  const match = /^P6\n(\d+) (\d+)\n255\n/.exec(text);
  if (!match) throw new Error('fixture is not a binary P6 PPM');
  const width = Number(match[1]);
  const height = Number(match[2]);
  const headerBytes = Buffer.byteLength(match[0], 'latin1');
  return { width, height, headerBytes, pixels: bytes.subarray(headerBytes) };
}

function pixelAt(fixture, x, y) {
  const offset = (y * fixture.width + x) * 3;
  return (
    (fixture.pixels[offset] << 16) |
    (fixture.pixels[offset + 1] << 8) |
    fixture.pixels[offset + 2]
  );
}

describe('captured EVE 64 RTL fixture', () => {
  const fixture = parsePpm(readFileSync(FIXTURE));

  it('is a 96x64 binary PPM with the expected byte length', () => {
    expect(fixture.width).toBe(WIDTH);
    expect(fixture.height).toBe(HEIGHT);
    expect(fixture.pixels.length).toBe(WIDTH * HEIGHT * 3);
  });

  it('contains exactly the intended colors and no black pixels', () => {
    const counts = new Map();
    let zeroPixels = 0;
    let backgroundPixels = 0;
    for (let index = 0; index < fixture.pixels.length; index += 3) {
      const color =
        (fixture.pixels[index] << 16) |
        (fixture.pixels[index + 1] << 8) |
        fixture.pixels[index + 2];
      counts.set(color, (counts.get(color) || 0) + 1);
      if (color === 0) zeroPixels += 1;
      if (color === BACKGROUND) backgroundPixels += 1;
    }
    expect(zeroPixels).toBe(0);
    expect(counts.size).toBe(5);
    expect(backgroundPixels).toBe(4159);
    expect(counts.get(0x204060)).toBe(768);
    expect(counts.get(0x00aa44)).toBe(832);
    expect(counts.get(TEXT_FILL)).toBe(366);
    expect(counts.get(GLYPH_ZERO_FILL)).toBe(19);
  });

  it('matches the frame checksum reported by the testbench', () => {
    expect(fnv1a64Pixels(fixture.pixels)).toBe('ad50cbb7d707bfda');
  });

  it('leaves cells after text_length untouched', () => {
    // Text object: x=6, y=34, w=80, h=16; six glyphs occupy the first 48 px.
    for (let y = 34; y < 42; y += 1) {
      for (let x = 54; x < 86; x += 1) {
        expect(pixelAt(fixture, x, y), `trailing text pixel ${x},${y}`).toBe(BACKGROUND);
      }
    }
  });

  it('does not repeat the glyph row vertically', () => {
    for (let y = 42; y < 50; y += 1) {
      for (let x = 6; x < 86; x += 1) {
        expect(pixelAt(fixture, x, y), `repeated text pixel ${x},${y}`).toBe(BACKGROUND);
      }
    }
  });

  it('renders only the intended characters inside the text row', () => {
    for (let y = 34; y < 42; y += 1) {
      for (let x = 6; x < 86; x += 1) {
        if (x >= 54) continue;
        const color = pixelAt(fixture, x, y);
        expect([BACKGROUND, TEXT_FILL]).toContain(color);
      }
    }
  });

  it('still renders glyph index 0 (digit zero) as a real glyph', () => {
    let active = 0;
    for (let y = 54; y < 62; y += 1) {
      for (let x = 6; x < 14; x += 1) {
        if (pixelAt(fixture, x, y) === GLYPH_ZERO_FILL) active += 1;
        else expect(pixelAt(fixture, x, y)).toBe(BACKGROUND);
      }
    }
    expect(active).toBe(19);
  });
});
