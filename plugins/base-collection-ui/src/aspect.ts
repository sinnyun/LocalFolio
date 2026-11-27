/**
 * Thumbnail aspect-ratio memory for the masonry (waterfall) and justified
 * (equal-height) layouts. Ratios are measured from the decoded thumbnail and
 * cached by URL: a tile keeps its final shape after the first paint and a
 * remount does not relayout again.
 */

const ASPECT_RATIOS = new Map<string, number>()

const MIN_ASPECT = 0.2
const MAX_ASPECT = 5

export function normalizeAspectRatio(
  width: number | null | undefined,
  height: number | null | undefined,
): number | null {
  if (!width || !height || width <= 0 || height <= 0) return null
  const ratio = width / height
  if (!Number.isFinite(ratio) || ratio < MIN_ASPECT || ratio > MAX_ASPECT) return null
  return ratio
}

export function readCachedAspectRatio(key: string | null | undefined): number | null {
  if (!key) return null
  return ASPECT_RATIOS.get(key) ?? null
}

/** Returns true only when the stored ratio actually moved. */
export function writeCachedAspectRatio(key: string, ratio: number): boolean {
  if (!Number.isFinite(ratio) || ratio < MIN_ASPECT || ratio > MAX_ASPECT) return false
  const prev = ASPECT_RATIOS.get(key)
  if (prev !== undefined && Math.abs(prev - ratio) < 0.01) return false
  ASPECT_RATIOS.set(key, ratio)
  return true
}

export function clearCachedAspectRatios(): void {
  ASPECT_RATIOS.clear()
}
