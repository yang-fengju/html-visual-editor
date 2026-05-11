# HTML Visual Editor — 设计文档

## 产品定位

一个 Chrome 浏览器扩展，让用户像使用 Word 一样直接在网页上所见即所得地编辑 HTML，修改后可保存/导出。

### 目标用户

所有人 — 开发者和非技术人员都能使用。

### 产品路线

1. **第一阶段**：Chrome 浏览器扩展（本文档范围）
2. **第二阶段**：桌面应用（Electron/Tauri）
3. **第三阶段**：在线工具

三个形态共享同一套核心编辑引擎，区别仅在外壳。

## 核心概念

### 双模式切换

- **浏览模式**（默认）— 正常浏览网页，扩展不干预
- **编辑模式** — 点击扩展图标或快捷键激活，页面进入可编辑状态，出现工具栏

### 设计原则

- **编辑即所见** — 所有修改直接反映在页面上，没有代码视图、没有分栏
- **非侵入式** — 编辑器 UI 通过 Shadow DOM 注入，不影响页面原有样式和功能
- **可撤销** — 所有操作都可以撤销/重做

## 功能模块

### 1. 文本编辑模块

- 点击任意文本元素直接编辑内容
- 工具栏提供：加粗、斜体、下划线、删除线、字体、字号、颜色、对齐方式
- 支持撤销/重做（Ctrl+Z / Ctrl+Y）
- 选中文字后弹出浮动工具栏（类似 Medium 的编辑体验）

### 2. 样式编辑模块

- 选中元素后，右侧弹出样式面板
- 可视化修改：背景色、边框、圆角、阴影、透明度、内外边距
- 颜色选择器（拾色器 + 输入色值）
- 修改结果实时预览，作用于元素的 `style` 属性

### 3. 布局拖拽模块

- 鼠标悬停时高亮元素边界（蓝色虚线框）
- 选中元素后可拖拽移动位置
- 边缘拖拽手柄调整元素大小
- 辅助线对齐（拖拽时自动吸附）

### 4. 元素管理模块

- 右键菜单：复制、删除、上移/下移元素
- 插入面板：可插入段落、标题、图片、链接、按钮、分割线、列表等常用元素
- 图片元素点击后支持替换图片（从本地上传或输入 URL）

### 5. 保存与导出模块

- **导出 HTML 文件** — 将当前页面导出为完整的 `.html` 文件
- **复制 HTML 代码** — 一键复制整页或选中元素的 HTML 到剪贴板
- **下载修改后的资源** — 如果替换了图片，一并打包下载
- 对于本地 HTML 文件（`file://` 协议），支持通过 Native Messaging 直接覆盖保存原文件

### 6. 表格编辑模块

- 插入表格时可选择行列数
- 点击单元格直接编辑内容
- 选中表格后出现表格工具栏：
  - 增加/删除行、增加/删除列
  - 合并单元格、拆分单元格
  - 调整列宽（拖拽列边线）
  - 单元格背景色、边框样式
- 整表拖拽移动和调整大小

### 7. 多媒体模块

- 插入视频（本地文件 / URL / iframe 嵌入码）
- 插入音频
- 调整播放器大小和位置
- 替换/删除多媒体元素

### 8. 表单编辑模块

- 插入常用表单元素：文本输入框、文本域、下拉选择、单选/多选、按钮
- 可视化编辑表单属性：placeholder、默认值、选项列表
- 调整表单布局

### 9. 代码块模块

- 插入代码块，选择编程语言
- 语法高亮显示
- 编辑代码内容时提供等宽字体编辑区
- 支持主题切换（亮色/暗色）

## 技术架构

### 整体分层

```
Chrome Extension (Manifest V3)
├── Popup UI — 开关编辑模式、全局设置
├── Background Service Worker — 生命周期管理、消息中转、文件导出
├── Content Script — 注入目标页面，核心运行环境
│   ├── Shadow DOM 容器 — 承载编辑器 UI，与页面样式隔离
│   │   ├── 顶部工具栏
│   │   ├── 浮动文本工具栏
│   │   ├── 右侧样式面板
│   │   ├── 插入面板
│   │   └── 右键菜单
│   └── 编辑引擎 — 操作目标页面真实 DOM
│       ├── 文本编辑器（基于 contentEditable）
│       ├── 拖拽系统（Pointer Events）
│       ├── 样式管理器
│       ├── 元素管理器
│       ├── 表格引擎
│       ├── 多媒体管理器
│       ├── 表单管理器
│       ├── 代码块管理器（Prism.js）
│       └── 历史记录管理（撤销/重做栈）
└── Native Messaging Host（可选）— Node.js 小程序，本地文件读写
```

### 各层职责

