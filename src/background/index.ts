import type { MessageType, ResponseType } from '../shared/messages';

chrome.runtime.onMessage.addListener(
  (message: MessageType, sender, sendResponse: (response: ResponseType) => void) => {
    handleMessage(message, sender).then(sendResponse);
    return true;
  }
);

// 确保 content script 已注入到目标标签页
async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'GET_EDIT_MODE' });
    return true;
  } catch {
    // content script 未注入，主动注入
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      return true;
    } catch (e) {
      console.error('无法注入 content script:', e);
      return false;
    }
  }
}

async function handleMessage(
  message: MessageType,
  _sender: chrome.runtime.MessageSender
): Promise<ResponseType> {
  switch (message.type) {
    case 'TOGGLE_EDIT_MODE': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { type: 'ERROR', message: '无法获取当前标签页' };

      const injected = await ensureContentScript(tab.id);
      if (!injected) return { type: 'ERROR', message: '无法注入编辑器到当前页面' };

      try {
        return await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        return { type: 'ERROR', message: '与页面通信失败，请刷新页面后重试' };
      }
    }

    case 'GET_EDIT_MODE': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { type: 'EDIT_MODE_STATUS', mode: 'browse' };
      try {
        return await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        return { type: 'EDIT_MODE_STATUS', mode: 'browse' };
      }
    }

    case 'EXPORT_HTML': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { type: 'ERROR', message: '无法获取当前标签页' };
      try {
        const response: ResponseType = await chrome.tabs.sendMessage(tab.id, message);
        if (response.type === 'HTML_CONTENT') {
          const blob = new Blob([response.html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const filename = sanitizeFilename(response.title) + '.html';
          await chrome.downloads.download({ url, filename, saveAs: true });
          URL.revokeObjectURL(url);
        }
        return response;
      } catch {
        return { type: 'ERROR', message: '导出失败，请确认编辑模式已开启' };
      }
    }

    case 'COPY_HTML': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { type: 'ERROR', message: '无法获取当前标签页' };
      try {
        return await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        return { type: 'ERROR', message: '复制失败，请确认编辑模式已开启' };
      }
    }

    default:
      return { type: 'ERROR', message: '未知消息类型' };
  }
}

function sanitizeFilename(title: string): string {
  return (title || 'page')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-edit-mode') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const injected = await ensureContentScript(tab.id);
    if (!injected) return;
    try {
      const response: ResponseType = await chrome.tabs.sendMessage(tab.id, { type: 'GET_EDIT_MODE' });
      if (response.type === 'EDIT_MODE_STATUS') {
        const newMode = response.mode === 'edit' ? 'browse' : 'edit';
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_EDIT_MODE', mode: newMode });
      }
    } catch {
      // 通信失败
    }
  }
});
