/**
 * EVE ROM FORMAT 1.0 — deterministic 16 MiB SPI NOR image builder and parser.
 *
 * Layout (all unused bytes are 0xFF):
 *
 *   0x000000  header + metadata sector (4096 bytes)
 *   0x001000  scene table (40-byte records, sector aligned)
 *   ...       variable table (28-byte records, sector aligned)
 *   ...       glyph text table (sector aligned)
 *   ...       string table (sector aligned)
 *   ...       asset directory (40-byte records, sector aligned)
 *   ...       asset payloads, each starting on a 4 KiB erase-sector boundary
 *
 * Checksum strategy (see docs/ROM_FORMAT.md):
 *   1. contentCrc32 is CRC32 of bytes [0, usedBytes) with this field zeroed.
 *   2. sha256 is SHA-256 of bytes [0, usedBytes) with the SHA field zeroed
 *      and the CRC field populated.
 *   3. headerCrc32 is CRC32 of bytes [0, 0x60) and does not cover the content
 *      checksums.
 */

import { crc32, sha256, fnv1a32, toHex32, toHex } from './checksums.js';
import {
  SCENE_RECORD_SIZE,
  VARIABLE_RECORD_SIZE,
  ASSET_RECORD_SIZE,
  ASSET_TYPES,
  PIXEL_FORMATS,
  encodeSceneTable,
  encodeVariableTable,
  encodeAssetTable,
  decodeSceneTable,
  decodeVariableTable,
  decodeAssetTable,
  rgbaToRgb565,
  NO_INDEX,
} from './sceneCodec.js';
import { buildFontAtlas, FONT_ASSET_PATH, encodeGlyphText, decodeGlyphText } from './font5x7.js';
import { floatToBits, colorToRgba, VARIABLE_TYPES } from '../eve-protocol/eveProtocol.js';

export const ROM_FORMAT_NAME = 'EVE ROM FORMAT';
export const ROM_FORMAT_MAJOR = 1;
export const ROM_FORMAT_MINOR = 0;
export const ROM_CAPACITY = 16 * 1024 * 1024;
export const ROM_SECTOR_SIZE = 4096;
export const ROM_PAGE_SIZE = 256;
export const ROM_HEADER_SIZE = 4096;
export const ROM_MAGIC = Object.freeze([0x45, 0x56, 0x45, 0x52, 0x4f, 0x4d, 0x00, 0x00]); // "EVEROM\0\0"

export const HEADER_FIELDS = Object.freeze({
  MAGIC: 0x00,
  FORMAT_MAJOR: 0x08,
  FORMAT_MINOR: 0x0a,
  HEADER_BYTES: 0x0c,
  ROM_CAPACITY: 0x10,
  BUILD_ID: 0x14,
  APPLICATION_ID: 0x18,
  LOGICAL_WIDTH: 0x1c,
  LOGICAL_HEIGHT: 0x1e,
  INITIAL_PAGE: 0x20,
  SCENE_RECORD_SIZE: 0x21,
  VARIABLE_RECORD_SIZE: 0x22,
  ASSET_RECORD_SIZE: 0x23,
  SCENE_TABLE_OFFSET: 0x24,
  SCENE_TABLE_BYTES: 0x28,
  SCENE_COUNT: 0x2c,
  PAGE_COUNT: 0x2e,
  VARIABLE_TABLE_OFFSET: 0x30,
  VARIABLE_TABLE_BYTES: 0x34,
  VARIABLE_COUNT: 0x38,
  FONT_COUNT: 0x3a,
  ASSET_DIR_OFFSET: 0x3c,
  ASSET_DIR_BYTES: 0x40,
  ASSET_COUNT: 0x44,
  RESERVED0: 0x46,
  TEXT_TABLE_OFFSET: 0x48,
  TEXT_TABLE_BYTES: 0x4c,
  STRING_TABLE_OFFSET: 0x50,
  STRING_TABLE_BYTES: 0x54,
  DATA_OFFSET: 0x58,
  USED_BYTES: 0x5c,
  HEADER_CRC32: 0x60,
  CONTENT_CRC32: 0x64,
  SHA256: 0x68,
});

function align(value, boundary) {
  return Math.ceil(value / boundary) * boundary;
}

function writeU16(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}
function writeU32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}
function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

/* ------------------------------------------------------------------------- *
 * Asset planning
 * ------------------------------------------------------------------------- */

