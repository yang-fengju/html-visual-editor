# HTML Visual Editor 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Chrome 浏览器扩展，让用户在任意网页上以所见即所得方式编辑 HTML，支持文本、样式、布局、表格、多媒体、表单、代码块编辑，并可导出保存。

**Architecture:** Content Script 注入目标页面，通过 Shadow DOM 隔离编辑器 UI，编辑引擎直接操作页面真实 DOM。Background Service Worker 负责消息中转和文件导出。Popup 提供编辑模式开关。

**Tech Stack:** TypeScript, Chrome Extension Manifest V3, Vite + CRXJS, 原生 Web Components, Pointer Events, Prism.js

---

## 阶段一：项目脚手架与核心基础设施

### Task 1: 项目初始化与构建配置

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `public/manifest.json`
- Create: `public/icons/icon16.png`
- Create: `public/icons/icon48.png`
- Create: `public/icons/icon128.png`

- [ ] **Step 1: 初始化 npm 项目并安装依赖**

```bash
cd ~/yfj/html-visual-editor
npm init -y
npm install -D typescript vite @crxjs/vite-plugin@beta @types/chrome
```

- [ ] **Step 2: 配置 TypeScript**

创建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["chrome"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 配置 Vite 和 CRXJS**

创建 `vite.config.ts`：

```typescript
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest }),
  ],
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
  },
});
```

- [ ] **Step 4: 创建 Chrome 扩展清单**

创建 `public/manifest.json`：

```json
{
  "manifest_version": 3,
  "name": "HTML Visual Editor",
  "version": "0.1.0",
  "description": "像 Word 一样直接在网页上编辑 HTML",
  "permissions": ["activeTab", "storage", "downloads"],
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "commands": {
    "toggle-edit-mode": {
      "suggested_key": {
        "default": "Alt+E"
      },
      "description": "切换编辑模式"
    }
  }
}
```

- [ ] **Step 5: 创建占位图标**

用 canvas 生成简单的 SVG 占位图标，保存为 PNG：

```bash
# 使用 ImageMagick 生成简单图标（蓝色方块带 E 字母）
# 如果没有 ImageMagick，手动创建简单 PNG 即可
convert -size 16x16 xc:#4285f4 -fill white -gravity center -pointsize 12 -annotate 0 "E" public/icons/icon16.png
convert -size 48x48 xc:#4285f4 -fill white -gravity center -pointsize 32 -annotate 0 "E" public/icons/icon48.png
convert -size 128x128 xc:#4285f4 -fill white -gravity center -pointsize 80 -annotate 0 "E" public/icons/icon128.png
```

如果没有 ImageMagick，创建任意 PNG 文件即可，后续替换。

- [ ] **Step 6: 添加 npm scripts**

在 `package.json` 的 `scripts` 中添加：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 7: 验证构建**

```bash
npm run build
```

预期：`dist/` 目录下生成扩展文件，无报错。

- [ ] **Step 8: 提交**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts public/
git commit -m "feat: 初始化项目脚手架和构建配置"
```

---

### Task 2: 共享类型和消息协议

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/messages.ts`

- [ ] **Step 1: 定义核心类型**

创建 `src/shared/types.ts`：

```typescript
// 编辑器模式
export type EditorMode = 'browse' | 'edit';

// 编辑操作类型
export type ActionType =
  | 'text-change'
  | 'style-change'
  | 'element-move'
  | 'element-resize'
  | 'element-insert'
  | 'element-delete'
  | 'element-reorder'
  | 'attribute-change'
  | 'table-structure'
  | 'media-change'
  | 'form-change'
  | 'code-block-change';

// 历史记录项
export interface HistoryEntry {
  type: ActionType;
  target: string; // 元素的 CSS 选择器路径
  before: string; // 操作前的 HTML 或样式值
  after: string;  // 操作后的 HTML 或样式值
  timestamp: number;
}

// 导出选项
export interface ExportOptions {
  includeStyles: boolean;   // 是否内联所有样式
  includeResources: boolean; // 是否打包图片等资源
  format: 'html' | 'zip';
}

// 选中元素的信息
export interface SelectedElementInfo {
  tagName: string;
  id: string;
  classes: string[];
  computedStyle: Partial<CSSStyleDeclaration>;
  rect: DOMRect;
  path: string; // 唯一 CSS 选择器路径
}

// 插入元素的类型
export type InsertableElement =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'image'
  | 'link'
  | 'button'
  | 'divider'
  | 'ordered-list'
  | 'unordered-list'
  | 'table'
  | 'video'
  | 'audio'
  | 'form-input'
  | 'form-textarea'
  | 'form-select'
  | 'form-checkbox'
  | 'form-radio'
  | 'form-button'
  | 'code-block';
```

- [ ] **Step 2: 定义消息协议**

创建 `src/shared/messages.ts`：

```typescript
import type { EditorMode, ExportOptions } from './types';

// Popup → Background → Content Script 的消息
export type MessageType =
  | { type: 'TOGGLE_EDIT_MODE'; mode: EditorMode }
  | { type: 'GET_EDIT_MODE' }
  | { type: 'EXPORT_HTML'; options: ExportOptions }
  | { type: 'COPY_HTML'; selector?: string }; // selector 为空表示整页

// Content Script → Background 的消息
export type ResponseType =
  | { type: 'EDIT_MODE_STATUS'; mode: EditorMode }
  | { type: 'HTML_CONTENT'; html: string; title: string }
  | { type: 'COPY_SUCCESS' }
  | { type: 'ERROR'; message: string };

// 发送消息的辅助函数
export function sendToBackground(message: MessageType): Promise<ResponseType> {
  return chrome.runtime.sendMessage(message);
}

export function sendToTab(tabId: number, message: MessageType): Promise<ResponseType> {
  return chrome.tabs.sendMessage(tabId, message);
}
```

- [ ] **Step 3: 提交**

```bash
git add src/shared/
git commit -m "feat: 定义共享类型和消息协议"
```

---

### Task 3: Background Service Worker

**Files:**
- Create: `src/background/index.ts`

- [ ] **Step 1: 实现 Background Service Worker**

创建 `src/background/index.ts`：

```typescript
import type { MessageType, ResponseType } from '../shared/messages';

// 监听来自 Popup 的消息，转发给 Content Script
chrome.runtime.onMessage.addListener(
  (message: MessageType, sender, sendResponse: (response: ResponseType) => void) => {
    handleMessage(message, sender).then(sendResponse);
    return true; // 异步响应
  }
);

async function handleMessage(
  message: MessageType,
  sender: chrome.runtime.MessageSender
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

// 监听快捷键命令
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
```

- [ ] **Step 2: 提交**

```bash
git add src/background/
git commit -m "feat: 实现 Background Service Worker 消息中转和文件导出"
```

---

### Task 4: Popup UI

**Files:**
- Create: `src/popup/index.html`
- Create: `src/popup/popup.ts`
- Create: `src/popup/popup.css`

- [ ] **Step 1: 创建 Popup HTML**

创建 `src/popup/index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HTML Visual Editor</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="popup-container">
    <h1 class="popup-title">HTML Visual Editor</h1>
    <div class="toggle-row">
      <span class="toggle-label">编辑模式</span>
      <label class="toggle-switch">
        <input type="checkbox" id="edit-toggle">
        <span class="slider"></span>
      </label>
    </div>
    <div class="status" id="status-text">浏览模式</div>
    <div class="actions">
      <button id="btn-export" class="action-btn" disabled>导出 HTML</button>
      <button id="btn-copy" class="action-btn" disabled>复制 HTML</button>
    </div>
    <div class="shortcut-hint">快捷键：Alt+E 切换编辑模式</div>
  </div>
  <script src="popup.ts" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 Popup 样式**

创建 `src/popup/popup.css`：

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 280px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #fff;
  color: #333;
}

.popup-container {
  padding: 16px;
}

.popup-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #1a1a1a;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.toggle-label {
  font-size: 14px;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #ccc;
  border-radius: 24px;
  transition: 0.3s;
}

.slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.3s;
}

input:checked + .slider {
  background: #4285f4;
}

input:checked + .slider::before {
  transform: translateX(20px);
}

.status {
  font-size: 12px;
  color: #888;
  margin-bottom: 16px;
  padding: 6px 10px;
  background: #f5f5f5;
  border-radius: 4px;
  text-align: center;
}

.status.active {
  color: #4285f4;
  background: #e8f0fe;
}

.actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: #f0f0f0;
  border-color: #bbb;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.shortcut-hint {
  font-size: 11px;
  color: #aaa;
  text-align: center;
}
```

- [ ] **Step 3: 创建 Popup 逻辑**

创建 `src/popup/popup.ts`：

```typescript
import { sendToBackground } from '../shared/messages';
import type { EditorMode } from '../shared/types';

const editToggle = document.getElementById('edit-toggle') as HTMLInputElement;
const statusText = document.getElementById('status-text') as HTMLDivElement;
const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;

function updateUI(mode: EditorMode) {
  const isEdit = mode === 'edit';
  editToggle.checked = isEdit;
  statusText.textContent = isEdit ? '编辑模式' : '浏览模式';
  statusText.classList.toggle('active', isEdit);
  btnExport.disabled = !isEdit;
  btnCopy.disabled = !isEdit;
}

// 初始化：查询当前状态
sendToBackground({ type: 'GET_EDIT_MODE' }).then((response) => {
  if (response.type === 'EDIT_MODE_STATUS') {
    updateUI(response.mode);
  }
});

// 切换编辑模式
editToggle.addEventListener('change', async () => {
  const mode: EditorMode = editToggle.checked ? 'edit' : 'browse';
  await sendToBackground({ type: 'TOGGLE_EDIT_MODE', mode });
  updateUI(mode);
});

// 导出 HTML
btnExport.addEventListener('click', async () => {
  await sendToBackground({
    type: 'EXPORT_HTML',
    options: { includeStyles: true, includeResources: false, format: 'html' },
  });
});

// 复制 HTML
btnCopy.addEventListener('click', async () => {
  await sendToBackground({ type: 'COPY_HTML' });
});
```

- [ ] **Step 4: 提交**

```bash
git add src/popup/
git commit -m "feat: 实现 Popup UI 编辑模式切换和导出按钮"
```

---

### Task 5: Shadow DOM 容器和编辑模式切换

**Files:**
- Create: `src/content/index.ts`
- Create: `src/content/ui/ShadowHost.ts`

- [ ] **Step 1: 实现 Shadow DOM 容器**

创建 `src/content/ui/ShadowHost.ts`：

```typescript
export class ShadowHost {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private container: HTMLDivElement;

  constructor() {
    this.host = document.createElement('html-visual-editor');
    this.host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 100%; z-index: 2147483647; pointer-events: none;';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    // 注入编辑器基础样式
    const style = document.createElement('style');
    style.textContent = this.getBaseStyles();
    this.shadow.appendChild(style);

    this.container = document.createElement('div');
    this.container.className = 'editor-root';
    this.shadow.appendChild(this.container);
  }

  mount() {
    document.documentElement.appendChild(this.host);
  }

  unmount() {
    this.host.remove();
  }

  getContainer(): HTMLDivElement {
    return this.container;
  }

  getShadowRoot(): ShadowRoot {
    return this.shadow;
  }

  private getBaseStyles(): string {
    return `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        color: #333;
      }

      .editor-root {
        position: relative;
        width: 100%;
        pointer-events: none;
      }

      /* 工具栏区域接收事件 */
      .editor-root > * {
        pointer-events: auto;
      }

      .first-time-hint {
        position: fixed;
        top: 52px;
        left: 50%;
        transform: translateX(-50%);
        background: #1a73e8;
        color: white;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 10;
        white-space: nowrap;
      }

      .first-time-hint button {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 16px;
        padding: 0 2px;
        opacity: 0.8;
      }

      .first-time-hint button:hover {
        opacity: 1;
      }
    `;
  }

  showFirstTimeHint() {
    const hint = document.createElement('div');
    hint.className = 'first-time-hint';
    hint.innerHTML = `
      <span>您正在编辑本地副本，不会影响原始网站</span>
      <button class="hint-close">&times;</button>
    `;
    hint.querySelector('.hint-close')!.addEventListener('click', () => {
      hint.remove();
      chrome.storage.local.set({ hintDismissed: true });
    });
    this.container.appendChild(hint);
  }
}
```

