# 统一评论系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将文字批注和段落笔记合并为飞书风格的统一评论系统，支持内联卡片和抽屉面板两种展示模式，修复右键批注无反应的 bug。

**Architecture:** 删除 Annotator.ts 和 SideNote.ts，新建 CommentSystem.ts 统一处理选区检测、段落悬停、高亮渲染、评论卡片管理和面板模式。NoteManager 增加数据迁移逻辑和 entry 级操作方法。便签模块保留不变。

**Tech Stack:** TypeScript, Vite, @crxjs/vite-plugin (Chrome Extension)

**Build command:** `node build.mjs`

**Note:** 本项目无测试框架，验证通过 TypeScript 编译 + 构建通过。

---

### Task 1: 更新数据类型

**Files:**
- Modify: `src/shared/types.ts:55-95`

- [ ] **Step 1: 替换笔记类型定义**

将 `types.ts` 第 55-95 行的旧笔记类型替换为新的统一评论类型：

```typescript
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
```

删除的类型：`NoteBase`、`AnnotationNote`、`SideNoteData`。

- [ ] **Step 2: 验证编译**

Run: `cd /home/lm/yfj/html-visual-editor && npx tsc --noEmit 2>&1 | head -30`
Expected: 编译错误（引用旧类型的文件会报错，这是预期的，后续任务修复）

- [ ] **Step 3: 提交**

```bash
git add src/shared/types.ts
git commit -m "refactor: 替换笔记类型为统一评论模型 CommentNote"
```

---

### Task 2: 更新 NoteManager

**Files:**
- Modify: `src/content/editor/NoteManager.ts`

- [ ] **Step 1: 重写 NoteManager.ts**

完整替换 `src/content/editor/NoteManager.ts`：

```typescript
import type { Note, CommentNote, CommentEntry, PageNotes } from '../../shared/types';

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
      request.onsuccess = () => { this.db = request.result; this.load().then(resolve); };
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
          let needsMigration = false;
          this.notes = data.notes.map((n: any) => {
            const migrated = this.migrateNote(n);
            if (migrated !== n) needsMigration = true;
            return migrated;
          });
          if (needsMigration) this.scheduleSave();
          this.notifyChange();
        }
        this.importEmbeddedNotes();
        resolve();
      };
      request.onerror = () => resolve();
    });
  }

  // 旧格式迁移：annotation/sidenote → comment
  private migrateNote(note: any): Note {
    if (note.type === 'annotation') {
      return {
        id: note.id, type: 'comment', anchor: 'text' as const,
        selector: note.selector, textContent: note.textContent,
        startOffset: note.startOffset, endOffset: note.endOffset,
        entries: note.content ? [{ id: generateId(), content: note.content, createdAt: note.createdAt }] : [],
        createdAt: note.createdAt, updatedAt: note.updatedAt,
      };
    }
    if (note.type === 'sidenote') {
      return {
        id: note.id, type: 'comment', anchor: 'paragraph' as const,
        selector: note.selector,
        entries: note.content ? [{ id: generateId(), content: note.content, createdAt: note.createdAt }] : [],
        createdAt: note.createdAt, updatedAt: note.updatedAt,
      };
    }
    return note as Note;
  }

  private importEmbeddedNotes() {
    const scriptEl = document.querySelector('script[data-editor-notes]');
    if (!scriptEl) return;
    try {
      const data = JSON.parse(scriptEl.textContent || '{}') as any;
      if (data.notes?.length) {
        const migrated = data.notes.map((n: any) => this.migrateNote(n));
        this.mergeNotes(migrated);
      }
    } catch { /* 忽略 */ }
  }

  private mergeNotes(incoming: Note[]) {
    let changed = false;
    for (const note of incoming) {
      const existing = this.notes.find((n) => n.id === note.id);
      if (!existing) { this.notes.push(note); changed = true; }
      else if (note.updatedAt > existing.updatedAt) { Object.assign(existing, note); changed = true; }
    }
    if (changed) { this.scheduleSave(); this.notifyChange(); }
  }

  addComment(data: {
    anchor: 'text' | 'paragraph';
    selector: string;
    textContent?: string;
    startOffset?: number;
    endOffset?: number;
  }): CommentNote {
    const now = Date.now();
    const note: CommentNote = {
      id: generateId(), type: 'comment', anchor: data.anchor,
      selector: data.selector, textContent: data.textContent,
      startOffset: data.startOffset, endOffset: data.endOffset,
      entries: [{ id: generateId(), content: '', createdAt: now }],
      createdAt: now, updatedAt: now,
    };
    this.notes.push(note);
    this.scheduleSave();
    this.notifyChange();
    return note;
  }

  // 便签仍用通用 addNote
  addNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> & Record<string, unknown>): Note {
    const fullNote = { ...note, id: generateId(), createdAt: Date.now(), updatedAt: Date.now() } as Note;
    this.notes.push(fullNote);
    this.scheduleSave();
    this.notifyChange();
    return fullNote;
  }

  addEntry(noteId: string, content: string): CommentEntry | null {
    const note = this.notes.find(n => n.id === noteId);
    if (!note || note.type !== 'comment') return null;
    const entry: CommentEntry = { id: generateId(), content, createdAt: Date.now() };
    note.entries.push(entry);
    note.updatedAt = Date.now();
    this.scheduleSave();
    this.notifyChange();
    return entry;
  }

  updateEntry(noteId: string, entryId: string, content: string) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note || note.type !== 'comment') return;
    const entry = note.entries.find(e => e.id === entryId);
    if (!entry) return;
    entry.content = content;
    note.updatedAt = Date.now();
    this.scheduleSave();
    this.notifyChange();
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

  getNote(id: string): Note | undefined { return this.notes.find((n) => n.id === id); }
  getAllNotes(): Note[] { return [...this.notes]; }
  getNotesByType(type: Note['type']): Note[] { return this.notes.filter((n) => n.type === type); }

  onChange(callback: (notes: Note[]) => void) { this.onChangeCallbacks.push(callback); }
  private notifyChange() { this.onChangeCallbacks.forEach((cb) => cb([...this.notes])); }

  private scheduleSave() {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { this.saveToDB(); this.saveTimer = null; }, 500);
  }

  private async saveToDB(): Promise<void> {
    if (!this.db) return;
    const data: PageNotes = { url: this.url, title: this.title, notes: this.notes, savedAt: Date.now() };
    return new Promise((resolve) => {
      const tx = this.db!.transaction('pages', 'readwrite');
      tx.objectStore('pages').put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  exportJSON(): string {
    return JSON.stringify({ url: this.url, title: this.title, notes: this.notes, savedAt: Date.now() } as PageNotes, null, 2);
  }

  importJSON(json: string) {
    try {
      const data = JSON.parse(json) as any;
      if (data.notes) {
        const migrated = data.notes.map((n: any) => this.migrateNote(n));
        this.mergeNotes(migrated);
      }
    } catch { /* 忽略 */ }
  }

  generateEmbedHTML(): string {
    if (this.notes.length === 0) return '';
    const data: PageNotes = { url: this.url, title: this.title, notes: this.notes, savedAt: Date.now() };
    const jsonStr = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
    let html = `\n<script type="application/json" data-editor-notes>${jsonStr}</script>\n`;
    html += `<style data-editor-notes-style>
