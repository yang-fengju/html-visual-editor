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
        if (data) { this.notes = data.notes; this.notifyChange(); }
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
      if (data.notes?.length) this.mergeNotes(data.notes);
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

  addNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> & Record<string, unknown>): Note {
    const fullNote = { ...note, id: generateId(), createdAt: Date.now(), updatedAt: Date.now() } as Note;
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
    try { const data = JSON.parse(json) as PageNotes; if (data.notes) this.mergeNotes(data.notes); } catch { /* 忽略 */ }
  }

  generateEmbedHTML(): string {
    if (this.notes.length === 0) return '';

    const data: PageNotes = { url: this.url, title: this.title, notes: this.notes, savedAt: Date.now() };
    const jsonStr = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    let html = `\n<script type="application/json" data-editor-notes>${jsonStr}</script>\n`;

    html += `<style data-editor-notes-style>
[data-editor-note]{border-left:3px solid #4285f4;background:#f0f7ff;padding:12px 16px;margin:8px 0;border-radius:0 4px 4px 0;font-size:14px;line-height:1.6}
[data-note-type="sticky"]{position:relative;border:1px solid #e0e0e0;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.1);padding:8px 12px;min-width:200px;border-left:3px solid #ffd54f;background:#fffde7;margin:8px 0}
mark[data-editor-note-ref]{background:rgba(255,213,79,0.4);padding:1px 0;border-radius:2px}
</style>\n`;

    // 为每条笔记生成可见 HTML
    for (const note of this.notes) {
      const safeContent = note.content
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      if (note.type === 'annotation') {
        html += `<aside data-editor-note="${note.id}" data-note-type="annotation"><strong>批注：</strong>${safeContent}</aside>\n`;
      } else if (note.type === 'sticky') {
        html += `<aside data-editor-note="${note.id}" data-note-type="sticky" data-color="${note.color}"><strong>便签：</strong>${safeContent}</aside>\n`;
      } else if (note.type === 'sidenote') {
        html += `<aside data-editor-note="${note.id}" data-note-type="sidenote" data-selector="${note.selector.replace(/"/g, '&quot;')}"><strong>段落笔记：</strong>${safeContent}</aside>\n`;
      }
    }

    return html;
  }

  destroy() {
    if (this.saveTimer !== null) { clearTimeout(this.saveTimer); this.saveToDB(); }
  }
}
