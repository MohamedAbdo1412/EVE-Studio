import { describe, expect, it } from 'vitest';
import {
  OPCODES,
  COMMANDS,
  PROTOCOL_VERSION,
  STATUS,
  crc16CcittFalse,
  encodePacket,
  decodePacket,
  encodeSetVariable,
  decodeSetVariable,
  VARIABLE_TYPES,
  encodeRomWritePage,
  MAX_PAYLOAD,
  buildPacket,
  hexDump,
} from '../packages/eve-protocol/eveProtocol.js';

function bytes(...values) {
  return Uint8Array.from(values);
}

describe('EVE Protocol 1.0', () => {
  it('uses the documented CRC16-CCITT-FALSE test vector', () => {
    expect(crc16CcittFalse(new TextEncoder().encode('123456789'))).toBe(0x29b1);
  });

  it('keeps SET_VARIABLE compatible with the original draft framing', () => {
    const packet = encodePacket({
      opcode: OPCODES.SET_VARIABLE,
      sequence: 0x1234,
      payload: encodeSetVariable(0x11223344, 'number', 21.5),
    });
    expect(Array.from(packet.slice(0, 8))).toEqual([0x45, 0x56, 0x01, 0x01, 0x09, 0x00, 0x34, 0x12]);
    const decoded = decodePacket(packet);
    expect(decoded.ok).toBe(true);
    expect(decoded.packet.opcode).toBe(OPCODES.SET_VARIABLE);
    expect(decoded.packet.sequence).toBe(0x1234);
    const variable = decodeSetVariable(decoded.packet.payload);
    expect(variable.id).toBe(0x11223344);
    expect(variable.type).toBe('number');
    expect(variable.value).toBeCloseTo(21.5);
  });

  it('round-trips every typed variable value', () => {
    const cases = [
      ['string', 'Laboratory'],
      ['number', -12.75],
      ['boolean', true],
      ['color', 0x00ff88ff],
      ['image', 'assets/icon.png'],
    ];
    for (const [type, value] of cases) {
      const decoded = decodeSetVariable(encodeSetVariable(7, type, value));
      expect(decoded.type).toBe(type);
      if (type === 'number') expect(decoded.value).toBeCloseTo(value);
      else expect(decoded.value).toBe(value);
    }
    expect(VARIABLE_TYPES.image).toBe(5);
  });

  it('rejects bad magic, bad CRC, bad length and oversized payloads', () => {
    const packet = buildPacket(OPCODES.GET_STATUS, new Uint8Array(0), 1);
    const badMagic = packet.slice();
    badMagic[0] = 0x00;
    expect(decodePacket(badMagic).error).toBe(STATUS.BAD_MAGIC);

    const badCrc = packet.slice();
    badCrc[badCrc.length - 1] ^= 0xff;
    expect(decodePacket(badCrc).error).toBe(STATUS.BAD_CRC);

    const truncated = packet.slice(0, packet.length - 1);
    expect(decodePacket(truncated).error).toBe(STATUS.BAD_LENGTH);

    expect(() => encodePacket({ opcode: 1, payload: new Uint8Array(MAX_PAYLOAD + 1) })).toThrow(/exceeds/);
    expect(() => encodeRomWritePage(0x100, new Uint8Array(257))).toThrow(/256/);
  });

  it('enforces flash page boundaries on page program payloads', () => {
    expect(() => encodeRomWritePage(0x1ff, new Uint8Array(2))).toThrow(/page/);
    expect(() => encodeRomWritePage(0x100, new Uint8Array(256))).not.toThrow();
  });

  it('declares the full required command registry with one opcode each', () => {
    const names = Object.keys(COMMANDS);
    for (const required of [
      'HELLO',
      'GET_CAPABILITIES',
      'GET_STATUS',
      'RESET',
      'SET_VARIABLE',
      'GET_VARIABLE',
      'SET_PROPERTY',
      'NAVIGATE',
      'COMMIT_SCENE',
      'ROM_UPDATE_BEGIN',
      'ROM_ERASE_SECTOR',
      'ROM_WRITE_PAGE',
      'ROM_READ',
      'ROM_VERIFY',
      'ROM_UPDATE_END',
      'GET_RENDER_STATS',
      'GET_MEMORY_STATS',
      'GET_ERROR_STATUS',
    ]) {
      expect(names).toContain(required);
    }
    const opcodes = Object.values(COMMANDS).map((command) => command.opcode);
    expect(new Set(opcodes).size).toBe(opcodes.length);
    expect(PROTOCOL_VERSION).toBe(1);
    for (const command of Object.values(COMMANDS)) {
      expect(command.timeoutMs).toBeGreaterThan(0);
      expect(command.hardwareEffect.length).toBeGreaterThan(0);
    }
  });

  it('formats a hex dump without throwing on empty data', () => {
    expect(hexDump(bytes())).toBe('');
    expect(hexDump(bytes(0x45, 0x56, 0xff))).toContain('45 56 ff');
  });
});
