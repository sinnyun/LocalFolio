import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import { useProjects } from '../context.js'
import { ProjectsOverviewSidebar } from './ProjectsOverviewSidebar.js'
import { ProjectsSidebar } from './ProjectsSidebar.js'

/**
 * Left panel mode switch: libraries while browsing project cards, the active
 * library's project list once a project is open.
 */
export function ProjectsLeft(props: FrameViewProps): React.ReactElement {
  const { overviewActive } = useProjects()
  return overviewActive ? (
    <ProjectsOverviewSidebar {...props} />
  ) : (
    <ProjectsSidebar {...props} />
  )
}
