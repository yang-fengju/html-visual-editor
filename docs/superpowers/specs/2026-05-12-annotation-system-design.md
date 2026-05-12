# 注释笔记系统 — 设计文档

## 功能定位

在不修改原始 HTML 内容的前提下，为网页添加个人注释、笔记和内容补充。与"编辑模式"并列的独立功能模块。

## 三种注释方式

### 1. 文字批注（Annotation）

- 选中一段文字 → 弹出"添加批注"按钮 → 点击后弹出 Markdown 编辑框
- 原文加黄色半透明高亮底色
- 页面右侧显示批注气泡，通过连线或高亮关联到原文位置
- 点击高亮文字 → 展开批注内容
- 批注气泡可折叠/展开

### 2. 便签贴纸（Sticky Note）

- 工具栏点击"便签"按钮，或右键菜单选择"添加便签"
- 在鼠标位置生成一个可拖拽的便签卡片
- 便签有标题栏（可拖拽移动）和内容区（Markdown 编辑）
- 可调整大小、更换颜色（黄/绿/蓝/粉）
- 可最小化为小图标，点击展开

### 3. 段落侧栏笔记（Side Note）

- 鼠标悬停在段落左侧时，出现"+"图标
- 点击后在段落下方或侧栏展开笔记编辑区
- 支持 Markdown 编辑
- 笔记与对应段落通过 CSS 选择器路径关联
- 段落有笔记时，左侧显示蓝色标记条

## 笔记编辑器

所有笔记类型共用同一个 Markdown 编辑器组件：

- 支持 Markdown 语法：标题、加粗、斜体、链接、列表、代码块、图片引用
- 编辑时显示 Markdown 原文，失焦后渲染为 HTML 预览
- 编辑区域最小高度 3 行，可自动扩展
- 支持 Ctrl+Enter 保存并关闭

## 数据模型

```typescript
interface NoteBase {
  id: string;           // 唯一 ID (nanoid)
  type: 'annotation' | 'sticky' | 'sidenote';
  content: string;      // Markdown 内容
  createdAt: number;
  updatedAt: number;
}

interface Annotation extends NoteBase {
  type: 'annotation';
  selector: string;     // 高亮文字的 CSS 选择器路径
  textContent: string;  // 被选中的原文（用于匹配验证）
  startOffset: number;  // Range 起始偏移
  endOffset: number;    // Range 结束偏移
}

interface StickyNote extends NoteBase {
  type: 'sticky';
  x: number;            // 相对于页面的 X 坐标
  y: number;            // 相对于页面的 Y 坐标
  width: number;
  height: number;
  color: 'yellow' | 'green' | 'blue' | 'pink';
  minimized: boolean;
}

interface SideNote extends NoteBase {
  type: 'sidenote';
  selector: string;     // 关联段落的 CSS 选择器路径
}

type Note = Annotation | StickyNote | SideNote;

interface PageNotes {
  url: string;
  title: string;
  notes: Note[];
  savedAt: number;
}
```

## 存储机制

### 自动保存（IndexedDB）

- 数据库名：`html-visual-editor-notes`
- Object Store：`pages`，key 为页面 URL
- 每次笔记变更后自动保存（防抖 500ms）
- 按 URL 精确匹配加载

### 导出 JSON

导出格式为 `PageNotes` 对象的 JSON 文件，包含页面 URL、标题和所有笔记数据。文件名格式：`{页面标题}-notes.json`。

### 导出 HTML（含笔记）

笔记以特殊标记嵌入导出的 HTML 中：

```html
<!-- 文字批注 -->
<mark data-editor-note-ref="note-id" style="background: rgba(255,213,79,0.4);">被高亮的文字</mark>
<aside data-editor-note="note-id" data-note-type="annotation">
  <!-- 渲染后的 Markdown HTML -->
</aside>

<!-- 便签 -->
<aside data-editor-note="note-id" data-note-type="sticky"
       data-x="100" data-y="200" data-color="yellow">
  <!-- 渲染后的 Markdown HTML -->
</aside>

<!-- 段落侧栏笔记 -->
<aside data-editor-note="note-id" data-note-type="sidenote"
       data-selector="body > div:nth-child(2) > p:nth-child(3)">
  <!-- 渲染后的 Markdown HTML -->
</aside>

<!-- 嵌入的笔记元数据（JSON，用于重新导入） -->
<script type="application/json" data-editor-notes>
  { "url": "...", "notes": [...] }
</script>
```

### 导入识别

打开含有 `data-editor-notes` 标记的 HTML 时：
1. 扩展检测到 `<script type="application/json" data-editor-notes>`
2. 解析 JSON 数据
3. 与本地存储按 note ID 去重合并
4. 本地已有的同 ID 笔记以本地版本为准（更新时间更晚的优先）

## 优先级规则

当本地存储和 HTML 嵌入的笔记同时存在时：
- 按笔记 ID 匹配
- 同 ID 笔记以 `updatedAt` 更大的为准
- 本地不存在的嵌入笔记自动导入
- 合并后自动保存到本地存储

## UI 变更

### 工具栏

新增两个按钮：
- **"笔记"按钮** — 切换笔记模式（显示/隐藏所有笔记，激活侧栏"+"图标）
- **"便签"按钮** — 直接在页面中心创建一个新便签

### 导出按钮

改为下拉菜单：
- 导出 HTML（不含笔记）
- 导出 HTML（含笔记）
- 导出笔记（JSON）
- 导入笔记（JSON）

### 右键菜单

新增：
- "添加批注"（选中文字时可用）
- "添加便签"
- "添加段落笔记"（点击段落时可用）

## 新增文件

```
src/content/editor/NoteManager.ts    — 笔记 CRUD、IndexedDB 存储、导入导出、去重合并
src/content/editor/Annotator.ts      — 文字批注：高亮渲染、气泡显示、选区序列化
src/content/editor/StickyNote.ts     — 便签贴纸：创建、拖拽、缩放、颜色、最小化
src/content/editor/SideNote.ts       — 段落侧栏笔记：段落检测、"+"图标、笔记区展开
src/content/ui/NoteEditor.ts         — Markdown 编辑器组件：编辑/预览切换、快捷键
```

### 修改文件

```
src/content/editor/Engine.ts         — 集成笔记系统，管理笔记模式生命周期
src/content/ui/Toolbar.ts            — 新增笔记/便签按钮，导出改为下拉菜单
src/content/ui/ContextMenu.ts        — 新增批注/便签/段落笔记菜单项
src/content/index.ts                 — 导出 HTML 时处理笔记嵌入，导入时检测笔记标记
src/shared/types.ts                  — 新增 Note 相关类型
src/shared/messages.ts               — 新增笔记导出/导入消息类型
```

## 模式关系

笔记模式和编辑模式可以共存：
- 编辑模式关闭时，笔记仍然可见（只读展示）
- 编辑模式开启时，可以同时编辑页面内容和添加笔记
- 笔记按钮是独立的开关，不依赖编辑模式
