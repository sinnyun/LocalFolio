# `@folio/base-thumbs-host`

Standalone base capability plugin providing `ctx.folioThumbs` (`FolioThumbsService`).

## Responsibilities
- Decouples **how thumbnails are rendered from source files** from **where workspaces store, name, and display them**.
- Runs all thumbnail generation inside a bounded `@folio/base-tasks-host` queue (`concurrency: 4`) so large media directories do not saturate disk I/O.
- Supports dynamic format expansion via `ctx.folioThumbs.registerProvider(provider)` so future plugins or updates can add custom extractors (e.g., `.blend`, `.fbx`, `.raw`, `.c4d`) without modifying any workspace plugin.

## Built-in Providers
1. `svg-direct` (priority 10): `.svg` (up to 2 MB direct pass-through)
2. `win-wic-image` (priority 20): `.png`, `.jpg`, `.jpeg`, `.jfif`, `.webp`, `.gif`, `.bmp`, `.ico`, `.avif`, `.tif`, `.tiff`, `.heic`, `.heif`
3. `win-shell-media` (priority 50): `.psd`, `.psb`, `.ai`, `.eps`, `.mp4`, `.m4v`, `.webm`, `.mov`, `.mkv`, `.avi`, `.wmv`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`

## Actions
- `thumbs.providers.list` — lists active thumbnail generator providers and supported extensions.
