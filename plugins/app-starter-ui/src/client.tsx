import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {
  FloatingPanelContribution,
  FloatingPanelRenderProps,
  WorkspaceUiContribution,
  WorkspaceViewProps,
} from '@folio/lib-shared-contract'
import { useActionMutation, useActionQuery } from '@folio/lib-shared-contract/rpc'
import {
  FolioButton,
  FolioIconData,
  FolioIconExternal,
  FolioIconRefresh,
  FolioIconSparkle,
  FolioTag,
  toast,
} from '@folio/core-ui-kit/client'

const INSPECTOR_PANEL_ID = 'starter.inspector'

interface SystemInfoResult {
  readonly rootDir: string
  readonly pluginsDir: string
  readonly fsProvider: 'dsh-ctx-fs' | 'local-node-fs'
  readonly registeredStoragePlugins: readonly string[]
  readonly actionIds: readonly string[]
  readonly sseSubscribers: number
}

interface StarterStatusResult {
  readonly pluginId: string
  readonly pluginDataDir: string
  readonly pluginCacheDir: string
  readonly pingCount: number
  readonly lastPingAt: number | null
}

const cardStyle: React.CSSProperties = {
  borderRadius: 'var(--dsw-radius-md, 10px)',
  border: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))',
  background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
  padding: 16,
  fontSize: 12,
}

const dlStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '140px 1fr',
  rowGap: 6,
  margin: 0,
}

const dtStyle: React.CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary, #81858c)',
}

const ddStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--ds-font-family-code, monospace)',
  wordBreak: 'break-all',
  color: 'var(--dsw-alias-label-primary, #0f1115)',
}

function StarterHeader({ workspaceId }: WorkspaceViewProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 36,
        width: '100%',
        padding: '0 12px',
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 600 }}>独立插件总览（{workspaceId}）</span>
      <FolioTag tone="neutral">@folio/app-starter-ui · DSH 原生渲染</FolioTag>
    </div>
  )
}

function StarterLeftPanel({
  workspaces,
  navigateTo,
  openFloatingPanel,
}: WorkspaceViewProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, fontSize: 12 }}>
      <div
        style={{
          fontWeight: 600,
          color: 'var(--dsw-alias-label-tertiary, #81858c)',
        }}
      >
        动态接入的工作区插件
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {workspaces.map(ws => (
          <li key={ws.id}>
            <button
              type="button"
              onClick={() => navigateTo(ws.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                borderRadius: 'var(--dsw-radius-xs, 6px)',
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 500 }}>{ws.title}</div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--ds-font-family-code, monospace)',
                  color: 'var(--dsw-alias-label-tertiary, #81858c)',
                }}
              >
                {ws.pluginId ?? ws.id}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div
        style={{
          borderTop: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.1))',
          paddingTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            color: 'var(--dsw-alias-label-tertiary, #81858c)',
          }}
        >
          自由悬浮面板示例
        </div>
        <FolioButton
          variant="outline"
          size="sm"
          data-lf-open-floating="starter.inspector"
          icon={<FolioIconExternal size={13} />}
          onClick={() => openFloatingPanel(INSPECTOR_PANEL_ID)}
        >
          打开可缩放悬浮面板
        </FolioButton>
      </div>
    </div>
  )
}

