import type * as React from 'react'

export interface CanvasLinkResolveResult {
  readonly localPath: string
  readonly meta?: Readonly<Record<string, unknown>>
}

export interface CanvasLinkedItemInfo {
  readonly assetId: string
  readonly shapeIds: readonly string[]
  readonly linkId: string
  readonly localPath: string
  readonly fileName: string
  readonly fileSize: number
  readonly mtimeMs: number
  readonly naturalWidth: number | null
  readonly naturalHeight: number | null
  readonly mime: string
  readonly relinkRev: number
  readonly status: 'ok' | 'missing' | 'checking'
  readonly rawMeta: Readonly<Record<string, unknown>>
}

export interface CanvasLinkSourceProvider {
  readonly id: string
  readonly order?: number
  readonly ownedMetaKeys?: readonly string[]
  resolveLocalPaths?(
    localPaths: readonly string[],
  ): Promise<readonly (CanvasLinkResolveResult | null)[]>
  canHandleExternalText?(text: string): boolean
  resolveExternalText?(text: string): Promise<readonly CanvasLinkResolveResult[] | null>
  renderLinkedItemDetails?(item: CanvasLinkedItemInfo): React.ReactNode
  renderLinkedItemActions?(item: CanvasLinkedItemInfo): React.ReactNode
  renderPanelExtra?(items: readonly CanvasLinkedItemInfo[]): React.ReactNode
}

export interface FolioCanvasService {
  registerLinkSource(provider: CanvasLinkSourceProvider): () => void
  listLinkSources(): readonly CanvasLinkSourceProvider[]
  subscribe(listener: () => void): () => void
}
