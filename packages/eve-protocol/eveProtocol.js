/**
 * EVE PROTOCOL 1.0 — authoritative shared definition.
 *
 * Consumed by EVE Studio (firmware generation), EVE Simulator, FPGA RTL and
 * testbenches. Do not redefine opcodes anywhere else.
 *
 * Wire format (all multi-byte fields little-endian):
 *
 *   MAGIC           2 bytes   0x45 0x56 ("EV")
 *   VERSION         1 byte    0x01
 *   OPCODE          1 byte
 *   PAYLOAD_LENGTH  2 bytes   uint16
 *   SEQUENCE        2 bytes   uint16
 *   PAYLOAD         N bytes
 *   CRC16           2 bytes   CRC16-CCITT-FALSE over header + payload
 *
 * The framing is wire-compatible with the original EVE Studio C++ draft
 * (magic "EV", version 1, SET_VARIABLE 0x01, CRC16-CCITT-FALSE). The opcode
 * registry has been extended; SET_VARIABLE keeps its original payload layout.
 */

export const PROTOCOL_VERSION = 1;
export const MAGIC = Object.freeze([0x45, 0x56]);
export const HEADER_SIZE = 8;
export const CRC_SIZE = 2;
export const MAX_PAYLOAD = 1024;
export const MAX_PACKET_SIZE = HEADER_SIZE + MAX_PAYLOAD + CRC_SIZE;

export const VARIABLE_TYPES = Object.freeze({
  string: 0x01,
  number: 0x02,
  boolean: 0x03,
  color: 0x04,
  image: 0x05,
});

export const TYPE_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(VARIABLE_TYPES).map(([name, value]) => [value, name])),
);

export const STATUS = Object.freeze({
  OK: 0x00,
  BAD_MAGIC: 0x01,
  BAD_VERSION: 0x02,
  BAD_CRC: 0x03,
  BAD_LENGTH: 0x04,
  UNKNOWN_OPCODE: 0x05,
  BAD_ARGUMENT: 0x06,
  BUSY: 0x07,
  TIMEOUT: 0x08,
  FLASH_ERROR: 0x09,
  NOT_READY: 0x0a,
  UNSUPPORTED: 0x0b,
});

export const STATUS_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(STATUS).map(([name, value]) => [value, name])),
);

/** Central opcode registry. Opcodes are append-only within protocol major 1. */
export const OPCODES = Object.freeze({
  HELLO: 0x10,
  GET_CAPABILITIES: 0x11,
  GET_STATUS: 0x12,
  RESET: 0x13,
  SET_VARIABLE: 0x01, // preserved from the original draft
  GET_VARIABLE: 0x14,
  SET_PROPERTY: 0x15,
  NAVIGATE: 0x16,
  COMMIT_SCENE: 0x17,
  ROM_UPDATE_BEGIN: 0x20,
  ROM_ERASE_SECTOR: 0x21,
  ROM_WRITE_PAGE: 0x22,
  ROM_READ: 0x23,
  ROM_VERIFY: 0x24,
  ROM_UPDATE_END: 0x25,
  GET_RENDER_STATS: 0x30,
  GET_MEMORY_STATS: 0x31,
  GET_ERROR_STATUS: 0x32,
});

export const OPCODE_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(OPCODES).map(([name, value]) => [value, name])),
);

/**
 * Command metadata. `request`/`response` are documentation strings; the
 * encode/decode helpers below are the executable contract.
 */
