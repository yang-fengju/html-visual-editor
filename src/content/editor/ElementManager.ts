import { History } from './History';
import type { InsertableElement } from '../../shared/types';

export class ElementManager {
  constructor(private history: History) {}

  createElement(type: InsertableElement): HTMLElement {
    switch (type) {
      case 'paragraph': return this.makeElement('p', '请输入文字...');
      case 'heading-1': return this.makeElement('h1', '标题 1');
      case 'heading-2': return this.makeElement('h2', '标题 2');
      case 'heading-3': return this.makeElement('h3', '标题 3');
      case 'image': {
        const img = document.createElement('img');
        img.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" fill="%23e0e0e0"><rect width="300" height="200"/><text x="150" y="105" text-anchor="middle" fill="%23999" font-size="16">点击替换图片</text></svg>');
        img.alt = '图片'; img.style.maxWidth = '100%'; return img;
      }
      case 'link': { const a = document.createElement('a'); a.href = '#'; a.textContent = '链接文字'; return a; }
      case 'button': {
        const btn = document.createElement('button'); btn.textContent = '按钮';
        btn.style.cssText = 'padding: 8px 16px; font-size: 14px; border-radius: 4px; border: 1px solid #ccc; cursor: pointer;';
        return btn;
      }
      case 'divider': return document.createElement('hr');
      case 'ordered-list': { const ol = document.createElement('ol'); ['列表项 1', '列表项 2', '列表项 3'].forEach((t) => { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }); return ol; }
      case 'unordered-list': { const ul = document.createElement('ul'); ['列表项 1', '列表项 2', '列表项 3'].forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }); return ul; }
      case 'table': return this.createTable(3, 3);
      case 'video': { const v = document.createElement('video'); v.controls = true; v.style.cssText = 'width: 400px; max-width: 100%; background: #000;'; return v; }
      case 'audio': { const a = document.createElement('audio'); a.controls = true; return a; }
      case 'form-input': { const i = document.createElement('input'); i.type = 'text'; i.placeholder = '请输入...'; i.style.cssText = 'padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;'; return i; }
      case 'form-textarea': { const t = document.createElement('textarea'); t.placeholder = '请输入多行文字...'; t.rows = 4; t.style.cssText = 'width: 100%; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;'; return t; }
      case 'form-select': { const s = document.createElement('select'); s.style.cssText = 'padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;'; ['选项 1', '选项 2', '选项 3'].forEach((t) => { const o = document.createElement('option'); o.textContent = t; s.appendChild(o); }); return s; }
      case 'form-checkbox': { const l = document.createElement('label'); l.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 14px;'; const c = document.createElement('input'); c.type = 'checkbox'; l.appendChild(c); l.appendChild(document.createTextNode('复选框')); return l; }
      case 'form-radio': { const l = document.createElement('label'); l.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 14px;'; const r = document.createElement('input'); r.type = 'radio'; l.appendChild(r); l.appendChild(document.createTextNode('单选框')); return l; }
      case 'form-button': { const b = document.createElement('button'); b.type = 'submit'; b.textContent = '提交'; b.style.cssText = 'padding: 8px 20px; font-size: 14px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;'; return b; }
      case 'code-block': { const pre = document.createElement('pre'); const code = document.createElement('code'); code.className = 'language-javascript'; code.textContent = '// 在此输入代码\nconsole.log("Hello World");'; pre.appendChild(code); pre.style.cssText = 'background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace;'; return pre; }
      default: return this.makeElement('div', '未知元素');
    }
  }

  insertElement(newEl: HTMLElement, target: HTMLElement, position: 'before' | 'after' = 'after') {
    if (position === 'after') target.insertAdjacentElement('afterend', newEl);
    else target.insertAdjacentElement('beforebegin', newEl);
    this.history.push('element-insert', () => { newEl.remove(); }, () => {
      if (position === 'after') target.insertAdjacentElement('afterend', newEl);
      else target.insertAdjacentElement('beforebegin', newEl);
    });
  }

  deleteElement(element: HTMLElement) {
    const parent = element.parentElement;
    const nextSibling = element.nextSibling;
    if (!parent) return;
    const html = element.outerHTML;
    element.remove();
    this.history.push('element-delete', () => {
      const restored = document.createRange().createContextualFragment(html).firstElementChild as HTMLElement;
      if (nextSibling) parent.insertBefore(restored, nextSibling);
      else parent.appendChild(restored);
    }, () => { element.remove(); });
  }

  moveElement(element: HTMLElement, direction: 'up' | 'down') {
    const sibling = direction === 'up' ? element.previousElementSibling : element.nextElementSibling;
    if (!sibling) return;
    if (direction === 'up') element.parentElement!.insertBefore(element, sibling);
    else element.parentElement!.insertBefore(sibling, element);
    this.history.push('element-reorder', () => {
      if (direction === 'up') element.parentElement!.insertBefore(sibling, element);
      else element.parentElement!.insertBefore(element, sibling);
    }, () => {
      if (direction === 'up') element.parentElement!.insertBefore(element, sibling);
      else element.parentElement!.insertBefore(sibling, element);
    });
  }

  duplicateElement(element: HTMLElement) {
    const clone = element.cloneNode(true) as HTMLElement;
    element.insertAdjacentElement('afterend', clone);
    this.history.push('element-insert', () => { clone.remove(); }, () => { element.insertAdjacentElement('afterend', clone); });
    return clone;
  }

  private makeElement(tag: string, text: string): HTMLElement {
    const el = document.createElement(tag); el.textContent = text; return el;
  }

  private createTable(rows: number, cols: number): HTMLTableElement {
    const table = document.createElement('table');
    table.style.cssText = 'border-collapse: collapse; width: 100%;';
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement(r === 0 ? 'th' : 'td');
        td.textContent = r === 0 ? `列 ${c + 1}` : '内容';
        td.style.cssText = 'border: 1px solid #ddd; padding: 8px; text-align: left;';
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    return table;
  }
}