- [ ] **Step 2: 实现 Content Script 入口**

创建 `src/content/index.ts`：

```typescript
import type { MessageType, ResponseType } from '../shared/messages';
import type { EditorMode } from '../shared/types';
import { ShadowHost } from './ui/ShadowHost';

let currentMode: EditorMode = 'browse';
let shadowHost: ShadowHost | null = null;

function enterEditMode() {
  if (currentMode === 'edit') return;
  currentMode = 'edit';

  shadowHost = new ShadowHost();
  shadowHost.mount();

  // 首次使用提示
  chrome.storage.local.get('hintDismissed', (result) => {
    if (!result.hintDismissed) {
      shadowHost!.showFirstTimeHint();
    }
  });

  // 后续任务将在此处初始化各编辑模块
}

function exitEditMode() {
  if (currentMode === 'browse') return;
  currentMode = 'browse';

  // 后续任务将在此处清理各编辑模块

  shadowHost?.unmount();
  shadowHost = null;
}

// 监听来自 Background 的消息
chrome.runtime.onMessage.addListener(
  (message: MessageType, _sender, sendResponse: (response: ResponseType) => void) => {
    switch (message.type) {
      case 'TOGGLE_EDIT_MODE':
        if (message.mode === 'edit') {
          enterEditMode();
        } else {
          exitEditMode();
        }
        sendResponse({ type: 'EDIT_MODE_STATUS', mode: currentMode });
        break;

      case 'GET_EDIT_MODE':
        sendResponse({ type: 'EDIT_MODE_STATUS', mode: currentMode });
        break;

      case 'EXPORT_HTML': {
        // 临时移除编辑器 UI，获取干净的页面 HTML
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
```

- [ ] **Step 3: 验证构建**

```bash
npm run build
```

预期：构建成功，`dist/` 目录包含完整的扩展文件。

- [ ] **Step 4: 手动测试**

在 Chrome 中加载未打包的扩展 (`dist/` 目录)，打开任意网页，点击扩展图标切换编辑模式，确认：
- Shadow DOM 容器正确注入
- 首次使用提示正确显示
- 关闭提示后刷新不再出现
- 退出编辑模式后 UI 被移除

- [ ] **Step 5: 提交**

```bash
git add src/content/
git commit -m "feat: 实现 Shadow DOM 容器和编辑模式切换"
```

---

### Task 6: 历史记录系统（撤销/重做）

**Files:**
- Create: `src/content/editor/History.ts`

- [ ] **Step 1: 实现历史记录管理器**

创建 `src/content/editor/History.ts`：

```typescript
import type { ActionType } from '../../shared/types';

interface HistoryEntry {
  type: ActionType;
  undo: () => void;
  redo: () => void;
  timestamp: number;
}

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxSize = 200;
  private onChangeCallbacks: Array<() => void> = [];

  push(type: ActionType, undo: () => void, redo: () => void) {
    this.undoStack.push({ type, undo, redo, timestamp: Date.now() });

    // 新操作清空重做栈
    this.redoStack = [];

    // 限制栈大小
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }

    this.notifyChange();
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;

    entry.undo();
    this.redoStack.push(entry);
    this.notifyChange();
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;

    entry.redo();
    this.undoStack.push(entry);
    this.notifyChange();
    return true;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyChange();
  }

  onChange(callback: () => void) {
    this.onChangeCallbacks.push(callback);
  }

  private notifyChange() {
    this.onChangeCallbacks.forEach((cb) => cb());
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/History.ts
git commit -m "feat: 实现撤销/重做历史记录管理器"
```

---

## 阶段二：核心编辑能力

### Task 7: 元素选择与高亮系统

**Files:**
- Create: `src/content/editor/SelectionManager.ts`

- [ ] **Step 1: 实现元素选择和高亮**

创建 `src/content/editor/SelectionManager.ts`：

```typescript
export class SelectionManager {
  private hoverOverlay: HTMLDivElement;
  private selectOverlay: HTMLDivElement;
  private resizeHandles: HTMLDivElement[] = [];
  private selectedElement: HTMLElement | null = null;
  private onSelectCallbacks: Array<(el: HTMLElement | null) => void> = [];
  private active = false;

  constructor(private pageRoot: HTMLElement) {
    // 鼠标悬停高亮框
    this.hoverOverlay = document.createElement('div');
    this.hoverOverlay.style.cssText = `
      position: fixed; pointer-events: none; z-index: 2147483646;
      border: 2px dashed #4285f4; background: rgba(66,133,244,0.05);
      display: none; transition: all 0.1s ease;
    `;

    // 选中元素高亮框
    this.selectOverlay = document.createElement('div');
    this.selectOverlay.style.cssText = `
      position: fixed; pointer-events: none; z-index: 2147483645;
      border: 2px solid #4285f4; background: rgba(66,133,244,0.08);
      display: none;
    `;

    // 创建 8 个调整大小的手柄
    const positions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    positions.forEach((pos) => {
      const handle = document.createElement('div');
      handle.dataset.handle = pos;
      handle.style.cssText = `
        position: absolute; width: 8px; height: 8px;
        background: #4285f4; border: 1px solid white;
        border-radius: 2px; pointer-events: auto; z-index: 2147483647;
        cursor: ${this.getCursor(pos)};
      `;
      this.positionHandle(handle, pos);
      this.selectOverlay.appendChild(handle);
      this.resizeHandles.push(handle);
    });

    document.body.appendChild(this.hoverOverlay);
    document.body.appendChild(this.selectOverlay);
  }

  activate() {
    this.active = true;
    this.pageRoot.addEventListener('mousemove', this.handleMouseMove);
    this.pageRoot.addEventListener('click', this.handleClick);
  }

  deactivate() {
    this.active = false;
    this.pageRoot.removeEventListener('mousemove', this.handleMouseMove);
    this.pageRoot.removeEventListener('click', this.handleClick);
    this.hoverOverlay.style.display = 'none';
    this.selectOverlay.style.display = 'none';
    this.selectedElement = null;
  }

  getSelectedElement(): HTMLElement | null {
    return this.selectedElement;
  }

  onSelect(callback: (el: HTMLElement | null) => void) {
    this.onSelectCallbacks.push(callback);
  }

  updateSelection() {
    if (this.selectedElement) {
      this.highlightElement(this.selectedElement, this.selectOverlay);
    }
  }

  destroy() {
    this.deactivate();
    this.hoverOverlay.remove();
    this.selectOverlay.remove();
  }

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.active) return;
    const target = e.target as HTMLElement;

    // 忽略编辑器自身的 UI 元素
    if (target.closest('html-visual-editor')) return;

    this.highlightElement(target, this.hoverOverlay);
  };

  private handleClick = (e: MouseEvent) => {
    if (!this.active) return;
    const target = e.target as HTMLElement;
    if (target.closest('html-visual-editor')) return;

    e.preventDefault();
    e.stopPropagation();

    this.selectedElement = target;
    this.highlightElement(target, this.selectOverlay);
    this.hoverOverlay.style.display = 'none';
    this.onSelectCallbacks.forEach((cb) => cb(target));
  };

  private highlightElement(el: HTMLElement, overlay: HTMLDivElement) {
    const rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  private getCursor(pos: string): string {
    const cursors: Record<string, string> = {
      nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize',
      e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize',
      sw: 'nesw-resize', w: 'ew-resize',
    };
    return cursors[pos] || 'default';
  }

  private positionHandle(handle: HTMLDivElement, pos: string) {
    const offset = '-5px';
    const center = 'calc(50% - 4px)';
    const styles: Record<string, Partial<CSSStyleDeclaration>> = {
      nw: { top: offset, left: offset },
      n:  { top: offset, left: center },
      ne: { top: offset, right: offset },
      e:  { top: center, right: offset },
      se: { bottom: offset, right: offset },
      s:  { bottom: offset, left: center },
      sw: { bottom: offset, left: offset },
      w:  { top: center, left: offset },
    };
    Object.assign(handle.style, styles[pos]);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/SelectionManager.ts
git commit -m "feat: 实现元素选择与高亮系统"
```

---

### Task 8: 文本编辑模块

**Files:**
- Create: `src/content/editor/TextEditor.ts`
- Create: `src/content/ui/FloatingBar.ts`

- [ ] **Step 1: 实现浮动文本工具栏**

创建 `src/content/ui/FloatingBar.ts`：

