interface StyleField {
  label: string;
  prop: string;
  type: 'color' | 'text' | 'range' | 'select';
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

const STYLE_FIELDS: StyleField[] = [
  { label: '背景色', prop: 'backgroundColor', type: 'color' },
  { label: '文字颜色', prop: 'color', type: 'color' },
  { label: '透明度', prop: 'opacity', type: 'range', min: 0, max: 100 },
  { label: '边框宽度', prop: 'borderWidth', type: 'text', unit: 'px' },
  { label: '边框颜色', prop: 'borderColor', type: 'color' },
  { label: '边框样式', prop: 'borderStyle', type: 'select', options: ['none', 'solid', 'dashed', 'dotted', 'double'] },
  { label: '圆角', prop: 'borderRadius', type: 'text', unit: 'px' },
  { label: '阴影', prop: 'boxShadow', type: 'text' },
  { label: '内边距', prop: 'padding', type: 'text', unit: 'px' },
  { label: '外边距', prop: 'margin', type: 'text', unit: 'px' },
];

export class StylePanel {
  private panel: HTMLDivElement;
  private fieldsContainer: HTMLDivElement;
  private currentElement: HTMLElement | null = null;
  private onChangeCallbacks: Array<(element: HTMLElement, prop: string, value: string) => void> = [];
  private onPreviewCallbacks: Array<(element: HTMLElement, prop: string, value: string) => void> = [];
  private onHideCallbacks: Array<() => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.panel = document.createElement('div');
    this.panel.className = 'style-panel';

    const header = document.createElement('div');
    header.className = 'style-panel-header';
    header.innerHTML = `<span>样式编辑</span><button class="style-panel-close">&times;</button>`;
    header.querySelector('.style-panel-close')!.addEventListener('click', () => {
      this.hide();
      this.onHideCallbacks.forEach(cb => cb());
    });

    this.fieldsContainer = document.createElement('div');
    this.fieldsContainer.className = 'style-panel-fields';

    this.panel.appendChild(header);
    this.panel.appendChild(this.fieldsContainer);

    const style = document.createElement('style');
    style.textContent = `
      .style-panel {
        position: fixed; right: -300px; top: 48px; width: 280px; height: calc(100vh - 48px);
        background: white; box-shadow: -2px 0 12px rgba(0,0,0,0.15); overflow-y: auto;
        transition: right 0.3s ease; z-index: 10; pointer-events: auto;
      }
      .style-panel.visible { right: 0; }
      .style-panel-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 16px; border-bottom: 1px solid #eee; font-weight: 600;
        font-size: 14px; position: sticky; top: 0; background: white;
      }
      .style-panel-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #888; padding: 0; }
      .style-panel-close:hover { color: #333; }
      .style-panel-fields { padding: 12px 16px; }
      .style-field { margin-bottom: 12px; }
      .style-field label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; }
      .style-field input[type="text"], .style-field select {
        width: 100%; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;
      }
      .style-field input[type="color"] { width: 40px; height: 30px; padding: 2px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
      .style-field input[type="range"] { width: 100%; }
      .style-field .color-row { display: flex; align-items: center; gap: 8px; }
      .style-field .color-row input[type="text"] { flex: 1; }
    `;
    this.shadowRoot.appendChild(style);
  }

  getElement(): HTMLDivElement { return this.panel; }

  show(element: HTMLElement) {
    this.currentElement = element;
    this.buildFields(element);
    this.panel.classList.add('visible');
  }

  hide() { this.panel.classList.remove('visible'); this.currentElement = null; }

  isVisible(): boolean { return this.panel.classList.contains('visible'); }

  onHide(callback: () => void) { this.onHideCallbacks.push(callback); }

  onChange(callback: (element: HTMLElement, prop: string, value: string) => void) {
    this.onChangeCallbacks.push(callback);
  }

  onPreview(callback: (element: HTMLElement, prop: string, value: string) => void) {
    this.onPreviewCallbacks.push(callback);
  }

  private buildFields(element: HTMLElement) {
    this.fieldsContainer.innerHTML = '';
    const computed = window.getComputedStyle(element);

    STYLE_FIELDS.forEach((field) => {
      const div = document.createElement('div');
      div.className = 'style-field';
      const label = document.createElement('label');
      label.textContent = field.label;
      div.appendChild(label);

      const currentValue = computed.getPropertyValue(field.prop.replace(/([A-Z])/g, '-$1').toLowerCase());

      if (field.type === 'color') {
        const row = document.createElement('div');
        row.className = 'color-row';
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = this.rgbToHex(currentValue);
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.value = currentValue;
        colorInput.addEventListener('input', () => {
          textInput.value = colorInput.value;
          this.applyPreview(field.prop, colorInput.value);
        });
        colorInput.addEventListener('change', () => {
          this.applyChange(field.prop, colorInput.value);
        });
        textInput.addEventListener('change', () => { this.applyChange(field.prop, textInput.value); });
        row.appendChild(colorInput);
        row.appendChild(textInput);
        div.appendChild(row);
      } else if (field.type === 'select') {
        const select = document.createElement('select');
        field.options!.forEach((opt) => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          if (currentValue.includes(opt)) option.selected = true;
          select.appendChild(option);
        });
        select.addEventListener('change', () => { this.applyChange(field.prop, select.value); });
        div.appendChild(select);
      } else if (field.type === 'range') {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(field.min ?? 0);
        input.max = String(field.max ?? 100);
        input.value = String(parseFloat(currentValue) * 100 || 100);
        input.addEventListener('input', () => { this.applyPreview(field.prop, String(parseInt(input.value) / 100)); });
        input.addEventListener('change', () => { this.applyChange(field.prop, String(parseInt(input.value) / 100)); });
        div.appendChild(input);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
        input.placeholder = field.unit ? `例如: 10${field.unit}` : '';
        input.addEventListener('change', () => {
          let val = input.value;
          if (field.unit && val && !val.endsWith(field.unit) && /^\d+$/.test(val)) {
            val += field.unit;
            input.value = val;
          }
          this.applyChange(field.prop, val);
        });
        div.appendChild(input);
      }
      this.fieldsContainer.appendChild(div);
    });
  }

  private applyPreview(prop: string, value: string) {
    if (this.currentElement) {
      this.onPreviewCallbacks.forEach((cb) => cb(this.currentElement!, prop, value));
    }
  }

  private applyChange(prop: string, value: string) {
    if (this.currentElement) {
      this.onChangeCallbacks.forEach((cb) => cb(this.currentElement!, prop, value));
    }
  }

  private rgbToHex(rgb: string): string {
    if (!rgb || rgb === 'transparent') return '#000000';
    // 支持 rgb() 和 rgba()
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) {
      // 如果已经是 hex 格式直接返回
      if (rgb.startsWith('#')) return rgb;
      return '#000000';
    }
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
}
