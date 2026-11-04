import { describe, expect, it } from 'vitest';
import { buildRom, parseRom, HEADER_FIELDS } from '../packages/eve-binary/rom.js';
import {
  SCENE_TYPES,
  SCENE_RECORD_SIZE,
  NO_INDEX,
} from '../packages/eve-binary/sceneCodec.js';
import { encodeGlyphText } from '../packages/eve-binary/font5x7.js';
import { packObject, framePackageFromRom } from '../packages/eve-binary/framePackage.js';
import {
  TEXT_MEMORY_BYTES,
  TEXT_MAX_LENGTH,
  TEXT_MAX_OFFSET,
  validateTextReference,
} from '../packages/eve-binary/textMemory.js';

const LABEL = encodeGlyphText('EVE 64');

function record(overrides = {}) {
  return {
    type: SCENE_TYPES.RECT,
    pageIndex: 0,
    flags: 0x01,
    zOrder: 0,
    objectId: 0x1000,
    pageObjectIndex: 0,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    fillColor: 0xff000000,
    strokeColor: 0,
    assetIndex: NO_INDEX,
    bindingIndex: NO_INDEX,
    strokeWidth: 0,
    textLength: 0,
    textOffset: 0,
    ...overrides,
  };
}

function buildFixture(extra = []) {
  return buildRom({
    appName: 'Frame Package Test',
    width: 96,
    height: 64,
    initialPageIndex: 0,
    sceneRecords: [
      record({
        type: SCENE_TYPES.PAGE,
        objectId: 0x100,
        pageObjectIndex: 0,
        width: 96,
        height: 64,
        fillColor: 0x101820ff,
      }),
      record({ objectId: 0x101, pageObjectIndex: 1, width: 96, height: 8, fillColor: 0x204060ff }),
      record({
        type: SCENE_TYPES.TEXT,
        objectId: 0x102,
        pageObjectIndex: 2,
        zOrder: 2,
        x: 6,
        y: 34,
        width: 80,
        height: 16,
        fillColor: 0xffffffff,
        textOffset: 0,
        textLength: LABEL.length,
      }),
      ...extra,
    ],
    textTable: LABEL,
  });
}

describe('renderer text-memory contract', () => {
  it('accepts the full addressable range and rejects out-of-range references', () => {
    expect(TEXT_MEMORY_BYTES).toBe(4096);
    expect(TEXT_MAX_OFFSET).toBe(4095);
    expect(TEXT_MAX_LENGTH).toBe(255);
    expect(validateTextReference(0, LABEL.length)).toEqual({ ok: true });
    expect(validateTextReference(4095, 1)).toEqual({ ok: true });
    expect(validateTextReference(0, 255).ok).toBe(true);
    expect(validateTextReference(4096, 1).ok).toBe(false);
    expect(validateTextReference(0, 256).ok).toBe(false);
    expect(validateTextReference(4090, 16).ok).toBe(false);
    expect(validateTextReference(-1, 1).ok).toBe(false);
    expect(validateTextReference(0.5, 1).ok).toBe(false);
  });

  it('refuses to pack unrepresentable text fields instead of masking them', () => {
    expect(() => packObject({ type: 3, textOffset: 4096, textLength: 1 })).toThrow(/12-bit range/);
    expect(() => packObject({ type: 3, textOffset: 0, textLength: 256 })).toThrow(/8-bit range/);
    expect(() => packObject({ type: 3, textOffset: 4090, textLength: 16 })).toThrow(/text memory/);
    expect(() => packObject({ type: 3, textOffset: 0x1fff, textLength: 1 })).toThrow(/12-bit range/);
  });
});

