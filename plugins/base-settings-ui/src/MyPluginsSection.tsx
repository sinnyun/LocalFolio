import * as React from 'react'
import type {
  DshPluginCategory,
  DshPluginRecord,
  InternalExtensionSource,
  PluginManifest,
} from '@folio/base-contract'
import { rpcCall } from '@folio/base-contract/rpc'
import {
  FolioIconChevronDown,
  FolioIconSearch,
  FolioTag,
} from '@folio/base-ui-kit/client'
import { MY_PLUGINS_STYLES } from './my-plugins-styles.js'

export interface DshSettingsServiceLike {
  describe?(): unknown
}

export interface MyPluginsSectionProps {
  readonly resolveSettings?: () => DshSettingsServiceLike | undefined
  readonly loadManifest?: () => Promise<PluginManifest>
}

interface CategoryMeta {
  readonly label: string
  readonly prefix: string
  readonly accent: string
  readonly hint: string
}

const CATEGORY_META: Record<DshPluginCategory, CategoryMeta> = {
  base: {
    label: '基础能力',
    prefix: 'base-*',
    accent: '#64748b',
    hint: '工作台通用基础能力：存储、运行时、UI、外壳、布局框架、设置页',
  },
  workspace: {
    label: '工作区',
    prefix: 'workspace-*',
    accent: '#3b82f6',
    hint: '顶部工作区栏里的一项完整功能',
  },
  feature: {
    label: '功能插件',
    prefix: 'feature-*',
    accent: '#8b5cf6',
    hint: '只在一个工作区内部贡献功能',
  },
  test: {
    label: '测试界面',
    prefix: 'test-*',
    accent: '#f59e0b',
    hint: '只为验证界面与集成方式而存在，随 @folio/test-suite 另装',
  },
  bridge: {
    label: '桥接插件',
    prefix: 'bridge-*',
    accent: '#14b8a6',
    hint: '把某项基础能力接进外壳或工具链',
  },
}

const CATEGORY_ORDER: readonly DshPluginCategory[] = [
  'base',
  'workspace',
  'feature',
  'test',
  'bridge',
]

const SOURCE_LABELS: Record<InternalExtensionSource, string> = {
  official: '官方',
  community: '社区',
  custom: '自建',
}

type CategoryFilter = 'all' | DshPluginCategory

const EMPTY_COLLAPSED: ReadonlySet<DshPluginCategory> = new Set<DshPluginCategory>()

function extractRuntimeNamespaces(raw: unknown): readonly string[] {
  if (!raw || typeof raw !== 'object') return []
  if (Array.isArray(raw)) {
    return raw
      .map(item => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>
          const id = rec.id ?? rec.name ?? rec.namespace
          return typeof id === 'string' ? id : null
        }
        return null
      })
      .filter((x): x is string => x !== null)
  }
  return Object.keys(raw as Record<string, unknown>)
}

/** Host/UI suffix is part of the naming convention, so it doubles as a role label. */
function roleLabelOf(id: string): string | null {
  if (id.endsWith('-host')) return '后端'
  if (id.endsWith('-ui')) return '界面'
  return null
}

