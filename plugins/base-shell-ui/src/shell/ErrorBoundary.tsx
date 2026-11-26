import * as React from 'react'
import { FolioButton } from '@folio/base-ui-kit/client'

export interface WorkspaceErrorBoundaryProps {
  readonly scopeName: string
  readonly resetKey?: string
  readonly children: React.ReactNode
}

interface WorkspaceErrorBoundaryState {
  readonly error: Error | null
}

export class WorkspaceErrorBoundary extends React.Component<
  WorkspaceErrorBoundaryProps,
  WorkspaceErrorBoundaryState
> {
  override state: WorkspaceErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): WorkspaceErrorBoundaryState {
    return { error }
  }

  override componentDidUpdate(prevProps: WorkspaceErrorBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null })
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          data-lf-error-boundary={this.props.scopeName}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            height: '100%',
            width: '100%',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--dsw-alias-state-error-primary, #ec1313)',
            }}
          >
            工作区「{this.props.scopeName}」渲染异常
          </div>
          <p
            style={{
              margin: 0,
              maxWidth: 420,
              fontSize: 12,
              color: 'var(--dsw-alias-label-tertiary, #81858c)',
            }}
          >
            {this.state.error.message}
          </p>
          <FolioButton variant="outline" size="sm" onClick={this.handleReset}>
            重新加载该视图
          </FolioButton>
        </div>
      )
    }
    return this.props.children
  }
}
