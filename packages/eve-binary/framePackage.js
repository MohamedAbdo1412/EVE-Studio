/**
 * Pack a parsed EVE ROM into the RTL renderer's frame package.
 *
 * The renderer consumes four plain-text files:
 *   frame.meta   "<width> <height> <objectCount> <bgRGBHex>"
 *   oam.hex      one 160-bit hex word per object, in host z-order
 *   text.hex     4096 glyph-index bytes
 *   font.hex     4096 A8 atlas bytes (128x32, 8x8 glyph cells)
 *
 * This module is shared by EVE Studio (preview), the simulator backend and the
 * Icarus/Verilator frame-capture testbench input generator. It never invents
 * geometry: every field comes from a ROM scene record.
 */

import { SCENE_TYPES, NO_INDEX } from './sceneCodec.js';
import { ASSET_TYPES } from './sceneCodec.js';

export const FRAME_MAX_OBJECTS = 16;
export const FRAME_TEXT_BYTES = 4096;
export const FRAME_FONT_BYTES = 4096;

const TYPE_RECT = 1;
const TYPE_BORDER_RECT = 2;
const TYPE_TEXT = 3;

function rgbaToRgb(rgba) {
  const value = rgba >>> 0;
  return ((value >>> 24) << 16) | (((value >>> 16) & 0xff) << 8) | ((value >>> 8) & 0xff);
}

function clamp11(value) {
  const number = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  return Math.max(0, Math.min(2047, number));
}

export function packObject({
  type,
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fillColor = 0,
  strokeColor = 0,
  strokeWidth = 0,
  zOrder = 0,
  textOffset = 0,
  textLength = 0,
  visible = true,
  centerText = false,
}) {
  let value = 0n;
  value |= BigInt(type & 0x7);
  value |= BigInt(clamp11(x)) << 3n;
  value |= BigInt(clamp11(y)) << 14n;
  value |= BigInt(clamp11(width)) << 25n;
  value |= BigInt(clamp11(height)) << 36n;
  value |= BigInt(fillColor & 0xffffff) << 47n;
  value |= BigInt(strokeColor & 0xffffff) << 71n;
  value |= BigInt(strokeWidth & 0xff) << 95n;
  value |= BigInt(zOrder & 0xff) << 103n;
  value |= BigInt(textOffset & 0xfff) << 111n;
  value |= BigInt(textLength & 0xff) << 123n;
  value |= BigInt(visible ? 1 : 0) << 131n;
  value |= BigInt(centerText ? 1 : 0) << 132n;
  return value;
}

export function hexWord160(value) {
  return value.toString(16).padStart(40, '0');
}

/**
 * Build the renderer package from a parseRom() result.
 *
 * @param {object} parsed         parseRom() success result
 * @param {object} [options]
 * @param {number} [options.pageIndex] override the ROM initial page
 * @returns {{meta:string,oamHex:string,textHex:string,fontHex:string,objects:Array,background:number,warnings:Array}}
 */
