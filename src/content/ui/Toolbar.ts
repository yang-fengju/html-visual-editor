export type ToolbarAction =
  | 'undo' | 'redo'
  | 'insert' | 'export' | 'export-with-notes' | 'export-notes-json' | 'import-notes-json'
  | 'copy-html'
  | 'toggle-comments' | 'toggle-panel' | 'add-sticky'
  | 'exit';

export class Toolbar {
  private toolbar: HTMLDivElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private onActionCallbacks: Array<(action: ToolbarAction) => void> = [];
  private onTextCommandCallbacks: Array<(cmd: string, value?: string) => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'main-toolbar';
    this.toolbar.innerHTML = `
      <div class="toolbar-left">
        <span class="toolbar-brand">HTML Visual Editor</span>
        <span class="toolbar-separator"></span>
        <button data-action="undo" title="撤销 (Ctrl+Z)" disabled>&#8630;</button>
        <button data-action="redo" title="重做 (Ctrl+Y)" disabled>&#8631;</button>
        <span class="toolbar-separator"></span>
        <button data-cmd="bold" title="加粗" class="text-cmd"><b>B</b></button>
        <button data-cmd="italic" title="斜体" class="text-cmd"><i>I</i></button>
        <button data-cmd="underline" title="下划线" class="text-cmd"><u>U</u></button>
        <button data-cmd="strikeThrough" title="删除线" class="text-cmd"><s>S</s></button>
        <span class="toolbar-separator"></span>
        <select data-cmd="fontSize" title="字号">
          <option value="">字号</option>
          <option value="1">12px</option>
          <option value="2">14px</option>
          <option value="3">16px</option>
          <option value="4">18px</option>
          <option value="5">24px</option>
          <option value="6">32px</option>
          <option value="7">48px</option>
        </select>
        <input type="color" data-cmd="foreColor" title="文字颜色" value="#000000">
        <span class="toolbar-separator"></span>
        <button data-cmd="justifyLeft" title="左对齐" class="text-cmd">&#8676;</button>
        <button data-cmd="justifyCenter" title="居中" class="text-cmd">&#8596;</button>
        <button data-cmd="justifyRight" title="右对齐" class="text-cmd">&#8677;</button>
      </div>
      <div class="toolbar-right">
        <button data-action="toggle-comments" title="显示/隐藏笔记">&#128172; 笔记</button>
        <button data-action="add-sticky" title="添加便签">&#128204; 便签</button>
        <button data-action="toggle-panel" title="笔记面板" style="display:none">&#128203; 面板</button>
        <button data-action="insert" title="插入元素">+ 插入</button>
        <button data-action="copy-html" title="复制 HTML">复制</button>
        <div class="export-dropdown">
          <button class="export-trigger" title="导出">导出 &#9660;</button>
          <div class="export-menu">
            <button data-action="export">导出 HTML</button>
            <button data-action="export-with-notes">导出 HTML（含笔记）</button>
            <button data-action="export-notes-json">导出笔记 (JSON)</button>
            <button data-action="import-notes-json">导入笔记 (JSON)</button>
          </div>
        </div>
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

    // 文字格式化按钮：阻止默认行为以保持选区
    this.toolbar.querySelectorAll('.text-cmd').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        const cmd = (btn as HTMLElement).dataset.cmd!;
        this.onTextCommandCallbacks.forEach((cb) => cb(cmd));
      });
    });

    this.toolbar.querySelectorAll('select[data-cmd]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const s = sel as HTMLSelectElement;
        this.onTextCommandCallbacks.forEach((cb) => cb(s.dataset.cmd!, s.value));
        s.value = '';
      });
    });

    this.toolbar.querySelector('input[type="color"]')?.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      this.onTextCommandCallbacks.forEach((cb) => cb(input.dataset.cmd!, input.value));
    });

    const style = document.createElement('style');
    style.textContent = `
      .main-toolbar {
        position: fixed; top: 0; left: 0; width: 100%; height: 44px; box-sizing: border-box; background: #fff;
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
      .export-dropdown { position: relative; }
      .export-menu {
        display: none; position: absolute; top: 100%; right: 0;
        background: white; border: 1px solid #e0e0e0; border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1); min-width: 200px; z-index: 20; padding: 4px;
      }
      .export-dropdown:hover .export-menu { display: block; }
      .export-menu button { display: block; width: 100%; text-align: left; padding: 8px 12px; white-space: nowrap; }
      .export-menu button:hover { background: #f0f0f0; }
      .notes-active { background: #e8f0fe !important; border-color: #4285f4 !important; color: #4285f4 !important; }
      .text-cmd {
        width: 28px; height: 28px; padding: 0 !important;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .text-cmd.active {
        background: #e8f0fe !important; border-color: #4285f4 !important; color: #4285f4 !important;
      }
      .main-toolbar select[data-cmd] {
        background: #f5f5f5; color: #333; border: 1px solid #ddd; border-radius: 4px;
        padding: 4px 6px; font-size: 12px; cursor: pointer; height: 28px;
      }
      .main-toolbar select[data-cmd]:hover { border-color: #bbb; }
      .main-toolbar input[type="color"] {
        width: 28px; height: 28px; padding: 2px; border: 1px solid #ddd;
        border-radius: 4px; cursor: pointer; background: #f5f5f5;
      }
      .main-toolbar input[type="color"]:hover { border-color: #bbb; }
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

  updateCommentsButton(active: boolean) {
    const btn = this.toolbar.querySelector('[data-action="toggle-comments"]') as HTMLButtonElement;
    if (btn) btn.classList.toggle('notes-active', active);
  }

  onTextCommand(callback: (cmd: string, value?: string) => void) {
    this.onTextCommandCallbacks.push(callback);
  }

  updatePanelButton(visible: boolean, active: boolean) {
    const btn = this.toolbar.querySelector('[data-action="toggle-panel"]') as HTMLButtonElement;
    if (btn) {
      btn.style.display = visible ? '' : 'none';
      btn.classList.toggle('notes-active', active);
    }
  }
}