```typescript
export class FloatingBar {
  private bar: HTMLDivElement;
  private onCommandCallbacks: Array<(cmd: string, value?: string) => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.bar = document.createElement('div');
    this.bar.className = 'floating-bar';
    this.bar.innerHTML = `
      <button data-cmd="bold" title="加粗"><b>B</b></button>
      <button data-cmd="italic" title="斜体"><i>I</i></button>
      <button data-cmd="underline" title="下划线"><u>U</u></button>
      <button data-cmd="strikeThrough" title="删除线"><s>S</s></button>
      <span class="separator"></span>
      <select data-cmd="fontSize" title="字号">
        <option value="">字号</option>
        <option value="1">12px</option>
        <option value="2">14px</option>
        <option value="3">16px</option>
        <option value="4">18px</option>
        <option value="5">24px</option>
        <option value="6">32px</option>
        <option value="7">48px</option>
      </select>
      <input type="color" data-cmd="foreColor" title="文字颜色" value="#000000">
      <span class="separator"></span>
      <button data-cmd="justifyLeft" title="左对齐">&#8676;</button>
      <button data-cmd="justifyCenter" title="居中">&#8596;</button>
      <button data-cmd="justifyRight" title="右对齐">&#8677;</button>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .floating-bar {
        position: fixed;
        display: none;
        background: #2d2d2d;
        border-radius: 6px;
        padding: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10;
        gap: 2px;
        align-items: center;
        pointer-events: auto;
      }
      .floating-bar.visible {
        display: flex;
      }
      .floating-bar button {
        background: none;
        border: none;
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .floating-bar button:hover {
        background: rgba(255,255,255,0.15);
      }
      .floating-bar button.active {
        background: rgba(255,255,255,0.25);
      }
      .floating-bar select {
        background: #444;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px;
        font-size: 12px;
        cursor: pointer;
      }
      .floating-bar input[type="color"] {
        width: 28px;
        height: 28px;
        padding: 2px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        background: none;
      }
      .floating-bar .separator {
        width: 1px;
        height: 20px;
        background: rgba(255,255,255,0.2);
        margin: 0 2px;
      }
    `;

    this.shadowRoot.appendChild(style);

    // 绑定事件
    this.bar.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 阻止失去选区
    });

    this.bar.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd!;
        this.onCommandCallbacks.forEach((cb) => cb(cmd));
      });
    });

    this.bar.querySelectorAll('select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const cmd = sel.dataset.cmd!;
        this.onCommandCallbacks.forEach((cb) => cb(cmd, sel.value));
        sel.value = '';
      });
    });

    this.bar.querySelector('input[type="color"]')?.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      const cmd = input.dataset.cmd!;
      this.onCommandCallbacks.forEach((cb) => cb(cmd, input.value));
    });
  }

  getElement(): HTMLDivElement {
    return this.bar;
  }

  show(x: number, y: number) {
    this.bar.style.left = x + 'px';
    this.bar.style.top = y + 'px';
    this.bar.classList.add('visible');
  }

  hide() {
    this.bar.classList.remove('visible');
  }

  onCommand(callback: (cmd: string, value?: string) => void) {
    this.onCommandCallbacks.push(callback);
  }
}
```

- [ ] **Step 2: 实现文本编辑器**

创建 `src/content/editor/TextEditor.ts`：

```typescript
import { History } from './History';
import { FloatingBar } from '../ui/FloatingBar';

export class TextEditor {
  private floatingBar: FloatingBar;
  private editingElement: HTMLElement | null = null;
  private originalContent = '';

  constructor(
    private history: History,
    shadowRoot: ShadowRoot,
    container: HTMLDivElement
  ) {
    this.floatingBar = new FloatingBar(shadowRoot);
    container.appendChild(this.floatingBar.getElement());

    this.floatingBar.onCommand((cmd, value) => {
      document.execCommand(cmd, false, value);
    });

    // 监听选区变化，显示/隐藏浮动工具栏
    document.addEventListener('selectionchange', this.handleSelectionChange);
  }

  startEditing(element: HTMLElement) {
    if (this.editingElement) {
      this.stopEditing();
    }

    this.editingElement = element;
    this.originalContent = element.innerHTML;
    element.contentEditable = 'true';
    element.focus();
    element.style.outline = '2px solid #4285f4';
    element.style.outlineOffset = '2px';
  }

  stopEditing() {
    if (!this.editingElement) return;

    const el = this.editingElement;
    const before = this.originalContent;
    const after = el.innerHTML;

    el.contentEditable = 'false';
    el.style.outline = '';
    el.style.outlineOffset = '';

    if (before !== after) {
      this.history.push(
        'text-change',
        () => { el.innerHTML = before; },
        () => { el.innerHTML = after; }
      );
    }

    this.editingElement = null;
    this.originalContent = '';
    this.floatingBar.hide();
  }

  isEditing(): boolean {
    return this.editingElement !== null;
  }

  destroy() {
    this.stopEditing();
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    this.floatingBar.getElement().remove();
  }

  private handleSelectionChange = () => {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !this.editingElement) {
      this.floatingBar.hide();
      return;
    }

    // 确保选区在编辑中的元素内
    if (!this.editingElement.contains(selection.anchorNode)) {
      this.floatingBar.hide();
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    this.floatingBar.show(
      rect.left + rect.width / 2 - 150,
      rect.top - 44
    );
  };
}
```

- [ ] **Step 3: 提交**

```bash
git add src/content/editor/TextEditor.ts src/content/ui/FloatingBar.ts
git commit -m "feat: 实现文本编辑模块和浮动工具栏"
```

---

### Task 9: 样式编辑模块

**Files:**
- Create: `src/content/editor/StyleEditor.ts`
- Create: `src/content/ui/StylePanel.ts`

- [ ] **Step 1: 实现样式面板 UI**

创建 `src/content/ui/StylePanel.ts`：

```typescript
interface StyleField {
  label: string;
  prop: string;
  type: 'color' | 'text' | 'range' | 'select';
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

const STYLE_FIELDS: StyleField[] = [
  { label: '背景色', prop: 'backgroundColor', type: 'color' },
  { label: '文字颜色', prop: 'color', type: 'color' },
  { label: '透明度', prop: 'opacity', type: 'range', min: 0, max: 100 },
  { label: '边框宽度', prop: 'borderWidth', type: 'text', unit: 'px' },
  { label: '边框颜色', prop: 'borderColor', type: 'color' },
  { label: '边框样式', prop: 'borderStyle', type: 'select', options: ['none', 'solid', 'dashed', 'dotted', 'double'] },
  { label: '圆角', prop: 'borderRadius', type: 'text', unit: 'px' },
  { label: '阴影', prop: 'boxShadow', type: 'text' },
  { label: '内边距', prop: 'padding', type: 'text', unit: 'px' },
  { label: '外边距', prop: 'margin', type: 'text', unit: 'px' },
];

export class StylePanel {
  private panel: HTMLDivElement;
  private fieldsContainer: HTMLDivElement;
  private currentElement: HTMLElement | null = null;
  private onChangeCallbacks: Array<(prop: string, value: string) => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.panel = document.createElement('div');
    this.panel.className = 'style-panel';

    const header = document.createElement('div');
    header.className = 'style-panel-header';
    header.innerHTML = `
      <span>样式编辑</span>
      <button class="style-panel-close">&times;</button>
    `;
    header.querySelector('.style-panel-close')!.addEventListener('click', () => this.hide());

    this.fieldsContainer = document.createElement('div');
    this.fieldsContainer.className = 'style-panel-fields';

    this.panel.appendChild(header);
    this.panel.appendChild(this.fieldsContainer);

    const style = document.createElement('style');
    style.textContent = `
      .style-panel {
        position: fixed;
        right: -300px;
        top: 48px;
        width: 280px;
        height: calc(100vh - 48px);
        background: white;
        box-shadow: -2px 0 12px rgba(0,0,0,0.15);
        overflow-y: auto;
        transition: right 0.3s ease;
        z-index: 10;
        pointer-events: auto;
      }
      .style-panel.visible {
        right: 0;
      }
      .style-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid #eee;
        font-weight: 600;
        font-size: 14px;
        position: sticky;
        top: 0;
        background: white;
      }
      .style-panel-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #888;
        padding: 0;
      }
      .style-panel-close:hover {
        color: #333;
      }
      .style-panel-fields {
        padding: 12px 16px;
      }
      .style-field {
        margin-bottom: 12px;
      }
      .style-field label {
        display: block;
        font-size: 12px;
        color: #666;
        margin-bottom: 4px;
      }
      .style-field input[type="text"],
      .style-field select {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 13px;
      }
      .style-field input[type="color"] {
        width: 40px;
        height: 30px;
        padding: 2px;
        border: 1px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
      }
      .style-field input[type="range"] {
        width: 100%;
      }
      .style-field .color-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .style-field .color-row input[type="text"] {
        flex: 1;
      }
    `;
    this.shadowRoot.appendChild(style);
  }

  getElement(): HTMLDivElement {
    return this.panel;
  }

  show(element: HTMLElement) {
    this.currentElement = element;
    this.buildFields(element);
    this.panel.classList.add('visible');
  }

  hide() {
    this.panel.classList.remove('visible');
    this.currentElement = null;
  }

  onChange(callback: (prop: string, value: string) => void) {
    this.onChangeCallbacks.push(callback);
  }

  private buildFields(element: HTMLElement) {
    this.fieldsContainer.innerHTML = '';
    const computed = window.getComputedStyle(element);

    STYLE_FIELDS.forEach((field) => {
      const div = document.createElement('div');
      div.className = 'style-field';

      const label = document.createElement('label');
      label.textContent = field.label;
      div.appendChild(label);

      const currentValue = computed.getPropertyValue(
        field.prop.replace(/([A-Z])/g, '-$1').toLowerCase()
      );

      if (field.type === 'color') {
        const row = document.createElement('div');
        row.className = 'color-row';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = this.rgbToHex(currentValue);

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.value = currentValue;

        colorInput.addEventListener('input', () => {
          textInput.value = colorInput.value;
          this.applyChange(field.prop, colorInput.value);
        });

        textInput.addEventListener('change', () => {
          this.applyChange(field.prop, textInput.value);
        });

        row.appendChild(colorInput);
        row.appendChild(textInput);
        div.appendChild(row);
      } else if (field.type === 'select') {
        const select = document.createElement('select');
        field.options!.forEach((opt) => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          if (currentValue.includes(opt)) option.selected = true;
          select.appendChild(option);
        });
        select.addEventListener('change', () => {
          this.applyChange(field.prop, select.value);
        });
        div.appendChild(select);
      } else if (field.type === 'range') {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(field.min ?? 0);
        input.max = String(field.max ?? 100);
        input.value = String(parseFloat(currentValue) * 100 || 100);
        input.addEventListener('input', () => {
          this.applyChange(field.prop, String(parseInt(input.value) / 100));
        });
        div.appendChild(input);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
        input.placeholder = field.unit ? `例如: 10${field.unit}` : '';
        input.addEventListener('change', () => {
          let val = input.value;
          if (field.unit && val && !val.endsWith(field.unit) && /^\d+$/.test(val)) {
            val += field.unit;
            input.value = val;
          }
          this.applyChange(field.prop, val);
        });
        div.appendChild(input);
      }

      this.fieldsContainer.appendChild(div);
    });
  }

  private applyChange(prop: string, value: string) {
    this.onChangeCallbacks.forEach((cb) => cb(prop, value));
  }

  private rgbToHex(rgb: string): string {
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!match) return '#000000';
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
}
```

- [ ] **Step 2: 实现样式编辑器**

创建 `src/content/editor/StyleEditor.ts`：

```typescript
import { History } from './History';
import { StylePanel } from '../ui/StylePanel';

export class StyleEditor {
  private stylePanel: StylePanel;

  constructor(
    private history: History,
    shadowRoot: ShadowRoot,
    container: HTMLDivElement
  ) {
    this.stylePanel = new StylePanel(shadowRoot);
    container.appendChild(this.stylePanel.getElement());

    this.stylePanel.onChange((prop, value) => {
      this.applyStyle(prop, value);
    });
  }

  showForElement(element: HTMLElement) {
    this.stylePanel.show(element);
  }

  hide() {
    this.stylePanel.hide();
  }

  destroy() {
    this.stylePanel.hide();
    this.stylePanel.getElement().remove();
  }

  private applyStyle(prop: string, value: string) {
    // 通过 StylePanel.show 设置的 currentElement 无法直接访问
    // 这里通过页面选中的元素来操作
    const overlay = document.querySelector('.select-overlay');
    // 简化：通过事件系统传递目标元素
    // 实际在 Engine 中协调
  }

  applyStyleToElement(element: HTMLElement, prop: string, value: string) {
    const before = element.style.getPropertyValue(
      prop.replace(/([A-Z])/g, '-$1').toLowerCase()
    );

    (element.style as any)[prop] = value;

    this.history.push(
      'style-change',
      () => { (element.style as any)[prop] = before; },
      () => { (element.style as any)[prop] = value; }
    );
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/content/editor/StyleEditor.ts src/content/ui/StylePanel.ts
git commit -m "feat: 实现样式编辑模块和样式面板"
```

---

### Task 10: 顶部工具栏

**Files:**
- Create: `src/content/ui/Toolbar.ts`

- [ ] **Step 1: 实现顶部工具栏**

创建 `src/content/ui/Toolbar.ts`：

