import * as React from 'react'
import { FolioButton } from '@folio/base-ui-kit/client'

export interface FrameErrorBoundaryProps {
  readonly scopeName: string
  readonly resetKey?: string
  readonly children: React.ReactNode
}

interface FrameErrorBoundaryState {
  readonly error: Error | null
}

/**
 * Isolates one region: a crashing right panel must not blank the sidebar, the
 * center content or the status bar.
 */
export class FrameErrorBoundary extends React.Component<
  FrameErrorBoundaryProps,
  FrameErrorBoundaryState
> {
  override state: FrameErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): FrameErrorBoundaryState {
    return { error }
  }

  override componentDidUpdate(prevProps: FrameErrorBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null })
  }

  override render(): React.ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        role="alert"
        data-lf-frame-error={this.props.scopeName}
        className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <div className="text-sm font-semibold" style={{ color: 'var(--dsw-alias-state-error-primary, #ec1313)' }}>
          「{this.props.scopeName}」区域渲染异常
        </div>
        <p className="max-w-96 text-xs" style={{ color: 'var(--dsw-alias-label-tertiary, #81858c)' }}>
          {error.message}
        </p>
        <FolioButton variant="outline" size="sm" onClick={this.handleReset}>
          重新渲染该区域
        </FolioButton>
      </div>
    )
  }
}
