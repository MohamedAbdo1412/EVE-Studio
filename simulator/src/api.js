/**
 * Thin client for the local EVE Simulator backend.
 *
 * The backend returns a structured body for every HTTP status, including 422
 * simulation failures and 503 unavailable-tool states. `request` therefore only
 * throws for network failures; callers inspect `result.ok` and `result.status`.
 */

export async function request(path, { method = 'GET', body, headers } = {}) {
  let response;
  try {
    response = await fetch(path, { method, headers, body });
  } catch (error) {
    throw new Error(
      `Cannot reach the simulator backend at ${path}. Start it with "npm run server" or use "npm run dev" in simulator/. (${error.message})`,
    );
  }

  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = { ok: false, detail: `${path} returned invalid JSON.` };
    }
  } else {
    const text = await response.text();
    data = { ok: response.ok, detail: text };
  }

  return { ok: response.ok, status: response.status, data };
}

export function getHealth() {
  return request('/api/health');
}

export function getTools(refresh = false) {
  return request(`/api/tools${refresh ? '?refresh=1' : ''}`);
}

export function runTiming(profile) {
  return request('/api/simulate/timing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  });
}

export function runMemory(device = 'all') {
  return request('/api/simulate/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device }),
  });
}

export function runFrame(body) {
  return request('/api/simulate/frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function inspectRom(bytes) {
  return request('/api/rom/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
}

export function encodeProtocol(body) {
  return request('/api/protocol/encode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function decodeProtocol(hex) {
  return request('/api/protocol/decode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hex }),
  });
}
