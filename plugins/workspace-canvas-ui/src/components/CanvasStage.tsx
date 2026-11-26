import * as React from 'react'
import { FOLIO_DRAG_MIME, decodeFolioDragPayload } from '@folio/base-contract'
import { AlertTriangle, FolderOpen, ImagePlus, Link2 } from 'lucide-react'
import { Button, cn } from '@folio/base-ui-kit/client'
import {
  Tldraw,
  createTLStore,
  defaultBindingUtils,
  defaultHandleExternalTextContent,
  defaultShapeUtils,
  loadSnapshot,
  type Editor,
  type TLComponents,
  type TLEditorSnapshot,
  type TLImageShape,
  type TLUiOverrides,
} from 'tldraw'
import tldrawCss from 'tldraw/tldraw.css'
import { useCanvas } from '../context.js'
import {
  buildSelfHostedAssetUrls,
  createFolioAssetStore,
  extractFolioLinkMeta,
  extractLocalPathsFromText,
  isDroppedImageFile,
  isImagePathCandidate,
  resolveDroppedFilePath,
} from '../lod.js'
import { LinkedImagesPanel } from './LinkedImagesPanel.js'
import { LocalImagePickerDialog } from './LocalImagePickerDialog.js'

const CANVAS_SCOPE_CSS = `
[data-lf-canvas-stage] .tl-container {
  width: 100%;
  height: 100%;
}
`

function isDocumentDark(): boolean {
  if (typeof document === 'undefined') return false
  return (
    document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark'
  )
}