export const FONT_ASSET = Object.freeze({
  path: FONT_ASSET_PATH,
  name: 'eve-font-5x7.evefont',
  type: ASSET_TYPES.FONT,
  pixelFormat: PIXEL_FORMATS.A8,
  width: null,
  height: null,
  source: 'builtin',
});

/**
 * Normalise caller assets and assign stable directory indices.
 * Font atlas is always index 0. Images/fonts/raw assets follow, sorted by path.
 */
export function planAssets(assets = [], { includeBuiltinFont = true } = {}) {
  const normalised = [];

  if (includeBuiltinFont) {
    const atlas = buildFontAtlas();
    normalised.push({
      path: FONT_ASSET_PATH,
      name: 'eve-font-5x7.evefont',
      type: ASSET_TYPES.FONT,
      pixelFormat: PIXEL_FORMATS.A8,
      width: atlas.width,
      height: atlas.height,
      pixels: atlas.pixels,
      bytes: atlas.pixels,
      source: 'builtin',
      glyphWidth: atlas.glyphWidth,
      glyphHeight: atlas.glyphHeight,
      glyphColumns: atlas.columns,
    });
  }

  const sorted = [...assets]
    .filter((asset) => asset && asset.path && asset.path !== FONT_ASSET_PATH)
    .sort((a, b) => String(a.path).localeCompare(String(b.path), 'en'));

  for (const asset of sorted) {
    const entry = { ...asset };
    if (entry.bytes == null && entry.rgba) {
      entry.bytes = rgbaToRgb565(entry.rgba);
      entry.pixelFormat = PIXEL_FORMATS.RGB565_LE;
      entry.type = entry.type ?? ASSET_TYPES.IMAGE;
    }
    if (entry.bytes == null && entry.dataUrl) {
      throw new Error(`Asset ${entry.path} has no decoded pixels. Decode it before ROM packing.`);
    }
    if (!entry.bytes) {
      throw new Error(`Asset ${entry.path} has no binary payload.`);
    }
    entry.type = entry.type ?? guessAssetType(entry);
    entry.pixelFormat = entry.pixelFormat ?? PIXEL_FORMATS.NONE;
    normalised.push(entry);
  }

  const seen = new Map();
  const records = normalised.map((asset, index) => {
    const payload = asset.bytes instanceof Uint8Array ? asset.bytes : Uint8Array.from(asset.bytes);
    const digest = toHex(sha256(payload));
    const duplicate = seen.get(digest);
    const record = {
      index,
      path: asset.path,
      name: asset.name || String(asset.path).split('/').pop(),
      type: asset.type,
      pixelFormat: asset.pixelFormat,
      width: asset.width || 0,
      height: asset.height || 0,
      bytes: payload,
      digest,
      aliasOfIndex: duplicate?.index ?? NO_INDEX,
      glyph: asset.glyphWidth
        ? {
            width: asset.glyphWidth,
            height: asset.glyphHeight,
            columns: asset.glyphColumns,
          }
        : null,
      source: asset.source || 'project',
    };
    if (!duplicate) seen.set(digest, record);
    return record;
  });

  const assetIndexByPath = new Map(records.map((record) => [record.path, record.index]));
  return { records, assetIndexByPath, payloads: records.map((record) => record.bytes) };
}

function guessAssetType(asset) {
  if (String(asset.type || '').startsWith('image/')) return ASSET_TYPES.IMAGE;
  return ASSET_TYPES.RAW;
}

/* ------------------------------------------------------------------------- *
 * String table
 * ------------------------------------------------------------------------- */

function buildStringTable(entries) {
  const chunks = [];
  let offset = 0;
  const offsets = [];
  for (const text of entries) {
    const bytes = new TextEncoder().encode(String(text ?? ''));
    offsets.push({ offset, length: bytes.length });
    chunks.push(bytes);
    offset += bytes.length;
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const table = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    table.set(chunk, cursor);
    cursor += chunk.length;
  }
  return { table, offsets };
}

/* ------------------------------------------------------------------------- *
 * Builder
 * ------------------------------------------------------------------------- */

/**
 * Build a complete ROM image.
 *
 * @returns {{bytes:Uint8Array, manifest:object, header:object, addressMap:Array}}
 */
