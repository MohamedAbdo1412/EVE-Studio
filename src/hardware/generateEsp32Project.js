/**
 * Deterministic ESP32-S3 PlatformIO project generator.
 *
 * Every protocol constant comes from @eve/protocol. The generated firmware is a
 * USB-serial <-> FPGA SPI bridge plus a small example client. It is generated
 * source, not a tested hardware build: the reference pinout is explicitly an
 * unqualified assumption.
 */

import {
  OPCODES,
  STATUS,
  VARIABLE_TYPES,
  PROTOCOL_VERSION,
  MAX_PAYLOAD,
} from '../../packages/eve-protocol/eveProtocol.js';

const FIXED_DATE_NOTE = 'Generated deterministically by EVE Studio. No timestamps are embedded.';

function cppEnumEntries(map) {
  return Object.entries(map)
    .map(([name, value]) => `    k${name} = 0x${value.toString(16).toUpperCase().padStart(2, '0')},`)
    .join('\n');
}

function pythonEnumEntries(map) {
  return Object.entries(map)
    .map(([name, value]) => `${name} = 0x${value.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('\n');
}

export function generateEveProtocolHeader() {
  return `// EveProtocol.h — generated from @eve/protocol ${PROTOCOL_VERSION}.0
// ${FIXED_DATE_NOTE}
//
// EVE PROTOCOL 1.0. Wire order, all multi-byte fields little-endian:
//   magic 0x45 0x56 | version u8 | opcode u8 | payloadLength u16 |
//   sequence u16 | payload[N] | crc16-ccitt-false u16
#pragma once

#include <cstddef>
#include <cstdint>

namespace eve {

constexpr uint8_t  kMagic0 = 0x45;
constexpr uint8_t  kMagic1 = 0x56;
constexpr uint8_t  kProtocolVersion = ${PROTOCOL_VERSION};
constexpr size_t   kHeaderSize = 8;
constexpr size_t   kCrcSize = 2;
constexpr size_t   kMaxPayload = ${MAX_PAYLOAD};
constexpr size_t   kMaxPacket = kHeaderSize + kMaxPayload + kCrcSize;

enum class Opcode : uint8_t {
${cppEnumEntries(OPCODES)}
};

enum class Status : uint8_t {
${cppEnumEntries(STATUS)}
};

enum class VariableType : uint8_t {
${cppEnumEntries(VARIABLE_TYPES)}
};

inline uint16_t readU16LE(const uint8_t* p) {
    return static_cast<uint16_t>(p[0] | (static_cast<uint16_t>(p[1]) << 8));
}

inline uint32_t readU32LE(const uint8_t* p) {
    return static_cast<uint32_t>(p[0]) |
           (static_cast<uint32_t>(p[1]) << 8) |
           (static_cast<uint32_t>(p[2]) << 16) |
           (static_cast<uint32_t>(p[3]) << 24);
}

inline void writeU16LE(uint8_t* p, uint16_t v) {
    p[0] = static_cast<uint8_t>(v & 0xFF);
    p[1] = static_cast<uint8_t>((v >> 8) & 0xFF);
}

inline void writeU32LE(uint8_t* p, uint32_t v) {
    p[0] = static_cast<uint8_t>(v & 0xFF);
    p[1] = static_cast<uint8_t>((v >> 8) & 0xFF);
    p[2] = static_cast<uint8_t>((v >> 16) & 0xFF);
    p[3] = static_cast<uint8_t>((v >> 24) & 0xFF);
}

inline uint16_t crc16CcittFalse(const uint8_t* data, size_t length) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < length; ++i) {
        crc ^= static_cast<uint16_t>(data[i]) << 8;
        for (int bit = 0; bit < 8; ++bit) {
            crc = (crc & 0x8000) ? static_cast<uint16_t>((crc << 1) ^ 0x1021) : static_cast<uint16_t>(crc << 1);
        }
    }
    return crc;
}

// Write a complete packet into out. Returns the packet length, or 0 when the
// payload is too large. out must hold kHeaderSize + payloadLength + kCrcSize.
inline size_t encodePacket(uint8_t opcode, uint16_t sequence, const uint8_t* payload,
                           size_t payloadLength, uint8_t* out) {
    if (payloadLength > kMaxPayload) return 0;
    out[0] = kMagic0;
    out[1] = kMagic1;
    out[2] = kProtocolVersion;
    out[3] = opcode;
    writeU16LE(out + 4, static_cast<uint16_t>(payloadLength));
    writeU16LE(out + 6, sequence);
    for (size_t i = 0; i < payloadLength; ++i) out[kHeaderSize + i] = payload[i];
    const size_t body = kHeaderSize + payloadLength;
    writeU16LE(out + body, crc16CcittFalse(out, body));
    return body + kCrcSize;
}

} // namespace eve
`;
}

export function generateEveProtocolPython() {
  return `"""EVE PROTOCOL 1.0 host helpers — generated from @eve/protocol.

${FIXED_DATE_NOTE}
All multi-byte fields are little-endian.
"""
import struct