```typescript
export type ToolbarAction =
  | 'undo' | 'redo'
  | 'insert' | 'export' | 'copy-html'
  | 'exit';

export class Toolbar {
  private toolbar: HTMLDivElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private onActionCallbacks: Array<(action: ToolbarAction) => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'main-toolbar';
    this.toolbar.innerHTML = `
      <div class="toolbar-left">
        <span class="toolbar-brand">HTML Visual Editor</span>
        <span class="toolbar-separator"></span>
        <button data-action="undo" title="撤销 (Ctrl+Z)" disabled>&#8630; 撤销</button>
        <button data-action="redo" title="重做 (Ctrl+Y)" disabled>&#8631; 重做</button>
      </div>
      <div class="toolbar-right">
        <button data-action="insert" title="插入元素">+ 插入</button>
        <button data-action="copy-html" title="复制 HTML">复制</button>
        <button data-action="export" title="导出 HTML">导出</button>
        <span class="toolbar-separator"></span>
        <button data-action="exit" class="exit-btn" title="退出编辑模式">退出</button>
      </div>
    `;

    this.undoBtn = this.toolbar.querySelector('[data-action="undo"]')!;
    this.redoBtn = this.toolbar.querySelector('[data-action="redo"]')!;

    this.toolbar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const action = btn.dataset.action as ToolbarAction;
      if (action) {
        this.onActionCallbacks.forEach((cb) => cb(action));
      }
    });

    const style = document.createElement('style');
    style.textContent = `
      .main-toolbar {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 44px;
        background: #fff;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.08);
        z-index: 10;
        pointer-events: auto;
      }
      .toolbar-left, .toolbar-right {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .toolbar-brand {
        font-weight: 600;
        font-size: 14px;
        color: #4285f4;
        margin-right: 8px;
      }
      .toolbar-separator {
        width: 1px;
        height: 24px;
        background: #e0e0e0;
        margin: 0 6px;
      }
      .main-toolbar button {
        background: none;
        border: 1px solid transparent;
        border-radius: 4px;
        padding: 6px 10px;
        font-size: 13px;
        cursor: pointer;
        color: #555;
        transition: all 0.15s;
        white-space: nowrap;
      }
      .main-toolbar button:hover:not(:disabled) {
        background: #f0f0f0;
        border-color: #ddd;
      }
      .main-toolbar button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .exit-btn {
        color: #d93025 !important;
      }
      .exit-btn:hover {
        background: #fce8e6 !important;
        border-color: #d93025 !important;
      }
    `;
    this.shadowRoot.appendChild(style);
  }

  getElement(): HTMLDivElement {
    return this.toolbar;
  }

  updateUndoRedo(canUndo: boolean, canRedo: boolean) {
    this.undoBtn.disabled = !canUndo;
    this.redoBtn.disabled = !canRedo;
  }

  onAction(callback: (action: ToolbarAction) => void) {
    this.onActionCallbacks.push(callback);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/ui/Toolbar.ts
git commit -m "feat: 实现顶部工具栏"
```

---

### Task 11: 右键菜单

**Files:**
- Create: `src/content/ui/ContextMenu.ts`

- [ ] **Step 1: 实现右键菜单**

创建 `src/content/ui/ContextMenu.ts`：

```typescript
export type ContextAction =
  | 'copy' | 'delete' | 'move-up' | 'move-down'
  | 'copy-html-element' | 'edit-text';

interface MenuItem {
  label: string;
  action: ContextAction;
  icon: string;
}

const MENU_ITEMS: MenuItem[] = [
  { label: '编辑文本', action: 'edit-text', icon: '&#9998;' },
  { label: '复制元素', action: 'copy', icon: '&#9776;' },
  { label: '复制 HTML', action: 'copy-html-element', icon: '&lt;/&gt;' },
  { label: '上移', action: 'move-up', icon: '&uarr;' },
  { label: '下移', action: 'move-down', icon: '&darr;' },
  { label: '删除', action: 'delete', icon: '&#10005;' },
];

export class ContextMenu {
  private menu: HTMLDivElement;
  private targetElement: HTMLElement | null = null;
  private onActionCallbacks: Array<(action: ContextAction, target: HTMLElement) => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.menu = document.createElement('div');
    this.menu.className = 'context-menu';

    MENU_ITEMS.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'context-menu-item';
      if (item.action === 'delete') btn.classList.add('danger');
      btn.innerHTML = `<span class="cm-icon">${item.icon}</span> ${item.label}`;
      btn.addEventListener('click', () => {
        if (this.targetElement) {
          this.onActionCallbacks.forEach((cb) => cb(item.action, this.targetElement!));
        }
        this.hide();
      });
      this.menu.appendChild(btn);
    });

    const style = document.createElement('style');
    style.textContent = `
      .context-menu {
        position: fixed;
        display: none;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        padding: 4px;
        min-width: 160px;
        z-index: 20;
        pointer-events: auto;
      }
      .context-menu.visible {
        display: block;
      }
      .context-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 12px;
        background: none;
        border: none;
        border-radius: 4px;
        font-size: 13px;
        color: #333;
        cursor: pointer;
        text-align: left;
      }
      .context-menu-item:hover {
        background: #f0f0f0;
      }
      .context-menu-item.danger {
        color: #d93025;
      }
      .context-menu-item.danger:hover {
        background: #fce8e6;
      }
      .cm-icon {
        width: 18px;
        text-align: center;
        font-size: 14px;
      }
    `;
    this.shadowRoot.appendChild(style);

    // 点击其他地方关闭菜单
    document.addEventListener('click', () => this.hide());
  }

  getElement(): HTMLDivElement {
    return this.menu;
  }

  show(x: number, y: number, target: HTMLElement) {
    this.targetElement = target;
    this.menu.style.left = x + 'px';
    this.menu.style.top = y + 'px';
    this.menu.classList.add('visible');

    // 确保菜单不超出视口
    requestAnimationFrame(() => {
      const rect = this.menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this.menu.style.left = (x - rect.width) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        this.menu.style.top = (y - rect.height) + 'px';
      }
    });
  }

  hide() {
    this.menu.classList.remove('visible');
    this.targetElement = null;
  }

  onAction(callback: (action: ContextAction, target: HTMLElement) => void) {
    this.onActionCallbacks.push(callback);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/ui/ContextMenu.ts
git commit -m "feat: 实现右键菜单"
```

---

### Task 12: 布局拖拽模块

**Files:**
- Create: `src/content/editor/DragSystem.ts`

- [ ] **Step 1: 实现拖拽系统**

创建 `src/content/editor/DragSystem.ts`：

```typescript
import { History } from './History';

interface DragState {
  element: HTMLElement;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  originalPosition: string;
  originalLeft: string;
  originalTop: string;
}

interface ResizeState {
  element: HTMLElement;
  handle: string;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startLeft: number;
  startTop: number;
  originalWidth: string;
  originalHeight: string;
}

export class DragSystem {
  private dragState: DragState | null = null;
  private resizeState: ResizeState | null = null;
  private guides: HTMLDivElement[] = [];

  constructor(private history: History) {
    document.addEventListener('pointermove', this.handlePointerMove);
    document.addEventListener('pointerup', this.handlePointerUp);
  }

  startDrag(element: HTMLElement, startX: number, startY: number) {
    const computed = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    this.dragState = {
      element,
      startX,
      startY,
      startLeft: rect.left,
      startTop: rect.top,
      originalPosition: element.style.position,
      originalLeft: element.style.left,
      originalTop: element.style.top,
    };

    // 确保元素可以被移动
    if (computed.position === 'static') {
      element.style.position = 'relative';
    }

    element.style.cursor = 'grabbing';
    this.showGuides();
  }

  startResize(element: HTMLElement, handle: string, startX: number, startY: number) {
    const rect = element.getBoundingClientRect();
    this.resizeState = {
      element,
      handle,
      startX,
      startY,
      startWidth: rect.width,
      startHeight: rect.height,
      startLeft: rect.left,
      startTop: rect.top,
      originalWidth: element.style.width,
      originalHeight: element.style.height,
    };
  }

  destroy() {
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointerup', this.handlePointerUp);
    this.hideGuides();
  }

  private handlePointerMove = (e: PointerEvent) => {
    if (this.dragState) {
      this.handleDragMove(e);
    } else if (this.resizeState) {
      this.handleResizeMove(e);
    }
  };

  private handlePointerUp = () => {
    if (this.dragState) {
      this.finishDrag();
    } else if (this.resizeState) {
      this.finishResize();
    }
  };

  private handleDragMove(e: PointerEvent) {
    const state = this.dragState!;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    state.element.style.left = (state.startLeft + dx - state.element.offsetParent!.getBoundingClientRect().left) + 'px';
    state.element.style.top = (state.startTop + dy - state.element.offsetParent!.getBoundingClientRect().top) + 'px';
  }

  private handleResizeMove(e: PointerEvent) {
    const state = this.resizeState!;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const { handle, element } = state;

    let newWidth = state.startWidth;
    let newHeight = state.startHeight;

    if (handle.includes('e')) newWidth = state.startWidth + dx;
    if (handle.includes('w')) newWidth = state.startWidth - dx;
    if (handle.includes('s')) newHeight = state.startHeight + dy;
    if (handle.includes('n')) newHeight = state.startHeight - dy;

    element.style.width = Math.max(20, newWidth) + 'px';
    element.style.height = Math.max(20, newHeight) + 'px';
  }

  private finishDrag() {
    const state = this.dragState!;
    const el = state.element;
    const afterPosition = el.style.position;
    const afterLeft = el.style.left;
    const afterTop = el.style.top;

    el.style.cursor = '';
    this.hideGuides();

    this.history.push(
      'element-move',
      () => {
        el.style.position = state.originalPosition;
        el.style.left = state.originalLeft;
        el.style.top = state.originalTop;
      },
      () => {
        el.style.position = afterPosition;
        el.style.left = afterLeft;
        el.style.top = afterTop;
      }
    );

    this.dragState = null;
  }

  private finishResize() {
    const state = this.resizeState!;
    const el = state.element;
    const afterWidth = el.style.width;
    const afterHeight = el.style.height;

    this.history.push(
      'element-resize',
      () => {
        el.style.width = state.originalWidth;
        el.style.height = state.originalHeight;
      },
      () => {
        el.style.width = afterWidth;
        el.style.height = afterHeight;
      }
    );

    this.resizeState = null;
  }

  private showGuides() {
    // 水平和垂直中心辅助线
    const hGuide = document.createElement('div');
    hGuide.style.cssText = `
      position: fixed; left: 0; width: 100%; height: 1px;
      top: 50%; background: #ff6b6b; z-index: 2147483646;
      pointer-events: none; display: none;
    `;

    const vGuide = document.createElement('div');
    vGuide.style.cssText = `
      position: fixed; top: 0; height: 100%; width: 1px;
      left: 50%; background: #ff6b6b; z-index: 2147483646;
      pointer-events: none; display: none;
    `;

    document.body.appendChild(hGuide);
    document.body.appendChild(vGuide);
    this.guides = [hGuide, vGuide];
  }

  private hideGuides() {
    this.guides.forEach((g) => g.remove());
    this.guides = [];
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/DragSystem.ts
git commit -m "feat: 实现布局拖拽和元素大小调整"
```

---

### Task 13: 元素管理模块

**Files:**
- Create: `src/content/editor/ElementManager.ts`
- Create: `src/content/ui/InsertPanel.ts`

- [ ] **Step 1: 实现插入面板**

创建 `src/content/ui/InsertPanel.ts`：

