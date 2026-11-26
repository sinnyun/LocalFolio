/**
 * Scoped stylesheet for `@folio/base-ui-kit`.
 *
 * Rules:
 * - Zero global resets (`*`, `body`, bare tag selectors) so DSH host UI is untouched.
 * - Every selector is strictly prefixed with `.lf-`.
 * - Every visual color, radius, elevation, and font reads DSH `--dsw-*` tokens
 *   with safe fallbacks so light/dark theme switching works automatically.
 */
export const FOLIO_UI_STYLES = `
:root {
  --lf-bg: var(--dsw-alias-bg-base, #ffffff);
  --lf-surface: var(--dsw-alias-bg-base, #ffffff);
  --lf-surface-elevated: var(--dsw-alias-bg-base, #ffffff);
  --lf-hover: var(--dsw-alias-interactive-bg-hover-solid, #f1f3f5);
  --lf-active: var(--dsw-alias-button-ghost-active-fill, #e7eaee);
  --lf-border: var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14));
  --lf-border-strong: var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.22));
  --lf-fg: var(--dsw-alias-label-primary, #1b1b1c);
  --lf-fg-secondary: var(--dsw-alias-label-secondary, #61666b);
  --lf-fg-tertiary: var(--dsw-alias-label-tertiary, #81858c);
  --lf-fg-on-brand: var(--dsw-alias-label-primary-foreground, #ffffff);
  --lf-brand: var(--dsw-alias-brand-primary, #1b1b1c);
  --lf-danger: var(--dsw-alias-danger-primary, #d92d20);
  --lf-success: var(--dsw-alias-state-success-primary, #16a34a);
  --lf-radius-xs: var(--dsw-radius-xs, 6px);
  --lf-radius-md: var(--dsw-radius-md, 10px);
  --lf-shadow: var(--dsw-elevation-prominent, 0 12px 32px rgba(15, 23, 42, 0.18));
  --lf-font: var(--dsw-font-family, inherit);
  --lf-font-mono: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.lf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: var(--lf-font);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  border-radius: var(--lf-radius-xs);
  border: 1px solid transparent;
  cursor: pointer;
  outline: none;
  user-select: none;
  box-sizing: border-box;
  transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
}
.lf-btn:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lf-brand) 28%, transparent);
}
.lf-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.lf-btn[data-size="sm"] {
  height: 26px;
  padding: 0 9px;
  font-size: 12px;
}
.lf-btn[data-size="md"] {
  height: 30px;
  padding: 0 12px;
  font-size: 13px;
}
.lf-btn[data-size="icon"] {
  height: 26px;
  width: 26px;
  padding: 0;
  font-size: 12px;
}
.lf-btn[data-variant="primary"] {
  background: var(--lf-brand);
  color: var(--lf-fg-on-brand);
  border-color: var(--lf-brand);
}
.lf-btn[data-variant="primary"]:hover:not(:disabled) {
  opacity: 0.9;
}
.lf-btn[data-variant="outline"] {
  background: var(--lf-surface);
  color: var(--lf-fg);
  border-color: var(--lf-border);
}
.lf-btn[data-variant="outline"]:hover:not(:disabled) {
  background: var(--lf-hover);
}
.lf-btn[data-variant="ghost"] {
  background: transparent;
  color: var(--lf-fg);
  border-color: transparent;
}
.lf-btn[data-variant="ghost"]:hover:not(:disabled) {
  background: var(--lf-hover);
}
.lf-btn[data-variant="danger"] {
  background: var(--lf-danger);
  color: var(--lf-fg-on-brand);
  border-color: var(--lf-danger);
}
.lf-btn[data-variant="danger"]:hover:not(:disabled) {
  opacity: 0.9;
}
.lf-btn-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.lf-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  font-family: var(--lf-font);
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  border-radius: 999px;
  border: 1px solid var(--lf-border);
  box-sizing: border-box;
  white-space: nowrap;
}
.lf-tag[data-tone="neutral"] {
  color: var(--lf-fg-secondary);
  background: var(--lf-bg);
  border-color: var(--lf-border);
}
.lf-tag[data-tone="info"] {
  color: var(--lf-fg);
  background: var(--lf-hover);
  border-color: var(--lf-border);
}
.lf-tag[data-tone="success"] {
  color: var(--lf-success);
  background: color-mix(in srgb, var(--lf-success) 10%, transparent);
  border-color: color-mix(in srgb, var(--lf-success) 35%, transparent);
}
.lf-tag[data-tone="danger"] {
  color: var(--lf-danger);
  background: transparent;
  border-color: var(--lf-danger);
}

.lf-input,
.lf-textarea {
  width: 100%;
  font-family: var(--lf-font);
  font-size: 13px;
  color: var(--lf-fg);
  background: var(--lf-bg);
  border: 1px solid var(--lf-border);
  border-radius: var(--lf-radius-xs);
  outline: none;
  box-sizing: border-box;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.lf-input {
  height: 30px;
  padding: 0 9px;
}
.lf-input[data-size="sm"] {
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
}
.lf-textarea {
  min-height: 72px;
  padding: 7px 9px;
  line-height: 1.5;
  resize: vertical;
}
.lf-input:focus,
.lf-textarea:focus {
  border-color: var(--lf-brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lf-brand) 22%, transparent);
}
.lf-input:disabled,
.lf-textarea:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.lf-input::placeholder,
.lf-textarea::placeholder {
  color: var(--lf-fg-tertiary);
}

.lf-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 32px;
  height: 18px;
  padding: 2px;
  border-radius: 999px;
  border: 1px solid var(--lf-border);
  background: var(--lf-hover);
  cursor: pointer;
  outline: none;
  box-sizing: border-box;
  transition: background 140ms ease, border-color 140ms ease;
}
.lf-switch[data-state="checked"] {
  background: var(--lf-brand);
  border-color: var(--lf-brand);
}
.lf-switch:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lf-brand) 28%, transparent);
}
.lf-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.lf-switch-thumb {
  display: block;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--lf-bg);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transform: translateX(0);
  transition: transform 140ms ease;
}
.lf-switch[data-state="checked"] .lf-switch-thumb {
  transform: translateX(14px);
}

.lf-card {
  border-radius: var(--lf-radius-md);
  border: 1px solid var(--lf-border);
  background: var(--lf-surface);
  color: var(--lf-fg);
  padding: 16px;
  box-sizing: border-box;
}
.lf-separator {
  flex-shrink: 0;
  background: var(--lf-border);
}
.lf-separator[data-orientation="horizontal"] {
  height: 1px;
  width: 100%;
}
.lf-separator[data-orientation="vertical"] {
  width: 1px;
  height: 100%;
}

.lf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px 16px;
  text-align: center;
  color: var(--lf-fg-tertiary);
  font-size: 12px;
}
.lf-empty-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--lf-fg);
}

.lf-tabs-list {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: var(--lf-radius-xs);
  background: var(--lf-hover);
  border: 1px solid var(--lf-border);
}
.lf-tabs-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  font-family: var(--lf-font);
  font-size: 12px;
  font-weight: 500;
  color: var(--lf-fg-secondary);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  transition: background 120ms ease, color 120ms ease;
}
.lf-tabs-trigger[data-state="active"] {
  background: var(--lf-bg);
  color: var(--lf-fg);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.lf-tabs-trigger:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lf-brand) 28%, transparent);
}
.lf-tabs-content {
  margin-top: 10px;
  outline: none;
}

.lf-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(0, 0, 0, 0.42);
  pointer-events: auto;
}
.lf-dialog-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 910;
  width: min(460px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 18px;
  border-radius: var(--lf-radius-md);
  border: 1px solid var(--lf-border-strong);
  background: var(--lf-surface-elevated);
  color: var(--lf-fg);
  font-family: var(--lf-font);
  box-shadow: var(--lf-shadow);
  pointer-events: auto;
  box-sizing: border-box;
  outline: none;
}
.lf-dialog-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.lf-dialog-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--lf-fg);
}
.lf-dialog-description {
  margin: 0;
  font-size: 12px;
  color: var(--lf-fg-secondary);
  line-height: 1.5;
}
.lf-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.lf-dialog-close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
}

.lf-menu-content {
  z-index: 920;
  min-width: 168px;
  padding: 4px;
  border-radius: var(--lf-radius-xs);
  border: 1px solid var(--lf-border-strong);
  background: var(--lf-surface-elevated);
  color: var(--lf-fg);
  font-family: var(--lf-font);
  font-size: 12px;
  box-shadow: var(--lf-shadow);
  pointer-events: auto;
  box-sizing: border-box;
}
.lf-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  user-select: none;
}
.lf-menu-item[data-highlighted] {
  background: var(--lf-hover);
}
.lf-menu-item[data-disabled] {
  opacity: 0.45;
  pointer-events: none;
}
.lf-menu-item[data-destructive="true"] {
  color: var(--lf-danger);
}
.lf-menu-label {
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--lf-fg-tertiary);
}
.lf-menu-separator {
  height: 1px;
  margin: 4px -4px;
  background: var(--lf-border);
}

.lf-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 30px;
  min-width: 120px;
  padding: 0 9px;
  font-family: var(--lf-font);
  font-size: 12px;
  color: var(--lf-fg);
  background: var(--lf-bg);
  border: 1px solid var(--lf-border);
  border-radius: var(--lf-radius-xs);
  cursor: pointer;
  outline: none;
  box-sizing: border-box;
}
.lf-select-trigger:focus-visible {
  border-color: var(--lf-brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lf-brand) 22%, transparent);
}
.lf-select-content {
  z-index: 920;
  overflow: hidden;
  padding: 4px;
  border-radius: var(--lf-radius-xs);
  border: 1px solid var(--lf-border-strong);
  background: var(--lf-surface-elevated);
  color: var(--lf-fg);
  font-family: var(--lf-font);
  font-size: 12px;
  box-shadow: var(--lf-shadow);
  pointer-events: auto;
}
.lf-select-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 24px;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  user-select: none;
}
.lf-select-item[data-highlighted] {
  background: var(--lf-hover);
}
.lf-select-item-indicator {
  position: absolute;
  left: 6px;
  display: inline-flex;
  align-items: center;
}

.lf-tooltip-content {
  z-index: 930;
  padding: 4px 8px;
  border-radius: 5px;
  background: var(--lf-fg);
  color: var(--lf-bg);
  font-family: var(--lf-font);
  font-size: 11px;
  line-height: 1.4;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.lf-toaster {
  position: fixed;
  right: 16px;
  bottom: 36px;
  z-index: 950;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(340px, calc(100vw - 32px));
  pointer-events: none;
}
.lf-toast {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--lf-radius-xs);
  border: 1px solid var(--lf-border-strong);
  background: var(--lf-surface-elevated);
  color: var(--lf-fg);
  font-family: var(--lf-font);
  font-size: 12px;
  box-shadow: var(--lf-shadow);
  pointer-events: auto;
}
.lf-toast[data-tone="danger"] {
  border-color: var(--lf-danger);
}
.lf-toast[data-tone="success"] {
  border-color: var(--lf-success);
}
.lf-toast-title {
  font-weight: 600;
  line-height: 1.4;
}
.lf-toast-desc {
  margin-top: 2px;
  color: var(--lf-fg-secondary);
  line-height: 1.4;
}
`