function CanvasTopPanel(): React.ReactElement {
  const {
    linkedImages,
    brokenCount,
    relinkPanelOpen,
    setRelinkPanelOpen,
    setRelinkFilter,
    selectedBrokenAssetId,
    pickAndInsertImages,
    pickAndRelinkImage,
    openPicker,
  } = useCanvas()

  return (
    <div
      data-lf-canvas-top-panel=""
      onPointerDown={e => e.stopPropagation()}
      className="pointer-events-auto mt-2 flex items-center gap-1.5 rounded-full border border-border bg-popover/90 px-2.5 py-1 text-xs shadow-sm backdrop-blur"
    >
      <Button
        type="button"
        variant="ghost"
        size="xs"
        data-lf-canvas-insert-btn=""
        onClick={() => void pickAndInsertImages()}
        className="h-6 rounded-full px-2 text-xs"
      >
        <ImagePlus size={13} className="mr-1" />
        链接图片
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        title="使用内置文件夹浏览器选择图片"
        data-lf-canvas-browse-btn=""
        onClick={() => openPicker({ mode: 'insert' })}
        className="size-6 rounded-full"
      >
        <FolderOpen size={12} />
      </Button>

      <div className="h-3.5 w-px bg-border" />

      <button
        type="button"
        data-lf-canvas-links-pill=""
        onClick={() => {
          if (brokenCount > 0) setRelinkFilter('missing')
          setRelinkPanelOpen(!relinkPanelOpen)
        }}
        className={cn(
          'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors',
          brokenCount > 0
            ? 'border border-amber-500/60 bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300'
            : relinkPanelOpen
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        {brokenCount > 0 ? <AlertTriangle size={12} /> : <Link2 size={12} />}
        <span>
          {brokenCount > 0
            ? `${brokenCount} 张图片已移动 · 重新链接`
            : `图片链接 (${linkedImages.length})`}
        </span>
      </button>

      {selectedBrokenAssetId ? (
        <>
          <div className="h-3.5 w-px bg-border" />
          <Button
            type="button"
            size="xs"
            data-lf-canvas-quick-relink=""
            onClick={() => void pickAndRelinkImage(selectedBrokenAssetId)}
            className="h-6 rounded-full bg-amber-600 px-2.5 text-xs text-white hover:bg-amber-700"
          >
            重新选择此图片
          </Button>
        </>
      ) : null}
    </div>
  )
}

export function CanvasStage(): React.ReactElement {
  const {
    activeBoardId,
    activeDoc,
    docLoading,
    relinkPanelOpen,
    setRelinkPanelOpen,
    pickerRequest,
    attachEditor,
    syncLinkedImagesFromEditor,
    scheduleSave,
    checkAllLinks,
    getLinkStatus,
    setSelectedBrokenAssetId,
    insertLinkedImages,
    pickAndInsertImages,
    linkElectronDroppedFile,
    importWebFile,
    importDroppedFiles,
    handleBlockedWebUpload,
  } = useCanvas()

  const editorRef = React.useRef<Editor | null>(null)
  const mountCleanupRef = React.useRef<(() => void) | null>(null)
  const assetUrls = React.useMemo(() => buildSelfHostedAssetUrls(), [])

  React.useEffect(() => {
    return () => {
      mountCleanupRef.current?.()
      mountCleanupRef.current = null
    }
  }, [activeBoardId])

  const pickAndInsertRef = React.useRef(pickAndInsertImages)
  pickAndInsertRef.current = pickAndInsertImages
  const insertLinkedRef = React.useRef(insertLinkedImages)
  insertLinkedRef.current = insertLinkedImages
  const getLinkStatusRef = React.useRef(getLinkStatus)
  getLinkStatusRef.current = getLinkStatus
  const linkElectronRef = React.useRef(linkElectronDroppedFile)
  linkElectronRef.current = linkElectronDroppedFile
  const importWebFileRef = React.useRef(importWebFile)
  importWebFileRef.current = importWebFile
  const importDroppedRef = React.useRef(importDroppedFiles)
  importDroppedRef.current = importDroppedFiles
  const blockedUploadRef = React.useRef(handleBlockedWebUpload)
  blockedUploadRef.current = handleBlockedWebUpload

  const assetStore = React.useMemo(
    () =>
      createFolioAssetStore({
        getLinkStatus: linkId => getLinkStatusRef.current(linkId),
        onBlockedWebUpload: file => blockedUploadRef.current(file),
        onElectronFileLink: (asset, localPath) => linkElectronRef.current(asset, localPath),
        onWebFileImport: file => importWebFileRef.current(file),
      }),
    [],
  )

  const store = React.useMemo(() => {
    const nextStore = createTLStore({
      shapeUtils: defaultShapeUtils,
      bindingUtils: defaultBindingUtils,
      assets: assetStore,
    })

    if (activeDoc && activeDoc.id === activeBoardId) {
      const docStore = (
        activeDoc.snapshot as { document?: { store?: Record<string, unknown> } } | undefined
      )?.document?.store
      if (docStore && Object.keys(docStore).length > 0) {
        try {
          loadSnapshot(nextStore, activeDoc.snapshot as unknown as Partial<TLEditorSnapshot>)
        } catch {
          // Start blank if snapshot payload is incompatible
        }
      }
    }
    return nextStore
  }, [activeBoardId, activeDoc, assetStore])

  const overrides: TLUiOverrides = React.useMemo(
    () => ({
      actions(_editor, actions) {
        return {
          ...actions,
          'insert-media': {
            ...actions['insert-media'],
            onSelect() {
              void pickAndInsertRef.current()
            },
          },
        }
      },
    }),
    [],
  )

  const components: TLComponents = React.useMemo(
    () => ({
      TopPanel: CanvasTopPanel,
    }),
    [],
  )

  const handleMount = React.useCallback(
    (editor: Editor) => {
      mountCleanupRef.current?.()
      mountCleanupRef.current = null

      editorRef.current = editor
      attachEditor(editor)

      const syncThemeAndLocale = () => {
        editor.user.updateUserPreferences({
          colorScheme: isDocumentDark() ? 'dark' : 'light',
          locale: 'zh-cn',
        })
      }
      syncThemeAndLocale()

      let observer: MutationObserver | null = null
      if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
        observer = new MutationObserver(syncThemeAndLocale)
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'data-theme'],
        })
      }

      editor.registerExternalContentHandler('files', async content => {
        const dropPoint = content.point
          ? editor.screenToPage({ x: content.point.x, y: content.point.y })
          : undefined

        const linkedPaths: string[] = []
        const importFiles: File[] = []
        for (const file of content.files) {
          const hostPath = resolveDroppedFilePath(file)
          if (hostPath && isImagePathCandidate(hostPath)) {
            linkedPaths.push(hostPath)
            continue
          }
          // A served browser page never exposes a disk path; hand the bytes to the
          // host, which stores them in its managed imports folder and returns a
          // real path we can link like any other local image.
          if (isDroppedImageFile(file)) {
            importFiles.push(file)
          }
        }

        if (linkedPaths.length > 0) {
          await insertLinkedRef.current(linkedPaths, dropPoint)
        }
        if (importFiles.length > 0) {
          await importDroppedRef.current(importFiles, dropPoint)
        }
        if (linkedPaths.length === 0 && importFiles.length === 0) {
          const first = content.files[0]
          if (first) blockedUploadRef.current(first)
        }
      })

      editor.registerExternalContentHandler('text', async content => {
        const localPaths = extractLocalPathsFromText(content.text)
        if (localPaths.length > 0) {
          const dropPoint = content.point
            ? editor.screenToPage({ x: content.point.x, y: content.point.y })
            : undefined
          await insertLinkedRef.current(localPaths, dropPoint)
          return
        }
        await defaultHandleExternalTextContent(editor, content)
      })

      const unlistenDoc = editor.store.listen(
        entry => {
          scheduleSave()
          const touchedAssets =
            Object.keys(entry.changes.added).length > 0 ||
            Object.keys(entry.changes.removed).length > 0
          if (touchedAssets) {
            syncLinkedImagesFromEditor()
          }
        },
        { scope: 'document', source: 'user' },
      )

      const unlistenSelection = editor.store.listen(
        () => {
          const selectedShapes = editor.getSelectedShapes()
          let brokenId: string | null = null
          if (selectedShapes.length === 1 && selectedShapes[0]?.type === 'image') {
            const imgShape = selectedShapes[0] as TLImageShape
            const assetId = imgShape.props.assetId
            if (assetId) {
              const asset = editor.getAsset(assetId)
              const meta = extractFolioLinkMeta(asset)
              if (meta && getLinkStatusRef.current(meta.linkId) === 'missing') {
                brokenId = assetId
              }
            }
          }
          setSelectedBrokenAssetId(brokenId)
        },
        { scope: 'session' },
      )

      // Check linked files on initial mount
      void checkAllLinks()

      const cleanup = () => {
        observer?.disconnect()
        unlistenDoc()
        unlistenSelection()
        if (editorRef.current === editor) {
          editorRef.current = null
          attachEditor(null)
        }
      }
      mountCleanupRef.current = cleanup
      return cleanup
    },
    [
      attachEditor,
      checkAllLinks,
      scheduleSave,
      setSelectedBrokenAssetId,
      syncLinkedImagesFromEditor,
    ],
  )

  const handleContainerDragOverCapture = (ev: React.DragEvent<HTMLDivElement>) => {
    if (ev.dataTransfer?.types?.includes(FOLIO_DRAG_MIME)) {
      ev.preventDefault()
      ev.dataTransfer.dropEffect = 'link'
    }
  }

  const handleContainerDropCapture = (ev: React.DragEvent<HTMLDivElement>) => {
    const raw = ev.dataTransfer?.getData(FOLIO_DRAG_MIME)
    if (!raw) return
    const payload = decodeFolioDragPayload(raw)
    if (!payload) return
    const imagePaths = payload.paths.filter(isImagePathCandidate)
    if (imagePaths.length === 0) return

    ev.preventDefault()
    ev.stopPropagation()
    const editor = editorRef.current
    const dropPoint = editor ? editor.screenToPage({ x: ev.clientX, y: ev.clientY }) : undefined
    void insertLinkedImages(imagePaths, dropPoint)
  }

  const handleContainerKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== 'Escape') return
    if (pickerRequest) return

    if (relinkPanelOpen) {
      ev.preventDefault()
      setRelinkPanelOpen(false)
      return
    }

    const editor = editorRef.current
    if (!editor) return
    const hasActiveTool = editor.getCurrentToolId() !== 'select'
    const hasSelection = editor.getSelectedShapeIds().length > 0
    const isEditing = editor.getEditingShapeId() !== null
    const hasOpenMenu =
      typeof document !== 'undefined' &&
      document.querySelector('[data-lf-canvas-stage] .tlui-menu, [data-lf-canvas-stage] [data-state="open"]') !== null

    if (hasActiveTool || hasSelection || isEditing || hasOpenMenu) {
      ev.preventDefault()
    }
  }

  return (
    <div
      data-lf-canvas-stage=""
      onDragOverCapture={handleContainerDragOverCapture}
      onDropCapture={handleContainerDropCapture}
      onKeyDown={handleContainerKeyDown}
      className="relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-background"
    >
      <style data-lf-canvas-tldraw-css="">{`${tldrawCss}\n${CANVAS_SCOPE_CSS}`}</style>

      {docLoading || !activeDoc || activeDoc.id !== activeBoardId ? (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          正在载入画板...
        </div>
      ) : (
        <Tldraw
          key={activeBoardId}
          store={store}
          assetUrls={assetUrls}
          overrides={overrides}
          components={components}
          onMount={handleMount}
        />
      )}

      <LinkedImagesPanel />
      <LocalImagePickerDialog />
    </div>
  )
}
