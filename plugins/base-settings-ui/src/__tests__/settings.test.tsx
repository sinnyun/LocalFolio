// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import type { PluginManifest } from '@folio/base-contract'
import { MyPluginsSection } from '../MyPluginsSection.js'

afterEach(() => {
  cleanup()
})

describe('@folio/base-settings-ui', () => {
  it('renders base/workspace groups, internal extensions, and runtime namespaces', async () => {
    const manifest: PluginManifest = {
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
          id: 'workspace-canvas-ui',
          name: '画板工作区',
          loaderId: '@folio/workspace-canvas-ui',
          category: 'workspace',
          slots: [],
          services: [],
          description: 'LeaferJS 画板视图',
          enabled: true,
          dependsOn: ['@folio/base-shell-ui'],
        },
      ],
      internalExtensions: [
        {
          id: 'leafer-snap',
          name: 'leafer-x-snap',
          hostPluginId: 'workspace-canvas-ui',
          ecosystem: 'leaferjs',
          source: 'community',
          description: '画布吸附辅助线',
          enabled: true,
        },
      ],
    }

    const { container } = render(
      <MyPluginsSection
        loadManifest={async () => manifest}
        resolveSettings={() => ({ describe: () => ({ general: {}, plugins: {} }) })}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('[data-lf-plugins-layer="dsh"]')).not.toBeNull()
    })

    expect(container.querySelector('[data-lf-plugin-group="base"]')?.textContent).toContain(
      '@folio/base-storage-host',
    )
    expect(container.querySelector('[data-lf-plugin-group="workspace"]')?.textContent).toContain(
      '@folio/workspace-canvas-ui',
    )
    expect(container.querySelector('[data-lf-plugins-layer="internal"]')?.textContent).toContain(
      'leafer-x-snap',
    )
    expect(container.querySelector('[data-lf-runtime-namespaces]')?.textContent).toContain(
      'general, plugins',
    )
  })
})
