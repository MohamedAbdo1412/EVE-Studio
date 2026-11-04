/**
 * Extract the runtime dependency graph from validated component metadata. The
 * parser and semantic analyser run once; variable updates only re-evaluate this
 * table and never touch the source parser.
 */
export function buildBindings(ast, pages = []) {
  const bindings = [];
  const byId = new Map();
  const dependencyIndex = new Map();
  const componentIndex = new Map();

  const visit = (node) => {
    if (!node) return;
    if (node._bindings?.length) {
      for (const binding of node._bindings) {
        if (byId.has(binding.id)) continue;
        bindings.push(binding);
        byId.set(binding.id, binding);
        for (const dependency of binding.dependencies) {
          if (!dependencyIndex.has(dependency)) dependencyIndex.set(dependency, []);
          dependencyIndex.get(dependency).push(binding.id);
        }
        if (!componentIndex.has(binding.componentId)) componentIndex.set(binding.componentId, []);
        componentIndex.get(binding.componentId).push(binding.id);
      }
    }
    for (const child of node.children || []) {
      if (child.type === 'TextFragment' || child.type === 'Interpolation') continue;
      visit(child);
    }
  };

  if (ast) {
    for (const child of ast.children || []) {
      if (child.tag === 'page') {
        for (const pageChild of child.children || []) {
          if (pageChild.type === 'TextFragment' || pageChild.type === 'Interpolation') continue;
          visit(pageChild);
        }
      }
    }
  }

  return {
    bindings,
    byId,
    dependencyIndex,
    componentIndex,
    serializable: bindings.map((binding) => ({
      id: binding.id,
      componentId: binding.componentId,
      property: binding.property,
      source: binding.source,
      expectedType: binding.expectedType,
      actualType: binding.actualType,
      dependencies: [...binding.dependencies],
      expression: binding.expressionAst || null,
      segments: binding.segments.map((segment) => ({
        kind: segment.kind,
        value: segment.kind === 'text' ? segment.value : undefined,
        expression: segment.kind === 'expression' ? segment.source : undefined,
      })),
    })),
  };
}
