import { History } from './History';
import { StylePanel } from '../ui/StylePanel';

export class StyleEditor {
  private stylePanel: StylePanel;
  private showCallbacks: Array<() => void> = [];
  private hideCallbacks: Array<() => void> = [];

  constructor(
    private history: History,
    shadowRoot: ShadowRoot,
    container: HTMLDivElement
  ) {
    this.stylePanel = new StylePanel(shadowRoot);
    container.appendChild(this.stylePanel.getElement());
    this.stylePanel.onPreview((element, prop, value) => {
      this.previewStyleOnElement(element, prop, value);
    });
    this.stylePanel.onChange((element, prop, value) => {
      this.applyStyleToElement(element, prop, value);
    });
    this.stylePanel.onHide(() => {
      this.hideCallbacks.forEach(cb => cb());
    });
  }

  showForElement(element: HTMLElement) {
    this.showCallbacks.forEach(cb => cb());
    this.stylePanel.show(element);
  }
  hide() {
    this.stylePanel.hide();
  }

  isVisible(): boolean { return this.stylePanel.isVisible(); }

  destroy() {
    this.stylePanel.hide();
    this.stylePanel.getElement().remove();
  }

  onShow(callback: () => void) { this.showCallbacks.push(callback); }
  onHide(callback: () => void) { this.hideCallbacks.push(callback); }

  previewStyleOnElement(element: HTMLElement, prop: string, value: string) {
    (element.style as any)[prop] = value;
  }

  applyStyleToElement(element: HTMLElement, prop: string, value: string) {
    const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
    const before = element.style.getPropertyValue(cssProp);
    (element.style as any)[prop] = value;
    this.history.push(
      'style-change',
      () => { (element.style as any)[prop] = before; },
      () => { (element.style as any)[prop] = value; }
    );
  }
}
