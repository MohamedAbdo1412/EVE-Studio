# EVE Simulator

A separate local web app for running the **real** EVE hardware artifacts: native
HDL simulation, RTL frame capture, ROM inspection and the EVE protocol console.

The Simulator does not reimplement the EVE language, the ROM format or the
protocol. It imports the shared modules in `packages/` and runs the RTL in
`hardware/` through native tools. Studio remains the editor/compiler; the
Simulator consumes what Studio exports.

## Requirements

- Node.js 20 or newer.
- Icarus Verilog (`iverilog`) and its runtime (`vvp`) for HDL results.
- Optional: Yosys, Verilator, PlatformIO. These are probed independently and are
  never assumed to exist.

The portable OSS CAD Suite layout is recognised automatically by the dev
launcher: set `EVE_OSS_CAD_SUITE` to the suite root, or place it at
`%TEMP%\eve-tools\oss-cad-suite`. You can also set `EVE_TOOL_BIN` to a directory
containing the executables, or simply put them on `PATH`.

## Run

```sh
# From the repository root, once:
npm install

cd simulator
npm run dev
```

- UI: <http://127.0.0.1:5175>
- Backend: <http://127.0.0.1:5174>
- WebSocket: `ws://127.0.0.1:5174/ws`

Production build:

```sh
cd simulator
npm run build
npm start          # backend serves simulator/dist on 127.0.0.1:5174
```

## What each tab does

| Tab | Native work |
| --- | --- |
| RTL monitor | Runs `tb_eve_frame_capture.sv` with Icarus, reads the binary PPM the testbench wrote, and displays those pixels. |
| Timing | Runs `tb_eve_video_timing.sv` for 320×180@60 or the full 1920×1080@30 profile. |
| Memory | Runs the W25Q128JV flash writer testbench and the IS42S16400J-6 SDRAM controller testbench against their cycle-level models. |
| ROM inspector | Parses a `EVE_ROM_16MB.bin` and verifies EVE ROM FORMAT 1.0 checksums. No HDL is executed. |
| Protocol | Encodes/decodes EVE PROTOCOL 1.0 packets using the shared codec. |
| Toolchain | Executes each tool's version command and reports the observed result. |
| Telemetry | Streams job logs and results over the local WebSocket. |

To capture a frame, upload the 16 MiB ROM produced by **EVE Studio → Hardware
Build**, or select the four `frame/` files from the exported hardware ZIP.

## Honest boundaries

- No HDL result is displayed unless Icarus/VVP actually ran. Unavailable tools
  produce `UNAVAILABLE`, never a green result.
- The canvas shows RTL-generated pixels. Expanding RGB to RGBA for canvas
  display is the only client-side pixel conversion.
- `eve_renderer.sv` is a functional reference core (one pixel per
  `object_count + 2` clocks), not a real-time 1080p30 scanout pipeline.
- The flash model is command-layer only: it enforces 16 MiB capacity, 256-byte
  pages and 4 KiB sectors, but does not simulate physical SPI pins or vendor
  program/erase timings.
- The SDRAM controller is a single-beat vertical slice checked against
  cycle-level `-6` timing. Pinout, package, signal integrity and sustained
  bandwidth are not qualified.
- No Gowin bitstream, vendor timing closure, HDMI/TMDS simulation or physical
  board measurement is claimed anywhere.
- The board pinout and FPGA package remain
  `REFERENCE PROFILE — PACKAGE/PINOUT NOT QUALIFIED`.

## Shared code

The backend imports:

- `packages/eve-binary/` — ROM format, scene/asset codecs, checksums, frame package.
- `packages/eve-protocol/` — opcodes, status codes, CRC16 and typed values.
- `packages/eve-hardware-spec/` — reference target and feasibility limits.

The frontend imports the protocol metadata from the same module so opcode names
cannot drift from the firmware generator.