| 层 | 技术 | 职责 |
|---|---|---|
| Popup UI | HTML + CSS | 扩展图标点击后的小面板，负责开关编辑模式、全局设置 |
| Background Service Worker | TypeScript | 管理扩展生命周期、消息中转、文件导出下载 |
| Content Script | TypeScript | 注入目标页面，是整个编辑器的核心运行环境 |
| Shadow DOM 容器 | Web Components | 承载所有编辑器 UI，与目标页面样式完全隔离 |
| 编辑引擎 | TypeScript | 核心编辑逻辑，操作目标页面的真实 DOM |
| Native Messaging Host | Node.js | 可选模块，用于 `file://` 协议下直接保存本地文件 |

### 技术选型

| 选择 | 方案 | 理由 |
|---|---|---|
| 语言 | TypeScript | 类型安全，大型项目可维护性强 |
| 扩展规范 | Manifest V3 | Chrome 最新标准，未来兼容 |
| UI 框架 | 无框架，原生 Web Components | 注入页面需要极致轻量，避免与页面框架冲突 |
| 构建工具 | Vite + CRXJS | 成熟的 Chrome 扩展开发工具链，支持 HMR |
| 状态管理 | 自研轻量 Store | 管理编辑状态、历史记录（撤销栈） |
| 拖拽实现 | 原生 Drag API + Pointer Events | 精确控制拖拽行为，不依赖第三方库 |
| 代码高亮 | Prism.js | 体积小，语言覆盖全，适合注入场景 |

### 核心数据流

```
用户操作（点击/拖拽/输入）
    │
    ▼
编辑引擎捕获事件
    │
    ├── 记录操作到历史栈（支持撤销）
    │
    ├── 修改目标页面 DOM / Style
    │
    └── 更新编辑器 UI 状态（工具栏高亮等）
```

### 消息通信

```
Popup ←→ Background Service Worker ←→ Content Script
                    │
                    ▼
          Native Messaging Host（可选）
```

- Popup → Background：发送开关编辑模式指令
- Background → Content Script：转发指令，管理 Content Script 注入
- Content Script → Background：请求文件导出/下载
- Background → Native Messaging Host：请求读写本地文件

## 用户交互流程

### 进入编辑模式

1. 用户在任意网页上点击扩展图标（或按快捷键）
2. Popup 显示"开启编辑模式"开关
3. 点击后，Content Script 注入页面
4. Shadow DOM 容器创建，工具栏出现在页面顶部
5. 页面进入可编辑状态

### 编辑操作

1. 鼠标悬停 → 高亮元素边界
2. 单击文本 → 进入文本编辑（contentEditable）
3. 单击非文本元素 → 选中元素，显示拖拽手柄 + 右侧样式面板
4. 选中文字 → 弹出浮动文本工具栏
5. 右键 → 显示编辑器右键菜单（复制/删除/插入等）

### 保存退出

1. 点击工具栏"导出"按钮 → 选择保存方式
2. 点击扩展图标 → 关闭编辑模式
3. 工具栏和所有编辑 UI 消失，页面恢复正常浏览状态

## 项目结构

```
html-visual-editor/
├── src/
│   ├── background/          # Background Service Worker
│   │   └── index.ts
│   ├── popup/               # Popup UI
│   │   ├── index.html
│   │   ├── popup.ts
│   │   └── popup.css
│   ├── content/             # Content Script + 编辑引擎
│   │   ├── index.ts         # 入口，注入逻辑
│   │   ├── editor/          # 编辑引擎核心
│   │   │   ├── Engine.ts        # 引擎主类，协调各模块
│   │   │   ├── TextEditor.ts    # 文本编辑
│   │   │   ├── StyleEditor.ts   # 样式编辑
│   │   │   ├── DragSystem.ts    # 拖拽布局
│   │   │   ├── ElementManager.ts# 元素增删管理
│   │   │   ├── TableEditor.ts   # 表格编辑
│   │   │   ├── MediaManager.ts  # 多媒体管理
│   │   │   ├── FormEditor.ts    # 表单编辑
│   │   │   ├── CodeBlock.ts     # 代码块
│   │   │   └── History.ts       # 撤销/重做
│   │   └── ui/              # 编辑器 UI 组件（Shadow DOM 内）
│   │       ├── Toolbar.ts       # 顶部工具栏
│   │       ├── FloatingBar.ts   # 浮动文本工具栏
│   │       ├── StylePanel.ts    # 右侧样式面板
│   │       ├── InsertPanel.ts   # 插入元素面板
│   │       ├── TableToolbar.ts  # 表格工具栏
│   │       ├── ContextMenu.ts   # 右键菜单
│   │       └── ShadowHost.ts    # Shadow DOM 容器管理
│   ├── shared/              # 共享类型和工具
│   │   ├── types.ts
│   │   └── messages.ts      # 消息协议定义
│   └── native-host/         # Native Messaging Host（可选）
│       └── index.js
├── public/
│   ├── icons/               # 扩展图标
│   └── manifest.json        # Chrome 扩展清单
├── docs/
│   └── superpowers/
│       └── specs/           # 设计文档
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```
