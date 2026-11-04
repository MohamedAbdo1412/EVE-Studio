import {
  SEVERITY,
  buildLineStarts,
  createDiagnostic,
  createLoc,
  offsetToLoc,
} from './diagnostics.js';

const TAG_NAME = /^[A-Za-z_][A-Za-z0-9_-]*/;
const ATTRIBUTE_NAME = /^[A-Za-z_][A-Za-z0-9_-]*/;
const ENTITY = /^&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/;

export function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (match, body) => {
    if (body === 'amp') return '&';
    if (body === 'lt') return '<';
    if (body === 'gt') return '>';
    if (body === 'quot') return '"';
    if (body === 'apos') return "'";
    if (body.startsWith('#x')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return match;
  });
}

function isWhitespace(char) {
  return char === ' ' || char === '\t' || char === '\r' || char === '\n';
}

/**
 * A real character-level lexer for the XML-like EVE surface syntax. It emits
 * explicit tokens for opening/closing tags, attributes, quoted values, text,
 * comments and tag endings. The parser never searches the source with string
 * matching heuristics.
 */
export class EveLexer {
  constructor(source) {
    this.source = source || '';
    this.length = this.source.length;
    this.index = 0;
    this.line = 1;
    this.column = 1;
    this.lineStarts = buildLineStarts(this.source);
    this.tokens = [];
    this.diagnostics = [];
  }

  peek(offset = 0) {
    return this.source[this.index + offset] || '';
  }

  startsWith(text) {
    return this.source.startsWith(text, this.index);
  }

  advance(count = 1) {
    for (let step = 0; step < count; step += 1) {
      if (this.index >= this.length) return;
      const char = this.source[this.index];
      this.index += 1;
      if (char === '\n') {
        this.line += 1;
        this.column = 1;
      } else {
        this.column += 1;
      }
    }
  }

  loc() {
    return createLoc(this.line, this.column, this.index);
  }

  push(type, value, loc, extra = {}) {
    this.tokens.push({
      type,
      value,
      loc,
      endLoc: this.loc(),
      ...extra,
    });
  }

  error(code, message, loc = this.loc(), hint = '') {
    this.diagnostics.push(
      createDiagnostic({
        code,
        severity: SEVERITY.ERROR,
        message,
        loc,
        hint,
        source: 'parser',
        stage: 'lex',
      }),
    );
  }

  readTagName() {
    const match = this.source.slice(this.index).match(TAG_NAME);
    if (!match) return '';
    const value = match[0];
    this.advance(value.length);
    return value;
  }

  readAttributeName() {
    const match = this.source.slice(this.index).match(ATTRIBUTE_NAME);
    if (!match) return '';
    const value = match[0];
    this.advance(value.length);
    return value;
  }

  readQuotedValue(quote) {
    const startLoc = this.loc();
    const startIndex = this.index;
    this.advance(); // opening quote
    const contentLoc = this.loc();
    let value = '';
    while (this.index < this.length) {
      const char = this.peek();
      if (char === quote) {
        this.advance();
        return {
          value,
          raw: this.source.slice(startIndex + 1, this.index - 1),
          contentLoc,
          endLoc: this.loc(),
          closed: true,
        };
      }
      value += char;
      this.advance();
    }
    this.error(
      'EVE-P016',
      `Unclosed quoted attribute value. Expected a closing ${quote} character.`,
      startLoc,
      'Close the attribute value before the end of the document.',
    );
    return {
      value,
      raw: this.source.slice(startIndex + 1, this.index),
      contentLoc,
      endLoc: this.loc(),
      closed: false,
    };
  }

