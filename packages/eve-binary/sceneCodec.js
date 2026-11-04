/**
 * EVE ROM scene / variable / asset record codec.
 *
 * All records are fixed-width, little-endian and versioned. Field offsets are
 * part of EVE ROM FORMAT 1.0 (see docs/ROM_FORMAT.md) and are shared by the
 * Studio packer, the simulator ROM inspector and the FPGA scene loader.
 *
 * Scene record (40 bytes)
 *   0  u8   type              SCENE_TYPES
 *   1  u8   pageIndex
 *   2  u8   flags             bit0 visible, bit1 dynamic binding
 *   3  u8   zOrder
 *   4  u32  objectId          stable FNV-1a hash of the compiler object id
 *   8  u16  pageObjectIndex   source order within the page
 *   10 i16  x                 absolute logical pixels
 *   12 i16  y
 *   14 u16  width
 *   16 u16  height
 *   18 u32  fillColor         packed 0xRRGGBBAA (matches the EVE color type)
 *   22 u32  strokeColor
 *   26 u16  assetIndex
 *   28 u16  bindingIndex      index into the variable table (0xFFFF none)
 *   30 u16  strokeWidth
 *   32 u16  textLength        glyph count (text records)
 *   34 u32  textOffset        byte offset into the glyph text table
 *   38 u16  reserved
 *
 * Variable record (28 bytes)
 *   0  u32  id                protocol variable id
 *   4  u8   type              EVE protocol variable type
 *   5  u8   flags             bit0 has string value
 *   6  u16  reserved
 *   8  u32  nameOffset        byte offset into the string table
 *   12 u16  nameLength
 *   14 u16  reserved
 *   16 u32  valueBits         float32 bits / RGBA / 0|1 / asset index
 *   20 u32  valueOffset       string table offset for string/image values
 *   24 u16  valueLength
 *   26 u16  reserved
 *
 * Asset directory record (40 bytes)
 *   0  u32  assetId           stable FNV-1a hash of the asset path
 *   4  u8   type              ASSET_TYPES
 *   5  u8   pixelFormat       PIXEL_FORMATS
 *   6  u8   compression       0 = none
 *   7  u8   flags
 *   8  u16  width
 *   10 u16  height
 *   12 u32  romOffset
 *   16 u32  storedLength
 *   20 u32  uncompressedLength
 *   24 u32  crc32
 *   28 u16  nameOffset
 *   30 u16  nameLength
 *   32 u16  aliasOfIndex      0xFFFF = primary record
 *   34 u16  reserved
 *   36 u32  reserved
 */

import { crc32, fnv1a32 } from './checksums.js';
import { colorToRgba, floatToBits } from '../eve-protocol/eveProtocol.js';
import { encodeGlyphText } from './font5x7.js';
import { assertTextReference } from './textMemory.js';

export const SCENE_RECORD_SIZE = 40;
export const VARIABLE_RECORD_SIZE = 28;
export const ASSET_RECORD_SIZE = 40;

export const SCENE_TYPES = Object.freeze({
  PAGE: 1,
  GROUP: 2,
  RECT: 3,
  BORDER_RECT: 4,
  TEXT: 5,
  IMAGE: 6,
  BUTTON: 7,
  // Types 8..11 preserve shape identity instead of flattening unsupported
  // primitives into rectangles. They remain part of EVE ROM FORMAT 1.0; the
  // renderer reports them as unsupported until matching RTL geometry exists.
  ROUND_RECT: 8,
  CIRCLE: 9,
  LINE: 10,
  VIDEO: 11,
});

export const SCENE_TYPE_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(SCENE_TYPES).map(([name, value]) => [value, name])),
);

export const SCENE_FLAGS = Object.freeze({
  VISIBLE: 0x01,
  DYNAMIC: 0x02,
  CLIP: 0x04,
  CENTER_TEXT: 0x08,
});

export const ASSET_TYPES = Object.freeze({
  IMAGE: 1,
  FONT: 2,
  GLYPH_METRICS: 3,
  RAW: 4,
});

