export type TableAction =
  | 'add-row-above' | 'add-row-below'
  | 'add-col-left' | 'add-col-right'
  | 'delete-row' | 'delete-col'
  | 'merge-cells' | 'split-cell'
  | 'cell-bg-color' | 'cell-border';

export class TableToolbar {
  private toolbar: HTMLDivElement;
  private onActionCallbacks: Array<(action: TableAction, value?: string) => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'table-toolbar';
    this.toolbar.innerHTML = `
      <button data-action="add-row-above" title="上方插入行">&uarr;+ 行</button>
      <button data-action="add-row-below" title="下方插入行">&darr;+ 行</button>
      <button data-action="add-col-left" title="左侧插入列">&larr;+ 列</button>
      <button data-action="add-col-right" title="右侧插入列">&rarr;+ 列</button>
      <span class="tt-separator"></span>
      <button data-action="delete-row" title="删除行" class="danger">- 行</button>
      <button data-action="delete-col" title="删除列" class="danger">- 列</button>
      <span class="tt-separator"></span>
      <button data-action="merge-cells" title="合并单元格">合并</button>
      <button data-action="split-cell" title="拆分单元格">拆分</button>
      <span class="tt-separator"></span>
      <input type="color" data-action="cell-bg-color" title="单元格背景色" value="#ffffff">
    `;
    this.toolbar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const action = btn.dataset.action as TableAction;
      this.onActionCallbacks.forEach((cb) => cb(action));
    });
    this.toolbar.querySelector('input[type="color"]')?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      this.onActionCallbacks.forEach((cb) => cb('cell-bg-color', value));
    });

    const style = document.createElement('style');
    style.textContent = `
      .table-toolbar {
        position: fixed; display: none; background: white; border-radius: 8px;
        padding: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); z-index: 15;
        gap: 4px; align-items: center; pointer-events: auto;
      }
      .table-toolbar.visible { display: flex; }
      .table-toolbar button {
        background: none; border: 1px solid transparent; border-radius: 4px;
        padding: 4px 8px; font-size: 12px; cursor: pointer; color: #555; white-space: nowrap;
      }
      .table-toolbar button:hover { background: #f0f0f0; border-color: #ddd; }
      .table-toolbar button.danger { color: #d93025; }
      .table-toolbar button.danger:hover { background: #fce8e6; }
      .tt-separator { width: 1px; height: 20px; background: #e0e0e0; }
      .table-toolbar input[type="color"] { width: 28px; height: 28px; border: 1px solid #ddd; border-radius: 4px; padding: 2px; cursor: pointer; }
    `;
    this.shadowRoot.appendChild(style);
  }

  getElement(): HTMLDivElement { return this.toolbar; }
  show(x: number, y: number) { this.toolbar.style.left = x + 'px'; this.toolbar.style.top = y + 'px'; this.toolbar.classList.add('visible'); }
  hide() { this.toolbar.classList.remove('visible'); }
  onAction(callback: (action: TableAction, value?: string) => void) { this.onActionCallbacks.push(callback); }
}
