import * as React from 'react'
import {
  ArrowUp,
  Check,
  Download,
  File,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  Image as ImageIcon,
  Monitor,
  Search,
} from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from '@folio/base-ui-kit/client'

export type LocalPickerMode = 'multi-file' | 'single-file' | 'folder'

export type LocalPickerQuickFolderKind =
  | 'home'
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'pictures'
  | string

export interface LocalPickerQuickFolder {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly kind: LocalPickerQuickFolderKind
}

export interface LocalPickerDrive {
  readonly name: string
  readonly path: string
}

export interface LocalPickerRoots {
  readonly homePath?: string
  readonly platform?: string
  readonly quickFolders: readonly LocalPickerQuickFolder[]
  readonly drives: readonly LocalPickerDrive[]
}

export interface LocalPickerEntry {
  readonly name: string
  readonly path: string
  readonly isDir: boolean
  readonly ext?: string
  readonly mime?: string
  readonly size?: number
  readonly mtimeMs?: number
}

export interface LocalPickerDirResult {
  readonly path: string
  readonly parentPath: string | null
  readonly entries: readonly LocalPickerEntry[]
  readonly truncated?: boolean
}

export interface LocalFilePickerDialogProps {
  readonly open: boolean
  readonly mode: LocalPickerMode
  readonly title: string
  readonly description?: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly initialDir?: string
  readonly emptyText?: string
  readonly dialogDataAttr?: string
  readonly onClose: () => void
  readonly onConfirm: (paths: string[]) => void | Promise<void>
  readonly loadRoots: () => Promise<LocalPickerRoots>
  readonly loadDir: (dirPath?: string) => Promise<LocalPickerDirResult>
  readonly buildThumbUrl?: (entry: LocalPickerEntry) => string | null
}

function quickIcon(kind: LocalPickerQuickFolderKind): React.ReactElement {
  switch (kind) {
    case 'home':
      return <Home size={13} />
    case 'pictures':
      return <ImageIcon size={13} />
    case 'desktop':
      return <Monitor size={13} />
    case 'downloads':
      return <Download size={13} />
    case 'documents':
      return <FileText size={13} />
    default:
      return <Folder size={13} />
  }
}

function isImageEntry(entry: LocalPickerEntry): boolean {
  if (entry.mime?.startsWith('image/')) return true
  const ext = entry.ext?.toLowerCase() ?? ''
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.avif'].includes(ext)
}