function matchesQuery(item: DshPluginRecord, query: string): boolean {
  if (!query) return true
  const haystack = [
    item.name,
    item.id,
    item.loaderId,
    item.description,
    ...item.services,
    ...item.slots,
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function MyPluginsSection({
  resolveSettings,
  loadManifest,
}: MyPluginsSectionProps): React.ReactElement {
  const [manifest, setManifest] = React.useState<PluginManifest | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [runtimeNamespaces, setRuntimeNamespaces] = React.useState<readonly string[]>([])
  const [query, setQuery] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState<CategoryFilter>('all')
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<DshPluginCategory>>(EMPTY_COLLAPSED)
  const gridIdPrefix = React.useId()

  React.useEffect(() => {
    let cancelled = false
    const loader = loadManifest ?? (() => rpcCall<PluginManifest>('plugins.manifest.get', {}))
    loader()
      .then(data => {
        if (!cancelled) {
          setManifest(data)
          setError(null)
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })

    try {
      const settingsSvc = resolveSettings?.()
      if (typeof settingsSvc?.describe === 'function') {
        setRuntimeNamespaces(extractRuntimeNamespaces(settingsSvc.describe()))
      }
    } catch {
      // Optional runtime introspection
    }

    return () => {
      cancelled = true
    }
  }, [loadManifest, resolveSettings])

  const normalizedQuery = query.trim().toLowerCase()
  const searching = normalizedQuery.length > 0

  const buckets = React.useMemo(() => {
    const per = new Map<
      DshPluginCategory,
      { total: number; enabled: number; matched: readonly DshPluginRecord[] }
    >()
    for (const category of CATEGORY_ORDER) {
      per.set(category, { total: 0, enabled: 0, matched: [] })
    }
    for (const item of manifest?.dshPlugins ?? []) {
      const bucket = per.get(item.category)
      if (!bucket) continue
      const total = bucket.total + 1
      const enabled = bucket.enabled + (item.enabled ? 1 : 0)
      const matched = matchesQuery(item, normalizedQuery)
        ? [...bucket.matched, item]
        : bucket.matched
      per.set(item.category, { total, enabled, matched })
    }
    return per
  }, [manifest, normalizedQuery])

  const stats = React.useMemo(() => {
    const plugins = manifest?.dshPlugins ?? []
    const enabled = plugins.filter(p => p.enabled).length
    const extensions = manifest?.internalExtensions ?? []
    return {
      total: plugins.length,
      enabled,
      disabled: plugins.length - enabled,
      extensions: extensions.length,
    }
  }, [manifest])

  const visibleCategories = React.useMemo(() => {
    return CATEGORY_ORDER.filter(category => {
      if (categoryFilter !== 'all' && categoryFilter !== category) return false
      const bucket = buckets.get(category)
      if (!bucket) return false
      if (searching) return bucket.matched.length > 0
      return true
    })
  }, [buckets, categoryFilter, searching])

  const allCollapsed = CATEGORY_ORDER.every(category => collapsed.has(category))

  const toggleCategory = React.useCallback((category: DshPluginCategory): void => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }, [])

  const toggleAll = React.useCallback((): void => {
    setCollapsed(prev =>
      CATEGORY_ORDER.every(category => prev.has(category))
        ? new Set<DshPluginCategory>()
        : new Set<DshPluginCategory>(CATEGORY_ORDER),
    )
  }, [])

  const showEmptySearch = searching && visibleCategories.length === 0

  return (
    <div data-lf-my-plugins-section="" className="lf-mp">
      <style data-lf-my-plugins-styles="">{MY_PLUGINS_STYLES}</style>

      <header className="lf-mp-header">
        <div className="lf-mp-title-row">
          <h3 className="lf-mp-title">工作台能力与插件</h3>
          <span className="lf-mp-badge">LocalFolio</span>
        </div>
        <p className="lf-mp-subtitle">
          通过 Cordis Service / Slots 增量扩展 DSH。本页只读，启停仍以 DSH 插件页为准。
        </p>
      </header>

      {error ? (
        <div role="alert" className="lf-mp-error">
          清单加载失败：{error}
        </div>
      ) : null}

      {manifest ? (
        <>
          <div className="lf-mp-stats">
            <div className="lf-mp-stat" data-lf-plugins-stat="total">
              <span className="lf-mp-stat-value">{stats.total}</span>
              <span className="lf-mp-stat-label">工作台插件</span>
              <span className="lf-mp-stat-hint">分 {CATEGORY_ORDER.length} 类登记</span>
            </div>
            <div className="lf-mp-stat" data-lf-plugins-stat="enabled">
              <span className="lf-mp-stat-value">{stats.enabled}</span>
              <span className="lf-mp-stat-label">已启用</span>
              <span className="lf-mp-stat-hint">
                {stats.disabled > 0 ? `${stats.disabled} 个在清单里标为停用` : '全部启用'}
              </span>
            </div>
            <div className="lf-mp-stat" data-lf-plugins-stat="extensions">
              <span className="lf-mp-stat-value">{stats.extensions}</span>
              <span className="lf-mp-stat-label">插件内嵌扩展</span>
              <span className="lf-mp-stat-hint">随宿主插件静态打包</span>
            </div>
          </div>

          <div className="lf-mp-toolbar">
            <label className="lf-mp-search-field">
              <FolioIconSearch size={13} />
              <input
                className="lf-mp-search"
                type="search"
                value={query}
                placeholder="搜索名称、loader id、服务或槽位"
                aria-label="搜索插件"
                onChange={event => setQuery(event.target.value)}
              />
            </label>
            <div className="lf-mp-filters" role="group" aria-label="按分类筛选">
              <button
                type="button"
                className="lf-mp-filter"
                data-lf-filter="all"
                data-active={categoryFilter === 'all'}
                data-empty={false}
                aria-pressed={categoryFilter === 'all'}
                onClick={() => setCategoryFilter('all')}
              >
                全部
                <span className="lf-mp-filter-count">{stats.total}</span>
              </button>
              {CATEGORY_ORDER.map(category => {
                const bucket = buckets.get(category)
                const count = searching ? (bucket?.matched.length ?? 0) : (bucket?.total ?? 0)
                return (
                  <button
                    key={category}
                    type="button"
                    className="lf-mp-filter"
                    data-lf-filter={category}
                    data-active={categoryFilter === category}
                    data-empty={count === 0}
                    aria-pressed={categoryFilter === category}
                    title={CATEGORY_META[category].hint}
                    onClick={() => setCategoryFilter(category)}
                  >
                    <span
                      className="lf-mp-dot"
                      style={{ background: CATEGORY_META[category].accent }}
                      aria-hidden="true"
                    />
                    {CATEGORY_META[category].label}
                    <span className="lf-mp-filter-count">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <section data-lf-plugins-layer="dsh" className="lf-mp-layer">
            <div className="lf-mp-layer-head">
              <h4 className="lf-mp-layer-title">工作台插件</h4>
              <span className="lf-mp-layer-note">经 Cordis Service / Slots 增量扩展 DSH</span>
              <button type="button" className="lf-mp-link" onClick={toggleAll}>
                {allCollapsed ? '全部展开' : '全部收起'}
              </button>
            </div>

            {showEmptySearch ? (
              <div className="lf-mp-empty">没有匹配「{query.trim()}」的插件</div>
            ) : null}

            {visibleCategories.map(category => {
              const meta = CATEGORY_META[category]
              const bucket = buckets.get(category)
              const items = bucket?.matched ?? []
              const total = bucket?.total ?? 0
              const enabled = bucket?.enabled ?? 0
              const open = searching || !collapsed.has(category)
              const gridId = `${gridIdPrefix}-${category}`
              return (
                <section
                  key={category}
                  className="lf-mp-group"
                  data-lf-plugin-group={category}
                  data-open={open}
                >
                  <button
                    type="button"
                    className="lf-mp-group-head"
                    aria-expanded={open}
                    aria-controls={gridId}
                    onClick={() => toggleCategory(category)}
                  >
                    <span
                      className="lf-mp-group-accent"
                      style={{ background: meta.accent }}
                      aria-hidden="true"
                    />
                    <span className="lf-mp-group-label">{meta.label}</span>
                    <code className="lf-mp-group-prefix">{meta.prefix}</code>
                    <span className="lf-mp-group-count">{searching ? items.length : total}</span>
                    <span className="lf-mp-group-health">
                      {enabled === total ? '全部启用' : `已启用 ${enabled}/${total}`}
                    </span>
                    <FolioIconChevronDown size={13} className="lf-mp-group-chevron" />
                  </button>

                  {open ? (
                    items.length === 0 ? (
                      <div className="lf-mp-empty">暂未登记</div>
                    ) : (
                      <ul className="lf-mp-grid" id={gridId}>
                        {items.map(item => {
                          const role = roleLabelOf(item.id)
                          return (
                            <li
                              key={item.id}
                              className="lf-mp-tile"
                              data-lf-plugin-card={item.id}
                              data-enabled={item.enabled}
                            >
                              <div className="lf-mp-tile-head">
                                <span className="lf-mp-tile-name" title={item.name}>
                                  {item.name}
                                </span>
                                <span className="lf-mp-tile-flags">
                                  {role ? (
                                    <span
                                      className="lf-mp-role"
                                      title="按包名后缀识别：-host 为后端，-ui 为界面"
                                    >
                                      {role}
                                    </span>
                                  ) : null}
                                  {item.enabled ? null : (
                                    <FolioTag tone="neutral">已停用</FolioTag>
                                  )}
                                </span>
                              </div>
                              <code className="lf-mp-tile-id" title={item.loaderId}>
                                {item.loaderId}
                              </code>
                              {item.description ? (
                                <p className="lf-mp-tile-desc">{item.description}</p>
                              ) : null}
                              <div className="lf-mp-tile-meta">
                                {item.services.map(service => (
                                  <span
                                    key={`service-${service}`}
                                    className="lf-mp-chip"
                                    data-kind="service"
                                  >
                                    ctx.{service}
                                  </span>
                                ))}
                                {item.slots.map(slot => (
                                  <span key={`slot-${slot}`} className="lf-mp-chip" data-kind="slot">
                                    ↳ {slot}
                                  </span>
                                ))}
                                {item.dependsOn.length > 0 ? (
                                  <span className="lf-mp-chip" data-kind="dep">
                                    {item.dependsOn.length} 依赖
                                  </span>
                                ) : null}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )
                  ) : null}
                </section>
              )
            })}
          </section>

          <section data-lf-plugins-layer="internal" className="lf-mp-group">
            <div className="lf-mp-group-head" data-static="true">
              <span
                className="lf-mp-group-accent"
                style={{ background: '#64748b' }}
                aria-hidden="true"
              />
              <span className="lf-mp-group-label">插件内嵌扩展</span>
              <code className="lf-mp-group-prefix">静态打包</code>
              <span className="lf-mp-group-count">{manifest.internalExtensions.length}</span>
              <span className="lf-mp-group-health">不可独立启停</span>
            </div>

            {manifest.internalExtensions.length === 0 ? (
              <div className="lf-mp-empty">
                暂未登记内部扩展（宿主插件内嵌第三方引擎时登记在此，例如画板工作区的 tldraw）
              </div>
            ) : (
              <ul className="lf-mp-ext-list">
                {manifest.internalExtensions.map(ext => (
                  <li key={ext.id} className="lf-mp-ext" data-lf-internal-extension={ext.id}>
                    <div className="lf-mp-ext-head">
                      <span className="lf-mp-ext-name">{ext.name}</span>
                      <span className="lf-mp-chip">{ext.ecosystem}</span>
                      <span className="lf-mp-chip">{SOURCE_LABELS[ext.source]}</span>
                      <span className="lf-mp-chip" data-kind="service">
                        {ext.hostPluginId}
                      </span>
                      {ext.enabled ? null : <FolioTag tone="neutral">已停用</FolioTag>}
                    </div>
                    {ext.description ? <p className="lf-mp-ext-desc">{ext.description}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {runtimeNamespaces.length > 0 ? (
            <div data-lf-runtime-namespaces="" className="lf-mp-ns">
              <span>DSH 运行时配置命名空间（{runtimeNamespaces.length}）：</span>
              <span className="lf-mp-ns-code">{runtimeNamespaces.join(', ')}</span>
            </div>
          ) : null}
        </>
      ) : !error ? (
        <div className="lf-mp-loading">正在加载插件清单...</div>
      ) : null}
    </div>
  )
}
