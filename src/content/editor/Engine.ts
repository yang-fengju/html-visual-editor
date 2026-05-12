import { History } from './History';
import { SelectionManager } from './SelectionManager';
import { TextEditor } from './TextEditor';
import { StyleEditor } from './StyleEditor';
import { DragSystem } from './DragSystem';
import { ElementManager } from './ElementManager';
import { TableEditor } from './TableEditor';
import { MediaManager } from './MediaManager';
import { FormEditor } from './FormEditor';
import { CodeBlockManager } from './CodeBlock';
import { Toolbar, type ToolbarAction } from '../ui/Toolbar';
import { ContextMenu, type ContextAction } from '../ui/ContextMenu';
import { InsertPanel } from '../ui/InsertPanel';
import { ShadowHost } from '../ui/ShadowHost';
import type { InsertableElement } from '../../shared/types';

export class Engine {
  private history: History;
  private selectionManager: SelectionManager;
  private textEditor: TextEditor;
  private styleEditor: StyleEditor;
  private dragSystem: DragSystem;
  private elementManager: ElementManager;
  private tableEditor: TableEditor;
  private mediaManager: MediaManager;
  private formEditor: FormEditor;
  private codeBlock: CodeBlockManager;
  private toolbar: Toolbar;
  private contextMenu: ContextMenu;
  private insertPanel: InsertPanel;
  private keydownHandler: (e: KeyboardEvent) => void;
  private contextmenuHandler: (e: MouseEvent) => void;
  private originalMarginTop = '';

  constructor(private shadowHost: ShadowHost) {
    const container = shadowHost.getContainer();
    const shadowRoot = shadowHost.getShadowRoot();

    this.history = new History();
    this.selectionManager = new SelectionManager(document.body);
    this.dragSystem = new DragSystem(this.history);
    this.elementManager = new ElementManager(this.history);
    this.mediaManager = new MediaManager(this.history);
    this.formEditor = new FormEditor(this.history);
    this.codeBlock = new CodeBlockManager(this.history);

    this.textEditor = new TextEditor(this.history, shadowRoot, container);
    this.styleEditor = new StyleEditor(this.history, shadowRoot, container);
    this.tableEditor = new TableEditor(this.history, shadowRoot, container);

    this.toolbar = new Toolbar(shadowRoot);
    container.insertBefore(this.toolbar.getElement(), container.firstChild);

    this.contextMenu = new ContextMenu(shadowRoot);
    container.appendChild(this.contextMenu.getElement());

    this.insertPanel = new InsertPanel(shadowRoot);
    container.appendChild(this.insertPanel.getElement());

    this.setupToolbarActions();
    this.setupContextMenuActions();
    this.setupInsertActions();
    this.setupSelectionActions();

    this.keydownHandler = this.handleKeydown.bind(this);
    this.contextmenuHandler = this.handleContextMenu.bind(this);
    document.addEventListener('keydown', this.keydownHandler);
    document.addEventListener('contextmenu', this.contextmenuHandler);

    this.history.onChange(() => {
      this.toolbar.updateUndoRedo(this.history.canUndo, this.history.canRedo);
    });

    this.originalMarginTop = document.body.style.marginTop;
    document.body.style.marginTop = '48px';
    this.selectionManager.activate();
  }

  destroy() {
    this.selectionManager.destroy();
    this.textEditor.destroy();
    this.styleEditor.destroy();
    this.dragSystem.destroy();
    this.tableEditor.deactivate();
    this.history.clear();
    document.removeEventListener('keydown', this.keydownHandler);
    document.removeEventListener('contextmenu', this.contextmenuHandler);
    document.body.style.marginTop = this.originalMarginTop;
  }

  private setupToolbarActions() {
    this.toolbar.onAction((action: ToolbarAction) => {
      switch (action) {
        case 'undo': this.history.undo(); break;
        case 'redo': this.history.redo(); break;
        case 'insert': this.insertPanel.show(); break;
        case 'export':
          chrome.runtime.sendMessage({ type: 'EXPORT_HTML', options: { includeStyles: true, includeResources: false, format: 'html' } });
          break;
        case 'copy-html':
          chrome.runtime.sendMessage({ type: 'COPY_HTML' });
          break;
        case 'exit':
          chrome.runtime.sendMessage({ type: 'TOGGLE_EDIT_MODE', mode: 'browse' });
          break;
      }
    });
  }

  private setupContextMenuActions() {
    this.contextMenu.onAction((action: ContextAction, target: HTMLElement) => {
      switch (action) {
        case 'edit-text': this.textEditor.startEditing(target); break;
        case 'copy': this.elementManager.duplicateElement(target); break;
        case 'copy-html-element': navigator.clipboard.writeText(target.outerHTML); break;
        case 'delete': this.elementManager.deleteElement(target); break;
        case 'move-up': this.elementManager.moveElement(target, 'up'); break;
        case 'move-down': this.elementManager.moveElement(target, 'down'); break;
      }
    });
  }

  private setupInsertActions() {
    this.insertPanel.onInsert((type: InsertableElement) => {
      const newEl = this.elementManager.createElement(type);
      const target = this.selectionManager.getSelectedElement() || document.body.lastElementChild as HTMLElement;
      if (target) this.elementManager.insertElement(newEl, target, 'after');
      else document.body.appendChild(newEl);
    });
  }

  private setupSelectionActions() {
    this.selectionManager.onSelect((el) => {
      if (!el) return;
      this.textEditor.stopEditing();
      this.tableEditor.deactivate();

      const tableResult = this.tableEditor.getTableAndCell(el);
      if (tableResult) { this.tableEditor.activateForTable(tableResult.table, tableResult.cell); return; }
      if (el instanceof HTMLImageElement) { this.mediaManager.showMediaDialog(el); return; }
      if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) { this.mediaManager.showMediaDialog(el); return; }
      if (this.formEditor.isFormElement(el)) { this.formEditor.showPropertyEditor(el); return; }
      if (this.codeBlock.isCodeBlock(el)) { const pre = el.closest('pre') || el; this.codeBlock.editCodeBlock(pre as HTMLElement); return; }
      this.styleEditor.showForElement(el);
    });

    this.selectionManager.onDblClick((el) => {
      const isTextElement = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'LI', 'LABEL', 'TD', 'TH', 'BLOCKQUOTE', 'FIGCAPTION'].includes(el.tagName);
      if (isTextElement || (el.childNodes.length > 0 && el.childNodes[0].nodeType === Node.TEXT_NODE)) {
        this.textEditor.startEditing(el);
      }
    });
  }

  private handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const isEditing = target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT';

    // Ctrl+Z: 撤销（仅在非编辑状态下使用编辑器的撤销）
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey && !isEditing) {
      e.preventDefault();
      this.history.undo();
    }
    // Ctrl+Y 或 Ctrl+Shift+Z: 重做
    if (((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) && !isEditing) {
      e.preventDefault();
      this.history.redo();
    }
    // Escape: 退出当前编辑状态（任何时候都可以）
    if (e.key === 'Escape') {
      this.textEditor.stopEditing();
      this.tableEditor.deactivate();
      this.styleEditor.hide();
      this.contextMenu.hide();
      this.insertPanel.hide();
    }
    // Delete: 删除选中元素（仅在非编辑状态）
    if (e.key === 'Delete' && !isEditing && !this.textEditor.isEditing()) {
      const selected = this.selectionManager.getSelectedElement();
      if (selected) this.elementManager.deleteElement(selected);
    }
  }

  private handleContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('html-visual-editor')) return;
    e.preventDefault();
    this.contextMenu.show(e.clientX, e.clientY, target);
  }
}
