export class ShadowHost {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private container: HTMLDivElement;

  constructor() {
    this.host = document.createElement('html-visual-editor');
    this.host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 100%; z-index: 2147483647; pointer-events: none;';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = this.getBaseStyles();
    this.shadow.appendChild(style);

    this.container = document.createElement('div');
    this.container.className = 'editor-root';
    this.shadow.appendChild(this.container);
  }

  mount() { document.documentElement.appendChild(this.host); }
  unmount() { this.host.remove(); }
  getContainer(): HTMLDivElement { return this.container; }
  getShadowRoot(): ShadowRoot { return this.shadow; }

  private getBaseStyles(): string {
    return `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px; color: #333;
      }
      .editor-root { position: relative; width: 100%; pointer-events: none; }
      .editor-root > * { pointer-events: auto; }
      .first-time-hint {
        position: fixed; top: 52px; left: 50%; transform: translateX(-50%);
        background: #1a73e8; color: white; padding: 8px 16px; border-radius: 8px;
        font-size: 13px; display: flex; align-items: center; gap: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10; white-space: nowrap;
      }
      .first-time-hint button {
        background: none; border: none; color: white; cursor: pointer;
        font-size: 16px; padding: 0 2px; opacity: 0.8;
      }
      .first-time-hint button:hover { opacity: 1; }
    `;
  }

  showFirstTimeHint() {
    const hint = document.createElement('div');
    hint.className = 'first-time-hint';
    hint.innerHTML = `
      <span>您正在编辑本地副本，不会影响原始网站</span>
      <button class="hint-close">&times;</button>
    `;
    hint.querySelector('.hint-close')!.addEventListener('click', () => {
      hint.remove();
      chrome.storage.local.set({ hintDismissed: true });
    });
    this.container.appendChild(hint);
  }
}