MAGIC = bytes([0x45, 0x56])
PROTOCOL_VERSION = ${PROTOCOL_VERSION}
HEADER_SIZE = 8
CRC_SIZE = 2
MAX_PAYLOAD = ${MAX_PAYLOAD}

${pythonEnumEntries(OPCODES)}

${pythonEnumEntries(STATUS)}


def crc16_ccitt_false(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def encode_packet(opcode: int, payload: bytes = b"", sequence: int = 0) -> bytes:
    if len(payload) > MAX_PAYLOAD:
        raise ValueError(f"payload {len(payload)} exceeds {MAX_PAYLOAD}")
    body = MAGIC + bytes([PROTOCOL_VERSION, opcode]) + struct.pack("<HH", len(payload), sequence & 0xFFFF) + payload
    return body + struct.pack("<H", crc16_ccitt_false(body))


def decode_packet(data: bytes):
    if len(data) < HEADER_SIZE + CRC_SIZE:
        raise ValueError("packet too short")
    if data[:2] != MAGIC:
        raise ValueError("bad magic")
    if data[2] != PROTOCOL_VERSION:
        raise ValueError(f"unsupported version {data[2]}")
    length, sequence = struct.unpack_from("<HH", data, 4)
    total = HEADER_SIZE + length + CRC_SIZE
    if len(data) != total:
        raise ValueError(f"expected {total} bytes, got {len(data)}")
    body = data[: HEADER_SIZE + length]
    (stored,) = struct.unpack_from("<H", data, HEADER_SIZE + length)
    if crc16_ccitt_false(body) != stored:
        raise ValueError("crc16 mismatch")
    return {
        "opcode": data[3],
        "sequence": sequence,
        "payload": data[HEADER_SIZE : HEADER_SIZE + length],
        "crc16": stored,
    }


def set_variable(variable_id: int, type_code: int, value, sequence: int = 0) -> bytes:
    if type_code == 0x02:
        encoded = struct.pack("<f", float(value))
    elif type_code == 0x03:
        encoded = bytes([1 if value else 0])
    elif type_code == 0x04:
        encoded = struct.pack("<I", int(value) & 0xFFFFFFFF)
    elif isinstance(value, bytes):
        encoded = value
    else:
        encoded = str(value).encode("utf-8")
    payload = struct.pack("<IB", variable_id & 0xFFFFFFFF, type_code) + encoded
    return encode_packet(${OPCODES.SET_VARIABLE}, payload, sequence)
`;
}

export function generateBoardConfig() {
  return `// eve_board_config.h — REFERENCE PROFILE, PINOUT NOT QUALIFIED.
//
// These are plausible ESP32-S3 devkit header assignments used only so the
// generated firmware can be built. They are NOT a schematic, NOT a PCB
// assignment and NOT validated against the GW1N package. Replace every value
// after the board schematic and FPGA pinout are qualified.
#pragma once

#define EVE_SPI_SCLK   12
#define EVE_SPI_MOSI   11
#define EVE_SPI_MISO   13
#define EVE_SPI_CS     10
#define EVE_FPGA_READY 9
#define EVE_FPGA_IRQ   8
#define EVE_FPGA_RESET 7
#define EVE_SPI_HZ     10000000UL

// Host-side ROM uploader baud rate.
#define EVE_SERIAL_BAUD 115200UL
`;
}

export function generateSpiTransport(classBase) {
  return `// EveSpiTransport.h — generated USB-serial <-> FPGA SPI bridge transport.
// REFERENCE PROFILE. Not tested on hardware.
#pragma once

#include <Arduino.h>
#include <SPI.h>
#include "EVETransport.h"
#include "eve_board_config.h"

class EveSpiTransport : public EVE::EVETransport {
public:
    bool begin() {
        pinMode(EVE_SPI_CS, OUTPUT);
        digitalWrite(EVE_SPI_CS, HIGH);
        pinMode(EVE_FPGA_READY, INPUT);
        pinMode(EVE_FPGA_IRQ, INPUT);
        pinMode(EVE_FPGA_RESET, OUTPUT);
        digitalWrite(EVE_FPGA_RESET, HIGH);
        SPI.begin(EVE_SPI_SCLK, EVE_SPI_MISO, EVE_SPI_MOSI, EVE_SPI_CS);
        return true;
    }

    void resetFpga() {
        digitalWrite(EVE_FPGA_RESET, LOW);
        delay(5);
        digitalWrite(EVE_FPGA_RESET, HIGH);
        delay(20);
    }

    bool waitReady(uint32_t timeoutMs) {
        const uint32_t start = millis();
        while (digitalRead(EVE_FPGA_READY) == LOW) {
            if (millis() - start > timeoutMs) return false;
            delayMicroseconds(50);
        }
        return true;
    }

    // One SPI transaction carries one complete EVE packet. The FPGA may answer
    // in the same transaction; the bridge reads a framed response afterwards.
    bool write(const uint8_t* data, size_t length) override {
        if (!waitReady(50)) return false;
        SPI.beginTransaction(SPISettings(EVE_SPI_HZ, MSBFIRST, SPI_MODE0));
        digitalWrite(EVE_SPI_CS, LOW);
        // ESP32 Arduino expects a mutable output pointer for transferBytes.
        SPI.transferBytes(const_cast<uint8_t*>(data), nullptr, length);
        digitalWrite(EVE_SPI_CS, HIGH);
        SPI.endTransaction();
        return true;
    }

    // Read exactly length bytes from the FPGA into out.
    bool read(uint8_t* out, size_t length, uint32_t timeoutMs) {
        if (!waitReady(timeoutMs)) return false;
        SPI.beginTransaction(SPISettings(EVE_SPI_HZ, MSBFIRST, SPI_MODE0));
        digitalWrite(EVE_SPI_CS, LOW);
        SPI.transferBytes(nullptr, out, length);
        digitalWrite(EVE_SPI_CS, HIGH);
        SPI.endTransaction();
        return true;
    }
};
`;
}

export function generateMainCpp({ classBase, className, headerName }) {
  return `// main.cpp — generated EVE ESP32-S3 bridge firmware.
//
// SOURCE GENERATED. The reference pinout is not qualified and this firmware has
// not been run against a GW1N board. The bridge forwards complete EVE protocol
// packets between USB serial and the FPGA SPI link; the example client below
// shows the generated variable API.
#include <Arduino.h>
#include "EveSpiTransport.h"
#include "EveProtocol.h"
#include "EVEClient.h"
#include "${headerName}"

EveSpiTransport transport;
EVE::EVEClient client(transport);
${className} ui(client);

static uint8_t rxBuffer[eve::kMaxPacket * 2];
static size_t rxLength = 0;
static uint16_t sequence = 0;

static size_t expectedPacketLength(const uint8_t* buffer, size_t available) {
    if (available < eve::kHeaderSize) return 0;
    const uint16_t payload = eve::readU16LE(buffer + 4);
    if (payload > eve::kMaxPayload) return 0;
    return eve::kHeaderSize + payload + eve::kCrcSize;
}

static void forwardToFpga(const uint8_t* packet, size_t length) {
    if (!transport.write(packet, length)) {
        Serial.println("EVE:ERR:SPI_WRITE");
        return;
    }
    // Responses are optional. Read a bounded frame when the FPGA raises READY.
    uint8_t response[eve::kMaxPacket];
    if (transport.read(response, eve::kHeaderSize, 5)) {
        const uint16_t payload = eve::readU16LE(response + 4);
        if (payload <= eve::kMaxPayload) {
            const size_t total = eve::kHeaderSize + payload + eve::kCrcSize;
            if (total > eve::kHeaderSize && transport.read(response + eve::kHeaderSize, total - eve::kHeaderSize, 20)) {
                Serial.write(response, total);
            }
        }
    }
}

void setup() {
    Serial.begin(EVE_SERIAL_BAUD);
    Serial.setTimeout(20);
    transport.begin();
    transport.resetFpga();
    Serial.println("EVE:READY");
}

void loop() {
    while (Serial.available() > 0) {
        if (rxLength >= sizeof(rxBuffer)) rxLength = 0;
        rxBuffer[rxLength++] = static_cast<uint8_t>(Serial.read());
        while (rxLength >= eve::kHeaderSize) {
            if (rxBuffer[0] != eve::kMagic0 || rxBuffer[1] != eve::kMagic1) {
                // Resynchronise on the magic pair rather than guessing.
                size_t shift = 1;
                while (shift < rxLength && !(rxBuffer[shift] == eve::kMagic0 && shift + 1 < rxLength && rxBuffer[shift + 1] == eve::kMagic1)) {
                    ++shift;
                }
                memmove(rxBuffer, rxBuffer + shift, rxLength - shift);
                rxLength -= shift;
                continue;
            }
            const size_t total = expectedPacketLength(rxBuffer, rxLength);
            if (total == 0 || total > sizeof(rxBuffer)) {
                rxLength = 0;
                break;
            }
            if (rxLength < total) break;
            forwardToFpga(rxBuffer, total);
            memmove(rxBuffer, rxBuffer + total, rxLength - total);
            rxLength -= total;
        }
    }

    // Example application update once per second. Replace with your own data.
    static uint32_t last = 0;
    if (millis() - last > 1000) {
        last = millis();
        // The generated client API is documented in ${headerName}.
        // ui.setPage12Room12Temperature(21.5f);
        (void)sequence;
    }
}
`;
}

export function generatePlatformIoIni({ appName }) {
  const slug = String(appName || 'EVE Firmware')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'eve-firmware';
  return `; PlatformIO project generated by EVE Studio.
; Target: ESP32-S3-WROOM-1 reference profile. Pin assignment is NOT qualified.
[env:eve-esp32s3]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200
build_flags =
    -DCORE_DEBUG_LEVEL=0
    -DEVE_FIRMWARE_NAME="${slug}"
build_src_filter = +<*>
`;
}

export function generateFirmwareReadme({ appName, romFileName, manifest }) {
  return `# ${appName} — EVE ESP32-S3 firmware

**Status: SOURCE GENERATED.** This project was produced by EVE Studio from the
same compiler output as the ROM image. It has not been built or run on hardware
in this environment.

## Reference profile (not qualified)

- MCU: ESP32-S3-WROOM-1 (Arduino framework)
- FPGA: Gowin GW1N-4 (package, speed grade and pinout not set)
- Flash: Winbond W25Q128JV, 16 MiB
- SDRAM: ISSI IS42S16400J-6, 8 MiB
- Video: ADV7513, 1080p30 (74.25 MHz)

ESP32 pin assignments in \`include/eve_board_config.h\` are **assumptions** used
so the project can compile. They are not a schematic and must be replaced after
pinout qualification.

## Build

\`\`\`
pio run
pio run -t upload
pio device monitor
\`\`\`

If PlatformIO is not installed, the Studio export records
\`SOURCE GENERATED — TOOLCHAIN NOT AVAILABLE\` and does not claim a firmware build.

## ROM image

The companion image is \`${romFileName}\` (${manifest.totalBytes.toLocaleString()} bytes,
build \`${manifest.buildId}\`). It is not embedded in the firmware. Use
\`tools/rom_upload.py\` to stream it through the ESP32 bridge to the FPGA's
W25Q128JV.

## Protocol

Firmware framing, opcodes and status codes are generated from
\`packages/eve-protocol\` (EVE PROTOCOL 1.0). \`tools/eve_protocol.py\` is generated
from the same registry, so host and firmware cannot drift.

## Honest limitations

- The bridge path, READY handshake and FPGA responses are unverified on hardware.
- The Gowin bitstream is not generated here; Gowin EDA is a separate vendor tool.
- HDMI/TMDS serialization is performed by the ADV7513, not by the FPGA.
`;
}

