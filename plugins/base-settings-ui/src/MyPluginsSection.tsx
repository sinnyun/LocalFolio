import * as React from 'react'
import type { DshPluginCategory, PluginManifest } from '@folio/base-contract'
import { rpcCall } from '@folio/base-contract/rpc'
import { FolioTag } from '@folio/base-ui-kit/client'

export interface DshSettingsServiceLike {
  describe?(): unknown
}

export interface MyPluginsSectionProps {
  readonly resolveSettings?: () => DshSettingsServiceLike | undefined
  readonly loadManifest?: () => Promise<PluginManifest>
}

const CATEGORY_LABELS: Record<DshPluginCategory, string> = {
  base: '工作台通用基础能力（base-*）',
  workspace: '工作区（workspace-*）',
  feature: '功能插件（feature-*）',
  test: '测试界面（test-*）',
  bridge: '桥接插件（bridge-*）',
}

const CATEGORY_ORDER: readonly DshPluginCategory[] = [
  'base',
  'workspace',
  'feature',
  'test',
  'bridge',
]

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

export function MyPluginsSection({
  resolveSettings,
  loadManifest,
}: MyPluginsSectionProps): React.ReactElement {
  const [manifest, setManifest] = React.useState<PluginManifest | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [runtimeNamespaces, setRuntimeNamespaces] = React.useState<readonly string[]>([])

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

  return (
    <div
      data-lf-my-plugins-section=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '12px 4px',
        color: 'var(--dsw-alias-label-primary, #0f1115)',
        fontSize: 13,
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>工作台能力与插件（LocalFolio）</h3>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 12,
            color: 'var(--dsw-alias-label-tertiary, #81858c)',
          }}
        >
          基于 DSH 增量扩展：按「基础能力 / 工作区 / 功能插件 / 测试界面 / 桥接」列举工作台插件，并与插件内嵌的静态扩展分栏治理。
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--dsw-alias-state-error-primary, #ec1313)',
            fontSize: 12,
          }}
        >
          清单加载失败：{error}
        </div>
      ) : null}

      {manifest ? (
        <>
          <section
            data-lf-plugins-layer="dsh"
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}>
              一、工作台插件（通过 Cordis Service / Slots 增量扩展 DSH）
            </div>
            {CATEGORY_ORDER.map(cat => {
              const items = manifest.dshPlugins.filter(p => p.category === cat)
              return (
                <div
                  key={cat}
                  data-lf-plugin-group={cat}
                  style={{
                    border: '1px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.12))',
                    borderRadius: 8,
                    padding: 10,
                    background: 'var(--dsw-alias-bg-layer-1, transparent)',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    {CATEGORY_LABELS[cat]}（{items.length}）
                  </div>
                  {items.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>暂未登记</div>
                  ) : (
                    <ul
                      style={{
                        listStyle: 'none',
                        margin: 0,
                        padding: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {items.map(item => (
                        <li
                          key={item.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 8,
                            fontSize: 12,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 500 }}>
                              {item.name}{' '}
                              <code style={{ fontSize: 11, opacity: 0.7 }}>{item.loaderId}</code>
                            </div>
                            {item.description ? (
                              <div style={{ opacity: 0.75, marginTop: 2 }}>{item.description}</div>
                            ) : null}
                            {item.services.length > 0 ? (
                              <div style={{ opacity: 0.65, marginTop: 2 }}>
                                提供服务：{item.services.join(', ')}
                              </div>
                            ) : null}
                            {item.slots.length > 0 ? (
                              <div style={{ opacity: 0.65, marginTop: 2 }}>
                                挂接槽位：{item.slots.join(', ')}
                              </div>
                            ) : null}
                          </div>
                          <FolioTag tone={item.enabled ? 'info' : 'neutral'}>
                            {item.enabled ? '已启用' : '已停用'}
                          </FolioTag>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </section>

          <section
            data-lf-plugins-layer="internal"
            style={{
              border: '1px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.12))',
              borderRadius: 8,
              padding: 10,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              二、插件内嵌扩展（静态打包，如 tldraw 画板引擎）
            </div>
            {manifest.internalExtensions.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                暂未登记内部扩展（宿主插件内嵌第三方引擎时登记在此，例如画板工作区的 tldraw）
              </div>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {manifest.internalExtensions.map(ext => (
                  <li key={ext.id} style={{ fontSize: 12 }}>
                    <span style={{ fontWeight: 500 }}>{ext.name}</span>{' '}
                    <FolioTag tone="neutral">
                      {ext.ecosystem} · {ext.source} · {ext.hostPluginId}
                    </FolioTag>
                    {ext.description ? <div style={{ opacity: 0.75 }}>{ext.description}</div> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {runtimeNamespaces.length > 0 ? (
            <div data-lf-runtime-namespaces="" style={{ fontSize: 11, opacity: 0.7 }}>
              DSH 运行时配置命名空间（{runtimeNamespaces.length}）：{runtimeNamespaces.join(', ')}
            </div>
          ) : null}
        </>
      ) : !error ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>正在加载插件清单...</div>
      ) : null}
    </div>
  )
}
