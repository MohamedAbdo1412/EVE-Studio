import {
  SEVERITY,
  createDiagnostic,
  createLoc,
} from '../diagnostics.js';

export const EXPRESSION_TOKEN_TYPES = Object.freeze({
  NUMBER: 'number',
  STRING: 'string',
  IDENTIFIER: 'identifier',
  OPERATOR: 'operator',
  PUNCTUATION: 'punctuation',
  KEYWORD: 'keyword',
  EOF: 'eof',
});

const TWO_CHAR_OPERATORS = ['==', '!=', '<=', '>=', '&&', '||'];
const ONE_CHAR_OPERATORS = ['+', '-', '*', '/', '%', '<', '>', '!'];
const PUNCTUATION = ['(', ')', '?', ':'];

export function advanceLoc(loc, text) {
  let line = loc.line;
  let column = loc.column;
  let offset = loc.offset || 0;
  for (const char of text) {
    offset += 1;
    if (char === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return createLoc(line, column, offset);
}

function isIdentifierStart(char) {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char) {
  return /[A-Za-z0-9_]/.test(char);
}

function isDigit(char) {
  return /[0-9]/.test(char);
}

function diagnostic(code, message, loc, hint = '') {
  return createDiagnostic({
    code,
    severity: SEVERITY.ERROR,
    message,
    loc,
    hint,
    source: 'expression',
    stage: 'expression',
  });
}

export class ExpressionLexer {
  constructor(source, baseLoc = createLoc()) {
    this.source = source || '';
    this.baseLoc = baseLoc;
    this.index = 0;
    this.loc = { ...baseLoc };
    this.tokens = [];
    this.diagnostics = [];
  }

  peek(offset = 0) {
    return this.source[this.index + offset] || '';
  }

  advance(count = 1) {
    for (let step = 0; step < count; step += 1) {
      const char = this.source[this.index];
      if (char === undefined) return;
      this.index += 1;
      if (char === '\n') {
        this.loc.line += 1;
        this.loc.column = 1;
      } else {
        this.loc.column += 1;
      }
      this.loc.offset += 1;
    }
  }

  tokenLoc() {
    return createLoc(this.loc.line, this.loc.column, this.loc.offset);
  }

  push(type, value, loc, extra = {}) {
    this.tokens.push({ type, value, loc, endLoc: this.tokenLoc(), ...extra });
  }

  error(code, message, loc, hint = '') {
    this.diagnostics.push(diagnostic(code, message, loc, hint));
  }

  readNumber() {
    const start = this.index;
    const loc = this.tokenLoc();
    while (isDigit(this.peek())) this.advance();
    if (this.peek() === '.') {
      this.advance();
      while (isDigit(this.peek())) this.advance();
    }
    if (this.peek() === 'e' || this.peek() === 'E') {
      this.advance();
      if (this.peek() === '+' || this.peek() === '-') this.advance();
      while (isDigit(this.peek())) this.advance();
    }
    const raw = this.source.slice(start, this.index);
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      this.error('EVE-E006', `Invalid numeric literal "${raw}".`, loc);
    }
    this.push(EXPRESSION_TOKEN_TYPES.NUMBER, value, loc, { raw });
  }

  readString() {
    const quote = this.peek();
    const loc = this.tokenLoc();
    this.advance();
    let value = '';
    let closed = false;
    while (this.index < this.source.length) {
      const char = this.peek();
      if (char === quote) {
        this.advance();
        closed = true;
        break;
      }
      if (char === '\\') {
        this.advance();
        const escaped = this.peek();
        if (escaped === undefined) break;
        if (escaped === 'n') value += '\n';
        else if (escaped === 't') value += '\t';
        else if (escaped === 'r') value += '\r';
        else if (escaped === '\\') value += '\\';
        else if (escaped === quote) value += quote;
        else value += escaped;
        this.advance();
        continue;
      }
      value += char;
      this.advance();
    }
    if (!closed) {
      this.error(
        'EVE-E004',
        'Unterminated string literal in expression.',
        loc,
        'Add a matching quote character.',
      );
    }
    this.push(EXPRESSION_TOKEN_TYPES.STRING, value, loc, { closed });
  }

  readIdentifier() {
    const loc = this.tokenLoc();
    let value = '';
    while (isIdentifierPart(this.peek())) {
      value += this.peek();
      this.advance();
    }
    while (this.peek() === '.') {
      this.advance();
      value += '.';
      if (!isIdentifierStart(this.peek())) {
        this.error(
          'EVE-E007',
          'Expected a variable or family name after ".".',
          this.tokenLoc(),
          'Variable paths look like family.name or family.subfamily.name.',
        );
        break;
      }
      while (isIdentifierPart(this.peek())) {
        value += this.peek();
        this.advance();
      }
    }
    if (value === 'true' || value === 'false' || value === 'null') {
      this.push(EXPRESSION_TOKEN_TYPES.KEYWORD, value, loc);
    } else {
      this.push(EXPRESSION_TOKEN_TYPES.IDENTIFIER, value, loc);
    }
  }

  tokenize() {
    while (this.index < this.source.length) {
      const char = this.peek();
      if (/\s/.test(char)) {
        this.advance();
        continue;
      }
      if (char === '"' || char === "'") {
        this.readString();
        continue;
      }
      if (isDigit(char) || (char === '.' && isDigit(this.peek(1)))) {
        this.readNumber();
        continue;
      }
      if (isIdentifierStart(char)) {
        this.readIdentifier();
        continue;
      }
      const two = this.source.slice(this.index, this.index + 2);
      if (TWO_CHAR_OPERATORS.includes(two)) {
        const loc = this.tokenLoc();
        this.advance(2);
        this.push(EXPRESSION_TOKEN_TYPES.OPERATOR, two, loc);
        continue;
      }
      if (ONE_CHAR_OPERATORS.includes(char)) {
        const loc = this.tokenLoc();
        this.advance();
        this.push(EXPRESSION_TOKEN_TYPES.OPERATOR, char, loc);
        continue;
      }
      if (PUNCTUATION.includes(char)) {
        const loc = this.tokenLoc();
        this.advance();
        this.push(EXPRESSION_TOKEN_TYPES.PUNCTUATION, char, loc);
        continue;
      }
      if (char === '&' || char === '|') {
        const loc = this.tokenLoc();
        this.advance();
        this.error(
          'EVE-E003',
          `Unexpected "${char}" in expression.`,
          loc,
          char === '&' ? 'Use && for logical AND.' : 'Use || for logical OR.',
        );
        continue;
      }
      const loc = this.tokenLoc();
      this.advance();
      this.error(
        'EVE-E003',
        `Unexpected character "${char}" in expression.`,
        loc,
        'Only the documented EVE expression operators are allowed.',
      );
    }
    this.push(EXPRESSION_TOKEN_TYPES.EOF, '', this.tokenLoc());
    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }
}

export function tokenizeExpression(source, baseLoc = createLoc()) {
  return new ExpressionLexer(source, baseLoc).tokenize();
}
