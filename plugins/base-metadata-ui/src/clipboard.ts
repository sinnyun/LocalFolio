import * as React from 'react'

/**
 * Copy plain text to the system clipboard.
 * Uses `navigator.clipboard.writeText` when available and falls back to an offscreen
 * textarea with `document.execCommand('copy')` when unavailable or rejected.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall back to execCommand below
    }
  }
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      return Boolean(document.execCommand?.('copy'))
    } catch {
      return false
    } finally {
      textarea.remove()
    }
  }
  return false
}

export interface UseCopyFeedbackResult {
  readonly copied: boolean
  readonly copy: (text: string) => Promise<boolean>
  readonly reset: () => void
}

/**
 * Manages transient copied feedback state after calling `copyTextToClipboard`.
 */
export function useCopyFeedback(resetMs = 1500): UseCopyFeedbackResult {
  const [copied, setCopied] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  React.useEffect(() => {
    return () => {
      clearTimer()
    }
  }, [clearTimer])

  const reset = React.useCallback(() => {
    clearTimer()
    setCopied(false)
  }, [clearTimer])

  const copy = React.useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await copyTextToClipboard(text)
      if (!ok) return false
      setCopied(true)
      clearTimer()
      if (resetMs > 0) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          setCopied(false)
        }, resetMs)
      }
      return true
    },
    [clearTimer, resetMs],
  )

  return { copied, copy, reset }
}
