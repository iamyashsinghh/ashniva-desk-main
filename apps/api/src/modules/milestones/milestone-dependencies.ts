/** Depth-first cycle check on "milestone depends on" edges. Pure, so it is unit-tested. */
export function hasCycle(edges: Array<{ milestoneId: string; dependsOnId: string }>): boolean {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    graph.set(edge.milestoneId, [...(graph.get(edge.milestoneId) ?? []), edge.dependsOnId]);
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (node: string): boolean => {
    const current = state.get(node);
    if (current === 'visiting') {
      return true;
    }
    if (current === 'done') {
      return false;
    }
    state.set(node, 'visiting');
    for (const next of graph.get(node) ?? []) {
      if (visit(next)) {
        return true;
      }
    }
    state.set(node, 'done');
    return false;
  };
  return [...graph.keys()].some((node) => visit(node));
}
