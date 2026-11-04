import {
  SEVERITY,
  createDiagnostic,
  createLoc,
} from '../diagnostics.js';
import { advanceLoc } from '../expressions/expressionLexer.js';
import {
  inferExpressionType,
  parseExpression,
} from '../expressions/expressionParser.js';
import { evaluateExpressionSafe } from '../expressions/evaluator.js';
import {
  ASSET_PATH_RE,
  TAG_SPECS,
  getTagSpec,
  isValidColor,
  isValidDimension,
  parseBoolean,
} from '../languageSpec.js';
import {
  checkExpressionVariables,
  isTypeCompatible,
  parseActionList,
} from './validateActions.js';

function diagnostic(diagnostics, code, severity, message, loc, hint, stage = 'components') {
  diagnostics.push(
    createDiagnostic({
      code,
      severity,
      message,
      loc,
      hint,
      source: 'semantic',
      stage,
    }),
  );
}

function error(diagnostics, code, message, loc, hint, stage) {
  diagnostic(diagnostics, code, SEVERITY.ERROR, message, loc, hint, stage);
}

function warning(diagnostics, code, message, loc, hint, stage) {
  diagnostic(diagnostics, code, SEVERITY.WARNING, message, loc, hint, stage);
}

export function parseDimensionValue(value) {
  if (typeof value === 'number') return { value, unit: 'px', numeric: value };
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(-?(?:\d+\.?\d*|\.\d+))(px|%)?$/);
  if (!match) return null;
  return {
    value: Number(match[1]),
    unit: match[2] || 'px',
    numeric: Number(match[1]),
  };
}

function staticAttributeValue(node, name, fallback) {
  if (!Object.prototype.hasOwnProperty.call(node.attributes, name)) return fallback;
  return node.attributes[name];
}

function containsExpression(value) {
  return typeof value === 'string' && value.includes('${');
}

export function extractTemplateSegments(template, baseLoc) {
  const text = template || '';
  const segments = [];
  let index = 0;
  let literalStart = 0;
  const pushLiteral = (start, end) => {
    if (end <= start) return;
    const value = text.slice(start, end);
    segments.push({
      kind: 'text',
      value,
      loc: advanceLoc(baseLoc, text.slice(0, start)),
    });
  };
  while (index < text.length) {
    if (text[index] === '$' && text[index + 1] === '{') {
      pushLiteral(literalStart, index);
      const expressionStart = index + 2;
      let cursor = expressionStart;
      let depth = 1;
      let quote = null;
      let escaped = false;
      let closed = false;
      while (cursor < text.length) {
        const char = text[cursor];
        if (quote) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === quote) quote = null;
        } else if (char === "'" || char === '"') {
          quote = char;
        } else if (char === '{') depth += 1;
        else if (char === '}') {
          depth -= 1;
          if (depth === 0) {
            closed = true;
            break;
          }
        }
        cursor += 1;
      }
      const expressionEnd = closed ? cursor : text.length;
      segments.push({
        kind: 'expression',
        source: text.slice(expressionStart, expressionEnd),
        loc: advanceLoc(baseLoc, text.slice(0, expressionStart)),
        startLoc: advanceLoc(baseLoc, text.slice(0, index)),
        closed,
      });
      index = closed ? cursor + 1 : text.length;
      literalStart = index;
      continue;
    }
    index += 1;
  }
  pushLiteral(literalStart, text.length);
  return segments;
}

function trimTextSegments(segments) {
  const trimmed = segments.map((segment) => ({ ...segment }));
  while (trimmed.length && trimmed[0].kind === 'text' && /^\s*$/.test(trimmed[0].value)) {
    trimmed.shift();
  }
  if (trimmed.length && trimmed[0].kind === 'text') {
    trimmed[0].value = trimmed[0].value.replace(/^\s+/, '');
  }
  while (trimmed.length && trimmed[trimmed.length - 1].kind === 'text' && /^\s*$/.test(trimmed[trimmed.length - 1].value)) {
    trimmed.pop();
  }
  if (trimmed.length && trimmed[trimmed.length - 1].kind === 'text') {
    trimmed[trimmed.length - 1].value = trimmed[trimmed.length - 1].value.replace(/\s+$/, '');
  }
  return trimmed.filter((segment) => segment.kind !== 'text' || segment.value.length > 0);
}