```typescript
import type { InsertableElement } from '../../shared/types';

interface InsertItem {
  type: InsertableElement;
  label: string;
  icon: string;
  category: string;
}

const INSERT_ITEMS: InsertItem[] = [
  { type: 'paragraph', label: '段落', icon: '&#182;', category: '基础' },
  { type: 'heading-1', label: '标题 1', icon: 'H1', category: '基础' },
  { type: 'heading-2', label: '标题 2', icon: 'H2', category: '基础' },
  { type: 'heading-3', label: '标题 3', icon: 'H3', category: '基础' },
  { type: 'image', label: '图片', icon: '&#128247;', category: '基础' },
  { type: 'link', label: '链接', icon: '&#128279;', category: '基础' },
  { type: 'button', label: '按钮', icon: '&#9634;', category: '基础' },
  { type: 'divider', label: '分割线', icon: '&#8212;', category: '基础' },
  { type: 'ordered-list', label: '有序列表', icon: '1.', category: '基础' },
  { type: 'unordered-list', label: '无序列表', icon: '&#8226;', category: '基础' },
  { type: 'table', label: '表格', icon: '&#9638;', category: '复杂' },
  { type: 'video', label: '视频', icon: '&#9654;', category: '多媒体' },
  { type: 'audio', label: '音频', icon: '&#9835;', category: '多媒体' },
  { type: 'form-input', label: '输入框', icon: '&#9997;', category: '表单' },
  { type: 'form-textarea', label: '文本域', icon: '&#9776;', category: '表单' },
  { type: 'form-select', label: '下拉框', icon: '&#9660;', category: '表单' },
  { type: 'form-checkbox', label: '复选框', icon: '&#9745;', category: '表单' },
  { type: 'form-radio', label: '单选框', icon: '&#9673;', category: '表单' },
  { type: 'form-button', label: '提交按钮', icon: '&#10004;', category: '表单' },
  { type: 'code-block', label: '代码块', icon: '{ }', category: '复杂' },
];

export class InsertPanel {
  private panel: HTMLDivElement;
  private onInsertCallbacks: Array<(type: InsertableElement) => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.panel = document.createElement('div');
    this.panel.className = 'insert-panel';

    const header = document.createElement('div');
    header.className = 'insert-panel-header';
    header.innerHTML = `
      <span>插入元素</span>
      <button class="insert-panel-close">&times;</button>
    `;
    header.querySelector('.insert-panel-close')!.addEventListener('click', () => this.hide());
    this.panel.appendChild(header);

    // 按分类分组
    const categories = ['基础', '复杂', '多媒体', '表单'];
    categories.forEach((cat) => {
      const items = INSERT_ITEMS.filter((i) => i.category === cat);
      if (items.length === 0) return;

      const section = document.createElement('div');
      section.className = 'insert-section';
      section.innerHTML = `<div class="insert-section-title">${cat}</div>`;

      const grid = document.createElement('div');
      grid.className = 'insert-grid';

      items.forEach((item) => {
        const btn = document.createElement('button');
        btn.className = 'insert-item';
        btn.innerHTML = `<span class="insert-icon">${item.icon}</span><span class="insert-label">${item.label}</span>`;
        btn.addEventListener('click', () => {
          this.onInsertCallbacks.forEach((cb) => cb(item.type));
          this.hide();
        });
        grid.appendChild(btn);
      });

      section.appendChild(grid);
      this.panel.appendChild(section);
    });

    const style = document.createElement('style');
    style.textContent = `
      .insert-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        width: 480px;
        max-height: 80vh;
        overflow-y: auto;
        z-index: 20;
        display: none;
        pointer-events: auto;
      }
      .insert-panel.visible {
        display: block;
      }
      .insert-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #eee;
        font-weight: 600;
        font-size: 15px;
        position: sticky;
        top: 0;
        background: white;
        border-radius: 12px 12px 0 0;
      }
      .insert-panel-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #888;
      }
      .insert-section {
        padding: 12px 20px;
      }
      .insert-section-title {
        font-size: 12px;
        color: #888;
        margin-bottom: 8px;
        text-transform: uppercase;
      }
      .insert-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
      }
      .insert-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 12px 8px;
        background: #f8f8f8;
        border: 1px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .insert-item:hover {
        background: #e8f0fe;
        border-color: #4285f4;
      }
      .insert-icon {
        font-size: 20px;
      }
      .insert-label {
        font-size: 11px;
        color: #555;
      }
    `;
    this.shadowRoot.appendChild(style);
  }

  getElement(): HTMLDivElement {
    return this.panel;
  }

  show() {
    this.panel.classList.add('visible');
  }

  hide() {
    this.panel.classList.remove('visible');
  }

  onInsert(callback: (type: InsertableElement) => void) {
    this.onInsertCallbacks.push(callback);
  }
}
```

- [ ] **Step 2: 实现元素管理器**

创建 `src/content/editor/ElementManager.ts`：

```typescript
import { History } from './History';
import type { InsertableElement } from '../../shared/types';

export class ElementManager {
  constructor(private history: History) {}

  createElement(type: InsertableElement): HTMLElement {
    switch (type) {
      case 'paragraph':
        return this.makeElement('p', '请输入文字...');
      case 'heading-1':
        return this.makeElement('h1', '标题 1');
      case 'heading-2':
        return this.makeElement('h2', '标题 2');
      case 'heading-3':
        return this.makeElement('h3', '标题 3');
      case 'image': {
        const img = document.createElement('img');
        img.src = 'data:image/svg+xml,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" fill="%23e0e0e0"><rect width="300" height="200"/><text x="150" y="105" text-anchor="middle" fill="%23999" font-size="16">点击替换图片</text></svg>'
        );
        img.alt = '图片';
        img.style.maxWidth = '100%';
        return img;
      }
      case 'link': {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = '链接文字';
        return a;
      }
      case 'button': {
        const btn = document.createElement('button');
        btn.textContent = '按钮';
        btn.style.cssText = 'padding: 8px 16px; font-size: 14px; border-radius: 4px; border: 1px solid #ccc; cursor: pointer;';
        return btn;
      }
      case 'divider':
        return document.createElement('hr');
      case 'ordered-list': {
        const ol = document.createElement('ol');
        ['列表项 1', '列表项 2', '列表项 3'].forEach((text) => {
          const li = document.createElement('li');
          li.textContent = text;
          ol.appendChild(li);
        });
        return ol;
      }
      case 'unordered-list': {
        const ul = document.createElement('ul');
        ['列表项 1', '列表项 2', '列表项 3'].forEach((text) => {
          const li = document.createElement('li');
          li.textContent = text;
          ul.appendChild(li);
        });
        return ul;
      }
      case 'table':
        return this.createTable(3, 3);
      case 'video': {
        const video = document.createElement('video');
        video.controls = true;
        video.style.cssText = 'width: 400px; max-width: 100%; background: #000;';
        return video;
      }
      case 'audio': {
        const audio = document.createElement('audio');
        audio.controls = true;
        return audio;
      }
      case 'form-input': {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '请输入...';
        input.style.cssText = 'padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;';
        return input;
      }
      case 'form-textarea': {
        const textarea = document.createElement('textarea');
        textarea.placeholder = '请输入多行文字...';
        textarea.rows = 4;
        textarea.style.cssText = 'width: 100%; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;';
        return textarea;
      }
      case 'form-select': {
        const select = document.createElement('select');
        select.style.cssText = 'padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;';
        ['选项 1', '选项 2', '选项 3'].forEach((text) => {
          const opt = document.createElement('option');
          opt.textContent = text;
          select.appendChild(opt);
        });
        return select;
      }
      case 'form-checkbox': {
        const label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 14px;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        label.appendChild(cb);
        label.appendChild(document.createTextNode('复选框'));
        return label;
      }
      case 'form-radio': {
        const label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 14px;';
        const radio = document.createElement('input');
        radio.type = 'radio';
        label.appendChild(radio);
        label.appendChild(document.createTextNode('单选框'));
        return label;
      }
      case 'form-button': {
        const btn = document.createElement('button');
        btn.type = 'submit';
        btn.textContent = '提交';
        btn.style.cssText = 'padding: 8px 20px; font-size: 14px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;';
        return btn;
      }
      case 'code-block': {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = 'language-javascript';
        code.textContent = '// 在此输入代码\nconsole.log("Hello World");';
        pre.appendChild(code);
        pre.style.cssText = 'background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace;';
        return pre;
      }
      default:
        return this.makeElement('div', '未知元素');
    }
  }

  insertElement(newEl: HTMLElement, target: HTMLElement, position: 'before' | 'after' = 'after') {
    const parent = target.parentElement;
    if (!parent) return;

    if (position === 'after') {
      target.insertAdjacentElement('afterend', newEl);
    } else {
      target.insertAdjacentElement('beforebegin', newEl);
    }

    this.history.push(
      'element-insert',
      () => { newEl.remove(); },
      () => {
        if (position === 'after') {
          target.insertAdjacentElement('afterend', newEl);
        } else {
          target.insertAdjacentElement('beforebegin', newEl);
        }
      }
    );
  }

  deleteElement(element: HTMLElement) {
    const parent = element.parentElement;
    const nextSibling = element.nextSibling;
    if (!parent) return;

    const html = element.outerHTML;
    element.remove();

    this.history.push(
      'element-delete',
      () => {
        const restored = document.createRange().createContextualFragment(html).firstElementChild as HTMLElement;
        if (nextSibling) {
          parent.insertBefore(restored, nextSibling);
        } else {
          parent.appendChild(restored);
        }
      },
      () => {
        element.remove();
      }
    );
  }

  moveElement(element: HTMLElement, direction: 'up' | 'down') {
    const sibling = direction === 'up' ? element.previousElementSibling : element.nextElementSibling;
    if (!sibling) return;

    if (direction === 'up') {
      element.parentElement!.insertBefore(element, sibling);
    } else {
      element.parentElement!.insertBefore(sibling, element);
    }

    this.history.push(
      'element-reorder',
      () => {
        if (direction === 'up') {
          element.parentElement!.insertBefore(sibling, element);
        } else {
          element.parentElement!.insertBefore(element, sibling);
        }
      },
      () => {
        if (direction === 'up') {
          element.parentElement!.insertBefore(element, sibling);
        } else {
          element.parentElement!.insertBefore(sibling, element);
        }
      }
    );
  }

  duplicateElement(element: HTMLElement) {
    const clone = element.cloneNode(true) as HTMLElement;
    element.insertAdjacentElement('afterend', clone);

    this.history.push(
      'element-insert',
      () => { clone.remove(); },
      () => { element.insertAdjacentElement('afterend', clone); }
    );

    return clone;
  }

  private makeElement(tag: string, text: string): HTMLElement {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
  }

  private createTable(rows: number, cols: number): HTMLTableElement {
    const table = document.createElement('table');
    table.style.cssText = 'border-collapse: collapse; width: 100%;';
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement(r === 0 ? 'th' : 'td');
        td.textContent = r === 0 ? `列 ${c + 1}` : `内容`;
        td.style.cssText = 'border: 1px solid #ddd; padding: 8px; text-align: left;';
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    return table;
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/content/editor/ElementManager.ts src/content/ui/InsertPanel.ts
git commit -m "feat: 实现元素管理模块和插入面板"
```

---

## 阶段三：高级编辑功能

### Task 14: 表格编辑模块

**Files:**
- Create: `src/content/editor/TableEditor.ts`
- Create: `src/content/ui/TableToolbar.ts`

- [ ] **Step 1: 实现表格工具栏**

创建 `src/content/ui/TableToolbar.ts`：

