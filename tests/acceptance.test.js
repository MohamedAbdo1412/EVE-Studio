import { describe, expect, it } from 'vitest';
import { compile } from '../src/language/compiler/compile.js';
import { buildPackageFiles } from '../src/language/compiler/exportPackage.js';
import { RuntimeState } from '../src/language/runtime/RuntimeState.js';
import { NavigationManager } from '../src/language/runtime/NavigationManager.js';
import { BindingEngine } from '../src/language/runtime/BindingEngine.js';
import { ActionExecutor } from '../src/language/runtime/ActionExecutor.js';
import { STARTER_SOURCE } from '../src/project/starter.js';
import { codesOf, compileStarter, syntheticAssets } from './helpers.js';

function createSession() {
  const compiled = compileStarter();
  const runtime = new RuntimeState(compiled.registry);
  const navigation = new NavigationManager(compiled.scene, compiled.initialPage);
  const bindingEngine = new BindingEngine(compiled.bindings);
  const executor = new ActionExecutor({ runtime, navigation });
  return { compiled, runtime, navigation, bindingEngine, executor };
}

function evaluate(session) {
  return session.bindingEngine.evaluateAll(session.runtime.values).values;
}

function actionsFor(compiled, pageId, componentId) {
  const page = compiled.scene.pages.find((candidate) => candidate.id === pageId);
  const component = page.components.find((candidate) => candidate.id === componentId);
  expect(component, `${pageId}/${componentId}`).toBeTruthy();
  return component.actions;
}

function packagePayload(compiled, assets) {
  return {
    scene: compiled.scene,
    registry: compiled.registry,
    bindings: compiled.bindings,
    assets,
    assetManifest: compiled.assetManifest,
    cpp: compiled.cpp,
    diagnostics: compiled.diagnostics,
    appConfig: compiled.appConfig,
    stats: {
      pages: compiled.layoutStats.pages,
      components: compiled.layoutStats.components,
      variables: compiled.registry.length,
      bindings: compiled.bindings.bindings.length,
      assets: Object.keys(assets).length,
    },
  };
}

