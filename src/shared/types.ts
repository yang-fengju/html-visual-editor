// 编辑器模式
export type EditorMode = 'browse' | 'edit';

// 编辑操作类型
export type ActionType =
  | 'text-change'
  | 'style-change'
  | 'element-move'
  | 'element-resize'
  | 'element-insert'
  | 'element-delete'
  | 'element-reorder'
  | 'attribute-change'
  | 'table-structure'
  | 'media-change'
  | 'form-change'
  | 'code-block-change';

// 历史记录项
export interface HistoryEntry {
  type: ActionType;
  target: string;
  before: string;
  after: string;
  timestamp: number;
}

// 导出选项
export interface ExportOptions {
  includeStyles: boolean;
  includeResources: boolean;
  format: 'html' | 'zip';
}

// 选中元素的信息
export interface SelectedElementInfo {
  tagName: string;
  id: string;
  classes: string[];
  computedStyle: Partial<CSSStyleDeclaration>;
  rect: DOMRect;
  path: string;
}

// 插入元素的类型
export type InsertableElement =
  | 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3'
  | 'image' | 'link' | 'button' | 'divider'
  | 'ordered-list' | 'unordered-list'
  | 'table' | 'video' | 'audio'
  | 'form-input' | 'form-textarea' | 'form-select'
  | 'form-checkbox' | 'form-radio' | 'form-button'
  | 'code-block';

// 评论条目
export interface CommentEntry {
  id: string;
  content: string;
  createdAt: number;
}

// 统一评论（替代 annotation + sidenote）
export interface CommentNote {
  id: string;
  type: 'comment';
  anchor: 'text' | 'paragraph';
  selector: string;
  textContent?: string;
  startOffset?: number;
  endOffset?: number;
  entries: CommentEntry[];
  createdAt: number;
  updatedAt: number;
}

// 便签保留不变
export interface StickyNoteData {
  id: string;
  type: 'sticky';
  x: number;
  y: number;
  width: number;
  height: number;
  color: 'yellow' | 'green' | 'blue' | 'pink';
  minimized: boolean;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export type Note = CommentNote | StickyNoteData;

export interface PageNotes {
  url: string;
  title: string;
  notes: Note[];
  savedAt: number;
}
