import React from 'react';
import {
  ArrowLeft,
  CircleAlert,
  Clock3,
  Eye,
  Gauge,
  History,
  MonitorPlay,
  Radio,
} from 'lucide-react';
import EVESceneRenderer from '../components/simulator/EVESceneRenderer.jsx';

export default function PreviewPanel({
  scene,
  activePageId,
  navigationState,
  bindingValues,
  assets,
  selectedId,
  onSelectNode,
  onAction,
  onNavigate,
  onBack,
  stale,
  compilation,
  variableCount,
}) {
  const page = scene?.pages?.find((candidate) => candidate.id === activePageId) || scene?.pages?.[0];
  const hasErrors = (compilation?.counts?.error || 0) > 0;

  return (
    <section className="eve-preview-panel" aria-label="Interactive simulator">
      <div className="eve-preview-header">
        <div className="eve-preview-title">
          <MonitorPlay size={15} />
          <span>Simulator</span>
          {scene ? (
            <span className="eve-live-pill">
              <Radio size={10} /> LIVE
            </span>
          ) : null}
        </div>
        <div className="eve-preview-controls">
          <button
            type="button"
            className="eve-icon-button"
            onClick={onBack}
            disabled={!navigationState?.canGoBack}
            title="Back using runtime history"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="eve-page-tabs" role="tablist" aria-label="Simulator pages">
            {(scene?.pages || []).map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={candidate.id === page?.id}
                className={candidate.id === page?.id ? 'is-active' : ''}
                onClick={() => onNavigate(candidate.id)}
                title={`${candidate.title} (${candidate.id})`}
              >
                {candidate.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`eve-preview-stage-wrap${stale ? ' is-stale' : ''}`}>
        {stale ? (
          <div className="eve-stale-banner" role="status">
            <CircleAlert size={14} />
            <span>Stale preview: showing the last valid scene.</span>
            <span className="eve-stale-count">
              {compilation?.counts?.error || 0} current error
              {(compilation?.counts?.error || 0) === 1 ? '' : 's'}
            </span>
          </div>
        ) : null}

        {scene ? (
          <EVESceneRenderer
            scene={scene}
            activePageId={page?.id}
            bindingValues={bindingValues}
            assets={assets}
            selectedId={selectedId}
            onSelect={onSelectNode}
            onAction={onAction}
            scaleMode={scene.app?.scale || 'fit'}
          />
        ) : (
          <div className="eve-preview-empty">
            <Eye size={30} />
            <h3>No valid scene</h3>
            <p>
              {hasErrors
                ? `The compiler reported ${compilation.counts.error} error${
                    compilation.counts.error === 1 ? '' : 's'
                  }. Fix them to create the first runtime scene.`
                : 'Write an <app> with at least one <page> to start the simulator.'}
            </p>
          </div>
        )}
      </div>

      <div className="eve-preview-footer">
        <div className="eve-preview-breadcrumb">
          <History size={12} />
          {(navigationState?.breadcrumb || []).length > 0 ? (
            (navigationState.breadcrumb || []).map((entry, index) => (
              <span key={`${entry.id}-${index}`}>
                {index > 0 ? <span className="eve-breadcrumb-sep">/</span> : null}
                {entry.title}
              </span>
            ))
          ) : (
            <span>{page?.title || 'No page'}</span>
          )}
        </div>
        <div className="eve-preview-meta">
          <span title="Logical rendering scale">
            <Gauge size={12} /> {scene?.app?.scale || '—'}
          </span>
          <span title="Runtime variables">
            <Radio size={12} /> {variableCount} vars
          </span>
          <span title="Compile duration">
            <Clock3 size={12} /> {compilation ? `${compilation.durationMs.toFixed(1)} ms` : '—'}
          </span>
          {selectedId ? <span className="eve-selected-chip">selected: {selectedId}</span> : null}
        </div>
      </div>
    </section>
  );
}