export const COMMANDS = Object.freeze({
  HELLO: {
    opcode: OPCODES.HELLO,
    request: 'empty',
    response: 'status:u8 deviceId:u16 firmwareVersion:u16 protocolVersion:u8 capabilities:u32',
    maxPayload: 0,
    timeoutMs: 100,
    hardwareEffect: 'None. Confirms the FPGA command path is alive.',
  },
  GET_CAPABILITIES: {
    opcode: OPCODES.GET_CAPABILITIES,
    request: 'empty',
    response: 'status:u8 capabilities:u32 maxPayload:u16 romBytes:u32 sdramBytes:u32',
    maxPayload: 0,
    timeoutMs: 100,
    hardwareEffect: 'None. Reports static renderer capabilities.',
  },
  GET_STATUS: {
    opcode: OPCODES.GET_STATUS,
    request: 'empty',
    response: 'status:u8 state:u8 pageIndex:u8 objectCount:u8 flags:u8',
    maxPayload: 0,
    timeoutMs: 100,
    hardwareEffect: 'None. Reads live FPGA state registers.',
  },
  RESET: {
    opcode: OPCODES.RESET,
    request: 'mode:u8',
    response: 'status:u8',
    maxPayload: 1,
    timeoutMs: 500,
    hardwareEffect: 'Raises the internal renderer reset and reloads scene state.',
  },
  SET_VARIABLE: {
    opcode: OPCODES.SET_VARIABLE,
    request: 'id:u32 type:u8 value',
    response: 'status:u8',
    maxPayload: 5 + 255,
    timeoutMs: 100,
    hardwareEffect: 'Writes one typed variable register / glyph text slot.',
  },
  GET_VARIABLE: {
    opcode: OPCODES.GET_VARIABLE,
    request: 'id:u32',
    response: 'status:u8 id:u32 type:u8 value',
    maxPayload: 4,
    timeoutMs: 100,
    hardwareEffect: 'None. Reads one variable register.',
  },
  SET_PROPERTY: {
    opcode: OPCODES.SET_PROPERTY,
    request: 'objectId:u32 propertyId:u16 value:u32',
    response: 'status:u8',
    maxPayload: 10,
    timeoutMs: 100,
    hardwareEffect: 'Updates one property register (colour, visibility, position).',
  },
  NAVIGATE: {
    opcode: OPCODES.NAVIGATE,
    request: 'pageIndex:u16',
    response: 'status:u8',
    maxPayload: 2,
    timeoutMs: 200,
    hardwareEffect: 'Selects a compiled page; next frame uses the new object set.',
  },
  COMMIT_SCENE: {
    opcode: OPCODES.COMMIT_SCENE,
    request: 'pageIndex:u16',
    response: 'status:u8',
    maxPayload: 2,
    timeoutMs: 200,
    hardwareEffect: 'Latches the page selection at the next vertical blank.',
  },
  ROM_UPDATE_BEGIN: {
    opcode: OPCODES.ROM_UPDATE_BEGIN,
    request: 'totalLength:u32 crc32:u32',
    response: 'status:u8',
    maxPayload: 8,
    timeoutMs: 1000,
    hardwareEffect: 'Suspends rendering and enters flash maintenance mode.',
  },
  ROM_ERASE_SECTOR: {
    opcode: OPCODES.ROM_ERASE_SECTOR,
    request: 'address:u32',
    response: 'status:u8',
    maxPayload: 4,
    timeoutMs: 2000,
    hardwareEffect: '4 KiB sector erase. Address must be 4096-aligned.',
  },
  ROM_WRITE_PAGE: {
    opcode: OPCODES.ROM_WRITE_PAGE,
    request: 'address:u32 length:u8 data:u8[length]',
    response: 'status:u8',
    maxPayload: 5 + 256,
    timeoutMs: 1000,
    hardwareEffect: 'Page program. Bounded to 256 bytes and one flash page.',
  },
  ROM_READ: {
    opcode: OPCODES.ROM_READ,
    request: 'address:u32 length:u8',
    response: 'status:u8 length:u8 data:u8[length]',
    maxPayload: 5,
    timeoutMs: 1000,
    hardwareEffect: 'Reads flash bytes through the FPGA QSPI controller.',
  },
  ROM_VERIFY: {
    opcode: OPCODES.ROM_VERIFY,
    request: 'address:u32 length:u32 crc32:u32',
    response: 'status:u8 crc32:u32',
    maxPayload: 12,
    timeoutMs: 5000,
    hardwareEffect: 'Streams flash content through the CRC engine; no host transfer.',
  },
  ROM_UPDATE_END: {
    opcode: OPCODES.ROM_UPDATE_END,
    request: 'crc32:u32',
    response: 'status:u8',
    maxPayload: 4,
    timeoutMs: 2000,
    hardwareEffect: 'Validates the image CRC and returns to normal rendering.',
  },
  GET_RENDER_STATS: {
    opcode: OPCODES.GET_RENDER_STATS,
    request: 'empty',
    response: 'status:u8 frameCount:u32 frameCrc32:u32 underflows:u16 deadlineMisses:u16',
    maxPayload: 0,
    timeoutMs: 100,
    hardwareEffect: 'None. Reads renderer counters.',
  },
  GET_MEMORY_STATS: {
    opcode: OPCODES.GET_MEMORY_STATS,
    request: 'empty',
    response: 'status:u8 romReads:u32 romBytesRead:u32 sdramReads:u32 sdramWrites:u32 refreshCount:u16',
    maxPayload: 0,
    timeoutMs: 100,
    hardwareEffect: 'None. Reads memory controller counters.',
  },
  GET_ERROR_STATUS: {
    opcode: OPCODES.GET_ERROR_STATUS,
    request: 'empty',
    response: 'status:u8 lastError:u8 errorFlags:u32 droppedPackets:u16',
    maxPayload: 0,
    timeoutMs: 100,
    hardwareEffect: 'None. Reads the sticky error register.',
  },
});

