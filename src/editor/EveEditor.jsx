import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  search,
  searchKeymap,
  highlightSelectionMatches,
} from '@codemirror/search';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from '@codemirror/language';
import { linter, lintGutter, lintKeymap, forceLinting } from '@codemirror/lint';
import {
  createEveCompletionSource,
  eveEditorExtensions,
  eveEditorTheme,
} from './eveLanguage.js';

function mapDiagnostics(diagnostics, state) {
  const lines = state.doc.lines;
  return (diagnostics || []).map((diagnostic) => {
    const lineNumber = Math.max(1, Math.min(lines, diagnostic.line || 1));
    const line = state.doc.line(lineNumber);
    const column = Math.max(1, Math.min(line.length + 1, diagnostic.column || 1));
    const from = Math.min(state.doc.length, line.from + column - 1);
    let to = from + 1;
    if (diagnostic.endLine === diagnostic.line && diagnostic.endColumn > diagnostic.column) {
      to = Math.min(line.to, line.from + diagnostic.endColumn - 1);
    }
    if (to <= from) to = Math.min(state.doc.length, from + 1);
    const severity =
      diagnostic.severity === 'error'
        ? 'error'
        : diagnostic.severity === 'warning'
          ? 'warning'
          : 'info';
    return {
      from,
      to,
      severity,
      source: diagnostic.code,
      message: `${diagnostic.code}: ${diagnostic.message}${
        diagnostic.hint ? `\n${diagnostic.hint}` : ''
      }`,
    };
  });
}

const EveEditor = forwardRef(function EveEditor(
  {
    value,
    onChange,
    diagnostics,
    variables = [],
    assets = {},
    pages = [],
    onCursor,
    ariaLabel = 'EVE source editor',
  },
  ref,
) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const syncingRef = useRef(false);
  const diagnosticsRef = useRef(diagnostics || []);
  const variablesRef = useRef(variables);
  const assetsRef = useRef(assets);
  const pagesRef = useRef(pages);
  const onChangeRef = useRef(onChange);
  const onCursorRef = useRef(onCursor);

  diagnosticsRef.current = diagnostics || [];
  variablesRef.current = variables;
  assetsRef.current = assets;
  pagesRef.current = pages;
  onChangeRef.current = onChange;
  onCursorRef.current = onCursor;

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const completionSource = createEveCompletionSource({
      getVariables: () => variablesRef.current,
      getAssets: () => assetsRef.current,
      getPages: () => pagesRef.current,
    });
    const lintSource = (view) => mapDiagnostics(diagnosticsRef.current, view.state);
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter({ openText: '−', closedText: '+' }),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        EditorState.tabSize.of(4),
        indentUnit.of('    '),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({
          override: [completionSource],
          activateOnTyping: true,
          icons: true,
          maxRenderedOptions: 40,
        }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        linter(lintSource, { delay: 80 }),
        lintGutter(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        ...eveEditorExtensions,
        eveEditorTheme,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingRef.current) {
            onChangeRef.current?.(update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged || update.focusChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            onCursorRef.current?.({
              line: line.number,
              column: head - line.from + 1,
              selected: update.state.selection.main.to - update.state.selection.main.from,
            });
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is intentionally created once; props are synced through refs/effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      syncingRef.current = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        selection: { anchor: Math.min(view.state.selection.main.anchor, value.length) },
      });
      syncingRef.current = false;
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    forceLinting(view);
  }, [diagnostics]);

  useImperativeHandle(
    ref,
    () => ({
      focusPosition(lineNumber, column = 1) {
        const view = viewRef.current;
        if (!view) return;
        const line = view.state.doc.line(
          Math.max(1, Math.min(view.state.doc.lines, lineNumber || 1)),
        );
        const position = Math.min(line.to, line.from + Math.max(0, column - 1));
        view.dispatch({
          selection: { anchor: position },
          effects: EditorView.scrollIntoView(position, { y: 'center' }),
        });
        view.focus();
      },
      focus() {
        viewRef.current?.focus();
      },
      getCursor() {
        const view = viewRef.current;
        if (!view) return { line: 1, column: 1 };
        const head = view.state.selection.main.head;
        const line = view.state.doc.lineAt(head);
        return { line: line.number, column: head - line.from + 1 };
      },
      getView() {
        return viewRef.current;
      },
    }),
    [],
  );

  return <div className="eve-editor-host" ref={hostRef} />;
});

export default EveEditor;
