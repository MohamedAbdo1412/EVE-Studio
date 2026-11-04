import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { compile } from '../src/language/compiler/compile.js';
import { buildHardwareArtifacts } from '../src/hardware/exportHardware.js';
import { createHardwareZip, buildHardwareFileMap } from '../src/hardware/exportZip.js';
import { RTL_FILES } from '../src/hardware/rtlSources.js';
import { VALID_SOURCE, IMAGE_ASSETS } from './helpers.js';

const rgba = (() => {
  const bytes = new Uint8Array(64 * 64 * 4);
  for (let index = 0; index < bytes.length; index += 4) {
    bytes[index] = 0x20;
    bytes[index + 1] = 0x40;
    bytes[index + 2] = 0x60;
    bytes[index + 3] = 255;
  }
  return { rgba: bytes, width: 64, height: 64 };
})();

async function artifacts() {
  return buildHardwareArtifacts({
    compileResult: compile(VALID_SOURCE, { assets: IMAGE_ASSETS }),
    assets: IMAGE_ASSETS,
    projectName: 'Zip Test',
    source: VALID_SOURCE,
    decodeImage: async () => rgba,
  });
}

describe('hardware ZIP export', () => {
  it('loads the real RTL files through Vite raw imports', () => {
    expect(RTL_FILES.length).toBe(10);
    const timing = RTL_FILES.find((file) => file.path.endsWith('eve_video_timing.sv'));
    const renderer = RTL_FILES.find((file) => file.path.endsWith('eve_renderer.sv'));
    const flash = RTL_FILES.find((file) => file.path.endsWith('eve_flash_writer.sv'));
    const sdram = RTL_FILES.find((file) => file.path.endsWith('eve_sdram_ctrl.sv'));
    expect(timing.content).toContain('module eve_video_timing');
    expect(renderer.content).toContain('module eve_renderer');
    expect(flash.content).toContain('module eve_flash_writer');
    expect(sdram.content).toContain('module eve_sdram_ctrl');
    expect(renderer.content).not.toContain('module tb_');
  });

  it('includes ROM, firmware, frame package and RTL in a deterministic ZIP', async () => {
    const built = await artifacts();
    const map = buildHardwareFileMap(built);
    expect(Object.keys(map)).toEqual(
      expect.arrayContaining([
        'EVE_ROM_16MB.bin',
        'manifest.json',
        'address-map.json',
        'firmware/platformio.ini',
        'firmware/src/main.cpp',
        'frame/frame.meta',
        'frame/oam.hex',
        'frame/frame.diagnostics.json',
        'rtl/video/eve_video_timing.sv',
        'rtl/renderer/eve_renderer.sv',
        'rtl/flash/w25q128jv_model.sv',
        'rtl/flash/eve_flash_writer.sv',
        'rtl/ram/is42s16400j_model.sv',
        'rtl/ram/eve_sdram_ctrl.sv',
        'rtl/testbench/tb_eve_video_timing.sv',
        'rtl/testbench/tb_eve_frame_capture.sv',
        'rtl/testbench/tb_eve_flash_writer.sv',
        'rtl/testbench/tb_eve_sdram.sv',
        'verification/toolchain.json',
      ]),
    );
    expect(map['EVE_ROM_16MB.bin'].length).toBe(16777216);
    expect(new TextDecoder().decode(map['rtl/README.md'])).toContain('No vendor bitstream was generated');

    const first = await createHardwareZip(built, { type: 'uint8array' });
    const second = await createHardwareZip(built, { type: 'uint8array' });
    expect(first.filename).toBe('Zip-Test.eve-hardware.zip');
    expect(Buffer.from(first.data).equals(Buffer.from(second.data))).toBe(true);

    const loaded = await JSZip.loadAsync(first.data);
    const rom = await loaded.file('Zip-Test/EVE_ROM_16MB.bin').async('uint8array');
    expect(rom.length).toBe(16777216);
    const manifest = JSON.parse(await loaded.file('Zip-Test/manifest.json').async('string'));
    expect(manifest.schema).toBe('EVE HARDWARE RELEASE 1.0');
    expect(manifest.toolchain.platformio.available).toBe(false);
    const diagnostics = JSON.parse(
      await loaded.file('Zip-Test/frame/frame.diagnostics.json').async('string'),
    );
    expect(['COMPLETE', 'PARTIAL']).toContain(diagnostics.status);
    expect(manifest.framePackage.status).toBe(diagnostics.status);
  });
});
