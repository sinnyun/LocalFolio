import * as React from 'react'
import type {
  ProjectsUiExtension,
  ProjectsUiExtensionContext,
  ProjectsUiFileInfo,
  ProjectsUiProjectInfo,
  TaskSnapshot,
} from '@folio/base-contract'
import { rpcCall } from '@folio/base-contract/rpc'
import { Archive, Download, FolderDown } from 'lucide-react'
import { Badge, Button } from '@folio/base-ui-kit/client'
import { ArchiveInspectorSection } from './components/ArchiveInspectorSection.js'
import { ArchiveToolbarControl } from './components/ArchiveToolbarControl.js'
import { ArchiveBatchControl } from './components/ArchiveBatchControl.js'

async function extractSingleFileInPlace(
  ctx: ProjectsUiExtensionContext,
  projectId: string,
  file: ProjectsUiFileInfo,
): Promise<void> {
  try {
    const res = await rpcCall<{
      extractedPath: string
      alreadyOnDisk: boolean
    }>('archive.file.extractInPlace', {
      projectId,
      relPath: file.relPath,
      reveal: true,
    })
    await Promise.all([ctx.refreshSelectedProject(), ctx.refreshProjects()])
    ctx.notify(
      res.alreadyOnDisk
        ? `文件「${file.name}」已存在于项目原位置：${res.extractedPath}`
        : `已提取「${file.name}」到项目原位置（未修改不计入变更）`,
      true,
    )
  } catch (err) {
    ctx.notify(err instanceof Error ? err.message : '提取到原位置失败', false)
  }
}

async function extractSingleFileToFolder(
  ctx: ProjectsUiExtensionContext,
  projectId: string,
  file: ProjectsUiFileInfo,
): Promise<void> {
  try {
    const res = await rpcCall<{ cancelled: boolean; extractedPath: string | null }>(
      'archive.file.extractTo',
      {
        projectId,
        relPath: file.relPath,
        reveal: true,
      },
    )
    if (!res.cancelled && res.extractedPath) {
      ctx.notify(`已导出「${file.name}」到：${res.extractedPath}`, true)
    }
  } catch (err) {
    ctx.notify(err instanceof Error ? err.message : '导出文件失败', false)
  }
}

async function exportProjectArchiveToFolder(
  ctx: ProjectsUiExtensionContext,
  projectId: string,
): Promise<void> {
  try {
    const res = await rpcCall<{ cancelled: boolean; exportedPath: string | null }>(
      'archive.project.exportArchive',
      { projectId, reveal: true },
    )
    if (!res.cancelled && res.exportedPath) {
      ctx.notify(`已导出归档包到：${res.exportedPath}`, true)
    }
  } catch (err) {
    ctx.notify(err instanceof Error ? err.message : '导出归档包失败', false)
  }
}

async function cleanUnmodifiedExtractedFiles(
  ctx: ProjectsUiExtensionContext,
  projectId: string,
): Promise<void> {
  try {
    const res = await rpcCall<{ removedCount: number }>('archive.project.cleanExtracted', {
      projectId,
    })
    await Promise.all([ctx.refreshSelectedProject(), ctx.refreshProjects()])
    if (res.removedCount > 0) {
      ctx.notify(`已直接删除 ${res.removedCount} 个未修改的归档提取文件`, true)
    } else {
      ctx.notify('没有可清理的未修改提取文件', false)
    }
  } catch (err) {
    ctx.notify(err instanceof Error ? err.message : '清理失败', false)
  }
}

async function enqueueProjectArchiveTask(
  ctx: ProjectsUiExtensionContext,
  actionId: string,
  payload: Record<string, unknown>,
  message: string,
): Promise<void> {
  try {
    const res = await rpcCall<{ task: TaskSnapshot }>(actionId, payload)
    ctx.onTaskEnqueued(res.task)
    ctx.notify(message, true)
  } catch (err) {
    ctx.notify(err instanceof Error ? err.message : '归档任务启动失败', false)
  }
}

