import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import { useMaterials } from '../context.js'
import { ExportDialog } from './ExportDialog.js'
import { MaterialDataManagerView } from './MaterialDataManagerView.js'
import { PageEditorView } from './PageEditorView.js'
import { PagesOverviewView } from './PagesOverviewView.js'
import { ProjectDialogs } from './ProjectDialogs.js'

export function MaterialsMain(_props: FrameViewProps): React.ReactElement {
  const { viewLayer } = useMaterials()

  return (
    <div
      data-lf-materials-main=""
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
    >
      {viewLayer === 'pages' ? (
        <PagesOverviewView />
      ) : viewLayer === 'editor' ? (
        <PageEditorView />
      ) : (
        <MaterialDataManagerView />
      )}

      <ExportDialog />
      <ProjectDialogs />
    </div>
  )
}
