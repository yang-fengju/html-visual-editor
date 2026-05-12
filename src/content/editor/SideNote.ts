import type { SideNoteData } from '../../shared/types';
import { NoteManager } from './NoteManager';
import { NoteEditor } from '../ui/NoteEditor';

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

const BLOCK_TAGS = new Set(['P','H1','H2','H3','H4','H5','H6','DIV','SECTION','ARTICLE','BLOCKQUOTE','LI','PRE','FIGCAPTION']);

export class SideNoteRenderer {
  private markers: Map<string, HTMLDivElement> = new Map();
  private noteAreas: Map<string, HTMLDivElement> = new Map();
  private plusIcon: HTMLDivElement | null = null;
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
        position:fixed;width:22px;height:22px;border-radius:50%;
        background:#4285f4;color:white;display:none;align-items:center;
        justify-content:center;font-size:14px;cursor:pointer;
        box-shadow:0 1px 4px rgba(0,0,0,0.2);pointer-events:auto;
        z-index:15;user-select:none;line-height:1;
      }
      .sidenote-marker {
        position:absolute;left:-8px;width:3px;
        background:#4285f4;border-radius:2px;pointer-events:none;
      }
      .sidenote-area {
        background:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;
        padding:10px 14px;margin:6px 0;pointer-events:auto;
      }
      .sidenote-area-header {
        display:flex;justify-content:space-between;align-items:center;
        margin-bottom:6px;font-size:11px;color:#888;
      }
      .sidenote-area-header button {
        background:none;border:none;cursor:pointer;font-size:14px;color:#888;padding:0 2px;
      }
      .sidenote-area-header button:hover { color:#333; }
      ${NoteEditor.getStyles()}
    `;
    this.shadowRoot.appendChild(style);
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
    (this.noteManager.getNotesByType('sidenote') as SideNoteData[]).forEach((n) => this.renderSideNote(n));
  }

  addSideNote(element: HTMLElement) {
    const selector = getSelectorPath(element);
    const existing = (this.noteManager.getNotesByType('sidenote') as SideNoteData[]).find((n) => n.selector === selector);
    if (existing) {
      const area = this.noteAreas.get(existing.id);
      if (area) { const ed = area.querySelector('.note-editor-input') as HTMLTextAreaElement; if (ed) ed.focus(); }
      return;
    }
    const note = this.noteManager.addNote({ type: 'sidenote', content: '', selector }) as SideNoteData;
    this.renderSideNote(note);
    const area = this.noteAreas.get(note.id);
    if (area) { const ed = area.querySelector('.note-editor-input') as HTMLTextAreaElement; if (ed) ed.focus(); }
  }

  destroy() { this.deactivate(); }

  private handleMouseMove(e: MouseEvent) {
    if (!this.active) return;
    const target = e.target as HTMLElement;
    if (target.closest('html-visual-editor') || target.closest('[data-editor-dialog]')) { this.hidePlusIcon(); return; }
    // 用 closest 找最近的块级元素
    const blockTags = Array.from(BLOCK_TAGS).map(t => t.toLowerCase()).join(',');
    const block = target.closest(blockTags) as HTMLElement | null;
    if (!block) { this.hidePlusIcon(); return; }
    this.showPlusIcon(block, e.clientY);
  }

  private showPlusIcon(el: HTMLElement, mouseY: number) {
    if (!this.plusIcon) {
      this.plusIcon = document.createElement('div');
      this.plusIcon.className = 'sidenote-plus';
      this.plusIcon.setAttribute('data-editor-dialog', '');
      this.plusIcon.textContent = '+';
      this.container.appendChild(this.plusIcon);
    }
    const rect = el.getBoundingClientRect();
    this.plusIcon.style.display = 'flex';
    this.plusIcon.style.left = (rect.left - 30) + 'px';
    this.plusIcon.style.top = (mouseY - 11) + 'px';

    // 移除旧点击，添加新的
    const newPlus = this.plusIcon.cloneNode(true) as HTMLDivElement;
    this.plusIcon.replaceWith(newPlus);
    this.plusIcon = newPlus;
    newPlus.addEventListener('click', (e) => { e.stopPropagation(); this.addSideNote(el); this.hidePlusIcon(); });
  }

  private hidePlusIcon() { if (this.plusIcon) this.plusIcon.style.display = 'none'; }

  private renderSideNote(note: SideNoteData) {
    try {
      const el = document.querySelector(note.selector) as HTMLElement;
      if (!el) return;

      // 蓝色标记条
      const marker = document.createElement('div');
      marker.className = 'sidenote-marker';
      marker.setAttribute('data-editor-dialog', '');
      marker.style.height = el.offsetHeight + 'px';
      marker.style.top = el.offsetTop + 'px';
      if (!el.style.position || el.style.position === 'static') el.style.position = 'relative';
      el.appendChild(marker);
      this.markers.set(note.id, marker);

      // 笔记区域
      const area = document.createElement('div');
      area.className = 'sidenote-area';
      area.setAttribute('data-editor-dialog', '');
      const header = document.createElement('div');
      header.className = 'sidenote-area-header';
      header.innerHTML = '<span>段落笔记</span>';
      const delBtn = document.createElement('button');
      delBtn.textContent = '\u00d7'; delBtn.title = '删除笔记';
      delBtn.addEventListener('click', () => {
        this.noteManager.deleteNote(note.id);
        marker.remove(); area.remove();
        this.markers.delete(note.id); this.noteAreas.delete(note.id);
      });
      header.appendChild(delBtn);
      area.appendChild(header);

      const editor = new NoteEditor();
      editor.setValue(note.content);
      editor.onSave((content) => { this.noteManager.updateNote(note.id, { content }); });
      const ta = editor.getElement().querySelector('textarea');
      if (ta) ta.addEventListener('blur', () => { this.noteManager.updateNote(note.id, { content: editor.getValue() }); });
      area.appendChild(editor.getElement());

      el.insertAdjacentElement('afterend', area);
      this.noteAreas.set(note.id, area);
    } catch { /* 元素不存在 */ }
  }

  private clearAll() {
    this.markers.forEach((m) => m.remove()); this.markers.clear();
    this.noteAreas.forEach((a) => a.remove()); this.noteAreas.clear();
  }
}
