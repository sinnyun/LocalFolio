# `@folio/feature-thumbs-eagle-host`

Optional feature plugin providing the **L3 manual-only Eagle local API** thumbnail completion channel.

## Safety & Isolation Guarantees
- Registers `eagle` into `ctx.folioThumbs` with `manualOnly: true` and `queueType: 'eagle'` (concurrency = 1) — never invoked by automatic scans.
- **500ms Health Probe**: `GET http://127.0.0.1:41595/api/library/info`; if Eagle is closed, fails fast with an actionable message.
- **Dedicated Cache Library Isolation**: Automatically switches to `ThumbCache.library` before importing and switches back to the user's previous library in `finally`.
- **Dynamic Timeout & Cleanup**: `10s + 5s per 100MB` polling window, mandatory `decodeURIComponent()` on thumbnail paths, and `POST /api/item/moveToTrash` in `finally`.
- **Space Circuit-Breaker**: Tracks cumulative imported bytes and surfaces a warning at 5GB with a one-click cache library reset action (`thumbs.eagle.cache.reset`).

## Actions
- `thumbs.eagle.status` — probes Eagle service health and space circuit-breaker state.
- `thumbs.eagle.settings.update` — configures API URL, cache library path, and space threshold.
- `thumbs.eagle.project.inspect` — counts existing project thumbnails, groups local generation misses by extension, and reports untested files, unavailable originals, and Eagle failures.
- `thumbs.eagle.generate` — enqueues a serial `folioTasks` batch job to complete selected files via Eagle.
- `thumbs.eagle.cache.reset` — rebuilds the dedicated `ThumbCache.library` when idle.
