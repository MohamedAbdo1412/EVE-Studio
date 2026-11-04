import { describe, expect, it, vi } from 'vitest';
import { RuntimeState, RuntimeError } from '../src/language/runtime/RuntimeState.js';
import { NavigationManager } from '../src/language/runtime/NavigationManager.js';
import { BindingEngine } from '../src/language/runtime/BindingEngine.js';
import { ActionExecutor } from '../src/language/runtime/ActionExecutor.js';
import { parseExpression } from '../src/language/expressions/expressionParser.js';
import { compileValid } from './helpers.js';

function registry() {
  return [
    { path: 'room.temperature', name: 'temperature', type: 'number', initialValue: 20, id: 1 },
    { path: 'room.enabled', name: 'enabled', type: 'boolean', initialValue: true, id: 2 },
    { path: 'room.label', name: 'label', type: 'string', initialValue: 'Lab', id: 3 },
    { path: 'room.accent', name: 'accent', type: 'color', initialValue: '#00FF88', id: 4 },
    { path: 'room.icon', name: 'icon', type: 'image', initialValue: 'assets/icon.png', id: 5 },
  ];
}

function scene() {
  return {
    initialPage: 'home',
    pages: [
      { id: 'home', title: 'Home', width: 320, height: 240, components: [] },
      { id: 'settings', title: 'Settings', width: 320, height: 240, components: [] },
      { id: 'detail', title: 'Detail', width: 320, height: 240, components: [] },
    ],
  };
}

