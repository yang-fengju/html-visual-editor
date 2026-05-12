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
        position:fixed;min-width:220px;min-height:150px;border-radius:4px;
        box-shadow:0 3px 12px rgba(0,0,0,0.15);z-index:15;pointer-events:auto;
        display:flex;flex-direction:column;
      }
      .sticky-header {
        display:flex;align-items:center;justify-content:space-between;
        padding:6px 10px;cursor:grab;user-select:none;border-radius:4px 4px 0 0;
        font-size:11px;color:#666;
      }
      .sticky-header-actions { display:flex;gap:2px; }
      .sticky-header-actions button {
        background:none;border:none;cursor:pointer;font-size:13px;
        color:#888;padding:2px 4px;border-radius:3px;
      }
      .sticky-header-actions button:hover { background:rgba(0,0,0,0.08);color:#333; }
      .sticky-body { flex:1;padding:0 10px 10px;overflow-y:auto; }
      .sticky-minimized {
        width:36px!important;height:36px!important;min-width:36px!important;
        min-height:36px!important;border-radius:50%!important;
        cursor:pointer;display:flex;align-items:center;justify-content:center;
        font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.2);
      }
      .sticky-minimized .sticky-header,.sticky-minimized .sticky-body { display:none; }
      .sticky-color-picker { display:flex;gap:4px;padding:4px 0; }
      .sticky-color-dot {
        width:16px;height:16px;border-radius:50%;cursor:pointer;border:2px solid transparent;
      }
      .sticky-color-dot.active { border-color:#333; }
      .sticky-resize-handle { position:absolute;bottom:0;right:0;width:16px;height:16px;cursor:se-resize; }
      ${NoteEditor.getStyles()}
    `;
    this.shadowRoot.appendChild(style);
  }

  activate() { this.active = true; this.renderAll(); }
  deactivate() { this.active = false; this.clearAll(); }

  createSticky(x?: number, y?: number) {
    const note = this.noteManager.addNote({
      type: 'sticky', content: '',
      x: x ?? window.innerWidth / 2 - 110, y: y ?? window.innerHeight / 2 - 75,
      width: 260, height: 200, color: 'yellow', minimized: false,
    }) as StickyNoteData;
    this.renderSticky(note);
  }

  renderAll() {
    this.clearAll();
    (this.noteManager.getNotesByType('sticky') as StickyNoteData[]).forEach((n) => this.renderSticky(n));
  }

  destroy() { this.deactivate(); }

  private renderSticky(note: StickyNoteData) {
    const colors = STICKY_COLORS[note.color] || STICKY_COLORS.yellow;
    const el = document.createElement('div');
    el.className = note.minimized ? 'sticky-note sticky-minimized' : 'sticky-note';
    el.style.cssText = `left:${note.x}px;top:${note.y}px;width:${note.width}px;height:${note.height}px;background:${colors.bg};border-left:3px solid ${colors.border};`;

    if (note.minimized) {
      el.textContent = '\u{1F4DD}';
      el.addEventListener('click', () => {
        this.noteManager.updateNote(note.id, { minimized: false });
        el.remove(); this.stickies.delete(note.id);
        const updated = this.noteManager.getNote(note.id) as StickyNoteData;
        if (updated) this.renderSticky(updated);
      });
    } else {
      const header = document.createElement('div');
      header.className = 'sticky-header';
      header.textContent = '便签';
      const actions = document.createElement('div');
      actions.className = 'sticky-header-actions';

      const colorBtn = document.createElement('button');
      colorBtn.innerHTML = '&#9679;'; colorBtn.title = '更换颜色';
      colorBtn.style.color = colors.border;
      colorBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showColorPicker(note, el); });

      const minBtn = document.createElement('button');
      minBtn.textContent = '\u2212'; minBtn.title = '最小化';
      minBtn.addEventListener('click', () => {
        this.noteManager.updateNote(note.id, { minimized: true });
        el.remove(); this.stickies.delete(note.id);
        const updated = this.noteManager.getNote(note.id) as StickyNoteData;
        if (updated) this.renderSticky(updated);
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = '\u00d7'; delBtn.title = '删除便签';
      delBtn.addEventListener('click', () => {
        this.noteManager.deleteNote(note.id); el.remove(); this.stickies.delete(note.id);
      });

      actions.appendChild(colorBtn); actions.appendChild(minBtn); actions.appendChild(delBtn);
      header.appendChild(actions); el.appendChild(header);
      this.setupDrag(header, el, note);

      const body = document.createElement('div');
      body.className = 'sticky-body';
      const editor = new NoteEditor();
      editor.setValue(note.content);
      editor.onSave((content) => { this.noteManager.updateNote(note.id, { content }); });
      const ta = editor.getElement().querySelector('textarea');
      if (ta) ta.addEventListener('blur', () => { this.noteManager.updateNote(note.id, { content: editor.getValue() }); });
      body.appendChild(editor.getElement());
      el.appendChild(body);

      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'sticky-resize-handle';
      this.setupResize(resizeHandle, el, note);
      el.appendChild(resizeHandle);
    }

    this.container.appendChild(el);
    this.stickies.set(note.id, el);
  }

  private setupDrag(handle: HTMLElement, el: HTMLDivElement, note: StickyNoteData) {
    let sx = 0, sy = 0, sl = 0, st = 0;
    const onMove = (e: PointerEvent) => { el.style.left = (sl + e.clientX - sx) + 'px'; el.style.top = (st + e.clientY - sy) + 'px'; };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this.noteManager.updateNote(note.id, { x: parseInt(el.style.left), y: parseInt(el.style.top) });
    };
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); sx = e.clientX; sy = e.clientY; sl = parseInt(el.style.left); st = parseInt(el.style.top);
      document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
    });
  }

  private setupResize(handle: HTMLElement, el: HTMLDivElement, note: StickyNoteData) {
    let sx = 0, sy = 0, sw = 0, sh = 0;
    const onMove = (e: PointerEvent) => {
      el.style.width = Math.max(180, sw + e.clientX - sx) + 'px';
      el.style.height = Math.max(100, sh + e.clientY - sy) + 'px';
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this.noteManager.updateNote(note.id, { width: parseInt(el.style.width), height: parseInt(el.style.height) });
    };
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      sx = e.clientX; sy = e.clientY; sw = el.offsetWidth; sh = el.offsetHeight;
      document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
    });
  }

  private showColorPicker(note: StickyNoteData, el: HTMLDivElement) {
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
        el.remove(); this.stickies.delete(note.id);
        const updated = this.noteManager.getNote(note.id) as StickyNoteData;
        if (updated) this.renderSticky(updated);
      });
      picker.appendChild(dot);
    });
    el.querySelector('.sticky-header')?.after(picker);
  }

  private clearAll() { this.stickies.forEach((el) => el.remove()); this.stickies.clear(); }
}
