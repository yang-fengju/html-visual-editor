function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>').replace(/<\/ul><ul>/g, '');
  return `<p>${html}</p>`.replace('<p></p>', '');
}

export class NoteEditor {
  private container: HTMLDivElement;
  private textarea: HTMLTextAreaElement;
  private preview: HTMLDivElement;
  private onSaveCallbacks: Array<(content: string) => void> = [];
  private onCloseCallbacks: Array<() => void> = [];

  constructor() {
    this.container = document.createElement('div');
    this.container.setAttribute('data-editor-dialog', '');
    this.container.className = 'note-editor';

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'note-editor-input';
    this.textarea.placeholder = '输入 Markdown 内容...';

    this.preview = document.createElement('div');
    this.preview.className = 'note-editor-preview';

    this.container.appendChild(this.textarea);
    this.container.appendChild(this.preview);

    this.textarea.addEventListener('focus', () => {
      this.textarea.style.display = 'block';
      this.preview.style.display = 'none';
    });

    this.textarea.addEventListener('blur', () => {
      this.updatePreview();
      if (this.textarea.value.trim()) {
        this.textarea.style.display = 'none';
        this.preview.style.display = 'block';
      }
    });

    this.textarea.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.onSaveCallbacks.forEach((cb) => cb(this.textarea.value));
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.onCloseCallbacks.forEach((cb) => cb());
      }
    });

    this.textarea.addEventListener('input', () => {
      this.textarea.style.height = 'auto';
      this.textarea.style.height = Math.max(60, this.textarea.scrollHeight) + 'px';
    });

    this.preview.addEventListener('click', () => {
      this.textarea.style.display = 'block';
      this.preview.style.display = 'none';
      this.textarea.focus();
    });
  }

  getElement(): HTMLDivElement { return this.container; }
  getValue(): string { return this.textarea.value; }

  setValue(content: string) {
    this.textarea.value = content;
    this.updatePreview();
    if (content.trim()) {
      this.textarea.style.display = 'none';
      this.preview.style.display = 'block';
    } else {
      this.textarea.style.display = 'block';
      this.preview.style.display = 'none';
    }
  }

  focus() {
    this.textarea.style.display = 'block';
    this.preview.style.display = 'none';
    this.textarea.focus();
  }

  onSave(callback: (content: string) => void) { this.onSaveCallbacks.push(callback); }
  onClose(callback: () => void) { this.onCloseCallbacks.push(callback); }

  private updatePreview() {
    const md = this.textarea.value;
    this.preview.innerHTML = md.trim() ? renderMarkdown(md) : '<span style="color:#aaa">点击编辑笔记...</span>';
  }

  static getStyles(): string {
    return `
      .note-editor { width: 100%; }
      .note-editor-input {
        width: 100%; min-height: 60px; padding: 8px; border: 1px solid #ddd;
        border-radius: 4px; font-family: monospace; font-size: 13px;
        resize: vertical; box-sizing: border-box; line-height: 1.5;
      }
      .note-editor-input:focus { outline: none; border-color: #4285f4; }
      .note-editor-preview {
        padding: 8px; font-size: 13px; line-height: 1.6; cursor: pointer;
        min-height: 40px; border-radius: 4px;
      }
      .note-editor-preview:hover { background: rgba(0,0,0,0.03); }
      .note-editor-preview h2, .note-editor-preview h3, .note-editor-preview h4 { margin: 8px 0 4px; }
      .note-editor-preview code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
      .note-editor-preview pre { background: #1e1e1e; color: #d4d4d4; padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
      .note-editor-preview pre code { background: none; padding: 0; }
      .note-editor-preview a { color: #4285f4; }
      .note-editor-preview ul { padding-left: 20px; margin: 4px 0; }
      .note-editor-preview img { max-width: 100%; border-radius: 4px; }
    `;
  }
}

export { renderMarkdown };
