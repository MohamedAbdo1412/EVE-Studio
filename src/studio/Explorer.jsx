import React, { useMemo, useRef, useState } from 'react';
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  FileImage,
  FolderTree,
  Image as ImageIcon,
  Monitor,
  Trash2,
  Upload,
  AlertTriangle,
  Film,
  Component,
} from 'lucide-react';
import { fileToAsset, formatBytes } from '../assets/demoAssets.js';

function tagIcon(tag) {
  if (tag === 'page') return <Monitor size={13} />;
  if (tag === 'img') return <ImageIcon size={13} />;
  if (tag === 'vid') return <Film size={13} />;
  if (tag === 'group' || tag === 'button') return <Boxes size={13} />;
  return <Component size={13} />;
}

function ComponentTree({ nodes, depth = 0, selectedId, onSelectNode, collapsed, toggleCollapsed }) {
  return nodes.map((node) => {
    const key = node.id;
    const isCollapsed = collapsed.has(key);
    const hasChildren = node.children?.length > 0;
    return (
      <div key={key} className="eve-tree-branch">
        <div
          className={`eve-tree-row${selectedId === key ? ' is-selected' : ''}`}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
        >
          <button
            type="button"
            className="eve-tree-caret"
            onClick={() => onSelectNode?.(node)}
            aria-label={`Select ${node.id}`}
          >
            {tagIcon(node.tag)}
          </button>
          <button type="button" className="eve-tree-label" onClick={() => onSelectNode?.(node)}>
            <span className="eve-tree-id">{node.id}</span>
            <span className="eve-tree-tag">&lt;{node.tag}&gt;</span>
          </button>
          {hasChildren ? (
            <button
              type="button"
              className="eve-icon-button tiny"
              onClick={() => toggleCollapsed(key)}
              aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            >
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
          ) : null}
        </div>
        {hasChildren && !isCollapsed ? (
          <ComponentTree
            nodes={node.children}
            depth={depth + 1}
            selectedId={selectedId}
            onSelectNode={onSelectNode}
            collapsed={collapsed}
            toggleCollapsed={toggleCollapsed}
          />
        ) : null}
      </div>
    );
  });
}

export default function Explorer({
  compilation,
  previewScene,
  assets,
  addAssets,
  removeAsset,
  selectedId,
  onSelectNode,
  activePage,
  onNavigate,
  onNotify,
}) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const scene = compilation?.scene || previewScene;
  const pages = scene?.pages || [];
  const missingPaths = new Set((compilation?.assetManifest?.missing || []).map((item) => item.path));
  const assetList = useMemo(
    () =>
      Object.values(assets || {}).sort((left, right) =>
        String(left.path).localeCompare(String(right.path)),
      ),
    [assets],
  );

  const toggleCollapsed = (key) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    const accepted = {};
    const errors = [];
    for (const file of files) {
      try {
        const asset = await fileToAsset(file, { ...assets, ...accepted });
        accepted[asset.path] = asset;
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`);
      }
    }
    if (Object.keys(accepted).length) {
      addAssets(accepted);
      onNotify?.({
        kind: 'success',
        message: `${Object.keys(accepted).length} asset${Object.keys(accepted).length === 1 ? '' : 's'} registered.`,
      });
    }
    if (errors.length) onNotify?.({ kind: 'error', message: errors.join(' ') });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploading(false);
  };

  return (
    <aside className="eve-explorer" aria-label="Project explorer">
      <div className="eve-panel-heading">
        <FolderTree size={15} />
        <span>Project Explorer</span>
        <span className="eve-heading-count">{pages.length} pages</span>
      </div>

      <div className="eve-explorer-scroll">
        <section className="eve-explorer-section">
          <div className="eve-section-label">Pages</div>
          {pages.length === 0 ? (
            <div className="eve-empty-inline">No resolved pages yet.</div>
          ) : (
            <div className="eve-page-list">
              {pages.map((page) => (
                <div key={page.id}>
                  <button
                    type="button"
                    className={`eve-page-row${activePage === page.id ? ' is-active' : ''}`}
                    onClick={() => onNavigate?.(page.id)}
                    title={`Preview ${page.title}`}
                  >
                    <Monitor size={14} />
                    <span className="eve-page-title">{page.title}</span>
                    <span className="eve-page-id">{page.id}</span>
                    {page.initial ? <span className="eve-initial-pill">INITIAL</span> : null}
                  </button>
                  <ComponentTree
                    nodes={page.components || []}
                    selectedId={selectedId}
                    onSelectNode={onSelectNode}
                    collapsed={collapsed}
                    toggleCollapsed={toggleCollapsed}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="eve-explorer-section">
          <div className="eve-section-label">
            <span>Assets</span>
            <button
              type="button"
              className="eve-text-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload size={12} /> {uploading ? 'Reading…' : 'Upload'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
            multiple
            hidden
            onChange={(event) => handleUpload([...event.target.files])}
          />
          {assetList.length === 0 ? (
            <div className="eve-empty-inline">No assets registered.</div>
          ) : (
            <div className="eve-asset-list">
              {assetList.map((asset) => {
                const missing = missingPaths.has(asset.path);
                return (
                  <div key={asset.path} className={`eve-asset-row${missing ? ' is-missing' : ''}`}>
                    <span className="eve-asset-icon">
                      {String(asset.type).startsWith('video/') ? (
                        <Film size={13} />
                      ) : (
                        <FileImage size={13} />
                      )}
                    </span>
                    <span className="eve-asset-meta">
                      <span className="eve-asset-name" title={asset.path}>
                        {asset.name || asset.path}
                      </span>
                      <span className="eve-asset-sub">
                        {formatBytes(asset.size)} · {String(asset.type || 'unknown')}
                      </span>
                    </span>
                    {missing ? <AlertTriangle size={12} className="eve-warn-icon" /> : null}
                    <button
                      type="button"
                      className="eve-icon-button tiny danger"
                      title={`Remove ${asset.path}`}
                      onClick={() => {
                        if (window.confirm(`Remove asset "${asset.path}"?`)) removeAsset(asset.path);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="eve-explorer-footer">
        <div>
          <span className="eve-muted">Logical resolution</span>
          <strong>
            {scene?.app?.width || '—'} × {scene?.app?.height || '—'}
          </strong>
        </div>
        <div>
          <span className="eve-muted">Scene components</span>
          <strong>{compilation?.layoutStats?.components ?? '—'}</strong>
        </div>
      </div>
    </aside>
  );
}
