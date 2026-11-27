/**
 * Scoped stylesheet for the「我的插件」settings section.
 *
 * Rules follow `@folio/base-ui-kit`'s conventions:
 * - No global resets and no bare tag selectors, so the DSH settings shell is untouched.
 * - Every selector is prefixed with `.lf-mp-`, a tighter scope than the shared `.lf-*` sheet
 *   because this panel only ever renders inside DSH's settings dialog.
 * - Every colour, radius and font reads `--dsw-*` tokens with safe fallbacks, so light and
 *   dark themes follow the host automatically.
 */
export const MY_PLUGINS_STYLES = `
.lf-mp {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 2px 2px 14px;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-family: var(--dsw-font-family, inherit);
  font-size: 13px;
  line-height: 1.5;
}
.lf-mp *,
.lf-mp *::before,
.lf-mp *::after {
  box-sizing: border-box;
}

/* ── Header ─────────────────────────────────────────────── */
.lf-mp-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lf-mp-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.lf-mp-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.lf-mp-badge {
  padding: 1px 7px;
  border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--dsw-alias-label-secondary, #61666b);
}
.lf-mp-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #81858c);
}

/* ── Summary ────────────────────────────────────────────── */
.lf-mp-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(132px, 100%), 1fr));
  gap: 8px;
}
.lf-mp-stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 9px 12px;
  border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  border-radius: var(--dsw-radius-md, 10px);
  background: var(--dsw-alias-bg-layer-1, transparent);
}
.lf-mp-stat-value {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.lf-mp-stat-label {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #61666b);
}
.lf-mp-stat-hint {
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Toolbar ────────────────────────────────────────────── */
.lf-mp-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lf-mp-search-field {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  border-radius: var(--dsw-radius-xs, 6px);
  background: var(--dsw-alias-bg-base, transparent);
  color: var(--dsw-alias-label-tertiary, #81858c);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.lf-mp-search-field:focus-within {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #2563eb) 55%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary, #2563eb) 16%, transparent);
}
.lf-mp-search {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115);
  font: inherit;
  font-size: 12px;
}
.lf-mp-search::placeholder {
  color: var(--dsw-alias-label-tertiary, #81858c);
}
.lf-mp-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.lf-mp-filter {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #61666b);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.lf-mp-filter:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #0f1115);
}
.lf-mp-filter:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #2563eb);
  outline-offset: 1px;
}
.lf-mp-filter[data-active="true"] {
  background: var(--dsw-alias-button-ghost-active-fill, rgba(0, 0, 0, 0.08));
  border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.2));
  color: var(--dsw-alias-label-primary, #0f1115);
  font-weight: 600;
}
.lf-mp-filter[data-empty="true"] {
  opacity: 0.45;
}
.lf-mp-filter-count {
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, #81858c);
}
.lf-mp-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
}

/* ── Layer headers ──────────────────────────────────────── */
.lf-mp-layer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lf-mp-layer-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.lf-mp-layer-title {
  margin: 0;
  flex: none;
  font-size: 13px;
  font-weight: 600;
}
.lf-mp-layer-note {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lf-mp-link {
  flex: none;
  padding: 0;
  border: none;
  background: none;
  color: var(--dsw-alias-label-secondary, #61666b);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.lf-mp-link:hover {
  color: var(--dsw-alias-label-primary, #0f1115);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ── Category group ─────────────────────────────────────── */
.lf-mp-group {
  border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  border-radius: var(--dsw-radius-md, 10px);
  background: var(--dsw-alias-bg-layer-1, transparent);
  overflow: hidden;
}
.lf-mp-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease;
}
.lf-mp-group-head:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
}
.lf-mp-group-head:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #2563eb);
  outline-offset: -2px;
}
.lf-mp-group-head[data-static="true"] {
  cursor: default;
}
.lf-mp-group-head[data-static="true"]:hover {
  background: transparent;
}
.lf-mp-group-accent {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  flex: none;
}
.lf-mp-group-label {
  font-size: 12px;
  font-weight: 600;
}
.lf-mp-group-prefix,
.lf-mp-tile-id,
.lf-mp-chip[data-kind="service"] {
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.lf-mp-group-prefix {
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary, #81858c);
}
.lf-mp-group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover-solid, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}
.lf-mp-group-health {
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, #81858c);
  white-space: nowrap;
}
.lf-mp-group-chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary, #81858c);
  transition: transform 140ms ease;
}
.lf-mp-group[data-open="false"] .lf-mp-group-chevron {
  transform: rotate(-90deg);
}

/* ── Plugin tiles ───────────────────────────────────────── */
.lf-mp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(236px, 100%), 1fr));
  gap: 8px;
  margin: 0;
  padding: 2px 12px 12px;
  list-style: none;
}
.lf-mp-tile {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.1));
  border-radius: var(--dsw-radius-xs, 6px);
  background: var(--dsw-alias-bg-base, transparent);
}
.lf-mp-tile[data-enabled="false"] {
  border-style: dashed;
  background: transparent;
}
.lf-mp-tile-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.lf-mp-tile-name {
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lf-mp-tile-flags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  margin-left: auto;
}
.lf-mp-role {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  white-space: nowrap;
}
.lf-mp-tile-id {
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lf-mp-tile-desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin: 0;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary, #61666b);
}
.lf-mp-tile-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: auto;
  padding-top: 3px;
}
.lf-mp-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover-solid, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 10px;
  line-height: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lf-mp-chip[data-kind="dep"] {
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #81858c);
  padding: 0;
}

/* ── Empty / loading / error ────────────────────────────── */
.lf-mp-empty {
  padding: 0 12px 11px;
  font-size: 11.5px;
  color: var(--dsw-alias-label-tertiary, #81858c);
}
.lf-mp-error {
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-state-error-primary, #ec1313);
  border-radius: var(--dsw-radius-xs, 6px);
  font-size: 12px;
}
.lf-mp-loading {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #81858c);
}

/* ── Internal extensions ────────────────────────────────── */
.lf-mp-ext-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 2px 12px 12px;
  list-style: none;
}
.lf-mp-ext {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 10px;
  border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.1));
  border-radius: var(--dsw-radius-xs, 6px);
  background: var(--dsw-alias-bg-base, transparent);
}
.lf-mp-ext-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.lf-mp-ext-name {
  font-size: 12px;
  font-weight: 600;
}
.lf-mp-ext-desc {
  margin: 0;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary, #61666b);
}

/* ── Runtime namespaces footnote ────────────────────────── */
.lf-mp-ns {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding-top: 2px;
  border-top: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  overflow-wrap: anywhere;
}
.lf-mp-ns-code {
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
}
`