export function createArchiveProjectsExtension(): ProjectsUiExtension {
  return {
    id: 'feature-archive',
    order: 10,

    renderToolbarActions(ctx) {
      return <ArchiveToolbarControl ctx={ctx} />
    },

    renderBatchActions(ctx, selectedProjects) {
      return <ArchiveBatchControl ctx={ctx} selectedProjects={selectedProjects} />
    },

    renderChangeBannerActions(ctx) {
      const project = ctx.selectedProject
      if (!project) return null
      const isArchived = Boolean(project.archived || ctx.projectArchive?.mode === 'archived')
      if (!isArchived) return null
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() =>
            void enqueueProjectArchiveTask(
              ctx,
              'archive.project.append',
              { projectId: project.id },
              `已启动「${project.name}」增量追加归档`,
            )
          }
        >
          <Archive size={12} className="mr-1" />
          追加归档到 .zpaq
        </Button>
      )
    },

    renderProjectBadges(project, variant = 'sidebar') {
      if (!project.archived) return null
      if (variant === 'header') {
        return (
          <Badge variant="outline" className="gap-1 border-violet-500/40 text-[11px] text-violet-500">
            <Archive size={11} />
            已归档
          </Badge>
        )
      }
      return (
        <Archive
          size={11}
          className="shrink-0 text-violet-500"
          aria-label="已 ZPAQ 归档"
        />
      )
    },

    renderInspectorSection(ctx) {
      return <ArchiveInspectorSection ctx={ctx} />
    },

    renderFileActions(ctx, file) {
      const project = ctx.selectedProject
      if (!project) return null
      const isArchived = Boolean(project.archived || ctx.projectArchive?.mode === 'archived')
      if (isArchived) {
        return (
          <>
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-7 text-xs"
              onClick={() => void extractSingleFileInPlace(ctx, project.id, file)}
            >
              <FolderDown size={12} className="mr-1" />
              提取到原位置
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void extractSingleFileToFolder(ctx, project.id, file)}
            >
              <Download size={12} className="mr-1" />
              导出到其他目录…
            </Button>
          </>
        )
      }
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => void extractSingleFileToFolder(ctx, project.id, file)}
        >
          <Download size={12} className="mr-1" />
          导出此文件到…
        </Button>
      )
    },

    getFileContextMenuActions(ctx, file) {
      const project = ctx.selectedProject
      if (!project) return []
      const isArchived = Boolean(project.archived || ctx.projectArchive?.mode === 'archived')
      if (isArchived) {
        return [
          ...(file.thumbSupported ? [{
            id: 'archive.rebuildThumb',
            label: '从归档补缩略图',
            run: () => enqueueProjectArchiveTask(
              ctx,
              'archive.project.rebuildThumbs',
              { projectId: project.id, relPaths: [file.relPath] },
              `已提交「${file.name}」归档补图任务`,
            ),
          }] : []),
          {
            id: 'archive.extractInPlace',
            label: '提取到项目原位置',
            separatorBefore: true,
            run: () => extractSingleFileInPlace(ctx, project.id, file),
          },
          {
            id: 'archive.extractFileTo',
            label: '导出此文件到其他目录…',
            run: () => extractSingleFileToFolder(ctx, project.id, file),
          },
        ]
      }
      return [
        {
          id: 'archive.extractFileTo',
          label: '导出此文件到…',
          separatorBefore: true,
          run: () => extractSingleFileToFolder(ctx, project.id, file),
        },
      ]
    },

    getProjectContextMenuActions(ctx, project: ProjectsUiProjectInfo) {
      if (project.archived) {
        return [
          {
            id: 'archive.append',
            label: '追加新增/修改文件到归档',
            separatorBefore: true,
            run: () =>
              enqueueProjectArchiveTask(
                ctx,
                'archive.project.append',
                { projectId: project.id },
                `已启动「${project.name}」增量追加归档…`,
              ),
          },
          {
            id: 'archive.cleanExtracted',
            label: '直接删除未修改的提取文件',
            run: () => cleanUnmodifiedExtractedFiles(ctx, project.id),
          },
          {
            id: 'archive.verify',
            label: '校验归档完整性',
            run: () =>
              enqueueProjectArchiveTask(
                ctx,
                'archive.project.verify',
                { projectId: project.id },
                `正在校验「${project.name}」归档包…`,
              ),
          },
          {
            id: 'archive.exportArchive',
            label: '导出归档包…',
            run: () => exportProjectArchiveToFolder(ctx, project.id),
          },
          {
            id: 'archive.extractAllKeep',
            label: '全部提取到原位置（保留归档包）',
            run: () =>
              enqueueProjectArchiveTask(
                ctx,
                'archive.project.restore',
                { projectId: project.id, mode: 'extract_all_keep_archive', removeArchive: false },
                `正在全部提取「${project.name}」到原位置…`,
              ),
          },
          {
            id: 'archive.restore',
            label: '解包还原并移除归档包',
            run: () =>
              enqueueProjectArchiveTask(
                ctx,
                'archive.project.restore',
                { projectId: project.id, mode: 'restore_and_remove_archive', removeArchive: true },
                `正在解包还原「${project.name}」并移除归档包…`,
              ),
          },
        ]
      }
      return [
        {
          id: 'archive.pack',
          label: '归档此项目（ZPAQ）',
          separatorBefore: true,
          run: () =>
            enqueueProjectArchiveTask(
              ctx,
              'archive.project.pack',
              { projectId: project.id },
              `已开始归档「${project.name}」…`,
            ),
        },
      ]
    },

    formatOpenSuccessMessage(file, result) {
      if (!result.extractedFromArchive) return null
      return `已从归档提取并打开「${file.name}」（临时副本）`
    },
  }
}
