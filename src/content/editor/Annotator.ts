import type { AnnotationNote } from '../../shared/types';
import { NoteManager } from './NoteManager';
import { NoteEditor, renderMarkdown } from '../ui/NoteEditor';

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

export class Annotator {
  private highlights: Map<string, HTMLElement[]> = new Map();
  private bubbles: Map<string, HTMLDivElement> = new Map();
  private addBtn: HTMLDivElement;
  private active = false;
  private selectionHandler: () => void;

  constructor(
    private noteManager: NoteManager,
    private shadowRoot: ShadowRoot,
    private container: HTMLDivElement
  ) {
    this.addBtn = document.createElement('div');
    this.addBtn.setAttribute('data-editor-dialog', '');
    this.addBtn.style.cssText = `position:fixed;display:none;background:#4285f4;color:white;padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer;z-index:2147483647;box-shadow:0 2px 8px rgba(0,0,0,0.2);pointer-events:auto;user-select:none;`;
    this.addBtn.textContent = '+ 批注';
    this.addBtn.addEventListener('click', () => this.addAnnotationFromSelection());
    document.body.appendChild(this.addBtn);

    const style = document.createElement('style');
    style.textContent = `
      .annotation-bubble {
        position:fixed;right:16px;width:260px;background:white;border-radius:8px;
        box-shadow:0 2px 12px rgba(0,0,0,0.15);border-left:3px solid #ffd54f;
        padding:12px;z-index:10;pointer-events:auto;max-height:300px;overflow-y:auto;font-size:13px;
      }
      .annotation-bubble-header {
        display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:11px;color:#888;
      }
      .annotation-bubble-actions { display:flex;gap:4px; }
      .annotation-bubble-actions button { background:none;border:none;cursor:pointer;font-size:14px;color:#888;padding:2px; }
      .annotation-bubble-actions button:hover { color:#333; }
      ${NoteEditor.getStyles()}
    `;
    this.shadowRoot.appendChild(style);

    this.selectionHandler = () => this.handleSelectionChange();
    document.addEventListener('selectionchange', this.selectionHandler);
  }

  activate() { this.active = true; this.renderAll(); }

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

  addAnnotationFromSelection() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const textContent = selection.toString().trim();
    if (!textContent) return;
    const selector = getCSSPath(range.startContainer);
    const note = this.noteManager.addNote({
      type: 'annotation', content: '', selector, textContent,
      startOffset: range.startOffset, endOffset: range.endOffset,
    }) as AnnotationNote;
    this.addBtn.style.display = 'none';
    selection.removeAllRanges();
    this.renderAnnotation(note);
    const bubble = this.bubbles.get(note.id);
    if (bubble) {
      const editor = bubble.querySelector('.note-editor-input') as HTMLTextAreaElement;
      if (editor) editor.focus();
    }
  }

  destroy() {
    this.deactivate();
    document.removeEventListener('selectionchange', this.selectionHandler);
    this.addBtn.remove();
  }

  private handleSelectionChange() {
    if (!this.active) return;
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      this.addBtn.style.display = 'none'; return;
    }
    const text = selection.toString().trim();
    if (!text) { this.addBtn.style.display = 'none'; return; }
    const anchor = selection.anchorNode;
    if (anchor && (anchor as HTMLElement).closest?.('html-visual-editor')) return;
    if (anchor && (anchor as HTMLElement).closest?.('[data-editor-dialog]')) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    this.addBtn.style.display = 'block';
    this.addBtn.style.left = (rect.left + rect.width / 2 - 30) + 'px';
    this.addBtn.style.top = (rect.bottom + 6) + 'px';
  }

  private renderAnnotation(note: AnnotationNote) {
    this.applyHighlight(note);
    this.createBubble(note);
  }

  private applyHighlight(note: AnnotationNote) {
    try {
      const el = document.querySelector(note.selector);
      if (!el) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      const marks: HTMLElement[] = [];
      while ((node = walker.nextNode() as Text | null)) {
        if (node.textContent && node.textContent.includes(note.textContent)) {
          const mark = document.createElement('mark');
          mark.setAttribute('data-editor-note-ref', note.id);
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
          mark.addEventListener('click', (e) => { e.stopPropagation(); this.toggleBubble(note.id); });
          marks.push(mark);
          break;
        }
      }
      this.highlights.set(note.id, marks);
    } catch { /* 忽略 */ }
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
    editor.onSave((content) => { this.noteManager.updateNote(note.id, { content }); });
    bubble.appendChild(editor.getElement());
    this.container.appendChild(bubble);
    this.bubbles.set(note.id, bubble);
    const marks = this.highlights.get(note.id);
    if (marks?.length) {
      const rect = marks[0].getBoundingClientRect();
      bubble.style.top = rect.top + 'px';
    }
  }

  private toggleBubble(noteId: string) {
    const bubble = this.bubbles.get(noteId);
    if (!bubble) return;
    bubble.style.display = bubble.style.display !== 'none' ? 'none' : 'block';
  }

  private removeAnnotation(noteId: string) {
    const marks = this.highlights.get(noteId);
    if (marks) {
      marks.forEach((mark) => {
        const text = document.createTextNode(mark.textContent || '');
        mark.parentNode?.replaceChild(text, mark);
      });
      this.highlights.delete(noteId);
    }
    const bubble = this.bubbles.get(noteId);
    if (bubble) { bubble.remove(); this.bubbles.delete(noteId); }
  }

  private clearAll() { this.highlights.forEach((_, id) => this.removeAnnotation(id)); }
}