  tokenizeTag() {
    const tagStart = this.loc();
    this.advance(); // <
    let closing = false;
    if (this.peek() === '/') {
      closing = true;
      this.advance();
    }
    if (isWhitespace(this.peek())) {
      this.error(
        'EVE-P008',
        'Whitespace is not allowed between "<" or "</" and the tag name.',
        this.loc(),
        'Write the tag name immediately after the bracket.',
      );
      while (isWhitespace(this.peek())) this.advance();
    }
    const name = this.readTagName();
    if (!name) {
      this.error(
        'EVE-P011',
        'Expected a valid tag name after "<".',
        tagStart,
        'Tag names must start with a letter or underscore.',
      );
      return;
    }
    if (closing) {
      while (isWhitespace(this.peek())) this.advance();
      if (this.peek() !== '>') {
        this.error(
          'EVE-P013',
          `Expected ">" to finish closing tag </${name}>.`,
          this.loc(),
          'Closing tags cannot contain attributes.',
        );
        while (this.index < this.length && this.peek() !== '>') this.advance();
      }
      if (this.peek() === '>') this.advance();
      this.push('close', name, tagStart);
      return;
    }

    this.push('open', name, tagStart);

    while (this.index < this.length) {
      while (isWhitespace(this.peek())) this.advance();
      if (this.startsWith('/>')) {
        this.advance(2);
        this.push('end', '/>', this.loc(), { selfClosing: true });
        return;
      }
      if (this.peek() === '>') {
        this.advance();
        this.push('end', '>', this.loc(), { selfClosing: false });
        return;
      }
      if (this.peek() === '<') {
        this.error(
          'EVE-P012',
          `Unclosed opening tag <${name}>. Found "<" before the tag ended.`,
          this.loc(),
          'Add a ">" or "/>" to the previous tag.',
        );
        return;
      }
      if (this.index >= this.length) break;

      const attrLoc = this.loc();
      const attrName = this.readAttributeName();
      if (!attrName) {
        this.error(
          'EVE-P013',
          `Expected an attribute name or ">" inside <${name}>.`,
          attrLoc,
          'Attribute names start with a letter or underscore.',
        );
        this.advance();
        continue;
      }
      this.push('attr', attrName, attrLoc);
      while (isWhitespace(this.peek())) this.advance();
      if (this.peek() !== '=') {
        this.error(
          'EVE-P014',
          `Expected "=" after attribute "${attrName}".`,
          this.loc(),
          'EVE attributes use name="value" syntax.',
        );
        continue;
      }
      this.advance();
      while (isWhitespace(this.peek())) this.advance();
      const quote = this.peek();
      if (quote !== '"' && quote !== "'") {
        const badLoc = this.loc();
        this.error(
          'EVE-P015',
          `Attribute "${attrName}" must use a quoted value.`,
          badLoc,
          'Wrap the value in double or single quotes.',
        );
        let recovered = '';
        while (
          this.index < this.length &&
          !isWhitespace(this.peek()) &&
          this.peek() !== '>' &&
          !this.startsWith('/>')
        ) {
          recovered += this.peek();
          this.advance();
        }
        this.push('value', recovered, badLoc, {
          raw: recovered,
          quote: '',
          closed: true,
          decoded: decodeEntities(recovered),
        });
        continue;
      }
      const read = this.readQuotedValue(quote);
      this.push('value', read.value, read.contentLoc, {
        raw: read.raw,
        quote,
        closed: read.closed,
        valueEndLoc: read.endLoc,
        decoded: decodeEntities(read.value),
      });
    }

    this.error(
      'EVE-P012',
      `Unclosed opening tag <${name}>.`,
      tagStart,
      'Add a ">" or "/>" at the end of the opening tag.',
    );
  }

  tokenize() {
    while (this.index < this.length) {
      if (this.startsWith('<!--')) {
        const start = this.loc();
        const startIndex = this.index;
        this.advance(4);
        const endIndex = this.source.indexOf('-->', this.index);
        if (endIndex === -1) {
          this.advance(this.length - this.index);
          this.error(
            'EVE-P010',
            'Unclosed comment. Expected "-->" before the end of the document.',
            start,
            'Close the comment with "-->".',
          );
        } else {
          this.advance(endIndex - this.index + 3);
        }
        this.push('comment', this.source.slice(startIndex, this.index), start, {
          endLoc: this.loc(),
        });
        continue;
      }

      if (this.peek() === '<') {
        this.tokenizeTag();
        continue;
      }

      const start = this.loc();
      const startIndex = this.index;
      while (this.index < this.length && this.peek() !== '<') {
        this.advance();
      }
      const raw = this.source.slice(startIndex, this.index);
      if (raw.length > 0) {
        this.push('text', raw, start, { endLoc: this.loc() });
      }
    }

    this.push('eof', '', this.loc());
    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }
}

export function tokenize(source) {
  return new EveLexer(source).tokenize();
}

export function locAtOffset(source, offset) {
  return offsetToLoc(offset, buildLineStarts(source));
}

export { ENTITY };
