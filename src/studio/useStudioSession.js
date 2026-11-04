import { useCallback, useEffect, useRef, useState } from 'react';
import { compile } from '../language/compiler/compile.js';
import { RuntimeState } from '../language/runtime/RuntimeState.js';
import { NavigationManager } from '../language/runtime/NavigationManager.js';
import { BindingEngine } from '../language/runtime/BindingEngine.js';
import { ActionExecutor } from '../language/runtime/ActionExecutor.js';

const EMPTY_NAV = {
  activePage: null,
  history: [],
  canGoBack: false,
  breadcrumb: [],
};

function emptySession() {
  return {
    runtime: null,
    navigation: null,
    bindingEngine: null,
    executor: null,
    loadNonce: -1,
    compiled: null,
  };
}

/**
 * Owns the live compile/runtime session used by the Studio. Source changes are
 * debounced; a failed compile never destroys the last valid scene or its
 * runtime variable values.
 */
export function useStudioSession({ source, assets, loadNonce }) {
  const [compilation, setCompilation] = useState(null);
  const [lastGood, setLastGood] = useState(null);
  const [isCompiling, setIsCompiling] = useState(true);
  const [runtimeValues, setRuntimeValues] = useState({});
  const [bindingValues, setBindingValues] = useState(new Map());
  const [navigationState, setNavigationState] = useState(EMPTY_NAV);
  const [variableEntries, setVariableEntries] = useState([]);
  const [runtimeEvents, setRuntimeEvents] = useState([]);
  const [compileNonce, setCompileNonce] = useState(0);
  const sessionRef = useRef(emptySession());

  const recordRuntimeEvent = useCallback((event) => {
    setRuntimeEvents((current) => [event, ...current].slice(0, 8));
  }, []);

  const refresh = useCallback(() => {
    const session = sessionRef.current;
    if (!session.runtime) return;
    const values = session.runtime.snapshot();
    const evaluated = session.bindingEngine
      ? session.bindingEngine.evaluateAll(values)
      : { values: new Map(), errors: [] };
    setRuntimeValues(values);
    setBindingValues(evaluated.values);
    setVariableEntries(
      session.runtime.entries().map((entry) => ({
        path: entry.path,
        name: entry.name,
        type: entry.type,
        initialValue: entry.initialValue,
        value: entry.currentValue,
        id: entry.id,
        source: entry.source,
        references: entry.references || [],
      })),
    );
    setNavigationState(session.navigation ? session.navigation.snapshot() : EMPTY_NAV);
    if (evaluated.errors.length > 0) {
      recordRuntimeEvent({
        kind: 'error',
        message: `${evaluated.errors.length} binding evaluation error${
          evaluated.errors.length === 1 ? '' : 's'
        }`,
        detail: evaluated.errors[0].message,
        at: Date.now(),
      });
    }
  }, [recordRuntimeEvent]);

  useEffect(() => {
    setIsCompiling(true);
    const timer = setTimeout(() => {
      const result = compile(source, { assets });
      setCompilation(result);
      setIsCompiling(false);
      if (!result.valid) {
        recordRuntimeEvent({
          kind: 'error',
          message: `Compile failed with ${result.counts.error} error${
            result.counts.error === 1 ? '' : 's'
          }`,
          detail: 'Preview keeps the last valid scene until the source compiles.',
          at: Date.now(),
        });
        return;
      }

      const session = sessionRef.current;
      const resetSession = session.loadNonce !== loadNonce || !session.runtime;
      if (resetSession) {
        session.runtime = new RuntimeState(result.registry);
        session.navigation = new NavigationManager(result.scene, result.initialPage);
        session.loadNonce = loadNonce;
      } else {
        session.runtime.mergeRegistry(result.registry, { forceReset: false });
        session.navigation.configure(result.scene, {
          initialPage: result.initialPage,
          reset: false,
        });
      }
      session.bindingEngine = new BindingEngine(result.bindings);
      session.executor = new ActionExecutor({
        runtime: session.runtime,
        navigation: session.navigation,
      });
      session.compiled = result;
      setLastGood(result);
      refresh();
    }, 250);

    return () => clearTimeout(timer);
  }, [source, assets, loadNonce, compileNonce, refresh, recordRuntimeEvent]);

  const setVariable = useCallback(
    (path, value) => {
      const session = sessionRef.current;
      if (!session.runtime) return { ok: false, error: 'No valid runtime.' };
      try {
        session.runtime.set(path, value);
        refresh();
        return { ok: true };
      } catch (error) {
        recordRuntimeEvent({ kind: 'error', message: error.message, at: Date.now() });
        return { ok: false, error: error.message };
      }
    },
    [refresh, recordRuntimeEvent],
  );

  const toggleVariable = useCallback(
    (path) => {
      const session = sessionRef.current;
      if (!session.runtime) return { ok: false, error: 'No valid runtime.' };
      try {
        session.runtime.toggle(path);
        refresh();
        return { ok: true };
      } catch (error) {
        recordRuntimeEvent({ kind: 'error', message: error.message, at: Date.now() });
        return { ok: false, error: error.message };
      }
    },
    [refresh, recordRuntimeEvent],
  );

  const resetVariable = useCallback(
    (path) => {
      const session = sessionRef.current;
      if (!session.runtime) return { ok: false, error: 'No valid runtime.' };
      try {
        session.runtime.reset(path);
        refresh();
        return { ok: true };
      } catch (error) {
        recordRuntimeEvent({ kind: 'error', message: error.message, at: Date.now() });
        return { ok: false, error: error.message };
      }
    },
    [refresh, recordRuntimeEvent],
  );

  const resetAllVariables = useCallback(() => {
    const session = sessionRef.current;
    if (!session.runtime) return;
    session.runtime.resetAll();
    session.navigation?.reset(session.compiled?.initialPage);
    refresh();
    recordRuntimeEvent({ kind: 'info', message: 'Runtime reset to initial values.', at: Date.now() });
  }, [refresh, recordRuntimeEvent]);

  const runActions = useCallback(
    (node) => {
      const session = sessionRef.current;
      if (!session.executor || !node?.actions?.length) {
        if (node && !node.actions?.length) {
          recordRuntimeEvent({
            kind: 'info',
            message: `${node.id} has no onPress actions.`,
            at: Date.now(),
          });
        }
        return;
      }
      const result = session.executor.execute(node.actions);
      refresh();
      recordRuntimeEvent({
        kind: result.ok ? 'action' : 'error',
        message: node.actions.map((action) => action.source || action.name).join('; '),
        detail: result.errors.length
          ? result.errors.map((error) => error.message).join(' · ')
          : result.changes.map((change) => `${change.type}: ${change.path || change.pageId}`).join(' · '),
        at: Date.now(),
      });
    },
    [refresh, recordRuntimeEvent],
  );

  const navigate = useCallback(
    (pageId) => {
      const session = sessionRef.current;
      if (!session.navigation) return;
      const result = session.navigation.navigate(pageId);
      refresh();
      if (!result.ok) {
        recordRuntimeEvent({ kind: 'error', message: result.reason, at: Date.now() });
      }
    },
    [refresh, recordRuntimeEvent],
  );

  const back = useCallback(() => {
    const session = sessionRef.current;
    if (!session.navigation) return;
    session.navigation.back();
    refresh();
  }, [refresh]);

  const forceCompile = useCallback(() => setCompileNonce((value) => value + 1), []);

  const previewScene = lastGood?.scene || null;
  const stale = Boolean(compilation && !compilation.valid && lastGood);
  const noValidPreview = !lastGood;

  return {
    compilation,
    lastGood,
    previewScene,
    stale,
    noValidPreview,
    isCompiling,
    compileNow: forceCompile,
    runtimeValues,
    bindingValues,
    navigationState,
    variableEntries,
    runtimeEvents,
    setVariable,
    toggleVariable,
    resetVariable,
    resetAllVariables,
    runActions,
    navigate,
    back,
  };
}
