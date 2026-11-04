import React, { useState } from 'react';
import { FileSearch, Upload } from 'lucide-react';
import { inspectRom } from '../api.js';
import { formatBytes, formatHexOffset } from '../format.js';
import { CheckList, EmptyState, LogBlock, Metric, Notice, Panel, StatusPill } from '../components/UI.jsx';

function RegionTable({ regions }) {
  return (
    <table className="sim-table">
      <thead>
        <tr>
          <th>Region</th>
          <th>Kind</th>
          <th>Offset</th>
          <th>Length</th>
        </tr>
      </thead>
      <tbody>
        {regions.map((region) => (
          <tr key={`${region.name}-${region.offset}`}>
            <td>{region.name}</td>
            <td>
              <span className={`sim-kind ${region.kind}`}>{region.kind}</span>
            </td>
            <td className="sim-mono">{formatHexOffset(region.offset)}</td>
            <td>{formatBytes(region.length)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AssetTable({ assets }) {
  return (
    <table className="sim-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Path</th>
          <th>Type / format</th>
          <th>Size</th>
          <th>Offset</th>
          <th>Stored</th>
          <th>CRC32</th>
          <th>4 KiB aligned</th>
        </tr>
      </thead>
      <tbody>
        {assets.map((asset) => (
          <tr key={`${asset.index}-${asset.path}`}>
            <td>{asset.index}</td>
            <td className="sim-mono">
              {asset.path}
              {asset.aliasOfIndex != null ? <em> alias #{asset.aliasOfIndex}</em> : null}
            </td>
            <td>
              {asset.type}
              <em> {asset.pixelFormat}</em>
            </td>
            <td>
              {asset.width && asset.height ? `${asset.width}×${asset.height}` : '—'}
            </td>
            <td className="sim-mono">{formatHexOffset(asset.offset)}</td>
            <td>{formatBytes(asset.storedLength)}</td>
            <td className="sim-mono">{asset.crc32}</td>
            <td>{asset.sectorAligned ? 'yes' : 'NO'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VariableTable({ variables }) {
  return (
    <table className="sim-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Initial value</th>
          <th>ID</th>
        </tr>
      </thead>
      <tbody>
        {variables.map((variable) => (
          <tr key={variable.id + variable.name}>
            <td className="sim-mono">{variable.name || '(unnamed)'}</td>
            <td>{variable.type}</td>
            <td className="sim-mono">
              {typeof variable.value === 'string' ? variable.value : JSON.stringify(variable.value)}
            </td>
            <td className="sim-mono">{variable.id}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SceneTable({ scenes }) {
  const limit = 150;
  const shown = scenes.slice(0, limit);
  return (
    <>
      <table className="sim-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Type</th>
            <th>Page</th>
            <th>Object</th>
            <th>Position</th>
            <th>Size</th>
            <th>Fill</th>
            <th>Binding</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((scene) => (
            <tr key={scene.index}>
              <td>{scene.index}</td>
              <td>{scene.type}</td>
              <td>{scene.pageIndex}</td>
              <td className="sim-mono">{scene.objectId}</td>
              <td className="sim-mono">
                {scene.x}, {scene.y}
              </td>
              <td>
                {scene.width}×{scene.height}
              </td>
              <td className="sim-swatch-line">
                <span className="sim-swatch" style={{ background: scene.fillColor }} />
                <span className="sim-mono">{scene.fillColor}</span>
              </td>
              <td>{scene.bindingIndex === 0xffff ? '—' : scene.bindingIndex}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {scenes.length > limit ? (
        <p className="sim-note">
          Showing {limit} of {scenes.length} scene records.
        </p>
      ) : null}
    </>
  );
}

export default function RomTab() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const inspect = async (fileList) => {
    const selected = fileList?.[0];
    if (!selected) return;
    setFile({ name: selected.name, size: selected.size });
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      setResult(await inspectRom(bytes));
    } catch (readError) {
      setError(readError.message);
    } finally {
      setBusy(false);
    }
  };

  const data = result?.data;

  return (
    <div className="sim-stack">
      <Notice tone="info" title="Checksums are verified before anything else">
        The inspector parses the image against EVE ROM FORMAT 1.0, re-computes the content CRC32,
        header CRC32 and SHA-256, and reports the exact regions stored in the file. It does not
        execute HDL.
      </Notice>

      {error ? (
        <Notice tone="error" title="ROM inspection failed">
          {error}
        </Notice>
      ) : null}

      <Panel
        title="ROM inspector"
        tag="EVE ROM FORMAT 1.0"
        actions={<StatusPill tone={busy ? 'busy' : data?.ok ? 'ok' : result ? 'warn' : 'idle'}>{busy ? 'parsing' : data?.ok ? 'valid' : 'not inspected'}</StatusPill>}
      >
        <div className="sim-controls">
          <label className="sim-file">
            <Upload size={14} />
            <span>Choose 16 MiB .bin</span>
            <input type="file" accept=".bin,application/octet-stream" onChange={(event) => inspect(event.target.files)} />
          </label>
          {file ? (
            <span className="sim-file-row">
              <span className="sim-mono">{file.name}</span>
              <span>{formatBytes(file.size)}</span>
            </span>
          ) : null}
        </div>

        {!result && !busy ? (
          <EmptyState icon={FileSearch} title="No ROM inspected">
            Choose the <code>EVE_ROM_16MB.bin</code> produced by EVE Studio&apos;s Hardware Build.
          </EmptyState>
        ) : null}

        {result && !data?.ok ? (
          <>
            <Notice tone="error" title="ROM did not validate">
              {data?.detail || data?.error || `HTTP ${result.status}`}
            </Notice>
            {data?.errors?.length ? (
              <ul className="sim-warning-list">
                {data.errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}

        {data?.ok ? (
          <>
            <div className="sim-metrics">
              <Metric label="Format" value={data.header.format} />
              <Metric label="File size" value={formatBytes(data.header.capacity)} />
              <Metric label="Used" value={formatBytes(data.header.usedBytes)} />
              <Metric label="Free (0xFF)" value={formatBytes(data.header.freeBytes)} />
              <Metric label="Occupancy" value={`${data.header.occupancyPercent}%`} />
              <Metric label="Logical size" value={`${data.header.width} × ${data.header.height}`} />
              <Metric label="Initial page" value={data.header.initialPage} />
              <Metric label="Build ID" value={data.header.buildIdHex} mono />
              <Metric label="Application ID" value={data.header.applicationIdHex} mono />
              <Metric label="Content CRC32" value={`0x${(data.header.contentCrc32 >>> 0).toString(16).toUpperCase().padStart(8, '0')}`} mono />
              <Metric label="SHA-256" value={data.header.sha256} mono />
              <Metric label="Records" value={`${data.header.sceneCount} scene · ${data.header.variableCount} var · ${data.header.assetCount} asset`} />
            </div>

            <div className="sim-split">
              <div>
                <h3 className="sim-subhead">Validation checks</h3>
                <CheckList checks={data.checks} />
              </div>
              <div>
                <h3 className="sim-subhead">Scene record types</h3>
                <div className="sim-chips">
                  {Object.entries(data.sceneCounts).map(([name, count]) => (
                    <span key={name} className="sim-chip">
                      {name} <strong>{count}</strong>
                    </span>
                  ))}
                  {Object.keys(data.sceneCounts).length === 0 ? <span className="sim-note">No scene records.</span> : null}
                </div>
              </div>
            </div>

            <h3 className="sim-subhead">Address map</h3>
            <RegionTable regions={data.regions} />

            <details className="sim-details" open>
              <summary>Assets ({data.assets.length})</summary>
              <AssetTable assets={data.assets} />
            </details>

            <details className="sim-details">
              <summary>Variables ({data.variables.length})</summary>
              <VariableTable variables={data.variables} />
            </details>

            <details className="sim-details">
              <summary>Scene records ({data.scenes.length})</summary>
              <SceneTable scenes={data.scenes} />
            </details>

            <LogBlock title="Inspector note" text={data.detail} />
          </>
        ) : null}
      </Panel>
    </div>
  );
}
