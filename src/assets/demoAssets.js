const cache = new Map();

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  return Math.round((base64.length * 3) / 4);
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function assetFromDataUrl(path, name, dataUrl, width, height, extra = {}) {
  return {
    id: path,
    path,
    name,
    type: 'image/png',
    size: estimateDataUrlBytes(dataUrl),
    width,
    height,
    dataUrl,
    source: 'sample',
    ...extra,
  };
}

function createRoomIcon() {
  const canvas = makeCanvas(192, 192);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 192, 192);
  gradient.addColorStop(0, '#2455AA');
  gradient.addColorStop(1, '#00B87C');
  roundRect(ctx, 8, 8, 176, 176, 38);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  // Stylised thermometer.
  ctx.beginPath();
  ctx.moveTo(82, 54);
  ctx.lineTo(82, 112);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(82, 132, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#00FFB2';
  ctx.beginPath();
  ctx.arc(82, 132, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 5;
  for (let index = 0; index < 4; index += 1) {
    ctx.beginPath();
    ctx.moveTo(96, 64 + index * 13);
    ctx.lineTo(110, 64 + index * 13);
    ctx.stroke();
  }
  // Snow/air glyph.
  ctx.strokeStyle = '#C7FFF0';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(132, 60);
  ctx.lineTo(132, 104);
  ctx.moveTo(113, 71);
  ctx.lineTo(151, 93);
  ctx.moveTo(151, 71);
  ctx.lineTo(113, 93);
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

function createSunset() {
  const canvas = makeCanvas(640, 320);
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 320);
  sky.addColorStop(0, '#1D204C');
  sky.addColorStop(0.48, '#BD4B6A');
  sky.addColorStop(0.72, '#F59E5B');
  sky.addColorStop(1, '#301F3B');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 640, 320);
  const sun = ctx.createRadialGradient(470, 154, 4, 470, 154, 64);
  sun.addColorStop(0, '#FFF1C9');
  sun.addColorStop(0.35, '#FFD37A');
  sun.addColorStop(1, 'rgba(255,170,95,0)');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(470, 154, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2C203C';
  ctx.beginPath();
  ctx.moveTo(0, 246);
  ctx.lineTo(130, 174);
  ctx.lineTo(238, 232);
  ctx.lineTo(365, 142);
  ctx.lineTo(505, 230);
  ctx.lineTo(640, 172);
  ctx.lineTo(640, 320);
  ctx.lineTo(0, 320);
  ctx.fill();
  ctx.fillStyle = '#17152A';
  ctx.beginPath();
  ctx.moveTo(0, 280);
  ctx.lineTo(180, 228);
  ctx.lineTo(324, 278);
  ctx.lineTo(470, 222);
  ctx.lineTo(640, 280);
  ctx.lineTo(640, 320);
  ctx.lineTo(0, 320);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  for (let index = 0; index < 18; index += 1) {
    const x = (index * 89 + 37) % 640;
    const y = (index * 41 + 23) % 130;
    ctx.fillRect(x, y, 2, 2);
  }
  return canvas.toDataURL('image/png');
}

function createMountains() {
  const canvas = makeCanvas(640, 320);
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 320);
  sky.addColorStop(0, '#071624');
  sky.addColorStop(0.55, '#123A58');
  sky.addColorStop(1, '#1C5D78');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 640, 320);
  ctx.fillStyle = '#D8F3FF';
  ctx.beginPath();
  ctx.arc(510, 74, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0B2437';
  ctx.beginPath();
  ctx.moveTo(0, 280);
  ctx.lineTo(120, 160);
  ctx.lineTo(220, 246);
  ctx.lineTo(350, 90);
  ctx.lineTo(510, 260);
  ctx.lineTo(640, 180);
  ctx.lineTo(640, 320);
  ctx.lineTo(0, 320);
  ctx.fill();
  ctx.fillStyle = '#153E58';
  ctx.beginPath();
  ctx.moveTo(0, 300);
  ctx.lineTo(190, 214);
  ctx.lineTo(320, 284);
  ctx.lineTo(500, 188);
  ctx.lineTo(640, 264);
  ctx.lineTo(640, 320);
  ctx.lineTo(0, 320);
  ctx.fill();
  ctx.strokeStyle = 'rgba(199,239,255,0.48)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 284);
  ctx.lineTo(120, 166);
  ctx.lineTo(220, 250);
  ctx.lineTo(350, 96);
  ctx.lineTo(510, 264);
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

function createCity() {
  const canvas = makeCanvas(640, 320);
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 320);
  sky.addColorStop(0, '#050A13');
  sky.addColorStop(0.72, '#0B1E35');
  sky.addColorStop(1, '#102A43');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 640, 320);
  ctx.fillStyle = '#13283E';
  const buildings = [24, 92, 76, 120, 64, 148, 90, 136, 72, 110, 58, 128, 84];
  let x = 0;
  for (let index = 0; index < buildings.length; index += 1) {
    const width = 42 + ((index * 17) % 28);
    const height = buildings[index];
    ctx.fillRect(x, 320 - height, width, height);
    ctx.fillStyle = index % 2 ? '#1A3550' : '#13283E';
    for (let row = 0; row < Math.floor(height / 24); row += 1) {
      for (let column = 0; column < Math.floor(width / 18); column += 1) {
        if ((row + column + index) % 3 !== 0) {
          ctx.fillStyle = (row * 7 + column * 13 + index) % 5 === 0 ? '#FFD166' : '#3D8BFF';
          ctx.globalAlpha = 0.65;
          ctx.fillRect(x + 7 + column * 17, 320 - height + 10 + row * 22, 6, 8);
          ctx.globalAlpha = 1;
        }
      }
    }
    x += width + 6;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.fillRect(0, 288, 640, 32);
  ctx.fillStyle = '#3D8BFF';
  ctx.globalAlpha = 0.35;
  ctx.fillRect(0, 303, 640, 3);
  return canvas.toDataURL('image/png');
}

