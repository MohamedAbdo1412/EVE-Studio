import { evaluateExpressionSafe } from '../expressions/evaluator.js';

function initialBindingValue(binding, values) {
  let combined = '';
  for (const segment of binding.segments) {
    if (segment.kind === 'text') combined += segment.value;
    else {
      const result = evaluateExpressionSafe(segment.ast, values);
      if (result.error) return '';
      combined += result.value === null || result.value === undefined ? '' : String(result.value);
    }
  }
  return combined;
}

function visit(node, visitor) {
  if (!node) return;
  visitor(node);
  for (const child of node.children || []) visit(child, visitor);
}

export function buildAssetManifest({ assets, ast, scene, registry, bindings }) {
  const values = Object.fromEntries(registry.map((entry) => [entry.path, entry.initialValue]));
  const usage = new Map();
  const missing = [];
  const addUsage = (assetPath, reference) => {
    if (!assetPath) return;
    if (!usage.has(assetPath)) usage.set(assetPath, []);
    const list = usage.get(assetPath);
    if (!list.some((item) => item.componentId === reference.componentId && item.property === reference.property)) {
      list.push(reference);
    }
  };

  if (ast) {
    visit(ast, (node) => {
      if (!['img', 'vid'].includes(node.tag)) return;
      const src = node.attributes.src;
      if (!src) return;
      if (!src.includes('${')) {
        addUsage(src, {
          componentId: node.id,
          property: 'src',
          dynamic: false,
          kind: node.tag,
        });
        if (!assets[src]) missing.push({ path: src, componentId: node.id, property: 'src' });
        return;
      }
      const binding = bindings.bindings.find(
        (candidate) => candidate.componentId === node.id && candidate.property === 'src',
      );
      const resolved = binding ? initialBindingValue(binding, values) : '';
      addUsage(resolved, {
        componentId: node.id,
        property: 'src',
        dynamic: true,
        expression: binding?.source,
        kind: node.tag,
      });
      if (resolved && !assets[resolved]) {
        missing.push({ path: resolved, componentId: node.id, property: 'src' });
      }
    });
  }

  for (const entry of registry) {
    if (entry.type !== 'image') continue;
    addUsage(entry.initialValue, {
      componentId: `var:${entry.path}`,
      property: 'value',
      dynamic: true,
      kind: 'variable',
    });
    if (entry.initialValue && !assets[entry.initialValue]) {
      missing.push({ path: entry.initialValue, componentId: `var:${entry.path}`, property: 'value' });
    }
  }

  const entries = Object.values(assets).map((asset) => {
    const isImage = String(asset.type || '').startsWith('image/');
    const isVideo = String(asset.type || '').startsWith('video/');
    return {
      id: asset.id || asset.path,
      path: asset.path,
      name: asset.name || asset.path.split('/').pop(),
      type: asset.type || 'application/octet-stream',
      size: asset.size || 0,
      width: asset.width || null,
      height: asset.height || null,
      source: asset.source || 'upload',
      usage: usage.get(asset.path) || [],
      processing: isImage
        ? {
            browserPreview: 'native-image-decoder',
            intendedEmbeddedFormat: asset.hasAlpha ? 'RGBA8888' : 'RGB565',
            intendedSteps: ['decode', 'resize-policy-check', 'future-RGB565-conversion', 'future-atlas-pack'],
            embeddedStatus: 'conversion-not-implemented',
          }
        : isVideo
          ? {
              browserPreview: 'native-video-element',
              intendedEmbeddedFormat: null,
              intendedSteps: [],
              embeddedStatus: 'unsupported-in-0.1',
            }
          : {
              browserPreview: 'unsupported',
              intendedEmbeddedFormat: null,
              intendedSteps: [],
              embeddedStatus: 'unknown-asset-type',
            },
    };
  });

  return {
    entries,
    usage,
    missing,
    summary: {
      total: entries.length,
      images: entries.filter((entry) => entry.type.startsWith('image/')).length,
      videos: entries.filter((entry) => entry.type.startsWith('video/')).length,
      used: entries.filter((entry) => entry.usage.length > 0).length,
      unused: entries.filter((entry) => entry.usage.length === 0).length,
      missing: missing.length,
    },
  };
}
