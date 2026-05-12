# 注释笔记系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 HTML Visual Editor 添加注释笔记系统，支持文字批注、便签贴纸、段落侧栏笔记三种注释方式，支持 Markdown 编辑、IndexedDB 自动存储、HTML 嵌入导出和 JSON 导入导出。

**Architecture:** 新增 NoteManager 作为笔记数据核心（CRUD + 存储），三个渲染模块（Annotator、StickyNote、SideNote）各负责一种注释方式的 DOM 渲染与交互，共用 NoteEditor Markdown 编辑器组件。通过 Engine 集成到现有编辑器中，笔记模式与编辑模式独立共存。

**Tech Stack:** TypeScript, IndexedDB, Markdown 渲染（简单正则实现，不引入第三方库）

---

## Task 1: 笔记数据类型定义

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: 在 types.ts 末尾添加笔记相关类型**

```typescript
// 笔记基础类型
export interface NoteBase {
  id: string;
  type: 'annotation' | 'sticky' | 'sidenote';
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface AnnotationNote extends NoteBase {
  type: 'annotation';
  selector: string;
  textContent: string;
  startOffset: number;
  endOffset: number;
}

export interface StickyNoteData extends NoteBase {
  type: 'sticky';
  x: number;
  y: number;
  width: number;
  height: number;
  color: 'yellow' | 'green' | 'blue' | 'pink';
  minimized: boolean;
}

export interface SideNoteData extends NoteBase {
  type: 'sidenote';
  selector: string;
}

export type Note = AnnotationNote | StickyNoteData | SideNoteData;

export interface PageNotes {
  url: string;
  title: string;
  notes: Note[];
  savedAt: number;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/shared/types.ts
git commit -m "feat: 添加笔记系统数据类型定义"
```

---

## Task 2: Markdown 编辑器组件

**Files:**
- Create: `src/content/ui/NoteEditor.ts`

- [ ] **Step 1: 实现 Markdown 编辑器**

创建 `src/content/ui/NoteEditor.ts`：

```typescript
// 简单的 Markdown 渲染（不引入第三方库）
function renderMarkdown(md: string): string {
  let html = md
    // 转义 HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 代码块
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 标题
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // 粗体和斜体
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // 图片
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
    // 无序列表
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    // 有序列表
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // 段落
    .replace(/\n\n/g, '</p><p>')
    // 换行
    .replace(/\n/g, '<br>');

  // 包裹 li 标签
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/<\/ul><ul>/g, '');

  return `<p>${html}</p>`.replace('<p></p>', '');
}

export class NoteEditor {
  private container: HTMLDivElement;
  private textarea: HTMLTextAreaElement;
  private preview: HTMLDivElement;
  private editing = false;
  private onSaveCallbacks: Array<(content: string) => void> = [];
  private onCloseCallbacks: Array<() => void> = [];

  constructor() {
    this.container = document.createElement('div');
    this.container.setAttribute('data-editor-dialog', '');
    this.container.className = 'note-editor';

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'note-editor-input';
    this.textarea.placeholder = '输入 Markdown 内容...';

    this.preview = document.createElement('div');
    this.preview.className = 'note-editor-preview';

    this.container.appendChild(this.textarea);
    this.container.appendChild(this.preview);

    // 编辑时显示 textarea，失焦后显示预览
    this.textarea.addEventListener('focus', () => {
      this.editing = true;
      this.textarea.style.display = 'block';
      this.preview.style.display = 'none';
    });

    this.textarea.addEventListener('blur', () => {
      this.editing = false;
      this.updatePreview();
      if (this.textarea.value.trim()) {
        this.textarea.style.display = 'none';
        this.preview.style.display = 'block';
      }
    });

    // Ctrl+Enter 保存
    this.textarea.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.save();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.onCloseCallbacks.forEach((cb) => cb());
      }
    });

    // 自动扩展高度
    this.textarea.addEventListener('input', () => {
      this.textarea.style.height = 'auto';
      this.textarea.style.height = Math.max(60, this.textarea.scrollHeight) + 'px';
    });

    // 点击预览区进入编辑
    this.preview.addEventListener('click', () => {
      this.textarea.style.display = 'block';
      this.preview.style.display = 'none';
      this.textarea.focus();
    });
  }

  getElement(): HTMLDivElement { return this.container; }

  getValue(): string { return this.textarea.value; }

  setValue(content: string) {
    this.textarea.value = content;
    this.updatePreview();
    if (content.trim()) {
      this.textarea.style.display = 'none';
      this.preview.style.display = 'block';
    } else {
      this.textarea.style.display = 'block';
      this.preview.style.display = 'none';
    }
  }

  focus() {
    this.textarea.style.display = 'block';
    this.preview.style.display = 'none';
    this.textarea.focus();
  }

  onSave(callback: (content: string) => void) {
    this.onSaveCallbacks.push(callback);
  }

  onClose(callback: () => void) {
    this.onCloseCallbacks.push(callback);
  }

  private save() {
    const content = this.textarea.value;
    this.onSaveCallbacks.forEach((cb) => cb(content));
  }

  private updatePreview() {
    const md = this.textarea.value;
    if (md.trim()) {
      this.preview.innerHTML = renderMarkdown(md);
    } else {
      this.preview.innerHTML = '<span style="color:#aaa">点击编辑笔记...</span>';
    }
  }

  static getStyles(): string {
    return `
      .note-editor {
        width: 100%;
      }
      .note-editor-input {
        width: 100%;
        min-height: 60px;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: monospace;
        font-size: 13px;
        resize: vertical;
        box-sizing: border-box;
        line-height: 1.5;
      }
      .note-editor-input:focus {
        outline: none;
        border-color: #4285f4;
      }
      .note-editor-preview {
        padding: 8px;
        font-size: 13px;
        line-height: 1.6;
        cursor: pointer;
        min-height: 40px;
        border-radius: 4px;
      }
      .note-editor-preview:hover {
        background: rgba(0,0,0,0.03);
      }
      .note-editor-preview h2,
      .note-editor-preview h3,
      .note-editor-preview h4 {
        margin: 8px 0 4px;
      }
      .note-editor-preview code {
        background: #f0f0f0;
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 12px;
      }
      .note-editor-preview pre {
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 8px;
        border-radius: 4px;
        overflow-x: auto;
        font-size: 12px;
      }
      .note-editor-preview pre code {
        background: none;
        padding: 0;
      }
      .note-editor-preview a {
        color: #4285f4;
      }
      .note-editor-preview ul {
        padding-left: 20px;
        margin: 4px 0;
      }
      .note-editor-preview img {
        max-width: 100%;
        border-radius: 4px;
      }
    `;
  }
}

export { renderMarkdown };
```

