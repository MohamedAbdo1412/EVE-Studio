/**
 * Build the downloadable hardware ZIP.
 *
 * The ZIP contains real artefacts only: the ROM image, release metadata, the
 * generated ESP32 source project, the RTL frame package and the RTL sources.
 * It never contains a bitstream or a fabricated build log.
 */

import JSZip from 'jszip';
import { RTL_FILES, RTL_README, RTL_WORKFLOW_NOTE } from './rtlSources.js';

const FIXED_ZIP_DATE = new Date('2024-01-01T00:00:00.000Z');

function sanitizeFolder(name) {
  return (
    String(name || 'EVEHardware')
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'EVEHardware'
  );
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new TextEncoder().encode(String(value ?? ''));
}

export function buildHardwareFileMap(artifacts) {
  if (!artifacts) throw new Error('createHardwareZip requires hardware artifacts');
  const files = {};

  for (const [path, content] of Object.entries(artifacts.files || {})) {
    if (content != null) files[path] = asBytes(content);
  }

  for (const [path, content] of Object.entries(artifacts.esp32Files || {})) {
    files[`firmware/${path}`] = asBytes(content);
  }

  for (const source of RTL_FILES) {
    files[source.path] = asBytes(source.content);
  }
  files['rtl/README.md'] = asBytes(RTL_README);

  files['verification/toolchain.json'] = asBytes(
    `${JSON.stringify(artifacts.toolchainStatus || {}, null, 2)}\n`,
  );
  files['verification/feasibility.json'] = asBytes(
    `${JSON.stringify(artifacts.feasibility || {}, null, 2)}\n`,
  );

  files['README.txt'] = asBytes(hardwareReadme(artifacts));
  return files;
}

function hardwareReadme(artifacts) {
  const manifest = artifacts.releaseManifest || {};
  const rom = manifest.rom || {};
  return [
    'EVE HARDWARE EXPORT',
    '===================',
    '',
    `Project: ${manifest.projectName || 'EVE Project'}`,
    `Format:  ${rom.format || 'EVE ROM FORMAT 1.0'}`,
    `ROM:     ${rom.fileName || 'EVE_ROM_16MB.bin'} (${Number(rom.totalBytes || 0).toLocaleString()} bytes)`,
    `Build:   ${rom.buildId || 'unknown'}`,
    `CRC32:   ${rom.contentCrc32 || 'unknown'}`,
    `SHA-256: ${rom.sha256 || 'unknown'}`,
    '',
    'Qualification',
    '-------------',
    manifest.qualification || 'REFERENCE PROFILE — PACKAGE/PINOUT NOT QUALIFIED',
    '',
    'Toolchain',
    '---------',
    `PlatformIO: ${manifest.toolchain?.platformio?.label || 'SOURCE GENERATED — TOOLCHAIN NOT AVAILABLE'}`,
    `Gowin EDA:  ${manifest.toolchain?.gowin?.label || 'BITSTREAM NOT GENERATED — VENDOR TOOLCHAIN NOT AVAILABLE'}`,
    '',
    'Contents',
    '--------',
    '  EVE_ROM_16MB.bin     complete 16 MiB SPI NOR image (unused bytes 0xFF)',
    '  manifest.json        release manifest, checksums, budgets',
    '  address-map.json     ROM region and asset offsets',
    '  firmware/            deterministic ESP32-S3 PlatformIO project',
    '  frame/               RTL frame package (meta, OAM, text, font)',
    '  rtl/                 synthesizable RTL and separate testbenches',
    '  verification/        toolchain state and feasibility report',
    '',
    'Honest limitations',
    '------------------',
    '- The reference pinout is an assumption, not a schematic.',
    '- No ESP32 firmware was compiled here; PlatformIO was not available.',
    '- No Gowin bitstream was generated; vendor EDA was not available.',
    '- The renderer is a functional reference core, not a 1080p30 pipeline.',
    '- HDMI/TMDS serialization is performed by the ADV7513.',
    '',
    RTL_WORKFLOW_NOTE,
    '',
  ].join('\n');
}

/**
 * Build the ZIP as a Blob (browser) or Uint8Array (Node/test).
 *
 * @param {object} artifacts  result of buildHardwareArtifacts()
 * @param {object} [options]
 * @param {'blob'|'uint8array'} [options.type]
 */
export async function createHardwareZip(artifacts, { type = 'blob' } = {}) {
  const folder = sanitizeFolder(artifacts?.releaseManifest?.projectName);
  const files = buildHardwareFileMap(artifacts);
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(`${folder}/${path}`, content, {
      date: FIXED_ZIP_DATE,
      binary: true,
      // Implicit folder records would carry the current time and break byte
      // determinism when two exports straddle a 2-second DOS-time boundary.
      createFolders: false,
    });
  }
  const output = await zip.generateAsync({
    type,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return {
    data: output,
    filename: `${folder}.eve-hardware.zip`,
    folder,
    fileCount: Object.keys(files).length,
    files,
  };
}

export { sanitizeFolder };
