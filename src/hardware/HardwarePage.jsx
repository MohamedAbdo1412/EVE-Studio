import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Download,
  FileArchive,
  HardDrive,
  Loader2,
  Play,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';
import { useProject } from '../project/ProjectContext.jsx';
import { compile } from '../language/compiler/compile.js';
import {
  buildHardwareArtifacts,
  defaultBrowserImageDecoder,
} from './exportHardware.js';
import { createHardwareZip } from './exportZip.js';

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}

function downloadBytes(bytes, filename, type = 'application/octet-stream') {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const blob = new Blob([buffer], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StatusPill({ ok, children }) {
  return (
    <span className={`eve-hw-pill ${ok ? 'ok' : 'warn'}`}>
      {ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
      {children}
    </span>
  );
}

function Metric({ label, value, mono = false, hint }) {
  return (
    <div className="eve-hw-metric">
      <span className="eve-hw-metric-label">{label}</span>
      <strong className={mono ? 'mono' : ''} title={hint || String(value)}>
        {value}
      </strong>
    </div>
  );
}

export default function HardwarePage() {
  const navigate = useNavigate();
  const { source, assets, projectName } = useProject();
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState(null);
  const [artifacts, setArtifacts] = useState(null);
  const [compiledAt, setCompiledAt] = useState(null);

  const build = useCallback(async () => {
    setBusy(true);
    setError(null);
    setArtifacts(null);
    try {
      setPhase('Compiling EVE source');
      const compilation = compile(source, { assets });
      if (!compilation.valid) {
        const first = compilation.diagnostics.find((item) => item.severity === 'error');
        throw new Error(
          first
            ? `Compile error ${first.code}: ${first.message}`
            : 'The program does not compile, so no hardware artifacts were built.',
        );
      }
      setPhase('Packing 16 MiB ROM, frame package and ESP32 project');
      const built = await buildHardwareArtifacts({
        compileResult: compilation,
        assets,
        projectName,
        source,
        decodeImage: defaultBrowserImageDecoder,
      });
      setArtifacts(built);
      setCompiledAt(new Date());
    } catch (buildError) {
      setError(buildError.message);
    } finally {
      setBusy(false);
      setPhase('');
    }
  }, [source, assets, projectName]);

  const downloadZip = useCallback(async () => {
    if (!artifacts) return;
    setBusy(true);
    setError(null);
    try {
      setPhase('Building ZIP');
      const { data, filename } = await createHardwareZip(artifacts, { type: 'blob' });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (zipError) {
      setError(`ZIP export failed: ${zipError.message}`);
    } finally {
      setBusy(false);
      setPhase('');
    }
  }, [artifacts]);

  const romFileName = artifacts?.releaseManifest?.rom?.fileName || 'EVE_ROM_16MB.bin';
  const platformio = artifacts?.toolchainStatus?.platformio;
  const gowin = artifacts?.toolchainStatus?.gowin;

  const fileRows = useMemo(() => {
    if (!artifacts) return [];
    return [
      { path: romFileName, bytes: artifacts.rom.bytes.length, note: '16 MiB SPI NOR image' },
      { path: 'firmware/', bytes: null, note: `${Object.keys(artifacts.esp32Files).length} generated files` },
      {
        path: 'frame/',
        bytes: artifacts.frame ? artifacts.frame.textHex.length + artifacts.frame.fontHex.length : null,
        note: artifacts.frame ? `${artifacts.frame.objects.length} RTL objects` : 'not available',
      },
      { path: 'rtl/', bytes: null, note: 'synthesizable sources + testbenches' },
      { path: 'manifest.json', bytes: artifacts.files['manifest.json']?.length ?? null, note: 'release manifest' },
      {
        path: 'address-map.json',
        bytes: artifacts.files['address-map.json']?.length ?? null,
        note: 'ROM regions and asset offsets',
      },
    ];
  }, [artifacts, romFileName]);

  return (
    <div className="eve-hw-page">
      <div className="eve-hw-header">
        <button type="button" className="eve-button ghost" onClick={() => navigate('/')}>
          <ArrowLeft size={14} />
          Back to Studio
        </button>
        <div className="eve-hw-title">
          <span className="eve-hw-title-mark">
            <Cpu size={18} />
          </span>
          <div>
            <h1>Hardware Build</h1>
            <p>
              Export real artifacts from the current EVE program: a complete 16 MiB ROM image, an
              ESP32-S3 PlatformIO project, an RTL frame package and synthesizable HDL.
            </p>
          </div>
        </div>
      </div>

      <div className="eve-hw-banner">
        <ShieldAlert size={16} />
        <div>
          <strong>REFERENCE PROFILE — PACKAGE/PINOUT NOT QUALIFIED</strong>
          <span>
            Board pin assignments, FPGA package, speed grade and pinout are engineering assumptions.
            No physical board, vendor bitstream or HDMI link has been verified.
          </span>
        </div>
      </div>

      <div className="eve-hw-actions">
        <button type="button" className="eve-button primary" onClick={build} disabled={busy}>
          {busy && !artifacts ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          {artifacts ? 'Rebuild artifacts' : 'Build hardware artifacts'}
        </button>
        <button type="button" className="eve-button" onClick={downloadZip} disabled={!artifacts || busy}>
          {busy && artifacts ? <Loader2 size={14} className="spin" /> : <FileArchive size={14} />}
          Download hardware ZIP
        </button>
        <button
          type="button"
          className="eve-button ghost"
          onClick={() => artifacts && downloadBytes(artifacts.rom.bytes, romFileName, 'application/octet-stream')}
          disabled={!artifacts || busy}
        >
          <HardDrive size={14} />
          Download ROM only
        </button>
        {busy ? <span className="eve-hw-progress"><Loader2 size={13} className="spin" /> {phase || 'Working'}</span> : null}
        {compiledAt && !busy ? (
          <span className="eve-hw-progress done">Built at {compiledAt.toLocaleTimeString()}</span>
        ) : null}
      </div>

      {error ? (
        <div className="eve-hw-error" role="alert">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      ) : null}

      {!artifacts && !busy ? (
        <div className="eve-hw-empty">
          <TerminalSquare size={22} />
          <h2>Nothing built yet</h2>
          <p>
            Building consumes the current compiler output. It never parses or recompiles the EVE
            language, and it reports unavailable tools instead of pretending they ran.
          </p>
        </div>
      ) : null}

      {artifacts ? (
        <>
          <div className="eve-hw-grid">
            <section className="eve-hw-card">
              <header>
                <h2>ROM image</h2>
                <span className="eve-hw-tag">{artifacts.header.format}</span>
              </header>
              <div className="eve-hw-metrics">
                <Metric label="File size" value={formatBytes(artifacts.rom.bytes.length)} />
                <Metric label="Used" value={`${formatBytes(artifacts.releaseManifest.rom.usedBytes)} (${artifacts.manifest.occupancyPercent}%)`} />
                <Metric label="Free (0xFF)" value={formatBytes(artifacts.releaseManifest.rom.freeBytes)} />
                <Metric label="Build ID" value={artifacts.releaseManifest.rom.buildId} mono />
                <Metric label="CRC32" value={artifacts.releaseManifest.rom.contentCrc32} mono />
                <Metric label="SHA-256" value={artifacts.releaseManifest.rom.sha256} mono />
                <Metric label="Scene records" value={artifacts.manifest.sceneCount} />
                <Metric label="Variables" value={artifacts.manifest.variableCount} />
                <Metric label="Assets" value={artifacts.manifest.assetCount} />
                <Metric label="Asset payloads sector-aligned" value="4 KiB" />
              </div>
            </section>

            <section className="eve-hw-card">
              <header>
                <h2>Verification state</h2>
                <StatusPill ok={artifacts.qualification === 'QUALIFIED'}>reference profile</StatusPill>
              </header>
              <ul className="eve-hw-checks">
                {artifacts.feasibility.checks.map((check) => (
                  <li key={check.id} className={`eve-hw-check ${check.status.toLowerCase()}`}>
                    <span className="eve-hw-check-dot" />
                    <div>
                      <strong>{check.id}</strong>
                      <span>{check.detail}</span>
                    </div>
                    <em>{check.status}</em>
                  </li>
                ))}
              </ul>
              <p className="eve-hw-note">
                “PASS” here means arithmetic or a real Icarus run. It never means vendor timing
                closure, a bitstream, or measured hardware.
              </p>
            </section>

            <section className="eve-hw-card">
              <header>
                <h2>Toolchain</h2>
              </header>
              <div className="eve-hw-tool">
                <span className={`eve-hw-tool-dot ${platformio?.available ? 'ok' : 'warn'}`} />
                <div>
                  <strong>PlatformIO</strong>
                  <span>{platformio?.label}</span>
                  <em>{platformio?.detail}</em>
                </div>
              </div>
              <div className="eve-hw-tool">
                <span className={`eve-hw-tool-dot ${gowin?.available ? 'ok' : 'warn'}`} />
                <div>
                  <strong>Gowin EDA</strong>
                  <span>{gowin?.label}</span>
                  <em>{gowin?.detail}</em>
                </div>
              </div>
              <div className="eve-hw-tool">
                <span className="eve-hw-tool-dot ok" />
                <div>
                  <strong>Icarus Verilog</strong>
                  <span>The Simulator backend runs the exported RTL and testbenches.</span>
                  <em>HDL results are produced by native tools, never by a JavaScript re-render.</em>
                </div>
              </div>
            </section>

            <section className="eve-hw-card">
              <header>
                <h2>RTL frame package</h2>
                <StatusPill ok={Boolean(artifacts.frame)}>{artifacts.frame ? 'available' : 'unavailable'}</StatusPill>
              </header>
              {artifacts.frame ? (
                <>
                  <div className="eve-hw-metrics">
                    <Metric label="Canvas" value={`${artifacts.frame.width} × ${artifacts.frame.height}`} />
                    <Metric label="Objects" value={`${artifacts.frame.objects.length} / 16`} />
                    <Metric label="Background" value={`#${artifacts.frame.background.toString(16).padStart(6, '0')}`} mono />
                    <Metric label="Glyph bytes" value="4096" />
                    <Metric label="Font bytes" value="4096" />
                  </div>
                  <p className="eve-hw-note">
                    The renderer is a functional reference core: one pixel per
                    {' '}(object_count + 2) clocks. It is not a 1080p30 scanout pipeline, and HDMI/TMDS
                    serialisation is performed by the ADV7513.
                  </p>
                </>
              ) : (
                <p className="eve-hw-note">No frame package was produced for the initial page.</p>
              )}
            </section>
          </div>

          <section className="eve-hw-card wide">
            <header>
              <h2>Release contents</h2>
              <span className="eve-hw-tag">{artifacts.files ? 'deterministic' : ''}</span>
            </header>
            <table className="eve-hw-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Size</th>
                  <th>Contents</th>
                </tr>
              </thead>
              <tbody>
                {fileRows.map((row) => (
                  <tr key={row.path}>
                    <td><code>{row.path}</code></td>
                    <td>{row.bytes == null ? '—' : formatBytes(row.bytes)}</td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="eve-hw-downloads">
              <button type="button" className="eve-button" onClick={downloadZip} disabled={busy}>
                <Download size={14} />
                Download {artifacts.releaseManifest.projectName.replace(/[^A-Za-z0-9._-]+/g, '-')}.eve-hardware.zip
              </button>
            </div>
          </section>

          {artifacts.warnings.length ? (
            <section className="eve-hw-card wide warnings">
              <header>
                <h2>Export warnings</h2>
                <ShieldCheck size={15} />
              </header>
              <ul>
                {artifacts.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
