# `@folio/feature-thumbs-eagle-ui`

Client feature plugin extending Project Library (`@folio/workspace-projects-ui`) with the **Missing Thumbnails** backlog and manual L3 Eagle completion controls.

## Features
- **Extension-Grouped Backlog**: Groups `MISSING` files by extension (`.cdr`, `.c4d`, `.blend`, etc.) with counts and total byte sizes for one-click suffix selection.
- **Large-File Copy Confirmation**: Intercepts submissions containing any single file `> 500MB` or total size `> 2GB` with a one-click option to exclude oversized files.
- **Failed Circuit-Breaker Collapse**: Shows `FAILED_EAGLE` items in a separate collapsible list with manual retry buttons.
- **Space Warning & Cache Library Reset**: Displays Eagle online status and a one-click reset button when cumulative imports reach the configured threshold.
