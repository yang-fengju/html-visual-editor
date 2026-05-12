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
        const editorHost = document.querySelector('html-visual-editor');
        editorHost?.remove();
        const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
        if (editorHost) document.documentElement.appendChild(editorHost);
        sendResponse({ type: 'HTML_CONTENT', html, title: document.title });
        break;
      }

      case 'COPY_HTML': {
        const editorHost = document.querySelector('html-visual-editor');
        editorHost?.remove();
        let html: string;
        if (message.selector) {
          const el = document.querySelector(message.selector);
          html = el ? el.outerHTML : '';
        } else {
          html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
        }
        if (editorHost) document.documentElement.appendChild(editorHost);
        navigator.clipboard.writeText(html);
        sendResponse({ type: 'COPY_SUCCESS' });
        break;
      }
    }
    return true;
  }
);
