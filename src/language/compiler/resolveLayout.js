import { TAG_SPECS, getTagSpec, parseBoolean } from '../languageSpec.js';
import { evaluateExpressionSafe } from '../expressions/evaluator.js';
import { parseDimensionValue } from '../semantic/validateComponents.js';

function coerceStatic(spec, value) {
  if (value === null || value === undefined) return value;
  if (spec.type === 'boolean') {
    const parsed = parseBoolean(value);
    return parsed === null ? false : parsed;
  }
  if (spec.type === 'number' || spec.type === 'integer' || spec.type === 'opacity') {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  if (spec.type === 'dimension') return String(value).trim();
  return value;
}

function segmentInitialValue(segment, values) {
  if (segment.kind === 'text') return segment.value;
  if (!segment.ast) return '';
  const result = evaluateExpressionSafe(segment.ast, values);
  if (result.error) return '';
  if (result.value === null || result.value === undefined) return '';
  return String(result.value);
}

function initialPropertyValue(descriptor, values) {
  if (!descriptor) return undefined;
  if (descriptor.kind === 'static') return descriptor.value;
  const segments = descriptor.segments || [];
  let combined = '';
  for (const segment of segments) combined += segmentInitialValue(segment, values);
  return combined;
}

function normalizeDescriptor(value, bindingId, segments) {
  if (bindingId) return { kind: 'binding', bindingId, segments };
  return { kind: 'static', value };
}

export function resolveDimension(value, parentSize, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = parseDimensionValue(String(value));
  if (!parsed) return fallback;
  if (parsed.unit === '%') return (parentSize * parsed.value) / 100;
  return parsed.value;
}

function resolveInitialBox(props, parentWidth, parentHeight, values) {
  const x = resolveDimension(initialPropertyValue(props.x, values), parentWidth, 0);
  const y = resolveDimension(initialPropertyValue(props.y, values), parentHeight, 0);
  const width = resolveDimension(initialPropertyValue(props.width, values), parentWidth, parentWidth);
  const height = resolveDimension(initialPropertyValue(props.height, values), parentHeight, parentHeight);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  };
}

function buildNode(node, context, sourceIndex) {
  const spec = getTagSpec(node.tag);
  if (!spec) return null;
  const props = {};
  const dynamicProperties = [];
  for (const [name, attrSpec] of Object.entries(spec.attributes)) {
    if (name === 'onPress') continue;
    if (node.attributes[name] === undefined) {
      const value = Object.prototype.hasOwnProperty.call(attrSpec, 'default')
        ? attrSpec.default
        : attrSpec.inherits
          ? context.inherited[name]
          : undefined;
      if (value !== undefined) props[name] = { kind: 'static', value };
      continue;
    }
    const bindingId = node._bindingProperties?.[name];
    if (bindingId) {
      const binding = context.bindings.byId.get(bindingId);
      props[name] = normalizeDescriptor(null, bindingId, binding?.segments || []);
      dynamicProperties.push(name);
    } else {
      props[name] = {
        kind: 'static',
        value: coerceStatic(attrSpec, node.attributes[name]),
      };
    }
  }

  if (node.tag === 'text') {
    if (node._textBinding) {
      const binding = context.bindings.byId.get(node._textBinding);
      props.text = normalizeDescriptor(null, node._textBinding, binding?.segments || []);
      dynamicProperties.push('text');
    } else {
      props.text = { kind: 'static', value: node.staticText || '' };
    }
  }

  if (node.tag === 'button' && node.attributes.onPress !== undefined) {
    props.onPress = { kind: 'static', value: node.attributes.onPress };
  }

  const initialBox = resolveInitialBox(props, context.parentWidth, context.parentHeight, context.values);
  const childContext = {
    ...context,
    parentWidth: initialBox.width,
    parentHeight: initialBox.height,
  };

  const children = [];
  for (let index = 0; index < (node.children || []).length; index += 1) {
    const child = node.children[index];
    if (child.type === 'TextFragment' || child.type === 'Interpolation') continue;
    const sceneChild = buildNode(child, childContext, index);
    if (sceneChild) children.push(sceneChild);
  }

  return {
    key: node.id,
    id: node.id || `${node.tag}-${node.loc.line}-${node.loc.column}`,
    tag: node.tag,
    type: node.type,
    parentId: node.parent?.id || null,
    sourceIndex,
    source: { line: node.loc.line, column: node.loc.column, endLine: node.endLoc?.line || node.loc.line },
    props,
    dynamicProperties,
    initialLayout: initialBox,
    actions: node.actions || null,
    attributeLocations: node.attrLocations || {},
    children,
  };
}

export function resolveLayout({
  appConfig,
  pages,
  bindings,
  registry,
}) {
  const initialValues = Object.fromEntries(
    registry.map((entry) => [entry.path, entry.initialValue]),
  );
  const scenePages = [];
  let componentCount = 0;

  for (const page of pages) {
    const rootNode = page.node;
    const pageSceneChildren = [];
    let sourceIndex = 0;
    for (const child of rootNode.children || []) {
      if (child.type === 'TextFragment' || child.type === 'Interpolation') continue;
      if (!getTagSpec(child.tag)) continue;
      const context = {
        bindings,
        values: initialValues,
        parentWidth: page.width,
        parentHeight: page.height,
        inherited: { width: page.width, height: page.height },
      };
      const sceneChild = buildNode(child, context, sourceIndex);
      if (sceneChild) {
        pageSceneChildren.push(sceneChild);
        const count = (function countNodes(items) {
          return items.reduce((total, item) => total + 1 + countNodes(item.children), 0);
        })([sceneChild]);
        componentCount += count;
      }
      sourceIndex += 1;
    }
    scenePages.push({
      id: page.id,
      title: page.title,
      width: page.width,
      height: page.height,
      background: page.background,
      initial: page.initial,
      source: { line: page.loc.line, column: page.loc.column },
      components: pageSceneChildren,
    });
  }

  return {
    scene: {
      app: appConfig,
      initialPage: pages.find((page) => page.initial)?.id || pages[0]?.id || null,
      pages: scenePages,
    },
    stats: {
      pages: scenePages.length,
      components: componentCount,
      dynamicProperties: bindings.bindings.length,
    },
  };
}

export { coerceStatic, initialPropertyValue, segmentInitialValue };
