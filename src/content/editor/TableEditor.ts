import { History } from './History';
import { TableToolbar, type TableAction } from '../ui/TableToolbar';

export class TableEditor {
  private tableToolbar: TableToolbar;
  private activeTable: HTMLTableElement | null = null;
  private activeCell: HTMLTableCellElement | null = null;

  constructor(private history: History, shadowRoot: ShadowRoot, container: HTMLDivElement) {
    this.tableToolbar = new TableToolbar(shadowRoot);
    container.appendChild(this.tableToolbar.getElement());
    this.tableToolbar.onAction((action, value) => { this.handleAction(action, value); });
  }

  activateForTable(table: HTMLTableElement, cell: HTMLTableCellElement) {
    this.activeTable = table;
    this.activeCell = cell;
    cell.contentEditable = 'true';
    cell.focus();
    const rect = table.getBoundingClientRect();
    this.tableToolbar.show(rect.left, rect.top - 44);
  }

  deactivate() {
    if (this.activeCell) this.activeCell.contentEditable = 'false';
    this.activeTable = null;
    this.activeCell = null;
    this.tableToolbar.hide();
  }

  isTableElement(el: HTMLElement): boolean { return el.closest('table') !== null; }

  getTableAndCell(el: HTMLElement): { table: HTMLTableElement; cell: HTMLTableCellElement } | null {
    const cell = el.closest('td, th') as HTMLTableCellElement | null;
    const table = el.closest('table') as HTMLTableElement | null;
    if (!cell || !table) return null;
    return { table, cell };
  }

  destroy() { this.deactivate(); this.tableToolbar.getElement().remove(); }

  private handleAction(action: TableAction, value?: string) {
    if (!this.activeTable || !this.activeCell) return;
    const table = this.activeTable;
    const cell = this.activeCell;
    const row = cell.parentElement as HTMLTableRowElement;
    const rowIndex = row.rowIndex;
    const cellIndex = cell.cellIndex;
    const beforeHTML = table.outerHTML;

    switch (action) {
      case 'add-row-above': this.insertRow(table, rowIndex); break;
      case 'add-row-below': this.insertRow(table, rowIndex + 1); break;
      case 'add-col-left': this.insertColumn(table, cellIndex); break;
      case 'add-col-right': this.insertColumn(table, cellIndex + 1); break;
      case 'delete-row': if (table.rows.length > 1) table.deleteRow(rowIndex); break;
      case 'delete-col': this.deleteColumn(table, cellIndex); break;
      case 'merge-cells': this.mergeCells(); break;
      case 'split-cell': this.splitCell(cell); break;
      case 'cell-bg-color': if (value) cell.style.backgroundColor = value; break;
    }

    const afterHTML = table.outerHTML;
    if (beforeHTML !== afterHTML) {
      this.history.push('table-structure',
        () => { table.outerHTML = beforeHTML; },
        () => { table.outerHTML = afterHTML; }
      );
    }
  }

  private insertRow(table: HTMLTableElement, index: number) {
    const colCount = table.rows[0]?.cells.length || 1;
    const newRow = table.insertRow(index);
    for (let i = 0; i < colCount; i++) {
      const cell = newRow.insertCell();
      cell.textContent = '内容';
      cell.style.cssText = 'border: 1px solid #ddd; padding: 8px;';
    }
  }

  private insertColumn(table: HTMLTableElement, index: number) {
    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];
      const cell = row.insertCell(index);
      cell.textContent = r === 0 ? '新列' : '内容';
      cell.style.cssText = 'border: 1px solid #ddd; padding: 8px;';
    }
  }

  private deleteColumn(table: HTMLTableElement, index: number) {
    for (let r = 0; r < table.rows.length; r++) {
      if (table.rows[r].cells.length > 1) table.rows[r].deleteCell(index);
    }
  }

  private mergeCells() {
    if (!this.activeCell) return;
    const nextCell = this.activeCell.nextElementSibling as HTMLTableCellElement | null;
    if (!nextCell) return;
    const colspan = (this.activeCell.colSpan || 1) + (nextCell.colSpan || 1);
    this.activeCell.colSpan = colspan;
    this.activeCell.textContent += ' ' + nextCell.textContent;
    nextCell.remove();
  }

  private splitCell(cell: HTMLTableCellElement) {
    if (cell.colSpan <= 1) return;
    const newColSpan = cell.colSpan - 1;
    cell.colSpan = 1;
    for (let i = 0; i < newColSpan; i++) {
      const newCell = document.createElement(cell.tagName.toLowerCase()) as HTMLTableCellElement;
      newCell.textContent = '内容';
      newCell.style.cssText = 'border: 1px solid #ddd; padding: 8px;';
      cell.insertAdjacentElement('afterend', newCell);
    }
  }
}