export function LocalFilePickerDialog({
  open,
  mode,
  title,
  description,
  confirmLabel = '确定',
  cancelLabel = '取消',
  initialDir,
  emptyText = '此目录下没有子文件夹或文件',
  dialogDataAttr,
  onClose,
  onConfirm,
  loadRoots,
  loadDir: loadDirProp,
  buildThumbUrl,
}: LocalFilePickerDialogProps): React.ReactElement {
  const [roots, setRoots] = React.useState<LocalPickerRoots | null>(null)
  const [listing, setListing] = React.useState<LocalPickerDirResult | null>(null)
  const [currentPath, setCurrentPath] = React.useState<string>('')
  const [selectedPaths, setSelectedPaths] = React.useState<string[]>([])
  const [filter, setFilter] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadDirRef = React.useRef(loadDirProp)
  loadDirRef.current = loadDirProp
  const loadRootsRef = React.useRef(loadRoots)
  loadRootsRef.current = loadRoots

  const loadDir = React.useCallback(async (targetPath?: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await loadDirRef.current(targetPath)
      setListing(res)
      setCurrentPath(res.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    setSelectedPaths([])
    setFilter('')
    setError(null)
    void loadRootsRef.current()
      .then(res => setRoots(res))
      .catch(() => {})
    void loadDir(initialDir)
  }, [open, initialDir, loadDir])

  const filteredEntries = React.useMemo(() => {
    const entries = listing?.entries ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(e => e.name.toLowerCase().includes(q))
  }, [listing?.entries, filter])

  const toggleFileSelect = (filePath: string): void => {
    if (mode === 'folder') return
    if (mode === 'single-file') {
      setSelectedPaths([filePath])
      return
    }
    setSelectedPaths(prev =>
      prev.includes(filePath) ? prev.filter(p => p !== filePath) : [...prev, filePath],
    )
  }

  const handleConfirm = async (overridePaths?: string[]): Promise<void> => {
    if (mode === 'folder') {
      if (!currentPath) return
      onClose()
      await onConfirm([currentPath])
      return
    }
    const targets = overridePaths ?? selectedPaths
    if (targets.length === 0) return
    onClose()
    await onConfirm(targets)
  }

  const dialogContentAttr = dialogDataAttr ? { [dialogDataAttr]: '' } : undefined

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        data-lf-local-file-picker=""
        {...dialogContentAttr}
        className="flex max-h-[82vh] max-w-3xl flex-col gap-3 p-4"
      >
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-xs">{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="flex min-h-[340px] flex-1 gap-3 overflow-hidden rounded-lg border border-border">
          <div className="flex w-44 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-muted/30 p-2">
            <div>
              <div className="mb-1 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                常用目录
              </div>
              <div className="space-y-0.5">
                {(roots?.quickFolders ?? []).map(folder => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => void loadDir(folder.path)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent',
                      currentPath.toLowerCase() === folder.path.toLowerCase() && 'bg-accent font-medium',
                    )}
                  >
                    {quickIcon(folder.kind)}
                    <span className="truncate">{folder.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                驱动器
              </div>
              <div className="space-y-0.5">
                {(roots?.drives ?? []).map(drive => (
                  <button
                    key={drive.path}
                    type="button"
                    onClick={() => void loadDir(drive.path)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent',
                      currentPath.toLowerCase() === drive.path.toLowerCase() && 'bg-accent font-medium',
                    )}
                  >
                    <HardDrive size={13} />
                    <span className="truncate">{drive.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                disabled={!listing?.parentPath || loading}
                onClick={() => listing?.parentPath && void loadDir(listing.parentPath)}
                aria-label="上一级目录"
              >
                <ArrowUp size={13} />
              </Button>
              <Input
                value={currentPath}
                onChange={e => setCurrentPath(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void loadDir(currentPath)
                  }
                }}
                aria-label="当前路径"
                className="h-7 flex-1 font-mono text-xs"
              />
              <div className="relative w-36 shrink-0">
                <Search
                  size={12}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="筛选..."
                  className="h-7 pl-6 text-xs"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5">
              {error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {error}
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                  <FolderOpen size={22} />
                  <span>{emptyText}</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {filteredEntries.map(entry => {
                    if (entry.isDir) {
                      return (
                        <button
                          key={entry.path}
                          type="button"
                          onDoubleClick={() => void loadDir(entry.path)}
                          onClick={() => void loadDir(entry.path)}
                          className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card/60 p-2.5 text-center transition-colors hover:bg-accent"
                        >
                          <Folder size={24} className="text-sky-500" />
                          <span className="line-clamp-2 w-full break-all text-[11px] font-medium">
                            {entry.name}
                          </span>
                        </button>
                      )
                    }

                    const isSelected = selectedPaths.includes(entry.path)
                    const isFolderOnlyMode = mode === 'folder'
                    const thumbUrl = buildThumbUrl ? buildThumbUrl(entry) : null

                    return (
                      <button
                        key={entry.path}
                        type="button"
                        disabled={isFolderOnlyMode}
                        data-lf-picker-entry={entry.path}
                        data-lf-picker-image={entry.path}
                        onClick={() => toggleFileSelect(entry.path)}
                        onDoubleClick={() => {
                          if (!isFolderOnlyMode) {
                            setSelectedPaths([entry.path])
                            void handleConfirm([entry.path])
                          }
                        }}
                        className={cn(
                          'relative flex flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors',
                          isSelected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary'
                            : 'border-border bg-card/60 hover:bg-accent',
                          isFolderOnlyMode && 'cursor-default opacity-60',
                        )}
                      >
                        <div className="relative flex h-20 w-full items-center justify-center overflow-hidden rounded bg-muted">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt={entry.name}
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : isImageEntry(entry) ? (
                            <ImageIcon size={22} className="text-muted-foreground" />
                          ) : (
                            <File size={22} className="text-muted-foreground" />
                          )}
                          {isSelected ? (
                            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check size={10} />
                            </span>
                          ) : null}
                        </div>
                        <span className="truncate text-[11px] font-medium">{entry.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {mode === 'folder'
              ? `目标目录：${currentPath || '未选择'}`
              : `已选择 ${selectedPaths.length} 个文件`}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              data-lf-picker-confirm=""
              disabled={mode === 'folder' ? !currentPath : selectedPaths.length === 0}
              onClick={() => void handleConfirm()}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
