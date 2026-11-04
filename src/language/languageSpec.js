/**
 * The single source of truth for EVE UI Language 0.1 surface rules. Both the
 * compiler and the editor autocomplete/readers consume this table.
 */

export const LANGUAGE_VERSION = '0.1';
export const COMPILER_VERSION = '0.1.0';

const prop = (type, extra = {}) => ({ type, ...extra });

export const TAG_SPECS = {
  app: {
    tag: 'app',
    summary: 'The single application root. Declares logical display resolution and defaults.',
    children: ['vars', 'page'],
    attributes: {
      name: prop('string', { default: 'EVE App' }),
      width: prop('integer', { required: true, min: 1 }),
      height: prop('integer', { required: true, min: 1 }),
      scale: prop('enum', { values: ['fit', 'fill', 'none'], default: 'fit' }),
      background: prop('color', { default: '#101820' }),
    },
    examples: ['<app name="Dashboard" width="800" height="480" scale="fit" background="#101820">'],
  },
  vars: {
    tag: 'vars',
    summary: 'Optional root variable declaration block. May contain families and variables.',
    children: ['fam', 'var'],
    attributes: {},
    examples: ['<vars><fam name="room"><var name="temperature" type="number" value="30" /></fam></vars>'],
  },
  fam: {
    tag: 'fam',
    summary: 'A nested namespace for runtime variables. Families create dot-separated paths.',
    children: ['fam', 'var'],
    attributes: {
      name: prop('identifier', { required: true }),
    },
    examples: ['<fam name="room12">...</fam>'],
  },
  var: {
    tag: 'var',
    summary: 'Declares one typed runtime variable. Must be a child of vars or fam.',
    children: [],
    attributes: {
      name: prop('identifier', { required: true }),
      type: prop('enum', { values: ['string', 'number', 'boolean', 'color', 'image'], required: true }),
      value: prop('string', { required: true, raw: true }),
    },
    examples: ['<var name="temperature" type="number" value="30" />'],
  },
  page: {
    tag: 'page',
    summary: 'A complete navigable screen. Only one page is active at a time.',
    children: ['group', 'text', 'img', 'vid', 'button', 'shape'],
    attributes: {
      id: prop('identifier', { required: true }),
      title: prop('string'),
      width: prop('dimension', { inherits: 'app.width' }),
      height: prop('dimension', { inherits: 'app.height' }),
      initial: prop('boolean', { default: false }),
      background: prop('color', { inherits: 'app.background' }),
    },
    examples: ['<page id="home" title="Home" initial="true" background="#101820">...</page>'],
  },
  group: {
    tag: 'group',
    summary: 'Container that establishes a coordinate reference for its children.',
    children: ['group', 'text', 'img', 'vid', 'button', 'shape'],
    attributes: {
      id: prop('identifier', { required: true }),
      x: prop('dimension', { default: '0', dynamic: true }),
      y: prop('dimension', { default: '0', dynamic: true }),
      width: prop('dimension', { default: '100%', dynamic: true }),
      height: prop('dimension', { default: '100%', dynamic: true }),
      background: prop('color', { default: null, dynamic: true }),
      visible: prop('boolean', { default: true, dynamic: true }),
      opacity: prop('opacity', { default: 1, dynamic: true }),
      zIndex: prop('integer', { default: 0 }),
      clip: prop('boolean', { default: false }),
      rotation: prop('number', { default: 0 }),
    },
  },
  text: {
    tag: 'text',
    summary: 'Renders literal text, interpolated text and expressions. Text cannot contain UI children.',
    children: [],
    textOnly: true,
    attributes: {
      id: prop('identifier', { required: true }),
      x: prop('dimension', { default: '0', dynamic: true }),
      y: prop('dimension', { default: '0', dynamic: true }),
      width: prop('dimension', { default: '100%', dynamic: true }),
      height: prop('dimension', { default: '100%', dynamic: true }),
      color: prop('color', { default: '#FFFFFF', dynamic: true }),
      font: prop('string', { default: 'system' }),
      fontSize: prop('number', { default: 16, dynamic: true, min: 1 }),
      weight: prop('enum', { values: ['normal', 'bold'], default: 'normal' }),
      align: prop('enum', { values: ['left', 'center', 'right'], default: 'left' }),
      verticalAlign: prop('enum', { values: ['top', 'middle', 'bottom'], default: 'top' }),
      wrap: prop('boolean', { default: true }),
      maxLines: prop('integer', { default: null, min: 1 }),
      visible: prop('boolean', { default: true, dynamic: true }),
      opacity: prop('opacity', { default: 1, dynamic: true }),
      zIndex: prop('integer', { default: 0 }),
    },
  },
  img: {
    tag: 'img',
    summary: 'Renders a registered image asset with contain, cover or fill scaling.',
    children: [],
    attributes: {
      id: prop('identifier', { required: true }),
      x: prop('dimension', { default: '0', dynamic: true }),
      y: prop('dimension', { default: '0', dynamic: true }),
      width: prop('dimension', { default: '100%', dynamic: true }),
      height: prop('dimension', { default: '100%', dynamic: true }),
      src: prop('asset', { required: true, dynamic: true }),
      fit: prop('enum', { values: ['contain', 'cover', 'fill'], default: 'contain' }),
      opacity: prop('opacity', { default: 1, dynamic: true }),
      radius: prop('dimension', { default: '0', dynamic: true }),
      alt: prop('string', { default: '' }),
      visible: prop('boolean', { default: true, dynamic: true }),
      zIndex: prop('integer', { default: 0 }),
    },
  },
  vid: {
    tag: 'vid',
    summary: 'Experimental browser-preview video component. Not implemented by the embedded target.',
    children: [],
    experimental: true,
    attributes: {
      id: prop('identifier', { required: true }),
      x: prop('dimension', { default: '0', dynamic: true }),
      y: prop('dimension', { default: '0', dynamic: true }),
      width: prop('dimension', { default: '100%', dynamic: true }),
      height: prop('dimension', { default: '100%', dynamic: true }),
      src: prop('asset', { required: true, dynamic: true }),
      fit: prop('enum', { values: ['contain', 'cover', 'fill'], default: 'contain' }),
      autoplay: prop('boolean', { default: false }),
      loop: prop('boolean', { default: false }),
      muted: prop('boolean', { default: true }),
      visible: prop('boolean', { default: true, dynamic: true }),
      opacity: prop('opacity', { default: 1, dynamic: true }),
      zIndex: prop('integer', { default: 0 }),
    },
  },
  button: {
    tag: 'button',
    summary: 'Interactive pressable component that executes EVE actions.',
    children: ['text', 'img', 'shape', 'group'],
    attributes: {
      id: prop('identifier', { required: true }),
      x: prop('dimension', { default: '0', dynamic: true }),
      y: prop('dimension', { default: '0', dynamic: true }),
      width: prop('dimension', { default: '100%', dynamic: true }),
      height: prop('dimension', { default: '100%', dynamic: true }),
      background: prop('color', { default: '#2455AA', dynamic: true }),
      color: prop('color', { default: '#FFFFFF', dynamic: true }),
      borderColor: prop('color', { default: '#3A73D8', dynamic: true }),
      borderWidth: prop('dimension', { default: '0', dynamic: true }),
      radius: prop('dimension', { default: '8', dynamic: true }),
      fontSize: prop('number', { default: 16, dynamic: true, min: 1 }),
      disabled: prop('boolean', { default: false, dynamic: true }),
      visible: prop('boolean', { default: true, dynamic: true }),
      opacity: prop('opacity', { default: 1, dynamic: true }),
      zIndex: prop('integer', { default: 0 }),
      onPress: prop('actions'),
    },
    examples: [
      '<button id="settings" x="20" y="20" width="180" height="48" onPress="navigate(\'settings\')">Open</button>',
    ],
  },
  shape: {
    tag: 'shape',
    summary: 'Renders a rectangle, rounded rectangle, circle or line primitive.',
    children: [],
    attributes: {
      id: prop('identifier', { required: true }),
      type: prop('enum', { values: ['rect', 'roundRect', 'circle', 'line'], required: true }),
      x: prop('dimension', { default: '0', dynamic: true }),
      y: prop('dimension', { default: '0', dynamic: true }),
      width: prop('dimension', { default: '100%', dynamic: true }),
      height: prop('dimension', { default: '100%', dynamic: true }),
      fill: prop('color', { default: '#3A73D8', dynamic: true }),
      stroke: prop('color', { default: 'transparent', dynamic: true }),
      strokeWidth: prop('dimension', { default: '0', dynamic: true }),
      radius: prop('dimension', { default: '0', dynamic: true }),
      opacity: prop('opacity', { default: 1, dynamic: true }),
      visible: prop('boolean', { default: true, dynamic: true }),
      zIndex: prop('integer', { default: 0 }),
    },
  },
};

