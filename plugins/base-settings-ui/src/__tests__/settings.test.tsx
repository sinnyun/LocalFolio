// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { PluginManifest } from '@folio/base-contract'
import { MyPluginsSection } from '../MyPluginsSection.js'

afterEach(() => {
  cleanup()
})

function makeManifest(): PluginManifest {
  return {
    version: 2,
    dshPlugins: [
      {
        id: 'base-storage-host',
        name: '基础存储能力',
        loaderId: '@folio/base-storage-host',
        category: 'base',
        slots: [],
        services: ['folioStorage'],
        description: '按插件隔离存储',
        enabled: true,
        dependsOn: [],
      },
      {
        id: 'base-runtime-host',
        name: '基础运行时能力',
        loaderId: '@folio/base-runtime-host',
        category: 'base',
        slots: [],
        services: ['folioRuntime'],
        description: 'RPC 与 SSE 网关',
        enabled: true,
        dependsOn: ['@folio/base-storage-host'],
      },
      {
        id: 'workspace-canvas-ui',
        name: '画板',
        loaderId: '@folio/workspace-canvas-ui',
        category: 'workspace',
        slots: [],
        services: ['folioCanvas'],
        description: 'tldraw 无限画布',
        enabled: true,
        dependsOn: ['@folio/base-shell-ui'],
      },
      {
        id: 'test-overview-ui',
        name: '测试概览 UI',
        loaderId: '@folio/test-overview-ui',
        category: 'test',
        slots: ['workspace.panel'],
        services: [],
        description: '测试用 UI 插件',
        enabled: false,
        dependsOn: [],
      },
    ],
    internalExtensions: [
      {
        id: 'tldraw',
        name: 'tldraw 画板引擎',
        hostPluginId: 'workspace-canvas-ui',
        ecosystem: 'tldraw',
        source: 'official',
        description: '无限画布引擎',
        enabled: true,
      },
    ],
  }
}

async function renderSection(): Promise<ReturnType<typeof render>> {
  const view = render(
    <MyPluginsSection
      loadManifest={async () => makeManifest()}
      resolveSettings={() => ({ describe: () => ({ general: {}, plugins: {} }) })}
    />,
  )
  await waitFor(() => {
    expect(view.container.querySelector('[data-lf-plugins-layer="dsh"]')).not.toBeNull()
  })
  return view
}

describe('@folio/base-settings-ui', () => {
  it('renders summary stats, category groups, internal extensions, and runtime namespaces', async () => {
    const { container } = await renderSection()

    expect(container.querySelector('[data-lf-plugins-stat="total"]')?.textContent).toContain('4')
    expect(container.querySelector('[data-lf-plugins-stat="enabled"]')?.textContent).toContain('3')
    expect(container.querySelector('[data-lf-plugins-stat="extensions"]')?.textContent).toContain(
      '1',
    )

    expect(container.querySelector('[data-lf-plugin-group="base"]')?.textContent).toContain(
      '@folio/base-storage-host',
    )
    expect(container.querySelector('[data-lf-plugin-group="workspace"]')?.textContent).toContain(
      '@folio/workspace-canvas-ui',
    )
    expect(container.querySelector('[data-lf-plugin-group="test"]')?.textContent).toContain(
      '已停用',
    )
    expect(container.querySelector('[data-lf-plugin-card="base-storage-host"]')?.textContent).toContain(
      'ctx.folioStorage',
    )
    expect(container.querySelector('[data-lf-plugins-layer="internal"]')?.textContent).toContain(
      'tldraw 画板引擎',
    )
    expect(container.querySelector('[data-lf-runtime-namespaces]')?.textContent).toContain(
      'general, plugins',
    )
  })

  it('filters categories through the toolbar chips', async () => {
    const { container } = await renderSection()
    const filterButton = (key: string): HTMLElement => {
      const node = container.querySelector<HTMLElement>(`[data-lf-filter="${key}"]`)
      if (!node) throw new Error(`missing filter: ${key}`)
      return node
    }

    fireEvent.click(filterButton('workspace'))

    expect(container.querySelector('[data-lf-plugin-group="workspace"]')).not.toBeNull()
    expect(container.querySelector('[data-lf-plugin-group="base"]')).toBeNull()
    expect(filterButton('workspace').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(filterButton('all'))

    expect(container.querySelector('[data-lf-plugin-group="base"]')).not.toBeNull()
  })

  it('searches across name, loader id, description, services and slots', async () => {
    const { container, getByRole } = await renderSection()
    const search = getByRole('searchbox', { name: '搜索插件' }) as HTMLInputElement

    fireEvent.change(search, { target: { value: 'folioStorage' } })

    expect(container.querySelector('[data-lf-plugin-card="base-storage-host"]')).not.toBeNull()
    expect(container.querySelector('[data-lf-plugin-card="base-runtime-host"]')).toBeNull()
    expect(container.querySelector('[data-lf-plugin-group="workspace"]')).toBeNull()

    fireEvent.change(search, { target: { value: 'workspace.panel' } })

    expect(container.querySelector('[data-lf-plugin-card="test-overview-ui"]')).not.toBeNull()

    fireEvent.change(search, { target: { value: '不存在的插件' } })

    expect(container.textContent).toContain('没有匹配「不存在的插件」的插件')
  })

  it('collapses and expands a category group', async () => {
    const { container } = await renderSection()
    const group = (): Element | null => container.querySelector('[data-lf-plugin-group="base"]')
    const head = (): Element => {
      const node = group()?.querySelector('.lf-mp-group-head')
      if (!node) throw new Error('missing group header')
      return node
    }

    expect(head().getAttribute('aria-expanded')).toBe('true')
    expect(group()?.querySelector('.lf-mp-grid')).not.toBeNull()

    fireEvent.click(head())

    expect(head().getAttribute('aria-expanded')).toBe('false')
    expect(group()?.querySelector('.lf-mp-grid')).toBeNull()

    fireEvent.click(head())

    expect(group()?.querySelector('.lf-mp-grid')).not.toBeNull()
  })
})
