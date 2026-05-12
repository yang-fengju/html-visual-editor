import type { EditorMode, ExportOptions } from './types';

export type MessageType =
  | { type: 'TOGGLE_EDIT_MODE'; mode: EditorMode }
  | { type: 'GET_EDIT_MODE' }
  | { type: 'EXPORT_HTML'; options: ExportOptions }
  | { type: 'EXPORT_HTML_WITH_NOTES'; options: ExportOptions }
  | { type: 'COPY_HTML'; selector?: string };

export type ResponseType =
  | { type: 'EDIT_MODE_STATUS'; mode: EditorMode }
  | { type: 'HTML_CONTENT'; html: string; title: string }
  | { type: 'COPY_SUCCESS' }
  | { type: 'ERROR'; message: string };

export function sendToBackground(message: MessageType): Promise<ResponseType> {
  return chrome.runtime.sendMessage(message);
}

export function sendToTab(tabId: number, message: MessageType): Promise<ResponseType> {
  return chrome.tabs.sendMessage(tabId, message);
}