function templateToSource(segments) {
  return segments
    .map((segment) => (segment.kind === 'text' ? segment.value : `\${${segment.source}}`))
    .join('');
}

function registerBinding(node, property, segments, expectedType, diagnostics, registry) {
  const dependencies = [];
  const expressions = [];
  for (const segment of segments) {
    if (segment.kind !== 'expression') continue;
    const parsed = parseExpression(segment.source, segment.loc);
    diagnostics.push(...parsed.diagnostics);
    checkExpressionVariables(parsed.ast, registry, diagnostics, segment.loc);
    segment.ast = parsed.ast;
    segment.dependencies = parsed.dependencies || [];
    for (const dependency of parsed.dependencies || []) {
      if (!dependencies.includes(dependency)) dependencies.push(dependency);
      const entry = registry.get(dependency);
      if (entry) {
        const componentId = node.id || `line-${node.loc.line}`;
        if (!entry.references.some((ref) => ref.componentId === componentId && ref.property === property)) {
          entry.references.push({ componentId, property });
        }
      }
    }
    expressions.push(segment);
  }

  const onlyExpression =
    segments.length === 1 && segments[0].kind === 'expression' && segments[0].ast;
  const actualType = onlyExpression
    ? inferExpressionType(segments[0].ast, registry)
    : 'string';

  let compatible = true;
  if (expectedType === 'color') {
    compatible = actualType === 'color' || actualType === 'string';
    if (compatible && segments.length === 1 && segments[0].ast?.type === 'Literal' && typeof segments[0].ast.value === 'string' && !isValidColor(segments[0].ast.value)) {
      error(
        diagnostics,
        'EVE-V002',
        `Color expression returns invalid color "${segments[0].ast.value}".`,
        segments[0].loc,
        'Color expressions must return #RGB, #RGBA, #RRGGBB, #RRGGBBAA or transparent.',
      );
      compatible = false;
    }
  } else if (expectedType === 'asset') {
    compatible = ['string', 'image'].includes(actualType);
  } else if (expectedType === 'dimension') {
    compatible = ['number', 'string'].includes(actualType);
  } else if (expectedType === 'string') {
    compatible = !['mixed', 'undefined', 'unknown'].includes(actualType);
  } else {
    compatible = isTypeCompatible(expectedType, actualType);
  }

  if (!compatible) {
    error(
      diagnostics,
      'EVE-V002',
      `Type mismatch for ${property}. Expected ${expectedType}, received ${actualType}.`,
      segments[0]?.loc || node.loc,
      `The ${property} property must evaluate to ${expectedType}.`,
    );
  }

  const componentId = node.id || `line-${node.loc.line}`;
  const binding = {
    id: `${componentId}:${property}`,
    componentId,
    property,
    source: templateToSource(segments),
    segments,
    expressionAst: onlyExpression ? segments[0].ast : null,
    dependencies,
    expectedType,
    actualType,
    loc: segments[0]?.startLoc || segments[0]?.loc || node.loc,
  };
  if (!node._bindings) node._bindings = [];
  node._bindings.push(binding);
  if (!node._bindingProperties) node._bindingProperties = {};
  node._bindingProperties[property] = binding.id;
  if (!node._dynamicAttributes) node._dynamicAttributes = {};
  node._dynamicAttributes[property] = { segments, dependencies, source: binding.source };
  return binding;
}

function expectedTypeForAttribute(spec) {
  if (!spec) return 'string';
  if (spec.type === 'boolean') return 'boolean';
  if (spec.type === 'number' || spec.type === 'integer' || spec.type === 'opacity') return 'number';
  if (spec.type === 'color') return 'color';
  if (spec.type === 'dimension') return 'dimension';
  if (spec.type === 'asset') return 'asset';
  return 'string';
}