[data-editor-note]{border-left:3px solid #4285f4;background:#f0f7ff;padding:12px 16px;margin:8px 0;border-radius:0 4px 4px 0;font-size:14px;line-height:1.6}
[data-note-type="sticky"]{position:relative;border:1px solid #e0e0e0;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.1);padding:8px 12px;min-width:200px;border-left:3px solid #ffd54f;background:#fffde7;margin:8px 0}
[data-note-type="comment-text"]{border-left-color:#ffd54f}
mark[data-comment-ref]{background:rgba(255,213,79,0.4);padding:1px 0;border-radius:2px}
</style>\n`;
    for (const note of this.notes) {
      if (note.type === 'comment') {
        const typeLabel = note.anchor === 'text' ? '文字评论' : '段落评论';
        const noteType = note.anchor === 'text' ? 'comment-text' : 'comment-paragraph';
        let entriesHtml = '';
        for (const entry of note.entries) {
          const safe = entry.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
          const time = new Date(entry.createdAt).toLocaleString();
          entriesHtml += `<div style="margin:4px 0"><small style="color:#888">${time}</small><div>${safe}</div></div>`;
        }
        html += `<aside data-editor-note="${note.id}" data-note-type="${noteType}"><strong>${typeLabel}：</strong>${entriesHtml}</aside>\n`;
      } else if (note.type === 'sticky') {
        const safe = note.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        html += `<aside data-editor-note="${note.id}" data-note-type="sticky" data-color="${note.color}"><strong>便签：</strong>${safe}</aside>\n`;
      }
    }
    return html;
  }

  destroy() {
    if (this.saveTimer !== null) { clearTimeout(this.saveTimer); this.saveToDB(); }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/NoteManager.ts
git commit -m "refactor: NoteManager 适配统一评论模型，添加数据迁移和 entry 操作"
```

---

### Task 3: 更新 NoteEditor 支持自动保存

**Files:**
- Modify: `src/content/ui/NoteEditor.ts`

- [ ] **Step 1: 为 NoteEditor 添加自动保存**

在 NoteEditor 构造函数中修改 `input` 事件处理，添加防抖自动保存。修改 `Ctrl+Enter` 行为为折叠（blur）。修改 `blur` 事件触发保存回调。

完整替换 `src/content/ui/NoteEditor.ts`：

```typescript
function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      if (/^(https?:\/\/|data:image\/)/.test(url)) {
        return `<img src="${url}" alt="${alt}" style="max-width:100%">`;
      }
      return alt;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      if (/^(https?:\/\/|mailto:|#)/.test(url)) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      return text;
    })
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>').replace(/<\/ul><ul>/g, '');
  return `<p>${html}</p>`.replace('<p></p>', '');
}

export class NoteEditor {
  private container: HTMLDivElement;
  private textarea: HTMLTextAreaElement;
  private preview: HTMLDivElement;
  private onSaveCallbacks: Array<(content: string) => void> = [];
  private onCloseCallbacks: Array<() => void> = [];
  private autoSaveTimer: number | null = null;

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

    this.textarea.addEventListener('focus', () => {
      this.textarea.style.display = 'block';
      this.preview.style.display = 'none';
    });

    this.textarea.addEventListener('blur', () => {
      // 立即保存
      if (this.autoSaveTimer !== null) { clearTimeout(this.autoSaveTimer); this.autoSaveTimer = null; }
      this.onSaveCallbacks.forEach((cb) => cb(this.textarea.value));
      this.updatePreview();
      if (this.textarea.value.trim()) {
        this.textarea.style.display = 'none';
        this.preview.style.display = 'block';
      }
    });

    this.textarea.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.textarea.blur(); // 完成编辑并折叠
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.onCloseCallbacks.forEach((cb) => cb());
      }
    });

    this.textarea.addEventListener('input', () => {
      // 自动扩展高度
      this.textarea.style.height = 'auto';
      this.textarea.style.height = Math.max(60, this.textarea.scrollHeight) + 'px';
      // 防抖自动保存
      if (this.autoSaveTimer !== null) clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = window.setTimeout(() => {
        this.onSaveCallbacks.forEach((cb) => cb(this.textarea.value));
        this.autoSaveTimer = null;
      }, 500);
    });

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

  onSave(callback: (content: string) => void) { this.onSaveCallbacks.push(callback); }
  onClose(callback: () => void) { this.onCloseCallbacks.push(callback); }

  private updatePreview() {
    const md = this.textarea.value;
    this.preview.innerHTML = md.trim() ? renderMarkdown(md) : '<span style="color:#aaa">点击编辑笔记...</span>';
  }

  static getStyles(): string {
    return `
      .note-editor { width: 100%; }
      .note-editor-input {
        width: 100%; min-height: 60px; padding: 8px; border: 1px solid #ddd;
        border-radius: 4px; font-family: monospace; font-size: 13px;
        resize: vertical; box-sizing: border-box; line-height: 1.5;
      }
      .note-editor-input:focus { outline: none; border-color: #4285f4; }
      .note-editor-preview {
        padding: 8px; font-size: 13px; line-height: 1.6; cursor: pointer;
        min-height: 40px; border-radius: 4px;
      }
      .note-editor-preview:hover { background: rgba(0,0,0,0.03); }
      .note-editor-preview h2, .note-editor-preview h3, .note-editor-preview h4 { margin: 8px 0 4px; }
      .note-editor-preview code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
      .note-editor-preview pre { background: #1e1e1e; color: #d4d4d4; padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
      .note-editor-preview pre code { background: none; padding: 0; }
      .note-editor-preview a { color: #4285f4; }
      .note-editor-preview ul { padding-left: 20px; margin: 4px 0; }
      .note-editor-preview img { max-width: 100%; border-radius: 4px; }
    `;
  }
}

export { renderMarkdown };
```

- [ ] **Step 2: 提交**

```bash
git add src/content/ui/NoteEditor.ts
git commit -m "feat: NoteEditor 添加自动防抖保存，Ctrl+Enter 改为折叠"
```

---

### Task 4: 创建 CommentSystem

**Files:**
- Create: `src/content/editor/CommentSystem.ts`

- [ ] **Step 1: 创建 CommentSystem.ts**

创建 `src/content/editor/CommentSystem.ts`，这是统一评论系统的核心模块：

```typescript
import type { CommentNote } from '../../shared/types';
import { NoteManager } from './NoteManager';
import { renderMarkdown } from '../ui/NoteEditor';

function getCSSPath(el: Node): string {
  if (el.nodeType === Node.TEXT_NODE) return getCSSPath(el.parentElement!);
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

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

const BLOCK_TAGS = new Set(['P','H1','H2','H3','H4','H5','H6','DIV','SECTION','ARTICLE','BLOCKQUOTE','LI','PRE','FIGCAPTION']);

export class CommentSystem {
  private highlights: Map<string, HTMLElement[]> = new Map();
  private markers: Map<string, HTMLDivElement> = new Map();
  private cards: Map<string, HTMLDivElement> = new Map();
  private panel: HTMLDivElement | null = null;
  private panelMode = false;
  private commentBtn: HTMLDivElement;
  private plusIcon: HTMLDivElement | null = null;
  private plusTarget: HTMLElement | null = null;
  private active = false;
  private selectionHandler: () => void;
  private mouseMoveHandler: (e: MouseEvent) => void;
  private scrollHandler: () => void;
  private scrollThrottleId: number | null = null;

  constructor(
    private noteManager: NoteManager,
    private shadowRoot: ShadowRoot,
    private container: HTMLDivElement
  ) {
    this.commentBtn = document.createElement('div');
    this.commentBtn.setAttribute('data-editor-dialog', '');
    this.commentBtn.style.cssText = `position:fixed;display:none;background:#4285f4;color:white;padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer;z-index:2147483647;box-shadow:0 2px 8px rgba(0,0,0,0.2);pointer-events:auto;user-select:none;`;
    this.commentBtn.textContent = '+ 评论';
    this.commentBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    this.commentBtn.addEventListener('click', (e) => { e.stopPropagation(); this.addFromSelection(); });
    document.body.appendChild(this.commentBtn);

    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadowRoot.appendChild(style);

    this.selectionHandler = () => this.handleSelectionChange();
    this.mouseMoveHandler = (e: MouseEvent) => this.handleMouseMove(e);
    this.scrollHandler = () => this.handleScroll();
    document.addEventListener('selectionchange', this.selectionHandler);
  }

  activate() {
    this.active = true;
    document.addEventListener('mousemove', this.mouseMoveHandler);
    document.addEventListener('scroll', this.scrollHandler, true);
    this.renderAll();
  }

  deactivate() {
    this.active = false;
    this.commentBtn.style.display = 'none';
    document.removeEventListener('mousemove', this.mouseMoveHandler);
    document.removeEventListener('scroll', this.scrollHandler, true);
    this.hidePlusIcon();
    this.clearAll();
    if (this.panel) { this.panel.remove(); this.panel = null; }
    this.panelMode = false;
  }

  addFromContextMenu(target: HTMLElement) {
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      this.addFromSelection();
    } else {
      this.addParagraphComment(target);
    }
  }

  renderAll() {
    this.clearAll();
    const comments = this.noteManager.getNotesByType('comment') as CommentNote[];
    comments.forEach((note) => this.renderComment(note));
    this.repositionCards();
  }

  getCommentCount(): number {
    return this.noteManager.getNotesByType('comment').length;
  }

  isPanelMode(): boolean { return this.panelMode; }

  togglePanel() {
    this.panelMode = !this.panelMode;
    if (this.panelMode) this.showPanel();
    else this.hidePanel();
  }

  destroy() {
    this.deactivate();
    document.removeEventListener('selectionchange', this.selectionHandler);
    this.commentBtn.remove();
  }

  // --- 选区检测 ---

  private handleSelectionChange() {
    if (!this.active) return;
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      this.commentBtn.style.display = 'none';
      return;
    }
    const text = selection.toString().trim();
    if (!text) { this.commentBtn.style.display = 'none'; return; }
    const anchor = selection.anchorNode;
    if (anchor && (anchor as HTMLElement).closest?.('html-visual-editor')) return;
    if (anchor && (anchor as HTMLElement).closest?.('[data-editor-dialog]')) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    this.commentBtn.style.display = 'block';
    this.commentBtn.style.left = (rect.left + rect.width / 2 - 30) + 'px';
    this.commentBtn.style.top = (rect.bottom + 6) + 'px';
  }

  private addFromSelection() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const text = selection.toString().trim();
    if (!text) return;
    const range = selection.getRangeAt(0);
    const selector = getCSSPath(range.startContainer);
    const note = this.noteManager.addComment({
      anchor: 'text', selector, textContent: text,
      startOffset: range.startOffset, endOffset: range.endOffset,
    });
    this.commentBtn.style.display = 'none';
    selection.removeAllRanges();
    this.renderComment(note);
    this.repositionCards();
    this.focusNewEntry(note.id);
  }

  // --- 段落悬停 ---

  private handleMouseMove(e: MouseEvent) {
    if (!this.active) return;
    const target = e.target as HTMLElement;
    if (this.plusIcon && this.plusIcon.style.display === 'flex') {
      const px = parseFloat(this.plusIcon.style.left);
      const py = parseFloat(this.plusIcon.style.top);
      if (e.clientX >= px - 12 && e.clientX <= px + 34 &&
          e.clientY >= py - 12 && e.clientY <= py + 34) return;
    }
    if (target.closest('html-visual-editor') || target.closest('[data-editor-dialog]')) {
      this.hidePlusIcon(); return;
    }
    const blockTags = Array.from(BLOCK_TAGS).map(t => t.toLowerCase()).join(',');
    const block = target.closest(blockTags) as HTMLElement | null;
    if (!block) { this.hidePlusIcon(); return; }
    this.showPlusIcon(block);
  }

  private showPlusIcon(el: HTMLElement) {
    if (!this.plusIcon) {
      this.plusIcon = document.createElement('div');
      this.plusIcon.className = 'comment-plus';
      this.plusIcon.setAttribute('data-editor-dialog', '');
      this.plusIcon.textContent = '+';
      this.plusIcon.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      this.plusIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.plusTarget) { this.addParagraphComment(this.plusTarget); this.hidePlusIcon(); }
      });
      this.container.appendChild(this.plusIcon);
    }
    this.plusTarget = el;
    const rect = el.getBoundingClientRect();
    this.plusIcon.style.display = 'flex';
    this.plusIcon.style.left = (rect.left - 30) + 'px';
    this.plusIcon.style.top = (rect.top + rect.height / 2 - 11) + 'px';
  }

  private hidePlusIcon() { if (this.plusIcon) this.plusIcon.style.display = 'none'; }

  private addParagraphComment(el: HTMLElement) {
    const selector = getCSSPath(el);
    const existing = (this.noteManager.getNotesByType('comment') as CommentNote[])
      .find((n) => n.anchor === 'paragraph' && n.selector === selector);
    if (existing) { this.focusNewEntry(existing.id); return; }
    const note = this.noteManager.addComment({ anchor: 'paragraph', selector });
    this.renderComment(note);
    this.repositionCards();
    this.focusNewEntry(note.id);
  }

  // --- 渲染 ---

  private renderComment(note: CommentNote) {
    this.applyHighlight(note);
    this.createCard(note);
    if (this.panelMode) {
      const card = this.cards.get(note.id);
      if (card) card.style.display = 'none';
      this.refreshPanel();
    }
  }

  private applyHighlight(note: CommentNote) {
    if (note.anchor === 'text') {
      try {
        const el = document.querySelector(note.selector);
        if (!el || !note.textContent) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
          if (node.textContent && node.textContent.includes(note.textContent)) {
            const mark = document.createElement('mark');
            mark.setAttribute('data-comment-ref', note.id);
            mark.setAttribute('data-editor-dialog', '');
            mark.style.cssText = 'background:rgba(255,213,79,0.4);padding:1px 0;border-radius:2px;cursor:pointer;';
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
            mark.addEventListener('click', (e) => { e.stopPropagation(); this.focusComment(note.id); });
            this.highlights.set(note.id, [mark]);
            break;
          }
        }
      } catch { /* 忽略 */ }
    } else {
      try {
        const el = document.querySelector(note.selector) as HTMLElement;
        if (!el) return;
        const marker = document.createElement('div');
        marker.setAttribute('data-editor-dialog', '');
        const rect = el.getBoundingClientRect();
        marker.style.cssText = `position:fixed;left:${rect.left - 8}px;top:${rect.top}px;height:${rect.height}px;width:3px;background:#4285f4;border-radius:2px;pointer-events:none;z-index:10;`;
        this.container.appendChild(marker);
        this.markers.set(note.id, marker);
      } catch { /* 忽略 */ }
    }
  }

  private createCard(note: CommentNote) {
    const card = document.createElement('div');
    card.className = 'comment-card';
    card.setAttribute('data-editor-dialog', '');
    card.setAttribute('data-anchor', note.anchor);
    card.setAttribute('data-comment-id', note.id);

    const header = document.createElement('div');
    header.className = 'comment-card-header';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'comment-type-label';
    typeLabel.textContent = note.anchor === 'text' ? '文字评论' : '段落评论';
    header.appendChild(typeLabel);

    if (note.anchor === 'text' && note.textContent) {
      const quoted = document.createElement('div');
      quoted.className = 'comment-quoted';
      quoted.textContent = `"${note.textContent.substring(0, 30)}${note.textContent.length > 30 ? '...' : ''}"`;
      header.appendChild(quoted);
    }

    const actions = document.createElement('div');
    actions.className = 'comment-card-actions';
    const addBtn = document.createElement('button');
    addBtn.textContent = '+'; addBtn.title = '追加笔记';
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); this.addEntry(note.id); });
    const delBtn = document.createElement('button');
    delBtn.textContent = '×'; delBtn.title = '删除评论';
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteComment(note.id); });
    actions.appendChild(addBtn);
    actions.appendChild(delBtn);
    header.appendChild(actions);
    card.appendChild(header);

    const entriesContainer = document.createElement('div');
    entriesContainer.className = 'comment-entries';
    this.renderEntries(note, entriesContainer);
    card.appendChild(entriesContainer);

    const anchorRect = this.getAnchorRect(note);
    if (anchorRect) card.style.top = anchorRect.top + 'px';

    this.container.appendChild(card);
    this.cards.set(note.id, card);
  }

  private renderEntries(note: CommentNote, container: HTMLElement) {
    container.innerHTML = '';
    for (const entry of note.entries) {
      const entryEl = document.createElement('div');
      entryEl.className = 'comment-entry';
      entryEl.setAttribute('data-entry-id', entry.id);

      const timeEl = document.createElement('div');
      timeEl.className = 'comment-entry-time';
      timeEl.textContent = formatTime(entry.createdAt);

      const contentEl = document.createElement('div');
      contentEl.className = 'comment-entry-content';
      contentEl.innerHTML = entry.content.trim() ? renderMarkdown(entry.content) : '<span style="color:#aaa">点击编辑...</span>';
      contentEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editEntry(note.id, entry.id, entryEl);
      });

      entryEl.appendChild(timeEl);
      entryEl.appendChild(contentEl);
      container.appendChild(entryEl);
    }
  }

  private editEntry(noteId: string, entryId: string, entryEl: HTMLElement) {
    if (entryEl.querySelector('textarea')) return;
    const note = this.noteManager.getNote(noteId) as CommentNote;
    if (!note) return;
    const entry = note.entries.find(e => e.id === entryId);
    if (!entry) return;
    const contentEl = entryEl.querySelector('.comment-entry-content') as HTMLDivElement;
    if (!contentEl) return;

    const textarea = document.createElement('textarea');
    textarea.className = 'comment-entry-textarea';
    textarea.value = entry.content;
    textarea.style.height = Math.max(60, contentEl.offsetHeight) + 'px';
    contentEl.style.display = 'none';
    entryEl.appendChild(textarea);
    textarea.focus();

    let saveTimer: number | null = null;
    const save = () => { this.noteManager.updateEntry(noteId, entryId, textarea.value); };

    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(60, textarea.scrollHeight) + 'px';
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, 500);
    });

    textarea.addEventListener('blur', () => {
      if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
      save();
      textarea.remove();
      contentEl.style.display = '';
      contentEl.innerHTML = textarea.value.trim() ? renderMarkdown(textarea.value) : '<span style="color:#aaa">点击编辑...</span>';
      contentEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editEntry(noteId, entryId, entryEl);
      });
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); textarea.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); textarea.blur(); }
    });
  }

  private addEntry(noteId: string) {
    const entry = this.noteManager.addEntry(noteId, '');
    if (!entry) return;
    const card = this.cards.get(noteId);
    if (!card) return;
    const note = this.noteManager.getNote(noteId) as CommentNote;
    if (!note) return;
    const entriesContainer = card.querySelector('.comment-entries') as HTMLElement;
    if (!entriesContainer) return;
    this.renderEntries(note, entriesContainer);
    const lastEntry = entriesContainer.lastElementChild as HTMLElement;
    if (lastEntry) {
      const contentEl = lastEntry.querySelector('.comment-entry-content') as HTMLElement;
      if (contentEl) contentEl.click();
    }
    if (this.panelMode) this.refreshPanel();
  }

  private focusNewEntry(noteId: string) {
    const card = this.cards.get(noteId);
    if (!card) return;
    if (this.panelMode) {
      const panelItem = this.panel?.querySelector(`[data-panel-comment="${noteId}"]`);
      if (panelItem) panelItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    card.style.display = 'block';
    const lastEntry = card.querySelector('.comment-entries')?.lastElementChild as HTMLElement;
    if (lastEntry) {
      const contentEl = lastEntry.querySelector('.comment-entry-content') as HTMLElement;
      if (contentEl) contentEl.click();
    }
  }

  private focusComment(noteId: string) {
    if (this.panelMode) {
      const panelItem = this.panel?.querySelector(`[data-panel-comment="${noteId}"]`);
      if (panelItem) panelItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const card = this.cards.get(noteId);
      if (!card) return;
      card.style.display = card.style.display === 'none' ? 'block' : 'none';
    }
  }

  private deleteComment(noteId: string) {
    const marks = this.highlights.get(noteId);
    if (marks) {
      marks.forEach((mark) => {
        const text = document.createTextNode(mark.textContent || '');
        mark.parentNode?.replaceChild(text, mark);
      });
      this.highlights.delete(noteId);
    }
    const marker = this.markers.get(noteId);
    if (marker) { marker.remove(); this.markers.delete(noteId); }
    const card = this.cards.get(noteId);
    if (card) { card.remove(); this.cards.delete(noteId); }
    this.noteManager.deleteNote(noteId);
    if (this.panelMode) this.refreshPanel();
  }

  // --- 定位与避让 ---

  private getAnchorRect(note: CommentNote): DOMRect | null {
    if (note.anchor === 'text') {
      const marks = this.highlights.get(note.id);
      if (marks?.length) return marks[0].getBoundingClientRect();
    }
    try {
      const el = document.querySelector(note.selector) as HTMLElement;
      if (el) return el.getBoundingClientRect();
    } catch { /* 忽略 */ }
    return null;
  }

  private repositionCards() {
    if (this.panelMode) return;
    const sorted = Array.from(this.cards.entries())
      .map(([id, card]) => {
        const note = this.noteManager.getNote(id) as CommentNote;
        const rect = note ? this.getAnchorRect(note) : null;
        return { id, card, targetTop: rect ? rect.top : 0 };
      })
      .sort((a, b) => a.targetTop - b.targetTop);

    let lastBottom = -Infinity;
    for (const { card, targetTop } of sorted) {
      const top = Math.max(targetTop, lastBottom + 8);
      card.style.top = top + 'px';
      lastBottom = top + card.offsetHeight;
    }

    this.markers.forEach((marker, id) => {
      const note = this.noteManager.getNote(id) as CommentNote;
      if (!note) return;
      try {
        const el = document.querySelector(note.selector) as HTMLElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        marker.style.left = (rect.left - 8) + 'px';
        marker.style.top = rect.top + 'px';
        marker.style.height = rect.height + 'px';
      } catch { /* 忽略 */ }
    });
  }

  private handleScroll() {
    if (this.scrollThrottleId !== null) return;
    this.scrollThrottleId = window.requestAnimationFrame(() => {
      this.repositionCards();
      this.scrollThrottleId = null;
    });
  }

  // --- 面板模式 ---

  private showPanel() {
    this.cards.forEach(card => card.style.display = 'none');
    if (!this.panel) {
      this.panel = document.createElement('div');
      this.panel.className = 'comment-panel';
      this.panel.setAttribute('data-editor-dialog', '');
      this.container.appendChild(this.panel);
    }
    this.panel.style.display = 'block';
    this.refreshPanel();
  }

  private hidePanel() {
    if (this.panel) this.panel.style.display = 'none';
    this.cards.forEach(card => card.style.display = 'block');
    this.repositionCards();
  }

  private refreshPanel() {
    if (!this.panel) return;
    this.panel.innerHTML = '';
    const comments = this.noteManager.getNotesByType('comment') as CommentNote[];

    const header = document.createElement('div');
    header.className = 'comment-panel-header';
    const title = document.createElement('span');
    title.className = 'comment-panel-title';
    title.textContent = `全部评论 (${comments.length})`;
    const switchBtn = document.createElement('span');
    switchBtn.className = 'comment-panel-switch';
    switchBtn.textContent = '切换内联';
    switchBtn.addEventListener('click', () => this.togglePanel());
    header.appendChild(title);
    header.appendChild(switchBtn);
    this.panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'comment-panel-body';
    for (const note of comments) {
      const item = document.createElement('div');
      item.className = 'comment-panel-item';
      item.setAttribute('data-panel-comment', note.id);
      item.style.borderLeftColor = note.anchor === 'text' ? '#ffd54f' : '#4285f4';

      const itemHeader = document.createElement('div');
      itemHeader.className = 'comment-panel-item-header';
      const itemType = document.createElement('span');
      itemType.textContent = note.anchor === 'text' ? '文字评论' : '段落评论';
      itemHeader.appendChild(itemType);
      if (note.anchor === 'text' && note.textContent) {
        const quoted = document.createElement('div');
        quoted.className = 'comment-quoted';
        quoted.textContent = `"${note.textContent.substring(0, 30)}${note.textContent.length > 30 ? '...' : ''}"`;
        itemHeader.appendChild(quoted);
      }
      item.appendChild(itemHeader);

      for (const entry of note.entries) {
        const entryEl = document.createElement('div');
        entryEl.className = 'comment-panel-entry';
        const timeEl = document.createElement('div');
        timeEl.className = 'comment-entry-time';
        timeEl.textContent = formatTime(entry.createdAt);
        const contentEl = document.createElement('div');
        contentEl.className = 'comment-entry-content';
        contentEl.innerHTML = entry.content.trim() ? renderMarkdown(entry.content) : '<span style="color:#aaa">空</span>';
        entryEl.appendChild(timeEl);
        entryEl.appendChild(contentEl);
        item.appendChild(entryEl);
      }

      item.addEventListener('click', () => this.scrollToAnchor(note));
      body.appendChild(item);
    }
    this.panel.appendChild(body);
  }

  private scrollToAnchor(note: CommentNote) {
    const marks = this.highlights.get(note.id);
    if (marks?.length) {
      marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      marks[0].style.transition = 'background 0.3s';
      marks[0].style.background = 'rgba(255,213,79,0.8)';
      setTimeout(() => { marks[0].style.background = 'rgba(255,213,79,0.4)'; }, 500);
      return;
    }
    try {
      const el = document.querySelector(note.selector);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch { /* 忽略 */ }
  }

  // --- 清理 ---

  private clearAll() {
    this.highlights.forEach((marks) => {
      marks.forEach((mark) => {
        const text = document.createTextNode(mark.textContent || '');
        mark.parentNode?.replaceChild(text, mark);
      });
    });
    this.highlights.clear();
    this.markers.forEach(m => m.remove());
    this.markers.clear();
    this.cards.forEach(c => c.remove());
    this.cards.clear();
  }

  // --- 样式 ---

  private getStyles(): string {
    return `
      .comment-plus {
        position:fixed;width:22px;height:22px;border-radius:50%;
        background:#4285f4;color:white;display:none;align-items:center;
        justify-content:center;font-size:14px;cursor:pointer;
        box-shadow:0 1px 4px rgba(0,0,0,0.2);pointer-events:auto;
        z-index:15;user-select:none;line-height:1;
      }
      .comment-card {
        position:fixed;right:16px;width:260px;background:#fff;border-radius:8px;
        box-shadow:0 2px 12px rgba(0,0,0,0.12);max-height:300px;overflow-y:auto;
        z-index:10;pointer-events:auto;
      }
      .comment-card[data-anchor="text"] { border-left:3px solid #ffd54f; }
      .comment-card[data-anchor="paragraph"] { border-left:3px solid #4285f4; }
      .comment-card-header {
        padding:10px 12px;border-bottom:1px solid #f0f0f0;
        display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px;
      }
      .comment-type-label { font-size:11px;color:#999; }
      .comment-quoted { font-size:12px;color:#666;font-style:italic;width:100%; }
      .comment-card-actions { display:flex;gap:4px; }
      .comment-card-actions button {
        background:none;border:none;cursor:pointer;font-size:14px;color:#999;padding:2px 4px;
      }
      .comment-card-actions button:hover { color:#333; }
      .comment-entries { padding:0; }
      .comment-entry { padding:8px 12px;border-bottom:1px solid #f5f5f5; }
      .comment-entry:last-child { border-bottom:none; }
      .comment-entry-time { font-size:11px;color:#aaa;margin-bottom:2px; }
      .comment-entry-content {
        font-size:13px;color:#333;line-height:1.5;cursor:pointer;
        min-height:20px;border-radius:4px;
      }
      .comment-entry-content:hover { background:rgba(0,0,0,0.03); }
      .comment-entry-content p { margin:4px 0; }
      .comment-entry-content code { background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px; }
      .comment-entry-content pre { background:#1e1e1e;color:#d4d4d4;padding:8px;border-radius:4px;overflow-x:auto;font-size:12px; }
      .comment-entry-content pre code { background:none;padding:0; }
      .comment-entry-content a { color:#4285f4; }
      .comment-entry-content ul { padding-left:20px;margin:4px 0; }
      .comment-entry-content img { max-width:100%;border-radius:4px; }
      .comment-entry-textarea {
        width:100%;min-height:60px;padding:8px;border:1px solid #4285f4;
        border-radius:4px;font-family:monospace;font-size:13px;
        resize:vertical;box-sizing:border-box;line-height:1.5;outline:none;
      }
      .comment-panel {
        position:fixed;right:0;top:48px;width:300px;height:calc(100vh - 48px);
        background:#fafafa;border-left:1px solid #e8e8e8;overflow-y:auto;
        z-index:10;pointer-events:auto;
      }
      .comment-panel-header {
        padding:12px 16px;border-bottom:1px solid #e8e8e8;
        display:flex;justify-content:space-between;align-items:center;
        position:sticky;top:0;background:#fafafa;z-index:1;
      }
      .comment-panel-title { font-size:14px;font-weight:600;color:#333; }
      .comment-panel-switch { font-size:12px;color:#4285f4;cursor:pointer; }
      .comment-panel-switch:hover { text-decoration:underline; }
      .comment-panel-body { padding:8px; }
      .comment-panel-item {
        background:#fff;border-radius:6px;margin-bottom:8px;
        box-shadow:0 1px 3px rgba(0,0,0,0.08);border-left:3px solid #4285f4;
        overflow:hidden;cursor:pointer;
      }
      .comment-panel-item:hover { box-shadow:0 2px 6px rgba(0,0,0,0.12); }
      .comment-panel-item-header {
        padding:8px 10px;border-bottom:1px solid #f5f5f5;font-size:11px;color:#999;
      }
      .comment-panel-entry { padding:8px 10px;border-bottom:1px solid #f5f5f5; }
      .comment-panel-entry:last-child { border-bottom:none; }
    `;
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/CommentSystem.ts
git commit -m "feat: 创建统一评论系统 CommentSystem"
```

---

### Task 5: 更新工具栏和右键菜单

**Files:**
- Modify: `src/content/ui/Toolbar.ts`
- Modify: `src/content/ui/ContextMenu.ts`

- [ ] **Step 1: 更新 Toolbar.ts**

替换 `ToolbarAction` 类型和工具栏 HTML：

```typescript
export type ToolbarAction =
  | 'undo' | 'redo'
  | 'insert' | 'export' | 'export-with-notes' | 'export-notes-json' | 'import-notes-json'
  | 'copy-html'
  | 'toggle-comments' | 'toggle-panel' | 'add-sticky'
  | 'exit';
```

在工具栏 HTML 中：
- 将 `data-action="toggle-notes"` 改为 `data-action="toggle-comments"`，文本改为 `&#128172; 评论`
- 在便签按钮后添加面板按钮：`<button data-action="toggle-panel" title="评论面板" style="display:none">&#128203; 面板</button>`

将 `updateNotesButton` 方法重命名为 `updateCommentsButton`，并添加 `updatePanelButton` 方法：

```typescript
updateCommentsButton(active: boolean) {
  const btn = this.toolbar.querySelector('[data-action="toggle-comments"]') as HTMLButtonElement;
  if (btn) btn.classList.toggle('notes-active', active);
}

updatePanelButton(visible: boolean, active: boolean) {
  const btn = this.toolbar.querySelector('[data-action="toggle-panel"]') as HTMLButtonElement;
  if (btn) {
    btn.style.display = visible ? '' : 'none';
    btn.classList.toggle('notes-active', active);
  }
}
```

- [ ] **Step 2: 更新 ContextMenu.ts**

替换 `ContextAction` 类型：

```typescript
export type ContextAction =
  | 'copy' | 'delete' | 'move-up' | 'move-down'
  | 'copy-html-element' | 'edit-text'
  | 'add-comment' | 'add-sticky';
```

替换 `MENU_ITEMS` 中笔记相关条目——将 `add-annotation` 和 `add-sidenote` 合并为一个 `add-comment`：

```typescript
const MENU_ITEMS: MenuItem[] = [
  { label: '编辑文本', action: 'edit-text', icon: '&#9998;' },
  { label: '复制元素', action: 'copy', icon: '&#9776;' },
  { label: '复制 HTML', action: 'copy-html-element', icon: '&lt;/&gt;' },
  { label: '上移', action: 'move-up', icon: '&uarr;' },
  { label: '下移', action: 'move-down', icon: '&darr;' },
  { label: '删除', action: 'delete', icon: '&#10005;' },
  { label: '添加评论', action: 'add-comment', icon: '&#128172;' },
  { label: '添加便签', action: 'add-sticky', icon: '&#128204;' },
];
```

- [ ] **Step 3: 提交**

```bash
git add src/content/ui/Toolbar.ts src/content/ui/ContextMenu.ts
git commit -m "refactor: 工具栏和右键菜单适配统一评论系统"
```

---

### Task 6: 更新 Engine 集成

**Files:**
- Modify: `src/content/editor/Engine.ts`

- [ ] **Step 1: 替换模块引用和集成逻辑**

修改 import：
- 删除：`import { Annotator } from './Annotator';` 和 `import { SideNoteRenderer } from './SideNote';`
- 添加：`import { CommentSystem } from './CommentSystem';`

修改类属性：
- 删除：`private annotator: Annotator;` 和 `private sideNoteRenderer: SideNoteRenderer;`
- 添加：`private commentSystem: CommentSystem;`
- `notesActive` 改名为 `commentsActive`

修改构造函数：
- 删除：`this.annotator = new Annotator(...)` 和 `this.sideNoteRenderer = new SideNoteRenderer(...)`
- 添加：`this.commentSystem = new CommentSystem(this.noteManager, shadowRoot, container);`

修改 `destroy()`：
- 删除：`this.annotator.destroy();` 和 `this.sideNoteRenderer.destroy();`
- 添加：`this.commentSystem.destroy();`

修改 `setupToolbarActions()`，将所有 `toggle-notes` 改为 `toggle-comments`，将所有 `this.annotator.activate/deactivate()` 和 `this.sideNoteRenderer.activate/deactivate()` 替换为 `this.commentSystem.activate/deactivate()`。将 `updateNotesButton` 改为 `updateCommentsButton`。添加 `toggle-panel` 处理：

```typescript
case 'toggle-comments':
  this.commentsActive = !this.commentsActive;
  this.toolbar.updateCommentsButton(this.commentsActive);
  if (this.commentsActive) {
    this.commentSystem.activate();
    this.stickyRenderer.activate();
  } else {
    this.commentSystem.deactivate();
    this.stickyRenderer.deactivate();
  }
  this.toolbar.updatePanelButton(
    this.commentsActive && this.commentSystem.getCommentCount() >= 5,
    this.commentSystem.isPanelMode()
  );
  break;
case 'toggle-panel':
  this.commentSystem.togglePanel();
  this.toolbar.updatePanelButton(true, this.commentSystem.isPanelMode());
  break;
```

修改 `add-sticky` case 中的 `this.annotator.activate()` / `this.sideNoteRenderer.activate()` 为 `this.commentSystem.activate()`，`updateNotesButton` 为 `updateCommentsButton`，`notesActive` 为 `commentsActive`。

修改 `setupContextMenuActions()`：
- 删除 `add-annotation` 和 `add-sidenote` case
- 添加 `add-comment` case：

```typescript
case 'add-comment':
  if (!this.commentsActive) {
    this.commentsActive = true;
    this.toolbar.updateCommentsButton(true);
    this.commentSystem.activate();
    this.stickyRenderer.activate();
  }
  this.commentSystem.addFromContextMenu(target);
  break;
```

更新 `add-sticky` case 同理。

在 `noteManager.onChange` 中添加面板按钮更新：

```typescript
this.noteManager.onChange(() => {
  if (this.commentsActive) {
    this.toolbar.updatePanelButton(
      this.commentSystem.getCommentCount() >= 5,
      this.commentSystem.isPanelMode()
    );
  }
});
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/Engine.ts
git commit -m "refactor: Engine 集成 CommentSystem，移除旧模块引用"
```

---

### Task 7: 更新导出逻辑

**Files:**
- Modify: `src/content/index.ts`

- [ ] **Step 1: 更新导出中的 mark 选择器**

在 `src/content/index.ts` 中，将所有 `mark[data-editor-note-ref]` 替换为 `mark[data-comment-ref]`。

涉及位置：
- `EXPORT_HTML_WITH_NOTES` handler 第 76 行附近
- `EXPORT_HTML` handler 第 149 行附近

搜索替换：
- `mark[data-editor-note-ref]` → `mark[data-comment-ref]`

- [ ] **Step 2: 提交**

```bash
git add src/content/index.ts
git commit -m "fix: 导出逻辑适配新的 mark[data-comment-ref] 选择器"
```

---

### Task 8: 删除旧文件并验证构建

**Files:**
- Delete: `src/content/editor/Annotator.ts`
- Delete: `src/content/editor/SideNote.ts`

- [ ] **Step 1: 删除旧模块文件**

```bash
rm src/content/editor/Annotator.ts src/content/editor/SideNote.ts
```

- [ ] **Step 2: TypeScript 编译验证**

Run: `cd /home/lm/yfj/html-visual-editor && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 构建验证**

Run: `cd /home/lm/yfj/html-visual-editor && node build.mjs`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "cleanup: 删除旧的 Annotator 和 SideNote 模块，构建通过"
```
