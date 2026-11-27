import type { Context } from '@deepseek-ai/cordis'

export const name = 'base-metadata-ui'

export function apply(_ctx: Context): void {}

export default { name, apply }

export {
  copyTextToClipboard,
  useCopyFeedback,
  type UseCopyFeedbackResult,
} from './clipboard.js'
export {
  StarRatingInput,
  type StarRatingInputProps,
} from './components/StarRatingInput.js'
export {
  TAG_COLOR_PALETTE,
  TagChipsEditor,
  StringTagChipsEditor,
  ColoredTagChipsEditor,
  type TagOption,
  type TagChipsEditorProps,
  type StringTagChipsEditorProps,
  type ColoredTagChipsEditorProps,
} from './components/TagChipsEditor.js'
export {
  AutoSaveNoteField,
  type AutoSaveNoteFieldProps,
} from './components/AutoSaveNoteField.js'