export function buildRom({
  appName = 'EVE Application',
  appId = null,
  buildId = null,
  sourceHash = '',
  width = 800,
  height = 480,
  initialPageIndex = 0,
  sceneRecords = [],
  variables = [],
  assets = [],
  textTable = new Uint8Array(0),
  includeBuiltinFont = true,
  capacity = ROM_CAPACITY,
  strict = true,
} = {}) {
  if (capacity !== ROM_CAPACITY) {
    throw new RangeError(`EVE ROM FORMAT 1.0 requires a ${ROM_CAPACITY}-byte capacity, received ${capacity}`);
  }

  const plan = planAssets(assets, { includeBuiltinFont });
  const assetRecords = plan.records;

  // String table: asset paths, variable paths, string values.
  const stringEntries = [];
  const assetStringOffsets = [];
  for (const record of assetRecords) {
    assetStringOffsets.push(stringEntries.length);
    stringEntries.push(record.path);
  }
  const variableStringOffsets = [];
  const variableValueStringOffsets = [];
  for (const variable of variables) {
    variableStringOffsets.push(stringEntries.length);
    stringEntries.push(variable.path);
    if (variable.type === 'string' || variable.type === 'image') {
      variableValueStringOffsets.push(stringEntries.length);
      stringEntries.push(String(variable.initialValue ?? ''));
    } else {
      variableValueStringOffsets.push(-1);
    }
  }
  const stringTable = buildStringTable(stringEntries);

  const initialPage = Math.max(0, Math.min(initialPageIndex || 0, Math.max(0, sceneRecords.length - 1)));

  // Encode tables.
  const sceneBytes = encodeSceneTable(sceneRecords);
  const variableTableRecords = variables.map((variable, index) => {
    const typeCode = VARIABLE_TYPES[variable.type] || VARIABLE_TYPES.string;
    const name = stringTable.offsets[variableStringOffsets[index]];
    const valueEntry = variableValueStringOffsets[index] >= 0 ? stringTable.offsets[variableValueStringOffsets[index]] : null;
    let valueBits = 0;
    if (typeCode === VARIABLE_TYPES.number) valueBits = floatToBits(Number(variable.initialValue) || 0);
    else if (typeCode === VARIABLE_TYPES.boolean) valueBits = variable.initialValue === true || variable.initialValue === 'true' ? 1 : 0;
    else if (typeCode === VARIABLE_TYPES.color) valueBits = colorToRgba(variable.initialValue);
    else if (typeCode === VARIABLE_TYPES.image) {
      const assetIndex = plan.assetIndexByPath.get(String(variable.initialValue ?? '')) ?? 0xffffffff;
      valueBits = assetIndex >>> 0;
    }
    return {
      id: variable.id >>> 0,
      type: typeCode,
      flags: valueEntry ? 0x01 : 0,
      nameOffset: name.offset,
      nameLength: name.length,
      valueBits,
      valueOffset: valueEntry ? valueEntry.offset : 0,
      valueLength: valueEntry ? valueEntry.length : 0,
    };
  });
  const variableBytes = encodeVariableTable(variableTableRecords);

  // Reserve table space on sector boundaries.
  let cursor = ROM_HEADER_SIZE;
  const sceneOffset = cursor;
  cursor = align(cursor + sceneBytes.length, ROM_SECTOR_SIZE);
  const variableOffset = cursor;
  cursor = align(cursor + variableBytes.length, ROM_SECTOR_SIZE);
  const textOffset = cursor;
  cursor = align(cursor + textTable.length, ROM_SECTOR_SIZE);
  const stringOffset = cursor;
  cursor = align(cursor + stringTable.table.length, ROM_SECTOR_SIZE);
  const assetDirOffset = cursor;
  cursor = align(cursor + assetRecords.length * ASSET_RECORD_SIZE, ROM_SECTOR_SIZE);
  const dataOffset = cursor;

  // Assign asset payload offsets. Duplicates share the primary offset.
  const primaryOffsetByDigest = new Map();
  const assetRecordBytes = [];
  const assetSummaries = [];
  cursor = dataOffset;
  for (let index = 0; index < assetRecords.length; index += 1) {
    const record = assetRecords[index];
    const nameEntry = stringTable.offsets[assetStringOffsets[index]];
    let romOffset;
    let storedLength;
    let payloadCrc;
    if (record.aliasOfIndex !== NO_INDEX) {
      const primary = assetRecordBytes[record.aliasOfIndex];
      romOffset = primary.romOffset;
      storedLength = primary.storedLength;
      payloadCrc = primary.crc32;
    } else {
      if (primaryOffsetByDigest.has(record.digest)) {
        const existing = primaryOffsetByDigest.get(record.digest);
        romOffset = existing.romOffset;
        storedLength = existing.storedLength;
        payloadCrc = existing.crc32;
      } else {
        romOffset = cursor;
        storedLength = record.bytes.length;
        payloadCrc = crc32(record.bytes);
        curorCheck(romOffset, storedLength, capacity);
        primaryOffsetByDigest.set(record.digest, { romOffset, storedLength, crc32: payloadCrc });
        cursor = align(cursor + storedLength, ROM_SECTOR_SIZE);
      }
    }
    const asset = {
      assetId: fnv1a32(record.path),
      type: record.type,
      pixelFormat: record.pixelFormat,
      compression: 0,
      flags: record.aliasOfIndex === NO_INDEX ? 0 : 0x01,
      width: record.width,
      height: record.height,
      romOffset,
      storedLength,
      uncompressedLength: record.bytes.length,
      crc32: payloadCrc,
      nameOffset: nameEntry.offset,
      nameLength: nameEntry.length,
      aliasOfIndex: record.aliasOfIndex,
    };
    assetRecordBytes.push(asset);
    assetSummaries.push({ ...record, ...asset });
  }

  const usedBytes = align(cursor, ROM_SECTOR_SIZE);
  if (usedBytes > capacity) {
    throw new RangeError(
      `ROM image requires ${usedBytes} bytes but the ${capacity}-byte device holds ${capacity}. Content was not truncated.`,
    );
  }

  const headerUsedBytes = usedBytes;
  const bytes = new Uint8Array(capacity);
  bytes.fill(0xff);

  // Header.
  bytes.set(ROM_MAGIC, HEADER_FIELDS.MAGIC);
  writeU16(bytes, HEADER_FIELDS.FORMAT_MAJOR, ROM_FORMAT_MAJOR);
  writeU16(bytes, HEADER_FIELDS.FORMAT_MINOR, ROM_FORMAT_MINOR);
  writeU32(bytes, HEADER_FIELDS.HEADER_BYTES, ROM_HEADER_SIZE);
  writeU32(bytes, HEADER_FIELDS.ROM_CAPACITY, capacity);
  const resolvedApplicationId = (appId ?? fnv1a32(String(appName))) >>> 0;
  const resolvedBuildId =
    buildId ??
    fnv1a32(
      [
        appName,
        sourceHash,
        resolvedApplicationId,
        width,
        height,
        sceneRecords.length,
        variables.length,
        assetRecords.map((record) => record.digest).join(','),
      ].join('|'),
    );
  writeU32(bytes, HEADER_FIELDS.BUILD_ID, resolvedBuildId >>> 0);
  writeU32(bytes, HEADER_FIELDS.APPLICATION_ID, resolvedApplicationId);
  writeU16(bytes, HEADER_FIELDS.LOGICAL_WIDTH, width);
  writeU16(bytes, HEADER_FIELDS.LOGICAL_HEIGHT, height);
  bytes[HEADER_FIELDS.INITIAL_PAGE] = initialPage & 0xff;
  bytes[HEADER_FIELDS.SCENE_RECORD_SIZE] = SCENE_RECORD_SIZE;
  bytes[HEADER_FIELDS.VARIABLE_RECORD_SIZE] = VARIABLE_RECORD_SIZE;
  bytes[HEADER_FIELDS.ASSET_RECORD_SIZE] = ASSET_RECORD_SIZE;
  writeU32(bytes, HEADER_FIELDS.SCENE_TABLE_OFFSET, sceneOffset);
  writeU32(bytes, HEADER_FIELDS.SCENE_TABLE_BYTES, sceneBytes.length);
  writeU16(bytes, HEADER_FIELDS.SCENE_COUNT, sceneRecords.length);
  writeU16(bytes, HEADER_FIELDS.PAGE_COUNT, sceneRecords.filter((record) => record.type === 1).length);
  writeU32(bytes, HEADER_FIELDS.VARIABLE_TABLE_OFFSET, variableOffset);
  writeU32(bytes, HEADER_FIELDS.VARIABLE_TABLE_BYTES, variableBytes.length);
  writeU16(bytes, HEADER_FIELDS.VARIABLE_COUNT, variableTableRecords.length);
  writeU16(bytes, HEADER_FIELDS.FONT_COUNT, assetRecords.filter((record) => record.type === ASSET_TYPES.FONT).length);
  writeU32(bytes, HEADER_FIELDS.ASSET_DIR_OFFSET, assetDirOffset);
  writeU32(bytes, HEADER_FIELDS.ASSET_DIR_BYTES, assetRecords.length * ASSET_RECORD_SIZE);
  writeU16(bytes, HEADER_FIELDS.ASSET_COUNT, assetRecords.length);
  writeU32(bytes, HEADER_FIELDS.TEXT_TABLE_OFFSET, textOffset);
  writeU32(bytes, HEADER_FIELDS.TEXT_TABLE_BYTES, textTable.length);
  writeU32(bytes, HEADER_FIELDS.STRING_TABLE_OFFSET, stringOffset);
  writeU32(bytes, HEADER_FIELDS.STRING_TABLE_BYTES, stringTable.table.length);
  writeU32(bytes, HEADER_FIELDS.DATA_OFFSET, dataOffset);
  writeU32(bytes, HEADER_FIELDS.USED_BYTES, headerUsedBytes);

  // Tables and payloads.
  bytes.set(sceneBytes, sceneOffset);
  bytes.set(variableBytes, variableOffset);
  bytes.set(textTable, textOffset);
  bytes.set(stringTable.table, stringOffset);
  bytes.set(encodeAssetTable(assetRecordBytes), assetDirOffset);
  for (let index = 0; index < assetRecords.length; index += 1) {
    const record = assetRecords[index];
    if (record.aliasOfIndex !== NO_INDEX) continue;
    const asset = assetRecordBytes[index];
    bytes.set(record.bytes, asset.romOffset);
  }

  // Checksums. Header CRC must be written before the content CRC because the
  // content checksum covers the complete used region including the header CRC.
  const headerCrc = crc32(bytes, 0, HEADER_FIELDS.HEADER_CRC32);
  writeU32(bytes, HEADER_FIELDS.HEADER_CRC32, headerCrc);

  writeU32(bytes, HEADER_FIELDS.CONTENT_CRC32, 0);
  bytes.fill(0, HEADER_FIELDS.SHA256, HEADER_FIELDS.SHA256 + 32);
  const contentCrc = crc32(bytes, 0, headerUsedBytes);
  writeU32(bytes, HEADER_FIELDS.CONTENT_CRC32, contentCrc);
  const digest = sha256(bytes.subarray(0, headerUsedBytes));
  bytes.set(digest, HEADER_FIELDS.SHA256);

  const addressMap = [
    { name: 'Header / metadata', offset: 0, length: ROM_HEADER_SIZE, kind: 'metadata' },
    { name: 'Scene records', offset: sceneOffset, length: sceneBytes.length, kind: 'table' },
    { name: 'Variable registry', offset: variableOffset, length: variableBytes.length, kind: 'table' },
    { name: 'Glyph text', offset: textOffset, length: textTable.length, kind: 'table' },
    { name: 'String table', offset: stringOffset, length: stringTable.table.length, kind: 'table' },
    { name: 'Asset directory', offset: assetDirOffset, length: assetRecords.length * ASSET_RECORD_SIZE, kind: 'table' },
    ...assetSummaries.map((asset) => ({
      name: asset.path,
      offset: asset.romOffset,
      length: asset.storedLength,
      kind: 'asset',
      assetId: asset.assetId,
      aliasOfIndex: asset.aliasOfIndex,
    })),
    { name: 'Free space (0xFF)', offset: headerUsedBytes, length: capacity - headerUsedBytes, kind: 'free' },
  ].filter((region) => region.length > 0);

  const header = {
    format: `${ROM_FORMAT_NAME} ${ROM_FORMAT_MAJOR}.${ROM_FORMAT_MINOR}`,
    magic: 'EVEROM',
    headerBytes: ROM_HEADER_SIZE,
    capacity,
    usedBytes: headerUsedBytes,
    freeBytes: capacity - headerUsedBytes,
    buildId: resolvedBuildId >>> 0,
    buildIdHex: `0x${toHex32(resolvedBuildId)}`,
    applicationId: resolvedApplicationId,
    applicationIdHex: `0x${toHex32(resolvedApplicationId)}`,
    width,
    height,
    initialPage,
    sceneCount: sceneRecords.length,
    pageCount: sceneRecords.filter((record) => record.type === 1).length,
    variableCount: variableTableRecords.length,
    assetCount: assetRecords.length,
    fontCount: assetRecords.filter((record) => record.type === ASSET_TYPES.FONT).length,
    contentCrc32: contentCrc >>> 0,
    contentCrc32Hex: toHex32(contentCrc),
    sha256: toHex(digest),
    headerCrc32: headerCrc >>> 0,
    headerCrc32Hex: toHex32(headerCrc),
    sceneTableOffset: sceneOffset,
    variableTableOffset: variableOffset,
    textTableOffset: textOffset,
    stringTableOffset: stringOffset,
    assetDirOffset,
    dataOffset,
  };

  const manifest = {
    fileName: 'EVE_ROM_16MB.bin',
    format: header.format,
    totalBytes: capacity,
    usedBytes: headerUsedBytes,
    freeBytes: capacity - headerUsedBytes,
    occupancyPercent: Math.round((headerUsedBytes / capacity) * 10000) / 100,
    sceneCount: header.sceneCount,
    pageCount: header.pageCount,
    variableCount: header.variableCount,
    assetCount: header.assetCount,
    imageAssetCount: assetRecords.filter((record) => record.type === ASSET_TYPES.IMAGE).length,
    fontAssetCount: header.fontCount,
    buildId: header.buildIdHex,
    applicationId: header.applicationIdHex,
    crc32: header.contentCrc32Hex,
    sha256: header.sha256,
    addressMap,
    assets: assetSummaries.map((asset) => ({
      index: asset.index,
      path: asset.path,
      assetId: `0x${toHex32(asset.assetId)}`,
      type: asset.type,
      pixelFormat: asset.pixelFormat,
      width: asset.width,
      height: asset.height,
      romOffset: asset.romOffset,
      storedLength: asset.storedLength,
      uncompressedLength: asset.uncompressedLength,
      crc32: `0x${toHex32(asset.crc32)}`,
      aliasOfIndex: asset.aliasOfIndex,
      glyph: asset.glyph,
    })),
    scenes: decodeSceneTable(sceneBytes, sceneRecords.length).map((record, index) => ({
      index,
      ...record,
      text: record.type === 5 ? decodeGlyphText(textTable.subarray(record.textOffset, record.textOffset + record.textLength)) : null,
    })),
    variables: variableTableRecords.map((record) => ({
      id: `0x${toHex32(record.id)}`,
      type: record.type,
      name: new TextDecoder().decode(
        stringTable.table.subarray(record.nameOffset, record.nameOffset + record.nameLength),
      ),
      valueOffset: record.valueOffset,
      valueLength: record.valueLength,
    })),
  };

  if (strict) {
    const parsed = parseRom(bytes, { verifyChecksums: true });
    if (!parsed.ok) throw new Error(`Internal ROM verification failed: ${parsed.error}`);
  }

  return { bytes, header, manifest, addressMap };
}

