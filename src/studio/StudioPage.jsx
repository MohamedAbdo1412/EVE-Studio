import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useProject } from '../project/ProjectContext.jsx';
import { useStudioSession } from './useStudioSession.js';
import Toolbar from './Toolbar.jsx';
import Explorer from './Explorer.jsx';
import EditorWorkspace from './EditorWorkspace.jsx';
import PreviewPanel from './PreviewPanel.jsx';
import InspectorPanel from './InspectorPanel.jsx';
import DiagnosticsPanel from './DiagnosticsPanel.jsx';

function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  const Icon = toast.kind === 'error' ? AlertCircle : toast.kind === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`eve-toast ${toast.kind || 'info'}`} role="status">
      <Icon size={15} />
      <span>{toast.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification">
        <X size={13} />
      </button>
    </div>
  );
}

export default function StudioPage() {
  const {
    source,
    assets,
    projectName,
    setProjectName,
    saveState,
    saveError,
    lastSavedAt,
    setCompilerStatus,
    updateSource,
    addAssets,
    removeAsset,
    saveNow,
    loadNonce,
    restored,
  } = useProject();
  const navigate = useNavigate();
  const editorRef = useRef(null);
  const session = useStudioSession({ source, assets, loadNonce });
  const [selectedId, setSelectedId] = useState(null);
  const [editorTab, setEditorTab] = useState('source');
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [toast, setToast] = useState(null);
  const restoredNotified = useRef(false);

  const notify = useCallback((nextToast) => {
    setToast({ ...nextToast, at: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (restored && !restoredNotified.current) {
      restoredNotified.current = true;
      notify({
        kind: 'info',
        message: 'Restored the last project from this browser’s local storage.',
      });
    }
  }, [restored, notify]);

  useEffect(() => {
    if (session.isCompiling) {
      setCompilerStatus({
        status: 'busy',
        label: 'Compiling',
        errors: 0,
        warnings: 0,
        message: 'Compiling source…',
      });
      return;
    }
    const compilation = session.compilation;
    if (!compilation) {
      setCompilerStatus({
        status: 'ready',
        label: 'Ready',
        errors: 0,
        warnings: 0,
        message: 'Compiler idle',
      });
      return;
    }
    setCompilerStatus({
      status: compilation.report.status,
      label:
        compilation.counts.error > 0
          ? 'Compile error'
          : compilation.counts.warning > 0
            ? 'Warnings'
            : 'Compiled',
      errors: compilation.counts.error,
      warnings: compilation.counts.warning,
      message: compilation.diagnostics[0]?.message || 'Clean compile',
    });
  }, [session.isCompiling, session.compilation, setCompilerStatus]);

  const reveal = useCallback(
    (line, column = 1) => {
      setEditorTab('source');
      requestAnimationFrame(() => editorRef.current?.focusPosition(line, column));
    },
    [],
  );

  const handleSelectNode = useCallback((node) => {
    setSelectedId(node?.id || null);
  }, []);

  const activePage =
    session.navigationState.activePage || session.previewScene?.initialPage || null;
  const variables =
    session.compilation?.registry?.length > 0
      ? session.compilation.registry
      : session.lastGood?.registry || [];
  const pages = session.compilation?.pages || session.lastGood?.pages || [];
  const cpp = session.lastGood?.cpp || session.compilation?.cpp || null;
  const canExport = Boolean(session.compilation?.valid) && !session.isCompiling;

  return (
    <div className="eve-studio">
      <Toolbar
        projectName={projectName}
        setProjectName={setProjectName}
        saveState={saveState}
        saveError={saveError}
        lastSavedAt={lastSavedAt}
        onSave={saveNow}
        isCompiling={session.isCompiling}
        compilation={session.compilation}
        lastGood={session.lastGood}
        onCompile={session.compileNow}
        onResetRuntime={session.resetAllVariables}
        onShowCpp={() => setEditorTab('cpp')}
        onShowDocs={() => navigate('/docs')}
        onShowHardware={() => navigate('/hardware')}
        assets={assets}
        onNotify={notify}
        canExport={canExport}
      />

      <div className="eve-studio-body">
        <Explorer
          compilation={session.compilation}
          previewScene={session.previewScene}
          assets={assets}
          addAssets={addAssets}
          removeAsset={removeAsset}
          selectedId={selectedId}
          onSelectNode={handleSelectNode}
          activePage={activePage}
          onNavigate={session.navigate}
          onNotify={notify}
        />

        <main className="eve-studio-main">
          <div className="eve-split">
            <EditorWorkspace
              source={source}
              onChange={updateSource}
              diagnostics={session.compilation?.diagnostics || []}
              variables={variables}
              assets={assets}
              pages={pages}
              editorRef={editorRef}
              cpp={cpp}
              activeTab={editorTab}
              onTabChange={setEditorTab}
              cursor={cursor}
              onCursor={setCursor}
              onNotify={notify}
              onOpenDocs={() => navigate('/docs/language')}
            />
            <PreviewPanel
              scene={session.previewScene}
              activePageId={activePage}
              navigationState={session.navigationState}
              bindingValues={session.bindingValues}
              assets={assets}
              selectedId={selectedId}
              onSelectNode={handleSelectNode}
              onAction={session.runActions}
              onNavigate={session.navigate}
              onBack={session.back}
              stale={session.stale}
              compilation={session.compilation}
              variableCount={session.variableEntries.length}
            />
          </div>
          <DiagnosticsPanel
            compilation={session.compilation}
            isCompiling={session.isCompiling}
            onReveal={reveal}
            stale={session.stale}
          />
        </main>

        <InspectorPanel
          variables={session.variableEntries}
          assets={assets}
          bindingValues={session.bindingValues}
          compilation={session.compilation}
          lastGood={session.lastGood}
          scene={session.previewScene || session.compilation?.scene}
          selectedId={selectedId}
          onSelectNode={handleSelectNode}
          onSetVariable={session.setVariable}
          onToggleVariable={session.toggleVariable}
          onResetVariable={session.resetVariable}
          onResetAllVariables={session.resetAllVariables}
          runtimeEvents={session.runtimeEvents}
          onReveal={reveal}
          onShowCpp={() => setEditorTab('cpp')}
          activePage={activePage}
        />
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
