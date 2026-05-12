export class SelectionManager {
  private hoverOverlay: HTMLDivElement;
  private selectOverlay: HTMLDivElement;
  private resizeHandles: HTMLDivElement[] = [];
  private selectedElement: HTMLElement | null = null;
  private onSelectCallbacks: Array<(el: HTMLElement | null) => void> = [];
  private onDblClickCallbacks: Array<(el: HTMLElement) => void> = [];
  private active = false;

  constructor(private pageRoot: HTMLElement) {
    this.hoverOverlay = document.createElement('div');
    this.hoverOverlay.style.cssText = `
      position: fixed; pointer-events: none; z-index: 2147483646;
      border: 2px dashed #4285f4; background: rgba(66,133,244,0.05);
      display: none; transition: all 0.1s ease;
    `;

    this.selectOverlay = document.createElement('div');
    this.selectOverlay.style.cssText = `
      position: fixed; pointer-events: none; z-index: 2147483645;
      border: 2px solid #4285f4; background: rgba(66,133,244,0.08);
      display: none;
    `;

    const positions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    positions.forEach((pos) => {
      const handle = document.createElement('div');
      handle.dataset.handle = pos;
      handle.style.cssText = `
        position: absolute; width: 8px; height: 8px;
        background: #4285f4; border: 1px solid white;
        border-radius: 2px; pointer-events: auto; z-index: 2147483647;
        cursor: ${this.getCursor(pos)};
      `;
      this.positionHandle(handle, pos);
      this.selectOverlay.appendChild(handle);
      this.resizeHandles.push(handle);
    });

    document.body.appendChild(this.hoverOverlay);
    document.body.appendChild(this.selectOverlay);
  }

  activate() {
    this.active = true;
    this.pageRoot.addEventListener('mousemove', this.handleMouseMove);
    this.pageRoot.addEventListener('click', this.handleClick);
    this.pageRoot.addEventListener('dblclick', this.handleDblClick);
  }

  deactivate() {
    this.active = false;
    this.pageRoot.removeEventListener('mousemove', this.handleMouseMove);
    this.pageRoot.removeEventListener('click', this.handleClick);
    this.pageRoot.removeEventListener('dblclick', this.handleDblClick);
    this.hoverOverlay.style.display = 'none';
    this.selectOverlay.style.display = 'none';
    this.selectedElement = null;
  }

  getSelectedElement(): HTMLElement | null { return this.selectedElement; }

  onSelect(callback: (el: HTMLElement | null) => void) {
    this.onSelectCallbacks.push(callback);
  }

  onDblClick(callback: (el: HTMLElement) => void) {
    this.onDblClickCallbacks.push(callback);
  }

  updateSelection() {
    if (this.selectedElement) {
      this.highlightElement(this.selectedElement, this.selectOverlay);
    }
  }

  destroy() {
    this.deactivate();
    this.hoverOverlay.remove();
    this.selectOverlay.remove();
  }

  private handleClick = (e: MouseEvent) => {
    if (!this.active) return;
    const target = e.target as HTMLElement;
    // 跳过编辑器 UI 和弹窗
    if (target.closest('html-visual-editor') || target.closest('[data-editor-dialog]')) return;
    e.preventDefault();
    e.stopPropagation();
    this.selectedElement = target;
    this.highlightElement(target, this.selectOverlay);
    this.hoverOverlay.style.display = 'none';
    this.onSelectCallbacks.forEach((cb) => cb(target));
  };

  private handleDblClick = (e: MouseEvent) => {
    if (!this.active) return;
    const target = e.target as HTMLElement;
    if (target.closest('html-visual-editor') || target.closest('[data-editor-dialog]')) return;
    e.preventDefault();
    this.onDblClickCallbacks.forEach((cb) => cb(target));
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.active) return;
    const target = e.target as HTMLElement;
    if (target.closest('html-visual-editor') || target.closest('[data-editor-dialog]')) return;
    this.highlightElement(target, this.hoverOverlay);
  };

  private highlightElement(el: HTMLElement, overlay: HTMLDivElement) {
    const rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  private getCursor(pos: string): string {
    const cursors: Record<string, string> = {
      nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize',
      e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize',
      sw: 'nesw-resize', w: 'ew-resize',
    };
    return cursors[pos] || 'default';
  }

  private positionHandle(handle: HTMLDivElement, pos: string) {
    const offset = '-5px';
    const center = 'calc(50% - 4px)';
    const styles: Record<string, Partial<CSSStyleDeclaration>> = {
      nw: { top: offset, left: offset },
      n:  { top: offset, left: center },
      ne: { top: offset, right: offset },
      e:  { top: center, right: offset },
      se: { bottom: offset, right: offset },
      s:  { bottom: offset, left: center },
      sw: { bottom: offset, left: offset },
      w:  { top: center, left: offset },
    };
    Object.assign(handle.style, styles[pos]);
  }
}
