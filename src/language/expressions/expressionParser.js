import { SEVERITY, createDiagnostic } from '../diagnostics.js';
import { tokenizeExpression } from './expressionLexer.js';

export class ExpressionParser {
  constructor(source, baseLoc) {
    const lexed = tokenizeExpression(source, baseLoc);
    this.tokens = lexed.tokens;
    this.diagnostics = [...lexed.diagnostics];
    this.index = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset] || this.tokens[this.tokens.length - 1];
  }

  consume() {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  match(value) {
    if (this.peek().value === value) {
      return this.consume();
    }
    return null;
  }

  error(code, message, token = this.peek(), hint = '') {
    this.diagnostics.push(
      createDiagnostic({
        code,
        severity: SEVERITY.ERROR,
        message,
        loc: token.loc,
        hint,
        source: 'expression',
        stage: 'expression',
      }),
    );
  }

  parse() {
    if (this.peek().type === 'eof') {
      this.error('EVE-E002', 'Empty expression.', this.peek(), 'Provide a value inside ${...}.');
      return { ast: null, diagnostics: this.diagnostics, dependencies: [] };
    }
    const ast = this.parseConditional();
    if (this.peek().type !== 'eof') {
      this.error(
        'EVE-E003',
        `Unexpected token "${this.peek().value}" after expression.`,
        this.peek(),
        'One expression can contain only the documented operators.',
      );
      while (this.peek().type !== 'eof') this.consume();
    }
    return {
      ast,
      diagnostics: this.diagnostics,
      dependencies: ast ? collectDependencies(ast) : [],
    };
  }

  parseConditional() {
    const condition = this.parseLogicalOr();
    const question = this.match('?');
    if (!question) return condition;
    const consequent = this.parseConditional();
    const colon = this.match(':');
    if (!colon) {
      this.error(
        'EVE-E008',
        'Conditional expression is missing ":".',
        this.peek(),
        'Use condition ? valueWhenTrue : valueWhenFalse.',
      );
      return {
        type: 'Conditional',
        condition,
        consequent,
        alternate: null,
        loc: condition?.loc,
      };
    }
    const alternate = this.parseConditional();
    return {
      type: 'Conditional',
      condition,
      consequent,
      alternate,
      loc: condition?.loc,
      endLoc: alternate?.endLoc,
    };
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.match('||')) {
      const operator = this.tokens[this.index - 1];
      const right = this.parseLogicalAnd();
      left = this.binary('Logical', operator.value, left, right, left?.loc);
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseEquality();
    while (this.match('&&')) {
      const operator = this.tokens[this.index - 1];
      const right = this.parseEquality();
      left = this.binary('Logical', operator.value, left, right, left?.loc);
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    while (this.peek().value === '==' || this.peek().value === '!=') {
      const operator = this.consume();
      const right = this.parseComparison();
      left = this.binary('Comparison', operator.value, left, right, left?.loc);
    }
    return left;
  }

  parseComparison() {
    let left = this.parseAdditive();
    while (['<', '>', '<=', '>='].includes(this.peek().value)) {
      const operator = this.consume();
      const right = this.parseAdditive();
      left = this.binary('Comparison', operator.value, left, right, left?.loc);
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.peek().value === '+' || this.peek().value === '-') {
      const operator = this.consume();
      const right = this.parseMultiplicative();
      left = this.binary('Arithmetic', operator.value, left, right, left?.loc);
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (['*', '/', '%'].includes(this.peek().value)) {
      const operator = this.consume();
      const right = this.parseUnary();
      left = this.binary('Arithmetic', operator.value, left, right, left?.loc);
    }
    return left;
  }

  parseUnary() {
    if (
      this.peek().type === 'operator' &&
      (this.peek().value === '!' || this.peek().value === '-')
    ) {
      const operator = this.consume();
      const operand = this.parseUnary();
      return {
        type: 'Unary',
        operator: operator.value,
        operand,
        loc: operator.loc,
        endLoc: operand?.endLoc || operator.endLoc,
      };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.peek();
    if (token.type === 'number') {
      this.consume();
      return {
        type: 'Literal',
        value: token.value,
        valueType: 'number',
        loc: token.loc,
        endLoc: token.endLoc,
      };
    }
    if (token.type === 'string') {
      this.consume();
      return {
        type: 'Literal',
        value: token.value,
        valueType: 'string',
        loc: token.loc,
        endLoc: token.endLoc,
      };
    }
    if (token.type === 'keyword') {
      this.consume();
      if (token.value === 'null') {
        return { type: 'Literal', value: null, valueType: 'null', loc: token.loc, endLoc: token.endLoc };
      }
      return {
        type: 'Literal',
        value: token.value === 'true',
        valueType: 'boolean',
        loc: token.loc,
        endLoc: token.endLoc,
      };
    }
    if (token.type === 'identifier') {
      this.consume();
      return {
        type: 'Variable',
        path: token.value,
        loc: token.loc,
        endLoc: token.endLoc,
      };
    }
    if (token.value === '(') {
      const open = this.consume();
      const expression = this.parseConditional();
      const close = this.match(')');
      if (!close) {
        this.error(
          'EVE-E009',
          'Expected ")" to close the grouped expression.',
          this.peek(),
          'Check parenthesis balance.',
        );
      }
      return {
        type: 'Group',
        expression,
        loc: open.loc,
        endLoc: close?.endLoc || expression?.endLoc || open.endLoc,
      };
    }
    if (token.type === 'operator') {
      this.error(
        'EVE-E005',
        `Operator "${token.value}" is missing an operand.`,
        token,
        'Place a literal, variable reference or parenthesised expression on both sides of every operator.',
      );
      this.consume();
      return {
        type: 'Invalid',
        loc: token.loc,
        endLoc: token.endLoc,
      };
    }
    this.error(
      'EVE-E003',
      token.type === 'eof'
        ? 'Unexpected end of expression.'
        : `Unexpected token "${token.value}" in expression.`,
      token,
      'Expected a literal, variable reference, unary expression or parenthesised expression.',
    );
    this.consume();
    return {
      type: 'Invalid',
      loc: token.loc,
      endLoc: token.endLoc,
    };
  }

  binary(kind, operator, left, right, loc) {
    return {
      type: 'Binary',
      kind,
      operator,
      left,
      right,
      loc: loc || left?.loc,
      endLoc: right?.endLoc,
    };
  }
}

export function parseExpression(source, baseLoc) {
  return new ExpressionParser(source, baseLoc).parse();
}

export function collectDependencies(ast, dependencies = []) {
  if (!ast) return dependencies;
  if (ast.type === 'Variable') {
    if (!dependencies.includes(ast.path)) dependencies.push(ast.path);
    return dependencies;
  }
  if (ast.type === 'Unary') {
    collectDependencies(ast.operand, dependencies);
  } else if (ast.type === 'Binary') {
    collectDependencies(ast.left, dependencies);
    collectDependencies(ast.right, dependencies);
  } else if (ast.type === 'Conditional') {
    collectDependencies(ast.condition, dependencies);
    collectDependencies(ast.consequent, dependencies);
    collectDependencies(ast.alternate, dependencies);
  } else if (ast.type === 'Group') {
    collectDependencies(ast.expression, dependencies);
  }
  return dependencies;
}

export function inferExpressionType(ast, registry) {
  if (!ast) return 'unknown';
  if (ast.type === 'Literal') return ast.valueType;
  if (ast.type === 'Variable') {
    const entry = registry instanceof Map ? registry.get(ast.path) : registry?.[ast.path];
    if (!entry) return 'undefined';
    return entry.type || entry;
  }
  if (ast.type === 'Group') return inferExpressionType(ast.expression, registry);
  if (ast.type === 'Unary') {
    return ast.operator === '!' ? 'boolean' : 'number';
  }
  if (ast.type === 'Binary') {
    if (ast.kind === 'Logical') return 'boolean';
    if (ast.kind === 'Comparison') return 'boolean';
    if (ast.operator === '+') {
      const left = inferExpressionType(ast.left, registry);
      const right = inferExpressionType(ast.right, registry);
      if (left === 'string' || right === 'string' || left === 'color' || right === 'color' || left === 'image' || right === 'image') {
        return 'string';
      }
      return 'number';
    }
    return 'number';
  }
  if (ast.type === 'Conditional') {
    const consequent = inferExpressionType(ast.consequent, registry);
    const alternate = inferExpressionType(ast.alternate, registry);
    if (consequent === alternate) return consequent;
    if (consequent === 'null') return alternate;
    if (alternate === 'null') return consequent;
    const stringLike = new Set(['string', 'color', 'image']);
    if (stringLike.has(consequent) && stringLike.has(alternate)) return 'string';
    return 'mixed';
  }
  return 'unknown';
}