```typescript
export type TableAction =
  | 'add-row-above' | 'add-row-below'
  | 'add-col-left' | 'add-col-right'
  | 'delete-row' | 'delete-col'
  | 'merge-cells' | 'split-cell'
  | 'cell-bg-color' | 'cell-border';

export class TableToolbar {
  private toolbar: HTMLDivElement;
  private onActionCallbacks: Array<(action: TableAction, value?: string) => void> = [];

  constructor(private shadowRoot: ShadowRoot) {
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'table-toolbar';
    this.toolbar.innerHTML = `
      <button data-action="add-row-above" title="上方插入行">&uarr;+ 行</button>
      <button data-action="add-row-below" title="下方插入行">&darr;+ 行</button>
      <button data-action="add-col-left" title="左侧插入列">&larr;+ 列</button>
      <button data-action="add-col-right" title="右侧插入列">&rarr;+ 列</button>
      <span class="tt-separator"></span>
      <button data-action="delete-row" title="删除行" class="danger">- 行</button>
      <button data-action="delete-col" title="删除列" class="danger">- 列</button>
      <span class="tt-separator"></span>
      <button data-action="merge-cells" title="合并单元格">合并</button>
      <button data-action="split-cell" title="拆分单元格">拆分</button>
      <span class="tt-separator"></span>
      <input type="color" data-action="cell-bg-color" title="单元格背景色" value="#ffffff">
    `;

    this.toolbar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const action = btn.dataset.action as TableAction;
      this.onActionCallbacks.forEach((cb) => cb(action));
    });

    this.toolbar.querySelector('input[type="color"]')?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      this.onActionCallbacks.forEach((cb) => cb('cell-bg-color', value));
    });

    const style = document.createElement('style');
    style.textContent = `
      .table-toolbar {
        position: fixed;
        display: none;
        background: white;
        border-radius: 8px;
        padding: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        z-index: 15;
        gap: 4px;
        align-items: center;
        pointer-events: auto;
      }
      .table-toolbar.visible {
        display: flex;
      }
      .table-toolbar button {
        background: none;
        border: 1px solid transparent;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        cursor: pointer;
        color: #555;
        white-space: nowrap;
      }
      .table-toolbar button:hover {
        background: #f0f0f0;
        border-color: #ddd;
      }
      .table-toolbar button.danger {
        color: #d93025;
      }
      .table-toolbar button.danger:hover {
        background: #fce8e6;
      }
      .tt-separator {
        width: 1px;
        height: 20px;
        background: #e0e0e0;
      }
      .table-toolbar input[type="color"] {
        width: 28px;
        height: 28px;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 2px;
        cursor: pointer;
      }
    `;
    this.shadowRoot.appendChild(style);
  }

  getElement(): HTMLDivElement {
    return this.toolbar;
  }

  show(x: number, y: number) {
    this.toolbar.style.left = x + 'px';
    this.toolbar.style.top = y + 'px';
    this.toolbar.classList.add('visible');
  }

  hide() {
    this.toolbar.classList.remove('visible');
  }

  onAction(callback: (action: TableAction, value?: string) => void) {
    this.onActionCallbacks.push(callback);
  }
}
```

- [ ] **Step 2: 实现表格编辑器**

创建 `src/content/editor/TableEditor.ts`：

```typescript
import { History } from './History';
import { TableToolbar, type TableAction } from '../ui/TableToolbar';

export class TableEditor {
  private tableToolbar: TableToolbar;
  private activeTable: HTMLTableElement | null = null;
  private activeCell: HTMLTableCellElement | null = null;

  constructor(
    private history: History,
    shadowRoot: ShadowRoot,
    container: HTMLDivElement
  ) {
    this.tableToolbar = new TableToolbar(shadowRoot);
    container.appendChild(this.tableToolbar.getElement());

    this.tableToolbar.onAction((action, value) => {
      this.handleAction(action, value);
    });
  }

  activateForTable(table: HTMLTableElement, cell: HTMLTableCellElement) {
    this.activeTable = table;
    this.activeCell = cell;
    cell.contentEditable = 'true';
    cell.focus();

    const rect = table.getBoundingClientRect();
    this.tableToolbar.show(rect.left, rect.top - 44);
  }

  deactivate() {
    if (this.activeCell) {
      this.activeCell.contentEditable = 'false';
    }
    this.activeTable = null;
    this.activeCell = null;
    this.tableToolbar.hide();
  }

  isTableElement(el: HTMLElement): boolean {
    return el.closest('table') !== null;
  }

  getTableAndCell(el: HTMLElement): { table: HTMLTableElement; cell: HTMLTableCellElement } | null {
    const cell = el.closest('td, th') as HTMLTableCellElement | null;
    const table = el.closest('table') as HTMLTableElement | null;
    if (!cell || !table) return null;
    return { table, cell };
  }

  destroy() {
    this.deactivate();
    this.tableToolbar.getElement().remove();
  }

  private handleAction(action: TableAction, value?: string) {
    if (!this.activeTable || !this.activeCell) return;

    const table = this.activeTable;
    const cell = this.activeCell;
    const row = cell.parentElement as HTMLTableRowElement;
    const rowIndex = row.rowIndex;
    const cellIndex = cell.cellIndex;

    const beforeHTML = table.outerHTML;

    switch (action) {
      case 'add-row-above':
        this.insertRow(table, rowIndex);
        break;
      case 'add-row-below':
        this.insertRow(table, rowIndex + 1);
        break;
      case 'add-col-left':
        this.insertColumn(table, cellIndex);
        break;
      case 'add-col-right':
        this.insertColumn(table, cellIndex + 1);
        break;
      case 'delete-row':
        if (table.rows.length > 1) {
          table.deleteRow(rowIndex);
        }
        break;
      case 'delete-col':
        this.deleteColumn(table, cellIndex);
        break;
      case 'merge-cells':
        this.mergeCells(table);
        break;
      case 'split-cell':
        this.splitCell(cell);
        break;
      case 'cell-bg-color':
        if (value) cell.style.backgroundColor = value;
        break;
    }

    const afterHTML = table.outerHTML;
    if (beforeHTML !== afterHTML) {
      this.history.push(
        'table-structure',
        () => { table.outerHTML = beforeHTML; },
        () => { table.outerHTML = afterHTML; }
      );
    }
  }

  private insertRow(table: HTMLTableElement, index: number) {
    const colCount = table.rows[0]?.cells.length || 1;
    const newRow = table.insertRow(index);
    for (let i = 0; i < colCount; i++) {
      const cell = newRow.insertCell();
      cell.textContent = '内容';
      cell.style.cssText = 'border: 1px solid #ddd; padding: 8px;';
    }
  }

  private insertColumn(table: HTMLTableElement, index: number) {
    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];
      const cell = row.insertCell(index);
      cell.textContent = r === 0 ? '新列' : '内容';
      cell.style.cssText = 'border: 1px solid #ddd; padding: 8px;';
    }
  }

  private deleteColumn(table: HTMLTableElement, index: number) {
    for (let r = 0; r < table.rows.length; r++) {
      if (table.rows[r].cells.length > 1) {
        table.rows[r].deleteCell(index);
      }
    }
  }

  private mergeCells(_table: HTMLTableElement) {
    // 合并选中的单元格（简化实现：合并当前单元格和右侧单元格）
    if (!this.activeCell) return;
    const nextCell = this.activeCell.nextElementSibling as HTMLTableCellElement | null;
    if (!nextCell) return;

    const colspan = (this.activeCell.colSpan || 1) + (nextCell.colSpan || 1);
    this.activeCell.colSpan = colspan;
    this.activeCell.textContent += ' ' + nextCell.textContent;
    nextCell.remove();
  }

  private splitCell(cell: HTMLTableCellElement) {
    if (cell.colSpan <= 1) return;

    const row = cell.parentElement as HTMLTableRowElement;
    const newColSpan = cell.colSpan - 1;
    cell.colSpan = 1;

    for (let i = 0; i < newColSpan; i++) {
      const newCell = document.createElement(cell.tagName.toLowerCase()) as HTMLTableCellElement;
      newCell.textContent = '内容';
      newCell.style.cssText = 'border: 1px solid #ddd; padding: 8px;';
      cell.insertAdjacentElement('afterend', newCell);
    }
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/content/editor/TableEditor.ts src/content/ui/TableToolbar.ts
git commit -m "feat: 实现表格编辑模块"
```

---

### Task 15: 多媒体管理模块

**Files:**
- Create: `src/content/editor/MediaManager.ts`

- [ ] **Step 1: 实现多媒体管理器**

创建 `src/content/editor/MediaManager.ts`：

```typescript
import { History } from './History';

export class MediaManager {
  constructor(private history: History) {}

  replaceImage(imgElement: HTMLImageElement) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const oldSrc = imgElement.src;
        const newSrc = e.target!.result as string;
        imgElement.src = newSrc;

        this.history.push(
          'media-change',
          () => { imgElement.src = oldSrc; },
          () => { imgElement.src = newSrc; }
        );
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  setMediaSource(element: HTMLVideoElement | HTMLAudioElement, src: string) {
    const oldSrc = element.src;
    element.src = src;

    this.history.push(
      'media-change',
      () => { element.src = oldSrc; },
      () => { element.src = src; }
    );
  }

  showMediaDialog(element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement) {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      padding: 24px; z-index: 2147483647; min-width: 400px;
    `;

    const isImage = element instanceof HTMLImageElement;
    const title = isImage ? '替换图片' : '设置媒体源';

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px; font-size: 16px;">${title}</h3>
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 13px; margin-bottom: 4px;">URL 地址</label>
        <input type="text" id="media-url" placeholder="https://..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; margin-bottom: 4px;">或从本地上传</label>
        <input type="file" id="media-file" accept="${isImage ? 'image/*' : 'video/*,audio/*'}" style="font-size: 13px;">
      </div>
      ${!isImage ? `
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; margin-bottom: 4px;">或粘贴嵌入代码 (iframe)</label>
        <textarea id="media-embed" placeholder="<iframe ...></iframe>" rows="3" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"></textarea>
      </div>
      ` : ''}
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button id="media-cancel" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">取消</button>
        <button id="media-confirm" style="padding: 8px 16px; border: none; border-radius: 4px; background: #4285f4; color: white; cursor: pointer;">确认</button>
      </div>
    `;

    // 遮罩
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 2147483646;';

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    const cleanup = () => {
      dialog.remove();
      overlay.remove();
    };

    dialog.querySelector('#media-cancel')!.addEventListener('click', cleanup);
    overlay.addEventListener('click', cleanup);

    dialog.querySelector('#media-confirm')!.addEventListener('click', () => {
      const urlInput = dialog.querySelector('#media-url') as HTMLInputElement;
      const fileInput = dialog.querySelector('#media-file') as HTMLInputElement;
      const embedInput = dialog.querySelector('#media-embed') as HTMLTextAreaElement | null;

      if (urlInput.value) {
        if (isImage) {
          this.replaceImageSrc(element as HTMLImageElement, urlInput.value);
        } else {
          this.setMediaSource(element as HTMLVideoElement | HTMLAudioElement, urlInput.value);
        }
      } else if (fileInput.files?.[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (isImage) {
            this.replaceImageSrc(element as HTMLImageElement, e.target!.result as string);
          } else {
            this.setMediaSource(element as HTMLVideoElement | HTMLAudioElement, e.target!.result as string);
          }
        };
        reader.readAsDataURL(fileInput.files[0]);
      } else if (embedInput?.value) {
        const oldHTML = element.outerHTML;
        const parent = element.parentElement!;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = embedInput.value;
        parent.replaceChild(wrapper.firstElementChild || wrapper, element);
        this.history.push(
          'media-change',
          () => { parent.innerHTML = oldHTML; },
          () => { parent.replaceChild(wrapper.firstElementChild || wrapper, element); }
        );
      }
      cleanup();
    });
  }

  private replaceImageSrc(img: HTMLImageElement, newSrc: string) {
    const oldSrc = img.src;
    img.src = newSrc;
    this.history.push(
      'media-change',
      () => { img.src = oldSrc; },
      () => { img.src = newSrc; }
    );
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/MediaManager.ts
git commit -m "feat: 实现多媒体管理模块"
```

