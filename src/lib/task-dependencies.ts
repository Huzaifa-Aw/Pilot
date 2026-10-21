export function wouldCreateTaskDependencyCycle(
  taskId: string,
  dependencyId: string,
  dependencies: Array<{ id: string; dependencyId: string | null }>,
) {
  const next = new Map(dependencies.map(({ id, dependencyId }) => [id, dependencyId]));
  const visited = new Set<string>();
  let current: string | null | undefined = dependencyId;
  while (current) {
    if (current === taskId || visited.has(current)) return true;
    visited.add(current);
    current = next.get(current);
  }
  return false;
}
