import React, { useEffect, useState } from 'react';
import { Check, Clipboard, Download, FileCode2, Info, Wand2 } from 'lucide-react';
import EveEditor from '../editor/EveEditor.jsx';
import CodeViewer from '../components/ui/CodeViewer.jsx';
import { downloadText } from '../language/compiler/exportPackage.js';

export default function EditorWorkspace({
  source,
  onChange,
  diagnostics,
  variables,
  assets,
  pages,
  editorRef,
  cpp,
  activeTab,
  onTabChange,
  cursor,
  onCursor,
  onNotify,
  onOpenDocs,
}) {
  const files = cpp?.files || [];
  const [activeFile, setActiveFile] = useState(files[0]?.name || '');
  const [copied, setCopied] = useState(false);
  const effectiveTab = activeTab || 'source';

  useEffect(() => {
    if (files.length && !files.some((file) => file.name === activeFile)) {
      setActiveFile(files[0].name);
    }
  }, [files, activeFile]);

  const selectedFile = files.find((file) => file.name === activeFile) || files[0] || null;

  const copy = async () => {
    if (!selectedFile) return;
    try {
      await navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
      onNotify?.({ kind: 'success', message: `Copied ${selectedFile.name}` });
    } catch {
      onNotify?.({ kind: 'error', message: 'Clipboard access was denied.' });
    }
  };

  return (
    <section className="eve-editor-panel" aria-label="Source editor">
      <div className="eve-editor-tabs">
        <button
          type="button"
          className={effectiveTab === 'source' ? 'is-active' : ''}
          onClick={() => onTabChange('source')}
        >
          <Wand2 size={13} /> EVE Source
        </button>
        <button
          type="button"
          className={effectiveTab === 'cpp' ? 'is-active' : ''}
          onClick={() => onTabChange('cpp')}
          disabled={!cpp}
        >
          <FileCode2 size={13} /> Generated C++
        </button>
        <div className="eve-editor-tab-meta">
          {effectiveTab === 'source' ? (
            <>
              <span>Ln {cursor?.line || 1}, Col {cursor?.column || 1}</span>
              <span>UTF-8</span>
              <span>EVE 0.1</span>
            </>
          ) : (
            <>
              <span>{cpp?.className || 'No API'}</span>
              <span>{cpp?.methods.length || 0} setters</span>
            </>
          )}
        </div>
      </div>

      {effectiveTab === 'source' ? (
        <div className="eve-source-wrap">
          <EveEditor
            ref={editorRef}
            value={source}
            onChange={onChange}
            diagnostics={diagnostics}
            variables={variables}
            assets={assets}
            pages={pages}
            onCursor={onCursor}
          />
        </div>
      ) : (
        <div className="eve-cpp-panel">
          <div className="eve-cpp-toolbar">
            <div className="eve-file-tabs">
              {files.map((file) => (
                <button
                  key={file.name}
                  type="button"
                  className={file.name === selectedFile?.name ? 'is-active' : ''}
                  onClick={() => setActiveFile(file.name)}
                >
                  {file.name}
                </button>
              ))}
            </div>
            <div className="eve-cpp-actions">
              <button type="button" className="eve-text-button" onClick={copy} disabled={!selectedFile}>
                {copied ? <Check size={12} /> : <Clipboard size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className="eve-text-button"
                onClick={() => selectedFile && downloadText(selectedFile.content, selectedFile.name, 'text/x-c++src')}
                disabled={!selectedFile}
              >
                <Download size={12} /> Download
              </button>
            </div>
          </div>
          <div className="eve-cpp-notice">
            <Info size={12} />
            Provisional, transport-independent MCU API draft. This is not FPGA firmware, a bitstream or
            a finalized protocol.
          </div>
          {selectedFile ? (
            <CodeViewer code={selectedFile.content} language="cpp" />
          ) : (
            <div className="eve-cpp-empty">Compile a valid project to generate the C++ API.</div>
          )}
        </div>
      )}

      {effectiveTab === 'source' && cpp ? (
        <button type="button" className="eve-editor-fab" onClick={() => onTabChange('cpp')}>
          <FileCode2 size={12} /> View generated C++
        </button>
      ) : null}
      <button type="button" className="eve-editor-fab secondary" onClick={onOpenDocs}>
        <Info size={12} /> Syntax reference
      </button>
    </section>
  );
}