function curorCheck(offset, length, capacity) {
  if (offset + length > capacity) {
    throw new RangeError(
      `Asset payload at 0x${offset.toString(16)} (${length} bytes) exceeds ${capacity}-byte ROM capacity. Content was not truncated.`,
    );
  }
}

/* ------------------------------------------------------------------------- *
 * Parser
 * ------------------------------------------------------------------------- */

export function parseRom(input, { verifyChecksums = false } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const errors = [];
  try {
    if (bytes.length !== ROM_CAPACITY) {
      errors.push(`ROM image is ${bytes.length} bytes; EVE ROM FORMAT 1.0 requires exactly ${ROM_CAPACITY}`);
    }
    for (let index = 0; index < ROM_MAGIC.length; index += 1) {
      if (bytes[index] !== ROM_MAGIC[index]) {
        errors.push('Magic signature does not match "EVEROM"');
        break;
      }
    }
    if (errors.length) return { ok: false, error: errors[0], errors };

    const major = readU16(bytes, HEADER_FIELDS.FORMAT_MAJOR);
    const minor = readU16(bytes, HEADER_FIELDS.FORMAT_MINOR);
    if (major !== ROM_FORMAT_MAJOR) {
      return { ok: false, error: `Unsupported ROM format major ${major}`, errors: [`Unsupported ROM format major ${major}`] };
    }
    const capacity = readU32(bytes, HEADER_FIELDS.ROM_CAPACITY);
    if (capacity !== bytes.length) {
      errors.push(`Header capacity ${capacity} does not match file size ${bytes.length}`);
    }
    const usedBytes = readU32(bytes, HEADER_FIELDS.USED_BYTES);
    if (usedBytes < ROM_HEADER_SIZE || usedBytes > bytes.length || usedBytes % ROM_SECTOR_SIZE !== 0) {
      errors.push(`Invalid usedBytes ${usedBytes}`);
    }

    const sceneOffset = readU32(bytes, HEADER_FIELDS.SCENE_TABLE_OFFSET);
    const sceneBytes = readU32(bytes, HEADER_FIELDS.SCENE_TABLE_BYTES);
    const sceneCount = readU16(bytes, HEADER_FIELDS.SCENE_COUNT);
    const variableOffset = readU32(bytes, HEADER_FIELDS.VARIABLE_TABLE_OFFSET);
    const variableBytes = readU32(bytes, HEADER_FIELDS.VARIABLE_TABLE_BYTES);
    const variableCount = readU16(bytes, HEADER_FIELDS.VARIABLE_COUNT);
    const textOffset = readU32(bytes, HEADER_FIELDS.TEXT_TABLE_OFFSET);
    const textBytes = readU32(bytes, HEADER_FIELDS.TEXT_TABLE_BYTES);
    const stringOffset = readU32(bytes, HEADER_FIELDS.STRING_TABLE_OFFSET);
    const stringBytes = readU32(bytes, HEADER_FIELDS.STRING_TABLE_BYTES);
    const assetDirOffset = readU32(bytes, HEADER_FIELDS.ASSET_DIR_OFFSET);
    const assetDirBytes = readU32(bytes, HEADER_FIELDS.ASSET_DIR_BYTES);
    const assetCount = readU16(bytes, HEADER_FIELDS.ASSET_COUNT);
    const dataOffset = readU32(bytes, HEADER_FIELDS.DATA_OFFSET);

    const bounds = [
      ['scene table', sceneOffset, sceneBytes],
      ['variable table', variableOffset, variableBytes],
      ['text table', textOffset, textBytes],
      ['string table', stringOffset, stringBytes],
      ['asset directory', assetDirOffset, assetDirBytes],
      ['asset data', dataOffset, usedBytes - dataOffset],
    ];
    for (const [name, offset, length] of bounds) {
      if (offset + length > usedBytes || offset < ROM_HEADER_SIZE) errors.push(`${name} outside used ROM region`);
    }
    if (sceneBytes !== sceneCount * SCENE_RECORD_SIZE) errors.push('Scene table size does not match count');
    if (variableBytes !== variableCount * VARIABLE_RECORD_SIZE) errors.push('Variable table size does not match count');
    if (assetDirBytes !== assetCount * ASSET_RECORD_SIZE) errors.push('Asset directory size does not match count');

    const headerCrcExpected = readU32(bytes, HEADER_FIELDS.HEADER_CRC32);
    const headerCrcActual = crc32(bytes, 0, HEADER_FIELDS.HEADER_CRC32);
    if (headerCrcExpected !== headerCrcActual) errors.push('Header CRC32 mismatch');

    const contentCrcExpected = readU32(bytes, HEADER_FIELDS.CONTENT_CRC32);
    const storedSha = bytes.slice(HEADER_FIELDS.SHA256, HEADER_FIELDS.SHA256 + 32);

    if (verifyChecksums && errors.length === 0) {
      const copy = new Uint8Array(bytes);
      writeU32(copy, HEADER_FIELDS.CONTENT_CRC32, 0);
      copy.fill(0, HEADER_FIELDS.SHA256, HEADER_FIELDS.SHA256 + 32);
      const contentCrcActual = crc32(copy, 0, usedBytes);
      if (contentCrcExpected !== contentCrcActual) errors.push('Content CRC32 mismatch');
      const shaCopy = new Uint8Array(bytes);
      shaCopy.fill(0, HEADER_FIELDS.SHA256, HEADER_FIELDS.SHA256 + 32);
      const shaActual = sha256(shaCopy.subarray(0, usedBytes));
      if (toHex(shaActual) !== toHex(storedSha)) errors.push('SHA-256 mismatch');
    }

    if (errors.length) return { ok: false, error: errors[0], errors };

    const sceneTable = decodeSceneTable(bytes.subarray(sceneOffset, sceneOffset + sceneBytes), sceneCount);
    const variableTable = decodeVariableTable(bytes.subarray(variableOffset, variableOffset + variableBytes), variableCount);
    const assetTable = decodeAssetTable(bytes.subarray(assetDirOffset, assetDirOffset + assetDirBytes), assetCount);
    const strings = bytes.subarray(stringOffset, stringOffset + stringBytes);
    const texts = bytes.subarray(textOffset, textOffset + textBytes);

    const readString = (offset, length) => new TextDecoder().decode(strings.subarray(offset, offset + length));

    for (const asset of assetTable) {
      if (asset.romOffset + asset.storedLength > usedBytes) errors.push(`Asset at 0x${asset.romOffset.toString(16)} exceeds used ROM region`);
      if (asset.romOffset % ROM_SECTOR_SIZE !== 0) errors.push(`Asset at 0x${asset.romOffset.toString(16)} is not sector aligned`);
      if (asset.romOffset + asset.storedLength > capacity) errors.push('Asset exceeds ROM capacity');
      if (verifyChecksums && asset.storedLength > 0) {
        const actual = crc32(bytes, asset.romOffset, asset.romOffset + asset.storedLength);
        if (actual !== asset.crc32) errors.push(`Asset ${readString(asset.nameOffset, asset.nameLength)} CRC32 mismatch`);
      }
    }
    for (const record of sceneTable) {
      if (record.textOffset + record.textLength > texts.length) errors.push('Scene text reference outside text table');
    }

    return {
      ok: true,
      bytes,
      header: {
        format: `${ROM_FORMAT_NAME} ${major}.${minor}`,
        major,
        minor,
        headerBytes: readU32(bytes, HEADER_FIELDS.HEADER_BYTES),
        capacity,
        usedBytes,
        freeBytes: capacity - usedBytes,
        buildId: readU32(bytes, HEADER_FIELDS.BUILD_ID),
        applicationId: readU32(bytes, HEADER_FIELDS.APPLICATION_ID),
        width: readU16(bytes, HEADER_FIELDS.LOGICAL_WIDTH),
        height: readU16(bytes, HEADER_FIELDS.LOGICAL_HEIGHT),
        initialPage: bytes[HEADER_FIELDS.INITIAL_PAGE],
        sceneCount,
        pageCount: readU16(bytes, HEADER_FIELDS.PAGE_COUNT),
        variableCount,
        assetCount,
        fontCount: readU16(bytes, HEADER_FIELDS.FONT_COUNT),
        contentCrc32: contentCrcExpected,
        sha256: toHex(storedSha),
        headerCrc32: headerCrcExpected,
      },
      sceneTable,
      variableTable,
      assetTable: assetTable.map((asset) => ({
        ...asset,
        path: readString(asset.nameOffset, asset.nameLength),
        aliasPath:
          asset.aliasOfIndex !== NO_INDEX
            ? readString(assetTable[asset.aliasOfIndex].nameOffset, assetTable[asset.aliasOfIndex].nameLength)
            : null,
      })),
      strings,
      texts,
      readString,
      readAsset(asset) {
        return asset.storedLength ? bytes.slice(asset.romOffset, asset.romOffset + asset.storedLength) : new Uint8Array(0);
      },
      readSceneText(record) {
        return texts.slice(record.textOffset, record.textOffset + record.textLength);
      },
    };
  } catch (error) {
    return { ok: false, error: error.message, errors: [...errors, error.message] };
  }
}

export function formatRomReport(parsed) {
  if (!parsed.ok) return `ROM INVALID: ${parsed.error}`;
  const { header } = parsed;
  return [
    `${header.format} — ${header.width}x${header.height}`,
    `Used ${header.usedBytes.toLocaleString()} / ${header.capacity.toLocaleString()} bytes (${(
      (header.usedBytes / header.capacity) *
      100
    ).toFixed(2)}%)`,
    `Scenes ${header.sceneCount}, variables ${header.variableCount}, assets ${header.assetCount}`,
    `CRC32 0x${toHex32(header.contentCrc32)}  SHA-256 ${header.sha256}`,
  ].join('\n');
}

export { encodeGlyphText, buildFontAtlas };
