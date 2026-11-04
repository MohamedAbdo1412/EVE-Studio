import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Play, Upload, X } from 'lucide-react';
import { runFrame } from '../api.js';
import {
  base64ToBytes,
  bytesToBase64,
  describeFrameMeta,
  downloadBytes,
  formatBytes,
  formatDuration,
  framePackageFromFiles,
  rgbToPpm,
  rgbToRgba,
} from '../format.js';
import { EmptyState, LogBlock, Metric, Notice, Panel, StatusPill } from '../components/UI.jsx';

const ROM_BYTES = 16 * 1024 * 1024;

export default function FrameTab({ hdlReady }) {
  const [sourceKind, setSourceKind] = useState('rom');
  const [rom, setRom] = useState(null);
  const [pkg, setPkg] = useState(null);
  const [pkgLabel, setPkgLabel] = useState('');
  const [pageIndex, setPageIndex] = useState('');
  const [checkDeterminism, setCheckDeterminism] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);

  const data = result?.data;
  const frameMeta = useMemo(() => (pkg ? describeFrameMeta(pkg.meta) : null), [pkg]);
  const canRun =
    hdlReady && !busy && (sourceKind === 'rom' ? Boolean(rom) : Boolean(pkg));

  useEffect(() => {
    const pixels = result?.data?.pixels;
    if (!pixels?.rgbBase64 || !result.data.width || !result.data.height) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rgb = base64ToBytes(pixels.rgbBase64);
    const rgba = rgbToRgba(rgb);
    canvas.width = result.data.width;
    canvas.height = result.data.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.putImageData(new ImageData(rgba, result.data.width, result.data.height), 0, 0);
  }, [result]);

  const loadRom = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setRom({ name: file.name, size: bytes.length, base64: bytesToBase64(bytes) });
      setSourceKind('rom');
    } catch (readError) {
      setError(`Could not read "${file.name}": ${readError.message}`);
    }
  };

  const loadPackage = async (fileList) => {
    setError(null);
    setResult(null);
    try {
      const loaded = await framePackageFromFiles(fileList);
      setPkg(loaded);
      setPkgLabel(Array.from(fileList || []).map((file) => file.name).join(', '));
      setSourceKind('package');
    } catch (readError) {
      setError(readError.message);
    }
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body =
        sourceKind === 'rom'
          ? {
              romBase64: rom.base64,
              checkDeterminism,
              ...(pageIndex.trim() === '' ? {} : { pageIndex: Number(pageIndex) }),
            }
          : { framePackage: pkg, checkDeterminism };
      if (body.pageIndex != null && (!Number.isInteger(body.pageIndex) || body.pageIndex < 0)) {
        throw new Error('Page index must be a non-negative integer.');
      }
      const response = await runFrame(body);
      setResult(response);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadPpm = () => {
    if (!data?.pixels?.rgbBase64) return;
    const rgb = base64ToBytes(data.pixels.rgbBase64);
    const ppm = rgbToPpm(data.width, data.height, rgb);
    downloadBytes(ppm, `eve-frame-${data.width}x${data.height}.ppm`, 'image/x-portable-pixmap');
  };

  const captureStatus = data?.capture?.status || data?.status;
  const verdictTone =
    data?.status === 'UNAVAILABLE'
      ? 'warn'
      : captureStatus === 'COMPLETE'
        ? 'ok'
        : captureStatus === 'PARTIAL' || captureStatus === 'PASS'
          ? 'warn'
          : result && !result.ok
            ? 'warn'
            : 'idle';
  const partial = captureStatus === 'PARTIAL';
  const failed = captureStatus === 'FAILED' || data?.status === 'FAIL' || data?.status === 'TIMEOUT';
  const unsupported = data?.frame?.unsupported || [];
  const missingAssets = data?.frame?.missingAssets || [];

  return (
    <div className="sim-stack">
      <Notice tone="info" title="Pixels come from Verilog">
        <code>tb_eve_frame_capture.sv</code> writes a binary PPM from the RTL renderer. The backend
        reads those bytes and sends <code>rgbBase64</code> to this canvas. Expanding RGB to RGBA is a
        display conversion; it is not a JavaScript re-render of the scene.
      </Notice>

      {error ? (
        <Notice tone="error" title="Frame capture failed">
          {error}
        </Notice>
      ) : null}

      <Panel
        title="RTL frame monitor"
        tag="eve_renderer.sv"
        actions={<StatusPill tone={busy ? 'busy' : verdictTone}>{busy ? 'running' : captureStatus || 'not run'}</StatusPill>}
      >
        <div className="sim-source-grid">
          <div className={`sim-source ${sourceKind === 'rom' ? 'selected' : ''}`}>
            <button type="button" className="sim-source-head" onClick={() => setSourceKind('rom')}>
              <span>EVE ROM image</span>
              <StatusPill tone={rom ? 'ok' : 'idle'}>{rom ? 'loaded' : 'choose file'}</StatusPill>
            </button>
            <p>
              Upload the 16 MiB <code>EVE_ROM_16MB.bin</code> from an EVE Studio hardware export.
              The backend verifies its checksums before building the frame package.
            </p>
            <label className="sim-file">
              <Upload size={14} />
              <span>Choose .bin</span>
              <input type="file" accept=".bin,application/octet-stream" onChange={(event) => loadRom(event.target.files)} />
            </label>
            {rom ? (
              <div className="sim-file-row">
                <span className="sim-mono">{rom.name}</span>
                <span>{formatBytes(rom.size)}</span>
                {rom.size !== ROM_BYTES ? <em>expected {formatBytes(ROM_BYTES)}</em> : null}
                <button type="button" className="sim-icon-button" onClick={() => setRom(null)} aria-label="Remove ROM">
                  <X size={13} />
                </button>
              </div>
            ) : null}
          </div>

          <div className={`sim-source ${sourceKind === 'package' ? 'selected' : ''}`}>
            <button type="button" className="sim-source-head" onClick={() => setSourceKind('package')}>
              <span>RTL frame package</span>
              <StatusPill tone={pkg ? 'ok' : 'idle'}>{pkg ? 'loaded' : 'choose files'}</StatusPill>
            </button>
            <p>
              Select the four files from the export&apos;s <code>frame/</code> folder, or a JSON file
              shaped as <code>{'{ meta, oamHex, textHex, fontHex }'}</code>.
            </p>
            <label className="sim-file">
              <Upload size={14} />
              <span>Choose frame files</span>
              <input
                type="file"
                multiple
                accept=".meta,.hex,.json,.txt,application/json"
                onChange={(event) => loadPackage(event.target.files)}
              />
            </label>
            {pkg ? (
              <div className="sim-file-row">
                <span className="sim-mono" title={pkgLabel}>
                  {frameMeta ? `${frameMeta.width}×${frameMeta.height} · ${frameMeta.objects} objects` : pkgLabel}
                </span>
                <button type="button" className="sim-icon-button" onClick={() => setPkg(null)} aria-label="Remove frame package">
                  <X size={13} />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="sim-controls">
          <label className="sim-inline-field">
            <span>Page index (ROM only)</span>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="initial page"
              value={pageIndex}
              onChange={(event) => setPageIndex(event.target.value)}
            />
          </label>
          <label className="sim-checkbox">
            <input
              type="checkbox"
              checked={checkDeterminism}
              onChange={(event) => setCheckDeterminism(event.target.checked)}
            />
            <span>Run twice and compare pixel SHA-256</span>
          </label>
          <button type="button" className="sim-button primary" onClick={run} disabled={!canRun}>
            <Play size={14} />
            Run RTL capture
          </button>
          {data?.pixels?.rgbBase64 ? (
            <button type="button" className="sim-button" onClick={downloadPpm}>
              <Download size={14} />
              Download PPM
            </button>
          ) : null}
        </div>

        {!hdlReady ? (
          <p className="sim-note">
            Icarus Verilog and VVP must be available before the RTL capture can run.
          </p>
        ) : null}

        {!result && !busy ? (
          <EmptyState icon={ImageIcon} title="No RTL frame captured yet">
            Load a ROM or frame package, then run the capture. The rendered image will appear here
            directly from the PPM the testbench wrote.
          </EmptyState>
        ) : null}

        {data && partial ? (
          <Notice tone="warn" title="PARTIAL frame — unsupported or missing objects">
            The RTL renderer produced a valid capture for the supported objects, but this frame is not
            complete. {data.frame?.unsupportedObjectCount || 0} unsupported object(s) and{' '}
            {data.frame?.missingAssetCount || 0} missing asset(s) were not rendered. Unsupported
            primitives are reported, never silently drawn as rectangles.
          </Notice>
        ) : null}

        {data && failed ? (
          <Notice tone="error" title="FAILED frame capture">
            {data.capture?.reason || data.detail || 'The capture did not pass its pixel and summary checks.'}
          </Notice>
        ) : null}

        {data ? (
          <>
            {data.pixels ? (
              <div className="sim-monitor">
                <div className="sim-monitor-stage">
                  <canvas ref={canvasRef} className="sim-canvas" aria-label="RTL-rendered frame" />
                </div>
                <aside className="sim-monitor-meta">
                  <h3>{data.detail}</h3>
                  <dl>
                    <dt>Resolution</dt>
                    <dd>
                      {data.width} × {data.height}
                    </dd>
                    <dt>Frame status</dt>
                    <dd>
                      <StatusPill tone={captureStatus === 'COMPLETE' ? 'ok' : captureStatus === 'PARTIAL' ? 'warn' : 'idle'}>
                        {captureStatus || 'unknown'}
                      </StatusPill>
                    </dd>
                    <dt>Objects</dt>
                    <dd>
                      {data.frame?.renderedObjectCount ?? data.frame?.objects} rendered ·{' '}
                      {data.frame?.unsupportedObjectCount || 0} unsupported ·{' '}
                      {data.frame?.missingAssetCount || 0} missing asset(s) · {data.frame?.objects} / 16 packed
                      {data.frame?.warnings?.length ? ` · ${data.frame.warnings.length} warning(s)` : ''}
                    </dd>
                    <dt>Background</dt>
                    <dd className="sim-swatch-line">
                      <span className="sim-swatch" style={{ background: `#${data.frame?.background}` }} />
                      <span className="sim-mono">#{data.frame?.background}</span>
                    </dd>
                    <dt>Checks</dt>
                    <dd>
                      {data.capture?.checks ?? '—'} / {data.capture?.expectedChecks ?? '—'} expected ·{' '}
                      {data.capture?.mismatches ?? '—'} mismatches
                    </dd>
                    <dt>Coverage</dt>
                    <dd>
                      {data.capture?.coverage ?? '—'} / {data.capture?.visibleObjects ?? '—'} visible objects
                    </dd>
                    <dt>Pixels</dt>
                    <dd>
                      {data.capture?.zeroPixels ?? '—'} zero · {data.capture?.backgroundPixels ?? '—'} background ·{' '}
                      {data.capture?.nonBackgroundPixels ?? '—'} non-background · {data.capture?.uniqueColors ?? '—'} unique colors
                    </dd>
                    <dt>Frame checksum</dt>
                    <dd className="sim-mono sim-break">{data.capture?.checksum ?? '—'}</dd>
                    <dt>Pixel SHA-256</dt>
                    <dd className="sim-mono sim-break">{data.pixels.sha256}</dd>
                    <dt>Pixel bytes</dt>
                    <dd>{formatBytes(data.pixels.byteLength)} RGB · PPM {formatBytes(data.pixels.ppmBytes)}</dd>
                    <dt>Determinism</dt>
                    <dd>
                      {data.deterministic == null
                        ? 'not checked'
                        : data.deterministic
                          ? 'identical across two runs'
                          : 'MISMATCH across two runs'}
                    </dd>
                    <dt>Elapsed</dt>
                    <dd>{formatDuration(data.durationMs)}</dd>
                    {data.frame?.rom ? (
                      <>
                        <dt>ROM build</dt>
                        <dd className="sim-mono">{data.frame.rom.buildId}</dd>
                        <dt>ROM page</dt>
                        <dd>{data.frame.rom.initialPage}</dd>
                      </>
                    ) : null}
                  </dl>
                  {data.frame?.warnings?.length ? (
                    <ul className="sim-warning-list">
                      {data.frame.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                  {unsupported.length ? (
                    <div>
                      <h4>Unsupported objects</h4>
                      <ul className="sim-warning-list">
                        {unsupported.map((item) => (
                          <li key={`unsupported-${item.pageObjectIndex}-${item.type}`}>
                            {item.typeName || item.kind} #{item.pageObjectIndex}: {item.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {missingAssets.length ? (
                    <div>
                      <h4>Missing assets</h4>
                      <ul className="sim-warning-list">
                        {missingAssets.map((item) => (
                          <li key={`missing-${item.pageObjectIndex ?? 'global'}-${item.kind}`}>
                            {item.typeName || item.kind}
                            {item.pageObjectIndex != null ? ` #${item.pageObjectIndex}` : ''}: {item.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </aside>
              </div>
            ) : (
              <Notice tone={data.status === 'UNAVAILABLE' ? 'warn' : 'error'} title={data.status || 'Capture failed'}>
                {data.detail || 'The backend did not return a frame.'}
              </Notice>
            )}

            {data.command ? (
              <div className="sim-command">
                {data.command.compile ? <code>{data.command.compile}</code> : null}
                {data.command.run ? <code>{data.command.run}</code> : null}
              </div>
            ) : null}
            <LogBlock title="Icarus / VVP output" text={data.log} />
          </>
        ) : null}
      </Panel>
    </div>
  );
}