- [ ] **Step 2: 提交**

```bash
git add src/content/ui/NoteEditor.ts
git commit -m "feat: 实现 Markdown 编辑器组件"
```

---

## Task 3: NoteManager — 笔记数据管理与存储

**Files:**
- Create: `src/content/editor/NoteManager.ts`

- [ ] **Step 1: 实现 NoteManager**

创建 `src/content/editor/NoteManager.ts`：

```typescript
import type { Note, PageNotes } from '../../shared/types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export class NoteManager {
  private notes: Note[] = [];
  private url: string;
  private title: string;
  private db: IDBDatabase | null = null;
  private saveTimer: number | null = null;
  private onChangeCallbacks: Array<(notes: Note[]) => void> = [];

  constructor() {
    this.url = location.href;
    this.title = document.title;
    this.initDB();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('html-visual-editor-notes', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('pages')) {
          db.createObjectStore('pages', { keyPath: 'url' });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.load().then(resolve);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async load(): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db!.transaction('pages', 'readonly');
      const store = tx.objectStore('pages');
      const request = store.get(this.url);
      request.onsuccess = () => {
        const data = request.result as PageNotes | undefined;
        if (data) {
          this.notes = data.notes;
          this.notifyChange();
        }
        // 检查页面中是否有嵌入的笔记
        this.importEmbeddedNotes();
        resolve();
      };
      request.onerror = () => resolve();
    });
  }

  private importEmbeddedNotes() {
    const scriptEl = document.querySelector('script[data-editor-notes]');
    if (!scriptEl) return;
    try {
      const data = JSON.parse(scriptEl.textContent || '{}') as PageNotes;
      if (data.notes && data.notes.length > 0) {
        this.mergeNotes(data.notes);
      }
    } catch {
      // 解析失败忽略
    }
  }

  private mergeNotes(incoming: Note[]) {
    let changed = false;
    for (const note of incoming) {
      const existing = this.notes.find((n) => n.id === note.id);
      if (!existing) {
        this.notes.push(note);
        changed = true;
      } else if (note.updatedAt > existing.updatedAt) {
        Object.assign(existing, note);
        changed = true;
      }
    }
    if (changed) {
      this.scheduleSave();
      this.notifyChange();
    }
  }

  addNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Note {
    const fullNote = {
      ...note,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as Note;
    this.notes.push(fullNote);
    this.scheduleSave();
    this.notifyChange();
    return fullNote;
  }

  updateNote(id: string, updates: Partial<Note>) {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;
    Object.assign(note, updates, { updatedAt: Date.now() });
    this.scheduleSave();
    this.notifyChange();
  }

  deleteNote(id: string) {
    this.notes = this.notes.filter((n) => n.id !== id);
    this.scheduleSave();
    this.notifyChange();
  }

  getNote(id: string): Note | undefined {
    return this.notes.find((n) => n.id === id);
  }

  getAllNotes(): Note[] {
    return [...this.notes];
  }

  getNotesByType(type: Note['type']): Note[] {
    return this.notes.filter((n) => n.type === type);
  }

  onChange(callback: (notes: Note[]) => void) {
    this.onChangeCallbacks.push(callback);
  }

  private notifyChange() {
    this.onChangeCallbacks.forEach((cb) => cb([...this.notes]));
  }

  private scheduleSave() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveToDB();
      this.saveTimer = null;
    }, 500);
  }

  private async saveToDB(): Promise<void> {
    if (!this.db) return;
    const data: PageNotes = {
      url: this.url,
      title: this.title,
      notes: this.notes,
      savedAt: Date.now(),
    };
    return new Promise((resolve) => {
      const tx = this.db!.transaction('pages', 'readwrite');
      const store = tx.objectStore('pages');
      store.put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  // 导出为 JSON 字符串
  exportJSON(): string {
    const data: PageNotes = {
      url: this.url,
      title: this.title,
      notes: this.notes,
      savedAt: Date.now(),
    };
    return JSON.stringify(data, null, 2);
  }

  // 从 JSON 字符串导入
  importJSON(json: string) {
    try {
      const data = JSON.parse(json) as PageNotes;
      if (data.notes) {
        this.mergeNotes(data.notes);
      }
    } catch {
      // 解析失败忽略
    }
  }

  // 生成嵌入到 HTML 的笔记标记
  generateEmbedHTML(): string {
    if (this.notes.length === 0) return '';

    const data: PageNotes = {
      url: this.url,
      title: this.title,
      notes: this.notes,
      savedAt: Date.now(),
    };

    // 笔记元数据 script 标签
    let html = `\n<script type="application/json" data-editor-notes>${JSON.stringify(data)}</script>\n`;

    // 笔记的可视化样式
    html += `<style data-editor-notes-style>
[data-editor-note] {
  border-left: 3px solid #4285f4;
  background: #f0f7ff;
  padding: 12px 16px;
  margin: 8px 0;
  border-radius: 0 4px 4px 0;
  font-size: 14px;
  line-height: 1.6;
}
[data-note-type="sticky"] {
  position: absolute;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  padding: 8px 12px;
  min-width: 200px;
  border-left: 3px solid #ffd54f;
  background: #fffde7;
}
mark[data-editor-note-ref] {
  background: rgba(255,213,79,0.4);
  padding: 1px 0;
  border-radius: 2px;
}
</style>\n`;

    return html;
  }

  destroy() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveToDB();
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/NoteManager.ts
git commit -m "feat: 实现笔记数据管理器（CRUD + IndexedDB + 导入导出）"
```

---

## Task 4: 文字批注模块

