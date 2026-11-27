# `@folio/feature-archive-host`

Standalone backup & archive feature host plugin powered by `zpaqfranz`.

## Decoupled Boundaries
- Collaborates with `@folio/workspace-projects-host` strictly through `@folio/base-contract` (`ctx.folioProjectsHost`), registering a `ProjectFileResolver` for transparent on-demand single-file extraction (`projects.file.open`, `projects.file.reveal`, and `/lf/projects/media`).
- Stores managed binaries (preferring `zpaqfranz-full.exe` for built-in WinFsp mount support) under `%LOCALAPPDATA%\LocalFolio\plugins\feature-archive-host\data\tools\zpaqfranz\` and temporary extracted files under `cache\extracted\` with automatic LRU eviction.
- All new archives use `zpaqfranz backup -chunk <N>GB` (default 8GB, requires `zpaqfranz >= 65.11`) with cross-volume deduplication and `.tmp` crash safety, while keeping legacy single-file `.zpaq` archives readable and append-compatible.
- Supports configurable Zstd compression levels (`default` / `-m9` / `-m7`), sequential HDD extraction (`xx`), damaged archive recovery (`x -recover`), and read-only virtual drive mounting (`mount` / `mount -all`) with automatic unmount on plugin dispose.

## RPC Actions
- `archive.projects.packBatch` — queues selected unarchived projects in order on the serial archive queue. Each project has its own progress, verification result, and task status.
- `archive.project.rebuildThumbs` — rebuilds missing thumbnails for selected files on the serial archive queue, extracting and releasing one temporary source at a time. Stores previews in the project thumbnail cache and reports per-file outcomes in task progress.
- `archive.tool.status` / `archive.tool.download` / `archive.tool.pickLocal` / `archive.tool.revealDir`
- `archive.settings.update` / `archive.cache.clear`
- `archive.project.pack` / `archive.project.append` / `archive.project.verify` / `archive.project.restore` (supports `restore_and_remove_archive`, `extract_all_keep_archive`, `recover_keep_archive`)
- `archive.project.mount` / `archive.project.unmount`
- `archive.file.extractInPlace` / `archive.file.extractTo` / `archive.project.exportArchive`
