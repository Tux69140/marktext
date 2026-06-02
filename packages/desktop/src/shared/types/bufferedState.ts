// Buffered editor state (persisted across window close/reopen).
//
// Refined when Commit 7 rewrites the editor + bufferedState stores.

import type { IFileState } from './files'

export interface BufferedEditorState {
  tabs: IFileState[]
  currentFileId?: string
  [key: string]: unknown
}

export interface BufferedProjectState {
  [key: string]: unknown
}

export interface BufferedLayoutState {
  [key: string]: unknown
}

export interface BufferedState {
  tabs?: BufferedEditorState['tabs']
  currentFileId?: BufferedEditorState['currentFileId']
  restoreWarnings?: unknown[]
  project?: BufferedProjectState
  layout?: BufferedLayoutState
  [key: string]: unknown
}
