import { describe, expect, it } from 'vitest';
import { compile } from '../src/language/compiler/compile.js';
import { COLOR_RE, TAG_SPECS, isValidColor } from '../src/language/languageSpec.js';
import { hashVariablePath } from '../src/language/semantic/validateVariables.js';
import {
  IMAGE_ASSETS,
  VALID_SOURCE,
  VIDEO_ASSETS,
  codesOf,
  compileAllExamples,
  compileStarter,
  compileValid,
} from './helpers.js';

function compileSource(body, options = {}) {
  return compile(
    `<app name="Test" width="320" height="240">\n${body}\n</app>`,
    options,
  );
}

function pages(body) {
  return compileSource(`<page id="home" initial="true">\n${body}\n</page>`);
}

function vars(body) {
  return compileSource(`<vars>${body}</vars><page id="home" initial="true" />`);
}

describe('compiler pipeline', () => {
  it('compiles a complete project without diagnostics', () => {
    const result = compileValid();
    expect(result.valid).toBe(true);
    expect(result.counts).toEqual({ error: 0, warning: 0, info: 0 });
    expect(result.parseFailed).toBe(false);
    expect(result.semanticFailed).toBe(false);
    expect(result.report.status).toBe('success');
    expect(result.report.languageVersion).toBe('0.1');
    expect(result.report.stages.map((stage) => stage.id)).toEqual([
      'parse',
      'semantic',
      'layout',
      'bindings',
      'assets',
      'codegen',
    ]);
    expect(result.report.hardware.fpgaBitstream).toBe(false);
    expect(result.report.hardware.physicalRendering).toBe(false);
  });

  it('compiles the starter and all eight examples with registered sample assets', () => {
    const starter = compileStarter();
    expect(starter.valid).toBe(true);
    expect(starter.counts.error).toBe(0);
    expect(starter.registry).toHaveLength(5);
    expect(starter.scene.pages).toHaveLength(2);

    const all = compileAllExamples();
    expect(all).toHaveLength(9);
    for (const { entry, result } of all) {
      expect(result.valid, `${entry.id}: ${result.diagnostics.map((item) => item.code).join(', ')}`).toBe(
        true,
      );
      expect(result.counts.error, entry.id).toBe(0);
    }
  });

  it('builds a deterministic, collision-safe variable registry', () => {
    const first = compileValid();
    const second = compileValid();
    expect(first.registry.map((entry) => entry.path)).toEqual([
      'room.temperature',
      'room.enabled',
      'room.label',
      'room.accent',
      'room.icon',
    ]);
    expect(first.registry.map((entry) => entry.id)).toEqual(
      second.registry.map((entry) => entry.id),
    );
    expect(new Set(first.registry.map((entry) => entry.id)).size).toBe(5);
    expect(first.registry[0].id).toBe(hashVariablePath('room.temperature'));
    expect(first.registry.map((entry) => entry.initialValue)).toEqual([
      21.5,
      true,
      'Lab',
      '#00FF88',
      'assets/icon.png',
    ]);
  });

  it('extracts bindings, dependencies and references from components', () => {
    const result = compileValid();
    expect(result.bindings.bindings).toHaveLength(result.bindings.byId.size);
    expect(result.bindings.dependencyIndex.get('room.label')).toContain('text-label:text');
    expect(result.bindings.dependencyIndex.get('room.accent')).toContain('text-label:color');
    expect(result.bindings.dependencyIndex.get('room.icon')).toContain('icon:src');
    expect(result.bindings.dependencyIndex.get('room.temperature')).toEqual(
      expect.arrayContaining(['degrees:text', 'settings-value:text']),
    );

    const home = result.scene.pages.find((page) => page.id === 'home');
    const label = home.components.find((component) => component.id === 'text-label');
    expect(label.props.color).toMatchObject({ kind: 'binding', bindingId: 'text-label:color' });
    expect(label.props.text).toMatchObject({ kind: 'binding', bindingId: 'text-label:text' });
    expect(label.dynamicProperties).toEqual(expect.arrayContaining(['text', 'color']));

    const registryEntry = result.registry.find((entry) => entry.path === 'room.accent');
    expect(registryEntry.references).toEqual([
      { componentId: 'text-label', property: 'color' },
    ]);
    const temperatureEntry = result.registry.find(
      (entry) => entry.path === 'room.temperature',
    );
    expect(temperatureEntry.references).toEqual(
      expect.arrayContaining([{ componentId: 'toggle', property: 'onPress' }]),
    );
  });

  it('resolves layout dimensions, percentages and component counts', () => {
    const result = compileValid();
    expect(result.layoutStats.pages).toBe(2);
    expect(result.layoutStats.components).toBe(9);
    expect(result.layoutStats.dynamicProperties).toBe(result.bindings.bindings.length);

    const home = result.scene.pages.find((page) => page.id === 'home');
    const panel = home.components.find((component) => component.id === 'panel');
    expect(panel.initialLayout).toEqual({ x: 10, y: 10, width: 300, height: 180 });
    const toggleLabel = home.components
      .find((component) => component.id === 'toggle')
      .children.find((component) => component.id === 'toggle-label');
    expect(toggleLabel.initialLayout.width).toBe(280);
    expect(toggleLabel.initialLayout.height).toBe(50);
  });

  it('builds an asset manifest with processing metadata and usage', () => {
    const result = compileValid();
    expect(result.assetManifest.summary.total).toBe(1);
    expect(result.assetManifest.summary.images).toBe(1);
    expect(result.assetManifest.summary.missing).toBe(0);
    const entry = result.assetManifest.entries[0];
    expect(entry.path).toBe('assets/icon.png');
    expect(entry.usage.map((usage) => usage.componentId)).toEqual(
      expect.arrayContaining(['icon', 'var:room.icon']),
    );
    expect(entry.processing.intendedEmbeddedFormat).toBe('RGBA8888');
    expect(entry.processing.embeddedStatus).toBe('conversion-not-implemented');
  });

  it('produces a deterministic source hash and sensible diagnostics ordering', () => {
    const first = compileValid();
    const second = compileValid();
    expect(first.report.sourceHash).toBe(second.report.sourceHash);
    expect(first.report.sourceHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    const lines = first.diagnostics.map((item) => item.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });

  it('emits typed generated C++ setters, including setImage for image variables', () => {
    const { cpp } = compileValid();
    expect(cpp.className).toBe('TestAppClient');
    expect(cpp.headerName).toBe('TestApp.h');
    expect(cpp.files.map((file) => file.name)).toEqual([
      'EVETransport.h',
      'EVEClient.h',
      'TestApp.h',
    ]);
    expect(cpp.methods.map((method) => method.methodName)).toEqual([
      'setRoomTemperature',
      'setRoomEnabled',
      'setRoomLabel',
      'setRoomAccent',
      'setRoomIcon',
    ]);

    const header = cpp.files.find((file) => file.name === 'TestApp.h').content;
    expect(header).toContain('void setRoomTemperature(float value)');
    expect(header).toContain('client_.setFloat(kRoomTemperature, value);');
    expect(header).toContain('void setRoomEnabled(bool enabled)');
    expect(header).toContain('client_.setBool(kRoomEnabled, enabled);');
    expect(header).toContain('void setRoomAccent(uint32_t rgba)');
    expect(header).toContain('client_.setColor(kRoomAccent, rgba);');
    expect(header).toContain('client_.setString(kRoomLabel, value);');
    expect(header).toContain('client_.setImage(kRoomIcon, value);');
    expect(header).toContain('static constexpr size_t kVariableCount = 5;');
    expect(header).toContain('not FPGA bitstream');
  });
});

describe('variable diagnostics', () => {
  it('reports invalid or missing names with EVE-V003', () => {
    expect(codesOf(vars('<var name="1bad" type="number" value="1" />'))).toContain('EVE-V003');
    expect(codesOf(vars('<var type="number" value="1" />'))).toContain('EVE-V003');
    expect(codesOf(vars('<fam><var name="x" type="number" value="1" /></fam>'))).toContain(
      'EVE-V003',
    );
  });

  it('reports missing or unknown types with EVE-V004', () => {
    expect(codesOf(vars('<var name="x" value="1" />'))).toContain('EVE-V004');
    expect(codesOf(vars('<var name="x" type="float" value="1" />'))).toContain('EVE-V004');
  });

  it('reports invalid initial values with EVE-V005', () => {
    expect(codesOf(vars('<var name="x" type="number" value="abc" />'))).toContain('EVE-V005');
    expect(codesOf(vars('<var name="x" type="boolean" value="yes" />'))).toContain('EVE-V005');
    expect(codesOf(vars('<var name="x" type="color" value="red" />'))).toContain('EVE-V005');
    expect(codesOf(vars('<var name="x" type="number" />'))).toContain('EVE-V005');
  });

  it('reports duplicate variable paths and family namespace conflicts with EVE-V006', () => {
    expect(
      codesOf(
        vars(
          '<var name="x" type="number" value="1" /><var name="x" type="number" value="2" />',
        ),
      ),
    ).toContain('EVE-V006');
    expect(
      codesOf(
        vars(
          '<fam name="a"><var name="x" type="number" value="1" /></fam><var name="a" type="number" value="2" />',
        ),
      ),
    ).toContain('EVE-V006');
  });

  it('reports more than one vars block with EVE-S006', () => {
    const result = compileSource(
      '<vars><var name="a" type="number" value="1" /></vars><vars><var name="b" type="number" value="2" /></vars><page id="home" initial="true" />',
    );
    expect(codesOf(result)).toContain('EVE-S006');
  });
});

describe('action diagnostics', () => {
  it('reports empty, malformed and unknown actions', () => {
    const result = pages(`
      <button id="a" onPress="navigate('home');" />
      <button id="b" onPress="explode()" />
      <button id="c" onPress="no-paren" />
    `);
    const codes = codesOf(result);
    expect(codes).toContain('EVE-A011');
    expect(codes).toContain('EVE-A013');
    expect(codes).toContain('EVE-A012');
  });

  it('validates action argument counts and forms', () => {
    const result = pages(`
      <button id="a" onPress="navigate()" />
      <button id="b" onPress="navigate(page)" />
      <button id="c" onPress="back('home')" />
      <button id="d" onPress="toggle('room.enabled')" />
    `);
    const codes = codesOf(result);
    expect(codes).toContain('EVE-A014');
    expect(codes).toContain('EVE-A015');
    expect(codes).toContain('EVE-A016');
  });

  it('reports missing navigation targets with EVE-N001', () => {
    const result = pages('<button id="a" onPress="navigate(\'missing\')" />');
    expect(codesOf(result)).toContain('EVE-N001');
  });

  it('reports undefined variables and type mismatches in actions', () => {
    const result = compileSource(`
      <vars>
        <fam name="room">
          <var name="enabled" type="boolean" value="true" />
          <var name="temperature" type="number" value="20" />
        </fam>
      </vars>
      <page id="home" initial="true">
        <button id="a" onPress="toggle(room.unknown)" />
        <button id="b" onPress="toggle(room.temperature)" />
        <button id="c" onPress="set(room.temperature, 'hot')" />
      </page>
    `);
    const codes = codesOf(result);
    expect(codes).toContain('EVE-V001');
    expect(codes.filter((code) => code === 'EVE-V002').length).toBeGreaterThanOrEqual(2);
  });

  it('requires at least one action when onPress is present but empty', () => {
    const result = pages('<button id="a" onPress="   " />');
    expect(codesOf(result)).toContain('EVE-A010');
  });
});

describe('component and document diagnostics', () => {
  it('reports unknown tags and attributes', () => {
    expect(codesOf(pages('<widget id="w" />'))).toContain('EVE-S002');
    expect(codesOf(pages('<text id="t" bogus="1" />'))).toContain('EVE-S010');
  });

  it('reports missing required attributes and ids', () => {
    const result = pages('<shape id="s" />');
    expect(codesOf(result)).toContain('EVE-S012');
    expect(codesOf(pages('<text />'))).toContain('EVE-S005');
  });

  it('validates static colors, enums, numbers, booleans and opacity', () => {
    expect(codesOf(pages('<shape id="s" type="rect" fill="red" />'))).toContain('EVE-S015');
    expect(
      codesOf(pages('<text id="t" align="justify">Hi</text>')),
    ).toContain('EVE-S016');
    expect(
      codesOf(pages('<text id="t" fontSize="nope">Hi</text>')),
    ).toContain('EVE-S013');
    expect(
      codesOf(pages('<text id="t" opacity="2">Hi</text>')),
    ).toContain('EVE-S013');
    expect(
      codesOf(pages('<shape id="s" id="duplicate" type="rect" />')),
    ).toContain('EVE-P004');
  });

  it('reports invalid dimensions and negative-position warnings', () => {
    expect(codesOf(pages('<shape id="s" type="rect" x="wide" />'))).toContain('EVE-L001');
    const warning = pages('<shape id="s" type="rect" x="-4" />');
    expect(codesOf(warning)).toContain('EVE-L002');
    expect(warning.counts.warning).toBeGreaterThan(0);
  });

  it('rejects dynamic values on non-dynamic attributes', () => {
    const result = pages('<text id="t" font="\${room.font}">Hi</text>');
    expect(codesOf(result)).toContain('EVE-S011');
  });

  it('reports duplicate component IDs across pages with EVE-S001', () => {
    const result = compileSource(`
      <page id="home" initial="true"><text id="same">A</text></page>
      <page id="other"><text id="same">B</text></page>
    `);
    expect(codesOf(result)).toContain('EVE-S001');
  });

  it('reports multiple initial pages with EVE-S007 and implicit initial with EVE-S020', () => {
    const multiple = compileSource(
      '<page id="a" initial="true" /><page id="b" initial="true" />',
    );
    expect(codesOf(multiple)).toContain('EVE-S007');

    const implicit = compileSource('<page id="a" />');
    expect(codesOf(implicit)).toContain('EVE-S020');
    expect(implicit.initialPage).toBe('a');
  });
});

describe('asset and hardware diagnostics', () => {
  it('reports missing assets as errors with EVE-A001', () => {
    const result = compile(VALID_SOURCE, { assets: {} });
    expect(result.valid).toBe(false);
    expect(codesOf(result)).toContain('EVE-A001');
  });

  it('accepts a valid video asset but warns about preview-only video', () => {
    const result = compileSource(
      '<page id="home" initial="true"><vid id="clip" src="assets/clip.mp4" /></page>',
      { assets: VIDEO_ASSETS },
    );
    expect(result.valid).toBe(true);
    expect(codesOf(result)).toContain('EVE-H001');
    expect(result.counts.warning).toBeGreaterThan(0);
    expect(result.report.hardware.video).toBe(false);
  });

  it('rejects an image path that points at a video asset', () => {
    const result = compileSource(
      '<page id="home" initial="true"><img id="still" src="assets/clip.mp4" /></page>',
      { assets: VIDEO_ASSETS },
    );
    expect(codesOf(result)).toContain('EVE-A001');
    expect(result.valid).toBe(false);
  });
});

describe('language specification invariants', () => {
  it('does not contain duplicate tag names or malformed color rules', () => {
    expect(Object.keys(TAG_SPECS)).toEqual([
      'app',
      'vars',
      'fam',
      'var',
      'page',
      'group',
      'text',
      'img',
      'vid',
      'button',
      'shape',
    ]);
    expect(isValidColor('#0AF')).toBe(true);
    expect(isValidColor('#00FF88AA')).toBe(true);
    expect(isValidColor('transparent')).toBe(true);
    expect(isValidColor('rgb(0,0,0)')).toBe(false);
    expect(COLOR_RE.test('#12345')).toBe(false);
  });
});
