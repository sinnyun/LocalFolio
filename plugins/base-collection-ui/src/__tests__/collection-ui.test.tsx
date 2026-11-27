// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FolioUiHost } from '@folio/base-ui-kit/client'
import {
  CollectionLightbox,
  GroupedVirtualGrid,
  LocalFilePickerDialog,
  apply,
  compareNaturalName,
  filterAndSortGroups,
  filterAndSortItems,
  filterItems,
  name,
  sortByNaturalName,
  useLightboxState,
  useVirtualList,
  type LocalPickerDirResult,
  type LocalPickerRoots,
} from '../client.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

interface SampleItem {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly isDir?: boolean
}

interface SampleGroup {
  readonly key: string
  readonly title: string
  readonly items: readonly SampleItem[]
}

describe('@folio/base-collection-ui', () => {
  describe('plugin metadata', () => {
    it('exports plugin name and no-op apply', () => {
      expect(name).toBe('base-collection-ui')
      expect(() => apply({} as never)).not.toThrow()
    })
  })

  describe('filter-sort helpers', () => {
    it('compares natural names and filters/sorts generic items and groups', () => {
      expect(compareNaturalName('shot-2.png', 'shot-10.png')).toBeLessThan(0)

      const items: SampleItem[] = [
        { id: '1', name: 'img-10.png', category: 'image' },
        { id: '2', name: 'img-2.png', category: 'image' },
        { id: '3', name: 'notes.txt', category: 'document' },
        { id: '4', name: 'Assets', category: 'folder', isDir: true },
      ]

      expect(filterItems(items, { query: 'img', getName: i => i.name }).map(i => i.id)).toEqual(['1', '2'])
      expect(
        sortByNaturalName(items, {
          getName: i => i.name,
          isFolder: i => Boolean(i.isDir),
          foldersFirst: true,
        }).map(i => i.name),
      ).toEqual(['Assets', 'img-2.png', 'img-10.png', 'notes.txt'])

      expect(
        filterAndSortItems(items, {
          category: 'image',
          getCategory: i => i.category,
          getName: i => i.name,
        }).map(i => i.name),
      ).toEqual(['img-2.png', 'img-10.png'])

      const groups: SampleGroup[] = [
        { key: 'g1', title: 'G1', items },
        { key: 'g2', title: 'G2', items: [{ id: '5', name: 'readme.md', category: 'document' }] },
      ]

      const filteredGroups = filterAndSortGroups(groups, {
        getItems: g => g.items,
        withItems: (g, next) => ({ ...g, items: next }),
        itemOptions: {
          category: 'image',
          getCategory: i => i.category,
          getName: i => i.name,
        },
      })
      expect(filteredGroups).toHaveLength(1)
      expect(filteredGroups[0]!.items.map(i => i.name)).toEqual(['img-2.png', 'img-10.png'])
    })
  })

  describe('useVirtualList', () => {
    it('virtualizes large lists and updates visible items on scroll', () => {
      function ListHarness() {
        const { containerRef, totalHeight, visibleItems } = useVirtualList({
          count: 100,
          itemHeight: 50,
          overscan: 1,
          fallbackViewportHeight: 200,
        })
        return (
          <div ref={containerRef} data-testid="list-scroller" style={{ height: 200, overflowY: 'auto' }}>
            <div style={{ height: totalHeight, position: 'relative' }}>
              {visibleItems.map(item => (
                <div key={item.index} style={{ position: 'absolute', top: item.top, height: item.height }}>
                  row-{item.index}
                </div>
              ))}
            </div>
          </div>
        )
      }

      render(<ListHarness />)
      expect(screen.getByText('row-0')).toBeTruthy()
      expect(screen.queryByText('row-50')).toBeNull()

      const scroller = screen.getByTestId('list-scroller')
      act(() => {
        scroller.scrollTop = 2500
        fireEvent.scroll(scroller)
      })

      expect(screen.getByText('row-50')).toBeTruthy()
      expect(screen.queryByText('row-0')).toBeNull()
    })
  })

  describe('GroupedVirtualGrid', () => {
    it('supports group collapsing, sticky header on scroll, custom header actions, and virtualized scrolling', () => {
      const group1Items: SampleItem[] = Array.from({ length: 24 }, (_, idx) => ({
        id: `a-${idx}`,
        name: `alpha-${String(idx + 1).padStart(2, '0')}.png`,
        category: 'image',
      }))
      const group2Items: SampleItem[] = Array.from({ length: 24 }, (_, idx) => ({
        id: `b-${idx}`,
        name: `beta-${String(idx + 1).padStart(2, '0')}.png`,
        category: 'image',
      }))

      const groups: SampleGroup[] = [
        { key: 'alpha', title: 'Alpha 分组', items: group1Items },
        { key: 'beta', title: 'Beta 分组', items: group2Items },
      ]

      const onEnterDir = vi.fn()

      function GridHarness() {
        const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set())
        const toggle = (key: string) => {
          setCollapsed(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
          })
        }
        return (
          <div className="flex h-[400px] w-[960px] flex-col">
            <GroupedVirtualGrid<SampleGroup, SampleItem>
              groups={groups}
              getGroupKey={g => g.key}
              getGroupItems={g => g.items}
              getGroupTitle={g => g.title}
              getGroupMeta={g => `${g.items.length} 项`}
              getItemKey={item => item.id}
              collapsedKeys={collapsed}
              onToggleGroupCollapsed={toggle}
              minCardWidth={200}
              rowHeight={180}
              headerHeight={40}
              overscanPx={180}
              scrollContainerDataAttr="data-lf-test-scroller"
              renderHeaderActions={g => (
                <button type="button" onClick={() => onEnterDir(g.key)}>
                  进入 {g.key}
                </button>
              )}
              renderItem={item => <div data-testid={`card-${item.id}`}>{item.name}</div>}
            />
          </div>
        )
      }

      const { container } = render(<GridHarness />)

      // Initially alpha-01 is visible, beta-24 is far below viewport + overscan
      expect(screen.getByText('alpha-01.png')).toBeTruthy()
      expect(screen.queryByText('beta-24.png')).toBeNull()
      expect(container.querySelector('[data-lf-collection-sticky-header]')).toBeNull()

      // Custom header action works
      fireEvent.click(screen.getByRole('button', { name: '进入 alpha' }))
      expect(onEnterDir).toHaveBeenCalledWith('alpha')

      // Scroll down into Beta group -> sticky header switches to Beta 分组 and beta-24 renders
      const scroller = container.querySelector('[data-lf-test-scroller]') as HTMLDivElement
      act(() => {
        scroller.scrollTop = 1600
        fireEvent.scroll(scroller)
      })

      expect(screen.getByText('beta-24.png')).toBeTruthy()
      const sticky = container.querySelector('[data-lf-collection-sticky-header="beta"]')
      expect(sticky).toBeTruthy()

      // Toggle collapse via sticky header button hides beta items
      fireEvent.click(sticky!.querySelector('button[data-lf-collection-group-toggle="beta"]')!)
      expect(screen.queryByText('beta-24.png')).toBeNull()
    })

    it('renders loading skeleton and empty state', () => {
      const { rerender, container } = render(
        <GroupedVirtualGrid<SampleGroup, SampleItem>
          groups={[]}
          getGroupKey={g => g.key}
          getGroupItems={g => g.items}
          collapsedKeys={new Set()}
          onToggleGroupCollapsed={() => {}}
          minCardWidth={160}
          rowHeight={180}
          loading
          renderItem={i => <div>{i.name}</div>}
        />,
      )
      expect(container.querySelector('[data-lf-collection-skeleton]')).toBeTruthy()

      rerender(
        <GroupedVirtualGrid<SampleGroup, SampleItem>
          groups={[]}
          getGroupKey={g => g.key}
          getGroupItems={g => g.items}
          collapsedKeys={new Set()}
          onToggleGroupCollapsed={() => {}}
          minCardWidth={160}
          rowHeight={180}
          emptyTitle="空列表"
          emptyDescription="请更换条件"
          renderItem={i => <div>{i.name}</div>}
        />,
      )
      expect(screen.getByText('空列表')).toBeTruthy()
      expect(screen.getByText('请更换条件')).toBeTruthy()
    })
  })

  describe('CollectionLightbox & useLightboxState', () => {
    it('opens lightbox for target item, navigates next/prev, and closes', async () => {
      const photos = [
        { path: '/a.jpg', name: 'first.jpg' },
        { path: '/b.jpg', name: 'second.jpg' },
      ]

      function LightboxHarness() {
        const {
          lightbox,
          openLightboxForItem,
          setLightboxOpen,
          setLightboxIndex,
          closeLightbox,
        } = useLightboxState()

        return (
          <>
            <FolioUiHost />
            <button
              type="button"
              onClick={() =>
                openLightboxForItem(
                  photos,
                  photos[1]!,
                  item => ({ src: item.path, alt: item.name, caption: item.name }),
                  (a, b) => a.path === b.path,
                )
              }
            >
              打开第二张
            </button>
            <button type="button" onClick={closeLightbox}>
              外部关闭
            </button>
            <CollectionLightbox
              state={lightbox}
              onOpenChange={setLightboxOpen}
              onIndexChange={setLightboxIndex}
            />
          </>
        )
      }

      render(<LightboxHarness />)
      fireEvent.click(screen.getByRole('button', { name: '打开第二张' }))

      await waitFor(() => {
        expect(screen.getAllByText('second.jpg').length).toBeGreaterThanOrEqual(1)
      })

      fireEvent.click(screen.getByRole('button', { name: '上一张' }))
      await waitFor(() => {
        expect(screen.getAllByText('first.jpg').length).toBeGreaterThanOrEqual(1)
      })

      fireEvent.click(screen.getByRole('button', { name: '关闭' }))
      await waitFor(() => {
        expect(screen.queryByText('first.jpg')).toBeNull()
      })
    })
  })

  describe('LocalFilePickerDialog', () => {
    const rootsData: LocalPickerRoots = {
      quickFolders: [{ id: 'pics', name: '图片', path: 'D:\\Pictures', kind: 'pictures' }],
      drives: [{ name: 'D:', path: 'D:\\' }],
    }

    const dirMap: Record<string, LocalPickerDirResult> = {
      'D:\\Pictures': {
        path: 'D:\\Pictures',
        parentPath: 'D:\\',
        entries: [
          { name: 'Sub', path: 'D:\\Pictures\\Sub', isDir: true },
          { name: 'hero.png', path: 'D:\\Pictures\\hero.png', isDir: false, ext: '.png' },
          { name: 'logo.svg', path: 'D:\\Pictures\\logo.svg', isDir: false, ext: '.svg' },
        ],
      },
      'D:\\Pictures\\Sub': {
        path: 'D:\\Pictures\\Sub',
        parentPath: 'D:\\Pictures',
        entries: [
          { name: 'nested.jpg', path: 'D:\\Pictures\\Sub\\nested.jpg', isDir: false, ext: '.jpg' },
        ],
      },
    }

    const mockLoadDir = async (dir?: string): Promise<LocalPickerDirResult> => {
      const target = dir && dirMap[dir] ? dir : 'D:\\Pictures'
      return dirMap[target]!
    }

    it('supports multi-file selection, directory navigation, and confirm callback', async () => {
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      render(
        <>
          <FolioUiHost />
          <LocalFilePickerDialog
            open
            mode="multi-file"
            title="选择图片"
            description="支持多选"
            confirmLabel="确认选择"
            initialDir="D:\\Pictures"
            onClose={onClose}
            onConfirm={onConfirm}
            loadRoots={async () => rootsData}
            loadDir={mockLoadDir}
            buildThumbUrl={entry => `/thumb?p=${encodeURIComponent(entry.path)}`}
          />
        </>,
      )

      await waitFor(() => {
        expect(screen.getByText('hero.png')).toBeTruthy()
        expect(screen.getByText('logo.svg')).toBeTruthy()
      })

      fireEvent.click(screen.getByText('hero.png'))
      fireEvent.click(screen.getByText('logo.svg'))
      expect(screen.getByText('已选择 2 个文件')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: '确认选择' }))
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1)
        expect(onConfirm).toHaveBeenCalledWith(['D:\\Pictures\\hero.png', 'D:\\Pictures\\logo.svg'])
      })
    })

    it('supports single-file mode and folder mode', async () => {
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      const { rerender } = render(
        <>
          <FolioUiHost />
          <LocalFilePickerDialog
            open
            mode="single-file"
            title="重选图片"
            confirmLabel="确定"
            initialDir="D:\\Pictures"
            onClose={onClose}
            onConfirm={onConfirm}
            loadRoots={async () => rootsData}
            loadDir={mockLoadDir}
          />
        </>,
      )

      await waitFor(() => {
        expect(screen.getByText('hero.png')).toBeTruthy()
      })

      fireEvent.click(screen.getByText('hero.png'))
      fireEvent.click(screen.getByText('logo.svg'))
      expect(screen.getByText('已选择 1 个文件')).toBeTruthy()

      // Navigate into Sub folder in folder mode
      rerender(
        <>
          <FolioUiHost />
          <LocalFilePickerDialog
            open
            mode="folder"
            title="选择目录"
            confirmLabel="选定此目录"
            initialDir="D:\\Pictures"
            onClose={onClose}
            onConfirm={onConfirm}
            loadRoots={async () => rootsData}
            loadDir={mockLoadDir}
          />
        </>,
      )

      await waitFor(() => {
        expect(screen.getByText('Sub')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Sub'))
      await waitFor(() => {
        expect(screen.getByText('目标目录：D:\\Pictures\\Sub')).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: '选定此目录' }))
      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith(['D:\\Pictures\\Sub'])
      })
    })
  })
})
