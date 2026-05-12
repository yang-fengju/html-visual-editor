import type { MessageType, ResponseType } from '../shared/messages';
import type { EditorMode } from '../shared/types';
import { ShadowHost } from './ui/ShadowHost';
import { Engine } from './editor/Engine';

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

  chrome.storage.local.get('hintDismissed', (result) => {
    if (!result.hintDismissed) {
      shadowHost!.showFirstTimeHint();
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

      case 'EXPORT_HTML': {
        // 保存并清理编辑器状态
        const savedMarginTop = document.body.style.marginTop;
        document.body.style.marginTop = '';

        // 移除所有编辑器相关 DOM
        const editorHost = document.querySelector('html-visual-editor');
        editorHost?.remove();

        // 移除选择高亮框（它们直接挂在 body 上）
        const overlays = document.querySelectorAll('[style*="z-index: 2147483646"], [style*="z-index: 2147483645"]');
        const removedOverlays: Array<{ el: Element; parent: Node }> = [];
        overlays.forEach((el) => {
          if (el.parentNode) {
            removedOverlays.push({ el, parent: el.parentNode });
            el.remove();
          }
        });

        const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

        // 恢复所有编辑器 DOM
        removedOverlays.forEach(({ el, parent }) => parent.appendChild(el));
        if (editorHost) document.documentElement.appendChild(editorHost);
        document.body.style.marginTop = savedMarginTop;

        sendResponse({ type: 'HTML_CONTENT', html, title: document.title });
        break;
      }

      case 'COPY_HTML': {
        const savedMarginTop = document.body.style.marginTop;
        document.body.style.marginTop = '';

        const editorHost = document.querySelector('html-visual-editor');
        editorHost?.remove();
        const overlays = document.querySelectorAll('[style*="z-index: 2147483646"], [style*="z-index: 2147483645"]');
        const removedOverlays: Array<{ el: Element; parent: Node }> = [];
        overlays.forEach((el) => {
          if (el.parentNode) {
            removedOverlays.push({ el, parent: el.parentNode });
            el.remove();
          }
        });

        let html: string;
        if (message.selector) {
          try {
            const el = document.querySelector(message.selector);
            html = el ? el.outerHTML : '';
          } catch {
            html = '';
          }
        } else {
          html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
        }

        removedOverlays.forEach(({ el, parent }) => parent.appendChild(el));
        if (editorHost) document.documentElement.appendChild(editorHost);
        document.body.style.marginTop = savedMarginTop;

        navigator.clipboard.writeText(html).catch(() => {});
        sendResponse({ type: 'COPY_SUCCESS' });
        break;
      }
    }
    return true;
  }
);
