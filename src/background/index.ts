import type { MessageType, ResponseType } from '../shared/messages';

chrome.runtime.onMessage.addListener(
  (message: MessageType, sender, sendResponse: (response: ResponseType) => void) => {
    handleMessage(message, sender).then(sendResponse);
    return true;
  }
);

async function handleMessage(
  message: MessageType,
  _sender: chrome.runtime.MessageSender
): Promise<ResponseType> {
  switch (message.type) {
    case 'TOGGLE_EDIT_MODE': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { type: 'ERROR', message: '无法获取当前标签页' };
      return chrome.tabs.sendMessage(tab.id, message);
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
      const response: ResponseType = await chrome.tabs.sendMessage(tab.id, message);
      if (response.type === 'HTML_CONTENT') {
        const blob = new Blob([response.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const filename = sanitizeFilename(response.title) + '.html';
        await chrome.downloads.download({ url, filename, saveAs: true });
        URL.revokeObjectURL(url);
      }
      return response;
    }

    case 'COPY_HTML': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { type: 'ERROR', message: '无法获取当前标签页' };
      return chrome.tabs.sendMessage(tab.id, message);
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
    try {
      const response: ResponseType = await chrome.tabs.sendMessage(tab.id, { type: 'GET_EDIT_MODE' });
      if (response.type === 'EDIT_MODE_STATUS') {
        const newMode = response.mode === 'edit' ? 'browse' : 'edit';
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_EDIT_MODE', mode: newMode });
      }
    } catch {
      // Content Script 尚未加载
    }
  }
});
