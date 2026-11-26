export type FolioToastTone = 'neutral' | 'info' | 'success' | 'danger'

export interface FolioToastInput {
  readonly id?: string
  readonly title: string
  readonly description?: string
  readonly tone?: FolioToastTone
  /** Auto-dismiss delay in ms; pass 0 to keep until manually dismissed. Defaults to 3600. */
  readonly durationMs?: number
}

export interface FolioToastRecord {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly tone: FolioToastTone
  readonly durationMs: number
  readonly createdAt: number
}

/**
 * Browser-side UI service registered by `@folio/base-ui-kit` on `ctx.folioUi`.
 */
export interface FolioUiService {
  toast(input: FolioToastInput | string): string
  dismissToast(id: string): void
  clearToasts(): void
  getPortalContainer(): HTMLElement | null
}
