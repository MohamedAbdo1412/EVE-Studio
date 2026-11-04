/**
 * EVE hardware export pipeline.
 *
 * Consumes the existing compile() result. It does not parse or recompile EVE
 * source, and it does not maintain a second scene model: scene records come
 * from @eve/binary flattenScene, the image comes from @eve/binary buildRom.
 */

import { evaluateExpressionSafe } from '../language/expressions/evaluator.js';
import {
  flattenScene,
  buildRom,
  parseRom,
  planAssets,
  ASSET_TYPES,
  PIXEL_FORMATS,
  NO_INDEX,
} from '../../packages/eve-binary/index.js';
import { fnv1a32, sha256Hex, toHex32 } from '../../packages/eve-binary/checksums.js';
import { framePackageFromRom } from '../../packages/eve-binary/framePackage.js';
import {
  REFERENCE_TARGET,
  QUALIFICATION,
  buildFeasibilityReport,
  romBudget,
  validateTarget,
} from '../../packages/eve-hardware-spec/index.js';
import { generateEsp32Project } from './generateEsp32Project.js';

export const HARDWARE_EXPORT_VERSION = '1.0.0';

/** Collect the assets the scene and image variables actually reference. */
export function referencedAssetPaths(compileResult) {
  const manifest = compileResult.assetManifest;
  const paths = new Set();
  if (manifest?.entries) {
    for (const entry of manifest.entries) {
      if (entry.usage && entry.usage.length > 0) paths.add(entry.path);
    }
  }
  for (const entry of compileResult.registry || []) {
    if (entry.type === 'image' && entry.initialValue) paths.add(entry.initialValue);
  }
  return [...paths].sort();
}

export function bindingIndexFromRegistry(registry) {
  const map = new Map();
  registry.forEach((entry, index) => {
    for (const reference of entry.references || []) {
      if (!reference?.componentId) continue;
      map.set(`${reference.componentId}:${reference.property}`, index);
    }
  });
  return map;
}

export function makeBindingResolver(registry) {
  const values = Object.fromEntries(registry.map((entry) => [entry.path, entry.initialValue]));
  return (node, property) => {
    const descriptor = node.props?.[property];
    if (!descriptor || descriptor.kind !== 'binding') return undefined;
    let combined = '';
    for (const segment of descriptor.segments || []) {
      if (segment.kind === 'text') {
        combined += segment.value;
      } else if (segment.ast) {
        const result = evaluateExpressionSafe(segment.ast, values);
        if (result.error) return undefined;
        combined += result.value === null || result.value === undefined ? '' : String(result.value);
      }
    }
    return combined;
  };
}

/**
 * Decode project assets into payloads the ROM builder can store.
 * `decodeImage(asset)` must resolve to { rgba, width, height } or Uint8Array.
 */
export async function decodeProjectAssets(compileResult, assets, decodeImage) {
  const warnings = [];
  const decoded = [];
  const paths = referencedAssetPaths(compileResult);
  for (const path of paths) {
    const asset = assets?.[path];
    if (!asset) {
      warnings.push(`Referenced asset "${path}" is missing from the project. The ROM was generated without it.`);
      continue;
    }
    const type = String(asset.type || '');
    if (type.startsWith('video/')) {
      warnings.push(`Video asset "${path}" is not supported by EVE ROM FORMAT 1.0 or the RTL renderer.`);
      continue;
    }
    if (!type.startsWith('image/')) {
      warnings.push(`Asset "${path}" has unsupported type "${type || 'unknown'}".`);
      continue;
    }
    let decodedAsset;
    try {
      decodedAsset = decodeImage ? await decodeImage(asset) : null;
    } catch (error) {
      warnings.push(`Could not decode "${path}": ${error.message}`);
      continue;
    }
    if (!decodedAsset) {
      warnings.push(`Asset "${path}" has no decoder. Its pixels were not packed.`);
      continue;
    }
    if (decodedAsset instanceof Uint8Array) {
      decoded.push({
        path,
        name: asset.name || path.split('/').pop(),
        type: ASSET_TYPES.IMAGE,
        pixelFormat: PIXEL_FORMATS.RGBA8888,
        width: asset.width || 0,
        height: asset.height || 0,
        bytes: decodedAsset,
        source: asset.source || 'project',
      });
    } else {
      decoded.push({
        path,
        name: asset.name || path.split('/').pop(),
        type: ASSET_TYPES.IMAGE,
        width: decodedAsset.width,
        height: decodedAsset.height,
        rgba: decodedAsset.rgba,
        source: asset.source || 'project',
      });
    }
  }
  return { assets: decoded, warnings };
}

