import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packObject, hexWord160 } from '../../packages/eve-binary/framePackage.js';
import { buildFontAtlas, encodeGlyphText } from '../../packages/eve-binary/font5x7.js';

const target = process.argv[2];
if (!target) throw new Error('usage: node makeRenderFixture.mjs <dir>');
mkdirSync(target, { recursive: true });

const width = 64;
const height = 48;
const background = 0x101820;

const label = encodeGlyphText('EVE 64');
const textBytes = new Uint8Array(4096);
textBytes.set(label, 0);

const objects = [
  packObject({ type: 1, x: 0, y: 0, width: 64, height: 8, fillColor: 0x204060, zOrder: 0 }),
  packObject({ type: 2, x: 4, y: 10, width: 48, height: 20, fillColor: 0x00aa44, strokeColor: 0xffffff, strokeWidth: 2, zOrder: 1 }),
  packObject({ type: 3, x: 6, y: 34, width: 60, height: 8, fillColor: 0xffffff, zOrder: 2, textOffset: 0, textLength: label.length }),
];

const atlas = buildFontAtlas();

writeFileSync(join(target, 'frame.meta'), `${width} ${height} ${objects.length} ${background.toString(16).padStart(6, '0')}\n`);
writeFileSync(join(target, 'oam.hex'), `${objects.map(hexWord160).join('\n')}\n`);
writeFileSync(join(target, 'text.hex'), `${Array.from(textBytes, (b) => b.toString(16).padStart(2, '0')).join('\n')}\n`);
writeFileSync(
  join(target, 'font.hex'),
  `${Array.from(atlas.pixels, (b) => b.toString(16).padStart(2, '0')).join('\n')}\n`,
);
console.log(`fixture written to ${target} (${objects.length} objects, label ${label.length} glyphs)`);
