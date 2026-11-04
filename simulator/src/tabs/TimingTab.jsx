import React, { useState } from 'react';
import { Clock3, Play } from 'lucide-react';
import { runTiming } from '../api.js';
import { formatDuration } from '../format.js';
import { EmptyState, LogBlock, Metric, Notice, Panel, StatusPill } from '../components/UI.jsx';

const PROFILES = [
  {
    id: 'fast',
    title: '320 × 180 @ 60 Hz',
    detail: 'Fast functional timing run. Two complete frames.',
  },
  {
    id: 'full',
    title: '1920 × 1080 @ 30 Hz',
    detail: 'One complete reference-resolution frame at a 74.25 MHz pixel clock.',
  },
];

export default function TimingTab({ hdlReady }) {
  const [profile, setProfile] = useState('fast');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async (selected) => {
    setProfile(selected);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await runTiming(selected);
      setResult(response);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const data = result?.data;
  const tone =
    data?.status === 'PASS' ? 'ok' : data?.status === 'UNAVAILABLE' ? 'warn' : result && !result.ok ? 'warn' : 'idle';

  return (
    <div className="sim-stack">
      <Notice tone={hdlReady ? 'info' : 'warn'} title="Real Icarus timing testbench">
        The backend compiles <code>hardware/rtl/video/eve_video_timing.sv</code> with{' '}
        <code>hardware/testbench/tb_eve_video_timing.sv</code>, runs it with VVP and reports the
        verdict the simulator printed. No timing number is computed in JavaScript.
      </Notice>

      {error ? (
        <Notice tone="error" title="Timing run failed">
          {error}
        </Notice>
      ) : null}

      <Panel
        title="Video timing verification"
        tag="eve_video_timing.sv"
        actions={
          <StatusPill tone={busy ? 'busy' : tone}>
            {busy ? 'running' : data?.status || 'not run'}
          </StatusPill>
        }
      >
        <div className="sim-profile-grid">
          {PROFILES.map((item) => (
            <article key={item.id} className={`sim-profile ${profile === item.id ? 'selected' : ''}`}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
              <button
                type="button"
                className="sim-button primary"
                onClick={() => run(item.id)}
                disabled={busy || !hdlReady}
              >
                <Play size={14} />
                Run {item.id}
              </button>
            </article>
          ))}
        </div>

        {!hdlReady ? (
          <p className="sim-note">
            Icarus Verilog and VVP must both be available. Install the portable OSS CAD Suite or put
            them on PATH, then refresh tool probes.
          </p>
        ) : null}

        {!result && !busy ? (
          <EmptyState icon={Clock3} title="No timing run yet">
            Run the fast profile for a quick check, or the full profile to verify the complete
            1920 × 1080 @ 30 Hz frame arithmetic.
          </EmptyState>
        ) : null}

        {data ? (
          <>
            <div className="sim-metrics">
              <Metric label="Verdict" value={data.status || 'UNKNOWN'} />
              <Metric label="Profile" value={data.profile || profile} />
              <Metric label="Duration" value={formatDuration(data.durationMs)} />
              <Metric label="Detail" value={data.detail || '—'} />
            </div>
            {data.command ? (
              <div className="sim-command">
                {data.command.compile ? <code>{data.command.compile}</code> : null}
                {data.command.run ? <code>{data.command.run}</code> : null}
              </div>
            ) : null}
            <LogBlock title="Icarus / VVP output" text={data.log} />
            <p className="sim-note">
              A PASS is the testbench&apos;s arithmetic verdict for this simulation. It is not
              synthesis, vendor timing closure, or a measurement of physical hardware.
            </p>
          </>
        ) : null}
      </Panel>
    </div>
  );
}
