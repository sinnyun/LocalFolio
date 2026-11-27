# `@folio/base-thumbs-host`

Standalone base capability plugin providing `ctx.folioThumbs` (`FolioThumbsService`).

## Responsibilities
- **L0 Persistent State Machine (`ThumbIndexStore`)**: Tracks `READY` / `MISSING` / `IGNORED` / `FAILED_EAGLE` per file fingerprint (`size_mtimeMs`) using built-in `node:sqlite` (with automatic `jsonStore` fallback) and central LRU disk cache (`cache/thumbs/`).
- **L0 Misc Blacklist**: Immediately marks plain text, configs, code, logs, temp files, and executables as `IGNORED` so they never enter the `MISSING` backlog.
- **Three Concurrency Lanes (via `@folio/base-tasks-host`)**:
  - `thumbs-fast` (concurrency 4): L1a WIC / SVG & L1b Windows Shell.
  - `thumbs-heavy` (concurrency 2): L2 ImageMagick 7 & FFmpeg.
  - `thumbs-eagle` (concurrency 1): Strictly serial L3 manual-only providers.
- **Try-First L1a/L1b + Heavy File Avoidance**: Removes static format whitelists so any Windows Shell-registered format (`.cdr`, `.blend`, `.max`, SageThumbs) works automatically with `SIIGBF_THUMBNAILONLY`, while bypassing `>200MB` `.psd/.psb/.tif/.tiff` to L2.
- **Hard `manualOnly` Isolation**: Automatic generation (`generate` / `generateAutoBatch`) never invokes `manualOnly: true` providers (such as L3 Eagle).

## Built-in Providers
1. `svg-direct` (priority 10, `fast`): `.svg` (`<= 2MB` direct pass-through)
2. `win-wic-image` (priority 20, `fast`): WIC image decode (`strictWicOnly: true`, avoids `>200MB` PSD/PSB/TIF)
3. `win-shell-media` (priority 30, `fast`): `*` catch-all via Windows Shell `IShellItemImageFactory` with `SIIGBF_THUMBNAILONLY`
4. `magick-design` (priority 60, `heavy`): ImageMagick 7 (`magick`, `[0]` layer + bundled `assets/sRGB.icc` + `-strip` -> `.webp`)
5. `ffmpeg-video` (priority 70, `heavy`): FFmpeg (`-ss` before `-i` -> `.webp`)

## Actions
- `thumbs.providers.list` — lists active providers, extensions, and ignored blacklist.
- `thumbs.status.query` — queries persisted L0 status for file paths.
- `thumbs.auto.batch` — runs automatic L0~L2 batch generation (never triggers `manualOnly`).
- `thumbs.manual.run` — runs a specified `manualOnly` provider on selected files.
- `thumbs.tools.status` / `thumbs.tools.config` — detects and configures L2 `magick` / `ffmpeg` paths.
- `thumbs.cache.stats` / `thumbs.cache.clear` — inspects or clears the L0 index and central cache.
