import React from 'react';
import { useSceneRuntime, resolveProperty, nodeFrameStyle, isVisible, clampOpacity, toFiniteNumber } from './sceneRuntime.js';

function childNodes(node) {
  return (
    <>
      {(node.children || []).map((child, index) => (
        <NodeRenderer key={`${child.id}-${index}`} node={child} />
      ))}
    </>
  );
}

export function GroupRenderer({ node }) {
  const { bindingValues, selectedId, onSelect } = useSceneRuntime();
  const selected = selectedId === node.id;
  if (!isVisible(node, bindingValues)) return null;
  const background = resolveProperty(node.props, 'background', bindingValues);
  const opacity = clampOpacity(resolveProperty(node.props, 'opacity', bindingValues));
  const rotation = toFiniteNumber(resolveProperty(node.props, 'rotation', bindingValues), 0);
  const clip = resolveProperty(node.props, 'clip', bindingValues) === true;
  return (
    <div
      className={`eve-scene-node eve-group${selected ? ' is-selected' : ''}`}
      data-node-id={node.id}
      data-tag={node.tag}
      style={{
        ...nodeFrameStyle(node, bindingValues),
        background: background || undefined,
        opacity,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        overflow: clip ? 'hidden' : undefined,
        border: background ? undefined : '1px dashed rgba(108,182,255,0.08)',
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect?.(node);
      }}
    >
      {childNodes(node)}
    </div>
  );
}

export function TextRenderer({ node }) {
  const { bindingValues, selectedId, onSelect } = useSceneRuntime();
  const selected = selectedId === node.id;
  if (!isVisible(node, bindingValues)) return null;
  const text = resolveProperty(node.props, 'text', bindingValues);
  const color = resolveProperty(node.props, 'color', bindingValues);
  const fontSize = toFiniteNumber(resolveProperty(node.props, 'fontSize', bindingValues), 16);
  const opacity = clampOpacity(resolveProperty(node.props, 'opacity', bindingValues));
  const weight = resolveProperty(node.props, 'weight', bindingValues) === 'bold' ? 700 : 400;
  const align = resolveProperty(node.props, 'align', bindingValues) || 'left';
  const verticalAlign = resolveProperty(node.props, 'verticalAlign', bindingValues) || 'top';
  const wrap = resolveProperty(node.props, 'wrap', bindingValues) !== false;
  const maxLines = resolveProperty(node.props, 'maxLines', bindingValues);
  const justify = verticalAlign === 'middle' ? 'center' : verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';
  return (
    <div
      className={`eve-scene-node eve-text${selected ? ' is-selected' : ''}`}
      data-node-id={node.id}
      data-tag={node.tag}
      style={{
        ...nodeFrameStyle(node, bindingValues),
        opacity,
        display: 'flex',
        alignItems: justify,
        justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        color: color || '#FFFFFF',
        fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
        fontSize: `${fontSize}px`,
        fontWeight: weight,
        textAlign: align,
        lineHeight: 1.18,
        overflow: 'hidden',
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect?.(node);
      }}
    >
      <div
        style={{
          width: '100%',
          whiteSpace: wrap ? 'pre-wrap' : 'nowrap',
          overflow: 'hidden',
          textOverflow: wrap ? undefined : 'ellipsis',
          overflowWrap: wrap ? 'break-word' : undefined,
          display: maxLines ? '-webkit-box' : 'block',
          WebkitLineClamp: maxLines || undefined,
          WebkitBoxOrient: maxLines ? 'vertical' : undefined,
        }}
      >
        {text === null || text === undefined ? '' : String(text)}
      </div>
    </div>
  );
}

export function ImageRenderer({ node }) {
  const { bindingValues, assets, selectedId, onSelect } = useSceneRuntime();
  const selected = selectedId === node.id;
  if (!isVisible(node, bindingValues)) return null;
  const srcPath = resolveProperty(node.props, 'src', bindingValues);
  const asset = assets?.[srcPath];
  const fit = resolveProperty(node.props, 'fit', bindingValues) || 'contain';
  const radius = resolveProperty(node.props, 'radius', bindingValues);
  const opacity = clampOpacity(resolveProperty(node.props, 'opacity', bindingValues));
  const alt = resolveProperty(node.props, 'alt', bindingValues);
  return (
    <div
      className={`eve-scene-node eve-image${selected ? ' is-selected' : ''}`}
      data-node-id={node.id}
      data-tag={node.tag}
      style={{
        ...nodeFrameStyle(node, bindingValues),
        opacity,
        borderRadius: radius ? (typeof radius === 'number' ? `${radius}px` : String(radius)) : undefined,
        overflow: 'hidden',
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect?.(node);
      }}
    >
      {asset?.dataUrl ? (
        <img
          src={asset.dataUrl}
          alt={alt || node.id}
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }}
        />
      ) : (
        <div className="eve-missing-asset">
          <span>Missing asset</span>
          <code>{String(srcPath || 'no src')}</code>
        </div>
      )}
    </div>
  );
}

