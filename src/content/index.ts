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
const DATA_CONSENT_KEY = 'dataConsentAccepted'; // 使用固定键记录用户是否已同意仅在本机处理当前网页数据。

function activateEditMode(): void { // 在授权已经成立后创建编辑器，避免提前读取网页内容。
  if (currentMode === 'edit') return; // 已处于编辑模式时直接返回，防止重复创建工具栏和事件监听器。
  currentMode = 'edit';

  if (!shadowHost) { // 从非授权流程进入时需要先创建编辑器的隔离界面容器。
    shadowHost = new ShadowHost(); // 创建 Shadow DOM 容器，避免编辑器样式与网站样式互相影响。
    shadowHost.mount(); // 将隔离容器挂载到当前网页，供工具栏和面板使用。
  } // 授权浮层已经创建容器时复用该容器，减少不必要的 DOM 重建。

  const currentHost = shadowHost;
  chrome.storage.local.get('hintDismissed', (result) => {
    if (!result.hintDismissed && currentHost && currentMode === 'edit') {
      currentHost.showFirstTimeHint();
    }
  });

  engine = new Engine(shadowHost);
}

async function enterEditMode(): Promise<ResponseType> { // 在真正启动编辑器前统一检查数据处理授权。
  if (currentMode === 'edit') return { type: 'EDIT_MODE_STATUS', mode: currentMode }; // 重复开启时返回当前状态，保持消息调用幂等。
  const storedConsent = await chrome.storage.local.get(DATA_CONSENT_KEY); // 从扩展专用存储读取用户先前的授权选择。
  if (storedConsent[DATA_CONSENT_KEY] === true) { // 只有明确保存为 true 才视为用户已经同意。
    activateEditMode(); // 授权有效时立即启动全部现有编辑功能。
    return { type: 'EDIT_MODE_STATUS', mode: currentMode }; // 把实际模式返回给弹窗，确保开关状态准确。
  } // 未授权时只展示说明，不初始化会读取网页内容的 Engine。
  if (!shadowHost) { // 防止用户连续触发开关时重复创建多个授权浮层。
    shadowHost = new ShadowHost(); // 创建只承载授权界面的隔离容器。
    shadowHost.mount(); // 将授权界面容器挂载到网页，但此时不读取网页正文。
    shadowHost.showDataConsent( // 展示数据类型、用途和本地处理方式，并要求用户明确选择。
      () => { // 用户点击同意后保存选择并开启编辑器。
        void chrome.storage.local.set({ [DATA_CONSENT_KEY]: true }).then(() => { // 先持久化同意状态，保证后续快捷键无需重复询问。
          activateEditMode(); // 保存成功后再初始化编辑器，满足先同意后处理的顺序要求。
        }); // 结束异步保存流程，失败时不会错误地进入编辑模式。
      }, // 完成同意回调定义。
      () => { // 用户取消时清理只用于授权的临时界面。
        shadowHost?.unmount(); // 从网页移除授权浮层及其 Shadow DOM 容器。
        shadowHost = null; // 清空引用，允许用户下次主动开启时重新查看并选择。
      }, // 完成取消回调定义。
    ); // 完成授权浮层初始化。
  } // 已存在授权浮层时保持原界面，不重复绑定事件。
  return { type: 'CONSENT_REQUIRED' }; // 通知弹窗当前仍是浏览模式，并引导用户在网页中确认。
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
        if (message.mode === 'edit') { // 开启操作需要等待扩展存储中的授权状态检查完成。
          enterEditMode().then(sendResponse).catch(() => { // 异步检查完成后返回真实状态，并捕获存储异常。
            sendResponse({ type: 'ERROR', message: '无法读取隐私设置，请重试' }); // 存储失败时不启动编辑器，避免绕过授权。
          }); // 结束异步授权检查处理。
        } else { // 关闭操作不涉及数据授权，可以立即执行。
          exitEditMode(); // 销毁编辑器并恢复网页原有布局和交互状态。
          sendResponse({ type: 'EDIT_MODE_STATUS', mode: currentMode }); // 把关闭后的真实模式返回给调用方。
        } // 完成开启与关闭两条消息分支。
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