function buildDemoAsset(path) {
  if (cache.has(path)) return cache.get(path);
  if (typeof document === 'undefined') return null;
  let asset = null;
  if (path === 'assets/room-icon.png') {
    asset = assetFromDataUrl(path, 'room-icon.png', createRoomIcon(), 192, 192, { hasAlpha: true });
  } else if (path === 'assets/gallery-sunset.png') {
    asset = assetFromDataUrl(path, 'gallery-sunset.png', createSunset(), 640, 320, { hasAlpha: false });
  } else if (path === 'assets/gallery-mountains.png') {
    asset = assetFromDataUrl(path, 'gallery-mountains.png', createMountains(), 640, 320, { hasAlpha: false });
  } else if (path === 'assets/gallery-city.png') {
    asset = assetFromDataUrl(path, 'gallery-city.png', createCity(), 640, 320, { hasAlpha: false });
  }
  if (asset) cache.set(path, asset);
  return asset;
}

export function getDemoAsset(path) {
  return buildDemoAsset(path);
}

export function getDemoAssets(paths) {
  const wanted =
    paths ||
    [
      'assets/room-icon.png',
      'assets/gallery-sunset.png',
      'assets/gallery-mountains.png',
      'assets/gallery-city.png',
    ];
  const result = {};
  for (const path of wanted) {
    const asset = buildDemoAsset(path);
    if (asset) result[path] = asset;
  }
  return result;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function readImageSize(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: null, height: null });
    image.src = dataUrl;
  });
}

export async function fileToAsset(file, existingAssets = {}) {
  const supported =
    /^image\/(png|jpeg|webp)$/.test(file.type) || /^video\/(mp4|webm)$/.test(file.type);
  if (!supported) {
    throw new Error('Only PNG, JPG, WebP, MP4 and WebM files are supported in version 0.1.');
  }
  const baseName = file.name
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^-+/, '') || `asset-${Date.now()}`;
  let path = `assets/${baseName}`;
  let suffix = 2;
  while (existingAssets[path]) {
    const dot = baseName.lastIndexOf('.');
    const stem = dot > -1 ? baseName.slice(0, dot) : baseName;
    const extension = dot > -1 ? baseName.slice(dot) : '';
    path = `assets/${stem}-${suffix}${extension}`;
    suffix += 1;
  }
  const dataUrl = await readFileAsDataUrl(file);
  let dimensions = { width: null, height: null };
  if (file.type.startsWith('image/')) {
    dimensions = await readImageSize(dataUrl);
  }
  return {
    id: path,
    path,
    name: file.name,
    type: file.type,
    size: file.size,
    width: dimensions.width,
    height: dimensions.height,
    dataUrl,
    source: 'upload',
    hasAlpha: file.type === 'image/png' || file.type === 'image/webp',
    uploadedAt: new Date().toISOString(),
  };
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}
