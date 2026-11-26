import * as React from 'react'
import type { ProjectsUiExtensionContext } from '@folio/base-contract'
import { Archive } from 'lucide-react'
import { Button } from '@folio/base-ui-kit/client'
import { setArchiveDialogOpen, useArchiveUiStore } from '../archive-store.js'
import { ArchiveSettingsDialog } from './ArchiveSettingsDialog.js'

export function ArchiveToolbarControl({
  ctx,
}: {
  readonly ctx: ProjectsUiExtensionContext
}): React.ReactElement {
  const { status } = useArchiveUiStore()

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs"
        title="配置或一键下载 zpaqfranz 归档引擎"
        onClick={() => setArchiveDialogOpen(true)}
      >
        <Archive size={13} />
        <span>归档引擎</span>
        <span
          className={
            status?.installed
              ? 'h-1.5 w-1.5 rounded-full bg-emerald-500'
              : 'h-1.5 w-1.5 rounded-full bg-amber-500'
          }
        />
      </Button>
      <ArchiveSettingsDialog ctx={ctx} />
    </>
  )
}