**Files:**
- Create: `src/content/editor/Annotator.ts`

- [ ] **Step 1: 实现文字批注**

创建 `src/content/editor/Annotator.ts`：

```typescript
import type { AnnotationNote } from '../../shared/types';
import { NoteManager } from './NoteManager';
import { NoteEditor, renderMarkdown } from '../ui/NoteEditor';

// 生成元素的唯一 CSS 路径
function getCSSPath(el: Node): string {
  if (el.nodeType === Node.TEXT_NODE) {
    return getCSSPath(el.parentElement!);
  }
  const element = el as HTMLElement;
  if (element.id) return `#${element.id}`;
  if (element === document.body) return 'body';

  const parent = element.parentElement;
  if (!parent) return element.tagName.toLowerCase();

  const siblings = Array.from(parent.children);
  const sameTag = siblings.filter((s) => s.tagName === element.tagName);
  const index = sameTag.indexOf(element);
  const nth = sameTag.length > 1 ? `:nth-of-type(${index + 1})` : '';
  return getCSSPath(parent) + ' > ' + element.tagName.toLowerCase() + nth;
}

export class Annotator {
  private highlights: Map<string, HTMLElement[]> = new Map();
  private bubbles: Map<string, HTMLDivElement> = new Map();
  private addBtn: HTMLDivElement;
  private active = false;

  constructor(
    private noteManager: NoteManager,
    private shadowRoot: ShadowRoot,
    private container: HTMLDivElement
  ) {
    // "添加批注"按钮（选中文字时弹出）
    this.addBtn = document.createElement('div');
    this.addBtn.setAttribute('data-editor-dialog', '');
    this.addBtn.style.cssText = `
      position: fixed; display: none; background: #4285f4; color: white;
      padding: 4px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;
      z-index: 2147483647; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      pointer-events: auto; user-select: none;
    `;
    this.addBtn.textContent = '+ 批注';
    this.addBtn.addEventListener('click', () => this.addAnnotationFromSelection());
    document.body.appendChild(this.addBtn);

    // 注入样式
    const style = document.createElement('style');
    style.textContent = `
      .annotation-bubble {
        position: fixed; right: 16px; width: 260px; background: white;
        border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        border-left: 3px solid #ffd54f; padding: 12px; z-index: 10;
        pointer-events: auto; max-height: 300px; overflow-y: auto;
        font-size: 13px;
      }
      .annotation-bubble-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 8px; font-size: 11px; color: #888;
      }
      .annotation-bubble-actions { display: flex; gap: 4px; }
      .annotation-bubble-actions button {
        background: none; border: none; cursor: pointer; font-size: 14px;
        color: #888; padding: 2px;
      }
      .annotation-bubble-actions button:hover { color: #333; }
      ${NoteEditor.getStyles()}
    `;
    this.shadowRoot.appendChild(style);

    document.addEventListener('selectionchange', this.handleSelectionChange);
  }

  activate() {
    this.active = true;
    this.renderAll();
  }

  deactivate() {
    this.active = false;
    this.addBtn.style.display = 'none';
    this.clearAll();
  }

  renderAll() {
    this.clearAll();
    const annotations = this.noteManager.getNotesByType('annotation') as AnnotationNote[];
    annotations.forEach((note) => this.renderAnnotation(note));
  }

  destroy() {
    this.deactivate();
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    this.addBtn.remove();
  }

