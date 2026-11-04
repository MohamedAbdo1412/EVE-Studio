#!/usr/bin/env node
/**
 * EVE Simulator backend.
 *
 * Local-only HTTP + WebSocket service that runs the real HDL toolchain. Bind is
 * 127.0.0.1 by default. Every simulation result is the native tool's output;
 * unavailable tools are reported as unavailable.
 */

import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { detectTools } from './tools.mjs';
import { runTimingVerification, runFrameCapture, runMemoryVerification } from './simulate.mjs';
import { inspectRom } from './romInspect.mjs';
import {
  OPCODES,
  OPCODE_NAMES,
  STATUS_NAMES,
  VARIABLE_TYPES,
  TYPE_NAMES,
  PROTOCOL_VERSION,
  MAX_PAYLOAD,
  encodePacket,
  decodePacket,
  encodeSetVariable,
  decodeSetVariable,
  hexDump,
} from '../../packages/eve-protocol/eveProtocol.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIMULATOR_ROOT = path.resolve(HERE, '..');
const DIST_ROOT = path.join(SIMULATOR_ROOT, 'dist');

const HOST = process.env.EVE_SIM_HOST || '127.0.0.1';
const PORT = Number(process.env.EVE_SIM_PORT || 5174);
const BODY_LIMIT = 40 * 1024 * 1024;
const SERVE_DIST = process.argv.includes('--serve-dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

let toolCache = { at: 0, value: null };

async function tools({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && toolCache.value && now - toolCache.at < 15_000) return toolCache.value;
  toolCache = { at: now, value: await detectTools() };
  return toolCache.value;
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  if (!origin) return {};
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]') {
      return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
      };
    }
  } catch {
    // Non-URL origins are rejected by omission.
  }
  return {};
}

function sendJson(response, status, payload, request) {
  const body = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...corsHeaders(request),
  });
  response.end(body);
}

