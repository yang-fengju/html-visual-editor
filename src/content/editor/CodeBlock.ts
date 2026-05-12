import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import { History } from './History';

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'css', label: 'CSS' },
  { id: 'markup', label: 'HTML' },
  { id: 'json', label: 'JSON' },
  { id: 'bash', label: 'Bash' },
];

export class CodeBlockManager {
  private darkTheme = true;

  constructor(private history: History) {}

  isCodeBlock(el: HTMLElement): boolean {
    return el.tagName === 'PRE' || el.tagName === 'CODE' || el.closest('pre') !== null;
  }

  editCodeBlock(preElement: HTMLElement) {
    const codeEl = preElement.querySelector('code') || preElement;
    const currentLang = this.detectLanguage(codeEl);
    const currentCode = codeEl.textContent || '';

    let langOptions = LANGUAGES.map(
      (l) => `<option value="${l.id}" ${l.id === currentLang ? 'selected' : ''}>${l.label}</option>`
    ).join('');

    const dialog = document.createElement('div');
    dialog.setAttribute('data-editor-dialog', '');
    dialog.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); padding: 24px; z-index: 2147483647; width: 600px; max-height: 80vh;`;
    dialog.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin: 0 0 16px;">
        <h3 style="margin: 0; font-size: 16px;">编辑代码块</h3>
        <button id="code-close" style="background: none; border: none; font-size: 22px; cursor: pointer; color: #888; padding: 0 4px;">&times;</button>
      </div>
      <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: center;">
        <label style="font-size: 13px;">语言：</label>
        <select id="code-lang" style="padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px;">${langOptions}</select>
        <label style="font-size: 13px; margin-left: auto;"><input type="checkbox" id="code-dark" ${this.darkTheme ? 'checked' : ''}> 暗色主题</label>
      </div>
      <textarea id="code-content" rows="15" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 14px; background: #1e1e1e; color: #d4d4d4; box-sizing: border-box; tab-size: 4; resize: vertical;">${this.escapeHTML(currentCode)}</textarea>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
        <button id="code-cancel" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">取消</button>
        <button id="code-confirm" style="padding: 8px 16px; border: none; border-radius: 4px; background: #4285f4; color: white; cursor: pointer;">确认</button>
      </div>
    `;

    const textarea = dialog.querySelector('#code-content') as HTMLTextAreaElement;
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 4;
      }
    });

    const overlay = document.createElement('div');
    overlay.setAttribute('data-editor-dialog', '');
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 2147483646;';
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    const cleanup = () => { dialog.remove(); overlay.remove(); };
    dialog.querySelector('#code-close')!.addEventListener('click', cleanup);
    dialog.querySelector('#code-cancel')!.addEventListener('click', cleanup);
    overlay.addEventListener('click', cleanup);

    dialog.querySelector('#code-confirm')!.addEventListener('click', () => {
      const lang = (dialog.querySelector('#code-lang') as HTMLSelectElement).value;
      const code = textarea.value;
      const dark = (dialog.querySelector('#code-dark') as HTMLInputElement).checked;
      this.darkTheme = dark;
      const beforeHTML = preElement.outerHTML;
      this.applyCodeBlock(preElement, codeEl as HTMLElement, code, lang, dark);
      const afterHTML = preElement.outerHTML;
      if (beforeHTML !== afterHTML) {
        this.history.push('code-block-change', () => { preElement.outerHTML = beforeHTML; }, () => { preElement.outerHTML = afterHTML; });
      }
      cleanup();
    });
  }

  private applyCodeBlock(pre: HTMLElement, code: HTMLElement, content: string, lang: string, dark: boolean) {
    code.className = `language-${lang}`;
    code.textContent = content;
    if (Prism.languages[lang]) {
      code.innerHTML = Prism.highlight(content, Prism.languages[lang], lang);
    }
    if (dark) {
      pre.style.cssText = 'background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace;';
    } else {
      pre.style.cssText = 'background: #f5f5f5; color: #333; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace;';
    }
  }

  private detectLanguage(codeEl: Element): string {
    const classList = Array.from(codeEl.classList);
    for (const cls of classList) {
      const match = cls.match(/^language-(.+)$/);
      if (match) return match[1];
    }
    return 'javascript';
  }

  private escapeHTML(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
