import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import { Lightbox, LightboxContent } from '@folio/base-ui-kit/client'
import { useFiles } from '../context.js'
import { FavoritesManagerDialog } from './FavoritesManagerDialog.js'
import { FilePane } from './FilePane.js'
import { TagManagerDialog } from './TagManagerDialog.js'

export function FilesMain(_props: FrameViewProps): React.ReactElement {
  const { dualPane, lightbox, setLightboxOpen, setLightboxIndex } = useFiles()

  return (
    <div data-lf-files-main="" className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      <FilePane paneId="left" />
      {dualPane ? (
        <>
          <div aria-hidden="true" className="w-px shrink-0 bg-border" />
          <FilePane paneId="right" />
        </>
      ) : null}

      <FavoritesManagerDialog />
      <TagManagerDialog />

      <Lightbox
        items={[...lightbox.items]}
        open={lightbox.open}
        index={lightbox.index}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      >
        <LightboxContent
          labels={{
            zoomIn: '放大',
            zoomOut: '缩小',
            close: '关闭',
            previous: '上一张',
            next: '下一张',
            image: (i, count) => `图片 ${i + 1} / ${count}`,
          }}
        />
      </Lightbox>
    </div>
  )
}
