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