  private handleSelectionChange = () => {
    if (!this.active) return;
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      this.addBtn.style.display = 'none';
      return;
    }
    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) {
      this.addBtn.style.display = 'none';
      return;
    }
    // 不在编辑器 UI 内
    const anchor = selection.anchorNode;
    if (anchor && (anchor as HTMLElement).closest?.('html-visual-editor')) return;

    const rect = range.getBoundingClientRect();
    this.addBtn.style.display = 'block';
    this.addBtn.style.left = (rect.left + rect.width / 2 - 30) + 'px';
    this.addBtn.style.top = (rect.bottom + 6) + 'px';
  };

  addAnnotationFromSelection() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const textContent = selection.toString().trim();
    if (!textContent) return;

    const selector = getCSSPath(range.startContainer);
    const note = this.noteManager.addNote({
      type: 'annotation',
      content: '',
      selector,
      textContent,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
    }) as AnnotationNote;

    this.addBtn.style.display = 'none';
    selection.removeAllRanges();
    this.renderAnnotation(note);
    // 自动打开编辑
    const bubble = this.bubbles.get(note.id);
    if (bubble) {
      const editor = bubble.querySelector('.note-editor-input') as HTMLTextAreaElement;
      if (editor) editor.focus();
    }
  }

  private renderAnnotation(note: AnnotationNote) {
    // 高亮原文
    this.applyHighlight(note);
    // 批注气泡
    this.createBubble(note);
  }

  private applyHighlight(note: AnnotationNote) {
    try {
      const el = document.querySelector(note.selector);
      if (!el) return;

      // 在文本节点中查找匹配的文字
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      const marks: HTMLElement[] = [];

      while ((node = walker.nextNode() as Text | null)) {
        if (node.textContent && node.textContent.includes(note.textContent)) {
          const mark = document.createElement('mark');
          mark.setAttribute('data-editor-note-ref', note.id);
          mark.setAttribute('data-editor-dialog', '');
          mark.style.cssText = 'background: rgba(255,213,79,0.4); padding: 1px 0; border-radius: 2px; cursor: pointer;';

          const idx = node.textContent.indexOf(note.textContent);
          const before = node.textContent.substring(0, idx);
          const matched = node.textContent.substring(idx, idx + note.textContent.length);
          const after = node.textContent.substring(idx + note.textContent.length);

          const parent = node.parentNode!;
          if (before) parent.insertBefore(document.createTextNode(before), node);
          mark.textContent = matched;
          parent.insertBefore(mark, node);
          if (after) parent.insertBefore(document.createTextNode(after), node);
          parent.removeChild(node);

          mark.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleBubble(note.id);
          });

          marks.push(mark);
          break;
        }
      }

      this.highlights.set(note.id, marks);
    } catch {
      // 元素不存在，忽略
    }
  }

  private createBubble(note: AnnotationNote) {
    const bubble = document.createElement('div');
    bubble.className = 'annotation-bubble';
    bubble.style.display = 'none';

    const header = document.createElement('div');
    header.className = 'annotation-bubble-header';

    const quoted = document.createElement('span');
    quoted.textContent = `"${note.textContent.substring(0, 30)}${note.textContent.length > 30 ? '...' : ''}"`;

    const actions = document.createElement('div');
    actions.className = 'annotation-bubble-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '&#10005;';
    deleteBtn.title = '删除批注';
    deleteBtn.addEventListener('click', () => {
      this.noteManager.deleteNote(note.id);
      this.removeAnnotation(note.id);
    });

    actions.appendChild(deleteBtn);
    header.appendChild(quoted);
    header.appendChild(actions);
    bubble.appendChild(header);

    const editor = new NoteEditor();
    editor.setValue(note.content);
    editor.onSave((content) => {
      this.noteManager.updateNote(note.id, { content });
    });
    bubble.appendChild(editor.getElement());

    this.container.appendChild(bubble);
    this.bubbles.set(note.id, bubble);

    // 定位到高亮文字右侧
    const marks = this.highlights.get(note.id);
    if (marks && marks.length > 0) {
      const rect = marks[0].getBoundingClientRect();
      bubble.style.top = rect.top + 'px';
    }
  }

  private toggleBubble(noteId: string) {
    const bubble = this.bubbles.get(noteId);
    if (!bubble) return;
    const visible = bubble.style.display !== 'none';
    bubble.style.display = visible ? 'none' : 'block';
  }

  private removeAnnotation(noteId: string) {
    // 移除高亮
    const marks = this.highlights.get(noteId);
    if (marks) {
      marks.forEach((mark) => {
        const text = document.createTextNode(mark.textContent || '');
        mark.parentNode?.replaceChild(text, mark);
      });
      this.highlights.delete(noteId);
    }
    // 移除气泡
    const bubble = this.bubbles.get(noteId);
    if (bubble) {
      bubble.remove();
      this.bubbles.delete(noteId);
    }
  }

  private clearAll() {
    this.highlights.forEach((_, id) => this.removeAnnotation(id));
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/Annotator.ts
git commit -m "feat: 实现文字批注模块（高亮 + 批注气泡）"
```

---

## Task 5: 便签贴纸模块

**Files:**
- Create: `src/content/editor/StickyNote.ts`

- [ ] **Step 1: 实现便签贴纸**

创建 `src/content/editor/StickyNote.ts`：

```typescript
import type { StickyNoteData } from '../../shared/types';
import { NoteManager } from './NoteManager';
import { NoteEditor } from '../ui/NoteEditor';

const STICKY_COLORS: Record<string, { bg: string; border: string }> = {
  yellow: { bg: '#fffde7', border: '#ffd54f' },
  green: { bg: '#e8f5e9', border: '#66bb6a' },
  blue: { bg: '#e3f2fd', border: '#42a5f5' },
  pink: { bg: '#fce4ec', border: '#ef5350' },
};

export class StickyNoteRenderer {
  private stickies: Map<string, HTMLDivElement> = new Map();
  private active = false;

  constructor(
    private noteManager: NoteManager,
    private shadowRoot: ShadowRoot,
    private container: HTMLDivElement
  ) {
    const style = document.createElement('style');
    style.textContent = `
      .sticky-note {
        position: fixed; min-width: 220px; min-height: 150px;
        border-radius: 4px; box-shadow: 0 3px 12px rgba(0,0,0,0.15);
        z-index: 15; pointer-events: auto; display: flex; flex-direction: column;
      }
      .sticky-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 10px; cursor: grab; user-select: none; border-radius: 4px 4px 0 0;
        font-size: 11px; color: #666;
      }
      .sticky-header-actions { display: flex; gap: 2px; }
      .sticky-header-actions button {
        background: none; border: none; cursor: pointer; font-size: 13px;
        color: #888; padding: 2px 4px; border-radius: 3px;
      }
      .sticky-header-actions button:hover { background: rgba(0,0,0,0.08); color: #333; }
      .sticky-body { flex: 1; padding: 0 10px 10px; overflow-y: auto; }
      .sticky-minimized {
        width: 36px !important; height: 36px !important; min-width: 36px !important;
        min-height: 36px !important; border-radius: 50% !important;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }
      .sticky-minimized .sticky-header, .sticky-minimized .sticky-body { display: none; }
      .sticky-color-picker {
        display: flex; gap: 4px; padding: 4px 0;
      }
      .sticky-color-dot {
        width: 16px; height: 16px; border-radius: 50%; cursor: pointer;
        border: 2px solid transparent;
      }
      .sticky-color-dot.active { border-color: #333; }
      .sticky-resize-handle {
        position: absolute; bottom: 0; right: 0; width: 16px; height: 16px;
        cursor: se-resize;
      }
      ${NoteEditor.getStyles()}
    `;
    this.shadowRoot.appendChild(style);
  }

  activate() {
    this.active = true;
    this.renderAll();
  }

  deactivate() {
    this.active = false;
    this.clearAll();
  }

  createSticky(x?: number, y?: number) {
    const note = this.noteManager.addNote({
      type: 'sticky',
      content: '',
      x: x ?? window.innerWidth / 2 - 110,
      y: y ?? window.innerHeight / 2 - 75,
      width: 260,
      height: 200,
      color: 'yellow',
      minimized: false,
    }) as StickyNoteData;
    this.renderSticky(note);
  }

  renderAll() {
    this.clearAll();
    const stickies = this.noteManager.getNotesByType('sticky') as StickyNoteData[];
    stickies.forEach((note) => this.renderSticky(note));
  }

  destroy() {
    this.deactivate();
  }

  private renderSticky(note: StickyNoteData) {
    const colors = STICKY_COLORS[note.color] || STICKY_COLORS.yellow;

    const el = document.createElement('div');
    el.className = note.minimized ? 'sticky-note sticky-minimized' : 'sticky-note';
    el.style.cssText = `left: ${note.x}px; top: ${note.y}px; width: ${note.width}px; height: ${note.height}px; background: ${colors.bg}; border-left: 3px solid ${colors.border};`;

    if (note.minimized) {
      el.textContent = '📝';
      el.addEventListener('click', () => {
        this.noteManager.updateNote(note.id, { minimized: false });
        this.stickies.get(note.id)?.remove();
        this.stickies.delete(note.id);
        const updated = this.noteManager.getNote(note.id) as StickyNoteData;
        if (updated) this.renderSticky(updated);
      });
    } else {
      // 标题栏
      const header = document.createElement('div');
      header.className = 'sticky-header';
      header.textContent = '便签';

      const actions = document.createElement('div');
      actions.className = 'sticky-header-actions';

      // 颜色选择
      const colorBtn = document.createElement('button');
      colorBtn.innerHTML = '&#9679;';
      colorBtn.title = '更换颜色';
      colorBtn.style.color = colors.border;
      colorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showColorPicker(note, el);
      });

      // 最小化
      const minBtn = document.createElement('button');
      minBtn.textContent = '−';
      minBtn.title = '最小化';
      minBtn.addEventListener('click', () => {
        this.noteManager.updateNote(note.id, { minimized: true });
        el.remove();
        this.stickies.delete(note.id);
        const updated = this.noteManager.getNote(note.id) as StickyNoteData;
        if (updated) this.renderSticky(updated);
      });

      // 删除
      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.title = '删除便签';
      delBtn.addEventListener('click', () => {
        this.noteManager.deleteNote(note.id);
        el.remove();
        this.stickies.delete(note.id);
      });

      actions.appendChild(colorBtn);
      actions.appendChild(minBtn);
      actions.appendChild(delBtn);
      header.appendChild(actions);
      el.appendChild(header);

      // 拖拽移动
      this.setupDrag(header, el, note);

      // 内容区
      const body = document.createElement('div');
      body.className = 'sticky-body';
      const editor = new NoteEditor();
      editor.setValue(note.content);
      editor.onSave((content) => {
        this.noteManager.updateNote(note.id, { content });
      });
      // 失焦时也保存
      editor.getElement().querySelector('textarea')?.addEventListener('blur', () => {
        this.noteManager.updateNote(note.id, { content: editor.getValue() });
      });
      body.appendChild(editor.getElement());
      el.appendChild(body);

      // 缩放手柄
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'sticky-resize-handle';
      this.setupResize(resizeHandle, el, note);
      el.appendChild(resizeHandle);
    }

    this.container.appendChild(el);
    this.stickies.set(note.id, el);
  }

  private setupDrag(handle: HTMLElement, el: HTMLDivElement, note: StickyNoteData) {
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = (startLeft + dx) + 'px';
      el.style.top = (startTop + dy) + 'px';
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this.noteManager.updateNote(note.id, {
        x: parseInt(el.style.left),
        y: parseInt(el.style.top),
      });
    };

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseInt(el.style.left);
      startTop = parseInt(el.style.top);
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }

  private setupResize(handle: HTMLElement, el: HTMLDivElement, note: StickyNoteData) {
    let startX = 0, startY = 0, startW = 0, startH = 0;

    const onMove = (e: PointerEvent) => {
      el.style.width = Math.max(180, startW + e.clientX - startX) + 'px';
      el.style.height = Math.max(100, startH + e.clientY - startY) + 'px';
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this.noteManager.updateNote(note.id, {
        width: parseInt(el.style.width),
        height: parseInt(el.style.height),
      });
    };

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startY = e.clientY;
      startW = el.offsetWidth;
      startH = el.offsetHeight;
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }

  private showColorPicker(note: StickyNoteData, el: HTMLDivElement) {
    // 如果已有 picker 则移除
    const existing = el.querySelector('.sticky-color-picker');
    if (existing) { existing.remove(); return; }

    const picker = document.createElement('div');
    picker.className = 'sticky-color-picker';
    (Object.keys(STICKY_COLORS) as Array<keyof typeof STICKY_COLORS>).forEach((color) => {
      const dot = document.createElement('div');
      dot.className = 'sticky-color-dot' + (color === note.color ? ' active' : '');
      dot.style.background = STICKY_COLORS[color].border;
      dot.addEventListener('click', () => {
        this.noteManager.updateNote(note.id, { color: color as StickyNoteData['color'] });
        el.remove();
        this.stickies.delete(note.id);
        const updated = this.noteManager.getNote(note.id) as StickyNoteData;
        if (updated) this.renderSticky(updated);
      });
      picker.appendChild(dot);
    });
    el.querySelector('.sticky-header')?.after(picker);
  }

  private clearAll() {
    this.stickies.forEach((el) => el.remove());
    this.stickies.clear();
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/StickyNote.ts
git commit -m "feat: 实现便签贴纸模块（拖拽、缩放、颜色、最小化）"
```

---

## Task 6: 段落侧栏笔记模块

**Files:**
- Create: `src/content/editor/SideNote.ts`

- [ ] **Step 1: 实现段落侧栏笔记**

创建 `src/content/editor/SideNote.ts`：

```typescript
import type { SideNoteData } from '../../shared/types';
import { NoteManager } from './NoteManager';
import { NoteEditor } from '../ui/NoteEditor';

// 获取 CSS 选择器路径
function getSelectorPath(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  if (el === document.body) return 'body';
  const parent = el.parentElement;
  if (!parent) return el.tagName.toLowerCase();
  const siblings = Array.from(parent.children);
  const sameTag = siblings.filter((s) => s.tagName === el.tagName);
  const index = sameTag.indexOf(el);
  const nth = sameTag.length > 1 ? `:nth-of-type(${index + 1})` : '';
  return getSelectorPath(parent) + ' > ' + el.tagName.toLowerCase() + nth;
}

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'LI', 'PRE', 'FIGCAPTION']);

