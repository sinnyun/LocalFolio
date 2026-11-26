# `@folio/feature-archive-host`

Standalone backup & archive feature host plugin powered by `zpaqfranz`.

## Decoupled Boundaries
- Collaborates with `@folio/workspace-projects-host` strictly through `@folio/base-contract` (`ctx.folioProjectsHost`), registering a `ProjectFileResolver` for transparent on-demand single-file extraction (`projects.file.open`, `projects.file.reveal`, and `/lf/projects/media`).
- Stores managed binaries under `%LOCALAPPDATA%\LocalFolio\plugins\feature-archive-host\data\tools\zpaqfranz\` and temporary extracted files under `cache\extracted\` with automatic LRU eviction.

## RPC Actions
- `archive.tool.status` / `archive.tool.download` / `archive.tool.pickLocal` / `archive.tool.revealDir`
- `archive.settings.update` / `archive.cache.clear`
- `archive.project.pack` / `archive.project.verify` / `archive.project.restore`
- `archive.file.extractTo` / `archive.project.exportArchive`
