export type ContextAction =
  | 'copy' | 'delete' | 'move-up' | 'move-down'
  | 'copy-html-element' | 'edit-text'
  | 'add-comment' | 'add-sticky';

interface MenuItem { label: string; action: ContextAction; icon: string; }

const MENU_ITEMS: MenuItem[] = [
  { label: '编辑文本', action: 'edit-text', icon: '&#9998;' },
  { label: '复制元素', action: 'copy', icon: '&#9776;' },
  { label: '复制 HTML', action: 'copy-html-element', icon: '&lt;/&gt;' },
  { label: '上移', action: 'move-up', icon: '&uarr;' },
  { label: '下移', action: 'move-down', icon: '&darr;' },
  { label: '删除', action: 'delete', icon: '&#10005;' },
  { label: '添加笔记', action: 'add-comment', icon: '&#128172;' },
  { label: '添加便签', action: 'add-sticky', icon: '&#128204;' },
];

export class ContextMenu {
  private menu: HTMLDivElement;
  private targetElement: HTMLElement | null = null;
  private onActionCallbacks: Array<(action: ContextAction, target: HTMLElement) => void> = [];
  private clickHandler: () => void;

  constructor(private shadowRoot: ShadowRoot) {
    this.menu = document.createElement('div');
    this.menu.className = 'context-menu';

    MENU_ITEMS.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'context-menu-item';
      if (item.action === 'delete') btn.classList.add('danger');
      btn.innerHTML = `<span class="cm-icon">${item.icon}</span> ${item.label}`;
      btn.addEventListener('click', () => {
        if (this.targetElement) {
          this.onActionCallbacks.forEach((cb) => cb(item.action, this.targetElement!));
        }
        this.hide();
      });
      this.menu.appendChild(btn);
    });

    const style = document.createElement('style');
    style.textContent = `
      .context-menu {
        position: fixed; display: none; background: white; border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15); padding: 4px; min-width: 160px;
        z-index: 20; pointer-events: auto;
      }
      .context-menu.visible { display: block; }
      .context-menu-item {
        display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px;
        background: none; border: none; border-radius: 4px; font-size: 13px;
        color: #333; cursor: pointer; text-align: left;
      }
      .context-menu-item:hover { background: #f0f0f0; }
      .context-menu-item.danger { color: #d93025; }
      .context-menu-item.danger:hover { background: #fce8e6; }
      .cm-icon { width: 18px; text-align: center; font-size: 14px; }
    `;
    this.shadowRoot.appendChild(style);
    this.clickHandler = () => this.hide();
    document.addEventListener('click', this.clickHandler);
  }

  getElement(): HTMLDivElement { return this.menu; }

  show(x: number, y: number, target: HTMLElement) {
    this.targetElement = target;
    this.menu.style.left = x + 'px';
    this.menu.style.top = y + 'px';
    this.menu.classList.add('visible');
    requestAnimationFrame(() => {
      const rect = this.menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) this.menu.style.left = (x - rect.width) + 'px';
      if (rect.bottom > window.innerHeight) this.menu.style.top = (y - rect.height) + 'px';
    });
  }

  hide() { this.menu.classList.remove('visible'); this.targetElement = null; }

  destroy() {
    document.removeEventListener('click', this.clickHandler);
    this.menu.remove();
  }

  onAction(callback: (action: ContextAction, target: HTMLElement) => void) {
    this.onActionCallbacks.push(callback);
  }
}
