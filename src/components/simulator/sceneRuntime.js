import React, { createContext, useContext } from 'react';

export const SceneRuntimeContext = createContext({
  bindingValues: new Map(),
  assets: {},
  selectedId: null,
  onSelect: () => {},
  onAction: () => {},
});

export function useSceneRuntime() {
  return useContext(SceneRuntimeContext);
}

export function resolveProperty(props, name, bindingValues) {
  const descriptor = props?.[name];
  if (!descriptor) return undefined;
  if (descriptor.kind === 'static') return descriptor.value;
  const evaluated = bindingValues?.get(descriptor.bindingId);
  if (!evaluated || evaluated.error) {
    return descriptor.fallback;
  }
  return evaluated.value;
}

export function toCssDimension(value, fallback = 'auto') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? `${value}px` : fallback;
  const text = String(value).trim();
  if (!text) return fallback;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return `${text}px`;
  return text;
}

export function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function clampOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(1, Math.max(0, number));
}

export function nodeFrameStyle(node, bindingValues, extra = {}) {
  const x = resolveProperty(node.props, 'x', bindingValues);
  const y = resolveProperty(node.props, 'y', bindingValues);
  const width = resolveProperty(node.props, 'width', bindingValues);
  const height = resolveProperty(node.props, 'height', bindingValues);
  return {
    position: 'absolute',
    left: toCssDimension(x, '0px'),
    top: toCssDimension(y, '0px'),
    width: toCssDimension(width, '100%'),
    height: toCssDimension(height, '100%'),
    zIndex: toFiniteNumber(resolveProperty(node.props, 'zIndex', bindingValues), 0),
    ...extra,
  };
}

export function isVisible(node, bindingValues) {
  return toBoolean(resolveProperty(node.props, 'visible', bindingValues), true);
}
