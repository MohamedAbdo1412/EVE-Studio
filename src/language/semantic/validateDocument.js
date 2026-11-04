import {
  SEVERITY,
  createDiagnostic,
  createLoc,
} from '../diagnostics.js';
import {
  IDENTIFIER_RE,
  TAG_SPECS,
  getTagSpec,
} from '../languageSpec.js';
import { buildVariableRegistry } from './validateVariables.js';
import {
  validateApp,
  validateComponents,
  validatePageNode,
  validateChildRules,
} from './validateComponents.js';

function error(diagnostics, code, message, loc, hint = '', stage = 'document') {
  diagnostics.push(
    createDiagnostic({
      code,
      severity: SEVERITY.ERROR,
      message,
      loc,
      hint,
      source: 'semantic',
      stage,
    }),
  );
}

function info(diagnostics, code, message, loc, hint = '', stage = 'document') {
  diagnostics.push(
    createDiagnostic({
      code,
      severity: SEVERITY.INFO,
      message,
      loc,
      hint,
      source: 'semantic',
      stage,
    }),
  );
}

function walkNodes(node, visitor) {
  if (!node) return;
  visitor(node);
  for (const child of node.children || []) {
    if (child.type === 'TextFragment' || child.type === 'Interpolation') continue;
    walkNodes(child, visitor);
  }
}

function validateIdNode(node, idRegistry, diagnostics) {
  const id = node.attributes.id;
  if (id === undefined || id === null || String(id).trim() === '') {
    error(
      diagnostics,
      'EVE-S005',
      `<${node.tag}> requires a unique id.`,
      node.loc,
      'Add an id attribute for selection, bindings and inspector tooling.',
      'components',
    );
    return;
  }
  if (String(id).includes('${')) {
    error(
      diagnostics,
      'EVE-S011',
      `Component id cannot be dynamic (${id}).`,
      node.attrLocations.id?.valueLoc || node.loc,
      'IDs are static, compile-time identifiers.',
      'components',
    );
    return;
  }
  if (!IDENTIFIER_RE.test(String(id))) {
    error(
      diagnostics,
      'EVE-S017',
      `Invalid component id "${id}".`,
      node.attrLocations.id?.valueLoc || node.loc,
      'IDs start with a letter or underscore and may contain letters, digits, underscores and hyphens.',
      'components',
    );
  }
  const key = String(id);
  if (idRegistry.has(key)) {
    const first = idRegistry.get(key);
    error(
      diagnostics,
      'EVE-S001',
      `Duplicate component ID "${key}".`,
      node.attrLocations.id?.valueLoc || node.loc,
      `The ID was first declared at line ${first.line}, column ${first.column}. IDs are unique across pages and components.`,
      'components',
    );
  } else {
    idRegistry.set(key, node.attrLocations.id?.valueLoc || node.loc);
  }
}

function validateVariableStructure(varsNode, diagnostics) {
  if (!varsNode) return;
  const checkNode = (node) => {
    if (node.type === 'TextFragment') {
      if (node.value.trim()) {
        error(
          diagnostics,
          'EVE-S004',
          'Text content is not allowed inside variable declarations.',
          node.loc,
          '',
          'variables',
        );
      }
      return;
    }
    if (node.type === 'Interpolation') {
      error(
        diagnostics,
        'EVE-S004',
        'Expressions are not allowed in variable declarations.',
        node.loc,
        '',
        'variables',
      );
      return;
    }
    if (node.type === 'Unknown') {
      error(
        diagnostics,
        'EVE-S002',
        `Unknown component tag <${node.tag}>.`,
        node.loc,
        'Variable blocks may only contain <fam> and <var>.',
        'variables',
      );
      return;
    }
    const spec = getTagSpec(node.tag);
    if (!spec) return;
    if (node.tag === 'page') {
      error(
        diagnostics,
        'EVE-S003',
        '<page> is not allowed inside <vars>.',
        node.loc,
        'Pages are direct children of <app>.',
        'variables',
      );
      return;
    }
    if (!['vars', 'fam', 'var'].includes(node.tag)) {
      error(
        diagnostics,
        'EVE-S003',
        `<${node.tag}> is not allowed inside variable declarations.`,
        node.loc,
        'Variable blocks may only contain <fam> and <var>.',
        'variables',
      );
      return;
    }
    for (const [name] of Object.entries(node.attributes)) {
      if (!spec.attributes[name]) {
        error(
          diagnostics,
          'EVE-S010',
          `Unknown attribute "${name}" on <${node.tag}>.`,
          node.attrLocations[name]?.loc || node.loc,
          '',
          'variables',
        );
      }
    }
    if (node.tag === 'var' && node.children?.some((child) => child.type !== 'TextFragment' && child.type !== 'Interpolation')) {
      error(
        diagnostics,
        'EVE-S003',
        '<var> cannot contain child elements.',
        node.loc,
        'A variable is a single declaration.',
        'variables',
      );
    }
    for (const child of node.children || []) checkNode(child);
  };
  for (const child of varsNode.children || []) checkNode(child);
}

