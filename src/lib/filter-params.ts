export type FilterQuery = Record<string, string | undefined>;

export function removeFilterParamHref(pathname: string, params: FilterQuery, removedKey: string) {
  return removeFilterParamsHref(pathname, params, [removedKey]);
}

export function removeFilterParamsHref(pathname: string, params: FilterQuery, removedKeys: string[]) {
  const removed = new Set(removedKeys);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!removed.has(key) && key !== "page" && value) query.set(key, value);
  }
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function clearFiltersHref(pathname: string, params: FilterQuery, preserve: string[] = []) {
  const query = new URLSearchParams();
  for (const key of preserve) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}
