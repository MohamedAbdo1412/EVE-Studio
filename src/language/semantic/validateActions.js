import {
  SEVERITY,
  createLoc,
  createDiagnostic,
} from '../diagnostics.js';
import { advanceLoc } from '../expressions/expressionLexer.js';
import {
  inferExpressionType,
  parseExpression,
} from '../expressions/expressionParser.js';

const VARIABLE_PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const ACTION_NAMES = new Set(['navigate', 'back', 'set', 'toggle', 'reset']);

function splitTopLevel(text, delimiter) {
  const parts = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === delimiter && depth === 0) {
      parts.push({ text: text.slice(start, index), start });
      start = index + 1;
    }
  }
  parts.push({ text: text.slice(start), start });
  return parts;
}

function stripLoc(baseLoc, text, start, end) {
  const leading = text.slice(start, end).match(/^\s*/)?.[0].length || 0;
  const trailing = text.slice(start + leading, end).match(/\s*$/)?.[0].length || 0;
  const contentStart = start + leading;
  const contentEnd = Math.max(contentStart, end - trailing);
  return {
    content: text.slice(contentStart, contentEnd),
    start: contentStart,
    loc: advanceLoc(baseLoc, text.slice(0, contentStart)),
    endLoc: advanceLoc(baseLoc, text.slice(0, contentEnd)),
  };
}

function pushDiagnostic(diagnostics, code, message, loc, hint) {
  diagnostics.push(
    createDiagnostic({
      code,
      severity: SEVERITY.ERROR,
      message,
      loc,
      hint,
      source: 'semantic',
      stage: 'actions',
    }),
  );
}

function checkExpressionVariables(ast, registry, diagnostics, locationHint) {
  const missing = new Set();
  function visit(node) {
    if (!node) return;
    if (node.type === 'Variable') {
      if (!registry.has(node.path)) {
        missing.add(node.path);
        pushDiagnostic(
          diagnostics,
          'EVE-V001',
          `Undefined variable "${node.path}".`,
          node.loc || locationHint,
          'Declare the variable in <vars> before referencing it.',
        );
      }
    }
    if (node.type === 'Unary') visit(node.operand);
    if (node.type === 'Binary') {
      visit(node.left);
      visit(node.right);
    }
    if (node.type === 'Conditional') {
      visit(node.condition);
      visit(node.consequent);
      visit(node.alternate);
    }
    if (node.type === 'Group') visit(node.expression);
  }
  visit(ast);
  return missing;
}

function isTypeCompatible(expected, actual) {
  if (expected === actual) return true;
  if (expected === 'string' && ['color', 'image'].includes(actual)) return true;
  if (expected === 'color' && actual === 'string') return true;
  if (expected === 'image' && actual === 'string') return true;
  return false;
}

function markupReference(registry, path, componentId, property) {
  const entry = registry.get(path);
  if (!entry) return;
  if (!entry.references.some((ref) => ref.componentId === componentId && ref.property === property)) {
    entry.references.push({ componentId, property });
  }
}

/**
 * Parse and validate one onPress action list. The returned program is consumed
 * by ActionExecutor; user source is never converted into JavaScript.
 */