export const REQUIRED_OPCODES = Object.freeze(
  Object.values(COMMANDS).map((command) => command.opcode),
);

export function commandByOpcode(opcode) {
  return Object.values(COMMANDS).find((command) => command.opcode === opcode) || null;
}

/** CRC16-CCITT-FALSE. Test vector: "123456789" => 0x29B1. */
export function crc16CcittFalse(bytes, start = 0, end = bytes.length) {
  let crc = 0xffff;
  for (let index = start; index < end; index += 1) {
    crc ^= (bytes[index] & 0xff) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

export function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value, (item) => item & 0xff);
  throw new TypeError('Expected Uint8Array, ArrayBuffer or byte array');
}

function assertMaxPayload(length) {
  if (length > MAX_PAYLOAD) {
    throw new RangeError(`Payload ${length} exceeds EVE maximum ${MAX_PAYLOAD}`);
  }
}

/** Encode a complete packet. Payload may be a Uint8Array or byte array. */
export function encodePacket({ opcode, sequence = 0, payload = new Uint8Array(0) }) {
  const body = asBytes(payload);
  assertMaxPayload(body.length);
  const packet = new Uint8Array(HEADER_SIZE + body.length + CRC_SIZE);
  packet[0] = MAGIC[0];
  packet[1] = MAGIC[1];
  packet[2] = PROTOCOL_VERSION;
  packet[3] = opcode & 0xff;
  writeU16(packet, 4, body.length);
  writeU16(packet, 6, sequence & 0xffff);
  packet.set(body, HEADER_SIZE);
  const crc = crc16CcittFalse(packet, 0, HEADER_SIZE + body.length);
  writeU16(packet, HEADER_SIZE + body.length, crc);
  return packet;
}

/**
 * Decode a packet. Returns { ok, error, packet } with `packet` populated when
 * framing is readable. Never throws for malformed wire data.
 */
export function decodePacket(input) {
  let bytes;
  try {
    bytes = asBytes(input);
  } catch (error) {
    return { ok: false, error: STATUS.BAD_LENGTH, detail: error.message };
  }
  if (bytes.length < HEADER_SIZE + CRC_SIZE) {
    return { ok: false, error: STATUS.BAD_LENGTH, detail: 'shorter than minimum packet' };
  }
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1]) {
    return { ok: false, error: STATUS.BAD_MAGIC, detail: 'magic mismatch' };
  }
  if (bytes[2] !== PROTOCOL_VERSION) {
    return { ok: false, error: STATUS.BAD_VERSION, detail: `unsupported version ${bytes[2]}` };
  }
  const payloadLength = readU16(bytes, 4);
  const total = HEADER_SIZE + payloadLength + CRC_SIZE;
  if (payloadLength > MAX_PAYLOAD || bytes.length !== total) {
    return { ok: false, error: STATUS.BAD_LENGTH, detail: `expected ${total} bytes, received ${bytes.length}` };
  }
  const expected = readU16(bytes, HEADER_SIZE + payloadLength);
  const actual = crc16CcittFalse(bytes, 0, HEADER_SIZE + payloadLength);
  if (expected !== actual) {
    return {
      ok: false,
      error: STATUS.BAD_CRC,
      detail: `crc16 expected ${actual.toString(16)} received ${expected.toString(16)}`,
    };
  }
  return {
    ok: true,
    error: STATUS.OK,
    packet: {
      version: bytes[2],
      opcode: bytes[3],
      payloadLength,
      sequence: readU16(bytes, 6),
      payload: bytes.slice(HEADER_SIZE, HEADER_SIZE + payloadLength),
      crc16: expected,
      bytes,
    },
  };
}

export const ENDIANNESS = 'little';

export function writeU16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

export function writeU32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

export function readU16(source, offset) {
  return source[offset] | (source[offset + 1] << 8);
}

export function readU32(source, offset) {
  return (source[offset] | (source[offset + 1] << 8) | (source[offset + 2] << 16) | (source[offset + 3] << 24)) >>> 0;
}

export function floatToBits(value) {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, Number(value), true);
  return new Uint32Array(buffer)[0];
}

export function bitsToFloat(bits) {
  const buffer = new ArrayBuffer(4);
  new Uint32Array(buffer)[0] = bits >>> 0;
  return new DataView(buffer).getFloat32(0, true);
}

export function colorToRgba(value) {
  const text = String(value ?? '').trim();
  if (text === 'transparent') return 0x00000000;
  if (!text.startsWith('#')) return 0x00000000;
  let hex = text.slice(1);
  if (hex.length === 3) hex = hex.split('').map((char) => char + char).join('') + 'ff';
  if (hex.length === 4) hex = hex.split('').map((char) => char + char).join('');
  if (hex.length === 6) hex += 'ff';
  if (hex.length !== 8) return 0;
  return parseInt(hex, 16) >>> 0;
}

