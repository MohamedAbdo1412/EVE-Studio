import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Cpu,
  FileJson,
  GitBranch,
  ListChecks,
  MousePointerClick,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TerminalSquare,
  XCircle,
} from 'lucide-react';

function formatValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function typeTone(type) {
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'color') return 'color';
  if (type === 'image') return 'image';
  return 'string';
}

function NumberControl({ variable, onSet }) {
  const [draft, setDraft] = useState(String(variable.value));
  useEffect(() => {
    setDraft(String(variable.value));
  }, [variable.value]);

  const commit = () => {
    const number = Number(draft);
    if (!Number.isFinite(number)) {
      setDraft(String(variable.value));
      return;
    }
    onSet(variable.path, number);
  };

  return (
    <div className="eve-number-control">
      <button
        type="button"
        className="eve-step-button"
        onClick={() => onSet(variable.path, Number(variable.value) - 1)}
        aria-label="Decrease"
      >
        −
      </button>
      <input
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        aria-label={`${variable.path} value`}
      />
      <button
        type="button"
        className="eve-step-button"
        onClick={() => onSet(variable.path, Number(variable.value) + 1)}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

function VariableControl({ variable, assets, onSet, onToggle }) {
  if (variable.type === 'boolean') {
    return (
      <button
        type="button"
        className={`eve-switch${variable.value ? ' is-on' : ''}`}
        onClick={() => onToggle(variable.path)}
        aria-pressed={Boolean(variable.value)}
        aria-label={`Toggle ${variable.path}`}
      >
        <span className="eve-switch-knob" />
        <span>{variable.value ? 'true' : 'false'}</span>
      </button>
    );
  }
  if (variable.type === 'number') {
    return <NumberControl variable={variable} onSet={onSet} />;
  }
  if (variable.type === 'color') {
    const safeColor = /^#[0-9A-Fa-f]{6}$/.test(String(variable.value))
      ? String(variable.value)
      : '#00d084';
    return (
      <div className="eve-color-control">
        <input
          type="color"
          value={safeColor}
          onChange={(event) => onSet(variable.path, event.target.value)}
          aria-label={`${variable.path} color picker`}
        />
        <input
          type="text"
          value={String(variable.value)}
          onChange={(event) => {
            const value = event.target.value;
            if (/^(#[0-9A-Fa-f]{3,8}|transparent)$/.test(value) || value.startsWith('#')) {
              onSet(variable.path, value);
            }
          }}
          aria-label={`${variable.path} color value`}
        />
      </div>
    );
  }
  if (variable.type === 'image') {
    const options = Object.keys(assets || {});
    return (
      <select
        value={String(variable.value)}
        onChange={(event) => onSet(variable.path, event.target.value)}
        aria-label={`${variable.path} image asset`}
      >
        {!options.includes(String(variable.value)) ? (
          <option value={String(variable.value)}>{String(variable.value)} (missing)</option>
        ) : null}
        {options.map((path) => (
          <option key={path} value={path}>
            {path}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      value={String(variable.value ?? '')}
      onChange={(event) => onSet(variable.path, event.target.value)}
      aria-label={`${variable.path} value`}
    />
  );
}

function VariablesTab({ variables, assets, onSet, onToggle, onReset, onResetAll, runtimeEvents }) {
  const grouped = useMemo(() => {
    const groups = new Map();
    for (const variable of variables) {
      const parts = variable.path.split('.');
      const family = parts.length > 1 ? parts.slice(0, -1).join('.') : 'root';
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family).push(variable);
    }
    return [...groups.entries()];
  }, [variables]);

  if (variables.length === 0) {
    return (
      <div className="eve-inspector-empty">
        <SlidersHorizontal size={24} />
        <p>No runtime variables.</p>
        <span>Compile a valid app with a &lt;vars&gt; block to populate the registry.</span>
      </div>
    );
  }

  return (
    <div className="eve-tab-scroll">
      <div className="eve-inspector-action-row">
        <span>
          <CircleDot size={12} /> Runtime is live
        </span>
        <button type="button" className="eve-text-button" onClick={onResetAll}>
          <RotateCcw size={12} /> Reset all
        </button>
      </div>
      {grouped.map(([family, entries]) => (
        <div className="eve-variable-group" key={family}>
          <div className="eve-variable-family">
            <span>{family}</span>
            <span>{entries.length}</span>
          </div>
          {entries.map((variable) => (
            <div className="eve-variable-card" key={variable.path}>
              <div className="eve-variable-head">
                <span className={`eve-type-badge ${typeTone(variable.type)}`}>{variable.type}</span>
                <span className="eve-variable-path" title={variable.path}>
                  {variable.name}
                </span>
                <button
                  type="button"
                  className="eve-icon-button tiny"
                  title={`Reset ${variable.path}`}
                  onClick={() => onReset(variable.path)}
                >
                  <RotateCcw size={11} />
                </button>
              </div>
              <VariableControl
                variable={variable}
                assets={assets}
                onSet={onSet}
                onToggle={onToggle}
              />
              <div className="eve-variable-meta">
                <span>initial: {formatValue(variable.initialValue)}</span>
                <span className="eve-mono">0x{variable.id.toString(16).toUpperCase().padStart(8, '0')}</span>
                <span>{variable.references?.length || 0} refs</span>
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="eve-runtime-log">
        <div className="eve-section-label">Runtime log</div>
        {runtimeEvents.length === 0 ? (
          <div className="eve-empty-inline">Interact with the simulator to see actions.</div>
        ) : (
          runtimeEvents.map((event, index) => (
            <div key={`${event.at}-${index}`} className={`eve-log-row ${event.kind}`}>
              <span className="eve-log-dot" />
              <div>
                <div>{event.message}</div>
                {event.detail ? <small>{event.detail}</small> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function findNode(nodes, id) {
  for (const node of nodes || []) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

function resolveDescriptor(node, name, bindingValues) {
  const descriptor = node?.props?.[name];
  if (!descriptor) return { kind: 'absent', value: undefined };
  if (descriptor.kind === 'static') return { kind: 'static', value: descriptor.value };
  const evaluated = bindingValues?.get(descriptor.bindingId);
  return {
    kind: 'binding',
    bindingId: descriptor.bindingId,
    value: evaluated?.value,
    error: evaluated?.error,
  };
}

function SelectionTab({ scene, selectedId, bindingValues, onReveal, onSelectNode }) {
  const node = useMemo(
    () => (selectedId ? findNode(scene?.pages?.flatMap((page) => page.components || []), selectedId) : null),
    [scene, selectedId],
  );
  if (!node) {
    return (
      <div className="eve-inspector-empty">
        <MousePointerClick size={24} />
        <p>No component selected.</p>
        <span>Select a component in the preview or explorer to inspect its resolved properties.</span>
      </div>
    );
  }
  const propertyNames = Object.keys(node.props || {}).sort();
  return (
    <div className="eve-tab-scroll">
      <div className="eve-selection-head">
        <div>
          <span className="eve-selection-tag">&lt;{node.tag}&gt;</span>
          <h3>{node.id}</h3>
          <span className="eve-muted">
            line {node.source?.line} · parent {node.parentId || 'page'}
          </span>
        </div>
        <button
          type="button"
          className="eve-button ghost small"
          onClick={() => onReveal(node.source?.line, node.source?.column)}
        >
          <ArrowUpRight size={12} /> Reveal
        </button>
      </div>

      <div className="eve-selection-grid">
        <div>
          <span>x</span>
          <strong>{node.initialLayout?.x ?? '—'} px</strong>
        </div>
        <div>
          <span>y</span>
          <strong>{node.initialLayout?.y ?? '—'} px</strong>
        </div>
        <div>
          <span>width</span>
          <strong>{node.initialLayout?.width ?? '—'} px</strong>
        </div>
        <div>
          <span>height</span>
          <strong>{node.initialLayout?.height ?? '—'} px</strong>
        </div>
      </div>

      <div className="eve-property-table">
        <div className="eve-section-label">Resolved properties</div>
        {propertyNames.length === 0 ? (
          <div className="eve-empty-inline">No declared properties.</div>
        ) : (
          propertyNames.map((name) => {
            const resolved = resolveDescriptor(node, name, bindingValues);
            return (
              <div className="eve-property-row" key={name}>
                <span className="eve-property-name">{name}</span>
                <span className={`eve-property-value${resolved.error ? ' is-error' : ''}`}>
                  {resolved.error ? resolved.error.message : formatValue(resolved.value)}
                </span>
                <span className={`eve-property-kind ${resolved.kind}`}>{resolved.kind}</span>
              </div>
            );
          })
        )}
      </div>

      {node.actions?.length ? (
        <div className="eve-action-card">
          <div className="eve-section-label">onPress actions</div>
          {node.actions.map((action, index) => (
            <div className="eve-action-row" key={`${action.name}-${index}`}>
              <ChevronRight size={12} />
              <code>{action.source || action.name}</code>
            </div>
          ))}
        </div>
      ) : null}

      {node.children?.length ? (
        <div className="eve-child-list">
          <div className="eve-section-label">Children</div>
          {node.children.map((child) => (
            <button
              key={child.id}
              type="button"
              className="eve-child-row"
              onClick={() => onSelectNode(child)}
            >
              <Boxes size={12} /> {child.id} <span>&lt;{child.tag}&gt;</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BindingsTab({ compilation, bindingValues }) {
  const [query, setQuery] = useState('');
  const bindings = compilation?.bindings?.bindings || [];
  const dependencyIndex = compilation?.bindings?.dependencyIndex || new Map();
  const filtered = bindings.filter((binding) => {
    if (!query.trim()) return true;
    const text = `${binding.componentId} ${binding.property} ${binding.source} ${binding.dependencies.join(' ')}`;
    return text.toLowerCase().includes(query.toLowerCase());
  });
  return (
    <div className="eve-tab-scroll">
      <div className="eve-search-box">
        <Search size={13} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter bindings or dependencies"
          aria-label="Filter bindings"
        />
      </div>
      <div className="eve-binding-summary">
        <span>{bindings.length} bindings</span>
        <span>{dependencyIndex.size} dependency variables</span>
      </div>
      {filtered.length === 0 ? (
        <div className="eve-inspector-empty">
          <GitBranch size={24} />
          <p>No bindings found.</p>
          <span>Use {'${...}'} in a dynamic property or text content.</span>
        </div>
      ) : (
        filtered.map((binding) => {
          const evaluated = bindingValues?.get(binding.id);
          return (
            <div className="eve-binding-card" key={binding.id}>
              <div className="eve-binding-head">
                <span className="eve-binding-target">
                  {binding.componentId}.{binding.property}
                </span>
                <span className="eve-binding-types">
                  {binding.expectedType}
                  {binding.actualType !== binding.expectedType ? ` ← ${binding.actualType}` : ''}
                </span>
              </div>
              <code className="eve-binding-source">{binding.source}</code>
              <div className="eve-binding-deps">
                {binding.dependencies.length === 0 ? (
                  <span className="eve-muted">no dependencies</span>
                ) : (
                  binding.dependencies.map((dependency) => (
                    <span key={dependency} className="eve-dep-chip">
                      {dependency}
                    </span>
                  ))
                )}
              </div>
              <div className={`eve-binding-value${evaluated?.error ? ' is-error' : ''}`}>
                {evaluated?.error
                  ? `runtime error: ${evaluated.error.message}`
                  : `value: ${formatValue(evaluated?.value)}`}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function StageIcon({ status }) {
  if (status === 'error') return <XCircle size={14} className="eve-stage-error" />;
  if (status === 'warning') return <AlertTriangle size={14} className="eve-stage-warning" />;
  return <CheckCircle2 size={14} className="eve-stage-success" />;
}

function ReportTab({ compilation, lastGood, onShowCpp, activePage }) {
  const report = compilation?.report;
  if (!report) {
    return (
      <div className="eve-inspector-empty">
        <ListChecks size={24} />
        <p>No compile report yet.</p>
        <span>The report appears after the first compile.</span>
      </div>
    );
  }
  return (
    <div className="eve-tab-scroll">
      <div className="eve-report-card">
        <div className="eve-report-title">
          <Cpu size={14} /> Compiler pipeline
        </div>
        {report.stages.map((stage) => (
          <div className="eve-stage-row" key={stage.id}>
            <StageIcon status={stage.status} />
            <div>
              <strong>{stage.name}</strong>
              <small>{stage.detail}</small>
            </div>
            <span className="eve-stage-duration">{stage.durationMs.toFixed(1)} ms</span>
          </div>
        ))}
      </div>

      <div className="eve-report-card">
        <div className="eve-report-title">
          <FileJson size={14} /> Build metadata
        </div>
        <div className="eve-meta-row">
          <span>Status</span>
          <strong className={`eve-status-text ${report.status}`}>{report.status}</strong>
        </div>
        <div className="eve-meta-row">
          <span>Language / compiler</span>
          <strong>
            {report.languageVersion} / {report.compilerVersion}
          </strong>
        </div>
        <div className="eve-meta-row">
          <span>Source hash</span>
          <strong className="eve-mono">{report.sourceHash}</strong>
        </div>
        <div className="eve-meta-row">
          <span>Variables / bindings</span>
          <strong>
            {lastGood?.registry.length || 0} / {lastGood?.bindings?.bindings.length || 0}
          </strong>
        </div>
        <div className="eve-meta-row">
          <span>Pages / components</span>
          <strong>
            {report.stages.find((stage) => stage.id === 'layout')?.detail || '—'}
          </strong>
        </div>
        <div className="eve-meta-row">
          <span>Active simulator page</span>
          <strong>{activePage || '—'}</strong>
        </div>
      </div>

      <div className="eve-report-card hardware">
        <div className="eve-report-title">
          <AlertTriangle size={14} /> Hardware boundary
        </div>
        <p className="eve-report-note">
          This browser workbench does not generate an FPGA bitstream, HDMI pipeline or physical
          device firmware. The C++ output is a transport-independent API draft.
        </p>
        {report.hardware.notes.map((note) => (
          <div className="eve-hardware-note" key={note}>
            <span className="eve-log-dot" /> {note}
          </div>
        ))}
      </div>

      <div className="eve-report-card">
        <div className="eve-report-title">
          <TerminalSquare size={14} /> Generated API
        </div>
        <div className="eve-meta-row">
          <span>Class</span>
          <strong>{lastGood?.cpp?.className || '—'}</strong>
        </div>
        <div className="eve-meta-row">
          <span>Setters</span>
          <strong>{lastGood?.cpp?.methods.length || 0}</strong>
        </div>
        <div className="eve-meta-row">
          <span>Assets</span>
          <strong>
            {lastGood?.assetManifest?.summary.total || 0} registered ·{' '}
            {lastGood?.assetManifest?.summary.missing || 0} missing
          </strong>
        </div>
        <button type="button" className="eve-button ghost small" onClick={onShowCpp}>
          <ArrowUpRight size={12} /> Open generated C++
        </button>
      </div>
    </div>
  );
}

export default function InspectorPanel({
  variables,
  assets,
  bindingValues,
  compilation,
  lastGood,
  scene,
  selectedId,
  onSelectNode,
  onSetVariable,
  onToggleVariable,
  onResetVariable,
  onResetAllVariables,
  runtimeEvents,
  onReveal,
  onShowCpp,
  activePage,
}) {
  const [tab, setTab] = useState('variables');
  const tabs = [
    { id: 'variables', label: 'Variables', icon: <SlidersHorizontal size={13} />, count: variables.length },
    { id: 'selection', label: 'Component', icon: <MousePointerClick size={13} /> },
    {
      id: 'bindings',
      label: 'Bindings',
      icon: <GitBranch size={13} />,
      count: compilation?.bindings?.bindings.length ?? 0,
    },
    { id: 'report', label: 'Report', icon: <ListChecks size={13} /> },
  ];
  return (
    <aside className="eve-inspector" aria-label="Inspector">
      <div className="eve-inspector-tabs" role="tablist">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? 'is-active' : ''}
            onClick={() => setTab(entry.id)}
          >
            {entry.icon}
            <span>{entry.label}</span>
            {entry.count !== undefined ? <em>{entry.count}</em> : null}
          </button>
        ))}
      </div>
      {tab === 'variables' ? (
        <VariablesTab
          variables={variables}
          assets={assets}
          onSet={onSetVariable}
          onToggle={onToggleVariable}
          onReset={onResetVariable}
          onResetAll={onResetAllVariables}
          runtimeEvents={runtimeEvents}
        />
      ) : null}
      {tab === 'selection' ? (
        <SelectionTab
          scene={scene}
          selectedId={selectedId}
          bindingValues={bindingValues}
          onReveal={onReveal}
          onSelectNode={onSelectNode}
        />
      ) : null}
      {tab === 'bindings' ? (
        <BindingsTab compilation={compilation} bindingValues={bindingValues} />
      ) : null}
      {tab === 'report' ? (
        <ReportTab
          compilation={compilation}
          lastGood={lastGood}
          onShowCpp={onShowCpp}
          activePage={activePage}
        />
      ) : null}
    </aside>
  );
}
