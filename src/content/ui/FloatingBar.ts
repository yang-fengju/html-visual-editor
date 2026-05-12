export class FloatingBar {
  private bar: HTMLDivElement;
  private onCommandCallbacks: Array<(cmd: string, value?: string) => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.bar = document.createElement('div');
    this.bar.className = 'floating-bar';
    this.bar.innerHTML = `
      <button data-cmd="bold" title="加粗"><b>B</b></button>
      <button data-cmd="italic" title="斜体"><i>I</i></button>
      <button data-cmd="underline" title="下划线"><u>U</u></button>
      <button data-cmd="strikeThrough" title="删除线"><s>S</s></button>
      <span class="separator"></span>
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
      <span class="separator"></span>
      <button data-cmd="justifyLeft" title="左对齐">&#8676;</button>
      <button data-cmd="justifyCenter" title="居中">&#8596;</button>
      <button data-cmd="justifyRight" title="右对齐">&#8677;</button>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .floating-bar {
        position: fixed; display: none; background: #2d2d2d; border-radius: 6px;
        padding: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10;
        gap: 2px; align-items: center; pointer-events: auto;
      }
      .floating-bar.visible { display: flex; }
      .floating-bar button {
        background: none; border: none; color: white; width: 28px; height: 28px;
        border-radius: 4px; cursor: pointer; font-size: 13px;
        display: flex; align-items: center; justify-content: center;
      }
      .floating-bar button:hover { background: rgba(255,255,255,0.15); }
      .floating-bar button.active { background: rgba(255,255,255,0.25); }
      .floating-bar select {
        background: #444; color: white; border: none; border-radius: 4px;
        padding: 4px; font-size: 12px; cursor: pointer;
      }
      .floating-bar input[type="color"] {
        width: 28px; height: 28px; padding: 2px; border: none;
        border-radius: 4px; cursor: pointer; background: none;
      }
      .floating-bar .separator {
        width: 1px; height: 20px; background: rgba(255,255,255,0.2); margin: 0 2px;
      }
    `;
    this.shadowRoot.appendChild(style);

    this.bar.addEventListener('mousedown', (e) => {
      // 只对按钮阻止默认行为（保持文本选区），不影响 select 和 color input
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        e.preventDefault();
      }
    });

    this.bar.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd!;
        this.onCommandCallbacks.forEach((cb) => cb(cmd));
      });
    });

    this.bar.querySelectorAll('select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const cmd = sel.dataset.cmd!;
        this.onCommandCallbacks.forEach((cb) => cb(cmd, sel.value));
        sel.value = '';
      });
    });

    this.bar.querySelector('input[type="color"]')?.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      const cmd = input.dataset.cmd!;
      this.onCommandCallbacks.forEach((cb) => cb(cmd, input.value));
    });
  }

  getElement(): HTMLDivElement { return this.bar; }

  show(x: number, y: number) {
    this.bar.style.left = x + 'px';
    this.bar.style.top = y + 'px';
    this.bar.classList.add('visible');
  }

  hide() { this.bar.classList.remove('visible'); }

  onCommand(callback: (cmd: string, value?: string) => void) {
    this.onCommandCallbacks.push(callback);
  }
}
