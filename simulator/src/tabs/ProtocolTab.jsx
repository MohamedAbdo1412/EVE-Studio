import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Play } from 'lucide-react';
import {
  COMMANDS,
  MAX_PAYLOAD,
  OPCODES,
  PROTOCOL_VERSION,
  TYPE_NAMES,
  VARIABLE_TYPES,
} from '../../../packages/eve-protocol/eveProtocol.js';
import { decodeProtocol, encodeProtocol } from '../api.js';
import { Notice, Panel, StatusPill } from '../components/UI.jsx';

const TYPE_OPTIONS = Object.entries(VARIABLE_TYPES);
const OPCODE_OPTIONS = Object.entries(OPCODES).sort((a, b) => a[1] - b[1]);

function pretty(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseId(text) {
  const trimmed = String(text || '').trim();
  if (!/^(0x[0-9a-f]+|[0-9]+)$/i.test(trimmed)) {
    throw new Error('Variable ID must be a decimal or 0x-prefixed hexadecimal unsigned 32-bit integer.');
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error('Variable ID is outside the unsigned 32-bit range.');
  }
  return value;
}

function parseTypedValue(type, text) {
  if (type === 'number') {
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error('Number values must be finite.');
    return value;
  }
  if (type === 'boolean') {
    const normalized = String(text).trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    throw new Error('Boolean values must be true/false, 1/0 or yes/no.');
  }
  if (type === 'image') {
    const value = Number(text);
    if (!Number.isInteger(value) || value < 0) throw new Error('Image values are asset indices (non-negative integers).');
    return value;
  }
  return String(text);
}

export default function ProtocolTab() {
  const [id, setId] = useState('0x12345678');
  const [type, setType] = useState('number');
  const [value, setValue] = useState('42');
  const [sequence, setSequence] = useState('1');
  const [opcode, setOpcode] = useState(String(OPCODES.SET_VARIABLE));
  const [payloadHex, setPayloadHex] = useState('');
  const [encodeBusy, setEncodeBusy] = useState(false);
  const [encoded, setEncoded] = useState(null);
  const [encodeError, setEncodeError] = useState(null);

  const [decodeHexValue, setDecodeHexValue] = useState('');
  const [decodeBusy, setDecodeBusy] = useState(false);
  const [decoded, setDecoded] = useState(null);
  const [decodeError, setDecodeError] = useState(null);

  const opcodeNumber = Number(opcode);
  const usesRawPayload = opcodeNumber !== OPCODES.SET_VARIABLE || payloadHex.trim() !== '';

  const commandRows = useMemo(
    () =>
      Object.entries(COMMANDS).map(([name, command]) => ({
        name,
        opcode: command.opcode,
        request: command.request,
        effect: command.hardwareEffect,
      })),
    [],
  );

  const encode = async () => {
    setEncodeBusy(true);
    setEncodeError(null);
    setEncoded(null);
    try {
      const body = { opcode: opcodeNumber, sequence: Number(sequence) };
      if (payloadHex.trim()) {
        body.payloadHex = payloadHex.trim();
      } else if (opcodeNumber === OPCODES.SET_VARIABLE) {
        body.id = parseId(id);
        body.type = type;
        body.value = parseTypedValue(type, value);
      } else {
        throw new Error('Opcodes other than SET_VARIABLE require an explicit payload hex in this console.');
      }
      const response = await encodeProtocol(body);
      setEncoded(response);
      if (response.ok) setDecodeHexValue(response.data.hex);
    } catch (requestError) {
      setEncodeError(requestError.message);
    } finally {
      setEncodeBusy(false);
    }
  };

  const decode = async () => {
    setDecodeBusy(true);
    setDecodeError(null);
    setDecoded(null);
    try {
      const response = await decodeProtocol(decodeHexValue.replace(/\s+/g, ''));
      setDecoded(response);
    } catch (requestError) {
      setDecodeError(requestError.message);
    } finally {
      setDecodeBusy(false);
    }
  };

  const encodedData = encoded?.data;
  const decodedData = decoded?.data;

  return (
    <div className="sim-stack">
      <Notice tone="info" title={`EVE PROTOCOL ${PROTOCOL_VERSION}.0 — shared definition`}>
        Opcodes, type codes and framing are imported from <code>packages/eve-protocol</code>, the same
        module used by the generated firmware and Studio. Maximum payload is {MAX_PAYLOAD} bytes.
        Encoding and decoding run in the local backend, not in a private simulator copy.
      </Notice>

      <div className="sim-split even">
        <Panel
          title="Encode packet"
          tag="SET_VARIABLE by default"
          actions={<StatusPill tone={encodeBusy ? 'busy' : encoded?.ok ? 'ok' : encodeError ? 'warn' : 'idle'}>{encodeBusy ? 'encoding' : encoded?.ok ? 'encoded' : 'idle'}</StatusPill>}
        >
          {encodeError ? (
            <Notice tone="error" title="Encode failed">
              {encodeError}
            </Notice>
          ) : null}
          <div className="sim-form">
            <label className="sim-field">
              <span className="sim-field-label">Opcode</span>
              <select value={opcode} onChange={(event) => setOpcode(event.target.value)}>
                {OPCODE_OPTIONS.map(([name, code]) => (
                  <option key={name} value={String(code)}>
                    {name} (0x{code.toString(16).toUpperCase().padStart(2, '0')})
                  </option>
                ))}
              </select>
            </label>
            <label className="sim-field">
              <span className="sim-field-label">Sequence</span>
              <input value={sequence} onChange={(event) => setSequence(event.target.value)} inputMode="numeric" />
            </label>
            <label className="sim-field">
              <span className="sim-field-label">Variable ID</span>
              <input value={id} onChange={(event) => setId(event.target.value)} disabled={opcodeNumber !== OPCODES.SET_VARIABLE} />
              <span className="sim-field-hint">Use the ID shown by the ROM inspector or Studio.</span>
            </label>
            <label className="sim-field">
              <span className="sim-field-label">Type</span>
              <select value={type} onChange={(event) => setType(event.target.value)} disabled={opcodeNumber !== OPCODES.SET_VARIABLE}>
                {TYPE_OPTIONS.map(([name, code]) => (
                  <option key={name} value={name}>
                    {name} ({TYPE_NAMES[code]})
                  </option>
                ))}
              </select>
            </label>
            <label className="sim-field span-2">
              <span className="sim-field-label">Value</span>
              <input value={value} onChange={(event) => setValue(event.target.value)} disabled={opcodeNumber !== OPCODES.SET_VARIABLE} />
              <span className="sim-field-hint">
                number → float32, color → #RRGGBB[AA], boolean → true/false, text → UTF-8, image → asset index.
              </span>
            </label>
            <label className="sim-field span-2">
              <span className="sim-field-label">Raw payload hex (optional override)</span>
              <textarea
                rows={2}
                value={payloadHex}
                onChange={(event) => setPayloadHex(event.target.value)}
                placeholder="e.g. 7856341202000000"
              />
              <span className="sim-field-hint">
                When supplied, this payload is used verbatim. Required for non-SET_VARIABLE opcodes.
              </span>
            </label>
          </div>
          <button type="button" className="sim-button primary" onClick={encode} disabled={encodeBusy}>
            <Play size={14} />
            Encode
          </button>

          {encodedData?.ok ? (
            <>
              <div className="sim-metrics">
                <div className="sim-metric">
                  <span>Opcode</span>
                  <strong>{encodedData.opcodeName}</strong>
                </div>
                <div className="sim-metric">
                  <span>Sequence</span>
                  <strong>{encodedData.sequence}</strong>
                </div>
                <div className="sim-metric">
                  <span>Packet length</span>
                  <strong>{encodedData.length} bytes</strong>
                </div>
                <div className="sim-metric">
                  <span>Payload</span>
                  <strong>{encodedData.payloadLength} bytes</strong>
                </div>
              </div>
              <div className="sim-code-block">
                <span>Wire bytes</span>
                <code className="sim-break">{encodedData.hex}</code>
              </div>
              <div className="sim-code-block">
                <span>Decoded by backend</span>
                <pre>{pretty(encodedData.decoded)}</pre>
              </div>
              {usesRawPayload ? (
                <p className="sim-note">This packet used an explicit payload override.</p>
              ) : null}
            </>
          ) : null}
          {encoded && !encoded.ok ? (
            <Notice tone="warn" title={encodedData?.status || `HTTP ${encoded.status}`}>
              {encodedData?.detail || 'The backend rejected the packet.'}
            </Notice>
          ) : null}
        </Panel>

        <Panel
          title="Decode packet"
          tag="CRC16-CCITT-FALSE"
          actions={<StatusPill tone={decodeBusy ? 'busy' : decodedData?.ok ? 'ok' : decodeError ? 'warn' : 'idle'}>{decodeBusy ? 'decoding' : decodedData?.ok ? 'valid' : 'idle'}</StatusPill>}
        >
          {decodeError ? (
            <Notice tone="error" title="Decode failed">
              {decodeError}
            </Notice>
          ) : null}
          <label className="sim-field">
            <span className="sim-field-label">Packet hex</span>
            <textarea
              rows={5}
              value={decodeHexValue}
              onChange={(event) => setDecodeHexValue(event.target.value)}
              placeholder="455601010000000000000000"
              className="sim-mono"
            />
            <span className="sim-field-hint">Whitespace is ignored. The backend validates magic, version, length and CRC.</span>
          </label>
          <button type="button" className="sim-button primary" onClick={decode} disabled={decodeBusy || !decodeHexValue.trim()}>
            <ArrowRightLeft size={14} />
            Decode
          </button>

          {decodedData?.ok ? (
            <>
              <div className="sim-metrics">
                <div className="sim-metric">
                  <span>Opcode</span>
                  <strong>{decodedData.opcodeName}</strong>
                </div>
                <div className="sim-metric">
                  <span>Sequence</span>
                  <strong>{decodedData.sequence}</strong>
                </div>
                <div className="sim-metric">
                  <span>Payload</span>
                  <strong>{decodedData.payloadLength} bytes</strong>
                </div>
                <div className="sim-metric">
                  <span>CRC16</span>
                  <strong className="sim-mono">{decodedData.crc16}</strong>
                </div>
              </div>
              <div className="sim-code-block">
                <span>Payload hex</span>
                <code className="sim-break">{decodedData.payloadHex || '(empty)'}</code>
              </div>
              <div className="sim-code-block">
                <span>Decoded fields</span>
                <pre>{pretty(decodedData.payload)}</pre>
              </div>
              <div className="sim-code-block">
                <span>Hex dump</span>
                <pre>{decodedData.hexDump}</pre>
              </div>
            </>
          ) : null}
          {decoded && !decoded.ok ? (
            <>
              <Notice tone="warn" title={decodedData?.status || `HTTP ${decoded.status}`}>
                {decodedData?.detail || 'The packet did not validate.'}
              </Notice>
              {decodedData?.hexDump ? (
                <div className="sim-code-block">
                  <span>Hex dump</span>
                  <pre>{decodedData.hexDump}</pre>
                </div>
              ) : null}
            </>
          ) : null}
        </Panel>
      </div>

      <Panel title="Opcode reference" tag="packages/eve-protocol">
        <details className="sim-details" open>
          <summary>Registered commands ({commandRows.length})</summary>
          <table className="sim-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Opcode</th>
                <th>Request payload</th>
                <th>Hardware effect</th>
              </tr>
            </thead>
            <tbody>
              {commandRows.map((row) => (
                <tr key={row.name}>
                  <td className="sim-mono">{row.name}</td>
                  <td className="sim-mono">0x{row.opcode.toString(16).toUpperCase().padStart(2, '0')}</td>
                  <td className="sim-mono">{row.request}</td>
                  <td>{row.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sim-note">
            Opcode names are reverse-mapped from the same registry used by firmware generation.
            Unknown opcodes decode as UNKNOWN but still validate framing and CRC.
          </p>
        </details>
      </Panel>
    </div>
  );
}