export class SideNoteRenderer {
  private markers: Map<string, HTMLDivElement> = new Map();
  private noteAreas: Map<string, HTMLDivElement> = new Map();
  private plusIcons: HTMLDivElement[] = [];
  private active = false;
  private mouseMoveHandler: (e: MouseEvent) => void;

  constructor(
    private noteManager: NoteManager,
    private shadowRoot: ShadowRoot,
    private container: HTMLDivElement
  ) {
    const style = document.createElement('style');
    style.textContent = `
      .sidenote-plus {
        position: fixed; width: 22px; height: 22px; border-radius: 50%;
        background: #4285f4; color: white; display: none; align-items: center;
        justify-content: center; font-size: 14px; cursor: pointer;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2); pointer-events: auto;
        z-index: 15; user-select: none; line-height: 1;
      }
      .sidenote-marker {
        position: absolute; left: 0; top: 0; width: 3px;
        background: #4285f4; border-radius: 2px; pointer-events: none;
      }
      .sidenote-area {
        background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px;
        padding: 10px 14px; margin: 6px 0; pointer-events: auto;
      }
      .sidenote-area-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 6px; font-size: 11px; color: #888;
      }
      .sidenote-area-header button {
        background: none; border: none; cursor: pointer; font-size: 14px;
        color: #888; padding: 0 2px;
      }
      .sidenote-area-header button:hover { color: #333; }
      ${NoteEditor.getStyles()}
    `;
    this.shadowRoot.appendChild(style);

    // "+"图标
    this.mouseMoveHandler = (e: MouseEvent) => this.handleMouseMove(e);
  }

