import { describe, expect, it } from 'vitest';
import {
  ExpressionParser,
  collectDependencies,
  inferExpressionType,
  parseExpression,
} from '../src/language/expressions/expressionParser.js';
import {
  EvaluationError,
  evaluateExpression,
  evaluateExpressionSafe,
} from '../src/language/expressions/evaluator.js';
import { tokenizeExpression } from '../src/language/expressions/expressionLexer.js';

function parseOk(source) {
  const result = parseExpression(source);
  expect(result.diagnostics).toEqual([]);
  return result;
}

function codes(result) {
  return result.diagnostics.map((item) => item.code);
}

const REGISTRY = new Map([
  ['room.temperature', { type: 'number' }],
  ['room.enabled', { type: 'boolean' }],
  ['room.label', { type: 'string' }],
  ['room.accent', { type: 'color' }],
  ['room.icon', { type: 'image' }],
]);

describe('expression lexer and parser', () => {
  it('tokenizes numbers, strings, keywords, identifiers and operators', () => {
    const { tokens, diagnostics } = tokenizeExpression("1 + room.temp > 2 && label == 'ok' ? true : null");
    expect(diagnostics).toEqual([]);
    expect(tokens.map((token) => token.type)).toEqual([
      'number',
      'operator',
      'identifier',
      'operator',
      'number',
      'operator',
      'identifier',
      'operator',
      'string',
      'punctuation',
      'keyword',
      'punctuation',
      'keyword',
      'eof',
    ]);
  });

  it('applies arithmetic precedence and parentheses', () => {
    const { ast } = parseOk('1 + 2 * 3');
    expect(ast).toMatchObject({
      type: 'Binary',
      operator: '+',
      right: { type: 'Binary', operator: '*' },
    });

    const grouped = parseOk('(1 + 2) * 3').ast;
    expect(grouped).toMatchObject({
      type: 'Binary',
      operator: '*',
      left: { type: 'Group' },
    });
    expect(evaluateExpression(grouped)).toBe(9);
  });

  it('parses unary, comparison, logical and ternary expressions', () => {
    expect(parseOk('-2 + 3').ast).toMatchObject({
      type: 'Binary',
      left: { type: 'Unary', operator: '-' },
    });
    expect(parseOk('!room.enabled && room.temperature >= 10').ast).toMatchObject({
      type: 'Binary',
      operator: '&&',
    });
    expect(parseOk('room.enabled ? room.label : "off"').ast).toMatchObject({
      type: 'Conditional',
    });
  });

  it('collects dependencies in first-use order without duplicates', () => {
    const { ast } = parseOk('room.temperature + room.temperature + room.enabled');
    expect(collectDependencies(ast)).toEqual(['room.temperature', 'room.enabled']);
  });

  it('infers literal, variable and operator result types', () => {
    const { ast } = parseOk(
      'room.enabled ? room.temperature + 1 : room.label',
    );
    expect(inferExpressionType(ast, REGISTRY)).toBe('mixed');
    expect(inferExpressionType(parseOk('room.label + "!"').ast, REGISTRY)).toBe(
      'string',
    );
    expect(inferExpressionType(parseOk('room.accent').ast, REGISTRY)).toBe('color');
    expect(inferExpressionType(parseOk('room.enabled && true').ast, REGISTRY)).toBe(
      'boolean',
    );
  });

  it('reports an operator without an operand as EVE-E005', () => {
    const result = parseExpression('1 + * 2');
    expect(codes(result)).toContain('EVE-E005');
    expect(result.diagnostics.find((item) => item.code === 'EVE-E005').message).toContain(
      '"*"',
    );
  });

  it('reports empty, trailing, unterminated and malformed expressions', () => {
    expect(codes(parseExpression(''))).toContain('EVE-E002');
    expect(codes(parseExpression('1 2'))).toContain('EVE-E003');
    expect(codes(parseExpression('"unterminated'))).toContain('EVE-E004');
    expect(codes(parseExpression('1e999'))).toContain('EVE-E006');
    expect(codes(parseExpression('room.'))).toContain('EVE-E007');
    expect(codes(parseExpression('true ? 1'))).toContain('EVE-E008');
    expect(codes(parseExpression('(1 + 2'))).toContain('EVE-E009');
    expect(codes(parseExpression('1 & 2'))).toContain('EVE-E003');
  });

  it('accepts a custom base location when reporting errors', () => {
    const parser = new ExpressionParser('1 + * 2', {
      line: 12,
      column: 8,
      offset: 40,
    });
    const result = parser.parse();
    const diagnostic = result.diagnostics.find((item) => item.code === 'EVE-E005');
    expect(diagnostic?.line).toBe(12);
    expect(diagnostic?.column).toBeGreaterThanOrEqual(8);
  });
});

describe('safe expression evaluator', () => {
  const values = {
    'room.temperature': 30,
    'room.enabled': true,
    'room.label': 'Living Room',
    'room.accent': '#00FF88',
  };

  it('evaluates arithmetic, comparisons, logic and conditional branches', () => {
    expect(evaluateExpression(parseOk('(2 + 3) * 4').ast)).toBe(20);
    expect(evaluateExpression(parseOk('30 >= 30 && 10 < 20').ast)).toBe(true);
    expect(evaluateExpression(parseOk('room.label + " " + room.temperature').ast, values)).toBe(
      'Living Room 30',
    );
    expect(evaluateExpression(parseOk('room.enabled ? "on" : "off"').ast, values)).toBe('on');
    expect(evaluateExpression(parseOk('null').ast)).toBeNull();
  });

  it('reads variables through object, Map-like and callback scopes', () => {
    expect(evaluateExpression(parseOk('room.temperature').ast, values)).toBe(30);
    expect(
      evaluateExpression(parseOk('room.temperature').ast, {
        getVariable: (path) => (path === 'room.temperature' ? 31 : undefined),
      }),
    ).toBe(31);
    expect(
      evaluateExpression(parseOk('room.temperature').ast, {
        values: { 'room.temperature': 32 },
      }),
    ).toBe(32);
  });

  it('reports runtime type and evaluation failures without executing JavaScript', () => {
    const division = evaluateExpressionSafe(parseOk('10 / 0').ast);
    expect(division.error).toBeInstanceOf(EvaluationError);
    expect(division.error.code).toBe('EVE-R004');

    const logical = evaluateExpressionSafe(parseOk('1 && true').ast);
    expect(logical.error.code).toBe('EVE-R003');

    const missing = evaluateExpressionSafe(parseOk('missing.variable').ast, values);
    expect(missing.error.code).toBe('EVE-R001');

    const overflow = evaluateExpressionSafe(parseOk('1e308 * 1e308').ast);
    expect(overflow.error.code).toBe('EVE-R006');

    const injected = evaluateExpressionSafe(
      parseOk('constructor + "__proto__"').ast,
      {},
    );
    expect(injected.error.code).toBe('EVE-R001');
  });

  it('short-circuits && and || with strict boolean operands', () => {
    expect(evaluateExpression(parseOk('false && missing.variable').ast)).toBe(false);
    expect(evaluateExpression(parseOk('true || missing.variable').ast)).toBe(true);
  });
});
