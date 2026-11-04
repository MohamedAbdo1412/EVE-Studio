import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Code2,
  Cpu,
  Download,
  Loader2,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { createExportZip, downloadBlob } from '../language/compiler/exportPackage.js';

function compilerTone({ isCompiling, compilation }) {
  if (isCompiling) return { tone: 'info', label: 'Compiling', icon: <Loader2 size={13} className="spin" /> };
  if (!compilation) return { tone: 'idle', label: 'Idle', icon: <Cloud size={13} /> };
  if (compilation.counts.error > 0) {
    return {
      tone: 'error',
      label: `${compilation.counts.error} error${compilation.counts.error === 1 ? '' : 's'}`,
      icon: <XCircle size={13} />,
    };
  }
  if (compilation.counts.warning > 0) {
    return {
      tone: 'warning',
      label: `${compilation.counts.warning} warning${compilation.counts.warning === 1 ? '' : 's'}`,
      icon: <AlertTriangle size={13} />,
    };
  }
  return { tone: 'success', label: 'Compiled', icon: <CheckCircle2 size={13} /> };
}

function saveLabel(state) {
  if (state === 'saving') return 'Saving…';
  if (state === 'unsaved') return 'Unsaved changes';
  if (state === 'error') return 'Save failed';
  return 'Saved locally';
}

export default function Toolbar({
  projectName,
  setProjectName,
  saveState,
  saveError,
  lastSavedAt,
  onSave,
  isCompiling,
  compilation,
  lastGood,
  onCompile,
  onResetRuntime,
  onShowCpp,
  onShowDocs,
  onShowHardware,
  assets,
  onNotify,
  canExport,
}) {
  const [exporting, setExporting] = useState(false);
  const status = compilerTone({ isCompiling, compilation });
  const statusTone = status.tone;

  const handleExport = async () => {
    if (!lastGood || !canExport) {
      onNotify?.({
        kind: 'error',
        message: 'Fix the current compile errors before exporting a package.',
      });
      return;
    }
    setExporting(true);
    try {
      const { blob, filename } = await createExportZip({
        scene: lastGood.scene,
        registry: lastGood.registry,
        bindings: lastGood.bindings,
        assets,
        assetManifest: lastGood.assetManifest,
        cpp: lastGood.cpp,
        diagnostics: lastGood.diagnostics,
        appConfig: lastGood.appConfig,
        stats: {
          pages: lastGood.layoutStats.pages,
          components: lastGood.layoutStats.components,
          variables: lastGood.registry.length,
          bindings: lastGood.bindings.bindings.length,
          assets: Object.keys(assets || {}).length,
        },
      });
      downloadBlob(blob, filename);
      onNotify?.({ kind: 'success', message: `Exported ${filename}` });
    } catch (error) {
      onNotify?.({ kind: 'error', message: `Export failed: ${error.message}` });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="eve-studio-toolbar">
      <div className="eve-toolbar-project">
        <div className="eve-project-mark" aria-hidden="true">
          <Sparkles size={16} />
        </div>
        <div className="eve-project-copy">
          <input
            className="eve-project-name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            aria-label="Project name"
          />
          <span className={`eve-save-state ${saveState}`} title={saveError || saveLabel(saveState)}>
            {saveState === 'error' ? <CloudOff size={11} /> : <Cloud size={11} />}
            {saveLabel(saveState)}
            {saveState === 'saved' && lastSavedAt
              ? ` · ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </span>
        </div>
      </div>

      <div className={`eve-compile-status ${statusTone}`} role="status">
        {status.icon}
        <span>{status.label}</span>
        {compilation && !isCompiling ? (
          <span className="eve-compile-duration">{compilation.durationMs.toFixed(1)} ms</span>
        ) : null}
      </div>

      <div className="eve-toolbar-actions">
        <button type="button" className="eve-button ghost" onClick={onShowDocs} title="Open documentation">
          <Code2 size={14} />
          Docs
        </button>
        <button
          type="button"
          className="eve-button ghost"
          onClick={onShowHardware}
          title="Build the ROM, ESP32 project and RTL hardware artifacts"
        >
          <Cpu size={14} />
          Hardware
        </button>
        <button
          type="button"
          className="eve-button ghost"
          onClick={onShowCpp}
          disabled={!lastGood}
          title="Open generated C++ API"
        >
          <Code2 size={14} />
          C++ API
        </button>
        <button
          type="button"
          className="eve-button ghost"
          onClick={onCompile}
          disabled={isCompiling}
          title="Compile the current source now"
        >
          <Play size={14} />
          Compile
        </button>
        <button
          type="button"
          className="eve-button ghost"
          onClick={onResetRuntime}
          disabled={!lastGood}
          title="Reset all runtime variables to their initial values"
        >
          <RotateCcw size={14} />
          Reset
        </button>
        <button
          type="button"
          className="eve-button ghost"
          onClick={onSave}
          title="Save to browser local storage"
        >
          <Save size={14} />
          Save
        </button>
        <button
          type="button"
          className="eve-button primary"
          onClick={handleExport}
          disabled={!lastGood || !canExport || exporting}
          title={canExport ? 'Download an intermediate EVE package' : 'Fix compile errors before export'}
        >
          {exporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
          {exporting ? 'Packaging…' : 'Export ZIP'}
        </button>
      </div>
    </div>
  );
}