function validateStaticAttribute(node, name, spec, value, diagnostics) {
  const loc = node.attrLocations[name]?.valueLoc || node.loc;
  if (spec.type === 'dimension') {
    const parsed = parseDimensionValue(value);
    if (!parsed) {
      error(
        diagnostics,
        'EVE-L001',
        `Invalid dimension "${value}" for ${name}.`,
        loc,
        'Dimensions are numbers optionally suffixed with px or %.',
        'layout',
      );
      return;
    }
    if (['width', 'height'].includes(name) && parsed.value <= 0) {
      error(
        diagnostics,
        'EVE-L001',
        `${name} must be greater than zero; received "${value}".`,
        loc,
        'Use a positive logical dimension.',
        'layout',
      );
    }
    if (['width', 'height', 'radius', 'strokeWidth', 'borderWidth'].includes(name) && parsed.value < 0) {
      error(
        diagnostics,
        'EVE-L001',
        `${name} cannot be negative; received "${value}".`,
        loc,
        'Use zero or a positive dimension.',
        'layout',
      );
    }
    if (['x', 'y'].includes(name) && parsed.value < 0) {
      warning(
        diagnostics,
        'EVE-L002',
        `Negative ${name} places "${node.id || node.tag}" outside its parent.`,
        loc,
        'Negative coordinates are allowed but may be clipped.',
        'layout',
      );
    }
    return;
  }
  if (spec.type === 'opacity') {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1) {
      error(
        diagnostics,
        'EVE-S013',
        `Opacity must be a number between 0 and 1; received "${value}".`,
        loc,
        'Use 0, 0.5 or 1 for example.',
      );
    }
    return;
  }
  if (spec.type === 'number' || spec.type === 'integer') {
    const number = Number(value);
    if (!Number.isFinite(number) || (spec.type === 'integer' && !Number.isInteger(number))) {
      error(
        diagnostics,
        'EVE-S013',
        `${name} must be ${spec.type === 'integer' ? 'an integer' : 'a number'}; received "${value}".`,
        loc,
      );
      return;
    }
    if (spec.min !== undefined && number < spec.min) {
      error(diagnostics, 'EVE-S013', `${name} must be at least ${spec.min}.`, loc);
    }
    if (spec.max !== undefined && number > spec.max) {
      error(diagnostics, 'EVE-S013', `${name} must be at most ${spec.max}.`, loc);
    }
    return;
  }
  if (spec.type === 'boolean') {
    if (parseBoolean(value) === null) {
      error(
        diagnostics,
        'EVE-S014',
        `${name} must be true or false; received "${value}".`,
        loc,
      );
    }
    return;
  }
  if (spec.type === 'color') {
    if (!isValidColor(value)) {
      error(
        diagnostics,
        'EVE-S015',
        `Invalid color "${value}" for ${name}.`,
        loc,
        'Use #RGB, #RGBA, #RRGGBB, #RRGGBBAA or transparent.',
      );
    }
    return;
  }
  if (spec.type === 'enum') {
    if (!spec.values.includes(value)) {
      error(
        diagnostics,
        'EVE-S016',
        `Invalid ${name} value "${value}".`,
        loc,
        `Allowed values: ${spec.values.join(', ')}.`,
      );
    }
    return;
  }
  if (spec.type === 'asset') {
    if (!ASSET_PATH_RE.test(value)) {
      error(
        diagnostics,
        'EVE-A002',
        `Asset path "${value}" is invalid.`,
        loc,
        'Asset paths must start with assets/ and use a supported filename.',
      );
    }
    return;
  }
  if (spec.type === 'identifier') {
    if (typeof value !== 'string' || !value.trim()) {
      error(diagnostics, 'EVE-S005', `${name} must not be empty.`, loc);
    }
  }
}

