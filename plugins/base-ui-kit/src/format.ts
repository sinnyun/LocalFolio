export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  const decimals = idx === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  const formatted = decimals === 0 ? String(Math.round(value)) : String(Number(value.toFixed(decimals)))
  return `${formatted} ${units[idx]}`
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return '—'
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  folder: '文件夹',
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
  design: '设计工程',
  code: '代码',
  archive: '压缩包',
  other: '其他',
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? '其他'
}