/** Encode a typed variable value to its wire representation. */
export function encodeVariableValue(type, value) {
  const typeCode = VARIABLE_TYPES[type] || (typeof value === 'number' ? VARIABLE_TYPES.number : VARIABLE_TYPES.string);
  if (typeCode === VARIABLE_TYPES.number) {
    const bytes = new Uint8Array(4);
    writeU32(bytes, 0, floatToBits(Number(value) || 0));
    return bytes;
  }
  if (typeCode === VARIABLE_TYPES.boolean) {
    return Uint8Array.of(value === true || value === 'true' ? 1 : 0);
  }
  if (typeCode === VARIABLE_TYPES.color) {
    const bytes = new Uint8Array(4);
    writeU32(bytes, 0, typeof value === 'number' ? value >>> 0 : colorToRgba(value));
    return bytes;
  }
  const text = String(value ?? '');
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 255) throw new RangeError('String variable exceeds 255-byte payload limit');
  return bytes;
}

export function encodeSetVariable(id, type, value) {
  const encoded = encodeVariableValue(type, value);
  const payload = new Uint8Array(5 + encoded.length);
  writeU32(payload, 0, id >>> 0);
  payload[4] = VARIABLE_TYPES[type] || VARIABLE_TYPES.string;
  payload.set(encoded, 5);
  return payload;
}

export function decodeSetVariable(payload) {
  if (payload.length < 5) return { error: STATUS.BAD_LENGTH };
  const id = readU32(payload, 0);
  const typeCode = payload[4];
  const valueBytes = payload.slice(5);
  const type = TYPE_NAMES[typeCode] || 'unknown';
  let value;
  if (typeCode === VARIABLE_TYPES.number) value = bitsToFloat(readU32(valueBytes, 0));
  else if (typeCode === VARIABLE_TYPES.boolean) value = Boolean(valueBytes[0]);
  else if (typeCode === VARIABLE_TYPES.color) value = readU32(valueBytes, 0);
  else value = new TextDecoder().decode(valueBytes);
  return { id, type, value, valueBytes };
}

export function encodeGetVariable(id) {
  const payload = new Uint8Array(4);
  writeU32(payload, 0, id >>> 0);
  return payload;
}

export function encodeSetProperty(objectId, propertyId, value) {
  const payload = new Uint8Array(10);
  writeU32(payload, 0, objectId >>> 0);
  writeU16(payload, 4, propertyId & 0xffff);
  writeU32(payload, 6, value >>> 0);
  return payload;
}

export const PROPERTIES = Object.freeze({
  X: 0x0001,
  Y: 0x0002,
  WIDTH: 0x0003,
  HEIGHT: 0x0004,
  FILL_COLOR: 0x0005,
  STROKE_COLOR: 0x0006,
  VISIBLE: 0x0007,
  Z_ORDER: 0x0008,
});

export function encodeNavigate(pageIndex) {
  const payload = new Uint8Array(2);
  writeU16(payload, 0, pageIndex & 0xffff);
  return payload;
}

export function encodeRomEraseSector(address) {
  const payload = new Uint8Array(4);
  writeU32(payload, 0, address >>> 0);
  return payload;
}

export function encodeRomWritePage(address, data) {
  const bytes = asBytes(data);
  if (bytes.length > 256) throw new RangeError('Flash page program is limited to 256 bytes');
  if ((address & 0xff) + bytes.length > 256) {
    throw new RangeError('Page program crosses a 256-byte flash page boundary');
  }
  const payload = new Uint8Array(5 + bytes.length);
  writeU32(payload, 0, address >>> 0);
  payload[4] = bytes.length;
  payload.set(bytes, 5);
  return payload;
}

export function encodeRomRead(address, length) {
  if (length > 64) throw new RangeError('ROM_READ is limited to 64 bytes per request');
  const payload = new Uint8Array(5);
  writeU32(payload, 0, address >>> 0);
  payload[4] = length & 0xff;
  return payload;
}

/** Round-trip helper used by tests and the command console. */
export function buildPacket(opcode, payload, sequence = 0) {
  return encodePacket({ opcode, payload, sequence });
}

export function hexDump(bytes, width = 16) {
  const lines = [];
  for (let offset = 0; offset < bytes.length; offset += width) {
    const slice = Array.from(bytes.slice(offset, offset + width));
    const hex = slice.map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
    const ascii = slice.map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.')).join('');
    lines.push(`${offset.toString(16).padStart(6, '0')}  ${hex.padEnd(width * 3 - 1)}  ${ascii}`);
  }
  return lines.join('\n');
}