export const UI_TAGS = ['page', 'group', 'text', 'img', 'vid', 'button', 'shape'];
export const PAGE_CHILD_TAGS = TAG_SPECS.page.children;
export const VARIABLE_TYPES = ['string', 'number', 'boolean', 'color', 'image'];

export const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
export const VARIABLE_SEGMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const ASSET_PATH_RE = /^assets\/[A-Za-z0-9_.\-/]+$/;

export function getTagSpec(tag) {
  return TAG_SPECS[tag] || null;
}

export function getAttributeSpec(tag, attr) {
  return TAG_SPECS[tag]?.attributes?.[attr] || null;
}

export function defaultProperties(tag) {
  const spec = TAG_SPECS[tag];
  if (!spec) return {};
  return Object.fromEntries(
    Object.entries(spec.attributes)
      .filter(([, attribute]) => Object.prototype.hasOwnProperty.call(attribute, 'default'))
      .map(([name, attribute]) => [name, attribute.default]),
  );
}

export function propertySupportsDynamic(tag, attr) {
  const spec = getAttributeSpec(tag, attr);
  return Boolean(spec?.dynamic) || attr === 'text';
}

export const COLOR_RE = /^(#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{4}|#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{8}|transparent)$/;

export function isValidColor(value) {
  return typeof value === 'string' && COLOR_RE.test(value.trim());
}

export function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  if (value.trim() === 'true') return true;
  if (value.trim() === 'false') return false;
  return null;
}

export function isValidDimension(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  return /^-?(?:\d+\.?\d*|\.\d+)(?:px|%)?$/.test(value.trim());
}
