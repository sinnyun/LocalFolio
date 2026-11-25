// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import type { PluginManifest } from '@folio/lib-shared-contract'
import { MyPluginsSection } from '../MyPluginsSection.js'

afterEach(() => {
  cleanup()
})

describe('@folio/shell-settings-ui', () => {
  it('renders three-segment DSH plugin groups, internal extensions, and runtime namespaces', async () => {
    const manifest: PluginManifest = {
      version: 1,
      dshPlugins: [
        {
          id: 'core-host-storage',
          name: '存储底座',
          loaderId: '@folio/core-host-storage',
          category: 'core',
          slots: [],
          services: ['folioStorage'],
          description: '按插件隔离存储',
          enabled: true,
          dependsOn: [],
        },
        {
          id: 'app-canvas-ui',
          name: '画板界面',
          loaderId: '@folio/app-canvas-ui',
          category: 'app',
          slots: ['folio.shell.workspace'],
          services: [],
          description: 'LeaferJS 画板视图',
          enabled: true,
          dependsOn: ['shell-overlay-ui'],
        },
      ],
      internalExtensions: [
        {
          id: 'leafer-snap',
          name: 'leafer-x-snap',
          hostPluginId: 'app-canvas-ui',
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

    expect(container.querySelector('[data-lf-plugin-group="core"]')?.textContent).toContain(
      '@folio/core-host-storage',
    )
    expect(container.querySelector('[data-lf-plugin-group="app"]')?.textContent).toContain(
      '@folio/app-canvas-ui',
    )
    expect(container.querySelector('[data-lf-plugins-layer="internal"]')?.textContent).toContain(
      'leafer-x-snap',
    )
    expect(container.querySelector('[data-lf-runtime-namespaces]')?.textContent).toContain(
      'general, plugins',
    )
  })
})
