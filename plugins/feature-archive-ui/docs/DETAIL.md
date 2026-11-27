# `@folio/feature-archive-ui`

Standalone UI feature plugin injecting archive management controls into `@folio/workspace-projects-ui` via `ctx.folioProjects`.

## Provided Contributions (`ProjectsUiExtension`)
- **Toolbar button & Settings Dialog**: Displays `zpaqfranz` installation & version status, one-click `zpaqfranz-full.exe` download into fixed managed directory, optional mirror prefix, manual local `.exe` import, fixed chunk size limit (`backup -chunk`, default 8GB), Zstd compression level (`default` / `-m9` / `-m7`), sequential HDD extraction (`xx`) toggle, source disposal policy, `.folio-meta` hidden toggle, and LRU cache cleanup.
- **Project Badges**: Shows `已归档` indicator on sidebar rows and workspace project headers.
- **Inspector Section**: Displays volume count / chunk size / compression metadata, archive compression savings, verification timestamp, pack / append / verify / multi-volume export / restore / bad-archive recovery (`-recover`), and read-only virtual drive mount (`mount` / `mount -all` / unmount) controls.
- **File Actions & Context Menus**: Adds 「提取此文件到…」, 「导出归档包…」, 「归档此项目」, 「校验完整性」, 「解包还原整个项目」 and temporary-copy open notifications.
