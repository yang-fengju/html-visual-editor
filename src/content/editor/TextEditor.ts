import { History } from './History';
import type { Toolbar } from '../ui/Toolbar';

export class TextEditor {
  private editingElement: HTMLElement | null = null;
  private originalContent = '';

  constructor(
    private history: History,
    private toolbar: Toolbar
  ) {
    this.toolbar.onTextCommand((cmd, value) => {
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      document.execCommand(cmd, false, value);
    });
  }

  startEditing(element: HTMLElement) {
    if (this.editingElement) this.stopEditing();
    this.editingElement = element;
    this.originalContent = element.innerHTML;
    element.contentEditable = 'true';
    element.focus();
    element.style.outline = '2px solid #4285f4';
    element.style.outlineOffset = '2px';
  }

  stopEditing() {
    if (!this.editingElement) return;
    const el = this.editingElement;
    const before = this.originalContent;
    const after = el.innerHTML;
    el.contentEditable = 'false';
    el.style.outline = '';
    el.style.outlineOffset = '';
    if (before !== after) {
      this.history.push(
        'text-change',
        () => { el.innerHTML = before; },
        () => { el.innerHTML = after; }
      );
    }
    this.editingElement = null;
    this.originalContent = '';
  }

  isEditing(): boolean { return this.editingElement !== null; }
  getEditingElement(): HTMLElement | null { return this.editingElement; }

  destroy() {
    this.stopEditing();
  }
}