describe('RuntimeState', () => {
  it('initializes, reads and updates typed values', () => {
    const runtime = new RuntimeState(registry());
    expect(runtime.get('room.temperature')).toBe(20);
    expect(runtime.get('room.enabled')).toBe(true);
    expect(runtime.getType('room.accent')).toBe('color');
    expect(runtime.has('room.missing')).toBe(false);

    expect(runtime.set('room.temperature', 42)).toBe(42);
    expect(runtime.set('room.label', 123)).toBe('123');
    expect(runtime.toggle('room.enabled')).toBe(false);
    expect(runtime.get('room.enabled')).toBe(false);
    expect(runtime.snapshot()).toMatchObject({
      'room.temperature': 42,
      'room.label': '123',
      'room.enabled': false,
    });
  });

  it('validates values and rejects unknown variables', () => {
    const runtime = new RuntimeState(registry());
    expect(() => runtime.set('room.missing', 1)).toThrow(RuntimeError);
    expect(() => runtime.set('room.temperature', Number.NaN)).toThrow(/finite number/);
    expect(() => runtime.set('room.temperature', '42')).toThrow(/finite number/);
    expect(() => runtime.set('room.enabled', 'true')).toThrow(/boolean/);
    expect(() => runtime.set('room.accent', 'red')).toThrow(/valid color/);
    expect(() => runtime.set('room.icon', '')).toThrow(/image asset path/);
    expect(() => runtime.toggle('room.temperature')).toThrow(/boolean variable/);
  });

  it('resets individual values and all values to their declared initials', () => {
    const runtime = new RuntimeState(registry());
    runtime.set('room.temperature', 99);
    runtime.set('room.label', 'Changed');
    expect(runtime.reset('room.temperature')).toBe(20);
    expect(runtime.get('room.label')).toBe('Changed');
    runtime.resetAll();
    expect(runtime.get('room.label')).toBe('Lab');
  });

  it('merges a new registry while preserving compatible current values', () => {
    const runtime = new RuntimeState(registry());
    runtime.set('room.temperature', 55);
    runtime.set('room.enabled', false);

    runtime.mergeRegistry([
      { path: 'room.temperature', name: 'temperature', type: 'number', initialValue: 20, id: 1 },
      { path: 'room.enabled', name: 'enabled', type: 'string', initialValue: 'yes', id: 2 },
      { path: 'room.newValue', name: 'newValue', type: 'number', initialValue: 7, id: 9 },
    ]);
    expect(runtime.get('room.temperature')).toBe(55);
    expect(runtime.get('room.enabled')).toBe('false');
    expect(runtime.get('room.newValue')).toBe(7);
    expect(runtime.has('room.label')).toBe(false);

    runtime.mergeRegistry(registry(), { forceReset: true });
    expect(runtime.get('room.temperature')).toBe(20);
    expect(runtime.get('room.enabled')).toBe(true);
  });

  it('notifies subscribers on mutations and stops after unsubscribe', () => {
    const runtime = new RuntimeState(registry());
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);
    runtime.set('room.temperature', 21);
    runtime.toggle('room.enabled');
    runtime.reset('room.temperature');
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    runtime.set('room.temperature', 22);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('returns inspector entries with current values', () => {
    const runtime = new RuntimeState(registry());
    runtime.set('room.temperature', 31);
    expect(runtime.entries()[0]).toMatchObject({
      path: 'room.temperature',
      initialValue: 20,
      currentValue: 31,
    });
  });
});

describe('NavigationManager', () => {
  it('navigates, records history and goes back', () => {
    const navigation = new NavigationManager(scene());
    expect(navigation.snapshot()).toMatchObject({
      activePage: 'home',
      history: [],
      canGoBack: false,
    });

    const first = navigation.navigate('settings');
    expect(first).toMatchObject({ ok: true, changed: true, pageId: 'settings' });
    expect(navigation.snapshot().history).toEqual(['home']);
    expect(navigation.canGoBack()).toBe(true);

    navigation.navigate('detail');
    expect(navigation.breadcrumb().map((item) => item.id)).toEqual([
      'home',
      'settings',
      'detail',
    ]);

    expect(navigation.back()).toMatchObject({ ok: true, changed: true, pageId: 'settings' });
    expect(navigation.back()).toMatchObject({ ok: true, changed: true, pageId: 'home' });
    expect(navigation.back()).toEqual({
      ok: true,
      changed: false,
      reason: 'Navigation history is empty.',
    });
  });

  it('ignores navigation to the current or an unknown page', () => {
    const navigation = new NavigationManager(scene());
    expect(navigation.navigate('home')).toMatchObject({ ok: true, changed: false });
    const unknown = navigation.navigate('missing');
    expect(unknown).toMatchObject({ ok: false, changed: false });
    expect(unknown.reason).toContain('missing');
    expect(navigation.snapshot().history).toEqual([]);
  });

  it('preserves the active page when configuring unless reset is requested', () => {
    const navigation = new NavigationManager(scene());
    navigation.navigate('settings');
    navigation.configure(scene(), { reset: false });
    expect(navigation.activePage).toBe('settings');

    navigation.configure(scene(), { initialPage: 'detail', reset: true });
    expect(navigation.activePage).toBe('detail');
    expect(navigation.history).toEqual([]);
  });

  it('falls back to the first page when no initial page is available', () => {
    const navigation = new NavigationManager(scene(), 'missing');
    expect(navigation.activePage).toBe('home');
    expect(navigation.getPage('settings')?.title).toBe('Settings');
    expect(navigation.getPage('missing')).toBeNull();
  });

  it('notifies subscribers on navigation changes', () => {
    const navigation = new NavigationManager(scene());
    const listener = vi.fn();
    navigation.subscribe(listener);
    navigation.navigate('settings');
    navigation.back();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('BindingEngine', () => {
  it('evaluates every binding from the compiler table', () => {
    const result = compileValid();
    const runtime = new RuntimeState(result.registry);
    const engine = new BindingEngine(result.bindings);
    const evaluated = engine.evaluateAll(runtime.values);

    expect(evaluated.errors).toEqual([]);
    expect(evaluated.values.get('text-label:text')).toEqual({ value: 'Lab', error: null });
    expect(evaluated.values.get('degrees:text')).toEqual({ value: '21.5C', error: null });
    expect(evaluated.values.get('text-label:color')).toEqual({ value: '#00FF88', error: null });
    expect(evaluated.values.get('icon:src')).toEqual({ value: 'assets/icon.png', error: null });
  });

  it('reevaluates only bindings affected by changed paths', () => {
    const result = compileValid();
    const runtime = new RuntimeState(result.registry);
    const engine = new BindingEngine(result.bindings);
    const initial = engine.evaluateAll(runtime.values).values;

    runtime.set('room.temperature', 42);
    const changed = engine.evaluateChanged(runtime.values, initial, ['room.temperature']);
    expect(changed.errors).toEqual([]);
    expect(changed.values.get('degrees:text').value).toBe('42C');
    expect(changed.values.get('settings-value:text').value).toBe('Current: 42');
    expect(engine.getBindingsForVariable('room.temperature').map((binding) => binding.id)).toEqual(
      expect.arrayContaining(['degrees:text', 'settings-value:text']),
    );
  });

  it('reports missing variables as binding evaluation errors instead of throwing', () => {
    const result = compileValid();
    const engine = new BindingEngine(result.bindings);
    const evaluated = engine.evaluateAll({});
    expect(evaluated.errors.length).toBeGreaterThan(0);
    for (const error of evaluated.errors) {
      expect(error.code).toBe('EVE-R001');
    }
  });
});

describe('ActionExecutor', () => {
  function createExecutor() {
    const result = compileValid();
    const runtime = new RuntimeState(result.registry);
    const navigation = new NavigationManager(result.scene, result.initialPage);
    const executor = new ActionExecutor({ runtime, navigation });
    return { result, runtime, navigation, executor };
  }

  it('executes the compiled toggle/set action list in order', () => {
    const { result, runtime, executor } = createExecutor();
    const home = result.scene.pages.find((page) => page.id === 'home');
    const button = home.components.find((component) => component.id === 'toggle');
    const execution = executor.execute(button.actions);

    expect(execution.ok).toBe(true);
    expect(execution.changes).toEqual([
      { type: 'toggle', path: 'room.enabled', value: false },
      { type: 'set', path: 'room.temperature', value: 22.5 },
    ]);
    expect(runtime.get('room.enabled')).toBe(false);
    expect(runtime.get('room.temperature')).toBe(22.5);
    expect(execution.log).toHaveLength(1);
  });

  it('navigates and goes back without changing runtime values', () => {
    const { runtime, navigation, executor } = createExecutor();
    runtime.set('room.temperature', 77);

    const forward = executor.execute([
      { name: 'navigate', page: 'settings', source: "navigate('settings')" },
    ]);
    expect(forward.ok).toBe(true);
    expect(forward.navigationChanged).toBe(true);
    expect(navigation.activePage).toBe('settings');
    expect(executionHasChange(forward, 'navigate', 'settings')).toBe(true);

    const backward = executor.execute([{ name: 'back', source: 'back()' }]);
    expect(backward.ok).toBe(true);
    expect(navigation.activePage).toBe('home');
    expect(runtime.get('room.temperature')).toBe(77);
  });

  it('resets a variable and reports the resulting value', () => {
    const { runtime, executor } = createExecutor();
    runtime.set('room.temperature', 99);
    const result = executor.execute([
      { name: 'reset', path: 'room.temperature', source: 'reset(room.temperature)' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.changes).toEqual([
      { type: 'reset', path: 'room.temperature', value: 21.5 },
    ]);
  });

  it('continues after an evaluation error and reports it', () => {
    const { runtime, executor } = createExecutor();
    const divideByZero = parseExpression('1 / 0').ast;
    const result = executor.execute([
      { name: 'set', path: 'room.temperature', expression: divideByZero, source: 'set(...)' },
      { name: 'toggle', path: 'room.enabled', source: 'toggle(room.enabled)' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('EVE-R004');
    expect(runtime.get('room.enabled')).toBe(false);
  });

  it('reports unknown actions and runtime type failures', () => {
    const { executor } = createExecutor();
    const unknown = executor.execute([{ name: 'launch', source: 'launch()' }]);
    expect(unknown.errors[0].code).toBe('EVE-RT003');

    const invalidToggle = executor.execute([{ name: 'toggle', path: 'room.temperature' }]);
    expect(invalidToggle.errors[0].code).toBe('EVE-RT001');
  });

  it('bounds the runtime action log to thirty entries', () => {
    const { executor } = createExecutor();
    for (let index = 0; index < 35; index += 1) {
      executor.execute([{ name: 'toggle', path: 'room.enabled', source: 'toggle(room.enabled)' }]);
    }
    expect(executor.log).toHaveLength(30);
  });
});

function executionHasChange(execution, type, pageId) {
  return execution.changes.some((change) => change.type === type && change.pageId === pageId);
}
