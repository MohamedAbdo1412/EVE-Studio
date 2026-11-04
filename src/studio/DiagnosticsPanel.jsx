import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  ListFilter,
  XCircle,
} from 'lucide-react';

const SEVERITY_META = {
  error: { icon: <XCircle size={13} />, label: 'Errors' },
  warning: { icon: <AlertTriangle size={13} />, label: 'Warnings' },
  info: { icon: <Info size={13} />, label: 'Info' },
};

export default function DiagnosticsPanel({
  compilation,
  isCompiling,
  onReveal,
  stale,
}) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(true);
  const counts = compilation?.counts || { error: 0, warning: 0, info: 0 };
  const diagnostics = compilation?.diagnostics || [];
  const filtered = useMemo(() => {
    if (filter === 'all') return diagnostics;
    return diagnostics.filter((diagnostic) => diagnostic.severity === filter);
  }, [diagnostics, filter]);

  const summary = isCompiling
    ? 'Compiling…'
    : counts.error > 0
      ? `${counts.error} error${counts.error === 1 ? '' : 's'}`
      : counts.warning > 0
        ? `${counts.warning} warning${counts.warning === 1 ? '' : 's'}`
        : compilation
          ? 'No diagnostics'
          : 'Compiler idle';

  return (
    <section className={`eve-diagnostics${expanded ? '' : ' is-collapsed'}`} aria-label="Diagnostics">
      <div className="eve-diagnostics-header">
        <button
          type="button"
          className="eve-diagnostics-title"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          <ListFilter size={14} />
          <span>Diagnostics</span>
          <span
            className={`eve-diag-summary ${counts.error > 0 ? 'error' : counts.warning > 0 ? 'warning' : 'success'}`}
          >
            {summary}
          </span>
          {stale ? <span className="eve-stale-tag">STALE PREVIEW</span> : null}
        </button>
        <div className="eve-diagnostics-filters">
          <button
            type="button"
            className={filter === 'all' ? 'is-active' : ''}
            onClick={() => setFilter('all')}
          >
            All <em>{diagnostics.length}</em>
          </button>
          {Object.entries(SEVERITY_META).map(([severity, meta]) => (
            <button
              key={severity}
              type="button"
              className={`${filter === severity ? 'is-active' : ''} ${severity}`}
              onClick={() => setFilter(severity)}
              disabled={counts[severity] === 0}
            >
              {meta.icon}
              <em>{counts[severity] || 0}</em>
            </button>
          ))}
          <span className="eve-diagnostics-stage">
            {compilation ? `${compilation.report.compilerVersion}` : ''}
          </span>
        </div>
      </div>

      {expanded ? (
        <div className="eve-diagnostics-body">
          {isCompiling && !compilation ? (
            <div className="eve-diagnostics-empty">Running the EVE compiler…</div>
          ) : filtered.length === 0 ? (
            <div className="eve-diagnostics-empty success">
              <CheckCircle2 size={16} />
              {diagnostics.length === 0 && compilation
                ? 'Clean compile. No errors, warnings or information diagnostics.'
                : filter === 'all'
                  ? 'No diagnostics to show.'
                  : `No ${filter} diagnostics.`}
            </div>
          ) : (
            filtered.map((diagnostic, index) => (
              <button
                type="button"
                key={`${diagnostic.code}-${diagnostic.line}-${diagnostic.column}-${index}`}
                className={`eve-diagnostic-row ${diagnostic.severity}`}
                onClick={() => onReveal(diagnostic.line, diagnostic.column)}
                title={diagnostic.hint || diagnostic.message}
              >
                <span className={`eve-diag-icon ${diagnostic.severity}`}>
                  {SEVERITY_META[diagnostic.severity]?.icon || <Info size={13} />}
                </span>
                <span className="eve-diag-code">{diagnostic.code}</span>
                <span className="eve-diag-message">
                  {diagnostic.message}
                  {diagnostic.hint ? <small>{diagnostic.hint}</small> : null}
                </span>
                <span className="eve-diag-stage">{diagnostic.stage}</span>
                <span className="eve-diag-location">
                  {diagnostic.line}:{diagnostic.column}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