export function validateDocument(ast, options = {}) {
  const diagnostics = [];
  const assets = options.assets || {};
  if (!ast) {
    return {
      diagnostics,
      registry: [],
      registryMap: new Map(),
      pages: [],
      appConfig: {
        name: 'EVE App',
        width: 800,
        height: 480,
        scale: 'fit',
        background: '#101820',
      },
      initialPage: null,
      pageIds: new Set(),
      valid: false,
    };
  }

  if (ast.tag !== 'app') {
    error(
      diagnostics,
      'EVE-S008',
      `The document root must be <app>; received <${ast.tag}>.`,
      ast.loc,
      'EVE documents have exactly one <app> root.',
      'document',
    );
  }

  const appConfig = validateApp(ast, diagnostics) || {
    name: 'EVE App',
    width: 800,
    height: 480,
    scale: 'fit',
    background: '#101820',
  };

  const varsNodes = [];
  const pageNodes = [];
  for (const child of ast.children || []) {
    if (child.type === 'TextFragment') {
      if (child.value.trim()) {
        error(
          diagnostics,
          'EVE-S004',
          'Text content is not allowed directly inside <app>.',
          child.loc,
          'Place UI components inside a <page>.',
          'document',
        );
      }
      continue;
    }
    if (child.type === 'Interpolation') {
      error(
        diagnostics,
        'EVE-S004',
        'Interpolation is not allowed directly inside <app>.',
        child.loc,
        '',
        'document',
      );
      continue;
    }
    if (child.type === 'Unknown') {
      const lower = child.tag.toLowerCase();
      error(
        diagnostics,
        'EVE-S002',
        `Unknown component tag <${child.tag}>.`,
        child.loc,
        TAG_SPECS[lower]
          ? `Tag names are case-sensitive. Did you mean <${lower}>?`
          : 'Only <vars> and <page> are allowed at the application root.',
        'document',
      );
      continue;
    }
    if (child.tag === 'vars') {
      varsNodes.push(child);
      continue;
    }
    if (child.tag === 'page') {
      pageNodes.push(child);
      continue;
    }
    error(
      diagnostics,
      'EVE-S003',
      `<${child.tag}> is not allowed directly inside <app>.`,
      child.loc,
      'The app root may contain one optional <vars> block followed by one or more <page> elements.',
      'document',
    );
  }

  if (pageNodes.length === 0) {
    error(
      diagnostics,
      'EVE-S008',
      'An application without pages is invalid.',
      ast.loc,
      'Add at least one <page id="..."> element.',
      'document',
    );
  }

  if (!varsNodes.length && ast.children) {
    // A vars block is optional; components may simply be static.
  }
  const varsNode = varsNodes[0];
  if (varsNode) {
    validateChildRules(varsNode, diagnostics);
    validateVariableStructure(varsNode, diagnostics);
  }
  const { registry, byPath } = buildVariableRegistry(ast, diagnostics);
  const registryMap = byPath;

  const idRegistry = new Map();
  const pages = [];
  let initialCount = 0;
  for (const pageNode of pageNodes) {
    const page = validatePageNode(pageNode, appConfig, diagnostics);
    if (page.initial) initialCount += 1;
    if (pageNode.attributes.id) {
      validateIdNode(pageNode, idRegistry, diagnostics);
    }
    pages.push(page);
  }

  if (initialCount > 1) {
    for (const page of pages.filter((candidate) => candidate.initial).slice(1)) {
      error(
        diagnostics,
        'EVE-S007',
        `Multiple pages declare initial="true" (including "${page.id}").`,
        page.node.attrLocations.initial?.valueLoc || page.loc,
        'Exactly one page may be the initial destination.',
        'document',
      );
    }
  }
  let initialPage = pages.find((page) => page.initial);
  if (!initialPage && pages.length > 0) {
    initialPage = pages[0];
    initialPage.initial = true;
    info(
      diagnostics,
      'EVE-S020',
      `No initial page was declared; using the first page "${pages[0].id}".`,
      pages[0].loc,
      'Declare initial="true" on exactly one page to make the choice explicit.',
      'document',
    );
  }

  for (const page of pages) {
    walkNodes(page.node, (node) => {
      if (node === page.node) return;
      if (['var', 'fam', 'vars'].includes(node.tag)) return;
      if (node.type === 'Unknown') return;
      if (getTagSpec(node.tag)) {
        validateIdNode(node, idRegistry, diagnostics);
      }
    });
  }

  const pageIds = new Set(pages.map((page) => page.id));
  validateComponents({
    app: ast,
    pages,
    diagnostics,
    registry,
    assets,
    pageIds,
  });

  const valid = !diagnostics.some((diagnostic) => diagnostic.severity === SEVERITY.ERROR);
  return {
    diagnostics,
    registry,
    registryMap,
    pages,
    appConfig,
    initialPage: initialPage ? initialPage.id : null,
    pageIds,
    varsNode,
    idRegistry,
    valid,
  };
}

export { validateVariableStructure, validateIdNode, walkNodes };
