/** Browser-side formatting and byte helpers. No rendering logic lives here. */

export function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function formatDuration(ms) {
  const value = Number(ms) || 0;
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(2)} s`;
  return `${(value / 60_000).toFixed(2)} min`;
}

export function formatHexOffset(value) {
  const number = Number(value) || 0;
  return `0x${number.toString(16).toUpperCase().padStart(8, '0')}`;
}

export function bytesToBase64(bytes) {
  const chunk = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Expand 8-bit RGB from the RTL PPM capture into RGBA for canvas display only. */
export function rgbToRgba(rgb) {
  const rgba = new Uint8ClampedArray((rgb.length / 3) * 4);
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 4) {
    rgba[target] = rgb[source];
    rgba[target + 1] = rgb[source + 1];
    rgba[target + 2] = rgb[source + 2];
    rgba[target + 3] = 255;
  }
  return rgba;
}

/** Rebuild a valid binary PPM (P6) from the pixels returned by the backend. */
export function rgbToPpm(width, height, rgb) {
  const header = new TextEncoder().encode(`P6\n${width} ${height}\n255\n`);
  const ppm = new Uint8Array(header.length + rgb.length);
  ppm.set(header, 0);
  ppm.set(rgb, header.length);
  return ppm;
}

export function downloadBytes(bytes, filename, type = 'application/octet-stream') {
  const blob = new Blob([bytes], { type });
  downloadBlob(blob, filename);
}

export function downloadText(text, filename, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function shortMiddle(value, head = 10, tail = 8) {
  const text = String(value ?? '');
  if (text.length <= head + tail + 1) return text;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export function parseFramePackageJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`Frame package JSON is invalid: ${error.message}`);
  }
  const pkg = data?.framePackage || data;
  if (!pkg || typeof pkg !== 'object') throw new Error('Frame package JSON must be an object.');
  for (const key of ['meta', 'oamHex', 'textHex', 'fontHex']) {
    if (typeof pkg[key] !== 'string') {
      throw new Error(`Frame package JSON is missing the "${key}" string.`);
    }
  }
  return {
    meta: pkg.meta,
    oamHex: pkg.oamHex,
    textHex: pkg.textHex,
    fontHex: pkg.fontHex,
  };
}

export async function framePackageFromFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) throw new Error('Select frame.meta, oam.hex, text.hex and font.hex.');
  const jsonFile = files.find((file) => /\.json$/i.test(file.name));
  if (jsonFile) return parseFramePackageJson(await jsonFile.text());

  const byName = new Map(files.map((file) => [file.name.toLowerCase(), file]));
  const required = ['frame.meta', 'oam.hex', 'text.hex', 'font.hex'];
  const missing = required.filter((name) => !byName.has(name));
  if (missing.length) {
    throw new Error(`Frame package is missing: ${missing.join(', ')}.`);
  }
  return {
    meta: await byName.get('frame.meta').text(),
    oamHex: await byName.get('oam.hex').text(),
    textHex: await byName.get('text.hex').text(),
    fontHex: await byName.get('font.hex').text(),
  };
}

export function describeFrameMeta(meta) {
  const parts = String(meta || '').trim().split(/\s+/);
  if (parts.length !== 4) return null;
  return {
    width: Number(parts[0]),
    height: Number(parts[1]),
    objects: Number(parts[2]),
    background: `#${parts[3]}`,
  };
}
