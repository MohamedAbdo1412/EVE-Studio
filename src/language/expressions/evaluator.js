import { createLoc } from '../diagnostics.js';

export class EvaluationError extends Error {
  constructor(code, message, loc) {
    super(message);
    this.name = 'EvaluationError';
    this.code = code;
    this.loc = loc || createLoc();
  }
}

export function valueTypeOf(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  return 'unknown';
}

export function stringifyValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function normalizeScope(scope) {
  if (typeof scope === 'function') return scope;
  if (scope && typeof scope.getVariable === 'function') return scope.getVariable;
  if (scope && scope.values) {
    return (path) =>
      Object.prototype.hasOwnProperty.call(scope.values, path) ? scope.values[path] : undefined;
  }
  if (scope && scope.registry) {
    return (path) =>
      scope.values && Object.prototype.hasOwnProperty.call(scope.values, path)
        ? scope.values[path]
        : scope.registry.get?.(path)?.initialValue;
  }
  return (path) =>
    scope && Object.prototype.hasOwnProperty.call(scope, path) ? scope[path] : undefined;
}

function extractValue(entry) {
  if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')) {
    return entry.value;
  }
  return entry;
}

function expressionString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value);
}

export function evaluateExpression(ast, scope = {}) {
  const getVariable = normalizeScope(scope);

  function evaluate(node) {
    if (!node || node.type === 'Invalid') {
      throw new EvaluationError('EVE-R002', 'Invalid expression node.', node?.loc);
    }
    switch (node.type) {
      case 'Literal':
        return node.value;
      case 'Variable': {
        const raw = getVariable(node.path);
        if (raw === undefined) {
          throw new EvaluationError(
            'EVE-R001',
            `Runtime variable "${node.path}" is not registered.`,
            node.loc,
          );
        }
        return extractValue(raw);
      }
      case 'Group':
        return evaluate(node.expression);
      case 'Unary': {
        const value = evaluate(node.operand);
        if (node.operator === '!') {
          if (typeof value !== 'boolean') {
            throw new EvaluationError('EVE-R003', 'Logical NOT requires a boolean operand.', node.loc);
          }
          return !value;
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new EvaluationError('EVE-R003', 'Unary minus requires a finite number.', node.loc);
        }
        return -value;
      }
      case 'Conditional': {
        const condition = evaluate(node.condition);
        if (typeof condition !== 'boolean') {
          throw new EvaluationError(
            'EVE-R003',
            'The condition of ?: must evaluate to a boolean.',
            node.condition?.loc || node.loc,
          );
        }
        return condition ? evaluate(node.consequent) : evaluate(node.alternate);
      }
      case 'Binary':
        return evaluateBinary(node, evaluate);
      default:
        throw new EvaluationError('EVE-R002', `Unknown expression node "${node.type}".`, node.loc);
    }
  }

  function evaluateBinary(node, evalNode) {
    const left = evalNode(node.left);
    if (node.operator === '&&') {
      if (typeof left !== 'boolean') {
        throw new EvaluationError('EVE-R003', 'Operator && requires boolean operands.', node.left?.loc || node.loc);
      }
      if (!left) return false;
      const right = evalNode(node.right);
      if (typeof right !== 'boolean') {
        throw new EvaluationError('EVE-R003', 'Operator && requires boolean operands.', node.right?.loc || node.loc);
      }
      return right;
    }
    if (node.operator === '||') {
      if (typeof left !== 'boolean') {
        throw new EvaluationError('EVE-R003', 'Operator || requires boolean operands.', node.left?.loc || node.loc);
      }
      if (left) return true;
      const right = evalNode(node.right);
      if (typeof right !== 'boolean') {
        throw new EvaluationError('EVE-R003', 'Operator || requires boolean operands.', node.right?.loc || node.loc);
      }
      return right;
    }

    const right = evalNode(node.right);
    if (node.operator === '+') {
      if (typeof left === 'number' && typeof right === 'number') {
        return assertFinite(left + right, node.loc);
      }
      if (typeof left === 'string' || typeof right === 'string') {
        return expressionString(left) + expressionString(right);
      }
      throw new EvaluationError(
        'EVE-R003',
        'Operator + requires two numbers or at least one string operand.',
        node.loc,
      );
    }
    if (['-', '*', '/', '%'].includes(node.operator)) {
      if (typeof left !== 'number' || typeof right !== 'number') {
        throw new EvaluationError(
          'EVE-R003',
          `Operator ${node.operator} requires numeric operands.`,
          node.loc,
        );
      }
      if ((node.operator === '/' || node.operator === '%') && right === 0) {
        throw new EvaluationError('EVE-R004', 'Division by zero is not allowed.', node.right?.loc || node.loc);
      }
      let result = 0;
      if (node.operator === '-') result = left - right;
      if (node.operator === '*') result = left * right;
      if (node.operator === '/') result = left / right;
      if (node.operator === '%') result = left % right;
      return assertFinite(result, node.loc);
    }
    if (['<', '>', '<=', '>='].includes(node.operator)) {
      if (typeof left !== typeof right || !['number', 'string'].includes(typeof left)) {
        throw new EvaluationError(
          'EVE-R005',
          `Operator ${node.operator} requires two operands of the same comparable type.`,
          node.loc,
        );
      }
      if (node.operator === '<') return left < right;
      if (node.operator === '>') return left > right;
      if (node.operator === '<=') return left <= right;
      return left >= right;
    }
    if (node.operator === '==') return left === right;
    if (node.operator === '!=') return left !== right;
    throw new EvaluationError('EVE-R002', `Unknown operator "${node.operator}".`, node.loc);
  }

  function assertFinite(value, loc) {
    if (!Number.isFinite(value)) {
      throw new EvaluationError('EVE-R006', 'Numeric result is not finite.', loc);
    }
    return value;
  }

  return evaluate(ast);
}

export function evaluateExpressionSafe(ast, scope) {
  try {
    return { value: evaluateExpression(ast, scope), error: null };
  } catch (error) {
    return {
      value: null,
      error:
        error instanceof EvaluationError
          ? error
          : new EvaluationError('EVE-R002', error.message, ast?.loc),
    };
  }
}