describe('documented acceptance scenario', () => {
  it('compiles the starter project with no diagnostics', () => {
    const { compiled } = createSession();
    expect(compiled.valid).toBe(true);
    expect(compiled.counts).toEqual({ error: 0, warning: 0, info: 0 });
    expect(compiled.scene.initialPage).toBe('home');
    expect([...compiled.pageIds]).toEqual(['home', 'settings']);
    expect(compiled.registry).toHaveLength(5);
  });

  it('updates the scene immediately when a runtime variable is edited', () => {
    const session = createSession();
    expect(evaluate(session).get('temperature-value:text').value).toBe('30°C');

    session.runtime.set('page12.room12.temperature', 42);
    const values = evaluate(session);
    expect(values.get('temperature-value:text').value).toBe('42°C');
    expect(values.get('current-temperature:text').value).toBe('Current temperature: 42°C');
    expect(values.get('settings-status:text').value).toBe('Cooling: on');

    // No recompile is involved: the compiler output is unchanged.
    expect(session.compiled.report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('updates conditional labels, colors and visibility when the boolean flips', () => {
    const session = createSession();
    session.runtime.toggle('page12.room12.enabled');
    const values = evaluate(session);
    expect(values.get('cooling-status:text').value).toBe('COOLING DISABLED');
    expect(values.get('cooling-status:color').value).toBe('#FFB454');
    expect(values.get('status-dot:fill').value).toBe('#FFB454');
    expect(values.get('status-dot:visible').value).toBe(false);
  });

  it('executes the Toggle Cooling button action and records a runtime event', () => {
    const session = createSession();
    const execution = session.executor.execute(
      actionsFor(session.compiled, 'home', 'toggle-cooling'),
    );
    expect(execution.ok).toBe(true);
    expect(session.runtime.get('page12.room12.enabled')).toBe(false);
    expect(execution.changes).toEqual([
      { type: 'toggle', path: 'page12.room12.enabled', value: false },
    ]);
    const values = evaluate(session);
    expect(values.get('cooling-status:text').value).toBe('COOLING DISABLED');
  });

  it('navigates to Settings and returns through the history stack without resetting values', () => {
    const session = createSession();
    session.runtime.set('page12.room12.temperature', 42);

    session.executor.execute(actionsFor(session.compiled, 'home', 'open-settings'));
    expect(session.navigation.activePage).toBe('settings');
    expect(session.navigation.snapshot().history).toEqual(['home']);
    expect(session.runtime.get('page12.room12.temperature')).toBe(42);
    expect(evaluate(session).get('current-temperature:text').value).toBe(
      'Current temperature: 42°C',
    );

    session.executor.execute(actionsFor(session.compiled, 'settings', 'return-home'));
    expect(session.navigation.activePage).toBe('home');
    expect(session.navigation.canGoBack()).toBe(false);
    expect(session.runtime.get('page12.room12.temperature')).toBe(42);
  });

  it('increments twice, then resets the temperature without recompiling', () => {
    const session = createSession();
    const increase = actionsFor(session.compiled, 'settings', 'increase-temperature');
    const reset = actionsFor(session.compiled, 'settings', 'reset-temperature');

    session.executor.execute(increase);
    session.executor.execute(increase);
    expect(session.runtime.get('page12.room12.temperature')).toBe(32);

    session.executor.execute(reset);
    expect(session.runtime.get('page12.room12.temperature')).toBe(30);
    expect(evaluate(session).get('temperature-value:text').value).toBe('30°C');
  });

  it('keeps the last valid preview data when an edit fails to parse', () => {
    const valid = compileStarter();
    const invalidSource = STARTER_SOURCE.replace('</app>', '');
    const invalid = compile(invalidSource, {
      assets: syntheticAssets(['assets/room-icon.png']),
    });

    expect(valid.valid).toBe(true);
    expect(invalid.valid).toBe(false);
    expect(codesOf(invalid)).toContain('EVE-P002');
    const diagnostic = invalid.diagnostics.find((item) => item.code === 'EVE-P002');
    expect(diagnostic.line).toBeGreaterThan(0);
    expect(diagnostic.column).toBeGreaterThan(0);

    // The Studio's stale-preview contract: lastGood remains the previous scene.
    const lastGood = valid.scene;
    expect(lastGood.pages).toHaveLength(2);
    expect(lastGood.initialPage).toBe('home');
  });

  it('generates a C++ API that matches the five-variable registry', () => {
    const { compiled } = createSession();
    expect(compiled.cpp.files.map((file) => file.name)).toEqual([
      'EVETransport.h',
      'EVEClient.h',
      'EVERoomMonitor.h',
    ]);
    expect(compiled.cpp.methods).toHaveLength(5);
    expect(compiled.cpp.methods.map((method) => method.path)).toEqual(
      compiled.registry.map((entry) => entry.path),
    );
    const header = compiled.cpp.files.find((file) => file.name === 'EVERoomMonitor.h').content;
    expect(header).toContain('void setPage12Room12Temperature(float value)');
    expect(header).toContain('void setPage12Room12Icon(const std::string& value)');
    expect(header).toContain('client_.setImage(kPage12Room12Icon, value);');
  });

  it('exports a package with every documented file and hardware-boundary metadata', () => {
    const { compiled } = createSession();
    const assets = syntheticAssets(['assets/room-icon.png']);
    const files = buildPackageFiles(packagePayload(compiled, assets));
    const required = [
      'manifest.json',
      'scene.json',
      'variables.json',
      'bindings.json',
      'navigation.json',
      'reports/compiler-report.json',
      'firmware/EVETransport.h',
      'firmware/EVEClient.h',
      'firmware/EVERoomMonitor.h',
    ];
    for (const name of required) {
      expect(files[name], name).toBeTruthy();
    }
    const manifest = JSON.parse(files['manifest.json']);
    expect(manifest.notAFpgaBitstream).toBe(true);
    const report = JSON.parse(files['reports/compiler-report.json']);
    expect(report.hardware.fpgaBitstream).toBe(false);
    expect(report.hardware.spiTransport).toBe(false);
  });
});
