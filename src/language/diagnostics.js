/**
 * Diagnostic objects are shared by every stage of the EVE toolchain.
 * Positions are 1-based: line 1, column 1 is the first character in the file.
 */

export const SEVERITY = Object.freeze({
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
});

export function createLoc(line = 1, column = 1, offset = 0, endLine = line, endColumn = column) {
  return { line, column, offset, endLine, endColumn };
}

export function createDiagnostic({
  code,
  severity = SEVERITY.ERROR,
  message,
  loc,
  hint,
  source = 'compiler',
  stage = 'general',
}) {
  const at = loc || createLoc();
  return {
    code,
    severity,
    message,
    line: at.line,
    column: at.column,
    offset: at.offset ?? 0,
    endLine: at.endLine ?? at.line,
    endColumn: at.endColumn ?? at.column,
    hint: hint || '',
    source,
    stage,
  };
}

export function diagnosticKey(diagnostic) {
  return `${diagnostic.code}:${diagnostic.line}:${diagnostic.column}:${diagnostic.message}`;
}

export function sortDiagnostics(diagnostics) {
  return [...diagnostics].sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    return a.code.localeCompare(b.code);
  });
}

export function countDiagnostics(diagnostics) {
  return diagnostics.reduce(
    (counts, diagnostic) => {
      counts[diagnostic.severity] = (counts[diagnostic.severity] || 0) + 1;
      return counts;
    },
    { error: 0, warning: 0, info: 0 },
  );
}

export function hasErrors(diagnostics) {
  return diagnostics.some((diagnostic) => diagnostic.severity === SEVERITY.ERROR);
}

export function formatDiagnostic(diagnostic) {
  return `${diagnostic.code}: ${diagnostic.message}`;
}

/**
 * Convert a source offset into a 1-based line/column location. The line start
 * table can be cached by callers that need many conversions.
 */
export function buildLineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

export function offsetToLoc(offset, lineStarts) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) low = mid + 1;
    else high = mid - 1;
  }
  const lineIndex = Math.max(0, high);
  return createLoc(lineIndex + 1, offset - lineStarts[lineIndex] + 1, offset);
}

export function locFromSourceRange(lineStarts, line, column, length = 1) {
  const offset = (lineStarts[line - 1] || 0) + Math.max(0, column - 1);
  return offsetToLoc(offset + Math.max(0, length - 1), lineStarts);
}