function validateApp(app, diagnostics) {
  const spec = TAG_SPECS.app;
  if (!app) return null;
  for (const required of ['width', 'height']) {
    if (!Object.prototype.hasOwnProperty.call(app.attributes, required)) {
      error(
        diagnostics,
        'EVE-S012',
        `<app> requires the ${required} attribute.`,
        app.loc,
        'Declare a positive logical resolution.',
        'document',
      );
    }
  }
  for (const [name, value] of Object.entries(app.attributes)) {
    const attrSpec = spec.attributes[name];
    if (!attrSpec) {
      error(
        diagnostics,
        'EVE-S010',
        `Unknown attribute "${name}" on <app>.`,
        app.attrLocations[name]?.loc || app.loc,
        '',
        'document',
      );
      continue;
    }
    if (attrSpec.type === 'integer') {
      const number = Number(value);
      if (!Number.isInteger(number) || number <= 0) {
        error(
          diagnostics,
          'EVE-S013',
          `app ${name} must be a positive integer.`,
          app.attrLocations[name]?.valueLoc || app.loc,
          '',
          'document',
        );
      }
    } else if (attrSpec.type === 'enum') {
      if (!attrSpec.values.includes(value)) {
        error(
          diagnostics,
          'EVE-S016',
          `Invalid scale "${value}".`,
          app.attrLocations[name]?.valueLoc || app.loc,
          `Allowed values: ${attrSpec.values.join(', ')}.`,
          'document',
        );
      }
    } else if (attrSpec.type === 'color') {
      if (!isValidColor(value)) {
        error(
          diagnostics,
          'EVE-S015',
          `Invalid application background "${value}".`,
          app.attrLocations[name]?.valueLoc || app.loc,
          '',
          'document',
        );
      }
    }
  }
  const width = Number(app.attributes.width);
  const height = Number(app.attributes.height);
  return {
    name: app.attributes.name || 'EVE App',
    width: Number.isFinite(width) && width > 0 ? width : 800,
    height: Number.isFinite(height) && height > 0 ? height : 480,
    scale: spec.attributes.scale.values.includes(app.attributes.scale)
      ? app.attributes.scale
      : 'fit',
    background: isValidColor(app.attributes.background)
      ? app.attributes.background
      : '#101820',
  };
}

function validatePageNode(page, appConfig, diagnostics) {
  const spec = TAG_SPECS.page;
  const id = page.attributes.id;
  if (!id) {
    error(
      diagnostics,
      'EVE-S005',
      '<page> requires an id.',
      page.loc,
      'Page IDs are used as navigation targets.',
      'document',
    );
  }
  for (const [name, value] of Object.entries(page.attributes)) {
    const attrSpec = spec.attributes[name];
    if (!attrSpec) {
      error(
        diagnostics,
        'EVE-S010',
        `Unknown attribute "${name}" on <page>.`,
        page.attrLocations[name]?.loc || page.loc,
        '',
        'document',
      );
      continue;
    }
    if (name === 'initial') {
      if (parseBoolean(value) === null) {
        error(
          diagnostics,
          'EVE-S014',
          `page initial must be true or false; received "${value}".`,
          page.attrLocations[name]?.valueLoc || page.loc,
          '',
          'document',
        );
      }
    } else if (name === 'width' || name === 'height') {
      const parsed = parseDimensionValue(value);
      if (!parsed || parsed.unit === '%' || parsed.value <= 0) {
        error(
          diagnostics,
          'EVE-L001',
          `Page ${name} must be a positive number of logical pixels.`,
          page.attrLocations[name]?.valueLoc || page.loc,
          'Pages cannot use percentage dimensions.',
          'layout',
        );
      }
    } else if (name === 'background') {
      if (!isValidColor(value)) {
        error(
          diagnostics,
          'EVE-S015',
          `Invalid page background "${value}".`,
          page.attrLocations[name]?.valueLoc || page.loc,
          '',
          'document',
        );
      }
    }
  }
  const parsedWidth = parseDimensionValue(page.attributes.width);
  const parsedHeight = parseDimensionValue(page.attributes.height);
  return {
    id: id || `page-${page.loc.line}`,
    node: page,
    title: page.attributes.title || id || 'Untitled Page',
    width: parsedWidth && parsedWidth.unit === 'px' && parsedWidth.value > 0 ? parsedWidth.value : appConfig.width,
    height: parsedHeight && parsedHeight.unit === 'px' && parsedHeight.value > 0 ? parsedHeight.value : appConfig.height,
    initial: parseBoolean(page.attributes.initial) === true,
    background: isValidColor(page.attributes.background) ? page.attributes.background : appConfig.background,
    loc: page.loc,
  };
}

