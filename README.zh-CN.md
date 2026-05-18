# HTML Visual Editor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Platform-Chrome%20Extension-green.svg)](https://developer.chrome.com/docs/extensions/)

[English](README.md)

一个 Chrome 扩展，让你像使用 Word 一样直接在网页上可视化编辑 HTML —— 点击、输入、拖拽、调样式，所见即所得。

## 功能特性

- **可视化编辑** —— 点击选中元素，双击直接编辑文本
- **样式编辑器** —— 通过面板修改颜色、字体、间距、边框等样式
- **拖拽排序** —— 拖动页面元素重新排列
- **表格编辑** —— 增删行列、合并单元格
- **媒体管理** —— 编辑图片、视频、音频元素
- **表单编辑** —— 修改表单输入框及其属性
- **代码块** —— 基于 Prism.js 的语法高亮代码编辑
- **评论系统** —— 在任意元素上添加行内批注和便签
- **撤销/重做** —— 完整的历史记录（Ctrl+Z / Ctrl+Y）
- **插入元素** —— 添加段落、标题、图片、表格等新元素
- **导出** —— 下载编辑后的 HTML 或复制到剪贴板
- **笔记导入/导出** —— 以 JSON 格式保存和加载批注

## 安装

### 从源码安装（开发者模式）

1. 克隆仓库：

```bash
git clone https://github.com/yang-fengju/html-visual-editor.git
cd html-visual-editor
```

2. 安装依赖：

```bash
npm install
```

3. 构建扩展：

```bash
npm run build
```

4. 在 Chrome 中加载：
   - 打开 `chrome://extensions/`
   - 开启右上角「开发者模式」
   - 点击「加载已解压的扩展程序」
   - 选择 `dist/` 目录

## 使用方法

1. 点击扩展图标或按 **Alt+E** 切换编辑模式
2. **单击** 任意元素选中它（出现蓝色边框）
3. **双击** 文本直接编辑
4. **右键** 打开上下文菜单（复制、删除、移动、添加评论）
5. 使用页面顶部 **工具栏** 进行撤销/重做、插入元素、导出和评论管理

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt+E` | 切换编辑模式 |
| `Ctrl+Z` | 撤销 |
| `Ctrl+Y` / `Ctrl+Shift+Z` | 重做 |
| `Delete` | 删除选中元素 |
| `Escape` | 退出当前编辑状态 |

### 导出选项

- **导出 HTML** —— 将完整页面下载为 HTML 文件
- **带笔记导出** —— HTML 文件中嵌入批注内容
- **复制 HTML** —— 将页面或选中元素的 HTML 复制到剪贴板
- **导出/导入笔记 JSON** —— 单独保存批注数据

## 开发指南

### 环境要求

- Node.js 18+
- npm 9+

### 项目结构

```
src/
├── background/       # Service Worker（扩展生命周期）
├── content/          # Content Script（注入页面）
│   ├── editor/       # 核心编辑模块
│   │   ├── Engine.ts          # 主调度器
│   │   ├── History.ts         # 撤销/重做系统
│   │   ├── SelectionManager.ts
│   │   ├── TextEditor.ts
│   │   ├── StyleEditor.ts
│   │   ├── DragSystem.ts
│   │   ├── ElementManager.ts
│   │   ├── TableEditor.ts
│   │   ├── MediaManager.ts
│   │   ├── FormEditor.ts
│   │   ├── CodeBlock.ts
│   │   ├── NoteManager.ts
│   │   ├── CommentSystem.ts
│   │   └── StickyNote.ts
│   └── ui/           # UI 组件（Shadow DOM 内渲染）
│       ├── ShadowHost.ts
│       ├── Toolbar.ts
│       ├── ContextMenu.ts
│       ├── FloatingBar.ts
│       ├── InsertPanel.ts
│       ├── StylePanel.ts
│       ├── TableToolbar.ts
│       └── NoteEditor.ts
├── popup/            # 扩展弹窗界面
└── shared/           # 共享类型和消息定义
```

### 开发服务器

```bash
npm run dev
```

> 注意：对于 Chrome 扩展，`npm run dev` 启动的是 popup 页面的 Vite 开发服务器。要测试完整扩展功能，请使用 `npm run build` 后在 Chrome 中重新加载。

### 构建

```bash
npm run build
```

构建流程会先进行 TypeScript 类型检查，然后将三个入口（Content Script、Background Worker、Popup）分别构建为独立的 IIFE/HTML 产物，输出到 `dist/` 目录。

### 技术栈

- **TypeScript** —— 严格模式，完整类型安全
- **Vite** —— 构建工具，自定义多入口构建脚本
- **Chrome Extension Manifest V3** —— 现代扩展 API
- **Prism.js** —— 代码语法高亮
- **Shadow DOM** —— UI 与页面样式隔离

## 架构说明

扩展使用 Shadow DOM 将编辑器 UI 与宿主页面隔离。所有编辑器 UI 组件（工具栏、面板、上下文菜单）都在 Shadow Root 内渲染，避免与被编辑页面的样式冲突。

`Engine` 类负责协调所有编辑模块。每个模块处理特定关注点（文本编辑、样式编辑、拖拽等），并通过共享的 `History` 系统实现撤销/重做支持。

## 参与贡献

欢迎贡献代码！请：

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feat/my-feature`）
3. 提交更改
4. 推送到分支
5. 发起 Pull Request

## 许可证

[MIT](LICENSE)