---

### Task 16: 表单编辑模块

**Files:**
- Create: `src/content/editor/FormEditor.ts`

- [ ] **Step 1: 实现表单编辑器**

创建 `src/content/editor/FormEditor.ts`：

```typescript
import { History } from './History';

export class FormEditor {
  constructor(private history: History) {}

  isFormElement(el: HTMLElement): boolean {
    const formTags = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LABEL'];
    return formTags.includes(el.tagName) || el.closest('form') !== null;
  }

  showPropertyEditor(element: HTMLElement) {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      padding: 24px; z-index: 2147483647; min-width: 360px;
    `;

    const fields = this.getEditableProperties(element);
    let fieldsHTML = '';
    fields.forEach((field) => {
      if (field.type === 'options') {
        fieldsHTML += `
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 13px; margin-bottom: 4px;">${field.label}</label>
            <textarea id="form-${field.prop}" rows="4" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;">${field.value}</textarea>
            <small style="color: #888; font-size: 11px;">每行一个选项</small>
          </div>
        `;
      } else {
        fieldsHTML += `
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 13px; margin-bottom: 4px;">${field.label}</label>
            <input type="${field.type}" id="form-${field.prop}" value="${field.value}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
          </div>
        `;
      }
    });

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px; font-size: 16px;">编辑表单属性 - &lt;${element.tagName.toLowerCase()}&gt;</h3>
      ${fieldsHTML}
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button id="form-cancel" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">取消</button>
        <button id="form-confirm" style="padding: 8px 16px; border: none; border-radius: 4px; background: #4285f4; color: white; cursor: pointer;">确认</button>
      </div>
    `;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 2147483646;';

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    const cleanup = () => { dialog.remove(); overlay.remove(); };

    dialog.querySelector('#form-cancel')!.addEventListener('click', cleanup);
    overlay.addEventListener('click', cleanup);

    dialog.querySelector('#form-confirm')!.addEventListener('click', () => {
      const beforeHTML = element.outerHTML;

      fields.forEach((field) => {
        const input = dialog.querySelector(`#form-${field.prop}`) as HTMLInputElement | HTMLTextAreaElement;
        if (!input) return;

        if (field.prop === 'options' && element instanceof HTMLSelectElement) {
          element.innerHTML = '';
          input.value.split('\n').filter(Boolean).forEach((text) => {
            const opt = document.createElement('option');
            opt.textContent = text.trim();
            opt.value = text.trim();
            element.appendChild(opt);
          });
        } else if (field.prop === 'textContent') {
          element.textContent = input.value;
        } else {
          (element as any)[field.prop] = input.value;
        }
      });

      const afterHTML = element.outerHTML;
      if (beforeHTML !== afterHTML) {
        this.history.push(
          'form-change',
          () => { element.outerHTML = beforeHTML; },
          () => { element.outerHTML = afterHTML; }
        );
      }
      cleanup();
    });
  }

  private getEditableProperties(element: HTMLElement): Array<{ label: string; prop: string; value: string; type: string }> {
    const fields: Array<{ label: string; prop: string; value: string; type: string }> = [];

    if (element instanceof HTMLInputElement) {
      fields.push(
        { label: '类型', prop: 'type', value: element.type, type: 'text' },
        { label: '占位文字', prop: 'placeholder', value: element.placeholder, type: 'text' },
        { label: '默认值', prop: 'value', value: element.value, type: 'text' },
        { label: '名称', prop: 'name', value: element.name, type: 'text' }
      );
    } else if (element instanceof HTMLTextAreaElement) {
      fields.push(
        { label: '占位文字', prop: 'placeholder', value: element.placeholder, type: 'text' },
        { label: '行数', prop: 'rows', value: String(element.rows), type: 'number' },
        { label: '名称', prop: 'name', value: element.name, type: 'text' }
      );
    } else if (element instanceof HTMLSelectElement) {
      const options = Array.from(element.options).map((o) => o.textContent).join('\n');
      fields.push(
        { label: '名称', prop: 'name', value: element.name, type: 'text' },
        { label: '选项列表', prop: 'options', value: options, type: 'options' }
      );
    } else if (element instanceof HTMLButtonElement) {
      fields.push(
        { label: '按钮文字', prop: 'textContent', value: element.textContent || '', type: 'text' },
        { label: '类型', prop: 'type', value: element.type, type: 'text' }
      );
    }

    return fields;
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/FormEditor.ts
git commit -m "feat: 实现表单编辑模块"
```

---

### Task 17: 代码块模块

**Files:**
- Create: `src/content/editor/CodeBlock.ts`

- [ ] **Step 1: 安装 Prism.js**

```bash
npm install prismjs
npm install -D @types/prismjs
```

- [ ] **Step 2: 实现代码块管理器**

创建 `src/content/editor/CodeBlock.ts`：

```typescript
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

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      padding: 24px; z-index: 2147483647; width: 600px; max-height: 80vh;
    `;

    let langOptions = LANGUAGES.map(
      (l) => `<option value="${l.id}" ${l.id === currentLang ? 'selected' : ''}>${l.label}</option>`
    ).join('');

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px; font-size: 16px;">编辑代码块</h3>
      <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: center;">
        <label style="font-size: 13px;">语言：</label>
        <select id="code-lang" style="padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px;">${langOptions}</select>
        <label style="font-size: 13px; margin-left: auto;">
          <input type="checkbox" id="code-dark" ${this.darkTheme ? 'checked' : ''}> 暗色主题
        </label>
      </div>
      <textarea id="code-content" rows="15" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 14px; background: #1e1e1e; color: #d4d4d4; box-sizing: border-box; tab-size: 4; resize: vertical;">${this.escapeHTML(currentCode)}</textarea>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
        <button id="code-cancel" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">取消</button>
        <button id="code-confirm" style="padding: 8px 16px; border: none; border-radius: 4px; background: #4285f4; color: white; cursor: pointer;">确认</button>
      </div>
    `;

    // Tab 键支持
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
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 2147483646;';

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    const cleanup = () => { dialog.remove(); overlay.remove(); };

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
        this.history.push(
          'code-block-change',
          () => { preElement.outerHTML = beforeHTML; },
          () => { preElement.outerHTML = afterHTML; }
        );
      }
      cleanup();
    });
  }

  private applyCodeBlock(pre: HTMLElement, code: HTMLElement, content: string, lang: string, dark: boolean) {
    code.className = `language-${lang}`;
    code.textContent = content;

    // 应用 Prism 高亮
    if (Prism.languages[lang]) {
      code.innerHTML = Prism.highlight(content, Prism.languages[lang], lang);
    }

    // 应用主题
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
```

- [ ] **Step 3: 提交**

```bash
git add src/content/editor/CodeBlock.ts
git commit -m "feat: 实现代码块编辑模块"
```

---

## 阶段四：引擎整合与完善

### Task 18: 编辑引擎主类 — 整合所有模块

**Files:**
- Create: `src/content/editor/Engine.ts`

- [ ] **Step 1: 实现编辑引擎**

创建 `src/content/editor/Engine.ts`：

```typescript
import { History } from './History';
import { SelectionManager } from './SelectionManager';
import { TextEditor } from './TextEditor';
import { StyleEditor } from './StyleEditor';
import { DragSystem } from './DragSystem';
import { ElementManager } from './ElementManager';
import { TableEditor } from './TableEditor';
import { MediaManager } from './MediaManager';
import { FormEditor } from './FormEditor';
import { CodeBlockManager } from './CodeBlock';
import { Toolbar, type ToolbarAction } from '../ui/Toolbar';
import { ContextMenu, type ContextAction } from '../ui/ContextMenu';
import { InsertPanel } from '../ui/InsertPanel';
import { ShadowHost } from '../ui/ShadowHost';
import type { InsertableElement } from '../../shared/types';

export class Engine {
  private history: History;
  private selectionManager: SelectionManager;
  private textEditor: TextEditor;
  private styleEditor: StyleEditor;
  private dragSystem: DragSystem;
  private elementManager: ElementManager;
  private tableEditor: TableEditor;
  private mediaManager: MediaManager;
  private formEditor: FormEditor;
  private codeBlock: CodeBlockManager;
  private toolbar: Toolbar;
  private contextMenu: ContextMenu;
  private insertPanel: InsertPanel;

  constructor(private shadowHost: ShadowHost) {
    const container = shadowHost.getContainer();
    const shadowRoot = shadowHost.getShadowRoot();

    // 初始化核心系统
    this.history = new History();
    this.selectionManager = new SelectionManager(document.body);
    this.dragSystem = new DragSystem(this.history);
    this.elementManager = new ElementManager(this.history);
    this.mediaManager = new MediaManager(this.history);
    this.formEditor = new FormEditor(this.history);
    this.codeBlock = new CodeBlockManager(this.history);

    // 初始化带 UI 的模块
    this.textEditor = new TextEditor(this.history, shadowRoot, container);
    this.styleEditor = new StyleEditor(this.history, shadowRoot, container);
    this.tableEditor = new TableEditor(this.history, shadowRoot, container);

    // 初始化 UI 组件
    this.toolbar = new Toolbar(shadowRoot);
    container.insertBefore(this.toolbar.getElement(), container.firstChild);

    this.contextMenu = new ContextMenu(shadowRoot);
    container.appendChild(this.contextMenu.getElement());

    this.insertPanel = new InsertPanel(shadowRoot);
    container.appendChild(this.insertPanel.getElement());

    // 绑定事件
    this.setupToolbarActions();
    this.setupContextMenuActions();
    this.setupInsertActions();
    this.setupSelectionActions();
    this.setupKeyboardShortcuts();
    this.setupRightClick();

    // 历史记录变化时更新工具栏
    this.history.onChange(() => {
      this.toolbar.updateUndoRedo(this.history.canUndo, this.history.canRedo);
    });

    // 激活元素选择
    this.selectionManager.activate();

    // 为工具栏留出空间
    document.body.style.marginTop = '48px';
  }

  destroy() {
    this.selectionManager.destroy();
    this.textEditor.destroy();
    this.styleEditor.destroy();
    this.dragSystem.destroy();
    this.tableEditor.destroy();
    this.history.clear();
    document.body.style.marginTop = '';
  }

  private setupToolbarActions() {
    this.toolbar.onAction((action: ToolbarAction) => {
      switch (action) {
        case 'undo':
          this.history.undo();
          break;
        case 'redo':
          this.history.redo();
          break;
        case 'insert':
          this.insertPanel.show();
          break;
        case 'export':
          chrome.runtime.sendMessage({
            type: 'EXPORT_HTML',
            options: { includeStyles: true, includeResources: false, format: 'html' },
          });
          break;
        case 'copy-html':
          chrome.runtime.sendMessage({ type: 'COPY_HTML' });
          break;
        case 'exit':
          chrome.runtime.sendMessage({ type: 'TOGGLE_EDIT_MODE', mode: 'browse' });
          break;
      }
    });
  }

  private setupContextMenuActions() {
    this.contextMenu.onAction((action: ContextAction, target: HTMLElement) => {
      switch (action) {
        case 'edit-text':
          this.textEditor.startEditing(target);
          break;
        case 'copy':
          this.elementManager.duplicateElement(target);
          break;
        case 'copy-html-element':
          navigator.clipboard.writeText(target.outerHTML);
          break;
        case 'delete':
          this.elementManager.deleteElement(target);
          break;
        case 'move-up':
          this.elementManager.moveElement(target, 'up');
          break;
        case 'move-down':
          this.elementManager.moveElement(target, 'down');
          break;
      }
    });
  }

  private setupInsertActions() {
    this.insertPanel.onInsert((type: InsertableElement) => {
      const newEl = this.elementManager.createElement(type);
      const target = this.selectionManager.getSelectedElement() || document.body.lastElementChild as HTMLElement;
      if (target) {
        this.elementManager.insertElement(newEl, target, 'after');
      } else {
        document.body.appendChild(newEl);
      }
    });
  }

  private setupSelectionActions() {
    this.selectionManager.onSelect((el) => {
      if (!el) return;

      // 结束之前的文本编辑
      this.textEditor.stopEditing();
      this.tableEditor.deactivate();

      // 判断元素类型，决定操作
      const tableResult = this.tableEditor.getTableAndCell(el);
      if (tableResult) {
        this.tableEditor.activateForTable(tableResult.table, tableResult.cell);
        return;
      }

      if (el instanceof HTMLImageElement) {
        this.mediaManager.showMediaDialog(el);
        return;
      }

      if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
        this.mediaManager.showMediaDialog(el);
        return;
      }

      if (this.formEditor.isFormElement(el)) {
        this.formEditor.showPropertyEditor(el);
        return;
      }

      if (this.codeBlock.isCodeBlock(el)) {
        const pre = el.closest('pre') || el;
        this.codeBlock.editCodeBlock(pre as HTMLElement);
        return;
      }

      // 普通元素：显示样式面板
      this.styleEditor.showForElement(el);
    });
  }

  private setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Z: 撤销
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.history.undo();
      }
      // Ctrl+Y 或 Ctrl+Shift+Z: 重做
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        this.history.redo();
      }
      // Escape: 退出当前编辑状态
      if (e.key === 'Escape') {
        this.textEditor.stopEditing();
        this.tableEditor.deactivate();
        this.styleEditor.hide();
        this.contextMenu.hide();
        this.insertPanel.hide();
      }
      // Delete: 删除选中元素
      if (e.key === 'Delete' && !this.textEditor.isEditing()) {
        const selected = this.selectionManager.getSelectedElement();
        if (selected) {
          this.elementManager.deleteElement(selected);
        }
      }
    });
  }

  private setupRightClick() {
    document.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('html-visual-editor')) return;

      e.preventDefault();
      this.contextMenu.show(e.clientX, e.clientY, target);
    });
  }
}
```

- [ ] **Step 2: 更新 Content Script 入口以使用 Engine**

修改 `src/content/index.ts`，在 `enterEditMode` 中初始化 Engine，在 `exitEditMode` 中销毁：

```typescript
import type { MessageType, ResponseType } from '../shared/messages';
import type { EditorMode } from '../shared/types';
import { ShadowHost } from './ui/ShadowHost';
import { Engine } from './editor/Engine';

