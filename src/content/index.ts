import type { MessageType, ResponseType } from '../shared/messages';
import type { EditorMode } from '../shared/types';
import { ShadowHost } from './ui/ShadowHost';
import { Engine } from './editor/Engine';

// 在清洁 DOM 环境下执行回调（移除编辑器 DOM，完成后恢复）
function withCleanDOM<T>(callback: () => T): T {
  const savedMarginTop = document.body.style.marginTop;
  document.body.style.marginTop = '';

  const editorHost = document.querySelector('html-visual-editor');
  editorHost?.remove();

  const overlays = document.querySelectorAll('[style*="z-index: 2147483646"], [style*="z-index: 2147483645"]');
  const removedOverlays: Array<{ el: Element; parent: Node }> = [];
  overlays.forEach((el) => {
    if (el.parentNode) { removedOverlays.push({ el, parent: el.parentNode }); el.remove(); }
  });

  const editorDialogs = document.querySelectorAll('[data-editor-dialog]');
  const removedDialogs: Array<{ el: Element; parent: Node; next: Node | null }> = [];
  editorDialogs.forEach((el) => {
    if (el.parentNode) {
      removedDialogs.push({ el, parent: el.parentNode, next: el.nextSibling });
      el.remove();
    }
  });

  // unwrap 笔记高亮 mark 标签：保留内部文字，移除 mark 包装
  const noteMarks = document.querySelectorAll('mark[data-comment-ref]');
  const unwrappedMarks: Array<{ mark: Element; parent: Node; innerHTML: string; beforeNode: Node | null }> = [];
  noteMarks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    const beforeNode = mark.nextSibling;
    const innerHTML = mark.innerHTML;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    mark.remove();
    unwrappedMarks.push({ mark, parent, innerHTML, beforeNode });
  });

  const result = callback();

  // 恢复 mark 标签（用保存的 innerHTML 重建内容，避免文本节点合并导致引用失效）
  unwrappedMarks.reverse().forEach(({ mark, parent, innerHTML, beforeNode }) => {
    mark.innerHTML = innerHTML;
    if (beforeNode && beforeNode.parentNode === parent) parent.insertBefore(mark, beforeNode);
    else parent.appendChild(mark);
  });
  // 恢复后合并相邻文本节点，清理 unwrap 留下的碎片
  unwrappedMarks.forEach(({ mark }) => mark.parentNode?.normalize());

  removedDialogs.forEach(({ el, parent, next }) => {
    if (next && next.parentNode === parent) parent.insertBefore(el, next);
    else parent.appendChild(el);
  });
  removedOverlays.forEach(({ el, parent }) => parent.appendChild(el));
  if (editorHost) document.documentElement.appendChild(editorHost);
  document.body.style.marginTop = savedMarginTop;

  return result;
}

// 单例保护：防止重复注入
if ((globalThis as any).__htmlVisualEditorLoaded) throw new Error('already loaded');
(globalThis as any).__htmlVisualEditorLoaded = true;

let currentMode: EditorMode = 'browse';
let shadowHost: ShadowHost | null = null;
let engine: Engine | null = null;

function enterEditMode() {
  if (currentMode === 'edit') return;
  currentMode = 'edit';

  shadowHost = new ShadowHost();
  shadowHost.mount();

  const currentHost = shadowHost;
  chrome.storage.local.get('hintDismissed', (result) => {
    if (!result.hintDismissed && currentHost && currentMode === 'edit') {
      currentHost.showFirstTimeHint();
    }
  });

  engine = new Engine(shadowHost);
}

function exitEditMode() {
  if (currentMode === 'browse') return;
  currentMode = 'browse';

  engine?.destroy();
  engine = null;

  shadowHost?.unmount();
  shadowHost = null;
}

chrome.runtime.onMessage.addListener(
  (message: MessageType, _sender, sendResponse: (response: ResponseType) => void) => {
    switch (message.type) {
      case 'TOGGLE_EDIT_MODE':
        if (message.mode === 'edit') enterEditMode();
        else exitEditMode();
        sendResponse({ type: 'EDIT_MODE_STATUS', mode: currentMode });
        break;

      case 'GET_EDIT_MODE':
        sendResponse({ type: 'EDIT_MODE_STATUS', mode: currentMode });
        break;

      case 'EXPORT_HTML_WITH_NOTES': {
        const html = withCleanDOM(() => {
          let h = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
          if (engine) {
            const notesHTML = engine.getNoteManager().generateEmbedHTML();
            h = h.replace('</body>', notesHTML + '</body>');
          }
          return h;
        });
        sendResponse({ type: 'HTML_CONTENT', html, title: document.title });
        break;
      }

      case 'EXPORT_HTML': {
        const html = withCleanDOM(() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
        sendResponse({ type: 'HTML_CONTENT', html, title: document.title });
        break;
      }

      case 'COPY_HTML': {
        const html = withCleanDOM(() => {
          if (message.selector) {
            try {
              const el = document.querySelector(message.selector);
              return el ? el.outerHTML : '';
            } catch { return ''; }
          }
          return '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
        });
        navigator.clipboard.writeText(html).catch(() => {});
        sendResponse({ type: 'COPY_SUCCESS' });
        break;
      }
    }
    return true;
  }
);
