import {
  SEVERITY,
  createDiagnostic,
  createLoc,
} from '../diagnostics.js';
import {
  VARIABLE_SEGMENT_RE,
  VARIABLE_TYPES,
  isValidColor,
} from '../languageSpec.js';

export function hashVariablePath(path) {
  // FNV-1a 32-bit. Stable across recompilation and independent of declaration order.
  let hash = 0x811c9dc5;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function parseVariableValue(type, raw) {
  if (raw === undefined || raw === null) {
    return { ok: false, message: 'A variable must declare an initial value.' };
  }
  const text = String(raw).trim();
  if (type === 'string') {
    return { ok: true, value: String(raw) };
  }
  if (type === 'number') {
    if (!/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
      return { ok: false, message: `Initial value "${raw}" is not a finite number.` };
    }
    const value = Number(text);
    if (!Number.isFinite(value)) {
      return { ok: false, message: `Initial value "${raw}" is not a finite number.` };
    }
    return { ok: true, value };
  }
  if (type === 'boolean') {
    if (text === 'true') return { ok: true, value: true };
    if (text === 'false') return { ok: true, value: false };
    return { ok: false, message: `Boolean variables must use "true" or "false", received "${raw}".` };
  }
  if (type === 'color') {
    if (!isValidColor(text)) {
      return {
        ok: false,
        message: `Color "${raw}" is invalid. Use #RGB, #RGBA, #RRGGBB, #RRGGBBAA or transparent.`,
      };
    }
    return { ok: true, value: text };
  }
  if (type === 'image') {
    if (!text) return { ok: false, message: 'Image variables require an asset path value.' };
    return { ok: true, value: text };
  }
  return { ok: false, message: `Unsupported variable type "${type}".` };
}

function valueDescription(entry) {
  return `${entry.path} (${entry.type})`;
}

/**
 * Build the app-wide variable registry. Families create dot-separated paths and
 * each variable receives a deterministic numeric ID derived from its full path.
 */
export function buildVariableRegistry(ast, diagnostics) {
  const nodes = ast?.children || [];
  const varsNodes = nodes.filter((node) => node.tag === 'vars');
  const registry = [];
  const byPath = new Map();
  const idOwners = new Map();
  const familyPaths = new Set();

  if (varsNodes.length > 1) {
    for (const extra of varsNodes.slice(1)) {
      diagnostics.push(
        createDiagnostic({
          code: 'EVE-S006',
          severity: SEVERITY.ERROR,
          message: 'An application may contain at most one <vars> block.',
          loc: extra.loc,
          hint: 'Merge all variable declarations into a single <vars> element.',
          source: 'semantic',
          stage: 'variables',
        }),
      );
    }
  }
  const varsNode = varsNodes[0];
  if (!varsNode) return { registry, byPath, declared: false };

  const addVariable = (node, familyPath) => {
    const name = node.attributes.name;
    const type = node.attributes.type;
    const rawValue = node.attributes.value;
    const loc = node.attrLocations.name?.valueLoc || node.loc;
    let valid = true;

    if (!name) {
      diagnostics.push(
        createDiagnostic({
          code: 'EVE-V003',
          severity: SEVERITY.ERROR,
          message: '<var> requires a name attribute.',
          loc: node.loc,
          hint: 'Add name="temperature" to the variable declaration.',
          source: 'semantic',
          stage: 'variables',
        }),
      );
      valid = false;
    } else if (!VARIABLE_SEGMENT_RE.test(name)) {
      diagnostics.push(
        createDiagnostic({
          code: 'EVE-V003',
          severity: SEVERITY.ERROR,
          message: `Invalid variable name "${name}".`,
          loc,
          hint: 'Variable names use letters, digits and underscores, and cannot start with a digit.',
          source: 'semantic',
          stage: 'variables',
        }),
      );
      valid = false;
    }

    if (!type) {
      diagnostics.push(
        createDiagnostic({
          code: 'EVE-V004',
          severity: SEVERITY.ERROR,
          message: '<var> requires a type attribute.',
          loc: node.loc,
          hint: `Supported types: ${VARIABLE_TYPES.join(', ')}.`,
          source: 'semantic',
          stage: 'variables',
        }),
      );
      valid = false;
    } else if (!VARIABLE_TYPES.includes(type)) {
      diagnostics.push(
        createDiagnostic({
          code: 'EVE-V004',
          severity: SEVERITY.ERROR,
          message: `Unknown variable type "${type}".`,
          loc: node.attrLocations.type?.valueLoc || node.loc,
          hint: `Supported types: ${VARIABLE_TYPES.join(', ')}.`,
          source: 'semantic',
          stage: 'variables',
        }),
      );
      valid = false;
    }

    let initialValue = rawValue;
    if (rawValue === undefined) {
      diagnostics.push(
        createDiagnostic({
          code: 'EVE-V005',
          severity: SEVERITY.ERROR,
          message: `Variable "${familyPath ? `${familyPath}.` : ''}${name || '?'}" requires an initial value.`,
          loc: node.loc,
          hint: 'Add value="..." to the <var> declaration.',
          source: 'semantic',
          stage: 'variables',
        }),
      );
      valid = false;
    } else if (type && VARIABLE_TYPES.includes(type)) {
      const parsed = parseVariableValue(type, rawValue);
      if (!parsed.ok) {
        diagnostics.push(
          createDiagnostic({
            code: 'EVE-V005',
            severity: SEVERITY.ERROR,
            message: parsed.message,
            loc: node.attrLocations.value?.valueLoc || node.loc,
            hint: `Initial values must match the declared ${type} type.`,
            source: 'semantic',
            stage: 'variables',
          }),
        );
        valid = false;
      } else {
        initialValue = parsed.value;
      }
    }

    if (!name || !type) return;

    const path = familyPath ? `${familyPath}.${name}` : name;
    if (byPath.has(path)) {
      diagnostics.push(
        createDiagnostic({
          code: 'EVE-V006',
          severity: SEVERITY.ERROR,
          message: `Duplicate variable path "${path}".`,
          loc: node.attrLocations.name?.valueLoc || node.loc,
          hint: `"${path}" was already declared at line ${byPath.get(path).source.line}.`,
          source: 'semantic',
          stage: 'variables',
        }),
      );
      return;
    }
    if (familyPaths.has(path)) {
      diagnostics.push(
        createDiagnostic({
          code: 'EVE-V006',
          severity: SEVERITY.ERROR,
          message: `Variable "${path}" conflicts with a family namespace of the same name.`,
          loc,
          hint: 'Choose a different variable or family name.',
          source: 'semantic',
          stage: 'variables',
        }),
      );
      return;
    }

    let id = hashVariablePath(path);
    if (id === 0 || idOwners.has(id)) {
      id = (id + 1) >>> 0 || 1;
      while (idOwners.has(id)) id = (id + 1) >>> 0 || 1;
    }
    idOwners.set(id, path);

    const entry = {
      path,
      name,
      type,
      initialValue,
      currentValue: initialValue,
      id,
      source: node.loc,
      node,
      references: [],
      valid: valid && type && VARIABLE_TYPES.includes(type),
    };
    registry.push(entry);
    byPath.set(path, entry);
    node.variablePath = path;
    node.variableId = id;
  };

  const visitScope = (parent, familyPath) => {
    const siblingNames = new Set();
    const varNames = new Set();
    for (const child of parent.children || []) {
      if (child.type === 'TextFragment' || child.type === 'Interpolation') continue;
      if (child.type === 'Fam') {
        const name = child.attributes.name;
        if (!name) {
          diagnostics.push(
            createDiagnostic({
              code: 'EVE-V003',
              severity: SEVERITY.ERROR,
              message: '<fam> requires a name attribute.',
              loc: child.loc,
              hint: 'Add name="room12" to the family declaration.',
              source: 'semantic',
              stage: 'variables',
            }),
          );
          continue;
        }
        if (!VARIABLE_SEGMENT_RE.test(name)) {
          diagnostics.push(
            createDiagnostic({
              code: 'EVE-V003',
              severity: SEVERITY.ERROR,
              message: `Invalid family name "${name}".`,
              loc: child.attrLocations.name?.valueLoc || child.loc,
              hint: 'Family names use letters, digits and underscores, and cannot start with a digit.',
              source: 'semantic',
              stage: 'variables',
            }),
          );
        }
        if (siblingNames.has(name) || varNames.has(name)) {
          diagnostics.push(
            createDiagnostic({
              code: 'EVE-V006',
              severity: SEVERITY.ERROR,
              message: `Duplicate family name "${name}" in the same namespace.`,
              loc: child.attrLocations.name?.valueLoc || child.loc,
              hint: 'Family names must be unique among siblings.',
              source: 'semantic',
              stage: 'variables',
            }),
          );
          continue;
        }
        siblingNames.add(name);
        const path = familyPath ? `${familyPath}.${name}` : name;
        familyPaths.add(path);
        child.variablePath = path;
        visitScope(child, path);
      } else if (child.type === 'Var') {
        if (child.attributes.name) varNames.add(child.attributes.name);
        addVariable(child, familyPath);
      }
    }
  };

  visitScope(varsNode, '');
  return { registry, byPath, varsNode, declared: true };
}

export function formatVariableReference(entry) {
  return valueDescription(entry);
}