function readBody(request, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    request.on('data', (chunk) => {
      length += chunk.length;
      if (length > limit) {
        reject(Object.assign(new Error(`Request body exceeds ${limit} bytes`), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function readJson(request) {
  const raw = await readBody(request);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch (error) {
    throw Object.assign(new Error(`Invalid JSON: ${error.message}`), { status: 400 });
  }
}

function decodeHex(value) {
  const text = String(value || '').replace(/\s+/g, '');
  if (!text || text.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(text)) {
    throw Object.assign(new Error('hex must contain an even number of hexadecimal characters'), {
      status: 400,
    });
  }
  return Buffer.from(text, 'hex');
}

async function handleApi(request, response, url) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }

  if (url.pathname === '/api/health' && request.method === 'GET') {
    const report = await tools();
    sendJson(
      response,
      200,
      {
        ok: true,
        service: 'EVE Simulator backend',
        protocol: `${PROTOCOL_VERSION}.0`,
        hdlReady: report.hdlReady,
        tools: report.summary,
        host: HOST,
        serveDist: SERVE_DIST,
      },
      request,
    );
    return;
  }

  if (url.pathname === '/api/tools' && request.method === 'GET') {
    sendJson(response, 200, await tools({ refresh: url.searchParams.get('refresh') === '1' }), request);
    return;
  }

  if (url.pathname === '/api/simulate/timing' && request.method === 'POST') {
    const body = await readJson(request);
    const report = await tools();
    const result = await runTimingVerification({
      profile: body.profile === 'full' ? 'full' : 'fast',
      tools: report,
    });
    sendJson(response, result.ok ? 200 : result.status === 'UNAVAILABLE' ? 503 : 422, result, request);
    return;
  }

  if (url.pathname === '/api/simulate/memory' && request.method === 'POST') {
    const body = await readJson(request);
    const report = await tools();
    const device = body.device == null ? 'all' : String(body.device);
    const result = await runMemoryVerification({ device, tools: report });
    const status = result.ok
      ? 200
      : result.status === 'UNAVAILABLE'
        ? 503
        : result.status === 'BAD_REQUEST'
          ? 400
          : 422;
    sendJson(response, status, result, request);
    return;
  }

  if (url.pathname === '/api/simulate/frame' && request.method === 'POST') {
    const body = await readJson(request);
    const report = await tools();
    const result = await runFrameCapture({
      framePackage: body.framePackage,
      romBase64: body.romBase64,
      pageIndex: body.pageIndex,
      checkDeterminism: Boolean(body.checkDeterminism),
      tools: report,
    });
    sendJson(response, result.ok ? 200 : result.status === 'UNAVAILABLE' ? 503 : 422, result, request);
    return;
  }

  if (url.pathname === '/api/rom/inspect' && request.method === 'POST') {
    const contentType = String(request.headers['content-type'] || '');
    let bytes;
    if (contentType.includes('application/octet-stream')) {
      bytes = await readBody(request);
    } else {
      const body = await readJson(request);
      if (!body.romBase64) throw Object.assign(new Error('romBase64 is required'), { status: 400 });
      bytes = Buffer.from(String(body.romBase64), 'base64');
    }
    const result = inspectRom(bytes);
    sendJson(response, result.ok ? 200 : 422, result, request);
    return;
  }

  if (url.pathname === '/api/protocol/encode' && request.method === 'POST') {
    const body = await readJson(request);
    let payload;
    if (body.payloadHex != null) {
      payload = decodeHex(body.payloadHex);
      if (payload.length > MAX_PAYLOAD) throw Object.assign(new Error('payload exceeds MAX_PAYLOAD'), { status: 400 });
    } else {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) {
        throw Object.assign(new Error('id must be an unsigned 32-bit integer'), { status: 400 });
      }
      const type = VARIABLE_TYPES[body.type] ? body.type : 'number';
      payload = encodeSetVariable(id, type, body.value);
    }
    const opcode = body.opcode == null ? OPCODES.SET_VARIABLE : Number(body.opcode) & 0xff;
    const sequence = Number(body.sequence || 0) & 0xffff;
    const packet = encodePacket({ opcode, sequence, payload });
    sendJson(
      response,
      200,
      {
        ok: true,
        protocol: `${PROTOCOL_VERSION}.0`,
        opcode,
        opcodeName: OPCODE_NAMES[opcode] || 'UNKNOWN',
        sequence,
        hex: Buffer.from(packet).toString('hex'),
        bytes: Array.from(packet),
        length: packet.length,
        payloadLength: payload.length,
        decoded: safeDescribe(packet),
      },
      request,
    );
    return;
  }

  if (url.pathname === '/api/protocol/decode' && request.method === 'POST') {
    const body = await readJson(request);
    const bytes = decodeHex(body.hex);
    const decoded = decodePacket(bytes);
    if (!decoded.ok) {
      sendJson(
        response,
        422,
        {
          ok: false,
          status: STATUS_NAMES[decoded.error] || String(decoded.error),
          error: decoded.error,
          detail: decoded.detail,
          hexDump: hexDump(bytes),
        },
        request,
      );
      return;
    }
    const packet = decoded.packet;
    sendJson(
      response,
      200,
      {
        ok: true,
        protocol: `${PROTOCOL_VERSION}.0`,
        opcode: packet.opcode,
        opcodeName: OPCODE_NAMES[packet.opcode] || 'UNKNOWN',
        sequence: packet.sequence,
        payloadLength: packet.payloadLength,
        payloadHex: Buffer.from(packet.payload).toString('hex'),
        payload: safeDescribe(bytes),
        crc16: `0x${packet.crc16.toString(16).toUpperCase().padStart(4, '0')}`,
        hexDump: hexDump(bytes),
      },
      request,
    );
    return;
  }

  sendJson(response, 404, { ok: false, detail: `No API route for ${request.method} ${url.pathname}` }, request);
}

function safeDescribe(bytes) {
  const decoded = decodePacket(bytes);
  if (!decoded.ok) return null;
  const packet = decoded.packet;
  const base = {
    opcode: packet.opcode,
    opcodeName: OPCODE_NAMES[packet.opcode] || 'UNKNOWN',
    sequence: packet.sequence,
    payloadLength: packet.payloadLength,
    crc16: `0x${packet.crc16.toString(16).toUpperCase().padStart(4, '0')}`,
  };
  if (packet.opcode === OPCODES.SET_VARIABLE) {
    const variable = decodeSetVariable(packet.payload);
    return {
      ...base,
      variable: {
        id: variable.id,
        idHex: `0x${(variable.id >>> 0).toString(16).toUpperCase().padStart(8, '0')}`,
        type: variable.type,
        typeCode: TYPE_NAMES[variable.type] || variable.type,
        value: variable.value,
      },
    };
  }
  return { ...base, payloadHex: Buffer.from(packet.payload).toString('hex') };
}

async function serveStatic(request, response, url) {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const resolved = path.resolve(DIST_ROOT, `.${requested}`);
  if (!resolved.startsWith(DIST_ROOT)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  let target = resolved;
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = path.join(target, 'index.html');
  } catch {
    target = path.join(DIST_ROOT, 'index.html');
  }
  try {
    const info = await stat(target);
    const extension = path.extname(target).toLowerCase();
    response.writeHead(200, {
      'Content-Type': MIME[extension] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=60',
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('EVE Simulator UI is not built. Run "npm run build" or use the Vite dev server.');
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }
    if (SERVE_DIST) {
      await serveStatic(request, response, url);
      return;
    }
    sendJson(
      response,
      200,
      {
        ok: true,
        service: 'EVE Simulator backend',
        detail: 'API only. Run the Vite dev server for the UI, or start with --serve-dist.',
        endpoints: [
          'GET /api/health',
          'GET /api/tools',
          'POST /api/simulate/timing',
          'POST /api/simulate/frame',
          'POST /api/rom/inspect',
          'POST /api/protocol/encode',
          'POST /api/protocol/decode',
          'WS /ws',
        ],
      },
      request,
    );
  } catch (error) {
    if (!response.headersSent) {
      sendJson(
        response,
        error.status || 500,
        { ok: false, detail: error.message || 'internal error' },
        request,
      );
    } else {
      response.end();
    }
  }
});
server.requestTimeout = 300_000;
server.headersTimeout = 310_000;

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2 * 1024 * 1024 });

wss.on('connection', async (socket) => {
  let busy = false;
  const send = (payload) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
  };

  // Attach the message listener before the first await: a client that sends as
  // soon as the socket opens must not have its messages dropped while the
  // initial tool probe is still running.
  socket.on('message', async (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString('utf8'));
    } catch {
      send({ type: 'error', detail: 'messages must be JSON' });
      return;
    }
    if (message.type === 'ping') {
      send({ type: 'pong', at: Date.now() });
      return;
    }
    if (message.type === 'tools') {
      send({ type: 'tools', report: await tools({ refresh: true }) });
      return;
    }
    if (message.type === 'run-timing') {
      if (busy) {
        send({ type: 'error', detail: 'a simulation is already running on this socket' });
        return;
      }
      busy = true;
      const started = Date.now();
      send({ type: 'run-start', job: 'timing', profile: message.profile || 'fast' });
      try {
        const report = await tools();
        const result = await runTimingVerification({
          profile: message.profile === 'full' ? 'full' : 'fast',
          tools: report,
          onChunk: ({ phase, stream, text }) => send({ type: 'log', job: 'timing', phase, stream, text }),
        });
        send({ type: 'run-result', job: 'timing', result, elapsedMs: Date.now() - started });
      } catch (error) {
        send({ type: 'error', job: 'timing', detail: error.message });
      } finally {
        busy = false;
      }
      return;
    }
    send({ type: 'error', detail: `unknown message type "${message.type}"` });
  });

  tools()
    .then((report) => {
      send({
        type: 'hello',
        service: 'EVE Simulator telemetry',
        protocol: `${PROTOCOL_VERSION}.0`,
        tools: report.summary,
      });
    })
    .catch((error) => send({ type: 'error', detail: `tool probe failed: ${error.message}` }));
});

server.listen(PORT, HOST, () => {
  console.log(`EVE Simulator backend listening on http://${HOST}:${PORT}`);
  console.log(`WebSocket telemetry: ws://${HOST}:${PORT}/ws`);
  console.log(
    'Native tools are detected at request time. Unavailable tools stay labelled unavailable.',
  );
});

function shutdown() {
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