export function VideoRenderer({ node }) {
  const { bindingValues, assets, selectedId, onSelect } = useSceneRuntime();
  const selected = selectedId === node.id;
  if (!isVisible(node, bindingValues)) return null;
  const srcPath = resolveProperty(node.props, 'src', bindingValues);
  const asset = assets?.[srcPath];
  const fit = resolveProperty(node.props, 'fit', bindingValues) || 'contain';
  const autoplay = resolveProperty(node.props, 'autoplay', bindingValues) === true;
  const loop = resolveProperty(node.props, 'loop', bindingValues) === true;
  const muted = resolveProperty(node.props, 'muted', bindingValues) !== false;
  const opacity = clampOpacity(resolveProperty(node.props, 'opacity', bindingValues));
  return (
    <div
      className={`eve-scene-node eve-video${selected ? ' is-selected' : ''}`}
      data-node-id={node.id}
      data-tag={node.tag}
      style={{ ...nodeFrameStyle(node, bindingValues), opacity, overflow: 'hidden' }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect?.(node);
      }}
    >
      {asset?.dataUrl ? (
        <video
          src={asset.dataUrl}
          style={{ width: '100%', height: '100%', objectFit: fit }}
          autoPlay={autoplay}
          loop={loop}
          muted={muted}
          playsInline
        />
      ) : (
        <div className="eve-missing-asset">
          <span>Missing video</span>
          <code>{String(srcPath || 'no src')}</code>
        </div>
      )}
      <span className="eve-preview-badge">PREVIEW ONLY</span>
    </div>
  );
}

export function ButtonRenderer({ node }) {
  const { bindingValues, selectedId, onSelect, onAction } = useSceneRuntime();
  const selected = selectedId === node.id;
  if (!isVisible(node, bindingValues)) return null;
  const background = resolveProperty(node.props, 'background', bindingValues);
  const color = resolveProperty(node.props, 'color', bindingValues);
  const borderColor = resolveProperty(node.props, 'borderColor', bindingValues);
  const borderWidth = resolveProperty(node.props, 'borderWidth', bindingValues);
  const radius = resolveProperty(node.props, 'radius', bindingValues);
  const fontSize = toFiniteNumber(resolveProperty(node.props, 'fontSize', bindingValues), 16);
  const disabled = resolveProperty(node.props, 'disabled', bindingValues) === true;
  const opacity = clampOpacity(resolveProperty(node.props, 'opacity', bindingValues));
  const toPx = (value) =>
    value === null || value === undefined || value === ''
      ? undefined
      : typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value))
        ? `${value}px`
        : String(value);
  return (
    <button
      type="button"
      className={`eve-scene-node eve-button${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
      data-node-id={node.id}
      data-tag={node.tag}
      disabled={disabled}
      aria-label={node.id}
      style={{
        ...nodeFrameStyle(node, bindingValues),
        background: background || '#2455AA',
        color: color || '#FFFFFF',
        borderColor: borderColor || 'transparent',
        borderWidth: toPx(borderWidth) || '0px',
        borderStyle: 'solid',
        borderRadius: toPx(radius) || '8px',
        fontSize: `${fontSize}px`,
        opacity,
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        overflow: 'hidden',
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(node);
        if (!disabled) onAction?.(node);
      }}
    >
      {childNodes(node)}
    </button>
  );
}

export function ShapeRenderer({ node }) {
  const { bindingValues, selectedId, onSelect } = useSceneRuntime();
  const selected = selectedId === node.id;
  if (!isVisible(node, bindingValues)) return null;
  const type = resolveProperty(node.props, 'type', bindingValues) || 'rect';
  const fill = resolveProperty(node.props, 'fill', bindingValues);
  const stroke = resolveProperty(node.props, 'stroke', bindingValues);
  const strokeWidth = resolveProperty(node.props, 'strokeWidth', bindingValues);
  const radius = resolveProperty(node.props, 'radius', bindingValues);
  const opacity = clampOpacity(resolveProperty(node.props, 'opacity', bindingValues));
  const toPx = (value) =>
    value === null || value === undefined || value === ''
      ? undefined
      : typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value))
        ? `${value}px`
        : String(value);
  const frame = nodeFrameStyle(node, bindingValues);
  if (type === 'line') {
    return (
      <div
        className={`eve-scene-node eve-shape${selected ? ' is-selected' : ''}`}
        data-node-id={node.id}
        data-tag={node.tag}
        style={{ ...frame, opacity, display: 'flex', alignItems: 'center' }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect?.(node);
        }}
      >
        <div
          style={{
            width: '100%',
            height: toPx(strokeWidth) || '1px',
            background: stroke && stroke !== 'transparent' ? stroke : fill || '#3A73D8',
            borderRadius: '999px',
          }}
        />
      </div>
    );
  }
  return (
    <div
      className={`eve-scene-node eve-shape${selected ? ' is-selected' : ''}`}
      data-node-id={node.id}
      data-tag={node.tag}
      style={{
        ...frame,
        opacity,
        background: fill === 'transparent' ? 'transparent' : fill || '#3A73D8',
        border:
          stroke && stroke !== 'transparent'
            ? `${toPx(strokeWidth) || '1px'} solid ${stroke}`
            : undefined,
        borderRadius: type === 'circle' ? '50%' : toPx(radius) || undefined,
        boxSizing: 'border-box',
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect?.(node);
      }}
    />
  );
}

export default function NodeRenderer({ node }) {
  if (!node) return null;
  switch (node.tag) {
    case 'group':
      return <GroupRenderer node={node} />;
    case 'text':
      return <TextRenderer node={node} />;
    case 'img':
      return <ImageRenderer node={node} />;
    case 'vid':
      return <VideoRenderer node={node} />;
    case 'button':
      return <ButtonRenderer node={node} />;
    case 'shape':
      return <ShapeRenderer node={node} />;
    default:
      return null;
  }
}
