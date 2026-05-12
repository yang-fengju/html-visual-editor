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
        const savedMarginTop = document.body.style.marginTop;
        document.body.style.marginTop = '';
        const editorHost = document.querySelector('html-visual-editor');
        editorHost?.remove();
        const overlays = document.querySelectorAll('[style*="z-index: 2147483646"], [style*="z-index: 2147483645"]');
        const removedOverlays: Array<{ el: Element; parent: Node }> = [];
        overlays.forEach((el) => {
          if (el.parentNode) { removedOverlays.push({ el, parent: el.parentNode }); el.remove(); }
        });
        // 移除编辑器弹窗 DOM，但对批注高亮 mark 做 unwrap（保留原文）
        const editorDialogs = document.querySelectorAll('[data-editor-dialog]');
        const removedDialogs: Array<{ el: Element; parent: Node; next: Node | null }> = [];
        editorDialogs.forEach((el) => {
          if (el.parentNode) {
            removedDialogs.push({ el, parent: el.parentNode, next: el.nextSibling });
            el.remove();
          }
        });

        // 对批注 mark 标签做 unwrap：保留内部文字，移除 mark 包装
        const noteMarks = document.querySelectorAll('mark[data-editor-note-ref]');
        const unwrappedMarks: Array<{ mark: Element; parent: Node; textNodes: Text[]; beforeNode: Node | null }> = [];
        noteMarks.forEach((mark) => {
          const parent = mark.parentNode;
          if (!parent) return;
          const beforeNode = mark.nextSibling;
          const textNodes: Text[] = [];
          // 将 mark 的内容提取为文本节点
          while (mark.firstChild) {
            const child = mark.firstChild;
            if (child.nodeType === Node.TEXT_NODE) {
              textNodes.push(child as Text);
            }
            parent.insertBefore(child, mark);
          }
          mark.remove();
          unwrappedMarks.push({ mark, parent, textNodes, beforeNode });
        });

        let html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
        if (engine) {
          const notesHTML = engine.getNoteManager().generateEmbedHTML();
          html = html.replace('</body>', notesHTML + '</body>');
        }

        // 恢复批注 mark 标签
        unwrappedMarks.reverse().forEach(({ mark, parent, textNodes, beforeNode }) => {
          textNodes.forEach((t) => mark.appendChild(t));
          if (beforeNode) parent.insertBefore(mark, beforeNode);
          else parent.appendChild(mark);
        });

        // 恢复编辑器弹窗 DOM
        removedDialogs.forEach(({ el, parent, next }) => {
          if (next) parent.insertBefore(el, next);
          else parent.appendChild(el);
        });
        removedOverlays.forEach(({ el, parent }) => parent.appendChild(el));
        if (editorHost) document.documentElement.appendChild(editorHost);
        document.body.style.marginTop = savedMarginTop;

        sendResponse({ type: 'HTML_CONTENT', html, title: document.title });
        break;
      }

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

        // 清理笔记 DOM（mark 做 unwrap 保留文字，其他直接移除）
        const editorDialogsExport = document.querySelectorAll('[data-editor-dialog]');
        const removedDialogsExport: Array<{ el: Element; parent: Node; next: Node | null }> = [];
        editorDialogsExport.forEach((el) => {
          if (el.parentNode) {
            removedDialogsExport.push({ el, parent: el.parentNode, next: el.nextSibling });
            el.remove();
          }
        });
        const noteMarksExport = document.querySelectorAll('mark[data-editor-note-ref]');
        const unwrappedMarksExport: Array<{ mark: Element; parent: Node; textNodes: Text[]; beforeNode: Node | null }> = [];
        noteMarksExport.forEach((mark) => {
          const parent = mark.parentNode;
          if (!parent) return;
          const beforeNode = mark.nextSibling;
          const textNodes: Text[] = [];
          while (mark.firstChild) {
            const child = mark.firstChild;
            if (child.nodeType === Node.TEXT_NODE) textNodes.push(child as Text);
            parent.insertBefore(child, mark);
          }
          mark.remove();
          unwrappedMarksExport.push({ mark, parent, textNodes, beforeNode });
        });

        const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

        // 恢复笔记 DOM
        unwrappedMarksExport.reverse().forEach(({ mark, parent, textNodes, beforeNode }) => {
          textNodes.forEach((t) => mark.appendChild(t));
          if (beforeNode) parent.insertBefore(mark, beforeNode);
          else parent.appendChild(mark);
        });
        removedDialogsExport.forEach(({ el, parent, next }) => {
          if (next) parent.insertBefore(el, next);
          else parent.appendChild(el);
        });

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