  activate() {
    this.active = true;
    document.addEventListener('mousemove', this.mouseMoveHandler);
    this.renderAll();
  }

  deactivate() {
    this.active = false;
    document.removeEventListener('mousemove', this.mouseMoveHandler);
    this.clearAll();
    this.hidePlusIcon();
  }

  renderAll() {
    this.clearAll();
    const sidenotes = this.noteManager.getNotesByType('sidenote') as SideNoteData[];
    sidenotes.forEach((note) => this.renderSideNote(note));
  }

  addSideNote(element: HTMLElement) {
    const selector = getSelectorPath(element);
    // 检查是否已有笔记
    const existing = (this.noteManager.getNotesByType('sidenote') as SideNoteData[])
      .find((n) => n.selector === selector);
    if (existing) {
      // 聚焦到已有笔记
      const area = this.noteAreas.get(existing.id);
      if (area) {
        const editor = area.querySelector('.note-editor-input') as HTMLTextAreaElement;
        if (editor) editor.focus();
      }
      return;
    }

    const note = this.noteManager.addNote({
      type: 'sidenote',
      content: '',
      selector,
    }) as SideNoteData;
    this.renderSideNote(note);
    // 自动聚焦
    const area = this.noteAreas.get(note.id);
    if (area) {
      const editor = area.querySelector('.note-editor-input') as HTMLTextAreaElement;
      if (editor) editor.focus();
    }
  }

  destroy() {
    this.deactivate();
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.active) return;
    const target = e.target as HTMLElement;
    if (target.closest('html-visual-editor') || target.closest('[data-editor-dialog]')) {
      this.hidePlusIcon();
      return;
    }
    if (!BLOCK_TAGS.has(target.tagName)) {
      this.hidePlusIcon();
      return;
    }

