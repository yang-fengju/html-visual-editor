import type { InsertableElement } from '../../shared/types';

interface InsertItem { type: InsertableElement; label: string; icon: string; category: string; }

const INSERT_ITEMS: InsertItem[] = [
  { type: 'paragraph', label: '段落', icon: '&#182;', category: '基础' },
  { type: 'heading-1', label: '标题 1', icon: 'H1', category: '基础' },
  { type: 'heading-2', label: '标题 2', icon: 'H2', category: '基础' },
  { type: 'heading-3', label: '标题 3', icon: 'H3', category: '基础' },
  { type: 'image', label: '图片', icon: '&#128247;', category: '基础' },
  { type: 'link', label: '链接', icon: '&#128279;', category: '基础' },
  { type: 'button', label: '按钮', icon: '&#9634;', category: '基础' },
  { type: 'divider', label: '分割线', icon: '&#8212;', category: '基础' },
  { type: 'ordered-list', label: '有序列表', icon: '1.', category: '基础' },
  { type: 'unordered-list', label: '无序列表', icon: '&#8226;', category: '基础' },
  { type: 'table', label: '表格', icon: '&#9638;', category: '复杂' },
  { type: 'video', label: '视频', icon: '&#9654;', category: '多媒体' },
  { type: 'audio', label: '音频', icon: '&#9835;', category: '多媒体' },
  { type: 'form-input', label: '输入框', icon: '&#9997;', category: '表单' },
  { type: 'form-textarea', label: '文本域', icon: '&#9776;', category: '表单' },
  { type: 'form-select', label: '下拉框', icon: '&#9660;', category: '表单' },
  { type: 'form-checkbox', label: '复选框', icon: '&#9745;', category: '表单' },
  { type: 'form-radio', label: '单选框', icon: '&#9673;', category: '表单' },
  { type: 'form-button', label: '提交按钮', icon: '&#10004;', category: '表单' },
  { type: 'code-block', label: '代码块', icon: '{ }', category: '复杂' },
];

export class InsertPanel {
  private panel: HTMLDivElement;
  private onInsertCallbacks: Array<(type: InsertableElement) => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.panel = document.createElement('div');
    this.panel.className = 'insert-panel';

    const header = document.createElement('div');
    header.className = 'insert-panel-header';
    header.innerHTML = `<span>插入元素</span><button class="insert-panel-close">&times;</button>`;
    header.querySelector('.insert-panel-close')!.addEventListener('click', () => this.hide());
    this.panel.appendChild(header);

    const categories = ['基础', '复杂', '多媒体', '表单'];
    categories.forEach((cat) => {
      const items = INSERT_ITEMS.filter((i) => i.category === cat);
      if (items.length === 0) return;
      const section = document.createElement('div');
      section.className = 'insert-section';
      section.innerHTML = `<div class="insert-section-title">${cat}</div>`;
      const grid = document.createElement('div');
      grid.className = 'insert-grid';
      items.forEach((item) => {
        const btn = document.createElement('button');
        btn.className = 'insert-item';
        btn.innerHTML = `<span class="insert-icon">${item.icon}</span><span class="insert-label">${item.label}</span>`;
        btn.addEventListener('click', () => { this.onInsertCallbacks.forEach((cb) => cb(item.type)); this.hide(); });
        grid.appendChild(btn);
      });
      section.appendChild(grid);
      this.panel.appendChild(section);
    });

    const style = document.createElement('style');
    style.textContent = `
      .insert-panel {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        width: 480px; max-height: 80vh; overflow-y: auto; z-index: 20; display: none; pointer-events: auto;
      }
      .insert-panel.visible { display: block; }
      .insert-panel-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 16px 20px; border-bottom: 1px solid #eee; font-weight: 600;
        font-size: 15px; position: sticky; top: 0; background: white; border-radius: 12px 12px 0 0;
      }
      .insert-panel-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #888; }
      .insert-section { padding: 12px 20px; }
      .insert-section-title { font-size: 12px; color: #888; margin-bottom: 8px; text-transform: uppercase; }
      .insert-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .insert-item {
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        padding: 12px 8px; background: #f8f8f8; border: 1px solid transparent;
        border-radius: 8px; cursor: pointer; transition: all 0.15s;
      }
      .insert-item:hover { background: #e8f0fe; border-color: #4285f4; }
      .insert-icon { font-size: 20px; }
      .insert-label { font-size: 11px; color: #555; }
    `;
    this.shadowRoot.appendChild(style);
  }

  getElement(): HTMLDivElement { return this.panel; }
  show() { this.panel.classList.add('visible'); }
  hide() { this.panel.classList.remove('visible'); }

  onInsert(callback: (type: InsertableElement) => void) {
    this.onInsertCallbacks.push(callback);
  }
}