function StarterMainView({ openFloatingPanel }: WorkspaceViewProps): React.ReactElement {
  const sys = useActionQuery<SystemInfoResult>('system.info', {})
  const status = useActionQuery<StarterStatusResult>('starter.status', {})
  const ping = useActionMutation<StarterStatusResult, { echo?: string }>('starter.ping', {
    onSuccess: data => {
      void status.refetch()
      toast({
        title: '私有存储写入成功',
        description: `state.json 已写入第 ${data.pingCount} 次`,
        tone: 'success',
      })
    },
  })

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        height: '100%',
        overflow: 'auto',
        padding: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            LocalFolio · DSH 增量插件底座已就绪
          </h1>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12,
              color: 'var(--dsw-alias-label-tertiary, #81858c)',
            }}
          >
            无 Shadow DOM 隔离墙，直接复用 DSH 原生组件与主题；支持全屏工作台与可自由拖拽、缩放、最大化的悬浮面板。
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolioButton
            variant="primary"
            size="sm"
            icon={<FolioIconExternal size={13} />}
            onClick={() => openFloatingPanel(INSPECTOR_PANEL_ID)}
          >
            打开悬浮面板
          </FolioButton>
          <FolioButton
            variant="outline"
            size="sm"
            icon={<FolioIconSparkle size={13} />}
            onClick={() => ping.mutate({ echo: 'hello-dsh-native' })}
          >
            测试私有存储写入
          </FolioButton>
          <FolioButton
            variant="outline"
            size="sm"
            icon={<FolioIconRefresh size={13} />}
            onClick={() => {
              void sys.refetch()
              void status.refetch()
            }}
          >
            刷新
          </FolioButton>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ marginBottom: 10, fontWeight: 600 }}>
          底座运行时（@folio/core-host-storage + @folio/core-host-runtime）
        </div>
        {sys.isLoading ? (
          <div style={{ color: 'var(--dsw-alias-label-tertiary, #81858c)' }}>正在连接 Host...</div>
        ) : sys.error ? (
          <div style={{ color: 'var(--dsw-alias-state-error-primary, #ec1313)' }}>
            Host 暂不可达：{sys.error.message}
          </div>
        ) : sys.data ? (
          <dl style={dlStyle}>
            <dt style={dtStyle}>FS Seam 提供方</dt>
            <dd style={ddStyle}>{sys.data.fsProvider}</dd>
            <dt style={dtStyle}>LocalFolio 根目录</dt>
            <dd style={ddStyle}>{sys.data.rootDir}</dd>
            <dt style={dtStyle}>已分配存储的插件</dt>
            <dd style={ddStyle}>{sys.data.registeredStoragePlugins.join(', ')}</dd>
            <dt style={dtStyle}>已注册 Host 动作</dt>
            <dd style={ddStyle}>{sys.data.actionIds.join(', ')}</dd>
          </dl>
        ) : null}
      </div>

      <div style={cardStyle}>
        <div style={{ marginBottom: 10, fontWeight: 600 }}>
          插件独立存储验证（@folio/app-starter-host）
        </div>
        {status.isLoading ? (
          <div style={{ color: 'var(--dsw-alias-label-tertiary, #81858c)' }}>
            读取插件存储状态中...
          </div>
        ) : status.error ? (
          <div style={{ color: 'var(--dsw-alias-state-error-primary, #ec1313)' }}>
            读取失败：{status.error.message}
          </div>
        ) : status.data ? (
          <dl style={dlStyle}>
            <dt style={dtStyle}>插件专属数据目录</dt>
            <dd style={ddStyle}>{status.data.pluginDataDir}</dd>
            <dt style={dtStyle}>插件专属缓存目录</dt>
            <dd style={ddStyle}>{status.data.pluginCacheDir}</dd>
            <dt style={dtStyle}>state.json 写入次数</dt>
            <dd style={ddStyle}>{status.data.pingCount}</dd>
          </dl>
        ) : null}
      </div>
    </div>
  )
}

function StarterFloatingInspector({
  maximized,
  toggleMaximize,
  close,
}: FloatingPanelRenderProps): React.ReactElement {
  const sys = useActionQuery<SystemInfoResult>('system.info', {})
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 600 }}>独立插件注册的悬浮窗口</span>
        <FolioTag tone="info">{maximized ? '已最大化' : '自由窗口'}</FolioTag>
      </div>
      <p style={{ margin: 0, color: 'var(--dsw-alias-label-tertiary, #81858c)', lineHeight: 1.6 }}>
        未来任何新插件（画板、文件预览、属性检查器、独立工具面板）只需通过{' '}
        <code>ctx.folioShell.registerFloatingPanel(...)</code> 注册，即可自动获得：拖拽移动、八向自由缩放、双击/按钮一键最大化与还原、Esc 优先关闭与位置记忆。
      </p>
      {sys.data ? (
        <div style={cardStyle}>
          <dl style={dlStyle}>
            <dt style={dtStyle}>活跃插件存储数</dt>
            <dd style={ddStyle}>{sys.data.registeredStoragePlugins.length}</dd>
            <dt style={dtStyle}>已注册动作数</dt>
            <dd style={ddStyle}>{sys.data.actionIds.length}</dd>
          </dl>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <FolioButton variant="outline" size="sm" onClick={toggleMaximize}>
          {maximized ? '还原窗口尺寸' : '最大化铺满'}
        </FolioButton>
        <FolioButton variant="ghost" size="sm" onClick={close}>
          关闭
        </FolioButton>
      </div>
    </div>
  )
}

function StarterStatusSlot(): React.ReactElement {
  return <span>DSH 增量插件模式 · 原生组件零隔离墙</span>
}

export const starterWorkspace: WorkspaceUiContribution = {
  id: 'starter',
  title: '概览',
  order: 1,
  pluginId: '@folio/app-starter-ui',
  icon: FolioIconData,
  HeaderSlot: StarterHeader,
  LeftPanel: StarterLeftPanel,
  MainView: StarterMainView,
  StatusSlot: StarterStatusSlot,
}

export const starterFloatingPanel: FloatingPanelContribution = {
  id: INSPECTOR_PANEL_ID,
  title: '底座实时检视浮窗',
  pluginId: '@folio/app-starter-ui',
  defaultWidth: 520,
  defaultHeight: 340,
  minWidth: 340,
  minHeight: 220,
  Component: StarterFloatingInspector,
}

export const name = 'app-starter-ui'
export const inject = ['folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposeWs = ctx.folioShell.registerWorkspace(starterWorkspace)
    const disposePanel = ctx.folioShell.registerFloatingPanel(starterFloatingPanel)
    return () => {
      disposePanel()
      disposeWs()
    }
  }, 'app-starter-ui: register workspace & floating panel')
}