    this.showPlusIcon(target, e.clientY);
  }

  private showPlusIcon(el: HTMLElement, mouseY: number) {
    let plus = this.plusIcons[0];
    if (!plus) {
      plus = document.createElement('div');
      plus.className = 'sidenote-plus';
      plus.setAttribute('data-editor-dialog', '');
      plus.textContent = '+';
      this.container.appendChild(plus);
      this.plusIcons.push(plus);
    }

    const rect = el.getBoundingClientRect();
    plus.style.display = 'flex';
    plus.style.left = (rect.left - 30) + 'px';
    plus.style.top = (mouseY - 11) + 'px';

    // 移除旧的点击处理
    const newPlus = plus.cloneNode(true) as HTMLDivElement;
    plus.replaceWith(newPlus);
    this.plusIcons[0] = newPlus;

    newPlus.addEventListener('click', (e) => {
      e.stopPropagation();
      this.addSideNote(el);
      this.hidePlusIcon();
    });
  }

  private hidePlusIcon() {
    this.plusIcons.forEach((p) => { p.style.display = 'none'; });
  }

  private renderSideNote(note: SideNoteData) {
    try {
      const el = document.querySelector(note.selector) as HTMLElement;
      if (!el) return;

      // 蓝色标记条
      const marker = document.createElement('div');
      marker.className = 'sidenote-marker';
      marker.setAttribute('data-editor-dialog', '');
      const rect = el.getBoundingClientRect();
      marker.style.cssText = `position: absolute; left: ${el.offsetLeft - 8}px; top: ${el.offsetTop}px; height: ${rect.height}px;`;
      el.style.position = el.style.position || 'relative';
      el.parentElement?.appendChild(marker);
      this.markers.set(note.id, marker);

      // 笔记区域
      const area = document.createElement('div');
      area.className = 'sidenote-area';
      area.setAttribute('data-editor-dialog', '');

      const header = document.createElement('div');
      header.className = 'sidenote-area-header';
      header.innerHTML = '<span>段落笔记</span>';

      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.title = '删除笔记';
      delBtn.addEventListener('click', () => {
        this.noteManager.deleteNote(note.id);
        marker.remove();
        area.remove();
        this.markers.delete(note.id);
        this.noteAreas.delete(note.id);
      });
      header.appendChild(delBtn);
      area.appendChild(header);

      const editor = new NoteEditor();
      editor.setValue(note.content);
      editor.onSave((content) => {
        this.noteManager.updateNote(note.id, { content });
      });
      editor.getElement().querySelector('textarea')?.addEventListener('blur', () => {
        this.noteManager.updateNote(note.id, { content: editor.getValue() });
      });
      area.appendChild(editor.getElement());

      // 插入到段落后面
      el.insertAdjacentElement('afterend', area);
      this.noteAreas.set(note.id, area);
    } catch {
      // 元素不存在
    }
  }

  private clearAll() {
    this.markers.forEach((m) => m.remove());
    this.markers.clear();
    this.noteAreas.forEach((a) => a.remove());
    this.noteAreas.clear();
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/SideNote.ts
git commit -m "feat: 实现段落侧栏笔记模块（+图标、蓝色标记条、笔记区）"
```

---

## Task 7: 工具栏和右键菜单扩展

**Files:**
- Modify: `src/content/ui/Toolbar.ts`
- Modify: `src/content/ui/ContextMenu.ts`

- [ ] **Step 1: 修改 Toolbar — 添加笔记/便签按钮，导出改为下拉菜单**

在 `ToolbarAction` 类型中添加新 action：

```typescript
export type ToolbarAction =
  | 'undo' | 'redo'
  | 'insert' | 'export' | 'export-with-notes' | 'export-notes-json' | 'import-notes-json'
  | 'copy-html'
  | 'toggle-notes' | 'add-sticky'
  | 'exit';
```

修改 `toolbar.innerHTML`，在 `.toolbar-right` 中添加笔记按钮和导出下拉菜单。

将 toolbar-right 部分替换为：

```html
<div class="toolbar-right">
  <button data-action="toggle-notes" title="显示/隐藏笔记">&#128221; 笔记</button>
  <button data-action="add-sticky" title="添加便签">&#128204; 便签</button>
  <button data-action="insert" title="插入元素">+ 插入</button>
  <button data-action="copy-html" title="复制 HTML">复制</button>
  <div class="export-dropdown">
    <button class="export-trigger" title="导出">导出 &#9660;</button>
    <div class="export-menu">
      <button data-action="export">导出 HTML</button>
      <button data-action="export-with-notes">导出 HTML（含笔记）</button>
      <button data-action="export-notes-json">导出笔记 (JSON)</button>
      <button data-action="import-notes-json">导入笔记 (JSON)</button>
    </div>
  </div>
  <span class="toolbar-separator"></span>
  <button data-action="exit" class="exit-btn" title="退出编辑模式">退出</button>
</div>
```

添加下拉菜单样式：

```css
.export-dropdown { position: relative; }
.export-menu {
  display: none; position: absolute; top: 100%; right: 0;
  background: white; border: 1px solid #e0e0e0; border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1); min-width: 200px; z-index: 20;
  padding: 4px;
}
.export-dropdown:hover .export-menu,
.export-menu:hover { display: block; }
.export-menu button {
  display: block; width: 100%; text-align: left; padding: 8px 12px;
  white-space: nowrap;
}
.export-menu button:hover { background: #f0f0f0; }
.notes-active { background: #e8f0fe !important; border-color: #4285f4 !important; color: #4285f4 !important; }
```

添加方法更新笔记按钮状态：

```typescript
  updateNotesButton(active: boolean) {
    const btn = this.toolbar.querySelector('[data-action="toggle-notes"]') as HTMLButtonElement;
    if (btn) btn.classList.toggle('notes-active', active);
  }
```

- [ ] **Step 2: 修改 ContextMenu — 添加笔记菜单项**

在 `ContextAction` 类型中添加：

```typescript
export type ContextAction =
  | 'copy' | 'delete' | 'move-up' | 'move-down'
  | 'copy-html-element' | 'edit-text'
  | 'add-annotation' | 'add-sticky' | 'add-sidenote';
```

在 `MENU_ITEMS` 数组末尾添加分隔符概念（或直接追加）：

```typescript
  { label: '添加批注', action: 'add-annotation', icon: '&#9998;' },
  { label: '添加便签', action: 'add-sticky', icon: '&#128204;' },
  { label: '添加段落笔记', action: 'add-sidenote', icon: '&#128221;' },
```

- [ ] **Step 3: 提交**

```bash
git add src/content/ui/Toolbar.ts src/content/ui/ContextMenu.ts
git commit -m "feat: 工具栏添加笔记按钮和导出下拉菜单，右键菜单添加笔记选项"
```

---

## Task 8: Engine 集成笔记系统

**Files:**
- Modify: `src/content/editor/Engine.ts`

- [ ] **Step 1: 在 Engine 中集成 NoteManager 和三个渲染模块**

在 Engine 类中添加属性：

```typescript
  private noteManager: NoteManager;
  private annotator: Annotator;
  private stickyRenderer: StickyNoteRenderer;
  private sideNoteRenderer: SideNoteRenderer;
  private notesActive = false;
```

在 constructor 中初始化（在现有模块初始化之后）：

```typescript
    // 笔记系统
    this.noteManager = new NoteManager();
    this.annotator = new Annotator(this.noteManager, shadowRoot, container);
    this.stickyRenderer = new StickyNoteRenderer(this.noteManager, shadowRoot, container);
    this.sideNoteRenderer = new SideNoteRenderer(this.noteManager, shadowRoot, container);
```

在 destroy 中清理：

```typescript
    this.annotator.destroy();
    this.stickyRenderer.destroy();
    this.sideNoteRenderer.destroy();
    this.noteManager.destroy();
```

在 setupToolbarActions 的 switch 中添加：

```typescript
        case 'toggle-notes':
          this.notesActive = !this.notesActive;
          this.toolbar.updateNotesButton(this.notesActive);
          if (this.notesActive) {
            this.annotator.activate();
            this.stickyRenderer.activate();
            this.sideNoteRenderer.activate();
          } else {
            this.annotator.deactivate();
            this.stickyRenderer.deactivate();
            this.sideNoteRenderer.deactivate();
          }
          break;
        case 'add-sticky':
          if (!this.notesActive) {
            this.notesActive = true;
            this.toolbar.updateNotesButton(true);
            this.annotator.activate();
            this.stickyRenderer.activate();
            this.sideNoteRenderer.activate();
          }
          this.stickyRenderer.createSticky();
          break;
        case 'export-with-notes':
          // 通过消息通知 content/index.ts 导出含笔记的 HTML
          chrome.runtime.sendMessage({
            type: 'EXPORT_HTML',
            options: { includeStyles: true, includeResources: false, format: 'html' },
          });
          break;
        case 'export-notes-json': {
          const json = this.noteManager.exportJSON();
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = (document.title || 'page') + '-notes.json';
          a.click();
          URL.revokeObjectURL(url);
          break;
        }
        case 'import-notes-json': {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
              this.noteManager.importJSON(e.target!.result as string);
              if (this.notesActive) {
                this.annotator.renderAll();
                this.stickyRenderer.renderAll();
                this.sideNoteRenderer.renderAll();
              }
            };
            reader.readAsText(file);
          });
          input.click();
          break;
        }