export const PIXEL_FORMATS = Object.freeze({
  NONE: 0,
  RGB565_LE: 1,
  RGB888: 2,
  RGBA8888: 3,
  A8: 4,
  INDEXED8: 5,
});

export const PIXEL_FORMAT_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(PIXEL_FORMATS).map(([name, value]) => [value, name])),
);

export const NO_INDEX = 0xffff;

export function stableObjectId(id) {
  return fnv1a32(String(id));
}

/* ------------------------------------------------------------------------- *
 * Scene records
 * ------------------------------------------------------------------------- */

export function encodeSceneRecord(record) {
  if (record.type === SCENE_TYPES.TEXT) {
    assertTextReference(record.textOffset ?? 0, record.textLength ?? 0, {
      label: `scene text record${record.objectId != null ? ` ${record.objectId}` : ''}`,
    });
  }
  const bytes = new Uint8Array(SCENE_RECORD_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, record.type);
  view.setUint8(1, record.pageIndex & 0xff);
  view.setUint8(2, record.flags & 0xff);
  view.setInt8(3, clampInt(record.zOrder ?? 0, -128, 127));
  view.setUint32(4, record.objectId >>> 0, true);
  view.setUint16(8, record.pageObjectIndex & 0xffff, true);
  view.setInt16(10, clampInt(record.x ?? 0, -32768, 32767), true);
  view.setInt16(12, clampInt(record.y ?? 0, -32768, 32767), true);
  view.setUint16(14, clampInt(record.width ?? 0, 0, 65535), true);
  view.setUint16(16, clampInt(record.height ?? 0, 0, 65535), true);
  view.setUint32(18, record.fillColor >>> 0, true);
  view.setUint32(22, record.strokeColor >>> 0, true);
  view.setUint16(26, record.assetIndex ?? NO_INDEX, true);
  view.setUint16(28, record.bindingIndex ?? NO_INDEX, true);
  view.setUint16(30, clampInt(record.strokeWidth ?? 0, 0, 65535), true);
  view.setUint16(32, clampInt(record.textLength ?? 0, 0, 65535), true);
  view.setUint32(34, record.textOffset ?? 0, true);
  view.setUint16(38, record.reserved ?? 0, true);
  return bytes;
}

export function decodeSceneRecord(bytes, offset = 0) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, SCENE_RECORD_SIZE);
  return {
    type: view.getUint8(0),
    typeName: SCENE_TYPE_NAMES[view.getUint8(0)] || 'UNKNOWN',
    pageIndex: view.getUint8(1),
    flags: view.getUint8(2),
    zOrder: view.getInt8(3),
    objectId: view.getUint32(4, true),
    pageObjectIndex: view.getUint16(8, true),
    x: view.getInt16(10, true),
    y: view.getInt16(12, true),
    width: view.getUint16(14, true),
    height: view.getUint16(16, true),
    fillColor: view.getUint32(18, true),
    strokeColor: view.getUint32(22, true),
    assetIndex: view.getUint16(26, true),
    bindingIndex: view.getUint16(28, true),
    strokeWidth: view.getUint16(30, true),
    textLength: view.getUint16(32, true),
    textOffset: view.getUint32(34, true),
    reserved: view.getUint16(38, true),
  };
}

export function encodeSceneTable(records) {
  const bytes = new Uint8Array(records.length * SCENE_RECORD_SIZE);
  records.forEach((record, index) => {
    bytes.set(encodeSceneRecord(record), index * SCENE_RECORD_SIZE);
  });
  return bytes;
}

export function decodeSceneTable(bytes, count = bytes.length / SCENE_RECORD_SIZE) {
  const records = [];
  for (let index = 0; index < count; index += 1) {
    records.push(decodeSceneRecord(bytes, index * SCENE_RECORD_SIZE));
  }
  return records;
}

/* ------------------------------------------------------------------------- *
 * Variable records
 * ------------------------------------------------------------------------- */

