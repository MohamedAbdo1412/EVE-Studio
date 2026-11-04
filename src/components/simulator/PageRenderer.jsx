import React from 'react';
import NodeRenderer from './NodeRenderer.jsx';
import { SceneRuntimeContext } from './sceneRuntime.js';

export default function PageRenderer({
  page,
  bindingValues,
  assets,
  selectedId,
  onSelect,
  onAction,
}) {
  if (!page) return null;
  return (
    <SceneRuntimeContext.Provider
      value={{ bindingValues, assets, selectedId, onSelect, onAction }}
    >
      <div
        className="eve-page-surface"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: `${page.width}px`,
          height: `${page.height}px`,
          background: page.background || '#101820',
          overflow: 'hidden',
        }}
        onPointerDown={() => onSelect?.(null)}
      >
        {(page.components || []).map((component, index) => (
          <NodeRenderer key={`${component.id}-${index}`} node={component} />
        ))}
      </div>
    </SceneRuntimeContext.Provider>
  );
}
