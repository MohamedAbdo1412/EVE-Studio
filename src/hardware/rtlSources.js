// Raw RTL and testbench sources bundled into the hardware ZIP.
//
// Vite resolves the `?raw` suffix at build time, so the exported ZIP contains the
// exact Verilog that the simulator backend runs. There is deliberately no second
// copy of the RTL in this repository.

import videoTiming from '../../hardware/rtl/video/eve_video_timing.sv?raw';
import renderer from '../../hardware/rtl/renderer/eve_renderer.sv?raw';
import flashModel from '../../hardware/rtl/flash/w25q128jv_model.sv?raw';
import flashWriter from '../../hardware/rtl/flash/eve_flash_writer.sv?raw';
import sdramModel from '../../hardware/rtl/ram/is42s16400j_model.sv?raw';
import sdramCtrl from '../../hardware/rtl/ram/eve_sdram_ctrl.sv?raw';
import tbVideoTiming from '../../hardware/testbench/tb_eve_video_timing.sv?raw';
import tbFrameCapture from '../../hardware/testbench/tb_eve_frame_capture.sv?raw';
import tbFlashWriter from '../../hardware/testbench/tb_eve_flash_writer.sv?raw';
import tbSdram from '../../hardware/testbench/tb_eve_sdram.sv?raw';

export const RTL_FILES = Object.freeze([
  {
    path: 'rtl/video/eve_video_timing.sv',
    content: videoTiming,
    role: 'parameterised video timing generator',
  },
  {
    path: 'rtl/renderer/eve_renderer.sv',
    content: renderer,
    role: 'functional scene compositor (reference vertical slice)',
  },
  {
    path: 'rtl/flash/w25q128jv_model.sv',
    content: flashModel,
    role: 'W25Q128JV command-layer model with page/sector constraints',
  },
  {
    path: 'rtl/flash/eve_flash_writer.sv',
    content: flashWriter,
    role: 'page-splitting, sector-erasing flash write sequencer',
  },
  {
    path: 'rtl/ram/is42s16400j_model.sv',
    content: sdramModel,
    role: 'IS42S16400J-6 cycle-level timing model',
  },
  {
    path: 'rtl/ram/eve_sdram_ctrl.sv',
    content: sdramCtrl,
    role: 'single-beat SDRAM controller with refresh',
  },
  {
    path: 'rtl/testbench/tb_eve_video_timing.sv',
    content: tbVideoTiming,
    role: 'timing arithmetic testbench',
  },
  {
    path: 'rtl/testbench/tb_eve_frame_capture.sv',
    content: tbFrameCapture,
    role: 'RTL frame capture testbench (writes binary PPM)',
  },
  {
    path: 'rtl/testbench/tb_eve_flash_writer.sv',
    content: tbFlashWriter,
    role: 'flash page/sector verification testbench',
  },
  {
    path: 'rtl/testbench/tb_eve_sdram.sv',
    content: tbSdram,
    role: 'SDRAM command timing and refresh testbench',
  },
]);

export const RTL_README = `# EVE RTL — exported sources

These are the same synthesizable SystemVerilog sources used by the EVE Simulator
backend. They are exported verbatim; nothing in this folder is generated from a
JavaScript renderer.

## What is verified

- \`eve_video_timing.sv\` passes a real Icarus Verilog testbench for two profiles:
  320x180 fast functional timing and 1920x1080 @ 30 Hz reference timing.
- \`eve_renderer.sv\` passes a real Icarus RTL FUNCTIONAL RENDERER CAPTURE
  testbench that writes a binary PPM image from RTL-generated pixels. The
  testbench compares every pixel against an independent reference compositor
  and asserts object coverage, non-background pixels, unique colors, frame
  checksum, text trailing cells, vertical non-repetition and blank-glyph
  transparency. A bare PASS line is not accepted by the backend; a complete
  \`FRAME_SUMMARY\` must agree with the captured PPM.
- Text is a single row of 8x8 A8 glyphs. Only \`gx < text_length\` and the first
  glyph row are sampled; nonzero A8 bytes are alpha. The 4096-byte text RAM
  imposes a 12-bit byte offset and 8-bit glyph count, enforced by the packer,
  ROM validator and backend.
- \`eve_flash_writer.sv\` passes a real Icarus testbench against
  \`w25q128jv_model.sv\`: 256-byte page splitting, 4 KiB sector erase, range
  rejection and page-cross detection.
- \`eve_sdram_ctrl.sv\` passes a real Icarus testbench against
  \`is42s16400j_model.sv\`: power-up wait, tRCD/tRP/tRAS/tRC/tWR/tRFC checks,
  CAS latency 3 and the 2604-cycle refresh interval.

## What is NOT verified

- No vendor bitstream was generated. Gowin EDA is a separate installation.
- No pinout, package or speed grade is qualified.
- \`eve_renderer.sv\` is a functional reference core (one pixel per
  object_count + 2 clocks), not a real-time 1080p30 scanout pipeline.
- The renderer implements RECT, BORDER_RECT and TEXT only. IMAGE, VIDEO,
  ROUND_RECT, CIRCLE, LINE and GROUP are reported as unsupported by the frame
  package; they are not flattened into rectangles and are never presented as a
  complete frame. Image support is not claimed until the RTL reads RGB565
  assets and composites them correctly.
- The SDRAM controller is a single-beat vertical slice, not a bandwidth-tuned
  scanout path. Board signal integrity and pinout are not qualified.
- The flash model is command-layer only; physical SPI pin timing is not
  simulated, and program/erase delays are shortened simulation values.
- HDMI/TMDS serialization is performed by the ADV7513, not by this RTL.
- No physical board has run this design.

## Running the testbenches

With Icarus Verilog installed:

\`\`\`sh
iverilog -g2012 -Wall -o timing.vvp video/eve_video_timing.sv testbench/tb_eve_video_timing.sv
vvp timing.vvp
vvp timing.vvp +PROFILE=full

iverilog -g2012 -Wall -o capture.vvp renderer/eve_renderer.sv testbench/tb_eve_frame_capture.sv
vvp capture.vvp +DIR=<frame-package-dir> +OUT=frame.ppm

iverilog -g2012 -Wall -o flash.vvp flash/w25q128jv_model.sv flash/eve_flash_writer.sv testbench/tb_eve_flash_writer.sv
vvp flash.vvp

iverilog -g2012 -Wall -o sdram.vvp ram/is42s16400j_model.sv ram/eve_sdram_ctrl.sv testbench/tb_eve_sdram.sv
vvp sdram.vvp
\`\`\`

The frame package directory contains \`frame.meta\`, \`oam.hex\`, \`text.hex\` and
\`font.hex\` from the export; \`frame.diagnostics.json\` is optional metadata and
is ignored by the RTL capture. The testbench writes a binary PPM (P6) image.
`;

export const RTL_WORKFLOW_NOTE =
  'RTL exported as source. Icarus/Yosys results are produced by the Simulator backend, not by this ZIP. ' +
  'No bitstream is included and no vendor timing closure is claimed.';
