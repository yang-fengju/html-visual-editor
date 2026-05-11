export type ToolbarAction = 'undo' | 'redo' | 'insert' | 'export' | 'copy-html' | 'exit';

export class Toolbar {
  private toolbar: HTMLDivElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private onActionCallbacks: Array<(action: ToolbarAction) => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'main-toolbar';
    this.toolbar.innerHTML = `
      <div class="toolbar-left">
        <span class="toolbar-brand">HTML Visual Editor</span>
        <span class="toolbar-separator"></span>
        <button data-action="undo" title="撤销 (Ctrl+Z)" disabled>&#8630; 撤销</button>
        <button data-action="redo" title="重做 (Ctrl+Y)" disabled>&#8631; 重做</button>
      </div>
      <div class="toolbar-right">
        <button data-action="insert" title="插入元素">+ 插入</button>
        <button data-action="copy-html" title="复制 HTML">复制</button>
        <button data-action="export" title="导出 HTML">导出</button>
        <span class="toolbar-separator"></span>
        <button data-action="exit" class="exit-btn" title="退出编辑模式">退出</button>
      </div>
    `;
    this.undoBtn = this.toolbar.querySelector('[data-action="undo"]')!;
    this.redoBtn = this.toolbar.querySelector('[data-action="redo"]')!;
    this.toolbar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const action = btn.dataset.action as ToolbarAction;
      if (action) this.onActionCallbacks.forEach((cb) => cb(action));
    });

    const style = document.createElement('style');
    style.textContent = `
      .main-toolbar {
        position: fixed; top: 0; left: 0; width: 100%; height: 44px; background: #fff;
        border-bottom: 1px solid #e0e0e0; display: flex; align-items: center;
        justify-content: space-between; padding: 0 12px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.08); z-index: 10; pointer-events: auto;
      }
      .toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 4px; }
      .toolbar-brand { font-weight: 600; font-size: 14px; color: #4285f4; margin-right: 8px; }
      .toolbar-separator { width: 1px; height: 24px; background: #e0e0e0; margin: 0 6px; }
      .main-toolbar button {
        background: none; border: 1px solid transparent; border-radius: 4px;
        padding: 6px 10px; font-size: 13px; cursor: pointer; color: #555;
        transition: all 0.15s; white-space: nowrap;
      }
      .main-toolbar button:hover:not(:disabled) { background: #f0f0f0; border-color: #ddd; }
      .main-toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
      .exit-btn { color: #d93025 !important; }
      .exit-btn:hover { background: #fce8e6 !important; border-color: #d93025 !important; }
    `;
    this.shadowRoot.appendChild(style);
  }

  getElement(): HTMLDivElement { return this.toolbar; }

  updateUndoRedo(canUndo: boolean, canRedo: boolean) {
    this.undoBtn.disabled = !canUndo;
    this.redoBtn.disabled = !canRedo;
  }

  onAction(callback: (action: ToolbarAction) => void) {
    this.onActionCallbacks.push(callback);
  }
}
