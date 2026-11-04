import { describe, expect, it } from 'vitest';
import { compile } from '../src/language/compiler/compile.js';
import { buildHardwareArtifacts, referencedAssetPaths } from '../src/hardware/exportHardware.js';
import { ROM_CAPACITY, ROM_SECTOR_SIZE } from '../packages/eve-binary/rom.js';
import { SCENE_TYPES } from '../packages/eve-binary/sceneCodec.js';
import { VALID_SOURCE, IMAGE_ASSETS } from './helpers.js';

const rgba = (() => {
  const bytes = new Uint8Array(64 * 64 * 4);
  for (let index = 0; index < bytes.length; index += 4) {
    bytes[index] = index & 0xff;
    bytes[index + 1] = (index >> 3) & 0xff;
    bytes[index + 2] = (index >> 6) & 0xff;
    bytes[index + 3] = 255;
  }
  return { rgba: bytes, width: 64, height: 64 };
})();

function compileValid() {
  return compile(VALID_SOURCE, { assets: IMAGE_ASSETS });
}

async function exportValid(overrides = {}) {
  return buildHardwareArtifacts({
    compileResult: compileValid(),
    assets: IMAGE_ASSETS,
    projectName: 'Hardware Test',
    source: VALID_SOURCE,
    decodeImage: async () => rgba,
    ...overrides,
  });
}

describe('hardware export pipeline', () => {
  it('emits exactly 16 MiB with 0xFF free space and EVE ROM FORMAT 1.0', async () => {
    const result = await exportValid();
    expect(result.rom.bytes).toBeInstanceOf(Uint8Array);
    expect(result.rom.bytes.length).toBe(ROM_CAPACITY);
    expect(result.header.format).toBe('EVE ROM FORMAT 1.0');
    expect(result.header.capacity).toBe(ROM_CAPACITY);
    expect(result.parsed.ok).toBe(true);

    const free = result.rom.bytes.subarray(result.header.usedBytes);
    expect(free.length).toBeGreaterThan(0);
    expect(free.every((byte) => byte === 0xff)).toBe(true);
  });

  it('is byte-for-byte deterministic for identical input', async () => {
    const first = await exportValid();
    const second = await exportValid();
    expect(first.stats.sha256).toBe(second.stats.sha256);
    expect(first.header.buildId).toBe(second.header.buildId);
    expect(first.releaseManifest.rom.contentCrc32).toBe(second.releaseManifest.rom.contentCrc32);
  });

  it('derives the ROM and frame package from the compiler scene', async () => {
    const result = await exportValid();
    const page = result.parsed.header.initialPage;
    const expectedObjects = result.parsed.sceneTable.filter(
      (record) =>
        record.pageIndex === page && [SCENE_TYPES.RECT, SCENE_TYPES.BORDER_RECT, SCENE_TYPES.TEXT].includes(record.type),
    );
    expect(result.frame).not.toBeNull();
    expect(result.frame.objects.length).toBe(expectedObjects.length);
    const oamLines = result.frame.oamHex.trim().split('\n');
    expect(oamLines.length).toBe(result.frame.objects.length);
    for (const line of oamLines) {
      expect(line).toMatch(/^[0-9a-f]{40}$/);
    }
    expect(result.frame.textHex.trim().split('\n').length).toBe(4096);
    expect(result.frame.fontHex.trim().split('\n').length).toBe(4096);
  });

  it('writes a complete deterministic ESP32 project and marks the toolchain unavailable', async () => {
    const result = await exportValid();
    const names = Object.keys(result.esp32Files);
    expect(names).toEqual(
      expect.arrayContaining([
        'platformio.ini',
        'include/eve_board_config.h',
        'include/EveProtocol.h',
        'include/EveSpiTransport.h',
        'include/EVETransport.h',
        'include/EVEClient.h',
        'include/TestApp.h',
        'src/main.cpp',
        'tools/eve_protocol.py',
        'tools/rom_upload.py',
        'README.md',
      ]),
    );
    expect(result.esp32Files['include/eve_board_config.h']).toContain('PINOUT NOT QUALIFIED');
    expect(result.esp32Files['README.md']).toContain('SOURCE GENERATED');
    expect(result.releaseManifest.toolchain.platformio.available).toBe(false);
    expect(result.releaseManifest.toolchain.platformio.label).toBe(
      'SOURCE GENERATED — TOOLCHAIN NOT AVAILABLE',
    );
    expect(result.releaseManifest.toolchain.gowin.label).toBe(
      'BITSTREAM NOT GENERATED — VENDOR TOOLCHAIN NOT AVAILABLE',
    );
  });

  it('records the reference qualification string and does not claim a bitstream', async () => {
    const result = await exportValid();
    expect(result.releaseManifest.qualification).toBe(
      'REFERENCE PROFILE — PACKAGE/PINOUT NOT QUALIFIED',
    );
    const bitstream = result.feasibility.checks.find((check) => check.id === 'vendor-bitstream');
    expect(bitstream.status).toBe('WARNING');
    expect(result.feasibility.checks.some((check) => check.status === 'FAIL')).toBe(false);
  });

  it('places every asset on a 4 KiB erase-sector boundary', async () => {
    const result = await exportValid();
    const assets = result.manifest.assets.filter((asset) => asset.storedLength > 0);
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
      expect(asset.romOffset % ROM_SECTOR_SIZE).toBe(0);
    }
  });

  it('reports referenced assets, including image variable initial values', async () => {
    const compiled = compileValid();
    expect(referencedAssetPaths(compiled)).toContain('assets/icon.png');
  });

  it('refuses to export a program that does not compile', async () => {
    const broken = compile('not eve source', { assets: {} });
    await expect(
      buildHardwareArtifacts({
        compileResult: broken,
        assets: {},
        projectName: 'Broken',
        source: 'not eve source',
      }),
    ).rejects.toThrow(/compile without errors/i);
  });

  it('warns instead of silently dropping an undecodable asset', async () => {
    const result = await exportValid({ decodeImage: async () => null });
    expect(result.warnings.some((warning) => /has no decoder/i.test(warning))).toBe(true);
    // The font is still packed, so the ROM remains valid but smaller.
    expect(result.parsed.ok).toBe(true);
    expect(result.manifest.assetCount).toBe(1);
  });

  it('includes the release manifest and address map files', async () => {
    const result = await exportValid();
    expect(result.files['manifest.json']).toBeInstanceOf(Uint8Array);
    expect(result.files['address-map.json']).toBeInstanceOf(Uint8Array);
    const decode = (bytes) => new TextDecoder().decode(bytes);
    const release = JSON.parse(decode(result.files['manifest.json']));
    expect(release.schema).toBe('EVE HARDWARE RELEASE 1.0');
    expect(release.rom.totalBytes).toBe(ROM_CAPACITY);
    expect(release.files.rtl).toBe('rtl/');
    const addressMap = JSON.parse(decode(result.files['address-map.json']));
    expect(addressMap.regions.some((region) => region.kind === 'asset')).toBe(true);
    expect(addressMap.regions.some((region) => region.kind === 'free')).toBe(true);
  });
});
