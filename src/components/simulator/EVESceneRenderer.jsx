import React, { useEffect, useRef, useState } from 'react';
import PageRenderer from './PageRenderer.jsx';

function useStageScale(page, scaleMode) {
  const hostRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') {
      if (host) setSize({ width: host.clientWidth, height: host.clientHeight });
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(host);
    setSize({ width: host.clientWidth, height: host.clientHeight });
    return () => observer.disconnect();
  }, []);

  if (!page) return { hostRef, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  const padding = 24;
  const availableWidth = Math.max(0, size.width - padding * 2);
  const availableHeight = Math.max(0, size.height - padding * 2);
  let scaleX = 1;
  let scaleY = 1;
  if (scaleMode === 'fill') {
    scaleX = availableWidth / page.width || 1;
    scaleY = availableHeight / page.height || 1;
  } else if (scaleMode !== 'none') {
    scaleX = Math.min(availableWidth / page.width || 1, availableHeight / page.height || 1);
    scaleY = scaleX;
  }
  const scaledWidth = page.width * scaleX;
  const scaledHeight = page.height * scaleY;
  const offsetX = Math.max(padding, (size.width - scaledWidth) / 2);
  const offsetY = Math.max(padding, (size.height - scaledHeight) / 2);
  return { hostRef, scaleX, scaleY, offsetX, offsetY };
}

export default function EVESceneRenderer({
  scene,
  activePageId,
  bindingValues,
  assets,
  selectedId,
  onSelect,
  onAction,
  scaleMode = 'fit',
}) {
  const page = scene?.pages?.find((candidate) => candidate.id === activePageId) || scene?.pages?.[0];
  const { hostRef, scaleX, scaleY, offsetX, offsetY } = useStageScale(page, scaleMode);

  return (
    <div className="eve-scene-stage" ref={hostRef}>
      {page ? (
        <div
          className="eve-scene-page-frame"
          style={{
            position: 'absolute',
            left: `${offsetX}px`,
            top: `${offsetY}px`,
            width: `${page.width}px`,
            height: `${page.height}px`,
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: 'top left',
            boxShadow: '0 22px 60px rgba(0,0,0,0.5)',
            outline: '1px solid rgba(108,182,255,0.18)',
          }}
        >
          <PageRenderer
            page={page}
            bindingValues={bindingValues}
            assets={assets}
            selectedId={selectedId}
            onSelect={onSelect}
            onAction={onAction}
          />
        </div>
      ) : (
        <div className="eve-scene-empty">No valid scene to preview.</div>
      )}
    </div>
  );
}
