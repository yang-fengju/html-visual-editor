# 评论显示与样式编辑面板重叠修复设计

## 问题描述

编辑器中评论系统的 UI 元素（内联卡片、面板模式、段落标记条）与样式编辑面板同时显示在屏幕右侧，产生视觉重叠：

| 元素 | 定位 | 尺寸 |
|------|------|------|
| 样式编辑面板 | `position:fixed; right:0; top:48px` | `280px × calc(100vh - 48px)` |
| 评论卡片（内联模式） | `position:fixed; right:16px` | `260px × max 300px` |
| 评论面板模式 | `position:fixed; right:0; top:48px` | `300px × calc(100vh - 48px)` |

三者 z-index 均为 10，同时显示时互相遮挡。

## 方案选择

**采用方案：互斥显示**

打开样式面板时自动暂挂评论的可视元素，关闭后自动恢复。两者不同时出现。

淘汰方案：
- 智能避让（宽屏并排、窄屏互斥）— 内容区压缩过多，评论面板模式仍需互斥，复杂度高收益低
- 样式面板改为浮动弹窗 — 实现复杂（边界碰撞检测），弹窗可能遮挡周围内容

## 核心行为

1. **样式面板打开时** → 如果评论正在显示，暂挂评论的所有可视元素（卡片、面板、段落标记条、加号按钮），但不关闭评论系统本身
2. **样式面板关闭时** → 恢复评论的显示状态，与暂挂前完全一致

**不受影响的部分：**
- 文字高亮标记（`<mark>` 标签）保持可见
- 评论系统的数据和事件监听完全不变
- 选区后的"+ 评论"按钮仍然可用

## 代码变更

### 1. CommentSystem.ts — 新增两个方法

**`suspendDisplay()`：**
- 隐藏所有评论卡片（`cards` Map 中的元素）
- 隐藏面板模式面板（`panel` 元素）
- 隐藏段落标记条（`markers` Map 中的元素）
- 隐藏加号按钮（`plusIcon`）
- 设置 `suspended = true` 标志
- 已经暂挂时直接返回（幂等）

**`resumeDisplay()`：**
- 根据 `panelMode` 状态恢复：面板模式恢复面板，内联模式恢复卡片
- 恢复段落标记条
- 调用 `repositionCards()` 重新定位
- 清除 `suspended` 标志
- 未暂挂时直接返回（幂等）

**守卫逻辑：**
- `handleMouseMove()`：`suspended` 时提前返回，不显示加号按钮
- `repositionCards()`：`suspended` 时提前返回

### 2. StyleEditor.ts — 新增回调机制

- 添加 `onShow(callback)` 和 `onHide(callback)` 方法
- `showForElement()` 中触发 onShow 回调
- `hide()` 中触发 onHide 回调

### 3. Engine.ts — 连接两个系统

在构造函数中添加协调逻辑：
```typescript
this.styleEditor.onShow(() => {
  if (this.commentsActive) this.commentSystem.suspendDisplay();
});
this.styleEditor.onHide(() => {
  if (this.commentsActive) this.commentSystem.resumeDisplay();
});
```

**不需要改动的文件：** StylePanel.ts、Toolbar.ts、NoteManager.ts

## 边界情况

| 场景 | 处理方式 |
|------|---------|
| 评论未激活时点击元素 | `commentsActive` 为 false，不触发暂挂 |
| 连续点击不同元素 | 评论已暂挂，`suspendDisplay()` 幂等返回 |
| 暂挂期间关闭评论 | `deactivate()` 清理所有状态含 `suspended`，之后样式面板关闭时 `commentsActive` 为 false 不触发恢复 |
| Escape 键 | 已有逻辑调用 `styleEditor.hide()`，触发 onHide 回调自动恢复 |
| 面板模式 vs 内联模式恢复 | `suspendDisplay()` 前记录 `panelMode` 状态，按此恢复 |