export function encodeVariableRecord(record) {
  const bytes = new Uint8Array(VARIABLE_RECORD_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, record.id >>> 0, true);
  view.setUint8(4, record.type);
  view.setUint8(5, record.flags ?? 0);
  view.setUint16(6, 0, true);
  view.setUint32(8, record.nameOffset ?? 0, true);
  view.setUint16(12, record.nameLength ?? 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, record.valueBits >>> 0, true);
  view.setUint32(20, record.valueOffset ?? 0, true);
  view.setUint16(24, record.valueLength ?? 0, true);
  view.setUint16(26, 0, true);
  return bytes;
}

export function decodeVariableRecord(bytes, offset = 0) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, VARIABLE_RECORD_SIZE);
  return {
    id: view.getUint32(0, true),
    type: view.getUint8(4),
    flags: view.getUint8(5),
    nameOffset: view.getUint32(8, true),
    nameLength: view.getUint16(12, true),
    valueBits: view.getUint32(16, true),
    valueOffset: view.getUint32(20, true),
    valueLength: view.getUint16(24, true),
  };
}

export function encodeVariableTable(records) {
  const bytes = new Uint8Array(records.length * VARIABLE_RECORD_SIZE);
  records.forEach((record, index) => bytes.set(encodeVariableRecord(record), index * VARIABLE_RECORD_SIZE));
  return bytes;
}

export function decodeVariableTable(bytes, count = bytes.length / VARIABLE_RECORD_SIZE) {
  const records = [];
  for (let index = 0; index < count; index += 1) {
    records.push(decodeVariableRecord(bytes, index * VARIABLE_RECORD_SIZE));
  }
  return records;
}

/* ------------------------------------------------------------------------- *
 * Asset directory
 * ------------------------------------------------------------------------- */

export function encodeAssetRecord(record) {
  const bytes = new Uint8Array(ASSET_RECORD_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, record.assetId >>> 0, true);
  view.setUint8(4, record.type);
  view.setUint8(5, record.pixelFormat ?? PIXEL_FORMATS.NONE);
  view.setUint8(6, record.compression ?? 0);
  view.setUint8(7, record.flags ?? 0);
  view.setUint16(8, record.width ?? 0, true);
  view.setUint16(10, record.height ?? 0, true);
  view.setUint32(12, record.romOffset >>> 0, true);
  view.setUint32(16, record.storedLength >>> 0, true);
  view.setUint32(20, record.uncompressedLength >>> 0, true);
  view.setUint32(24, record.crc32 >>> 0, true);
  view.setUint16(28, record.nameOffset ?? 0, true);
  view.setUint16(30, record.nameLength ?? 0, true);
  view.setUint16(32, record.aliasOfIndex ?? NO_INDEX, true);
  view.setUint16(34, 0, true);
  view.setUint32(36, 0, true);
  return bytes;
}

export function decodeAssetRecord(bytes, offset = 0) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, ASSET_RECORD_SIZE);
  return {
    assetId: view.getUint32(0, true),
    type: view.getUint8(4),
    pixelFormat: view.getUint8(5),
    compression: view.getUint8(6),
    flags: view.getUint8(7),
    width: view.getUint16(8, true),
    height: view.getUint16(10, true),
    romOffset: view.getUint32(12, true),
    storedLength: view.getUint32(16, true),
    uncompressedLength: view.getUint32(20, true),
    crc32: view.getUint32(24, true),
    nameOffset: view.getUint16(28, true),
    nameLength: view.getUint16(30, true),
    aliasOfIndex: view.getUint16(32, true),
  };
}

export function encodeAssetTable(records) {
  const bytes = new Uint8Array(records.length * ASSET_RECORD_SIZE);
  records.forEach((record, index) => bytes.set(encodeAssetRecord(record), index * ASSET_RECORD_SIZE));
  return bytes;
}

export function decodeAssetTable(bytes, count = bytes.length / ASSET_RECORD_SIZE) {
  const records = [];
  for (let index = 0; index < count; index += 1) {
    records.push(decodeAssetRecord(bytes, index * ASSET_RECORD_SIZE));
  }
  return records;
}