```

在 setupContextMenuActions 的 switch 中添加：

```typescript
        case 'add-annotation':
          if (!this.notesActive) {
            this.notesActive = true;
            this.toolbar.updateNotesButton(true);
            this.annotator.activate();
            this.stickyRenderer.activate();
            this.sideNoteRenderer.activate();
          }
          this.annotator.addAnnotationFromSelection();
          break;
        case 'add-sticky':
          if (!this.notesActive) {
            this.notesActive = true;
            this.toolbar.updateNotesButton(true);
            this.annotator.activate();
            this.stickyRenderer.activate();
            this.sideNoteRenderer.activate();
          }
          this.stickyRenderer.createSticky();
          break;
        case 'add-sidenote':
          if (!this.notesActive) {
            this.notesActive = true;
            this.toolbar.updateNotesButton(true);
            this.annotator.activate();
            this.stickyRenderer.activate();
            this.sideNoteRenderer.activate();
          }
          this.sideNoteRenderer.addSideNote(target);
          break;
```

添加 import 语句：

```typescript
import { NoteManager } from './NoteManager';
import { Annotator } from './Annotator';
import { StickyNoteRenderer } from './StickyNote';
import { SideNoteRenderer } from './SideNote';
```

暴露 noteManager 给 content/index.ts 使用（用于含笔记导出）：

```typescript
  getNoteManager(): NoteManager { return this.noteManager; }
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/Engine.ts
git commit -m "feat: Engine 集成笔记系统（NoteManager + 三种注释 + 工具栏/右键菜单联动）"
```

---

## Task 9: 含笔记的 HTML 导出

**Files:**
- Modify: `src/content/index.ts`

- [ ] **Step 1: 修改 EXPORT_HTML 处理，支持含笔记导出**

在 EXPORT_HTML case 中，检查导出选项是否含笔记。由于当前 message 结构不方便区分，改为通过 Engine 的 noteManager 获取笔记数据，在导出 HTML 末尾追加笔记标记。

需要新增一个消息类型或直接在 content script 中判断。最简单的方式是添加一个新的消息类型 `EXPORT_HTML_WITH_NOTES`。

在 `src/shared/messages.ts` 中添加：

```typescript
  | { type: 'EXPORT_HTML_WITH_NOTES'; options: ExportOptions }
```

在 `src/content/index.ts` 中添加对应的 case：

```typescript
      case 'EXPORT_HTML_WITH_NOTES': {
        const savedMarginTop = document.body.style.marginTop;
        document.body.style.marginTop = '';
        const editorHost = document.querySelector('html-visual-editor');
        editorHost?.remove();
        const overlays = document.querySelectorAll('[style*="z-index: 2147483646"], [style*="z-index: 2147483645"]');
        const removedOverlays: Array<{ el: Element; parent: Node }> = [];
        overlays.forEach((el) => {
          if (el.parentNode) { removedOverlays.push({ el, parent: el.parentNode }); el.remove(); }
        });
        // 移除笔记相关的临时 DOM（sidenote-area, mark 等）
        const noteElements = document.querySelectorAll('[data-editor-dialog], [data-editor-note-ref]');
        const removedNoteEls: Array<{ el: Element; parent: Node; next: Node | null }> = [];
        noteElements.forEach((el) => {
          if (el.parentNode) {
            removedNoteEls.push({ el, parent: el.parentNode, next: el.nextSibling });
            el.remove();
          }
        });

        let html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

        // 追加笔记标记
        if (engine) {
          const notesHTML = engine.getNoteManager().generateEmbedHTML();
          html = html.replace('</body>', notesHTML + '</body>');
        }

        // 恢复所有 DOM
        removedNoteEls.forEach(({ el, parent, next }) => {
          if (next) parent.insertBefore(el, next);
          else parent.appendChild(el);
        });
        removedOverlays.forEach(({ el, parent }) => parent.appendChild(el));
        if (editorHost) document.documentElement.appendChild(editorHost);
        document.body.style.marginTop = savedMarginTop;

        sendResponse({ type: 'HTML_CONTENT', html, title: document.title });
        break;
      }
```

同时在 `src/background/index.ts` 中添加 EXPORT_HTML_WITH_NOTES 的处理（和 EXPORT_HTML 逻辑一样）。

然后修改 Engine.ts 中 `export-with-notes` 的 toolbar action，改为发送新消息类型：

```typescript
        case 'export-with-notes':
          chrome.runtime.sendMessage({
            type: 'EXPORT_HTML_WITH_NOTES',
            options: { includeStyles: true, includeResources: false, format: 'html' },
          });
          break;
```

- [ ] **Step 2: 提交**

```bash
git add src/shared/messages.ts src/content/index.ts src/background/index.ts src/content/editor/Engine.ts
git commit -m "feat: 支持含笔记的 HTML 导出"
```

---

## Task 10: 构建验证与测试

- [ ] **Step 1: 运行 TypeScript 类型检查和构建**

```bash
npm run build
```

预期：构建成功，无类型错误。

- [ ] **Step 2: 在 Chrome 中加载扩展测试**

测试清单：
- 打开测试页面，进入编辑模式
- 点击"笔记"按钮，激活笔记模式
- 选中文字 → 出现"+ 批注"按钮 → 点击添加批注 → 输入 Markdown → 保存
- 点击高亮文字 → 批注气泡展开/折叠
- 点击"便签"按钮 → 创建便签 → 拖拽/缩放/换色/最小化
- 悬停段落左侧 → 出现"+"图标 → 点击添加段落笔记
- 导出下拉菜单 → 导出 HTML（不含笔记） / 导出 HTML（含笔记） / 导出笔记 JSON
- 刷新页面 → 进入编辑模式 → 开启笔记 → 之前的笔记自动加载

- [ ] **Step 3: 修复发现的问题并提交**

```bash
git add -A
git commit -m "fix: 修复笔记系统测试中发现的问题"
```