function validateChildRules(node, diagnostics) {
  const spec = getTagSpec(node.tag);
  if (!spec) return;
  const allowed = new Set(spec.children || []);
  for (const child of node.children || []) {
    if (child.type === 'TextFragment') {
      if (node.tag !== 'text' && child.value.trim()) {
        error(
          diagnostics,
          'EVE-S004',
          `Text content is not allowed directly inside <${node.tag}>.`,
          child.loc,
          'Wrap text inside a <text> component.',
          'components',
        );
      }
      continue;
    }
    if (child.type === 'Interpolation') {
      if (node.tag !== 'text') {
        error(
          diagnostics,
          'EVE-S004',
          'Interpolation is only allowed in <text> content or dynamic attributes.',
          child.loc,
          'Use ${...} in text content or a dynamic property value.',
          'components',
        );
      }
      continue;
    }
    if (!allowed.has(child.tag)) {
      error(
        diagnostics,
        'EVE-S003',
        `Nesting violation: <${child.tag}> is not allowed inside <${node.tag}>.`,
        child.loc,
        allowed.size
          ? `<${node.tag}> may contain: ${[...allowed].map((tag) => `<${tag}>`).join(', ')}.`
          : `<${node.tag}> is a void element and cannot contain children.`,
        'components',
      );
    }
  }
}

function validateNodeAttributes(node, diagnostics) {
  const spec = getTagSpec(node.tag);
  if (!spec) return;
  for (const [name, attrSpec] of Object.entries(spec.attributes)) {
    if (attrSpec.required && !Object.prototype.hasOwnProperty.call(node.attributes, name)) {
      error(
        diagnostics,
        'EVE-S012',
        `<${node.tag}> requires the ${name} attribute.`,
        node.loc,
        `Add ${name}="..." to the opening tag.`,
      );
    }
  }
  for (const [name, value] of Object.entries(node.attributes)) {
    const attrSpec = spec.attributes[name];
    if (!attrSpec) {
      const lower = name.toLowerCase();
      const suggestion = spec.attributes[lower] ? ` Did you mean "${lower}"? Attribute names are case-sensitive.` : '';
      error(
        diagnostics,
        'EVE-S010',
        `Unknown attribute "${name}" on <${node.tag}>.${suggestion}`,
        node.attrLocations[name]?.loc || node.loc,
        '',
      );
      continue;
    }
    if (name === 'onPress') continue;
    if (containsExpression(value)) {
      if (!attrSpec.dynamic) {
        error(
          diagnostics,
          'EVE-S011',
          `Attribute "${name}" does not support dynamic expressions.`,
          node.attrLocations[name]?.valueLoc || node.loc,
          'This property is compiled as a static value.',
        );
      }
      continue;
    }
    validateStaticAttribute(node, name, attrSpec, value, diagnostics);
  }
}

function validateDynamicAttributes(node, diagnostics, registry) {
  const spec = getTagSpec(node.tag);
  if (!spec) return;
  for (const [name, value] of Object.entries(node.attributes)) {
    if (name === 'onPress') continue;
    if (!containsExpression(value)) continue;
    const attrSpec = spec.attributes[name];
    if (!attrSpec?.dynamic) continue;
    const baseLoc = node.attrLocations[name]?.valueLoc || node.loc;
    const segments = extractTemplateSegments(value, baseLoc);
    let malformed = false;
    for (const segment of segments) {
      if (segment.kind !== 'expression') continue;
      if (segment.closed === false) {
        error(
          diagnostics,
          'EVE-E001',
          `Unterminated expression in attribute "${name}".`,
          segment.startLoc || segment.loc,
          'Expressions use the form ${expression}.',
        );
        malformed = true;
      } else if (!segment.source.trim()) {
        error(
          diagnostics,
          'EVE-E002',
          `Empty expression in attribute "${name}".`,
          segment.loc,
          'Place a variable reference or expression inside ${...}.',
        );
        malformed = true;
      }
    }
    if (malformed) continue;
    registerBinding(
      node,
      name,
      segments,
      expectedTypeForAttribute(attrSpec),
      diagnostics,
      registry,
    );
  }
}

