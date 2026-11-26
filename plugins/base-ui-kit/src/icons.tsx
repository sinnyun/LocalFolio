import * as React from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  Layers,
  LayoutGrid,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'

export interface FolioIconProps {
  readonly size?: number
  readonly strokeWidth?: number
  readonly className?: string
  readonly style?: React.CSSProperties
}

function wrapLucide(Icon: LucideIcon): React.ComponentType<FolioIconProps> {
  return function FolioIcon({ size = 14, strokeWidth = 1.75, className, style }: FolioIconProps) {
    return (
      <Icon
        size={size}
        strokeWidth={strokeWidth}
        aria-hidden="true"
        focusable="false"
        className={className}
        style={{ display: 'inline-block', flex: 'none', verticalAlign: '-2px', ...style }}
      />
    )
  }
}

export const FolioIconLayers = wrapLucide(Layers)
export const FolioIconBack = wrapLucide(ChevronLeft)
export const FolioIconPanelLeft = wrapLucide(PanelLeft)
export const FolioIconPanelRight = wrapLucide(PanelRight)
export const FolioIconRefresh = wrapLucide(RefreshCw)
export const FolioIconClose = wrapLucide(X)
export const FolioIconPlugin = wrapLucide(Puzzle)
export const FolioIconSparkle = wrapLucide(Sparkles)
export const FolioIconData = wrapLucide(LayoutGrid)
export const FolioIconExternal = wrapLucide(ExternalLink)

export const FolioIconCheck = wrapLucide(Check)
export const FolioIconChevronDown = wrapLucide(ChevronDown)
export const FolioIconChevronRight = wrapLucide(ChevronRight)
export const FolioIconSearch = wrapLucide(Search)
export const FolioIconPlus = wrapLucide(Plus)
export const FolioIconTrash = wrapLucide(Trash2)
export const FolioIconSettings = wrapLucide(Settings)
export const FolioIconInfo = wrapLucide(Info)
export const FolioIconAlertTriangle = wrapLucide(AlertTriangle)
export const FolioIconMaximize = wrapLucide(Maximize2)
export const FolioIconMinimize = wrapLucide(Minimize2)
export const FolioIconMoreHorizontal = wrapLucide(MoreHorizontal)
