import * as React from 'react'
import type { ProjectsUiExtension } from '@folio/base-contract'
import { MissingThumbsToolbarControl } from './components/MissingThumbsDialog.js'

export function createThumbsEagleProjectsExtension(): ProjectsUiExtension {
  return {
    id: 'feature-thumbs-eagle',
    order: 20,

    renderToolbarActions(ctx) {
      return <MissingThumbsToolbarControl ctx={ctx} />
    },
  }
}