/* ------------------------------------------------------------------------- *
 * RGBA helpers and RGB565 conversion
 * ------------------------------------------------------------------------- */

export function rgbaToPacked(rgba) {
  return rgba >>> 0;
}

export function packedToRgba(value) {
  return value >>> 0;
}

export function packedToCss(value) {
  const rgba = value >>> 0;
  const r = (rgba >>> 24) & 0xff;
  const g = (rgba >>> 16) & 0xff;
  const b = (rgba >>> 8) & 0xff;
  const a = (rgba & 0xff) / 255;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

/** Convert row-major RGBA bytes into little-endian RGB565. Alpha is dropped. */
export function rgbaToRgb565(rgba) {
  const pixels = rgba.length / 4;
  const out = new Uint8Array(pixels * 2);
  for (let index = 0; index < pixels; index += 1) {
    const r = rgba[index * 4];
    const g = rgba[index * 4 + 1];
    const b = rgba[index * 4 + 2];
    const value = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
    out[index * 2] = value & 0xff;
    out[index * 2 + 1] = (value >>> 8) & 0xff;
  }
  return out;
}

export function rgb565ToRgba(bytes) {
  const out = new Uint8Array((bytes.length / 2) * 4);
  for (let index = 0; index < bytes.length / 2; index += 1) {
    const value = bytes[index * 2] | (bytes[index * 2 + 1] << 8);
    const r = ((value >>> 11) & 0x1f) << 3;
    const g = ((value >>> 5) & 0x3f) << 2;
    const b = (value & 0x1f) << 3;
    out[index * 4] = r | (r >>> 5);
    out[index * 4 + 1] = g | (g >>> 6);
    out[index * 4 + 2] = b | (b >>> 5);
    out[index * 4 + 3] = 255;
  }
  return out;
}

/* ------------------------------------------------------------------------- *
 * Scene flattening
 * ------------------------------------------------------------------------- */

function clampInt(value, min, max) {
  const number = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  return Math.max(min, Math.min(max, number));
}

function absolutize(node, originX, originY) {
  const layout = node.initialLayout || { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: originX + (layout.x || 0),
    y: originY + (layout.y || 0),
    width: layout.width || 0,
    height: layout.height || 0,
  };
}

function staticValue(node, property) {
  const descriptor = node.props?.[property];
  if (!descriptor) return undefined;
  if (descriptor.kind === 'static') return descriptor.value;
  return undefined;
}

function dynamic(node, property) {
  return (node.dynamicProperties || []).includes(property);
}

/**
 * Flatten the resolved EVE scene into hardware records.
 *
 * @param {object} options
 * @param {object} options.scene       compile().scene
 * @param {Array}  options.registry    compile().registry
 * @param {Map}    options.variableIndexByPath   path -> variable table index
 * @param {Map}    options.assetIndexByPath      asset path -> asset index
 * @param {Map}    options.bindingIndexByKey     "nodeId:property" -> variable index
 * @param {(node:object, property:string)=>string} options.resolveText
 *        Resolves binding descriptors to their initial rendered string.
 * @param {(node:object, property:string)=>*} [options.resolveValue]
 *        Resolves a dynamic binding to its initial value (colors, assets).
 */
export function flattenScene({
  scene,
  registry,
  variableIndexByPath,
  assetIndexByPath,
  bindingIndexByKey = new Map(),
  resolveText = () => '',
  resolveValue = () => undefined,
}) {
  const records = [];
  const textChunks = [];
  let textBytes = 0;
  const pushText = (text) => {
    const bytes = text instanceof Uint8Array ? text : new Uint8Array();
    if (bytes.length === 0) return { offset: 0, length: 0 };
    assertTextReference(textBytes, bytes.length, {
      label: `glyph text entry ${textChunks.length + 1}`,
    });
    const offset = textBytes;
    textChunks.push(bytes);
    textBytes += bytes.length;
    return { offset, length: bytes.length };
  };

  scene.pages.forEach((page, pageIndex) => {
    records.push({
      type: SCENE_TYPES.PAGE,
      pageIndex,
      flags: SCENE_FLAGS.VISIBLE,
      zOrder: 0,
      objectId: stableObjectId(`page:${page.id}`),
      pageObjectIndex: 0,
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
      fillColor: colorToRgba(page.background || '#000000'),
      strokeColor: 0,
      assetIndex: NO_INDEX,
      bindingIndex: NO_INDEX,
      strokeWidth: 0,
      textLength: 0,
      textOffset: 0,
    });
  });

  const walk = (node, pageIndex, originX, originY, sourceIndex) => {
    const box = absolutize(node, originX, originY);
    const base = {
      pageIndex,
      pageObjectIndex: sourceIndex,
      objectId: stableObjectId(node.id),
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      fillColor: 0,
      strokeColor: 0,
      assetIndex: NO_INDEX,
      bindingIndex: NO_INDEX,
      strokeWidth: 0,
      textLength: 0,
      textOffset: 0,
      zOrder: Number(staticValue(node, 'zIndex') ?? 0),
      flags: SCENE_FLAGS.VISIBLE,
    };

    if (staticValue(node, 'visible') === false) base.flags &= ~SCENE_FLAGS.VISIBLE;

    const bindingFor = (property) => {
      if (!dynamic(node, property)) return NO_INDEX;
      return bindingIndexByKey.get(`${node.id}:${property}`) ?? NO_INDEX;
    };

    const valueFor = (property, fallback) => {
      const descriptor = node.props?.[property];
      if (!descriptor) return fallback;
      if (descriptor.kind === 'static') return descriptor.value;
      if (dynamic(node, property)) {
        const resolved = resolveValue(node, property);
        return resolved === undefined || resolved === null ? fallback : resolved;
      }
      return fallback;
    };

    const tag = node.tag;
    if (tag === 'group') {
      const background = valueFor('background', null);
      if (background && background !== 'transparent') {
        records.push({
          ...base,
          type: SCENE_TYPES.RECT,
          fillColor: colorToRgba(background),
        });
      }
    } else if (tag === 'shape') {
      const shapeType = staticValue(node, 'type') || 'rect';
      const strokeColor = colorToRgba(valueFor('stroke', 'transparent'));
      const strokeWidth = Math.max(0, Number(staticValue(node, 'strokeWidth') ?? 0) || 0);
      const bordered = shapeType === 'rect' && strokeWidth > 0 && (strokeColor & 0xff) !== 0;
      let sceneType = SCENE_TYPES.RECT;
      if (bordered) sceneType = SCENE_TYPES.BORDER_RECT;
      else if (shapeType === 'roundRect') sceneType = SCENE_TYPES.ROUND_RECT;
      else if (shapeType === 'circle') sceneType = SCENE_TYPES.CIRCLE;
      else if (shapeType === 'line') sceneType = SCENE_TYPES.LINE;
      records.push({
        ...base,
        type: sceneType,
        fillColor: colorToRgba(valueFor('fill', 'transparent')),
        strokeColor,
        strokeWidth,
        flags: dynamic(node, 'fill') ? base.flags | SCENE_FLAGS.DYNAMIC : base.flags,
        bindingIndex: bindingFor('fill'),
      });
    } else if (tag === 'img') {
      const src = valueFor('src', null);
      const assetIndex = src ? assetIndexByPath.get(src) ?? NO_INDEX : NO_INDEX;
      records.push({
        ...base,
        type: SCENE_TYPES.IMAGE,
        assetIndex,
        flags: dynamic(node, 'src') ? base.flags | SCENE_FLAGS.DYNAMIC : base.flags,
        bindingIndex: bindingFor('src'),
      });
    } else if (tag === 'vid') {
      const src = valueFor('src', null);
      const assetIndex = src ? assetIndexByPath.get(src) ?? NO_INDEX : NO_INDEX;
      records.push({
        ...base,
        type: SCENE_TYPES.VIDEO,
        assetIndex,
        flags: dynamic(node, 'src') ? base.flags | SCENE_FLAGS.DYNAMIC : base.flags,
        bindingIndex: bindingFor('src'),
      });
    } else if (tag === 'button') {
      const borderWidth = Math.max(0, Number(staticValue(node, 'borderWidth') ?? 0) || 0);
      records.push({
        ...base,
        type: borderWidth > 0 ? SCENE_TYPES.BORDER_RECT : SCENE_TYPES.RECT,
        fillColor: colorToRgba(valueFor('background', '#2455AA')),
        strokeColor: colorToRgba(valueFor('borderColor', 'transparent')),
        strokeWidth: borderWidth,
        flags: dynamic(node, 'background') ? base.flags | SCENE_FLAGS.DYNAMIC : base.flags,
        bindingIndex: bindingFor('background'),
      });
    } else if (tag === 'text') {
      const textDescriptor = node.props?.text;
      let text = '';
      if (textDescriptor?.kind === 'binding') text = resolveText(node, 'text');
      else text = String(textDescriptor?.value ?? '');
      const encoded = encodeText(text);
      const entry = pushText(encoded);
      const textColor = colorToRgba(valueFor('color', '#FFFFFF'));
      records.push({
        ...base,
        type: SCENE_TYPES.TEXT,
        fillColor: textColor,
        textOffset: entry.offset,
        textLength: entry.length,
        zOrder: base.zOrder + 1,
        flags:
          (dynamic(node, 'text') ? base.flags | SCENE_FLAGS.DYNAMIC : base.flags) |
          ((staticValue(node, 'align') || 'left') === 'center' ? SCENE_FLAGS.CENTER_TEXT : 0),
        bindingIndex: bindingFor('text'),
        strokeColor: textColor,
      });
    }

    let childSource = 0;
    for (const child of node.children || []) {
      if (!['group', 'text', 'img', 'vid', 'button', 'shape'].includes(child.tag)) continue;
      walk(child, pageIndex, box.x, box.y, childSource);
      childSource += 1;
    }
  };

  scene.pages.forEach((page, pageIndex) => {
    let sourceIndex = 0;
    for (const component of page.components || []) {
      walk(component, pageIndex, 0, 0, sourceIndex);
      sourceIndex += 1;
    }
  });

  // Text records are emitted after their object so offsets remain stable.
  const textTable = concatBytes(textChunks);

  // Sort by page, z-order and source order for deterministic painter's order.
  const pageRecords = records.filter((record) => record.type === SCENE_TYPES.PAGE);
  const objectRecords = records
    .filter((record) => record.type !== SCENE_TYPES.PAGE)
    .sort((a, b) => a.pageIndex - b.pageIndex || a.zOrder - b.zOrder || a.pageObjectIndex - b.pageObjectIndex);
  const ordered = [...pageRecords, ...objectRecords];

  return {
    records: ordered,
    textTable,
    pageCount: scene.pages.length,
    initialPageIndex: Math.max(0, scene.pages.findIndex((page) => page.id === scene.initialPage)),
    objectCount: objectRecords.length,
    registry,
    variableIndexByPath,
    assetIndexByPath,
  };
}

function encodeText(text) {
  // Callers normally pass glyph bytes. Plain strings are encoded using the
  // built-in font so the packer and RTL agree on glyph indexing.
  if (text instanceof Uint8Array) return text;
  return encodeGlyphText(String(text ?? ''));
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function sceneStats(records) {
  const counts = {};
  for (const record of records) {
    const name = SCENE_TYPE_NAMES[record.type] || 'UNKNOWN';
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

export function recordCrc(record) {
  return crc32(encodeSceneRecord(record));
}

export function variableValueBits(type, value) {
  if (type === 'number') return floatToBits(Number(value) || 0);
  if (type === 'boolean') return value === true || value === 'true' ? 1 : 0;
  if (type === 'color') return colorToRgba(value);
  if (type === 'image') return 0;
  return 0;
}

export { fnv1a32, crc32 };
