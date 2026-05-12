import { History } from './History';

export class FormEditor {
  constructor(private history: History) {}

  isFormElement(el: HTMLElement): boolean {
    const formTags = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LABEL'];
    return formTags.includes(el.tagName) || el.closest('form') !== null;
  }

  showPropertyEditor(element: HTMLElement) {
    const fields = this.getEditableProperties(element);

    const dialog = document.createElement('div');
    dialog.setAttribute('data-editor-dialog', '');
    dialog.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); padding: 24px; z-index: 2147483647; min-width: 360px;`;

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin: 0 0 16px;';
    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0; font-size: 16px;';
    title.textContent = `编辑表单属性 - <${element.tagName.toLowerCase()}>`;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7';
    closeBtn.style.cssText = 'background: none; border: none; font-size: 22px; cursor: pointer; color: #888; padding: 0 4px;';
    header.appendChild(title);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    const inputs: Map<string, HTMLInputElement | HTMLTextAreaElement> = new Map();

    fields.forEach((field) => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'margin-bottom: 12px;';

      const label = document.createElement('label');
      label.style.cssText = 'display: block; font-size: 13px; margin-bottom: 4px;';
      label.textContent = field.label;
      wrapper.appendChild(label);

      if (field.type === 'options') {
        const textarea = document.createElement('textarea');
        textarea.id = `form-${field.prop}`;
        textarea.rows = 4;
        textarea.style.cssText = 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;';
        textarea.value = field.value;
        wrapper.appendChild(textarea);
        const small = document.createElement('small');
        small.style.cssText = 'color: #888; font-size: 11px;';
        small.textContent = '每行一个选项';
        wrapper.appendChild(small);
        inputs.set(field.prop, textarea);
      } else {
        const input = document.createElement('input');
        input.type = field.type;
        input.id = `form-${field.prop}`;
        input.value = field.value;
        input.style.cssText = 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;';
        wrapper.appendChild(input);
        inputs.set(field.prop, input);
      }

      dialog.appendChild(wrapper);
    });

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px;';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;';
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确认';
    confirmBtn.style.cssText = 'padding: 8px 16px; border: none; border-radius: 4px; background: #4285f4; color: white; cursor: pointer;';
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    dialog.appendChild(btnRow);

    const overlay = document.createElement('div');
    overlay.setAttribute('data-editor-dialog', '');
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 2147483646;';
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    const cleanup = () => { dialog.remove(); overlay.remove(); };
    closeBtn.addEventListener('click', cleanup);
    cancelBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', cleanup);

    confirmBtn.addEventListener('click', () => {
      const beforeHTML = element.outerHTML;
      fields.forEach((field) => {
        const input = inputs.get(field.prop);
        if (!input) return;
        if (field.prop === 'options' && element instanceof HTMLSelectElement) {
          element.innerHTML = '';
          input.value.split('\n').filter(Boolean).forEach((text) => {
            const opt = document.createElement('option');
            opt.textContent = text.trim();
            opt.value = text.trim();
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
