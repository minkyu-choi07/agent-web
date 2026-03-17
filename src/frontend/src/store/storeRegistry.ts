/**
 * Store registry — breaks circular imports between stores.
 * Each store registers itself on creation. Other modules
 * access stores through this registry instead of direct imports.
 */

type StoreRef = {
  getState: () => Record<string, unknown>
  setState: (partial: Record<string, unknown>) => void
}

const registry: Record<string, StoreRef> = {}

export function registerStore(
  name: string,
  // eslint-disable-next-line
  store: any,
) {
  registry[name] = store as StoreRef
}

export function getStore(name: string): StoreRef {
  const s = registry[name]
  if (!s)
    throw new Error(`Store "${name}" not registered`)
  return s
}
