import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  Database,
  FileSearch,
  Image as ImageIcon,
  RefreshCw,
  TerminalSquare,
  Timer,
  Wrench,
} from 'lucide-react';
import { getTools } from './api.js';
import { StatusPill } from './components/UI.jsx';
import FrameTab from './tabs/FrameTab.jsx';
import TimingTab from './tabs/TimingTab.jsx';
import MemoryTab from './tabs/MemoryTab.jsx';
import RomTab from './tabs/RomTab.jsx';
import ProtocolTab from './tabs/ProtocolTab.jsx';
import ToolchainTab from './tabs/ToolchainTab.jsx';
import TelemetryTab from './tabs/TelemetryTab.jsx';

const TABS = [
  { id: 'frame', label: 'RTL monitor', icon: ImageIcon },
  { id: 'timing', label: 'Timing', icon: Timer },
  { id: 'memory', label: 'Memory', icon: Database },
  { id: 'rom', label: 'ROM inspector', icon: FileSearch },
  { id: 'protocol', label: 'Protocol', icon: TerminalSquare },
  { id: 'tools', label: 'Toolchain', icon: Wrench },
  { id: 'telemetry', label: 'Telemetry', icon: Activity },
];

export default function App() {
  const [tab, setTab] = useState('frame');
  const [report, setReport] = useState(null);
  const [loadingTools, setLoadingTools] = useState(true);
  const [backendError, setBackendError] = useState(null);

  const loadTools = useCallback(async (refresh = false) => {
    setLoadingTools(true);
    try {
      const response = await getTools(refresh);
      if (!response.ok) {
        throw new Error(response.data?.detail || `The backend returned HTTP ${response.status}.`);
      }
      setReport(response.data);
      setBackendError(null);
    } catch (error) {
      setBackendError(error.message);
    } finally {
      setLoadingTools(false);
    }
  }, []);

  useEffect(() => {
    loadTools(false);
  }, [loadTools]);

  const hdlReady = Boolean(report?.hdlReady);
  const backendTone = backendError ? 'warn' : loadingTools ? 'busy' : 'ok';

  return (
    <div className="sim-shell">
      <header className="sim-header">
        <div className="sim-brand">
          <span className="sim-brand-mark">
            <Cpu size={20} />
          </span>
          <div>
            <h1>EVE Simulator</h1>
            <p>
              Native HDL simulation, RTL frame capture and artifact inspection for EVE hardware
              builds. Nothing here renders your scene in JavaScript and calls it simulation.
            </p>
          </div>
        </div>
        <div className="sim-header-status">
          <StatusPill tone={backendTone}>
            {backendError ? 'backend offline' : loadingTools ? 'probing tools' : 'backend online'}
          </StatusPill>
          <StatusPill tone={hdlReady ? 'ok' : 'warn'}>{hdlReady ? 'Icarus ready' : 'HDL unavailable'}</StatusPill>
          <button type="button" className="sim-button ghost" onClick={() => loadTools(true)} disabled={loadingTools}>
            <RefreshCw size={14} className={loadingTools ? 'sim-spin' : undefined} />
            Refresh tools
          </button>
        </div>
      </header>

      {backendError ? (
        <div className="sim-backend-error">
          <strong>Simulator backend unreachable</strong>
          <span>{backendError}</span>
          <code>cd simulator &amp;&amp; npm run dev</code>
        </div>
      ) : null}

      <nav className="sim-tabs" aria-label="Simulator sections">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`sim-tab ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <main className="sim-main">
        {tab === 'frame' ? <FrameTab hdlReady={hdlReady} /> : null}
        {tab === 'timing' ? <TimingTab hdlReady={hdlReady} /> : null}
        {tab === 'memory' ? <MemoryTab hdlReady={hdlReady} /> : null}
        {tab === 'rom' ? <RomTab /> : null}
        {tab === 'protocol' ? <ProtocolTab /> : null}
        {tab === 'tools' ? (
          <ToolchainTab
            report={report}
            loading={loadingTools}
            error={backendError}
            onRefresh={loadTools}
          />
        ) : null}
        {tab === 'telemetry' ? <TelemetryTab /> : null}
      </main>

      <footer className="sim-footer">
        <span>
          Local tool results only. No bitstream, vendor timing closure, HDMI/TMDS simulation or
          physical-board measurement is claimed.
        </span>
        <span className="sim-mono">
          {report?.environment?.pathAdditions?.length
            ? `tool path additions: ${report.environment.pathAdditions.join(', ')}`
            : 'tool path: system PATH'}
        </span>
      </footer>
    </div>
  );
}
