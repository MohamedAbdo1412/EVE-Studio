import {
  SEVERITY,
  buildLineStarts,
  createDiagnostic,
  createLoc,
  offsetToLoc,
} from './diagnostics.js';
import { decodeEntities, tokenize } from './lexer.js';

const TAG_TYPES = {
  app: 'App',
  vars: 'Vars',
  fam: 'Fam',
  var: 'Var',
  page: 'Page',
  group: 'Group',
  text: 'Text',
  img: 'Image',
  vid: 'Video',
  button: 'Button',
  shape: 'Shape',
};

function typeForTag(tag) {
  return TAG_TYPES[tag] || 'Unknown';
}

function isWhitespaceText(value) {
  return /^\s*$/.test(value);
}

export class EveParser {
  constructor(source) {
    this.source = source || '';
    this.lineStarts = buildLineStarts(this.source);
    const lexed = tokenize(this.source);
    this.tokens = lexed.tokens;
    this.diagnostics = [...lexed.diagnostics];
    this.index = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset] || { type: 'eof', loc: this.loc() };
  }

  consume() {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  loc() {
    return this.tokens[this.tokens.length - 1]?.loc || createLoc();
  }

  error(code, message, loc, hint = '') {
    this.diagnostics.push(
      createDiagnostic({
        code,
        severity: SEVERITY.ERROR,
        message,
        loc,
        hint,
        source: 'parser',
        stage: 'parse',
      }),
    );
  }

  splitText(token) {
    const raw = token.value;
    const baseOffset = token.loc.offset;
    const nodes = [];
    let index = 0;
    let literalStart = 0;

    const pushLiteral = (start, end) => {
      if (end <= start) return;
      const rawLiteral = raw.slice(start, end);
      nodes.push({
        type: 'TextFragment',
        value: decodeEntities(rawLiteral),
        raw: rawLiteral,
        loc: offsetToLoc(baseOffset + start, this.lineStarts),
        endLoc: offsetToLoc(baseOffset + end, this.lineStarts),
      });
    };

    while (index < raw.length) {
      if (raw[index] === '$' && raw[index + 1] === '{') {
        pushLiteral(literalStart, index);
        const expressionStart = index + 2;
        let cursor = expressionStart;
        let depth = 1;
        let quote = null;
        let escaped = false;
        let closed = false;
        while (cursor < raw.length) {
          const char = raw[cursor];
          if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = null;
          } else if (char === "'" || char === '"') {
            quote = char;
          } else if (char === '{') {
            depth += 1;
          } else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
              closed = true;
              break;
            }
          }
          cursor += 1;
        }
        const expressionEnd = closed ? cursor : raw.length;
        const expression = raw.slice(expressionStart, expressionEnd);
        const exprLoc = offsetToLoc(baseOffset + expressionStart, this.lineStarts);
        const exprEndLoc = offsetToLoc(baseOffset + expressionEnd, this.lineStarts);
        if (!closed) {
          this.error(
            'EVE-E001',
            'Unterminated interpolation expression. Expected a closing "}".',
            offsetToLoc(baseOffset + index, this.lineStarts),
            'Expressions use the form ${expression}.',
          );
        } else if (!expression.trim()) {
          this.error(
            'EVE-E002',
            'Empty interpolation expression.',
            exprLoc,
            'Place a variable reference or expression inside ${...}.',
          );
        }
        nodes.push({
          type: 'Interpolation',
          expression: decodeEntities(expression),
          rawExpression: expression,
          loc: exprLoc,
          endLoc: exprEndLoc,
          startLoc: offsetToLoc(baseOffset + index, this.lineStarts),
        });
        index = closed ? cursor + 1 : raw.length;
        literalStart = index;
        continue;
      }
      index += 1;
    }
    pushLiteral(literalStart, raw.length);
    return nodes;
  }

  parseAttributes(tagName, openToken) {
    const attributes = {};
    const attrLocations = {};
    const attrList = [];
    while (this.peek().type === 'attr') {
      const attrToken = this.consume();
      const attrName = attrToken.value;
      let valueToken = null;
      if (this.peek().type === 'value') {
        valueToken = this.consume();
      } else {
        const bad = this.peek();
        this.error(
          'EVE-P014',
          `Expected a quoted value for attribute "${attrName}" in <${tagName}>.`,
          attrToken.loc,
          `Write ${attrName}="..." inside the opening tag.`,
        );
        attrList.push({ name: attrName, value: '', loc: attrToken.loc, valueLoc: attrToken.loc });
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(attributes, attrName)) {
        this.error(
          'EVE-P004',
          `Duplicate attribute "${attrName}" on <${tagName}>.`,
          attrToken.loc,
          'Each attribute may only be declared once per element.',
        );
      }
      const value = valueToken.decoded ?? decodeEntities(valueToken.value);
      attributes[attrName] = value;
      attrLocations[attrName] = {
        loc: attrToken.loc,
        valueLoc: valueToken.loc,
        valueEndLoc: valueToken.valueEndLoc || valueToken.endLoc,
        quote: valueToken.quote,
        raw: valueToken.raw ?? valueToken.value,
      };
      attrList.push({
        name: attrName,
        value,
        loc: attrToken.loc,
        valueLoc: valueToken.loc,
        valueEndLoc: valueToken.valueEndLoc || valueToken.endLoc,
        quote: valueToken.quote,
        raw: valueToken.raw ?? valueToken.value,
      });
    }
    return { attributes, attrLocations, attrList };
  }

  parseElement(parentStack = []) {
    const openToken = this.peek();
    if (openToken.type !== 'open') {
      this.error('EVE-P001', 'Expected an opening tag.', openToken.loc);
      return null;
    }
    this.consume();
    const tag = openToken.value;
    const { attributes, attrLocations, attrList } = this.parseAttributes(tag, openToken);

    let endToken = this.peek();
    if (endToken.type !== 'end') {
      this.error(
        'EVE-P012',
        `Unclosed opening tag <${tag}>.`,
        openToken.loc,
        'Add ">" or "/>" to finish the opening tag.',
      );
      endToken = { type: 'end', selfClosing: false, loc: openToken.loc };
    } else {
      this.consume();
    }

    const node = {
      type: typeForTag(tag),
      tag,
      id: attributes.id || null,
      attributes,
      attrLocations,
      attrList,
      children: [],
      loc: openToken.loc,
      openEndLoc: endToken.loc,
      endLoc: endToken.loc,
      parent: null,
      selfClosing: Boolean(endToken.selfClosing),
    };

    if (endToken.selfClosing) {
      node.endLoc = endToken.loc;
      return node;
    }

    const stack = [...parentStack, tag];
    while (this.index < this.tokens.length) {
      const token = this.peek();
      if (token.type === 'text') {
        this.consume();
        const fragments = this.splitText(token);
        for (const fragment of fragments) {
          fragment.parent = node;
        }
        node.children.push(...fragments);
        continue;
      }
      if (token.type === 'comment') {
        this.consume();
        continue;
      }
      if (token.type === 'open') {
        const child = this.parseElement(stack);
        if (child) {
          child.parent = node;
          node.children.push(child);
        }
        continue;
      }
      if (token.type === 'close') {
        if (token.value === tag) {
          this.consume();
          node.endLoc = token.loc;
          return node;
        }
        if (stack.includes(token.value)) {
          this.error(
            'EVE-P002',
            `Missing closing tag </${tag}> before </${token.value}>.`,
            openToken.loc,
            `Add </${tag}> inside the parent element.`,
          );
          node.endLoc = token.loc;
          return node;
        }
        this.consume();
        this.error(
          'EVE-P001',
          `Unexpected closing tag </${token.value}>.`,
          token.loc,
          token.value === tag
            ? ''
            : `There is no open <${token.value}> element at this point.`,
        );
        continue;
      }
      if (token.type === 'eof') {
        this.error(
          'EVE-P002',
          `Missing closing tag </${tag}>.`,
          openToken.loc,
          `The document ended before </${tag}> was found.`,
        );
        node.endLoc = token.loc;
        return node;
      }
      this.consume();
    }

    this.error('EVE-P002', `Missing closing tag </${tag}>.`, openToken.loc);
    return node;
  }

  parseDocument() {
    const roots = [];
    while (this.peek().type !== 'eof') {
      const token = this.peek();
      if (token.type === 'text') {
        this.consume();
        if (!isWhitespaceText(token.value)) {
          this.error(
            'EVE-P005',
            'Text content is only allowed inside components.',
            token.loc,
            'Move the text inside an app component.',
          );
        }
        continue;
      }
      if (token.type === 'comment') {
        this.consume();
        continue;
      }
      if (token.type === 'close') {
        this.consume();
        this.error(
          'EVE-P001',
          `Unexpected closing tag </${token.value}>.`,
          token.loc,
          'There is no matching opening tag.',
        );
        continue;
      }
      if (token.type === 'open') {
        const root = this.parseElement([]);
        if (root) roots.push(root);
        continue;
      }
      this.consume();
    }

    if (roots.length === 0) {
      this.error(
        'EVE-P007',
        'An EVE document must contain a single <app> root element.',
        createLoc(1, 1, 0),
        'Add <app name="..." width="..." height="..."> ... </app>.',
      );
      return { ast: null, diagnostics: this.diagnostics, roots: [] };
    }
    if (roots.length > 1) {
      for (const extra of roots.slice(1)) {
        this.error(
          'EVE-P006',
          'An EVE document may only have one root element.',
          extra.loc,
          `Wrap all pages inside the single <app> root; found an extra <${extra.tag}>.`,
        );
      }
    }
    return { ast: roots[0], roots, diagnostics: this.diagnostics };
  }
}

export function parse(source) {
  return new EveParser(source).parseDocument();
}

export function walkAst(node, visitor, parent = null) {
  if (!node) return;
  visitor(node, parent);
  if (node.children) {
    for (const child of node.children) {
      walkAst(child, visitor, node);
    }
  }
}

export function findNodeById(ast, id) {
  let found = null;
  walkAst(ast, (node) => {
    if (!found && node.id === id && node.type !== 'Interpolation') found = node;
  });
  return found;
}

export function isUiTag(tag) {
  return ['page', 'group', 'text', 'img', 'vid', 'button', 'shape'].includes(tag);
}

export { TAG_TYPES };