describe('frame package diagnostics', () => {
  it('marks a rect + text frame COMPLETE', () => {
    const built = buildFixture();
    const parsed = parseRom(built.bytes, { verifyChecksums: true });
    expect(parsed.ok).toBe(true);
    const frame = framePackageFromRom(parsed, { pageIndex: 0 });
    expect(frame.status).toBe('COMPLETE');
    expect(frame.diagnostics).toMatchObject({
      status: 'COMPLETE',
      renderedObjectCount: 2,
      unsupportedObjectCount: 0,
      missingAssetCount: 0,
    });
    expect(frame.objects.map((object) => object.kind)).toEqual(['rect', 'text']);
    expect(frame.oamHex.trim().split('\n')).toHaveLength(2);
  });

  it('reports shape and media types as unsupported instead of flattening them', () => {
    const built = buildFixture([
      record({ type: SCENE_TYPES.ROUND_RECT, objectId: 0x201, pageObjectIndex: 3, zOrder: 3 }),
      record({ type: SCENE_TYPES.CIRCLE, objectId: 0x202, pageObjectIndex: 4, zOrder: 4 }),
      record({ type: SCENE_TYPES.LINE, objectId: 0x203, pageObjectIndex: 5, zOrder: 5 }),
      record({ type: SCENE_TYPES.VIDEO, objectId: 0x204, pageObjectIndex: 6, zOrder: 6 }),
      record({ type: SCENE_TYPES.IMAGE, objectId: 0x205, pageObjectIndex: 7, zOrder: 7 }),
    ]);
    const parsed = parseRom(built.bytes, { verifyChecksums: true });
    expect(parsed.ok).toBe(true);
    const frame = framePackageFromRom(parsed, { pageIndex: 0 });

    expect(frame.status).toBe('PARTIAL');
    expect(frame.diagnostics.status).toBe('PARTIAL');
    expect(frame.diagnostics.renderedObjectCount).toBe(2);
    expect(frame.diagnostics.unsupportedObjectCount).toBe(5);
    // The IMAGE record also has no resolved asset in this fixture.
    expect(frame.diagnostics.missingAssetCount).toBe(1);

    const names = frame.diagnostics.unsupported.map((item) => item.typeName);
    expect(names).toEqual(
      expect.arrayContaining(['ROUND_RECT', 'CIRCLE', 'LINE', 'VIDEO', 'IMAGE']),
    );
    for (const item of frame.diagnostics.unsupported) {
      expect(item.reason).toMatch(/\S/);
    }
    // Unsupported objects must not be packed into OAM as rectangles.
    expect(frame.oamHex.trim().split('\n')).toHaveLength(2);
    expect(frame.warnings.some((warning) => /unsupported/i.test(warning))).toBe(true);
  });

  it('rejects text records whose range exceeds the ROM text table', () => {
    const parsed = parseRom(buildFixture().bytes, { verifyChecksums: true });
    expect(parsed.ok).toBe(true);
    // Simulate a hand-corrupted ROM that still passed header/checksum checks.
    const corrupted = {
      ...parsed,
      sceneTable: parsed.sceneTable.map((item) =>
        item.type === SCENE_TYPES.TEXT
          ? { ...item, textLength: LABEL.length + 10 }
          : item,
      ),
    };
    expect(() => framePackageFromRom(corrupted, { pageIndex: 0 })).toThrow(/text table/i);
  });
});

describe('ROM parser text validation', () => {
  function corruptTextRecord(offset, length) {
    const built = buildFixture();
    const bytes = new Uint8Array(built.bytes);
    const sceneOffset =
      bytes[HEADER_FIELDS.SCENE_TABLE_OFFSET] |
      (bytes[HEADER_FIELDS.SCENE_TABLE_OFFSET + 1] << 8) |
      (bytes[HEADER_FIELDS.SCENE_TABLE_OFFSET + 2] << 16) |
      (bytes[HEADER_FIELDS.SCENE_TABLE_OFFSET + 3] << 24);
    const textRecord = sceneOffset + 2 * SCENE_RECORD_SIZE;
    // Scene record layout: u16 textLength at +32, u32 textOffset at +34.
    bytes[textRecord + 32] = length & 0xff;
    bytes[textRecord + 33] = (length >>> 8) & 0xff;
    bytes[textRecord + 34] = offset & 0xff;
    bytes[textRecord + 35] = (offset >>> 8) & 0xff;
    bytes[textRecord + 36] = (offset >>> 16) & 0xff;
    bytes[textRecord + 37] = (offset >>> 24) & 0xff;
    return parseRom(bytes, { verifyChecksums: false });
  }

  it('rejects a text offset that needs more than 12 bits', () => {
    const result = corruptTextRecord(0x1fff, 1);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/12-bit range/);
  });

  it('rejects a text range that exceeds the renderer text memory', () => {
    const result = corruptTextRecord(4095, 255);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/text memory/);
  });
});
