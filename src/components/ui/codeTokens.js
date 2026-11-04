export const CODE_TOKEN_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#\w+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d+(?:\.\d+)?(?:[uUfF]|ll|LL)?\b|\b[A-Za-z_]\w*\b|::|->|\s+|\S)/g;

const KEYWORDS = new Set([
  'class',
  'struct',
  'public',
  'private',
  'protected',
  'virtual',
  'static',
  'const',
  'constexpr',
  'explicit',
  'return',
  'if',
  'else',
  'for',
  'while',
  'namespace',
  'using',
  'void',
  'bool',
  'float',
  'double',
  'uint8_t',
  'uint16_t',
  'uint32_t',
  'size_t',
  'char',
  'auto',
  'typename',
]);

export function classifyCodeToken(token) {
  if (token.startsWith('//') || token.startsWith('/*')) return 'comment';
  if (token.startsWith('#')) return 'preprocessor';
  if (token.startsWith('"') || token.startsWith("'")) return 'string';
  if (/^\d/.test(token)) return 'number';
  if (KEYWORDS.has(token)) return 'keyword';
  if (token === '::' || token === '->') return 'operator';
  return 'plain';
}

export function tokenizeCodeLine(line) {
  return String(line).match(CODE_TOKEN_RE) || [''];
}
