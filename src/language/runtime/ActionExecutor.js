import { evaluateExpression, EvaluationError } from '../expressions/evaluator.js';
import { RuntimeError } from './RuntimeState.js';

/**
 * Executes the safe, pre-validated EVE action program. Nothing in this module
 * can call arbitrary JavaScript: actions are data produced by parseActionList.
 */
export class ActionExecutor {
  constructor({ runtime, navigation }) {
    this.runtime = runtime;
    this.navigation = navigation;
    this.log = [];
  }

  execute(actions) {
    const changes = [];
    const errors = [];
    let navigationChanged = false;
    for (const action of actions || []) {
      try {
        if (action.name === 'navigate') {
          const result = this.navigation.navigate(action.page);
          if (!result.ok) {
            errors.push({ action, ...result });
            continue;
          }
          if (result.changed) {
            navigationChanged = true;
            changes.push({ type: 'navigate', pageId: action.page });
          }
        } else if (action.name === 'back') {
          const result = this.navigation.back();
          if (!result.ok) {
            errors.push({ action, ...result });
            continue;
          }
          if (result.changed) {
            navigationChanged = true;
            changes.push({ type: 'back', pageId: result.pageId });
          }
        } else if (action.name === 'set') {
          let value;
          try {
            value = evaluateExpression(action.expression, this.runtime.values);
          } catch (error) {
            if (error instanceof EvaluationError) {
              errors.push({ action, code: error.code, message: error.message });
              continue;
            }
            throw error;
          }
          this.runtime.set(action.path, value);
          changes.push({ type: 'set', path: action.path, value });
        } else if (action.name === 'toggle') {
          const value = this.runtime.toggle(action.path);
          changes.push({ type: 'toggle', path: action.path, value });
        } else if (action.name === 'reset') {
          const value = this.runtime.reset(action.path);
          changes.push({ type: 'reset', path: action.path, value });
        } else {
          errors.push({ action, code: 'EVE-RT003', message: `Unknown action "${action.name}".` });
        }
      } catch (error) {
        errors.push({
          action,
          code: error.code || 'EVE-RT003',
          message: error instanceof RuntimeError ? error.message : String(error.message || error),
        });
      }
    }
    const entry = {
      at: Date.now(),
      actions: (actions || []).map((action) => action.source || action.name),
      changes,
      errors,
    };
    this.log.unshift(entry);
    if (this.log.length > 30) this.log.pop();
    return {
      ok: errors.length === 0,
      changes,
      errors,
      navigationChanged,
      log: this.log,
    };
  }
}

export function executeActions(actions, context) {
  return new ActionExecutor(context).execute(actions);
}
