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

import { SCENE_TYPES, NO_INDEX, ASSET_TYPES } from './sceneCodec.js';
import {
  TEXT_MEMORY_BYTES,
  assertTextReference,
  validateTextReference,
} from './textMemory.js';

export const FRAME_MAX_OBJECTS = 16;
export const FRAME_TEXT_BYTES = TEXT_MEMORY_BYTES;
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
  assertTextReference(textOffset, textLength, { label: `OAM object type ${type}` });
  value |= BigInt(textOffset) << 111n;
  value |= BigInt(textLength) << 123n;
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
  const unsupported = [];
  const missingAssets = [];
  const objects = [];
  const pageObjects = parsed.sceneTable
    .filter((record) => record.pageIndex === page && record.type !== SCENE_TYPES.PAGE)
    .sort((a, b) => a.zOrder - b.zOrder || a.pageObjectIndex - b.pageObjectIndex);

  const addUnsupported = (record, reason) => {
    const entry = {
      kind: record.typeName.toLowerCase(),
      type: record.type,
      typeName: record.typeName,
      pageObjectIndex: record.pageObjectIndex,
      objectId: `0x${(record.objectId >>> 0).toString(16).padStart(8, '0')}`,
      reason,
    };
    unsupported.push(entry);
    warnings.push(`Object ${record.pageObjectIndex} (${record.typeName}) is unsupported: ${reason}`);
  };

  const addMissingAsset = (record, reason) => {
    missingAssets.push({
      kind: record.typeName.toLowerCase(),
      type: record.type,
      typeName: record.typeName,
      pageObjectIndex: record.pageObjectIndex,
      objectId: `0x${(record.objectId >>> 0).toString(16).padStart(8, '0')}`,
      reason,
    });
    warnings.push(`Object ${record.pageObjectIndex} (${record.typeName}) has a missing asset: ${reason}`);
  };

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
      const check = validateTextReference(record.textOffset, record.textLength, {
        label: `Text object ${record.pageObjectIndex}`,
      });
      if (!check.ok) throw new Error(check.error);
      if (record.textOffset + record.textLength > parsed.texts.length) {
        throw new Error(
          `Text object ${record.pageObjectIndex}: range ${record.textOffset}..${
            record.textOffset + record.textLength
          } exceeds the ROM text table (${parsed.texts.length} bytes)`,
        );
      }
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
      const asset = parsed.assetTable[record.assetIndex] || null;
      if (!asset || record.assetIndex === NO_INDEX) {
        addMissingAsset(record, 'no decoded image asset is present in the ROM.');
      }
      addUnsupported(
        record,
        'the RTL renderer does not fetch RGB565 image assets or composite bitmap pixels.',
      );
    } else if (record.type === SCENE_TYPES.VIDEO) {
      addUnsupported(record, 'video frames are not represented by EVE ROM FORMAT 1.0 or the RTL renderer.');
    } else if (record.type === SCENE_TYPES.CIRCLE) {
      addUnsupported(record, 'circle geometry is not implemented by the RTL renderer.');
    } else if (record.type === SCENE_TYPES.LINE) {
      addUnsupported(record, 'line geometry is not implemented by the RTL renderer.');
    } else if (record.type === SCENE_TYPES.ROUND_RECT) {
      addUnsupported(
        record,
        'rounded-rectangle geometry is not implemented by the RTL renderer; it is not drawn as a rectangle.',
      );
    } else {
      addUnsupported(record, `${record.typeName} objects are not rendered by the RTL vertical slice.`);
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
    if (objects.some((object) => object.kind === 'text')) {
      missingAssets.push({
        kind: 'font',
        type: ASSET_TYPES.FONT,
        typeName: 'FONT',
        pageObjectIndex: null,
        objectId: null,
        reason: `the ROM contains text objects but no ${FRAME_FONT_BYTES}-byte font asset.`,
      });
    }
  }

  const textBytes = new Uint8Array(FRAME_TEXT_BYTES);
  textBytes.set(parsed.texts.subarray(0, Math.min(parsed.texts.length, FRAME_TEXT_BYTES)));

  const meta = `${width} ${height} ${objects.length} ${background.toString(16).padStart(6, '0')}\n`;
  const oamHex = objects.map((object) => `${hexWord160(object.word)}\n`).join('');
  const textHex = bytesToHexLines(textBytes);
  const fontHex = bytesToHexLines(fontBytes);

  const complete = unsupported.length === 0 && missingAssets.length === 0;
  const diagnostics = {
    status: complete ? 'COMPLETE' : 'PARTIAL',
    renderedObjectCount: objects.length,
    unsupportedObjectCount: unsupported.length,
    missingAssetCount: missingAssets.length,
    unsupported,
    missingAssets,
  };

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
    diagnostics,
    renderedObjectCount: diagnostics.renderedObjectCount,
    unsupportedObjectCount: diagnostics.unsupportedObjectCount,
    missingAssetCount: diagnostics.missingAssetCount,
    status: diagnostics.status,
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
    'frame.diagnostics.json': encode(`${JSON.stringify(pkg.diagnostics ?? {}, null, 2)}\n`),
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