export function framePackageFromRom(parsed, { pageIndex } = {}) {
  if (!parsed?.ok) throw new Error('framePackageFromRom requires a parsed, valid ROM');

  const page = typeof pageIndex === 'number' ? pageIndex : parsed.header.initialPage;
  const width = parsed.header.width;
  const height = parsed.header.height;
  if (width < 1 || width > 2048 || height < 1 || height > 2048) {
    throw new Error(`Renderer supports 1..2048 px, received ${width}x${height}`);
  }

  const pageRecord = parsed.sceneTable.find(
    (record) => record.type === SCENE_TYPES.PAGE && record.pageIndex === page,
  );
  const background = rgbaToRgb(pageRecord?.fillColor ?? 0);

  const warnings = [];
  const objects = [];
  const pageObjects = parsed.sceneTable
    .filter((record) => record.pageIndex === page && record.type !== SCENE_TYPES.PAGE)
    .sort((a, b) => a.zOrder - b.zOrder || a.pageObjectIndex - b.pageObjectIndex);

  for (const record of pageObjects) {
    const visible = (record.flags & 0x01) !== 0;
    if (record.type === SCENE_TYPES.RECT) {
      objects.push({
        kind: 'rect',
        record,
        word: packObject({
          type: TYPE_RECT,
          x: record.x,
          y: record.y,
          width: record.width,
          height: record.height,
          fillColor: rgbaToRgb(record.fillColor),
          zOrder: record.zOrder,
          visible,
        }),
      });
    } else if (record.type === SCENE_TYPES.BORDER_RECT) {
      objects.push({
        kind: 'border-rect',
        record,
        word: packObject({
          type: TYPE_BORDER_RECT,
          x: record.x,
          y: record.y,
          width: record.width,
          height: record.height,
          fillColor: rgbaToRgb(record.fillColor),
          strokeColor: rgbaToRgb(record.strokeColor),
          strokeWidth: record.strokeWidth,
          zOrder: record.zOrder,
          visible,
        }),
      });
    } else if (record.type === SCENE_TYPES.TEXT) {
      objects.push({
        kind: 'text',
        record,
        word: packObject({
          type: TYPE_TEXT,
          x: record.x,
          y: record.y,
          width: record.width,
          height: record.height,
          fillColor: rgbaToRgb(record.fillColor),
          zOrder: record.zOrder,
          textOffset: record.textOffset,
          textLength: record.textLength,
          visible,
          centerText: (record.flags & 0x08) !== 0,
        }),
      });
    } else if (record.type === SCENE_TYPES.IMAGE) {
      warnings.push(
        `Object ${record.pageObjectIndex} is an image; the RTL vertical slice does not composite bitmap assets yet.`,
      );
    } else {
      warnings.push(`Object type ${record.typeName} is not rendered by the RTL vertical slice.`);
    }
  }

  if (objects.length > FRAME_MAX_OBJECTS) {
    throw new Error(
      `Frame needs ${objects.length} objects but the RTL renderer supports ${FRAME_MAX_OBJECTS}. ` +
        'Objects were not truncated.',
    );
  }

  const fontAsset = parsed.assetTable.find((asset) => asset.type === ASSET_TYPES.FONT);
  let fontBytes = new Uint8Array(FRAME_FONT_BYTES);
  if (fontAsset) {
    const payload = parsed.readAsset(fontAsset);
    fontBytes.set(payload.subarray(0, Math.min(payload.length, FRAME_FONT_BYTES)));
    if (payload.length !== FRAME_FONT_BYTES) {
      warnings.push(`Font atlas is ${payload.length} bytes; expected ${FRAME_FONT_BYTES}.`);
    }
  } else {
    warnings.push('ROM has no font asset; text will render blank.');
  }

  const textBytes = new Uint8Array(FRAME_TEXT_BYTES);
  textBytes.set(parsed.texts.subarray(0, Math.min(parsed.texts.length, FRAME_TEXT_BYTES)));

  const meta = `${width} ${height} ${objects.length} ${background.toString(16).padStart(6, '0')}\n`;
  const oamHex = objects.map((object) => `${hexWord160(object.word)}\n`).join('');
  const textHex = bytesToHexLines(textBytes);
  const fontHex = bytesToHexLines(fontBytes);

  return {
    meta,
    oamHex,
    textHex,
    fontHex,
    objects: objects.map((object, index) => ({
      index,
      kind: object.kind,
      record: object.record,
    })),
    background,
    width,
    height,
    pageIndex: page,
    warnings,
  };
}

/** Convenience wrapper for tools that want a byte-ready file map. */
export function framePackageFiles(pkg) {
  const encode = (value) => new TextEncoder().encode(String(value ?? ''));
  return {
    'frame.meta': encode(pkg.meta),
    'oam.hex': encode(pkg.oamHex),
    'text.hex': encode(pkg.textHex),
    'font.hex': encode(pkg.fontHex),
  };
}

function bytesToHexLines(bytes) {
  const lines = new Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    lines[index] = bytes[index].toString(16).padStart(2, '0');
  }
  return `${lines.join('\n')}\n`;
}

export { NO_INDEX };
