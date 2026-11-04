import React from 'react';
import { RefreshCw, Wrench } from 'lucide-react';
import { EmptyState, Notice, Panel, StatusPill } from '../components/UI.jsx';

function ToolCard({ tool }) {
  return (
    <article className={`sim-tool ${tool.available ? 'ok' : 'warn'}`}>
      <header>
        <div>
          <strong>{tool.label}</strong>
          <span className="sim-tool-id">{tool.id}</span>
        </div>
        <StatusPill tone={tool.available ? 'ok' : 'warn'}>
          {tool.available ? 'available' : 'unavailable'}
        </StatusPill>
      </header>
      <p>{tool.role}</p>
      <dl>
        <dt>Command</dt>
        <dd className="sim-mono">{tool.command || 'not found'}</dd>
        <dt>Version</dt>
        <dd className="sim-mono">{tool.version || '—'}</dd>
        <dt>Probe</dt>
        <dd className="sim-mono">
          {tool.probe?.state}
          {tool.probe?.code == null ? '' : ` · exit ${tool.probe.code}`}
          {tool.probe?.durationMs != null ? ` · ${tool.probe.durationMs} ms` : ''}
        </dd>
      </dl>
      <footer>{tool.detail}</footer>
    </article>
  );
}

export default function ToolchainTab({ report, loading, error, onRefresh }) {
  return (
    <div className="sim-stack">
      <Notice tone="info" title="Probe results, not assumptions">
        A tool is only marked available after this backend actually executed its version command.
        Missing tools stay unavailable and every dependent result says so.
      </Notice>

      {error ? (
        <Notice tone="error" title="Backend unreachable">
          {error}
        </Notice>
      ) : null}

      <Panel
        title="Native toolchain"
        tag={report?.summary ? `${report.summary.available}/${report.summary.total} available` : 'not probed'}
        actions={
          <button type="button" className="sim-button" onClick={() => onRefresh(true)} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'sim-spin' : undefined} />
            Refresh probes
          </button>
        }
      >
        {!report && !error ? (
          <EmptyState icon={Wrench} title="Probing native tools">
            Running each executable&apos;s version command.
          </EmptyState>
        ) : null}
        {report ? (
          <>
            <div className="sim-metrics">
              <div className="sim-metric">
                <span>HDL status</span>
                <strong>{report.summary.hdl}</strong>
              </div>
              <div className="sim-metric">
                <span>Icarus Verilog</span>
                <strong>{report.byId?.iverilog?.available ? 'ready' : 'not installed'}</strong>
              </div>
              <div className="sim-metric">
                <span>VVP runtime</span>
                <strong>{report.byId?.vvp?.available ? 'ready' : 'not installed'}</strong>
              </div>
              <div className="sim-metric">
                <span>Yosys</span>
                <strong>{report.byId?.yosys?.available ? 'ready' : 'not installed'}</strong>
              </div>
              <div className="sim-metric">
                <span>Verilator</span>
                <strong>{report.byId?.verilator?.available ? 'ready' : 'not installed'}</strong>
              </div>
              <div className="sim-metric">
                <span>PlatformIO</span>
                <strong>{report.byId?.platformio?.available ? 'ready' : 'not installed'}</strong>
              </div>
              <div className="sim-metric">
                <span>Checked at</span>
                <strong className="sim-mono">{new Date(report.checkedAt).toLocaleTimeString()}</strong>
              </div>
            </div>
            <div className="sim-tool-grid">
              {report.tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
            <p className="sim-note">
              Icarus and VVP are required for HDL results. Yosys, Verilator, PlatformIO and Gowin EDA
              are independent capabilities: absence of any of them never invalidates an Icarus run.
            </p>
          </>
        ) : null}
      </Panel>
    </div>
  );
}
