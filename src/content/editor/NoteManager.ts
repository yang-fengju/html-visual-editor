import type { Note, CommentNote, CommentEntry, PageNotes } from '../../shared/types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export class NoteManager {
  private notes: Note[] = [];
  private url: string;
  private title: string;
  private storageKey: string; // 为当前完整网页地址生成独立存储键，避免不同页面的批注互相覆盖。
  private saveTimer: number | null = null;
  private onChangeCallbacks: Array<(notes: Note[]) => void> = [];

  constructor() {
    this.url = location.href;
    this.title = document.title;
    this.storageKey = `pageNotes:${this.url}`; // 将页面地址放入扩展专用键中，支持按页面恢复对应批注。
    void this.initStorage(); // 异步加载扩展存储中的批注，同时保持构造函数同步接口不变。
  }

  private async initStorage(): Promise<void> { // 从扩展隔离存储初始化批注，并在必要时兼容旧版网站存储。
    await this.load(); // 等待当前页面数据完成恢复，保证后续变更基于最新批注集合。
  }

  private async load(): Promise<void> {
    const stored = await chrome.storage.local.get(this.storageKey); // 仅从扩展自己的本地空间读取当前页面批注。
    let data = stored[this.storageKey] as PageNotes | undefined; // 将动态键对应的数据恢复为页面批注结构。
    if (!data) { // 新存储尚无数据时尝试读取开发版本遗留在网站空间的旧批注。
      data = await this.loadLegacyPageNotes(); // 对旧数据库执行只读访问，避免破坏用户已有批注。
      if (data?.url === this.url && Array.isArray(data.notes)) { // 仅迁移结构和网址均符合本插件格式的旧记录。
        await chrome.storage.local.set({ [this.storageKey]: data }); // 先成功复制到扩展隔离存储，避免迁移期间丢失批注。
        await this.removeLegacyPageNotes(); // 新存储写入成功后才删除旧位置中的当前网址记录。
      } else { // 旧记录不属于当前页面或结构异常时不采用其内容。
        data = undefined; // 清空异常结果，防止未经验证的数据进入编辑器运行时。
      } // 完成旧数据结构校验和安全迁移。
    } // 完成新旧存储来源选择。
    if (data) { // 当前页面存在历史批注时恢复并兼容更早的数据结构。
      let needsMigration = false; // 记录批注结构是否发生格式升级，以便重新保存标准格式。
      this.notes = data.notes.map((note: unknown) => { // 逐条恢复批注，避免旧格式混入运行时集合。
        const migrated = this.migrateNote(note); // 将旧 annotation 或 sidenote 格式转换为统一评论格式。
        if (migrated !== note) needsMigration = true; // 对象被替换表示发生过结构迁移，需要持久化新格式。
        return migrated; // 返回运行时使用的标准批注对象。
      }); // 完成当前页面全部批注的数据结构恢复。
      if (needsMigration) this.scheduleSave(); // 延迟保存升级后的数据，合并短时间内可能发生的其他变更。
      this.notifyChange(); // 通知评论面板和便签组件刷新已恢复的数据。
    } // 无历史数据时保持空集合，不创建无意义存储记录。
    this.importEmbeddedNotes(); // 在本地数据恢复后合并 HTML 文件内嵌的可移植批注。
  }

  private async loadLegacyPageNotes(): Promise<PageNotes | undefined> { // 兼容读取旧版本保存在宿主网站 IndexedDB 中的当前页面批注。
    try { // 网站可能禁用存储或拒绝数据库访问，因此迁移必须容错且不能阻塞编辑器。
      const databases = await indexedDB.databases(); // 列出当前网站已有数据库，避免为没有旧数据的网站创建空数据库。
      const hasLegacyDatabase = databases.some((database) => database.name === 'html-visual-editor-notes'); // 精确匹配旧版数据库名称。
      if (!hasLegacyDatabase) return undefined; // 没有旧数据库时立即返回，避免触碰网站自己的存储空间。
      return await new Promise<PageNotes | undefined>((resolve) => { // 将 IndexedDB 事件接口封装为可等待的只读迁移结果。
        const openRequest = indexedDB.open('html-visual-editor-notes', 1); // 以旧版相同名称和版本打开已经存在的数据库。
        openRequest.onerror = () => resolve(undefined); // 打开失败时忽略旧数据并继续使用新存储。
        openRequest.onsuccess = () => { // 数据库打开成功后只读取当前完整网址对应的记录。
          const database = openRequest.result; // 保存数据库连接，便于读取结束后及时关闭。
          if (!database.objectStoreNames.contains('pages')) { // 旧数据库结构异常时不尝试创建或修改对象仓库。
            database.close(); // 关闭不符合预期结构的数据库连接。
            resolve(undefined); // 将异常旧结构视为没有可迁移数据。
            return; // 终止当前成功回调，避免继续创建无效事务。
          } // 完成旧对象仓库存在性检查。
          const transaction = database.transaction('pages', 'readonly'); // 创建只读事务，保证迁移过程不会改动网站存储。
          const request = transaction.objectStore('pages').get(this.url); // 仅查询当前页面地址对应的旧批注记录。
          request.onsuccess = () => resolve(request.result as PageNotes | undefined); // 将找到的页面批注交给新存储流程复制。
          request.onerror = () => resolve(undefined); // 单条记录读取失败时安全跳过迁移。
          transaction.oncomplete = () => database.close(); // 事务完成后关闭连接，避免长期占用网站数据库。
          transaction.onerror = () => database.close(); // 事务异常时同样关闭连接并释放资源。
        }; // 完成旧数据库成功打开后的只读查询逻辑。
      }); // 返回旧批注查询结果或 undefined。
    } catch { // 捕获不支持 databases() 或隐私模式限制导致的同步与异步异常。
      return undefined; // 兼容迁移失败不影响用户创建和保存新的批注。
    } // 完成旧存储兼容读取的异常处理。
  }

  private async removeLegacyPageNotes(): Promise<void> { // 在新存储写入成功后精确删除旧位置中的当前页面记录。
    try { // 删除失败只会留下冗余副本，不应阻止用户继续使用已经迁移的数据。
      await new Promise<void>((resolve) => { // 将 IndexedDB 删除事件封装为可等待的清理流程。
        const openRequest = indexedDB.open('html-visual-editor-notes', 1); // 打开已确认存在且格式匹配的旧版数据库。
        openRequest.onerror = () => resolve(); // 数据库无法打开时结束清理并保留旧副本。
        openRequest.onsuccess = () => { // 成功打开后仅处理 pages 仓库中的当前完整网址键。
          const database = openRequest.result; // 保存连接以便事务结束后主动关闭。
          if (!database.objectStoreNames.contains('pages')) { // 再次确认目标仓库存在，防止结构在迁移期间变化。
            database.close(); // 关闭结构不匹配的数据库，避免误操作。
            resolve(); // 将无法清理视为非致命结果。
            return; // 停止当前回调，避免创建无效写事务。
          } // 完成目标仓库的二次保护检查。
          const transaction = database.transaction('pages', 'readwrite'); // 创建只允许处理指定仓库的写事务。
          transaction.objectStore('pages').delete(this.url); // 精确删除当前网址这一条已迁移记录，不触碰其他页面批注。
          transaction.oncomplete = () => { database.close(); resolve(); }; // 删除成功后关闭连接并结束清理。
          transaction.onerror = () => { database.close(); resolve(); }; // 删除失败时关闭连接并保留旧记录。
          transaction.onabort = () => { database.close(); resolve(); }; // 事务被浏览器中止时同样安全结束清理。
        }; // 完成旧数据库打开后的精确删除逻辑。
      }); // 等待旧记录删除事务结束或安全跳过。
    } catch { // 捕获隐私模式或网站存储策略引起的异常。
      return; // 清理异常不影响已经写入扩展空间的新批注。
    } // 完成旧记录清理的容错处理。
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
    this.saveTimer = window.setTimeout(() => { void this.saveToStorage(); this.saveTimer = null; }, 500); // 防抖后把最新批注写入扩展隔离存储。
  }

  private async saveToStorage(): Promise<void> { // 将当前页面批注持久化到网站无法访问的扩展专用空间。
    const data: PageNotes = { url: this.url, title: this.title, notes: this.notes, savedAt: Date.now() }; // 组装完整页面上下文和批注快照。
    await chrome.storage.local.set({ [this.storageKey]: data }); // 使用动态页面键写入本机，不向任何网络服务传输数据。
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
        const typeLabel = note.anchor === 'text' ? '文字笔记' : '段落笔记';
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
    if (this.saveTimer !== null) { clearTimeout(this.saveTimer); void this.saveToStorage(); } // 销毁前立即把尚未触发的防抖批注写入扩展存储。
  }
}
