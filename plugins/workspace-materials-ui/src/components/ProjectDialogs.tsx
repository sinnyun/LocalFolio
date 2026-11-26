import * as React from 'react'
import { FolderOpen } from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FolioSwitch,
  Input,
} from '@folio/base-ui-kit/client'
import { useMaterials } from '../context.js'

export function ProjectDialogs(): React.ReactElement {
  const {
    status,
    activeProject,
    newProjectOpen,
    newFileProjectId,
    settingsOpen,
    mutating,
    setNewProjectOpen,
    setNewFileProjectId,
    setSettingsOpen,
    createProject,
    createNewA3File,
    pickSaveFilePath,
    updateSettings,
  } = useMaterials()

  // New project form
  const [projName, setProjName] = React.useState('')
  const [projDesc, setProjDesc] = React.useState('')

  // New A3 file form
  const [filePath, setFilePath] = React.useState('')
  const [docTitle, setDocTitle] = React.useState('')
  const [artboardCount, setArtboardCount] = React.useState('1')

  // Settings form
  const [cliPath, setCliPath] = React.useState('')
  const [appPath, setAppPath] = React.useState('')
  const [controlPort, setControlPort] = React.useState('7979')
  const [autoWatch, setAutoWatch] = React.useState(true)
  const [autoPoll, setAutoPoll] = React.useState(true)

  React.useEffect(() => {
    if (!newFileProjectId) return
    setDocTitle(activeProject?.name ?? '新建物料')
    setArtboardCount('1')
    setFilePath('')
  }, [newFileProjectId, activeProject?.name])

  React.useEffect(() => {
    if (!settingsOpen || !status) return
    setCliPath(status.settings.cliPath)
    setAppPath(status.settings.appPath)
    setControlPort(String(status.settings.controlPort || 7979))
    setAutoWatch(status.settings.autoWatchFiles)
    setAutoPoll(status.settings.autoPollLiveControl)
  }, [settingsOpen, status])

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projName.trim()) return
    const created = await createProject(projName.trim(), projDesc.trim())
    if (created) {
      setProjName('')
      setProjDesc('')
      setNewProjectOpen(false)
    }
  }

  const handleBrowseSaveFile = async () => {
    const suggested = `${(docTitle || activeProject?.name || '新建物料').trim()}.vectorcraft`
    const picked = await pickSaveFilePath(suggested)
    if (picked) setFilePath(picked)
  }

  const handleCreateA3File = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFileProjectId || !filePath.trim()) return
    await createNewA3File({
      projectId: newFileProjectId,
      filePath: filePath.trim(),
      title: docTitle.trim() || undefined,
      artboardCount: Math.max(1, Math.min(50, Number(artboardCount) || 1)),
    })
    setNewFileProjectId(null)
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    await updateSettings({
      cliPath: cliPath.trim(),
      appPath: appPath.trim(),
      controlPort: Math.max(1024, Math.min(65535, Number(controlPort) || 7979)),
      autoWatchFiles: autoWatch,
      autoPollLiveControl: autoPoll,
    })
    setSettingsOpen(false)
  }

  return (
    <>
      {/* 新建项目弹窗 */}
      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="sm:max-w-md" data-lf-new-project-dialog="">
          <DialogHeader>
            <DialogTitle>新建物料项目</DialogTitle>
            <DialogDescription>
              每个物料项目可管理一个或多个 A3 横版 .vectorcraft 文件及专属项目物料数据。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={e => void handleCreateProject(e)} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">项目名称 *</label>
              <Input
                value={projName}
                onChange={e => setProjName(e.target.value)}
                placeholder="例如：2026 春季新品发布会"
                className="h-8 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">项目备注（可选）</label>
              <Input
                value={projDesc}
                onChange={e => setProjDesc(e.target.value)}
                placeholder="例如：主会场 + 外场导视物料"
                className="h-8 text-xs"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewProjectOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={mutating || !projName.trim()}>
                创建项目
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 新建固定 A3 横版 VectorCraft 文件弹窗 */}
      <Dialog
        open={Boolean(newFileProjectId)}
        onOpenChange={open => {
          if (!open) setNewFileProjectId(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建固定 A3 横版 VectorCraft 文件</DialogTitle>
            <DialogDescription>
              画板初始尺寸固定为 A3 横版（420 × 297 mm / 1190.55 × 841.89 pt），并自动初始化顶部物料信息条。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={e => void handleCreateA3File(e)} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">保存路径 (.vectorcraft) *</label>
              <div className="flex items-center gap-1.5">
                <Input
                  value={filePath}
                  onChange={e => setFilePath(e.target.value)}
                  placeholder="例如：D:\Projects\物料排版.vectorcraft"
                  className="h-8 flex-1 text-xs"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => void handleBrowseSaveFile()}
                >
                  <FolderOpen size={13} className="mr-1" />
                  选择
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">文档标题</label>
                <Input
                  value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">初始 A3 页数</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={artboardCount}
                  onChange={e => setArtboardCount(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewFileProjectId(null)}
              >
                取消
              </Button>
              <Button type="submit" disabled={mutating || !filePath.trim()}>
                创建并初始化
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* VectorCraft 运行与同步设置弹窗 */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>VectorCraft 运行与双向同步设置</DialogTitle>
            <DialogDescription>
              自动检测本地安装的 VectorCraft CLI 与桌面程序；留空将使用系统默认安装路径。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={e => void handleSaveSettings(e)} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2.5 text-xs">
              <Badge variant={status?.cliFound ? 'default' : 'destructive'}>
                CLI: {status?.cliFound ? status.cliVersion || '已检测' : '未找到'}
              </Badge>
              <Badge variant={status?.appFound ? 'secondary' : 'outline'}>
                GUI: {status?.appFound ? '已检测' : '未找到'}
              </Badge>
              <Badge variant={status?.liveConnected ? 'default' : 'outline'}>
                实时控制通道: {status?.liveConnected ? `已连接 :${status.controlPort}` : '未连接'}
              </Badge>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">vectorcraft-cli.exe 路径（留空自动探测）</label>
              <Input
                value={cliPath}
                onChange={e => setCliPath(e.target.value)}
                placeholder={status?.cliPath ?? 'C:\\Program Files\\VectorCraft\\vectorcraft-cli.exe'}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">vectorcraft.exe 路径（留空自动探测）</label>
              <Input
                value={appPath}
                onChange={e => setAppPath(e.target.value)}
                placeholder={status?.appPath ?? 'C:\\Program Files\\VectorCraft\\vectorcraft.exe'}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">TCP 控制通道端口 (--control)</label>
              <Input
                type="number"
                min={1024}
                max={65535}
                value={controlPort}
                onChange={e => setControlPort(e.target.value)}
                className="h-8 w-36 text-xs"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs">监听本地 .vectorcraft 文件保存变更（反向更新）</span>
              <FolioSwitch checked={autoWatch} onCheckedChange={v => setAutoWatch(Boolean(v))} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs">轮询前台 VectorCraft 实时控制通道（未保存实时感知）</span>
              <FolioSwitch checked={autoPoll} onCheckedChange={v => setAutoPoll(Boolean(v))} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
                关闭
              </Button>
              <Button type="submit">保存设置</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
