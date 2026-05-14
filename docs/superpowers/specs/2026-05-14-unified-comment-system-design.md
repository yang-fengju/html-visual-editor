# 统一评论系统设计文档

## 概述

将现有的三种笔记类型（文字批注 annotation、段落笔记 sidenote、便签 sticky）重构为两种：**统一评论**（comment）和**便签**（sticky）。评论系统参考飞书云文档的交互模式，支持文字级和段落级评论，支持同一标注点的多条笔记迭代，提供内联卡片和抽屉面板两种展示模式。

## 当前问题

1. **批注无反应 bug**：右键菜单"添加批注"不生效——Annotator 在非激活状态下不缓存选区（`cachedRange`），导致激活后调用 `addAnnotationFromSelection()` 时 range 为空
2. **段落笔记排版不友好**：固定定位的面板和图标不跟随滚动，布局生硬
3. **功能重合**：文字批注和段落笔记交互模式相似，体验割裂

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 评论系统架构 | 统一评论（合并 annotation + sidenote） | 减少功能重合，统一交互 |
| 展示模式 | 默认内联卡片，≥5 条可切换抽屉面板 | 兼顾上下文直观性和大量评论的管理 |
| 评论结构 | 单标注点多条 entry（时间线迭代） | 支持个人思考迭代记录 |
| 便签 | 保留独立模块 | 自由定位的便签与评论系统不冲突 |
| 状态管理 | 无"已解决"状态，直接删除清理 | 个人工具场景，简化交互 |
| 保存方式 | 自动防抖保存（500ms） | 减少手动操作 |

## 数据模型

```typescript
// 统一评论（替代 annotation + sidenote）
interface CommentNote {
  id: string;
  type: 'comment';
  anchor: 'text' | 'paragraph';
  selector: string;
  textContent?: string;          // anchor='text' 时记录被选中的原文
  startOffset?: number;          // anchor='text' 时记录偏移
  endOffset?: number;
  entries: CommentEntry[];
  createdAt: number;
  updatedAt: number;
}

interface CommentEntry {
  id: string;                    // 生成规则：Date.now() + 随机串，与 Note id 一致
  content: string;               // Markdown 内容
  createdAt: number;
}

// 便签保留不变
interface StickyNoteData {
  id: string;
  type: 'sticky';
  x: number;
  y: number;
  width: number;
  height: number;
  color: 'yellow' | 'green' | 'blue' | 'pink';
  minimized: boolean;
  content: string;
  createdAt: number;
  updatedAt: number;
}

// 笔记联合类型
type Note = CommentNote | StickyNoteData;

// 每页笔记集合
interface PageNotes {
  url: string;
  title: string;
  notes: Note[];
  savedAt: number;
}
```

## 模块架构

### 文件变更

| 操作 | 文件 | 说明 |
|------|------|------|
| 删除 | `Annotator.ts` | 功能合并到 CommentSystem |
| 删除 | `SideNote.ts` | 功能合并到 CommentSystem |
| 新建 | `CommentSystem.ts` | 统一评论系统 |
| 修改 | `types.ts` | 新数据模型 |
| 修改 | `NoteManager.ts` | 适配新数据模型 + 数据迁移 |
| 修改 | `NoteEditor.ts` | 支持自动保存 |
| 修改 | `Engine.ts` | 移除旧模块引用，接入 CommentSystem |
| 修改 | `Toolbar.ts` | "笔记"按钮改为"评论"按钮，导出菜单适配新类型 |
| 修改 | `ContextMenu.ts` | "添加批注"+"添加段落笔记"合并为"添加评论" |
| 修改 | `content/index.ts` | 导出逻辑适配 |
| 保留 | `StickyNote.ts` | 便签不变 |

### CommentSystem.ts 内部职责

1. **选区检测**：监听 `selectionchange`，显示"评论"按钮
2. **段落悬停检测**：`mousemove` 检测块级元素，显示"+"图标
3. **高亮渲染**：文字评论用 `<mark>` 黄色高亮，段落评论用蓝色标记条
4. **评论卡片管理**：创建、定位、避让算法
5. **面板模式**：评论 ≥5 条时可切换右侧抽屉面板
6. **双向联动**：点击高亮 ↔ 聚焦卡片/面板条目

## 交互流程

### 创建评论

- **选中文字** → 出现蓝色"评论"按钮（选区下方居中） → 点击后创建 `anchor:'text'` 评论，右侧出现卡片，输入框自动聚焦
- **悬停段落** → 左侧出现"+"图标（段落垂直中心） → 点击后创建 `anchor:'paragraph'` 评论
- **右键菜单"添加评论"** → 实时从 `document.getSelection()` 获取选区（不依赖缓存），有选区则文字评论，否则段落评论

### 评论卡片

- 黄色左边框 = 文字评论（`anchor:'text'`），蓝色左边框 = 段落评论（`anchor:'paragraph'`）
- 头部：类型标签 + 引用原文（文字评论截取前 30 字符） + "+"追加按钮 + "×"删除按钮
- 每条 entry：时间戳 + Markdown 渲染内容，点击可编辑
- 卡片与锚定文字/段落垂直对齐，监听 `scroll` 事件更新卡片位置（throttle 16ms）
- 多卡片自动避让：按文档顺序从上到下排列，如果当前卡片 top 与上一张重叠，则下移至上一张 bottom + 8px

### 模式切换

- 评论总数 ≥5 时，工具栏评论按钮旁出现面板切换图标
- 切换为面板模式时隐藏所有内联卡片，切回时恢复
- **抽屉面板**：右侧固定 300px 宽，所有评论按文档顺序排列
- 面板中点击条目 → 文档平滑滚动到对应位置，高亮短暂闪烁（0.5s）
- 文档中点击高亮 → 面板滚动到对应评论
- 可随时切回内联模式

### 保存与快捷键

- 输入时自动防抖保存（500ms 无输入后保存）
- 失焦时触发保存
- `Ctrl+Enter`：完成编辑并折叠卡片
- `Esc`：关闭/折叠当前卡片

## 样式设计

### 评论卡片

```css
.comment-card {
  position: fixed;
  right: 16px;
  width: 260px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  max-height: 300px;
  overflow-y: auto;
  z-index: 10;
}
.comment-card[data-anchor="text"] { border-left: 3px solid #ffd54f; }
.comment-card[data-anchor="paragraph"] { border-left: 3px solid #4285f4; }
```

### 高亮标记

```css
mark[data-comment-ref] {
  background: rgba(255,213,79,0.4);
  padding: 1px 0;
  border-radius: 2px;
  cursor: pointer;
}
.paragraph-marker {
  position: fixed;
  width: 3px;
  background: #4285f4;
  border-radius: 2px;
}
```

### 抽屉面板

```css
.comment-panel {
  position: fixed;
  right: 0;
  top: 48px;         /* 工具栏高度 */
  width: 300px;
  height: calc(100vh - 48px);
  background: #fafafa;
  border-left: 1px solid #e8e8e8;
  overflow-y: auto;
  z-index: 10;
}
```

## 数据迁移

加载 IndexedDB 数据时自动检测旧格式并转换：

- `annotation` → `comment` + `anchor:'text'`，`content` 包装为 `entries[0]`
- `sidenote` → `comment` + `anchor:'paragraph'`，同理
- `sticky` 不变
- 转换后自动写回 IndexedDB，一次性迁移
- 导入旧格式 JSON 时自动识别并转换

## 导出兼容

- **JSON 导出**：使用新格式
- **HTML 嵌入导出**：评论渲染为 entry 列表，每条显示时间戳和内容
- **导入旧格式 JSON**：自动检测并转换
