/**
 * ROM inspector shared by the simulator backend.
 * It only reports what the bytes contain; it does not guess missing fields.
 */

import { parseRom, HEADER_FIELDS, ROM_SECTOR_SIZE } from '../../packages/eve-binary/rom.js';
import {
  SCENE_TYPE_NAMES,
  PIXEL_FORMAT_NAMES,
  ASSET_TYPES,
} from '../../packages/eve-binary/sceneCodec.js';
import { bitsToFloat, VARIABLE_TYPES, TYPE_NAMES } from '../../packages/eve-protocol/eveProtocol.js';
import { sha256Hex, toHex, toHex32 } from '../../packages/eve-binary/checksums.js';

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}
function readU32(bytes, offset) {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

const ASSET_TYPE_NAMES = Object.fromEntries(Object.entries(ASSET_TYPES).map(([name, value]) => [value, name]));

function decodeVariableValue(record, readString) {
  const typeName = TYPE_NAMES[record.type] || `type-${record.type}`;
  if (record.type === VARIABLE_TYPES.number) return bitsToFloat(record.valueBits >>> 0);
  if (record.type === VARIABLE_TYPES.boolean) return record.valueBits === 1;
  if (record.type === VARIABLE_TYPES.color) {
    return `#${toHex32(record.valueBits).slice(0, 6)}${toHex32(record.valueBits).slice(6, 8)}`;
  }
  if (record.flags & 0x01) return readString(record.valueOffset, record.valueLength);
  return typeName === 'image' ? `asset#${record.valueBits}` : '';
}

export function inspectRom(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const parsed = parseRom(bytes, { verifyChecksums: true });
  if (!parsed.ok) {
    const shaOffset = HEADER_FIELDS.SHA256;
    return {
      ok: false,
      error: parsed.error,
      errors: parsed.errors,
      received: {
        bytes: bytes.length,
        sha256: sha256Hex(bytes),
        preview: toHex(bytes.subarray(0, 32)),
      },
      expected: {
        sha256:
          bytes.length >= shaOffset + 32 ? toHex(bytes.subarray(shaOffset, shaOffset + 32)) : null,
      },
      detail: 'The image did not validate against EVE ROM FORMAT 1.0. Nothing was executed.',
    };
  }

  const header = parsed.header;
  const sceneOffset = readU32(bytes, HEADER_FIELDS.SCENE_TABLE_OFFSET);
  const sceneBytes = readU32(bytes, HEADER_FIELDS.SCENE_TABLE_BYTES);
  const variableOffset = readU32(bytes, HEADER_FIELDS.VARIABLE_TABLE_OFFSET);
  const variableBytes = readU32(bytes, HEADER_FIELDS.VARIABLE_TABLE_BYTES);
  const textOffset = readU32(bytes, HEADER_FIELDS.TEXT_TABLE_OFFSET);
  const textBytes = readU32(bytes, HEADER_FIELDS.TEXT_TABLE_BYTES);
  const stringOffset = readU32(bytes, HEADER_FIELDS.STRING_TABLE_OFFSET);
  const stringBytes = readU32(bytes, HEADER_FIELDS.STRING_TABLE_BYTES);
  const assetDirOffset = readU32(bytes, HEADER_FIELDS.ASSET_DIR_OFFSET);
  const assetDirBytes = readU32(bytes, HEADER_FIELDS.ASSET_DIR_BYTES);
  const dataOffset = readU32(bytes, HEADER_FIELDS.DATA_OFFSET);
  const buildId = readU32(bytes, HEADER_FIELDS.BUILD_ID);
  const applicationId = readU32(bytes, HEADER_FIELDS.APPLICATION_ID);

  const regions = [
    { name: 'Header / metadata', offset: 0, length: 4096, kind: 'metadata' },
    { name: 'Scene records', offset: sceneOffset, length: sceneBytes, kind: 'table' },
    { name: 'Variable registry', offset: variableOffset, length: variableBytes, kind: 'table' },
    { name: 'Glyph text', offset: textOffset, length: textBytes, kind: 'table' },
    { name: 'String table', offset: stringOffset, length: stringBytes, kind: 'table' },
    { name: 'Asset directory', offset: assetDirOffset, length: assetDirBytes, kind: 'table' },
    { name: 'Asset data', offset: dataOffset, length: Math.max(0, header.usedBytes - dataOffset), kind: 'data' },
    { name: 'Free space (0xFF)', offset: header.usedBytes, length: header.capacity - header.usedBytes, kind: 'free' },
  ].filter((region) => region.length > 0);

  const sceneCounts = {};
  for (const record of parsed.sceneTable) {
    const name = SCENE_TYPE_NAMES[record.type] || `type-${record.type}`;
    sceneCounts[name] = (sceneCounts[name] || 0) + 1;
  }

  const assets = parsed.assetTable.map((asset) => ({
    index: asset.index,
    path: asset.path,
    aliasPath: asset.aliasPath,
    type: ASSET_TYPE_NAMES[asset.type] || `type-${asset.type}`,
    pixelFormat: PIXEL_FORMAT_NAMES[asset.pixelFormat] || `format-${asset.pixelFormat}`,
    width: asset.width,
    height: asset.height,
    offset: asset.romOffset,
    storedLength: asset.storedLength,
    uncompressedLength: asset.uncompressedLength,
    crc32: toHex32(asset.crc32),
    sectorAligned: asset.romOffset % ROM_SECTOR_SIZE === 0,
    aliasOfIndex: asset.aliasOfIndex,
  }));

  const variables = parsed.variableTable.map((record) => ({
    id: `0x${toHex32(record.id)}`,
    name: parsed.readString(record.nameOffset, record.nameLength),
    type: TYPE_NAMES[record.type] || `type-${record.type}`,
    value: decodeVariableValue(record, parsed.readString),
    valueBits: `0x${toHex32(record.valueBits)}`,
  }));

  const scenes = parsed.sceneTable.map((record, index) => ({
    index,
    type: SCENE_TYPE_NAMES[record.type] || `type-${record.type}`,
    pageIndex: record.pageIndex,
    objectId: `0x${toHex32(record.objectId)}`,
    pageObjectIndex: record.pageObjectIndex,
    x: record.x,
    y: record.y,
    width: record.width,
    height: record.height,
    fillColor: `#${toHex32(record.fillColor)}`,
    strokeColor: `#${toHex32(record.strokeColor)}`,
    strokeWidth: record.strokeWidth,
    zOrder: record.zOrder,
    visible: (record.flags & 0x01) !== 0,
    dynamic: (record.flags & 0x02) !== 0,
    bindingIndex: record.bindingIndex,
    textLength: record.textLength,
    assetIndex: record.assetIndex,
  }));

  return {
    ok: true,
    header: {
      ...header,
      buildId: buildId,
      buildIdHex: `0x${toHex32(buildId)}`,
      applicationId,
      applicationIdHex: `0x${toHex32(applicationId)}`,
      freeBytes: header.capacity - header.usedBytes,
      occupancyPercent: Math.round((header.usedBytes / header.capacity) * 10000) / 100,
    },
    regions,
    sceneCounts,
    scenes,
    variables,
    assets,
    checks: [
      { id: 'format', ok: header.format === 'EVE ROM FORMAT 1.0', detail: header.format },
      { id: 'size', ok: bytes.length === header.capacity, detail: `${bytes.length} bytes` },
      { id: 'sha256', ok: true, detail: header.sha256 },
      { id: 'content-crc32', ok: true, detail: toHex32(header.contentCrc32) },
      { id: 'sector-alignment', ok: assets.every((asset) => asset.sectorAligned), detail: 'Every asset starts on a 4 KiB boundary' },
    ],
    detail: 'Parsed with checksum verification. No HDL simulation was run by this request.',
  };
}

export { parseRom };
