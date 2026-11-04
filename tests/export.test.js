import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  buildPackageFiles,
  createExportZip,
  sanitizeFolder,
  serializeScene,
} from '../src/language/compiler/exportPackage.js';
import { compileStarter } from './helpers.js';

function payloadFor(result) {
  return {
    scene: result.scene,
    registry: result.registry,
    bindings: result.bindings,
    assets: result.assetManifest
      ? Object.fromEntries(
          result.assetManifest.entries.map((entry) => [
            entry.path,
            {
              ...entry,
              dataUrl: 'data:image/png;base64,AAAA',
            },
          ]),
        )
      : {},
    assetManifest: result.assetManifest,
    cpp: result.cpp,
    diagnostics: result.diagnostics,
    appConfig: result.appConfig,
    stats: {
      pages: result.layoutStats.pages,
      components: result.layoutStats.components,
      variables: result.registry.length,
      bindings: result.bindings.bindings.length,
      assets: result.assetManifest.entries.length,
    },
  };
}

describe('intermediate package export', () => {
  it('builds every documented package file', () => {
    const result = compileStarter();
    const files = buildPackageFiles(payloadFor(result));
    expect(Object.keys(files).sort()).toEqual(
      [
        'bindings.json',
        'firmware/EVEClient.h',
        'firmware/EVETransport.h',
        'firmware/EVERoomMonitor.h',
        'manifest.json',
        'navigation.json',
        'reports/README.txt',
        'reports/compiler-report.json',
        'scene.json',
        'variables.json',
      ].sort(),
    );

    for (const [name, content] of Object.entries(files)) {
      expect(typeof content, name).toBe('string');
      expect(content.length, name).toBeGreaterThan(0);
    }
    const jsonFiles = Object.keys(files).filter((name) => name.endsWith('.json'));
    for (const name of jsonFiles) {
      expect(() => JSON.parse(files[name]), name).not.toThrow();
    }
  });

  it('serializes manifest metadata and explicit hardware boundaries', () => {
    const result = compileStarter();
    const files = buildPackageFiles(payloadFor(result));
    const manifest = JSON.parse(files['manifest.json']);
    expect(manifest).toMatchObject({
      packageFormatVersion: '1.0',
      projectName: 'EVE Room Monitor',
      language: 'EVE UI Language',
      languageVersion: '0.1',
      compilerVersion: '0.1.0',
      initialPage: 'home',
      notAFpgaBitstream: true,
    });
    expect(manifest.logicalResolution).toEqual({ width: 800, height: 480, scale: 'fit' });
    expect(manifest.firmwareApi).toEqual([
      'firmware/EVETransport.h',
      'firmware/EVEClient.h',
      'firmware/EVERoomMonitor.h',
    ]);
    expect(manifest.assets).toHaveLength(1);

    const report = JSON.parse(files['reports/compiler-report.json']);
    expect(report.packageFormat).toBe('EVE intermediate package');
    expect(report.generatedAt).toBe('deterministic-build');
    expect(report.hardware).toMatchObject({
      fpgaBitstream: false,
      physicalFpgaRendering: false,
      hdmiPipeline: false,
      spiTransport: false,
      videoSupported: false,
    });
    expect(report.unsupportedFeatures.length).toBeGreaterThan(0);
    expect(files['reports/README.txt']).toContain('not an FPGA bitstream');
  });

  it('serializes scene, variables, bindings and navigation consistently', () => {
    const result = compileStarter();
    const files = buildPackageFiles(payloadFor(result));

    const scene = JSON.parse(files['scene.json']);
    expect(scene.app.name).toBe('EVE Room Monitor');
    expect(scene.initialPage).toBe('home');
    expect(scene.pages.map((page) => page.id)).toEqual(['home', 'settings']);
    expect(scene.pages[0].components.length).toBeGreaterThan(0);
    expect(scene.pages[0].components[0].properties).toBeTypeOf('object');

    const variables = JSON.parse(files['variables.json']);
    expect(variables.variables).toHaveLength(5);
    expect(variables.variables.map((entry) => entry.path)).toContain(
      'page12.room12.temperature',
    );
    expect(variables.variables[0].idHex).toMatch(/^0x[0-9A-F]{8}$/);

    const bindings = JSON.parse(files['bindings.json']);
    expect(bindings.bindings).toHaveLength(result.bindings.bindings.length);
    expect(bindings.dependencyIndex['page12.room12.temperature']).toEqual(
      expect.arrayContaining(['temperature-value:text', 'current-temperature:text']),
    );

    const navigation = JSON.parse(files['navigation.json']);
    expect(navigation.initialPage).toBe('home');
    expect(navigation.pages).toHaveLength(2);
    expect(navigation.historyModel).toBe('stack');
    expect(navigation.historyPersistsVariables).toBe(true);
    const home = navigation.pages.find((page) => page.id === 'home');
    expect(home.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'navigate', target: 'settings' }),
      ]),
    );
  });

  it('writes generated firmware headers from the C++ compiler', () => {
    const result = compileStarter();
    const files = buildPackageFiles(payloadFor(result));
    const header = files['firmware/EVERoomMonitor.h'];
    expect(header).toContain('class EVERoomMonitorClient');
    expect(header).toContain('client_.setImage(kPage12Room12Icon, value);');
    expect(header).toContain('static constexpr size_t kVariableCount = 5;');
    expect(files['firmware/EVEClient.h']).toContain('PROVISIONAL EVE PROTOCOL DRAFT');
    expect(files['firmware/EVETransport.h']).toContain('class EVETransport');
  });

  it('produces deterministic package files for identical input', () => {
    const first = compileStarter();
    const second = compileStarter();
    expect(buildPackageFiles(payloadFor(first))).toEqual(buildPackageFiles(payloadFor(second)));
  });

  it('sanitizes project folder names', () => {
    expect(sanitizeFolder('EVE Room Monitor')).toBe('EVE-Room-Monitor');
    expect(sanitizeFolder('  weird/name: 0.1  ')).toBe('weird-name-0.1');
    expect(sanitizeFolder('')).toBe('EVEProject');
    expect(sanitizeFolder('***')).toBe('EVEProject');
  });

  it('serializes only scene-relevant node fields', () => {
    const result = compileStarter();
    const scene = serializeScene(result.scene);
    const node = scene.pages[0].components[0];
    expect(node).toHaveProperty('id');
    expect(node).toHaveProperty('tag');
    expect(node).toHaveProperty('properties');
    expect(node).toHaveProperty('initialLayout');
    expect(node).toHaveProperty('children');
    expect(node).not.toHaveProperty('nodes');
    expect(node).not.toHaveProperty('actionHandlers');
  });

  it('creates a downloadable ZIP containing the package and asset bytes', async () => {
    const result = compileStarter();
    const { blob, filename, files } = await createExportZip(payloadFor(result));
    expect(filename).toBe('EVE-Room-Monitor.eve.zip');
    expect(blob.size).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names).toContain('EVE-Room-Monitor/manifest.json');
    expect(names).toContain('EVE-Room-Monitor/firmware/EVERoomMonitor.h');
    expect(names).toContain('EVE-Room-Monitor/assets/room-icon.png');
    expect(Object.keys(files)).toContain('manifest.json');
    expect(await zip.file('EVE-Room-Monitor/manifest.json').async('string')).toContain(
      '"notAFpgaBitstream": true',
    );
  });
});