function validateActionsForNode(node, diagnostics, registry, pageIds) {
  if (node.tag !== 'button') return;
  if (!Object.prototype.hasOwnProperty.call(node.attributes, 'onPress')) return;
  const attr = node.attrLocations.onPress;
  node.actions = parseActionList(node.attributes.onPress, attr?.valueLoc || node.loc, {
    registry,
    pageIds,
    componentId: node.id || `line-${node.loc.line}`,
    diagnostics,
  });
}

function validateTextContent(node, diagnostics, registry) {
  const segments = [];
  for (const child of node.children || []) {
    if (child.type === 'TextFragment') {
      segments.push({
        kind: 'text',
        value: child.value,
        loc: child.loc,
      });
    } else if (child.type === 'Interpolation') {
      segments.push({
        kind: 'expression',
        source: child.expression,
        loc: child.loc,
        startLoc: child.startLoc || child.loc,
        closed: true,
        node: child,
      });
    } else {
      error(
        diagnostics,
        'EVE-S004',
        `<text> cannot contain the UI component <${child.tag}>.`,
        child.loc,
        'Text content can contain literal text and ${...} interpolations only.',
      );
    }
  }
  const trimmed = trimTextSegments(segments);
  if (trimmed.some((segment) => segment.kind === 'expression')) {
    const binding = registerBinding(node, 'text', trimmed, 'string', diagnostics, registry);
    node._textSegments = trimmed;
    node._textBinding = binding.id;
  } else {
    node.staticText = trimmed.map((segment) => segment.value).join('');
  }
}

function validateComponentNode(node, diagnostics, registry, pageIds) {
  if (node.type === 'Unknown') {
    const lower = node.tag.toLowerCase();
    const hint = TAG_SPECS[lower]
      ? `Tag names are case-sensitive. Did you mean <${lower}>?`
      : 'Only the documented EVE components are supported.';
    error(
      diagnostics,
      'EVE-S002',
      `Unknown component tag <${node.tag}>.`,
      node.loc,
      hint,
      'components',
    );
  }
  const spec = getTagSpec(node.tag);
  if (!spec) {
    for (const child of node.children || []) {
      if (child.type === 'TextFragment' || child.type === 'Interpolation') continue;
      validateComponentNode(child, diagnostics, registry, pageIds);
    }
    return;
  }
  if (node.tag !== 'app' && node.tag !== 'vars' && node.tag !== 'fam' && node.tag !== 'var' && node.tag !== 'page') {
    validateNodeAttributes(node, diagnostics);
    validateDynamicAttributes(node, diagnostics, registry);
    validateActionsForNode(node, diagnostics, registry, pageIds);
  }
  validateChildRules(node, diagnostics);
  if (node.tag === 'text') validateTextContent(node, diagnostics, registry);

  for (const child of node.children || []) {
    if (child.type === 'TextFragment' || child.type === 'Interpolation') continue;
    if (['vars', 'fam', 'var'].includes(child.tag)) {
      error(
        diagnostics,
        'EVE-S003',
        `<${child.tag}> is not allowed inside <${node.tag}>.`,
        child.loc,
        'Variable declarations belong inside <vars> at the app root.',
      );
      continue;
    }
    validateComponentNode(child, diagnostics, registry, pageIds);
  }
}

function collectUiChildren(node, list = []) {
  for (const child of node.children || []) {
    if (child.type === 'TextFragment' || child.type === 'Interpolation') continue;
    list.push(child);
    collectUiChildren(child, list);
  }
  return list;
}

