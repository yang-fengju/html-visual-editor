import { History } from './History';

export class FormEditor {
  constructor(private history: History) {}

  isFormElement(el: HTMLElement): boolean {
    const formTags = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LABEL'];
    return formTags.includes(el.tagName) || el.closest('form') !== null;
  }

  showPropertyEditor(element: HTMLElement) {
    const fields = this.getEditableProperties(element);
    let fieldsHTML = '';
    fields.forEach((field) => {
      if (field.type === 'options') {
        fieldsHTML += `<div style="margin-bottom: 12px;"><label style="display: block; font-size: 13px; margin-bottom: 4px;">${field.label}</label><textarea id="form-${field.prop}" rows="4" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;">${field.value}</textarea><small style="color: #888; font-size: 11px;">每行一个选项</small></div>`;
      } else {
        fieldsHTML += `<div style="margin-bottom: 12px;"><label style="display: block; font-size: 13px; margin-bottom: 4px;">${field.label}</label><input type="${field.type}" id="form-${field.prop}" value="${field.value}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;"></div>`;
      }
    });

    const dialog = document.createElement('div');
    dialog.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); padding: 24px; z-index: 2147483647; min-width: 360px;`;
    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px; font-size: 16px;">编辑表单属性 - &lt;${element.tagName.toLowerCase()}&gt;</h3>
      ${fieldsHTML}
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button id="form-cancel" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">取消</button>
        <button id="form-confirm" style="padding: 8px 16px; border: none; border-radius: 4px; background: #4285f4; color: white; cursor: pointer;">确认</button>
      </div>
    `;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 2147483646;';
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    const cleanup = () => { dialog.remove(); overlay.remove(); };
    dialog.querySelector('#form-cancel')!.addEventListener('click', cleanup);
    overlay.addEventListener('click', cleanup);

    dialog.querySelector('#form-confirm')!.addEventListener('click', () => {
      const beforeHTML = element.outerHTML;
      fields.forEach((field) => {
        const input = dialog.querySelector(`#form-${field.prop}`) as HTMLInputElement | HTMLTextAreaElement;
        if (!input) return;
        if (field.prop === 'options' && element instanceof HTMLSelectElement) {
          element.innerHTML = '';
          input.value.split('\n').filter(Boolean).forEach((text) => {
            const opt = document.createElement('option');
            opt.textContent = text.trim(); opt.value = text.trim();
            element.appendChild(opt);
          });
        } else if (field.prop === 'textContent') {
          element.textContent = input.value;
        } else {
          (element as any)[field.prop] = input.value;
        }
      });
      const afterHTML = element.outerHTML;
      if (beforeHTML !== afterHTML) {
        this.history.push('form-change', () => { element.outerHTML = beforeHTML; }, () => { element.outerHTML = afterHTML; });
      }
      cleanup();
    });
  }

  private getEditableProperties(element: HTMLElement): Array<{ label: string; prop: string; value: string; type: string }> {
    const fields: Array<{ label: string; prop: string; value: string; type: string }> = [];
    if (element instanceof HTMLInputElement) {
      fields.push({ label: '类型', prop: 'type', value: element.type, type: 'text' }, { label: '占位文字', prop: 'placeholder', value: element.placeholder, type: 'text' }, { label: '默认值', prop: 'value', value: element.value, type: 'text' }, { label: '名称', prop: 'name', value: element.name, type: 'text' });
    } else if (element instanceof HTMLTextAreaElement) {
      fields.push({ label: '占位文字', prop: 'placeholder', value: element.placeholder, type: 'text' }, { label: '行数', prop: 'rows', value: String(element.rows), type: 'number' }, { label: '名称', prop: 'name', value: element.name, type: 'text' });
    } else if (element instanceof HTMLSelectElement) {
      const options = Array.from(element.options).map((o) => o.textContent).join('\n');
      fields.push({ label: '名称', prop: 'name', value: element.name, type: 'text' }, { label: '选项列表', prop: 'options', value: options, type: 'options' });
    } else if (element instanceof HTMLButtonElement) {
      fields.push({ label: '按钮文字', prop: 'textContent', value: element.textContent || '', type: 'text' }, { label: '类型', prop: 'type', value: element.type, type: 'text' });
    }
    return fields;
  }
}
