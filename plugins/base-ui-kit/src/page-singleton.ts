/**
 * Per-page identity for state that has to outlive one evaluated copy of this
 * plugin.
 *
 * `@folio/base-ui-kit` is the shared UI plugin: every other UI plugin resolves
 * it through `dsh.client.external`, so the page module system normally hands
 * all of them the same exports. Live code replacement breaks that promise one
 * row at a time — the page loader evicts only the rebuilt package's module
 * record and re-materializes it, while consumers keep the exports they captured
 * when their own factory ran. Module-scope state therefore forks, and the two
 * sides stop seeing each other: a React context created by the replacement no
 * longer matches the provider instance a consumer installed, and a portal
 * container registered by one copy is invisible to the other.
 *
 * A `Symbol.for` key lives on the page's global symbol registry, which module
 * replacement does not touch, so the first copy to ask creates the value and
 * every later copy — including one produced by a reload — reuses it.
 *
 * Use this only for identity-critical singletons that cross the plugin
 * boundary. Plain presentational state stays in module scope.
 */
export function pageSingleton<T>(key: string, create: () => T): T {
  const registry = globalThis as unknown as Record<symbol, unknown>
  const symbol = Symbol.for(key)
  const existing = registry[symbol]
  if (existing !== undefined) return existing as T
  const created = create()
  registry[symbol] = created
  return created
}