function checkAssets(node, diagnostics, assets, registryValues, pageIds) {
  let srcValue = null;
  let srcLoc = node.attrLocations.src?.valueLoc || node.loc;
  if (node.attributes.src !== undefined && !containsExpression(node.attributes.src)) {
    srcValue = node.attributes.src;
  } else if (node._bindings) {
    const binding = node._bindings.find((candidate) => candidate.property === 'src');
    if (binding) {
      let combined = '';
      let failed = false;
      for (const segment of binding.segments) {
        if (segment.kind === 'text') combined += segment.value;
        else {
          const result = evaluateExpressionSafe(segment.ast, registryValues);
          if (result.error) {
            failed = true;
            break;
          }
          combined += result.value === null || result.value === undefined ? '' : String(result.value);
        }
      }
      if (!failed) {
        srcValue = combined;
        srcLoc = binding.loc;
      }
    }
  }
  if (node.tag === 'img' || node.tag === 'vid') {
    if (srcValue && !assets[srcValue]) {
      error(
        diagnostics,
        'EVE-A001',
        `Missing asset "${srcValue}".`,
        srcLoc,
        'Upload the asset in the Assets panel or correct the src path.',
        'assets',
      );
    }
    if (node.tag === 'vid') {
      warning(
        diagnostics,
        'EVE-H001',
        'Video is preview-only in language version 0.1 and is not supported by the embedded target.',
        node.loc,
        'The exported firmware report marks <vid> as unsupported.',
        'hardware',
      );
    }
  }
  if (srcValue && node.tag === 'img' && assets[srcValue]) {
    const asset = assets[srcValue];
    if (asset.type && !asset.type.startsWith('image/')) {
      error(
        diagnostics,
        'EVE-A001',
        `Asset "${srcValue}" is not an image.`,
        srcLoc,
        'Use an image asset for <img>.',
        'assets',
      );
    }
  }
  if (srcValue && node.tag === 'vid' && assets[srcValue]) {
    const asset = assets[srcValue];
    if (asset.type && !asset.type.startsWith('video/')) {
      error(
        diagnostics,
        'EVE-A001',
        `Asset "${srcValue}" is not a video.`,
        srcLoc,
        'Use a video asset for <vid>.',
        'assets',
      );
    }
  }
}

export function validateComponents({
  app,
  pages,
  diagnostics,
  registry,
  assets,
  pageIds,
}) {
  const registryValues = Object.fromEntries(registry.map((entry) => [entry.path, entry.initialValue]));
  const registryByPath = new Map(registry.map((entry) => [entry.path, entry]));

  for (const entry of registry) {
    if (entry.type === 'image' && typeof entry.initialValue === 'string' && !assets[entry.initialValue]) {
      error(
        diagnostics,
        'EVE-A001',
        `Missing asset "${entry.initialValue}" referenced by image variable "${entry.path}".`,
        entry.source,
        'Upload the asset or change the initial image value.',
        'assets',
      );
    }
  }

  for (const page of pages) {
    validateChildRules(page.node, diagnostics);
    for (const child of page.node.children || []) {
      if (child.type === 'TextFragment' || child.type === 'Interpolation') {
        if (child.type === 'TextFragment' && child.value.trim()) {
          error(
            diagnostics,
            'EVE-S004',
            'Text content is not allowed directly inside <page>.',
            child.loc,
            'Wrap text inside a <text> component.',
            'components',
          );
        }
        continue;
      }
      if (['vars', 'fam', 'var'].includes(child.tag)) {
        error(
          diagnostics,
          'EVE-S003',
          `<${child.tag}> is not allowed inside <page>.`,
          child.loc,
          'Variable declarations belong inside <vars> at the app root.',
          'components',
        );
        continue;
      }
      if (child.tag === 'page') {
        error(
          diagnostics,
          'EVE-S003',
          'Pages cannot be nested inside other pages.',
          child.loc,
          'Each page is a direct child of <app>.',
          'components',
        );
        continue;
      }
      validateComponentNode(child, diagnostics, registryByPath, pageIds);
    }
    for (const node of collectUiChildren(page.node)) {
      checkAssets(node, diagnostics, assets, registryValues, pageIds);
    }
  }
  return { registryValues };
}

export { validateApp, validatePageNode, validateChildRules, validateNodeAttributes, trimTextSegments };
