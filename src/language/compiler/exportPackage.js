import JSZip from 'jszip';
import { LANGUAGE_VERSION, COMPILER_VERSION } from '../languageSpec.js';

const FIXED_ZIP_DATE = new Date('2024-01-01T00:00:00.000Z');

function sanitizeFolder(name) {
  return (
    String(name || 'EVEProject')
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'EVEProject'
  );
}

export function serializeScene(scene) {
  const serializeProps = (props) =>
    Object.fromEntries(
      Object.entries(props || {}).map(([name, descriptor]) => [
        name,
        descriptor.kind === 'static'
          ? { kind: 'static', value: descriptor.value }
          : { kind: 'binding', bindingId: descriptor.bindingId },
      ]),
    );

  const serializeNode = (node) => ({
    id: node.id,
    tag: node.tag,
    parentId: node.parentId,
    source: node.source,
    properties: serializeProps(node.props),
    dynamicProperties: node.dynamicProperties,
    initialLayout: node.initialLayout,
    actions: (node.actions || []).map((action) => ({
      name: action.name,
      page: action.page,
      path: action.path,
      expression: action.expressionSource,
    })),
    children: node.children.map(serializeNode),
  });

  return {
    app: scene.app,
    initialPage: scene.initialPage,
    pages: scene.pages.map((page) => ({
      id: page.id,
      title: page.title,
      width: page.width,
      height: page.height,
      background: page.background,
      initial: page.initial,
      components: page.components.map(serializeNode),
    })),
  };
}

function dataUrlToBytes(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function buildNavigation(scene) {
  const pages = scene.pages.map((page) => ({
    id: page.id,
    title: page.title,
    initial: page.initial,
    width: page.width,
    height: page.height,
    references: [],
  }));
  const byPage = new Map(pages.map((page) => [page.id, page]));

  const visit = (node, pageId) => {
    for (const action of node.actions || []) {
      if (action.name === 'navigate') {
        byPage.get(pageId)?.references.push({
          fromComponent: node.id,
          action: 'navigate',
          target: action.page,
        });
      } else if (action.name === 'back') {
        byPage.get(pageId)?.references.push({
          fromComponent: node.id,
          action: 'back',
        });
      }
    }
    for (const child of node.children) visit(child, pageId);
  };
  for (const page of scene.pages) {
    for (const component of page.components) visit(component, page.id);
  }
  return {
    initialPage: scene.initialPage,
    pages,
    historyModel: 'stack',
    historyPersistsVariables: true,
  };
}

function containsTag(node, tag) {
  if (!node) return false;
  if (node.tag === tag) return true;
  return (node.children || []).some((child) => containsTag(child, tag));
}

function sceneContainsTag(scene, tag) {
  return scene.pages.some((page) =>
    (page.components || []).some((component) => containsTag(component, tag)),
  );
}

export function buildPackageFiles({
  scene,
  registry,
  bindings,
  assets,
  assetManifest,
  cpp,
  diagnostics,
  appConfig,
  stats,
}) {
  const navigation = buildNavigation(scene);
  const variables = registry.map((entry) => ({
    id: entry.id,
    idHex: `0x${entry.id.toString(16).toUpperCase().padStart(8, '0')}`,
    path: entry.path,
    type: entry.type,
    initialValue: entry.initialValue,
    source: entry.source,
  }));

  const report = {
    packageFormat: 'EVE intermediate package',
    compilerVersion: COMPILER_VERSION,
    languageVersion: LANGUAGE_VERSION,
    generatedAt: 'deterministic-build',
    app: appConfig,
    statistics: stats,
    diagnostics: diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      line: diagnostic.line,
      column: diagnostic.column,
      hint: diagnostic.hint,
    })),
    hardware: {
      fpgaBitstream: false,
      physicalFpgaRendering: false,
      hdmiPipeline: false,
      spiTransport: false,
      videoSupported: false,
      note: 'This is an intermediate browser-generated package, not FPGA firmware or a bitstream.',
    },
    assets: assetManifest.entries,
    missingAssets: assetManifest.missing,
    unsupportedFeatures: [
      ...(sceneContainsTag(scene, 'vid')
        ? ['Video preview is not implemented by the embedded target in EVE 0.1.']
        : []),
      'Browser font rendering is not an FPGA glyph-atlas implementation.',
      'No physical FPGA, HDMI or SPI transport is included in this package.',
    ],
  };

  const manifest = {
    packageFormatVersion: '1.0',
    projectName: appConfig.name,
    language: 'EVE UI Language',
    languageVersion: LANGUAGE_VERSION,
    compilerVersion: COMPILER_VERSION,
    logicalResolution: {
      width: appConfig.width,
      height: appConfig.height,
      scale: appConfig.scale,
    },
    initialPage: scene.initialPage,
    assets: assetManifest.entries.map((entry) => ({
      path: entry.path,
      type: entry.type,
      size: entry.size,
      width: entry.width,
      height: entry.height,
      processing: entry.processing,
    })),
    firmwareApi: cpp.files.map((file) => `firmware/${file.name}`),
    notAFpgaBitstream: true,
  };

  return {
    'manifest.json': JSON.stringify(manifest, null, 2),
    'scene.json': JSON.stringify(serializeScene(scene), null, 2),
    'variables.json': JSON.stringify({ languageVersion: LANGUAGE_VERSION, variables }, null, 2),
    'bindings.json': JSON.stringify(
      {
        languageVersion: LANGUAGE_VERSION,
        bindings: bindings.serializable,
        dependencyIndex: Object.fromEntries(bindings.dependencyIndex),
      },
      null,
      2,
    ),
    'navigation.json': JSON.stringify(navigation, null, 2),
    'reports/compiler-report.json': JSON.stringify(report, null, 2),
    'firmware/EVETransport.h': cpp.files.find((file) => file.name === 'EVETransport.h')?.content || '',
    'firmware/EVEClient.h': cpp.files.find((file) => file.name === 'EVEClient.h')?.content || '',
    [`firmware/${cpp.headerName}`]:
      cpp.files.find((file) => file.name === cpp.headerName)?.content || '',
    'reports/README.txt':
      'This ZIP is an intermediate EVE software package. It is not an FPGA bitstream and does not contain production hardware firmware. Asset conversion entries describe intended future processing only.\n',
  };
}

export async function createExportZip(payload) {
  const folder = sanitizeFolder(payload.appConfig?.name);
  const files = buildPackageFiles(payload);
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(`${folder}/${path}`, content, { date: FIXED_ZIP_DATE, createFolders: true });
  }
  for (const asset of Object.values(payload.assets || {})) {
    const bytes = dataUrlToBytes(asset.dataUrl);
    if (bytes) {
      zip.file(`${folder}/${asset.path}`, bytes, { date: FIXED_ZIP_DATE, createFolders: true, binary: true });
    } else {
      zip.file(
        `${folder}/${asset.path}.MISSING.txt`,
        'Asset metadata exists but binary browser data was not available at export time.',
        { date: FIXED_ZIP_DATE, createFolders: true },
      );
    }
  }
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { blob, filename: `${folder}.eve.zip`, files };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(content, filename, type = 'text/plain') {
  const blob = new Blob([content], { type });
  downloadBlob(blob, filename);
}

export { sanitizeFolder };
