import { describe, expect, it } from 'vitest';
import {
  ROM_CAPACITY,
  ROM_SECTOR_SIZE,
  HEADER_FIELDS,
  buildRom,
  parseRom,
  planAssets,
  formatRomReport,
} from '../packages/eve-binary/rom.js';
import { flattenScene, decodeSceneRecord, decodeVariableRecord } from '../packages/eve-binary/sceneCodec.js';
import { buildFontAtlas, FONT_ASSET_PATH, encodeGlyphText, decodeGlyphText } from '../packages/eve-binary/font5x7.js';
import { crc32, sha256, toHex32, toHex } from '../packages/eve-binary/checksums.js';

function rgba(width, height, predicate) {
  const bytes = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const color = predicate(x, y);
      bytes[index] = color[0];
      bytes[index + 1] = color[1];
      bytes[index + 2] = color[2];
      bytes[index + 3] = color[3] ?? 255;
    }
  }
  return { width, height, bytes };
}

function fixture({ duplicateAsset = false, extraAssetBytes = 0 } = {}) {
  const icon = rgba(4, 4, (x, y) => [x * 60, y * 60, 128, 255]);
  const assets = [
    {
      path: 'assets/icon.eveimg',
      type: 1,
      pixelFormat: 1,
      width: icon.width,
      height: icon.height,
      rgba: icon.bytes,
    },
  ];
  if (duplicateAsset) {
    assets.push({ ...assets[0], path: 'assets/icon-copy.eveimg' });
  }
  if (extraAssetBytes) {
    assets.push({ path: 'assets/large.bin', type: 4, bytes: new Uint8Array(extraAssetBytes) });
  }
  const assetPlan = planAssets(assets);
  const registry = [
    { id: 0x11111111, path: 'room.temperature', type: 'number', initialValue: 21.5 },
    { id: 0x22222222, path: 'room.accent', type: 'color', initialValue: '#00FF88' },
    { id: 0x33333333, path: 'room.label', type: 'string', initialValue: 'Lab' },
    { id: 0x44444444, path: 'room.icon', type: 'image', initialValue: 'assets/icon.eveimg' },
  ];
  const variableIndexByPath = new Map(registry.map((entry, index) => [entry.path, index]));
  const bindingIndexByKey = new Map([
    ['degrees:text', variableIndexByPath.get('room.temperature')],
    ['accent:fill', variableIndexByPath.get('room.accent')],
  ]);
  const scene = {
    app: { name: 'ROM Fixture', width: 320, height: 180, background: '#101820' },
    initialPage: 'home',
    pages: [
      {
        id: 'home',
        title: 'Home',
        width: 320,
        height: 180,
        background: '#101820',
        initial: true,
        components: [
          {
            id: 'panel',
            tag: 'shape',
            props: {
              type: { kind: 'static', value: 'rect' },
              fill: { kind: 'static', value: '#17283C' },
              stroke: { kind: 'static', value: '#3A73D8' },
              strokeWidth: { kind: 'static', value: '2' },
              visible: { kind: 'static', value: true },
              zIndex: { kind: 'static', value: 0 },
            },
            dynamicProperties: [],
            initialLayout: { x: 10, y: 10, width: 300, height: 80 },
            children: [],
          },
          {
            id: 'label',
            tag: 'text',
            props: {
              text: { kind: 'static', value: 'ROOM 12' },
              color: { kind: 'static', value: '#FFFFFF' },
              align: { kind: 'static', value: 'left' },
              visible: { kind: 'static', value: true },
              zIndex: { kind: 'static', value: 1 },
            },
            dynamicProperties: [],
            initialLayout: { x: 20, y: 20, width: 200, height: 16 },
            children: [],
          },
          {
            id: 'degrees',
            tag: 'text',
            props: {
              text: { kind: 'binding', bindingId: 'b1', segments: [] },
              color: { kind: 'static', value: '#00FF88' },
              align: { kind: 'static', value: 'left' },
              visible: { kind: 'static', value: true },
              zIndex: { kind: 'static', value: 2 },
            },
            dynamicProperties: ['text'],
            initialLayout: { x: 20, y: 60, width: 200, height: 16 },
            children: [],
          },
          {
            id: 'accent',
            tag: 'shape',
            props: {
              type: { kind: 'static', value: 'rect' },
              fill: { kind: 'binding', bindingId: 'b2', segments: [] },
              stroke: { kind: 'static', value: 'transparent' },
              strokeWidth: { kind: 'static', value: '0' },
              visible: { kind: 'static', value: true },
              zIndex: { kind: 'static', value: 3 },
            },
            dynamicProperties: ['fill'],
            initialLayout: { x: 250, y: 10, width: 20, height: 20 },
            children: [
              {
                id: 'icon',
                tag: 'img',
                props: {
                  src: { kind: 'static', value: 'assets/icon.eveimg' },
                  visible: { kind: 'static', value: true },
                  zIndex: { kind: 'static', value: 0 },
                },
                dynamicProperties: [],
                initialLayout: { x: 2, y: 2, width: 16, height: 16 },
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'settings',
        title: 'Settings',
        width: 320,
        height: 180,
        background: '#0B1220',
        initial: false,
        components: [
          {
            id: 'back',
            tag: 'button',
            props: {
              background: { kind: 'static', value: '#2455AA' },
              borderColor: { kind: 'static', value: '#3A73D8' },
              borderWidth: { kind: 'static', value: '2' },
              visible: { kind: 'static', value: true },
              zIndex: { kind: 'static', value: 0 },
            },
            dynamicProperties: [],
            initialLayout: { x: 20, y: 20, width: 100, height: 32 },
            children: [],
          },
        ],
      },
    ],
  };
  const flattened = flattenScene({
    scene,
    registry,
    variableIndexByPath,
    assetIndexByPath: assetPlan.assetIndexByPath,
    bindingIndexByKey,
    resolveText: () => '21.5C',
  });
  return { assets, plan: assetPlan, registry, flattened };
}

function build(options = {}) {
  const data = fixture(options);
  return buildRom({
    appName: 'ROM Fixture',
    sourceHash: 'fnv1a-fixture',
    width: 320,
    height: 180,
    initialPageIndex: 0,
    sceneRecords: data.flattened.records,
    variables: data.registry,
    assets: data.assets,
    textTable: data.flattened.textTable,
    ...options.buildOptions,
  });
}

describe('EVE ROM FORMAT 1.0', () => {
  it('is exactly 16 MiB and fills unused space with 0xFF', () => {
    const { bytes, header, manifest } = build();
    expect(bytes.length).toBe(16_777_216);
    expect(bytes.length).toBe(ROM_CAPACITY);
    expect(header.usedBytes).toBeGreaterThan(4096);
    expect(header.usedBytes % ROM_SECTOR_SIZE).toBe(0);
    expect(bytes[bytes.length - 1]).toBe(0xff);
    expect(manifest.totalBytes).toBe(16_777_216);
    expect(manifest.fileName).toBe('EVE_ROM_16MB.bin');
  });

  it('writes the documented header and verifies content checksums', () => {
    const { bytes, header } = build();
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('EVEROM');
    const parsed = parseRom(bytes, { verifyChecksums: true });
    expect(parsed.ok).toBe(true);
    expect(parsed.header.format).toBe('EVE ROM FORMAT 1.0');
    expect(parsed.header.width).toBe(320);
    expect(parsed.header.height).toBe(180);
    expect(parsed.header.sceneCount).toBe(header.sceneCount);
    expect(parsed.header.assetCount).toBe(header.assetCount);
    expect(parsed.header.contentCrc32).toBe(header.contentCrc32);
    expect(parsed.header.sha256).toBe(header.sha256);
    expect(parsed.header.sha256).toBe(toHex(sha256(bytes.slice(0, header.usedBytes).fill(0, HEADER_FIELDS.SHA256, HEADER_FIELDS.SHA256 + 32))));
  });

  it('is deterministic for identical input', () => {
    const a = build();
    const b = build();
    expect(a.manifest.buildId).toBe(b.manifest.buildId);
    expect(a.manifest.crc32).toBe(b.manifest.crc32);
    expect(a.manifest.sha256).toBe(b.manifest.sha256);
    expect(Buffer.compare(Buffer.from(a.bytes), Buffer.from(b.bytes))).toBe(0);
  });

  it('detects corruption with CRC32 and SHA-256', () => {
    const { bytes } = build();
    const copy = bytes.slice();
    copy[0x2000] ^= 0xff;
    const parsed = parseRom(copy, { verifyChecksums: true });
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.join(' ')).toMatch(/CRC32|SHA-256/);
  });

  it('does not mutate a Buffer input while verifying checksums', () => {
    // Node's Buffer.prototype.slice() shares memory with its source. Passing a
    // Buffer to parseRom must therefore never zero the caller's checksum fields.
    const { bytes } = build();
    const buffer = Buffer.from(bytes);
    const before = Buffer.from(buffer);
    const parsed = parseRom(buffer, { verifyChecksums: true });
    expect(parsed.ok).toBe(true);
    expect(Buffer.compare(buffer, before)).toBe(0);
    expect(parsed.header.sha256).toBe(toHex(buffer.subarray(HEADER_FIELDS.SHA256, HEADER_FIELDS.SHA256 + 32)));
  });

  it('rejects content larger than the ROM without truncating', () => {
    expect(() => build({ extraAssetBytes: 17 * 1024 * 1024 })).toThrow(/not truncated|exceeds/);
  });

  it('deduplicates identical asset payloads via SHA-256 aliases', () => {
    const data = fixture({ duplicateAsset: true });
    const { bytes, manifest } = build({ duplicateAsset: true });
    const parsed = parseRom(bytes, { verifyChecksums: true });
    expect(parsed.ok).toBe(true);
    const aliases = parsed.assetTable.filter((asset) => asset.aliasOfIndex !== 0xffff);
    expect(aliases.length).toBe(1);
    // Assets are sorted by path, so icon-copy is the deterministic primary and
    // icon.eveimg is the alias that points at its payload.
    expect(aliases[0].aliasPath).toBe('assets/icon-copy.eveimg');
    expect(aliases[0].path).toBe('assets/icon.eveimg');
    expect(aliases[0].romOffset).toBe(parsed.assetTable[aliases[0].aliasOfIndex].romOffset);
    expect(manifest.assets.find((asset) => asset.path === 'assets/icon.eveimg').aliasOfIndex).toBeGreaterThanOrEqual(0);
    expect(data.plan.records[data.plan.records.length - 1].digest).toBe(data.plan.records[1].digest);
  });

  it('aligns every asset payload to a 4 KiB erase sector', () => {
    const { bytes } = build();
    const parsed = parseRom(bytes, { verifyChecksums: true });
    for (const asset of parsed.assetTable) {
      expect(asset.romOffset % ROM_SECTOR_SIZE).toBe(0);
      const payload = parsed.readAsset(asset);
      expect(payload.length).toBe(asset.storedLength);
      expect(crc32(payload)).toBe(asset.crc32);
    }
  });

  it('round-trips scene records, text and variables', () => {
    const { bytes } = build();
    const parsed = parseRom(bytes, { verifyChecksums: true });
    expect(parsed.sceneTable.length).toBe(8);
    const textRecords = parsed.sceneTable.filter((record) => record.type === 5);
    expect(parsed.readSceneText(textRecords[0]).length).toBeGreaterThan(0);
    expect(parsed.readString(parsed.assetTable[0].nameOffset, parsed.assetTable[0].nameLength)).toBe(FONT_ASSET_PATH);
    expect(parsed.variableTable[0].id).toBe(0x11111111);
    expect(parsed.variableTable.map((entry) => entry.type)).toEqual([2, 4, 1, 5]);
  });

  it('reports occupancy and address map', () => {
    const { manifest } = build();
    expect(manifest.occupancyPercent).toBeGreaterThan(0);
    expect(manifest.occupancyPercent).toBeLessThan(1);
    expect(manifest.addressMap.some((region) => region.kind === 'free')).toBe(true);
    expect(manifest.fontAssetCount).toBe(1);
    expect(formatRomReport(parseRom(build({ duplicateAsset: true }).bytes))).toContain('EVE ROM FORMAT 1.0');
  });

  it('encodes the built-in font atlas as an A8 asset', () => {
    const atlas = buildFontAtlas();
    expect(atlas.width).toBe(128);
    expect(atlas.height).toBe(32);
    expect(atlas.pixels.length).toBe(128 * 32);
    expect(atlas.pixels.some((value) => value === 255)).toBe(true);
    const encoded = encodeGlyphText('ROOM 12');
    expect(encoded.length).toBe(7);
    expect(decodeGlyphText(encoded)).toBe('ROOM 12');
    const { bytes } = build();
    const parsed = parseRom(bytes);
    const font = parsed.assetTable.find((asset) => asset.path === FONT_ASSET_PATH);
    expect(font.pixelFormat).toBe(4);
    expect(font.width).toBe(128);
    expect(font.height).toBe(32);
    expect(parsed.readAsset(font).length).toBe(4096);
  });

  it('rejects malformed images instead of guessing', () => {
    expect(parseRom(new Uint8Array(1024)).ok).toBe(false);
    const { bytes } = build();
    const wrongMagic = bytes.slice();
    wrongMagic[0] = 0;
    expect(parseRom(wrongMagic).ok).toBe(false);
    const wrongSize = bytes.slice(0, bytes.length - 1);
    expect(parseRom(wrongSize).ok).toBe(false);
  });

  it('exposes stable header offsets used by the RTL', () => {
    expect(HEADER_FIELDS.MAGIC).toBe(0x00);
    expect(HEADER_FIELDS.SCENE_TABLE_OFFSET).toBe(0x24);
    expect(HEADER_FIELDS.CONTENT_CRC32).toBe(0x64);
    expect(HEADER_FIELDS.SHA256).toBe(0x68);
    expect(HEADER_FIELDS.HEADER_CRC32).toBe(0x60);
    expect(toHex32(0xabcdef)).toBe('00ABCDEF');
  });

  it('decodes low-level records independently', () => {
    const record = {
      type: 3,
      pageIndex: 1,
      flags: 1,
      zOrder: -2,
      objectId: 0xdeadbeef,
      pageObjectIndex: 3,
      x: -5,
      y: 400,
      width: 100,
      height: 50,
      fillColor: 0xff112233,
      strokeColor: 0x80445566,
      assetIndex: 0xffff,
      bindingIndex: 2,
      strokeWidth: 4,
      textLength: 0,
      textOffset: 0,
    };
    const decoded = decodeSceneRecord(encodeSceneRecord(record));
    expect(decoded).toMatchObject(record);
  });
});

// ESM import used by the final record-level test.
import { encodeSceneRecord } from '../packages/eve-binary/sceneCodec.js';