async function defaultBrowserImageDecoder(asset) {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    throw new Error('this environment has no browser image decoder');
  }
  if (!asset.dataUrl) throw new Error('asset has no data URL');
  const response = await fetch(asset.dataUrl);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { rgba: new Uint8Array(data.data.buffer), width: bitmap.width, height: bitmap.height };
}

/**
 * Build the full hardware artifact set.
 *
 * @param {object} options
 * @param {object} options.compileResult  output of compile()
 * @param {object} options.assets         project asset map
 * @param {string} options.projectName
 * @param {(asset:object)=>Promise<{rgba:Uint8Array,width:number,height:number}|Uint8Array>} [options.decodeImage]
 * @param {object} [options.target]
 * @param {{platformio?:string|null}} [options.toolchain]
 * @returns {Promise<object>}
 */
export async function buildHardwareArtifacts({
  compileResult,
  assets = {},
  projectName = 'EVE Project',
  source = '',
  decodeImage,
  target = REFERENCE_TARGET,
  toolchain = {},
  includeBuiltinFont = true,
}) {
  if (!compileResult) throw new Error('buildHardwareArtifacts requires a compile result');
  if (!compileResult.valid) {
    const errors = (compileResult.diagnostics || []).filter((item) => item.severity === 'error');
    throw new Error(
      `The EVE program must compile without errors before hardware export. ${errors[0]?.message || ''}`.trim(),
    );
  }

  const warnings = [];
  const targetValidation = validateTarget(target);
  if (!targetValidation.qualified) warnings.push(targetValidation.status);

  const decoded = await decodeProjectAssets(
    compileResult,
    assets,
    decodeImage || (() => null),
  );
  warnings.push(...decoded.warnings);

  const plan = planAssets(decoded.assets, { includeBuiltinFont });
  const registry = compileResult.registry || [];
  const values = Object.fromEntries(registry.map((entry) => [entry.path, entry.initialValue]));
  const variableIndexByPath = new Map(registry.map((entry, index) => [entry.path, index]));
  const resolve = makeBindingResolver(registry);

  const flattened = flattenScene({
    scene: compileResult.scene,
    registry,
    variableIndexByPath,
    assetIndexByPath: plan.assetIndexByPath,
    bindingIndexByKey: bindingIndexFromRegistry(registry),
    resolveText: (node, property) => resolve(node, property) ?? '',
    resolveValue: (node, property) => resolve(node, property),
  });

  const initialPageIndex = Math.max(
    0,
    (compileResult.scene.pages || []).findIndex((page) => page.id === compileResult.scene.initialPage),
  );

  const rom = buildRom({
    appName: projectName,
    appId: fnv1a32(projectName),
    sourceHash: fnv1a32(source || projectName),
    width: compileResult.scene.app?.width || 800,
    height: compileResult.scene.app?.height || 480,
    initialPageIndex,
    sceneRecords: flattened.records,
    variables: registry.map((entry) => ({
      id: entry.id,
      path: entry.path,
      type: entry.type,
      initialValue: entry.initialValue,
    })),
    assets: decoded.assets,
    textTable: flattened.textTable,
    includeBuiltinFont,
  });

  const parsed = parseRom(rom.bytes, { verifyChecksums: true });
  if (!parsed.ok) throw new Error(`ROM self-check failed: ${parsed.error}`);

  let frame = null;
  try {
    frame = framePackageFromRom(parsed, { pageIndex: initialPageIndex });
    warnings.push(...frame.warnings);
  } catch (error) {
    warnings.push(`RTL frame package unavailable: ${error.message}`);
  }

  const feasibility = buildFeasibilityReport({
    target,
    manifest: rom.manifest,
    measurements: {
      rtlSimulation: null,
      vendorBitstream: null,
    },
  });

  const esp32Files = generateEsp32Project({
    appName: projectName,
    classBase: compileResult.cpp.classBase,
    className: compileResult.cpp.className,
    headerName: compileResult.cpp.headerName,
    cppFiles: compileResult.cpp.files,
    romFileName: rom.manifest.fileName,
    manifest: rom.manifest,
  });

  const toolchainStatus = {
    platformio: toolchain.platformio || {
      available: false,
      label: 'SOURCE GENERATED — TOOLCHAIN NOT AVAILABLE',
      detail: 'PlatformIO was not found. The ESP32 project was generated but not compiled.',
    },
    gowin: toolchain.gowin || {
      available: false,
      label: 'BITSTREAM NOT GENERATED — VENDOR TOOLCHAIN NOT AVAILABLE',
      detail: 'Gowin EDA is a separate vendor installation and was not found.',
    },
  };

  const releaseManifest = {
    schema: 'EVE HARDWARE RELEASE 1.0',
    exportVersion: HARDWARE_EXPORT_VERSION,
    projectName,
    generatedBy: 'EVE Studio',
    qualification: targetValidation.status,
    rom: {
      fileName: rom.manifest.fileName,
      format: rom.header.format,
      totalBytes: rom.header.capacity,
      usedBytes: rom.header.usedBytes,
      freeBytes: rom.header.freeBytes,
      buildId: rom.header.buildIdHex,
      applicationId: rom.header.applicationIdHex,
      contentCrc32: rom.header.contentCrc32Hex,
      sha256: rom.header.sha256,
    },
    framePackage: frame
      ? {
          width: frame.width,
          height: frame.height,
          objects: frame.objects.length,
          background: `#${frame.background.toString(16).padStart(6, '0')}`,
          renderer: 'eve_renderer.sv functional vertical slice',
        }
      : null,
    target,
    feasibility,
    romBudget: romBudget(rom.manifest),
    toolchain: toolchainStatus,
    warnings,
    files: {
      rom: rom.manifest.fileName,
      manifest: 'manifest.json',
      addressMap: 'address-map.json',
      esp32Project: 'firmware/',
      framePackage: 'frame/',
      rtl: 'rtl/',
    },
  };

  const addressMapFile = {
    format: rom.header.format,
    totalBytes: rom.header.capacity,
    usedBytes: rom.header.usedBytes,
    regions: rom.addressMap,
  };

  return {
    rom,
    parsed,
    manifest: rom.manifest,
    header: rom.header,
    addressMap: rom.addressMap,
    frame,
    feasibility,
    esp32Files,
    releaseManifest,
    files: {
      [rom.manifest.fileName]: rom.bytes,
      'manifest.json': jsonBytes(releaseManifest),
      'address-map.json': jsonBytes(addressMapFile),
      'frame/frame.meta': frame ? textBytes(frame.meta) : null,
      'frame/oam.hex': frame ? textBytes(frame.oamHex) : null,
      'frame/text.hex': frame ? textBytes(frame.textHex) : null,
      'frame/font.hex': frame ? textBytes(frame.fontHex) : null,
    },
    esp32Files,
    warnings,
    toolchainStatus,
    targetValidation,
    qualification: targetValidation.qualified ? QUALIFICATION.QUALIFIED : QUALIFICATION.REFERENCE_PROFILE,
    stats: {
      sceneRecords: flattened.records.length,
      textBytes: flattened.textTable.length,
      assetCount: plan.records.length,
      sha256: sha256Hex(rom.bytes),
      buildId: toHex32(rom.header.buildId),
      unusedIndex: NO_INDEX,
      values,
    },
  };
}

function textBytes(value) {
  return new TextEncoder().encode(String(value ?? ''));
}

function jsonBytes(value) {
  return textBytes(`${JSON.stringify(value, null, 2)}\n`);
}

export { defaultBrowserImageDecoder };
