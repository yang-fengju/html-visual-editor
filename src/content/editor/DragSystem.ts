import { History } from './History';

interface DragState {
  element: HTMLElement;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  originalPosition: string;
  originalLeft: string;
  originalTop: string;
}

interface ResizeState {
  element: HTMLElement;
  handle: string;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  originalWidth: string;
  originalHeight: string;
}

export class DragSystem {
  private dragState: DragState | null = null;
  private resizeState: ResizeState | null = null;
  private guides: HTMLDivElement[] = [];

  constructor(private history: History) {
    document.addEventListener('pointermove', this.handlePointerMove);
    document.addEventListener('pointerup', this.handlePointerUp);
  }

  startDrag(element: HTMLElement, startX: number, startY: number) {
    const computed = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    this.dragState = {
      element, startX, startY,
      startLeft: rect.left, startTop: rect.top,
      originalPosition: element.style.position,
      originalLeft: element.style.left,
      originalTop: element.style.top,
    };
    if (computed.position === 'static') element.style.position = 'relative';
    element.style.cursor = 'grabbing';
    this.showGuides();
  }

  startResize(element: HTMLElement, handle: string, startX: number, startY: number) {
    const rect = element.getBoundingClientRect();
    this.resizeState = {
      element, handle, startX, startY,
      startWidth: rect.width, startHeight: rect.height,
      originalWidth: element.style.width, originalHeight: element.style.height,
    };
  }

  destroy() {
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointerup', this.handlePointerUp);
    this.hideGuides();
  }

  private handlePointerMove = (e: PointerEvent) => {
    if (this.dragState) this.handleDragMove(e);
    else if (this.resizeState) this.handleResizeMove(e);
  };

  private handlePointerUp = () => {
    if (this.dragState) this.finishDrag();
    else if (this.resizeState) this.finishResize();
  };

  private handleDragMove(e: PointerEvent) {
    const state = this.dragState!;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const parent = state.element.offsetParent as HTMLElement;
    const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
    state.element.style.left = (state.startLeft + dx - parentRect.left) + 'px';
    state.element.style.top = (state.startTop + dy - parentRect.top) + 'px';
  }

  private handleResizeMove(e: PointerEvent) {
    const state = this.resizeState!;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const { handle, element } = state;
    let newWidth = state.startWidth;
    let newHeight = state.startHeight;
    if (handle.includes('e')) newWidth = state.startWidth + dx;
    if (handle.includes('w')) newWidth = state.startWidth - dx;
    if (handle.includes('s')) newHeight = state.startHeight + dy;
    if (handle.includes('n')) newHeight = state.startHeight - dy;
    element.style.width = Math.max(20, newWidth) + 'px';
    element.style.height = Math.max(20, newHeight) + 'px';
  }

  private finishDrag() {
    const state = this.dragState!;
    const el = state.element;
    const afterPosition = el.style.position;
    const afterLeft = el.style.left;
    const afterTop = el.style.top;
    el.style.cursor = '';
    this.hideGuides();
    this.history.push('element-move',
      () => { el.style.position = state.originalPosition; el.style.left = state.originalLeft; el.style.top = state.originalTop; },
      () => { el.style.position = afterPosition; el.style.left = afterLeft; el.style.top = afterTop; }
    );
    this.dragState = null;
  }

  private finishResize() {
    const state = this.resizeState!;
    const el = state.element;
    const afterWidth = el.style.width;
    const afterHeight = el.style.height;
    this.history.push('element-resize',
      () => { el.style.width = state.originalWidth; el.style.height = state.originalHeight; },
      () => { el.style.width = afterWidth; el.style.height = afterHeight; }
    );
    this.resizeState = null;
  }

  private showGuides() {
    const hGuide = document.createElement('div');
    hGuide.style.cssText = `position: fixed; left: 0; width: 100%; height: 1px; top: 50%; background: #ff6b6b; z-index: 2147483646; pointer-events: none; display: none;`;
    const vGuide = document.createElement('div');
    vGuide.style.cssText = `position: fixed; top: 0; height: 100%; width: 1px; left: 50%; background: #ff6b6b; z-index: 2147483646; pointer-events: none; display: none;`;
    document.body.appendChild(hGuide);
    document.body.appendChild(vGuide);
    this.guides = [hGuide, vGuide];
  }

  private hideGuides() {
    this.guides.forEach((g) => g.remove());
    this.guides = [];
  }
}
