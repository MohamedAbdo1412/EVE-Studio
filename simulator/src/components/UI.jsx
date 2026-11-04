import React from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash2, Loader2 } from 'lucide-react';

export function Panel({ title, tag, actions, children, className = '' }) {
  return (
    <section className={`sim-panel ${className}`}>
      {title || tag || actions ? (
        <header className="sim-panel-header">
          <div className="sim-panel-heading">
            <h2>{title}</h2>
            {tag ? <span className="sim-tag">{tag}</span> : null}
          </div>
          {actions ? <div className="sim-panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatusPill({ tone = 'idle', children }) {
  const Icon =
    tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : tone === 'busy' ? Loader2 : CircleSlash2;
  return (
    <span className={`sim-pill ${tone}`}>
      <Icon size={12} className={tone === 'busy' ? 'sim-spin' : undefined} />
      {children}
    </span>
  );
}

export function Metric({ label, value, mono = false, title }) {
  return (
    <div className="sim-metric">
      <span>{label}</span>
      <strong className={mono ? 'sim-mono' : undefined} title={title || String(value ?? '')}>
        {value == null || value === '' ? '—' : value}
      </strong>
    </div>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`sim-field ${className}`}>
      <span className="sim-field-label">{label}</span>
      {children}
      {hint ? <span className="sim-field-hint">{hint}</span> : null}
    </label>
  );
}

export function Notice({ tone = 'info', title, children }) {
  return (
    <div className={`sim-notice ${tone}`}>
      {tone === 'error' || tone === 'warn' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
      <div>
        {title ? <strong>{title}</strong> : null}
        <span>{children}</span>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="sim-empty">
      {Icon ? <Icon size={22} /> : null}
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function LogBlock({ title = 'Tool output', text, empty = 'No tool output yet.' }) {
  return (
    <div className="sim-log">
      <div className="sim-log-title">{title}</div>
      <pre>{text || empty}</pre>
    </div>
  );
}

export function CheckList({ checks }) {
  if (!checks?.length) return null;
  return (
    <ul className="sim-checks">
      {checks.map((check) => (
        <li key={check.id} className={`sim-check ${check.ok ? 'ok' : 'warn'}`}>
          <span className="sim-check-dot" />
          <strong>{check.id}</strong>
          <span>{check.detail}</span>
        </li>
      ))}
    </ul>
  );
}
