import { History } from './History';
import { FloatingBar } from '../ui/FloatingBar';

export class TextEditor {
  private floatingBar: FloatingBar;
  private editingElement: HTMLElement | null = null;
  private originalContent = '';

  constructor(
    private history: History,
    shadowRoot: ShadowRoot,
    container: HTMLDivElement
  ) {
    this.floatingBar = new FloatingBar(shadowRoot);
    container.appendChild(this.floatingBar.getElement());

    this.floatingBar.onCommand((cmd, value) => {
      document.execCommand(cmd, false, value);
    });

    document.addEventListener('selectionchange', this.handleSelectionChange);
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
    this.floatingBar.hide();
  }

  isEditing(): boolean { return this.editingElement !== null; }

  destroy() {
    this.stopEditing();
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    this.floatingBar.getElement().remove();
  }

  private handleSelectionChange = () => {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !this.editingElement) {
      this.floatingBar.hide();
      return;
    }
    if (!this.editingElement.contains(selection.anchorNode)) {
      this.floatingBar.hide();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    this.floatingBar.show(rect.left + rect.width / 2 - 150, rect.top - 44);
  };
}
