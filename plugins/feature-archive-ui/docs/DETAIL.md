# `@folio/feature-archive-ui`

Standalone UI feature plugin injecting archive management controls into `@folio/workspace-projects-ui` via `ctx.folioProjects`.

## Provided Contributions (`ProjectsUiExtension`)
- **Toolbar button & Settings Dialog**: Displays `zpaqfranz` installation status, one-click GitHub Releases download into fixed managed directory, optional mirror prefix, manual local `.exe` import, source disposal policy, `.folio-meta` hidden toggle, and LRU cache cleanup.
- **Project Badges**: Shows `已归档` indicator on sidebar rows and workspace project headers.
- **Inspector Section**: Displays archive compression savings, verification timestamp, pack / verify / export archive / restore actions.
- **File Actions & Context Menus**: Adds 「提取此文件到…」, 「导出归档包…」, 「归档此项目」, 「校验完整性」, 「解包还原整个项目」 and temporary-copy open notifications.
