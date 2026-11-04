import { isValidColor } from '../languageSpec.js';

export class RuntimeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
  }
}

function cloneValue(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return { ...value };
  return value;
}

function validateValue(type, value) {
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new RuntimeError('EVE-RT001', `Expected a finite number, received ${String(value)}.`);
    }
    return value;
  }
  if (type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new RuntimeError('EVE-RT001', `Expected a boolean, received ${String(value)}.`);
    }
    return value;
  }
  if (type === 'color') {
    if (!isValidColor(String(value))) {
      throw new RuntimeError('EVE-RT001', `Expected a valid color, received ${String(value)}.`);
    }
    return String(value);
  }
  if (type === 'image') {
    if (typeof value !== 'string' || !value.trim()) {
      throw new RuntimeError('EVE-RT001', 'Expected an image asset path.');
    }
    return value;
  }
  if (type === 'string') return String(value);
  throw new RuntimeError('EVE-RT001', `Unknown runtime variable type "${type}".`);
}

/**
 * Current runtime values are independent of source compilation. A recompile can
 * merge a new registry while preserving matching current values.
 */
export class RuntimeState {
  constructor(registry = []) {
    this.registry = new Map();
    this.values = {};
    this.listeners = new Set();
    this.mergeRegistry(registry, { forceReset: true });
  }

  mergeRegistry(registry, { forceReset = false } = {}) {
    const nextRegistry = new Map();
    const nextValues = {};
    for (const entry of registry) {
      nextRegistry.set(entry.path, entry);
      if (!forceReset && Object.prototype.hasOwnProperty.call(this.values, entry.path)) {
        const existing = this.values[entry.path];
        try {
          nextValues[entry.path] = validateValue(entry.type, existing);
        } catch {
          nextValues[entry.path] = cloneValue(entry.initialValue);
        }
      } else {
        nextValues[entry.path] = cloneValue(entry.initialValue);
      }
    }
    this.registry = nextRegistry;
    this.values = nextValues;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this.values);
  }

  has(path) {
    return this.registry.has(path);
  }

  get(path) {
    return this.values[path];
  }

  getType(path) {
    return this.registry.get(path)?.type;
  }

  set(path, value) {
    const entry = this.registry.get(path);
    if (!entry) throw new RuntimeError('EVE-RT002', `Variable "${path}" does not exist.`);
    const validated = validateValue(entry.type, value);
    this.values[path] = validated;
    this.emit();
    return validated;
  }

  toggle(path) {
    const entry = this.registry.get(path);
    if (!entry) throw new RuntimeError('EVE-RT002', `Variable "${path}" does not exist.`);
    if (entry.type !== 'boolean') {
      throw new RuntimeError('EVE-RT001', `toggle() requires a boolean variable; "${path}" is ${entry.type}.`);
    }
    const value = !this.values[path];
    this.values[path] = value;
    this.emit();
    return value;
  }

  reset(path) {
    const entry = this.registry.get(path);
    if (!entry) throw new RuntimeError('EVE-RT002', `Variable "${path}" does not exist.`);
    const value = cloneValue(entry.initialValue);
    this.values[path] = value;
    this.emit();
    return value;
  }

  resetAll() {
    for (const entry of this.registry.values()) {
      this.values[entry.path] = cloneValue(entry.initialValue);
    }
    this.emit();
  }

  snapshot() {
    return { ...this.values };
  }

  entries() {
    return [...this.registry.values()].map((entry) => ({
      ...entry,
      currentValue: this.values[entry.path],
    }));
  }
}

export { validateValue, cloneValue };
