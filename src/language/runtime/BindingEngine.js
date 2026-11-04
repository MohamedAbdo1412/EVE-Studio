import { evaluateExpression, EvaluationError } from '../expressions/evaluator.js';

/**
 * Re-evaluates only bindings recorded in the compiler's binding table. Variable
 * changes never invoke the lexer or parser.
 */
export class BindingEngine {
  constructor(bindings) {
    this.bindings = bindings?.bindings || [];
    this.byId = bindings?.byId || new Map();
    this.dependencyIndex = bindings?.dependencyIndex || new Map();
  }

  getAffectedVariablePaths() {
    return [...this.dependencyIndex.keys()];
  }

  getBindingsForVariable(path) {
    return (this.dependencyIndex.get(path) || [])
      .map((id) => this.byId.get(id))
      .filter(Boolean);
  }

  evaluateSegments(segments, values) {
    let output = '';
    let singleValue;
    let hasExpression = false;
    let expressionCount = 0;
    let error = null;
    for (const segment of segments) {
      if (segment.kind === 'text') {
        output += segment.value;
      } else {
        hasExpression = true;
        expressionCount += 1;
        try {
          const value = evaluateExpression(segment.ast, values);
          singleValue = value;
          output += value === null || value === undefined ? '' : String(value);
        } catch (caught) {
          error =
            caught instanceof EvaluationError
              ? caught
              : new EvaluationError('EVE-R002', caught.message, segment.loc);
          output += '';
        }
      }
    }
    if (
      hasExpression &&
      expressionCount === 1 &&
      segments.length === 1 &&
      !error
    ) {
      return { value: singleValue, error: null };
    }
    return { value: output, error };
  }

  evaluateBinding(binding, values) {
    if (!binding) return { value: null, error: null };
    return this.evaluateSegments(binding.segments, values);
  }

  evaluateAll(values) {
    const result = new Map();
    const errors = [];
    for (const binding of this.bindings) {
      const evaluated = this.evaluateBinding(binding, values);
      result.set(binding.id, evaluated);
      if (evaluated.error) {
        errors.push({
          code: evaluated.error.code,
          message: evaluated.error.message,
          binding,
          loc: evaluated.error.loc,
        });
      }
    }
    return { values: result, errors };
  }

  /**
   * Incremental entry point reserved for future optimized rendering. Only the
   * bindings dependent on changedPaths are evaluated again.
   */
  evaluateChanged(values, previous, changedPaths) {
    const next = new Map(previous || []);
    const affected = new Set();
    for (const path of changedPaths) {
      for (const id of this.dependencyIndex.get(path) || []) affected.add(id);
    }
    const errors = [];
    for (const id of affected) {
      const binding = this.byId.get(id);
      const evaluated = this.evaluateBinding(binding, values);
      next.set(id, evaluated);
      if (evaluated.error) {
        errors.push({ code: evaluated.error.code, message: evaluated.error.message, binding });
      }
    }
    return { values: next, errors };
  }
}