let currentMode: EditorMode = 'browse';
let shadowHost: ShadowHost | null = null;
let engine: Engine | null = null;

function enterEditMode() {
  if (currentMode === 'edit') return;
  currentMode = 'edit';

  shadowHost = new ShadowHost();
  shadowHost.mount();

  // 首次使用提示
  chrome.storage.local.get('hintDismissed', (result) => {
    if (!result.hintDismissed) {
      shadowHost!.showFirstTimeHint();
    }
  });

  // 初始化编辑引擎
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

// 监听来自 Background 的消息
chrome.runtime.onMessage.addListener(
  (message: MessageType, _sender, sendResponse: (response: ResponseType) => void) => {
    switch (message.type) {
      case 'TOGGLE_EDIT_MODE':
        if (message.mode === 'edit') {
          enterEditMode();
        } else {
          exitEditMode();
        }
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
```

- [ ] **Step 3: 验证构建**

```bash
npm run build
```

预期：构建成功，无 TypeScript 错误。

- [ ] **Step 4: 提交**

```bash
git add src/content/editor/Engine.ts src/content/index.ts
git commit -m "feat: 实现编辑引擎主类，整合所有编辑模块"
```

---

### Task 19: 样式编辑器整合修复

**Files:**
- Modify: `src/content/editor/StyleEditor.ts`
- Modify: `src/content/ui/StylePanel.ts`

- [ ] **Step 1: 修复 StyleEditor 与 StylePanel 的联动**

StylePanel 需要在 onChange 时传递当前元素。更新 `src/content/ui/StylePanel.ts`，在 `onChange` 回调中同时传递元素引用：

修改 `StylePanel` 的 `onChange` 类型和 `applyChange` 方法：

```typescript
// 在 StylePanel 类中，修改 onChangeCallbacks 的类型
private onChangeCallbacks: Array<(element: HTMLElement, prop: string, value: string) => void> = [];

// 修改 onChange 方法
onChange(callback: (element: HTMLElement, prop: string, value: string) => void) {
  this.onChangeCallbacks.push(callback);
}

// 修改 applyChange 方法
private applyChange(prop: string, value: string) {
  if (this.currentElement) {
    this.onChangeCallbacks.forEach((cb) => cb(this.currentElement!, prop, value));
  }
}
```

更新 `src/content/editor/StyleEditor.ts`：

```typescript
import { History } from './History';
import { StylePanel } from '../ui/StylePanel';

export class StyleEditor {
  private stylePanel: StylePanel;

  constructor(
    private history: History,
    shadowRoot: ShadowRoot,
    container: HTMLDivElement
  ) {
    this.stylePanel = new StylePanel(shadowRoot);
    container.appendChild(this.stylePanel.getElement());

    this.stylePanel.onChange((element, prop, value) => {
      this.applyStyleToElement(element, prop, value);
    });
  }

  showForElement(element: HTMLElement) {
    this.stylePanel.show(element);
  }

  hide() {
    this.stylePanel.hide();
  }

  destroy() {
    this.stylePanel.hide();
    this.stylePanel.getElement().remove();
  }

  applyStyleToElement(element: HTMLElement, prop: string, value: string) {
    const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
    const before = element.style.getPropertyValue(cssProp);

    (element.style as any)[prop] = value;

    this.history.push(
      'style-change',
      () => { (element.style as any)[prop] = before; },
      () => { (element.style as any)[prop] = value; }
    );
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/StyleEditor.ts src/content/ui/StylePanel.ts
git commit -m "fix: 修复样式编辑器与面板的元素引用联动"
```

---

### Task 20: 端到端测试与调试

**Files:**
- Create: `test/test-page.html`

- [ ] **Step 1: 创建测试页面**

创建 `test/test-page.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HTML Visual Editor 测试页面</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #333; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0; }
    img { max-width: 100%; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>测试页面</h1>
  <p>这是一个用于测试 HTML Visual Editor 的页面。</p>

  <div class="card">
    <h2>文本编辑测试</h2>
    <p>点击这段文字应该可以直接编辑。支持<b>加粗</b>、<i>斜体</i>、<u>下划线</u>。</p>
  </div>

  <div class="card">
    <h2>图片测试</h2>
    <img src="https://via.placeholder.com/400x200" alt="测试图片">
  </div>

  <div class="card">
    <h2>表格测试</h2>
    <table>
      <tr><th>姓名</th><th>年龄</th><th>城市</th></tr>
      <tr><td>张三</td><td>25</td><td>北京</td></tr>
      <tr><td>李四</td><td>30</td><td>上海</td></tr>
      <tr><td>王五</td><td>28</td><td>广州</td></tr>
    </table>
  </div>

  <div class="card">
    <h2>表单测试</h2>
    <form>
      <input type="text" placeholder="输入框">
      <select><option>选项1</option><option>选项2</option></select>
      <button type="submit">提交</button>
    </form>
  </div>

  <div class="card">
    <h2>代码块测试</h2>
    <pre><code class="language-javascript">function hello() {
  console.log("Hello World");
  return 42;
}</code></pre>
  </div>

  <div class="card">
    <h2>多媒体测试</h2>
    <video controls width="400">
      <source src="" type="video/mp4">
    </video>
  </div>
</body>
</html>
```

- [ ] **Step 2: 构建并加载扩展**

```bash
npm run build
```

在 Chrome 中：
1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"，选择 `dist/` 目录
4. 用 Chrome 打开 `test/test-page.html`

- [ ] **Step 3: 逐项测试**

测试清单：
- [ ] 点击扩展图标 → 切换编辑模式 → 工具栏出现
- [ ] 首次使用提示正确显示，关闭后不再出现
- [ ] 鼠标悬停 → 元素高亮（蓝色虚线框）
- [ ] 点击文本 → 文本工具栏 → 加粗/斜体等操作
- [ ] 选中元素 → 右侧样式面板 → 修改背景色等
- [ ] 右键 → 上下文菜单 → 复制/删除/移动
- [ ] 工具栏"插入" → 插入面板 → 插入各种元素
- [ ] 点击表格单元格 → 表格工具栏 → 增删行列
- [ ] 点击图片 → 媒体替换对话框
- [ ] 点击代码块 → 代码编辑对话框
- [ ] 点击表单元素 → 属性编辑对话框
- [ ] Ctrl+Z 撤销 / Ctrl+Y 重做
- [ ] 工具栏"导出" → 下载 HTML 文件
- [ ] 工具栏"退出" → 编辑器 UI 消失，页面恢复

- [ ] **Step 4: 修复发现的问题**

根据测试结果修复 bug。

- [ ] **Step 5: 提交**

```bash
git add test/
git commit -m "test: 添加端到端测试页面"
```

---

### Task 21: 双击进入文本编辑优化

**Files:**
- Modify: `src/content/editor/Engine.ts`
- Modify: `src/content/editor/SelectionManager.ts`

- [ ] **Step 1: 添加双击编辑文本的支持**

在 `SelectionManager` 中添加双击事件监听：

```typescript
// 在 SelectionManager 类中添加
private onDblClickCallbacks: Array<(el: HTMLElement) => void> = [];

onDblClick(callback: (el: HTMLElement) => void) {
  this.onDblClickCallbacks.push(callback);
}

// 在 activate() 方法中添加
this.pageRoot.addEventListener('dblclick', this.handleDblClick);

// 在 deactivate() 方法中添加
this.pageRoot.removeEventListener('dblclick', this.handleDblClick);

// 添加 handleDblClick 方法
private handleDblClick = (e: MouseEvent) => {
  if (!this.active) return;
  const target = e.target as HTMLElement;
  if (target.closest('html-visual-editor')) return;
  e.preventDefault();
  this.onDblClickCallbacks.forEach((cb) => cb(target));
};
```

在 `Engine` 中添加双击处理：

```typescript
// 在 setupSelectionActions() 方法末尾添加
this.selectionManager.onDblClick((el) => {
  // 双击文本元素直接进入编辑
  const isTextElement = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'LI', 'LABEL', 'TD', 'TH', 'BLOCKQUOTE', 'FIGCAPTION'].includes(el.tagName);
  if (isTextElement || (el.childNodes.length > 0 && el.childNodes[0].nodeType === Node.TEXT_NODE)) {
    this.textEditor.startEditing(el);
  }
});
```

- [ ] **Step 2: 提交**

```bash
git add src/content/editor/Engine.ts src/content/editor/SelectionManager.ts
git commit -m "feat: 支持双击元素直接进入文本编辑"
```

---

### Task 22: 最终构建验证

- [ ] **Step 1: 完整构建**

```bash
cd ~/yfj/html-visual-editor
npm run build
```

预期：构建成功，无错误。

- [ ] **Step 2: TypeScript 类型检查**

```bash
npx tsc --noEmit
```

预期：无类型错误。

- [ ] **Step 3: 在 Chrome 中完整测试**

重新加载扩展，在测试页面和真实网页上完整测试所有功能。

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore: 最终构建验证通过"
```
