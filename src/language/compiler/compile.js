import { parse } from '../parser.js';
import {
  countDiagnostics,
  hasErrors,
  sortDiagnostics,
  diagnosticKey,
  SEVERITY,
} from '../diagnostics.js';
import { validateDocument } from '../semantic/validateDocument.js';
import { buildBindings } from './buildBindings.js';
import { resolveLayout } from './resolveLayout.js';
import { buildAssetManifest } from './buildAssetManifest.js';
import { generateCpp } from './generateCpp.js';
import { LANGUAGE_VERSION, COMPILER_VERSION } from '../languageSpec.js';

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function hashSource(source) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function dedupeDiagnostics(diagnostics) {
  const seen = new Set();
  return diagnostics.filter((diagnostic) => {
    const key = diagnosticKey(diagnostic);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Full browser-side compilation pipeline:
 * lexer/parser -> AST -> semantic validation -> bindings -> layout -> assets ->
 * C++ API. Every consumer of the language goes through this function.
 */
export function compile(source, options = {}) {
  const started = now();
  const assets = options.assets || {};
  const diagnostics = [];
  const parseStarted = now();
  const parsed = parse(source);
  const parseDuration = now() - parseStarted;
  diagnostics.push(...parsed.diagnostics);
  const ast = parsed.ast;

  const semanticStarted = now();
  const validation = validateDocument(ast, { assets });
  diagnostics.push(...validation.diagnostics);
  const semanticDuration = now() - semanticStarted;

  const bindings = buildBindings(ast, validation.pages);
  const layout = resolveLayout({
    appConfig: validation.appConfig,
    pages: validation.pages,
    bindings,
    registry: validation.registry,
  });
  const assetManifest = buildAssetManifest({
    assets,
    ast,
    scene: layout.scene,
    registry: validation.registry,
    bindings,
  });
  const cpp = generateCpp({
    appConfig: validation.appConfig,
    registry: validation.registry,
    diagnostics,
  });

  const sorted = sortDiagnostics(dedupeDiagnostics(diagnostics));
  const counts = countDiagnostics(sorted);
  const valid = !hasErrors(sorted);
  const durationMs = Math.round((now() - started) * 10) / 10;
  const parseFailed = parsed.diagnostics.some((diagnostic) => diagnostic.severity === SEVERITY.ERROR);
  const semanticFailed = validation.diagnostics.some((diagnostic) => diagnostic.severity === SEVERITY.ERROR);
  const missingAssetCount = assetManifest.missing.length;

  const report = {
    compilerVersion: COMPILER_VERSION,
    languageVersion: LANGUAGE_VERSION,
    sourceHash: hashSource(source),
    durationMs,
    status: counts.error > 0 ? 'error' : counts.warning > 0 ? 'warning' : 'success',
    counts,
    stages: [
      {
        id: 'parse',
        name: 'Lexer + Parser',
        status: parseFailed ? 'error' : 'success',
        durationMs: Math.round(parseDuration * 10) / 10,
        detail: ast
          ? `${validation.pages.length || 0} page node${validation.pages.length === 1 ? '' : 's'}, ${parsed.roots?.length || 0} root element${parsed.roots?.length === 1 ? '' : 's'}`
          : 'No root AST produced',
      },
      {
        id: 'semantic',
        name: 'Semantic analysis',
        status: semanticFailed ? 'error' : 'success',
        detail: `${validation.registry.length} variables, ${sorted.filter((item) => item.severity === SEVERITY.ERROR).length} errors`,
      },
      {
        id: 'layout',
        name: 'Layout resolution',
        status: 'success',
        detail: `${layout.stats.pages} pages, ${layout.stats.components} components`,
      },
      {
        id: 'bindings',
        name: 'Binding extraction',
        status: 'success',
        detail: `${bindings.bindings.length} dynamic properties, ${bindings.dependencyIndex.size} dependencies`,
      },
      {
        id: 'assets',
        name: 'Asset processing',
        status: missingAssetCount ? 'warning' : 'success',
        detail: `${assetManifest.summary.total} registered, ${missingAssetCount} missing`,
      },
      {
        id: 'codegen',
        name: 'C++ API generation',
        status: 'success',
        detail: `${cpp.methods.length} setters, class ${cpp.className}`,
      },
    ],
    hardware: {
      fpgaBitstream: false,
      physicalRendering: false,
      video: false,
      spiTransport: false,
      notes: [
        'Browser preview only; no FPGA or HDMI pipeline is simulated.',
        'Generated C++ is a transport-independent API draft.',
        'Asset conversion manifests describe intended processing, not completed FPGA bitstream assets.',
      ],
    },
    warnings: sorted.filter((diagnostic) => diagnostic.severity === SEVERITY.WARNING),
    infos: sorted.filter((diagnostic) => diagnostic.severity === SEVERITY.INFO),
    errorCount: counts.error,
    warningCount: counts.warning,
  };

  return {
    source,
    ast,
    diagnostics: sorted,
    counts,
    valid,
    parseFailed,
    semanticFailed,
    registry: validation.registry,
    registryMap: validation.registryMap,
    pages: validation.pages,
    appConfig: validation.appConfig,
    initialPage: validation.initialPage,
    pageIds: validation.pageIds,
    bindings,
    scene: layout.scene,
    layoutStats: layout.stats,
    assetManifest,
    cpp,
    report,
    durationMs,
  };
}

export { hashSource, dedupeDiagnostics };