export function generateEsp32Project({ appName, classBase, className, headerName, cppFiles, romFileName, manifest }) {
  const files = {
    'platformio.ini': generatePlatformIoIni({ appName }),
    'include/eve_board_config.h': generateBoardConfig(),
    'include/EveProtocol.h': generateEveProtocolHeader(),
    'include/EveSpiTransport.h': generateSpiTransport(classBase),
    'src/main.cpp': generateMainCpp({ classBase, className, headerName }),
    'tools/eve_protocol.py': generateEveProtocolPython(),
    'tools/rom_upload.py': generateRomUploader(),
    'README.md': generateFirmwareReadme({ appName, romFileName, manifest }),
  };
  for (const file of cppFiles || []) {
    files[`include/${file.name}`] = file.content;
  }
  return files;
}

export function generateRomUploader() {
  return `#!/usr/bin/env python3
"""Stream an EVE ROM image through the ESP32 bridge to the W25Q128JV.

REFERENCE TOOL — not tested against hardware in this environment.

Usage:
    python tools/rom_upload.py --port COM5 --rom ../EVE_ROM_16MB.bin

The tool enforces W25Q128JV constraints locally: 4 KiB sector erase alignment
and 256-byte page program boundaries. It refuses to cross a page boundary and
never truncates the image.
"""
import argparse
import sys
import time

import serial  # pyserial

import eve_protocol as eve

SECTOR = 4096
PAGE = 256


def read_response(port, timeout=1.0):
    deadline = time.time() + timeout
    buffer = bytearray()
    while time.time() < deadline:
        chunk = port.read(port.in_waiting or 1)
        if chunk:
            buffer.extend(chunk)
            if len(buffer) >= eve.HEADER_SIZE:
                length = int.from_bytes(buffer[4:6], "little")
                total = eve.HEADER_SIZE + length + eve.CRC_SIZE
                if len(buffer) >= total:
                    return eve.decode_packet(bytes(buffer[:total]))
        else:
            time.sleep(0.005)
    raise TimeoutError("no EVE response")


def command(port, opcode, payload=b"", sequence=0, timeout=1.0):
    port.write(eve.encode_packet(opcode, payload, sequence))
    port.flush()
    return read_response(port, timeout)


def upload(port, rom, sequence_start=1):
    import binascii

    crc = binascii.crc32(rom) & 0xFFFFFFFF
    sequence = sequence_start
    print(f"ROM {len(rom)} bytes, CRC32 0x{crc:08X}")
    command(port, eve.ROM_UPDATE_BEGIN, len(rom).to_bytes(4, "little") + crc.to_bytes(4, "little"), sequence)
    sequence += 1

    for sector in range(0, len(rom), SECTOR):
        command(port, eve.ROM_ERASE_SECTOR, sector.to_bytes(4, "little"), sequence, timeout=3.0)
        sequence += 1

    for offset in range(0, len(rom), PAGE):
        chunk = rom[offset : offset + PAGE]
        if (offset % PAGE) + len(chunk) > PAGE:
            raise ValueError(f"page program would cross a page boundary at 0x{offset:X}")
        payload = offset.to_bytes(4, "little") + bytes([len(chunk)]) + chunk
        command(port, eve.ROM_WRITE_PAGE, payload, sequence)
        sequence += 1
        if offset % (PAGE * 64) == 0:
            print(f"  {offset:,} / {len(rom):,} bytes")

    response = command(port, eve.ROM_VERIFY, len(rom).to_bytes(4, "little") + crc.to_bytes(4, "little"), sequence, timeout=10.0)
    sequence += 1
    print(f"verify response: {response['payload'].hex()}")
    command(port, eve.ROM_UPDATE_END, crc.to_bytes(4, "little"), sequence)
    print("done")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True)
    parser.add_argument("--rom", required=True)
    parser.add_argument("--baud", type=int, default=115200)
    args = parser.parse_args()
    with open(args.rom, "rb") as handle:
        rom = handle.read()
    if len(rom) != 16 * 1024 * 1024:
        raise SystemExit(f"expected a 16 MiB image, got {len(rom)} bytes")
    with serial.Serial(args.port, args.baud, timeout=0.2) as port:
        upload(port, rom)


if __name__ == "__main__":
    main()
`;
}
