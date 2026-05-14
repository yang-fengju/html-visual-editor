# 评论与样式面板重叠修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 样式编辑面板打开时自动暂挂评论可视元素，关闭后自动恢复，消除右侧 UI 重叠。

**Architecture:** 在 CommentSystem 中新增 suspend/resume 机制控制可视元素的显示/隐藏；在 StyleEditor 中新增 onShow/onHide 回调；在 Engine 中将两者连接。三个文件各改一处，职责清晰。

**Tech Stack:** TypeScript, Chrome Extension (Shadow DOM)

**Spec:** `docs/superpowers/specs/2026-05-14-comment-style-panel-overlap-design.md`

**验证方式:** 无测试框架，使用 `npx tsc --noEmit` 类型检查 + `node build.mjs` 构建验证

---

### Task 1: CommentSystem 新增 suspendDisplay / resumeDisplay

**Files:**
- Modify: `src/content/editor/CommentSystem.ts:28-41` (新增属性)
- Modify: `src/content/editor/CommentSystem.ts:160` (handleMouseMove 守卫)
- Modify: `src/content/editor/CommentSystem.ts:459` (repositionCards 守卫)
- Modify: `src/content/editor/CommentSystem.ts:72-82` (deactivate 重置 suspended)

- [ ] **Step 1: 新增 `suspended` 属性**

在 `CommentSystem` 类的属性声明区域（第 40 行 `private scrollThrottleId` 之后）添加：

```typescript
private suspended = false;
```

- [ ] **Step 2: 新增 `suspendDisplay()` 方法**

在 `isPanelMode()` 方法（第 104 行）之后添加：

```typescript
suspendDisplay() {
  if (this.suspended) return;
  this.suspended = true;
  this.cards.forEach(card => card.style.display = 'none');
  if (this.panel) this.panel.style.display = 'none';
  this.markers.forEach(marker => marker.style.display = 'none');
  this.hidePlusIcon();
}
```

- [ ] **Step 3: 新增 `resumeDisplay()` 方法**

紧接 `suspendDisplay()` 之后添加：

```typescript
resumeDisplay() {
  if (!this.suspended) return;
  this.suspended = false;
  this.markers.forEach(marker => marker.style.display = '');
  if (this.panelMode) {
    if (this.panel) this.panel.style.display = 'block';
  } else {
    this.cards.forEach(card => card.style.display = 'block');
    this.repositionCards();
  }
}
```

- [ ] **Step 4: handleMouseMove 添加 suspended 守卫**

在 `handleMouseMove` 方法的第一行 `if (!this.active) return;`（第 161 行）之后添加一行：

```typescript
if (this.suspended) return;
```

- [ ] **Step 5: repositionCards 添加 suspended 守卫**

修改 `repositionCards` 方法的第一行（第 460 行），从：

```typescript
if (this.panelMode) return;
```

改为：

```typescript
if (this.panelMode || this.suspended) return;
```

- [ ] **Step 6: deactivate 中重置 suspended**

在 `deactivate()` 方法的 `this.active = false;`（第 73 行）之后添加一行：

```typescript
this.suspended = false;
```

- [ ] **Step 7: 类型检查验证**

Run: `npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 8: 提交**

```bash
git add src/content/editor/CommentSystem.ts
git commit -m "feat: CommentSystem 新增 suspendDisplay/resumeDisplay 暂挂机制"
```

---

### Task 2: StyleEditor 新增 onShow / onHide 回调

**Files:**
- Modify: `src/content/editor/StyleEditor.ts:4-8` (新增回调属性)
- Modify: `src/content/editor/StyleEditor.ts:22-23` (showForElement/hide 触发回调)

- [ ] **Step 1: 新增回调属性和注册方法**

在 `StyleEditor` 类中，`private stylePanel: StylePanel;`（第 5 行）之后添加：

```typescript
private showCallbacks: Array<() => void> = [];
private hideCallbacks: Array<() => void> = [];
```

在 `destroy()` 方法（第 25 行）之后添加两个方法：

```typescript
onShow(callback: () => void) { this.showCallbacks.push(callback); }
onHide(callback: () => void) { this.hideCallbacks.push(callback); }
```

- [ ] **Step 2: showForElement 中触发 onShow 回调**

将第 22 行：

```typescript
showForElement(element: HTMLElement) { this.stylePanel.show(element); }
```

改为：

```typescript
showForElement(element: HTMLElement) {
  this.showCallbacks.forEach(cb => cb());
  this.stylePanel.show(element);
}
```

- [ ] **Step 3: hide 中触发 onHide 回调**

将第 23 行：

```typescript
hide() { this.stylePanel.hide(); }
```

改为：

```typescript
hide() {
  this.stylePanel.hide();
  this.hideCallbacks.forEach(cb => cb());
}
```

- [ ] **Step 4: 类型检查验证**

Run: `npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 5: 提交**

```bash
git add src/content/editor/StyleEditor.ts
git commit -m "feat: StyleEditor 新增 onShow/onHide 回调机制"
```

---

### Task 3: Engine 连接两个系统

**Files:**
- Modify: `src/content/editor/Engine.ts:70-74` (构造函数中添加协调逻辑)

- [ ] **Step 1: 添加协调逻辑**

在 Engine 构造函数中，`this.setupSelectionActions();`（第 74 行）之后添加：

```typescript
this.styleEditor.onShow(() => {
  if (this.commentsActive) this.commentSystem.suspendDisplay();
});
this.styleEditor.onHide(() => {
  if (this.commentsActive) this.commentSystem.resumeDisplay();
});
```

- [ ] **Step 2: 类型检查验证**

Run: `npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 构建验证**

Run: `node build.mjs`
Expected: 构建成功，无错误

- [ ] **Step 4: 提交**

```bash
git add src/content/editor/Engine.ts
git commit -m "feat: Engine 连接评论暂挂与样式面板开关"
```

---

### Task 4: 手动验证

- [ ] **Step 1: 加载扩展并打开测试页面**

在 Chrome 中加载 `dist/` 目录作为未打包扩展，打开任意有文字内容的网页，激活编辑模式。

- [ ] **Step 2: 验证场景 — 内联卡片模式**

1. 点击工具栏「评论」按钮激活评论
2. 选中一段文字，点击「+ 评论」添加文字评论
3. 鼠标移到段落左侧，点击「+」添加段落评论
4. 确认右侧出现评论卡片
5. 单击页面中的某个元素 → **预期：样式面板滑出，评论卡片和段落标记条消失**
6. 按 Escape 关闭样式面板 → **预期：评论卡片和段落标记条恢复显示**

- [ ] **Step 3: 验证场景 — 面板模式**

1. 点击工具栏「面板」按钮切换到评论面板模式
2. 确认右侧出现全高的评论面板
3. 单击页面中的某个元素 → **预期：样式面板滑出，评论面板消失**
4. 按 Escape → **预期：评论面板恢复**

- [ ] **Step 4: 验证边界情况**

1. 不激活评论，直接点击元素 → **预期：样式面板正常打开，无报错**
2. 样式面板打开时，连续点击不同元素 → **预期：样式面板切换目标，评论保持隐藏，无闪烁**
3. 样式面板打开时点击「评论」按钮关闭评论，再按 Escape → **预期：无报错**
4. 高亮标记（黄色背景文字）在样式面板打开期间 → **预期：始终可见**
