import { History } from './History';
import { StylePanel } from '../ui/StylePanel';

export class StyleEditor {
  private stylePanel: StylePanel;

  constructor(
    private history: History,
    shadowRoot: ShadowRoot,
    container: HTMLDivElement
  ) {
    this.stylePanel = new StylePanel(shadowRoot);
    container.appendChild(this.stylePanel.getElement());
    this.stylePanel.onChange((element, prop, value) => {
      this.applyStyleToElement(element, prop, value);
    });
  }

  showForElement(element: HTMLElement) { this.stylePanel.show(element); }
  hide() { this.stylePanel.hide(); }

  destroy() {
    this.stylePanel.hide();
    this.stylePanel.getElement().remove();
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
