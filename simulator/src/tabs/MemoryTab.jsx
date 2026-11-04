import React, { useState } from 'react';
import { Database, HardDrive, Play } from 'lucide-react';
import { runMemory } from '../api.js';
import { formatDuration } from '../format.js';
import { EmptyState, LogBlock, Metric, Notice, Panel, StatusPill } from '../components/UI.jsx';

const DEVICES = [
  {
    id: 'flash',
    title: 'W25Q128JV flash writer',
    icon: HardDrive,
    source: 'eve_flash_writer.sv + w25q128jv_model.sv',
    description:
      'Splits writes at 256-byte pages, erases 4 KiB sectors before programming, refuses oversized requests and never truncates.',
    metricLabels: {
      pagePrograms: 'Page programs',
      sectorErases: 'Sector erases',
    },
  },
  {
    id: 'sdram',
    title: 'IS42S16400J-6 SDRAM',
    icon: Database,
    source: 'eve_sdram_ctrl.sv + is42s16400j_model.sv',
    description:
      'Checks power-up timing, row activation, CAS latency 3, precharge, refresh interval and read/write data integrity.',
    metricLabels: {
      activates: 'ACT',
      reads: 'READ',
      writes: 'WRITE',
      precharges: 'PRE',
      refreshes: 'REF',
      maxRefreshGap: 'Max refresh gap',
    },
  },
];

function DeviceResult({ result }) {
  if (!result) return null;
  const metrics = result.metrics || {};
  return (
    <>
      <div className="sim-metrics">
        <Metric label="Verdict" value={result.status || 'UNKNOWN'} />
        <Metric label="Duration" value={formatDuration(result.durationMs)} />
        {Object.entries(metrics).map(([key, value]) => {
          const config = DEVICES.find((device) => device.id === result.id);
          return <Metric key={key} label={config?.metricLabels?.[key] || key} value={value} />;
        })}
      </div>
      {result.notes?.length ? (
        <ul className="sim-checks">
          {result.notes.map((note) => (
            <li key={note} className="sim-check warn">
              <span className="sim-check-dot" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {result.command?.compile ? (
        <div className="sim-command">
          <code>{result.command.compile}</code>
          {result.command.run ? <code>{result.command.run}</code> : null}
        </div>
      ) : null}
      <LogBlock title="Icarus / VVP output" text={result.log} />
    </>
  );
}

export default function MemoryTab({ hdlReady }) {
  const [busy, setBusy] = useState(null);
  const [results, setResults] = useState({});
  const [errors, setErrors] = useState({});

  const run = async (device) => {
    setBusy(device);
    setErrors((current) => ({ ...current, [device]: null }));
    try {
      const response = await runMemory(device);
      const result = response.data?.results?.find((item) => item.id === device) || null;
      setResults((current) => ({ ...current, [device]: result }));
      if (!response.ok || !response.data?.ok) {
        setErrors((current) => ({
          ...current,
          [device]:
            response.data?.detail ||
            response.data?.status ||
            `The backend returned HTTP ${response.status}.`,
        }));
      }
    } catch (error) {
      setErrors((current) => ({ ...current, [device]: error.message }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="sim-stack">
      <Notice tone={hdlReady ? 'info' : 'warn'} title="Real Icarus memory testbenches">
        Each run compiles the RTL controller, its behavioural device model and the real testbench
        with Icarus, then runs the resulting VVP. Results and counters come from the simulator log,
        not from JavaScript. Device pinout and board signal integrity are not qualified.
      </Notice>

      {!hdlReady ? (
        <Notice tone="warn" title="HDL toolchain unavailable">
          Icarus Verilog and VVP must both be available. Install the portable OSS CAD Suite or put
          them on PATH, then refresh tool probes.
        </Notice>
      ) : null}

      {DEVICES.map((device) => {
        const Icon = device.icon;
        const result = results[device.id];
        const error = errors[device.id];
        const isBusy = busy === device.id;
        const tone =
          result?.status === 'PASS' ? 'ok' : error ? 'warn' : isBusy ? 'busy' : 'idle';
        return (
          <Panel
            key={device.id}
            title={device.title}
            tag={device.source}
            actions={
              <StatusPill tone={tone}>
                {isBusy ? 'running' : result?.status || (error ? 'failed' : 'not run')}
              </StatusPill>
            }
          >
            <div className="sim-profile-grid">
              <article className="sim-profile">
                <div>
                  <strong>{device.title}</strong>
                  <span>{device.description}</span>
                </div>
                <button
                  type="button"
                  className="sim-button primary"
                  onClick={() => run(device.id)}
                  disabled={Boolean(busy) || !hdlReady}
                >
                  <Play size={14} />
                  Run {device.id}
                </button>
              </article>
            </div>

            {error ? (
              <Notice tone="warn" title="Verification did not pass">
                {error}
              </Notice>
            ) : null}

            {!result && !isBusy && !error ? (
              <EmptyState icon={Icon} title={`No ${device.id} run yet`}>
                Run the testbench to compile and simulate {device.title} with the native HDL
                toolchain.
              </EmptyState>
            ) : null}

            {result ? <DeviceResult result={result} /> : null}
          </Panel>
        );
      })}
    </div>
  );
}
