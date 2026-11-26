# @folio/test-gallery-ui · 测试图片画廊 UI

形态 B（自绘全屏）的样板，测试界面（Test Surface）之一：工作区不接四区框架，直接渲染一整页瀑布流画廊，组件全部来自 `@folio/base-ui-kit`。它验证的是「基础组件够不够搭一个像样的页面」，而不是画廊本身有什么业务；最终会删除或并入真实工作区。

## 它验证什么

- 形态 B 的接入面比形态 A 更窄：`MainView` 写自己的组件，不注册 `FrameAppDefinition`，不碰窗口、工作区切换与悬浮面板。
- 瀑布流只用 CSS 多列实现，不引第三方 masonry 库。
- `Lightbox` 复合组件能独立工作：触发器、内容、缩略图导航、键盘、缩放与焦点归还。
- 所有弹层落在 `shell.overlay` 的受管 Portal 里，`document.body` 不被写入。
- 一个营销级页面需要多少 Tailwind 工具类与 `--dsw-*` 令牌，能否完全不动全局样式。

## 接入方式

`package.json` 只共享 `@folio/base-ui-kit`（`dsh.client.external`），`dsh.client.inject` 同时列出它和 `@folio/base-shell-ui` 以固定激活顺序。Cordis 侧只需要 `folioShell`：

```tsx
export const inject = ['folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const dispose = ctx.folioShell.registerWorkspace(galleryWorkspace)
    return () => {
      dispose()
    }
  }, 'test-gallery-ui: register workspace')
}
```

工作区是 `gallery-demo`，`order: 2`，`icon: FolioIconSparkle`，`MainView: ImageGalleryView`。`lib/client.js` 是真正的界面产物，`lib/index.js` 只是 Host 侧空壳。

## 实现要点

**筛选**：`Tabs` 受控（`value={filter}` + `onValueChange={handleChangeFilter}`），`isFilter` 把字符串收窄成 `'All' | 'Web' | ...` 联合类型，每个标签右侧显示 `countFor(f)` 的条数。`Print` 分类故意没有数据，用来验证 `Empty` 分支与「Show all work」回退按钮。

**瀑布流**：一个 `<ul>` 加 `columns-1 sm:columns-2 lg:columns-3` 与 `[&>*]:mb-4`，每个 `<li>` 带 `break-inside-avoid`；每张瓦片用 `aspect-[4/5]` 之类的类控制高宽比，于是列高参差但不会被拆页。没有 JS 计算列数。

**灯箱**：

```tsx
<Lightbox items={items} index={index} onIndexChange={setIndex}>
  <LightboxTrigger index={tileIndex} asChild>
    <button type="button" ref={node => { tileRefs.current[tileIndex] = node }}>
      {/* 瓦片 */}
    </button>
  </LightboxTrigger>
  <LightboxContent onCloseAutoFocus={event => { /* 焦点还给当前瓦片 */ }}>
    <LightboxThumbnails />
  </LightboxContent>
</Lightbox>
```

`Lightbox` 自己管开关与当前下标；`index` 受控、`onIndexChange` 把浏览位置同步回页面，筛选后下标归零。`onCloseAutoFocus` 里 `event.preventDefault()` 再把焦点交还 `tileRefs.current[index]`，避免关闭灯箱后焦点落回 `<body>`。`LightboxContent` 未套 `LightboxPortal` 时自带 Portal 与遮罩，容器来自 `usePortalContainer()`，也就是 `@folio/base-ui-kit` 挂的 `shell.overlay`。

**动画**：`ENTER` / `SWAP` 两组 `animate-in` 类，配合 `stagger(index)` 算 `animationDelay`；筛选后 `<ul key={filter}>` 重挂载重放动画，`hasFiltered` 决定首屏慢节奏还是切换快节奏。所有动效都带 `motion-reduce:animate-none` / `motion-reduce:transition-none`。

## 数据

没有任何 Host 依赖，也不发 RPC：8 条 `TILES` 与 3 张 `hirael.com` 远程图是 `src/client.tsx` 里的常量，筛选状态是 `ImageGalleryView` 内的 `React.useState`。图片直接外链，离线或防盗链时页面只剩瓦片底色与文案——样板有意不引入本地素材目录。

## 退场

删除本包与 `bundles/test-suite/cordis.patch.yml` 里的 `test-gallery-ui` 一行；`@folio/base-ui-kit` 的 `Lightbox` / `Tabs` / `Empty` 不因此改变。真实画廊工作区接手时，把 `TILES` 换成自己的数据源即可，接线部分（`registerWorkspace` + `MainView`）不用重写。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```
