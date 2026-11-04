import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Eraser, PlugZap, RefreshCw, Send } from 'lucide-react';
import { EmptyState, Notice, Panel, StatusPill } from '../components/UI.jsx';

const MAX_LOG = 250;

function timestamp() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

export default function TelemetryTab() {
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState('connecting');
  const [detail, setDetail] = useState('');
  const [log, setLog] = useState([]);
  const socketRef = useRef(null);

  const append = useCallback((entry) => {
    setLog((current) => [...current.slice(-(MAX_LOG - 1)), { at: timestamp(), ...entry }]);
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws`;
    setStatus('connecting');
    setDetail(url);

    let closedByUnmount = false;
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      setStatus('error');
      setDetail(error.message);
      return undefined;
    }
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      if (closedByUnmount) {
        // The effect was torn down while the handshake was in flight
        // (React StrictMode does this immediately). Close only now that the
        // socket is established, so browsers do not log an aborted connection.
        socket.close();
        return;
      }
      setStatus('open');
      setDetail(`Connected to ${url}`);
      append({ direction: 'system', type: 'socket', text: 'WebSocket connected.' });
    });
    socket.addEventListener('message', (event) => {
      if (closedByUnmount) return;
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        payload = { type: 'text', data: String(event.data) };
      }
      append({ direction: 'in', type: payload.type || 'message', payload });
    });
    socket.addEventListener('error', () => {
      if (closedByUnmount) return;
      setStatus('error');
      setDetail('WebSocket error. Is the backend running on 127.0.0.1:5174?');
    });
    socket.addEventListener('close', () => {
      if (closedByUnmount) return;
      setStatus('closed');
      setDetail('WebSocket closed.');
      append({ direction: 'system', type: 'socket', text: 'WebSocket closed.' });
    });

    return () => {
      closedByUnmount = true;
      if (socketRef.current === socket) socketRef.current = null;
      // A CONNECTING socket is closed by the open handler above once the
      // handshake completes. Closing it here would make browsers log
      // "WebSocket is closed before the connection is established".
      if (socket.readyState === WebSocket.OPEN) socket.close();
    };
  }, [generation, append]);

  const send = (payload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      append({ direction: 'system', type: 'error', text: 'Cannot send: WebSocket is not open.' });
      return;
    }
    socket.send(JSON.stringify(payload));
    append({ direction: 'out', type: payload.type, payload });
  };

  const connected = status === 'open';

  return (
    <div className="sim-stack">
      <Notice tone="info" title="Local WebSocket telemetry">
        The simulator streams job status and tool output over <code>ws://127.0.0.1:5174/ws</code>.
        It is a local-only channel; no telemetry leaves this machine.
      </Notice>

      <Panel
        title="Telemetry channel"
        tag="WS /ws"
        actions={
          <>
            <StatusPill tone={connected ? 'ok' : status === 'connecting' ? 'busy' : 'warn'}>
              {status}
            </StatusPill>
            <button type="button" className="sim-button" onClick={() => setGeneration((value) => value + 1)}>
              <PlugZap size={14} />
              Reconnect
            </button>
          </>
        }
      >
        <p className="sim-note sim-break">{detail}</p>
        <div className="sim-telemetry-actions">
          <button type="button" className="sim-button" onClick={() => send({ type: 'ping' })} disabled={!connected}>
            <Send size={14} />
            Ping
          </button>
          <button type="button" className="sim-button" onClick={() => send({ type: 'tools' })} disabled={!connected}>
            <RefreshCw size={14} />
            Refresh tools
          </button>
          <button
            type="button"
            className="sim-button"
            onClick={() => send({ type: 'run-timing', profile: 'fast' })}
            disabled={!connected}
          >
            <Activity size={14} />
            Run timing (fast)
          </button>
          <button
            type="button"
            className="sim-button"
            onClick={() => send({ type: 'run-timing', profile: 'full' })}
            disabled={!connected}
          >
            <Activity size={14} />
            Run timing (full)
          </button>
          <button type="button" className="sim-button ghost" onClick={() => setLog([])}>
            <Eraser size={14} />
            Clear log
          </button>
        </div>

        {log.length === 0 ? (
          <EmptyState icon={Activity} title="No telemetry yet">
            Send a ping or start a timing run to see backend messages arrive over the socket.
          </EmptyState>
        ) : (
          <ol className="sim-telemetry-log">
            {log.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className={entry.direction}>
                <div className="sim-telemetry-head">
                  <span className="sim-telemetry-time">{entry.at}</span>
                  <span className="sim-telemetry-direction">{entry.direction}</span>
                  <strong>{entry.type}</strong>
                </div>
                {entry.text ? <p>{entry.text}</p> : null}
                {entry.payload ? <pre>{JSON.stringify(entry.payload, null, 2)}</pre> : null}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