export function parseActionList(source, baseLoc, options) {
  const { registry, pageIds, componentId, diagnostics } = options;
  const actions = [];
  const raw = source || '';
  if (!raw.trim()) {
    pushDiagnostic(
      diagnostics,
      'EVE-A010',
      'onPress must contain at least one action.',
      baseLoc,
      "Use navigate('page'), back(), set(path, value), toggle(path) or reset(path).",
    );
    return actions;
  }

  const segments = splitTopLevel(raw, ';');
  for (const segment of segments) {
    const part = stripLoc(baseLoc, raw, segment.start, segment.start + segment.text.length);
    if (!part.content) {
      pushDiagnostic(
        diagnostics,
        'EVE-A011',
        'Empty action in onPress action list.',
        baseLoc,
        'Remove the extra semicolon or add an action.',
      );
      continue;
    }
    const match = part.content.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/);
    if (!match) {
      pushDiagnostic(
        diagnostics,
        'EVE-A012',
        `Malformed action "${part.content}".`,
        part.loc,
        "Actions use function syntax, for example navigate('home').",
      );
      continue;
    }
    const name = match[1];
    const argsRaw = match[2];
    const openParen = part.content.indexOf('(');
    const argsLoc = advanceLoc(part.loc, part.content.slice(0, openParen + 1));
    if (!ACTION_NAMES.has(name)) {
      pushDiagnostic(
        diagnostics,
        'EVE-A013',
        `Unknown EVE action "${name}".`,
        part.loc,
        'Only navigate, back, set, toggle and reset are executable.',
      );
      continue;
    }
    const args = splitTopLevel(argsRaw, ',')
      .map((arg) =>
        stripLoc(argsLoc, argsRaw, arg.start, arg.start + arg.text.length),
      )
      .filter((arg, index, list) => !(argsRaw.trim() === '' && list.length === 1 && !arg.content))
      .filter((arg) => arg.content.length > 0);

    if (name === 'navigate') {
      if (args.length !== 1) {
        pushDiagnostic(
          diagnostics,
          'EVE-A014',
          'navigate() requires exactly one page ID argument.',
          part.loc,
          "Example: navigate('settings').",
        );
        continue;
      }
      const parsed = parseExpression(args[0].content, args[0].loc);
      diagnostics.push(...parsed.diagnostics);
      if (parsed.ast?.type !== 'Literal' || typeof parsed.ast.value !== 'string') {
        pushDiagnostic(
          diagnostics,
          'EVE-A015',
          'navigate() requires a quoted page ID literal.',
          args[0].loc,
          "Page references cannot be computed at runtime in version 0.1. Use navigate('home').",
        );
        continue;
      }
      const page = parsed.ast.value;
      if (!pageIds.has(page)) {
        pushDiagnostic(
          diagnostics,
          'EVE-N001',
          `Navigation target "${page}" does not exist.`,
          args[0].loc,
          `Declared pages: ${[...pageIds].join(', ') || 'none'}.`,
        );
      }
      actions.push({ name, page, loc: part.loc, source: part.content });
      continue;
    }

    if (name === 'back') {
      if (args.length !== 0) {
        pushDiagnostic(
          diagnostics,
          'EVE-A014',
          'back() does not accept arguments.',
          part.loc,
          'Use back() to return to the previous page.',
        );
        continue;
      }
      actions.push({ name, loc: part.loc, source: part.content });
      continue;
    }

    if (name === 'set') {
      if (args.length !== 2) {
        pushDiagnostic(
          diagnostics,
          'EVE-A014',
          'set() requires exactly two arguments: a variable path and an expression.',
          part.loc,
          'Example: set(page12.room12.enabled, true).',
        );
        continue;
      }
      const path = args[0].content;
      if (!VARIABLE_PATH_RE.test(path)) {
        pushDiagnostic(
          diagnostics,
          'EVE-A016',
          `Invalid variable path "${path}" in set().`,
          args[0].loc,
          'The first argument must be a declared dot-separated variable path without quotes.',
        );
        continue;
      }
      const entry = registry.get(path);
      if (!entry) {
        pushDiagnostic(
          diagnostics,
          'EVE-V001',
          `Undefined variable "${path}".`,
          args[0].loc,
          'Declare the variable in <vars> before assigning it.',
        );
        continue;
      }
      const parsed = parseExpression(args[1].content, args[1].loc);
      diagnostics.push(...parsed.diagnostics);
      checkExpressionVariables(parsed.ast, registry, diagnostics, args[1].loc);
      const actualType = inferExpressionType(parsed.ast, registry);
      if (!isTypeCompatible(entry.type, actualType)) {
        pushDiagnostic(
          diagnostics,
          'EVE-V002',
          `Type mismatch in set(${path}, ...). Expected ${entry.type}, received ${actualType}.`,
          args[1].loc,
          `Assign a value compatible with the ${entry.type} variable type.`,
        );
      }
      for (const dependency of parsed.dependencies || []) {
        markupReference(registry, dependency, componentId, 'onPress');
      }
      actions.push({
        name,
        path,
        expression: parsed.ast,
        expressionSource: args[1].content,
        loc: part.loc,
        source: part.content,
      });
      continue;
    }

    if (name === 'toggle' || name === 'reset') {
      if (args.length !== 1) {
        pushDiagnostic(
          diagnostics,
          'EVE-A014',
          `${name}() requires exactly one variable path argument.`,
          part.loc,
          `Example: ${name}(page12.room12.enabled).`,
        );
        continue;
      }
      const path = args[0].content;
      if (!VARIABLE_PATH_RE.test(path)) {
        pushDiagnostic(
          diagnostics,
          'EVE-A016',
          `Invalid variable path "${path}" in ${name}().`,
          args[0].loc,
          'Use a declared dot-separated variable path without quotes.',
        );
        continue;
      }
      const entry = registry.get(path);
      if (!entry) {
        pushDiagnostic(
          diagnostics,
          'EVE-V001',
          `Undefined variable "${path}".`,
          args[0].loc,
          'Declare the variable in <vars> before using it in an action.',
        );
        continue;
      }
      if (name === 'toggle' && entry.type !== 'boolean') {
        pushDiagnostic(
          diagnostics,
          'EVE-V002',
          `toggle() requires a boolean variable; "${path}" is ${entry.type}.`,
          args[0].loc,
          'Use set() to assign non-boolean variables.',
        );
      }
      markupReference(registry, path, componentId, 'onPress');
      actions.push({ name, path, loc: part.loc, source: part.content });
    }
  }

  return actions;
}

export function createActionDiagnosticContext(registryArray, pageIds, componentId, diagnostics) {
  return {
    registry: new Map(registryArray.map((entry) => [entry.path, entry])),
    pageIds,
    componentId,
    diagnostics,
  };
}

export { ACTION_NAMES, VARIABLE_PATH_RE, checkExpressionVariables, isTypeCompatible, splitTopLevel };
