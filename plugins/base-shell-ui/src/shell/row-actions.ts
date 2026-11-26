/**
 * Shared look for plugin-contributed buttons inside a shell row.
 *
 * `CaptionBar` keeps its own bar-wide rules (its switcher buttons are plain
 * elements too); the in-overlay top bar only styles the action container, so a
 * `FolioButton` elsewhere in that row keeps its own appearance. Plugins render
 * bare `<button>` elements and get this for free, which is what lets
 * `@folio/base-frame-ui` contribute its panel toggles without importing any
 * shell internals.
 */
export const ROW_ACTION_STYLES = `
[data-lf-row-actions] button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #4b5057);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  cursor: default;
}
[data-lf-row-actions] button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-primary, #0f1115);
}
[data-lf-row-actions] button[aria-pressed='true'] {
  background: var(--dsw-alias-button-ghost-active-fill, rgba(0, 0, 0, 0.08));
  color: var(--dsw-alias-label-primary, #0f1115);
}
[data-lf-row-actions] button[data-lf-caption-icon-only] {
  width: 28px;
  padding: 0;
  justify-content: center;
}
[data-lf-row-actions] button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #2563eb);
  outline-offset: -2px;
}
:where(html[data-input-modality='pointer']) [data-lf-row-actions] button:focus-visible {
  outline-color: transparent;
}
`
