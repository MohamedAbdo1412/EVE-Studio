import { describe, expect, it } from 'vitest';
import {
  framePackageFromFiles,
  parseFramePackageJson,
} from '../simulator/src/format.js';

function fileLike(name, text) {
  return { name, text: async () => text };
}

const DIAGNOSTICS = {
  status: 'PARTIAL',
  renderedObjectCount: 3,
  unsupportedObjectCount: 2,
  missingAssetCount: 1,
  unsupported: [{ type: 8, typeName: 'ROUND_RECT', pageObjectIndex: 4, reason: 'not implemented' }],
  missingAssets: [{ kind: 'font', reason: 'missing atlas' }],
};

describe('frame package file loading', () => {
  it('accepts optional frame.diagnostics.json alongside the four package files', async () => {
    const pkg = await framePackageFromFiles([
      fileLike('frame.meta', '96 64 2 101820\n'),
      fileLike('oam.hex', '00\n'),
      fileLike('text.hex', '00\n'),
      fileLike('font.hex', '00\n'),
      fileLike('frame.diagnostics.json', JSON.stringify(DIAGNOSTICS)),
    ]);
    expect(pkg.meta).toContain('96 64');
    expect(pkg.diagnostics).toMatchObject({
      status: 'PARTIAL',
      renderedObjectCount: 3,
      unsupportedObjectCount: 2,
      missingAssetCount: 1,
    });
    expect(pkg.diagnostics.unsupported[0].typeName).toBe('ROUND_RECT');
  });

  it('round-trips diagnostics embedded in a package JSON file', () => {
    const pkg = parseFramePackageJson(
      JSON.stringify({
        framePackage: {
          meta: '96 64 0 101820\n',
          oamHex: '',
          textHex: '00\n',
          fontHex: '00\n',
          diagnostics: DIAGNOSTICS,
        },
      }),
    );
    expect(pkg.diagnostics.status).toBe('PARTIAL');
    expect(pkg.diagnostics.missingAssets).toHaveLength(1);
  });

  it('treats a diagnostics file as optional and validates its JSON', async () => {
    const base = [
      fileLike('frame.meta', '96 64 0 101820\n'),
      fileLike('oam.hex', ''),
      fileLike('text.hex', '00\n'),
      fileLike('font.hex', '00\n'),
    ];
    const withoutDiagnostics = await framePackageFromFiles(base);
    expect(withoutDiagnostics.diagnostics).toBeNull();
    await expect(
      framePackageFromFiles([...base, fileLike('frame.diagnostics.json', '{oops')]),
    ).rejects.toThrow(/diagnostics file is invalid/i);
  });

  it('reports the missing package files explicitly', async () => {
    await expect(framePackageFromFiles([fileLike('frame.meta', '96 64 0 101820\n')])).rejects.toThrow(
      /missing: oam.hex, text.hex, font.hex/,
    );
  });
});
