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
const BLOCK_SELECTOR = Array.from(BLOCK_TAGS).map(t => t.toLowerCase()).join(',');

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
    if (this.scrollThrottleId !== null) { cancelAnimationFrame(this.scrollThrottleId); this.scrollThrottleId = null; }
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
    const anchorNode = selection.anchorNode;
    const anchorEl = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode as HTMLElement;
    if (anchorEl?.closest('html-visual-editor')) return;
    if (anchorEl?.closest('[data-editor-dialog]')) return;
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
    const block = target.closest(BLOCK_SELECTOR) as HTMLElement | null;
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
      const newContentEl = contentEl.cloneNode(false) as HTMLDivElement;
      newContentEl.innerHTML = textarea.value.trim() ? renderMarkdown(textarea.value) : '<span style="color:#aaa">点击编辑...</span>';
      newContentEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editEntry(noteId, entryId, entryEl);
      });
      contentEl.replaceWith(newContentEl);
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
