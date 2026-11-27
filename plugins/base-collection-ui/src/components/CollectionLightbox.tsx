import * as React from 'react'
import { Lightbox, LightboxContent, type LightboxItem } from '@folio/base-ui-kit/client'

export interface LightboxState {
  readonly open: boolean
  readonly items: readonly LightboxItem[]
  readonly index: number
}

export interface UseLightboxStateResult {
  readonly lightbox: LightboxState
  readonly openLightbox: (items: readonly LightboxItem[], index?: number) => void
  readonly openLightboxForItem: <T>(
    list: readonly T[],
    target: T,
    mapper: (item: T) => LightboxItem,
    isSame?: (a: T, b: T) => boolean,
  ) => void
  readonly setLightboxOpen: (open: boolean) => void
  readonly setLightboxIndex: (index: number) => void
  readonly closeLightbox: () => void
}

const INITIAL_LIGHTBOX_STATE: LightboxState = {
  open: false,
  items: [],
  index: 0,
}

export const DEFAULT_COLLECTION_LIGHTBOX_LABELS = {
  zoomIn: '放大',
  zoomOut: '缩小',
  close: '关闭',
  previous: '上一张',
  next: '下一张',
  image: (index: number, count: number) => `图片 ${index + 1} / ${count}`,
} as const

export function useLightboxState(): UseLightboxStateResult {
  const [lightbox, setLightbox] = React.useState<LightboxState>(INITIAL_LIGHTBOX_STATE)

  const openLightbox = React.useCallback((items: readonly LightboxItem[], index = 0) => {
    if (items.length === 0) return
    const safeIndex = Math.min(Math.max(0, index), items.length - 1)
    setLightbox({
      open: true,
      items: [...items],
      index: safeIndex,
    })
  }, [])

  const openLightboxForItem = React.useCallback(
    <T,>(
      list: readonly T[],
      target: T,
      mapper: (item: T) => LightboxItem,
      isSame: (a: T, b: T) => boolean = Object.is,
    ) => {
      if (list.length === 0) return
      const matchedIndex = list.findIndex(item => isSame(item, target))
      const safeIndex = matchedIndex >= 0 ? matchedIndex : 0
      setLightbox({
        open: true,
        items: list.map(mapper),
        index: safeIndex,
      })
    },
    [],
  )

  const setLightboxOpen = React.useCallback((open: boolean) => {
    setLightbox(prev => ({ ...prev, open }))
  }, [])

  const setLightboxIndex = React.useCallback((index: number) => {
    setLightbox(prev => ({ ...prev, index }))
  }, [])

  const closeLightbox = React.useCallback(() => {
    setLightbox(prev => ({ ...prev, open: false }))
  }, [])

  return {
    lightbox,
    openLightbox,
    openLightboxForItem,
    setLightboxOpen,
    setLightboxIndex,
    closeLightbox,
  }
}

export interface CollectionLightboxLabels {
  readonly zoomIn?: string
  readonly zoomOut?: string
  readonly close?: string
  readonly previous?: string
  readonly next?: string
  readonly image?: (index: number, count: number) => string
}

export interface CollectionLightboxProps {
  readonly state: LightboxState
  readonly onOpenChange: (open: boolean) => void
  readonly onIndexChange: (index: number) => void
  readonly loop?: boolean
  readonly labels?: CollectionLightboxLabels
}

export function CollectionLightbox({
  state,
  onOpenChange,
  onIndexChange,
  loop = true,
  labels,
}: CollectionLightboxProps): React.ReactElement {
  return (
    <Lightbox
      items={[...state.items]}
      open={state.open}
      index={state.index}
      loop={loop}
      onOpenChange={onOpenChange}
      onIndexChange={onIndexChange}
    >
      <LightboxContent
        labels={{
          ...DEFAULT_COLLECTION_LIGHTBOX_LABELS,
          ...labels,
        }}
      />
    </Lightbox>
  )
}
