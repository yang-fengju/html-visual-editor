export class ShadowHost {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private container: HTMLDivElement;

  constructor() {
    this.host = document.createElement('html-visual-editor');
    this.host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 100%; z-index: 2147483647; pointer-events: none;';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = this.getBaseStyles();
    this.shadow.appendChild(style);

    this.container = document.createElement('div');
    this.container.className = 'editor-root';
    this.shadow.appendChild(this.container);
  }

  mount() { document.documentElement.appendChild(this.host); }
  unmount() { this.host.remove(); }
  getContainer(): HTMLDivElement { return this.container; }
  getShadowRoot(): ShadowRoot { return this.shadow; }

  showDataConsent(onAccept: () => void, onCancel: () => void): void { // 在读取网页内容前展示一次性数据处理授权界面。
    if (this.container.querySelector('.data-consent-overlay')) return; // 已显示授权界面时不重复创建，避免出现叠加弹窗。
    const overlay = document.createElement('div'); // 创建覆盖当前视口的半透明背景层，聚焦用户注意力。
    overlay.className = 'data-consent-overlay'; // 设置稳定类名，供样式定义和重复检测共同使用。
    overlay.setAttribute('role', 'dialog'); // 声明该区域为对话框，帮助辅助技术理解界面结构。
    overlay.setAttribute('aria-modal', 'true'); // 表明用户需要先处理当前对话框才能继续编辑网页。
    overlay.setAttribute('aria-labelledby', 'data-consent-title'); // 将对话框与可读标题关联，提升无障碍体验。
    const dialog = document.createElement('div'); // 创建承载说明和操作按钮的对话框主体。
    dialog.className = 'data-consent-dialog'; // 使用独立类名控制稳定宽度、间距和视觉层级。
    const eyebrow = document.createElement('div'); // 创建简短的隐私类别标签，帮助用户快速识别提示性质。
    eyebrow.className = 'data-consent-eyebrow'; // 应用低强调度的标签样式，避免抢夺正文注意力。
    eyebrow.textContent = '本地数据处理'; // 明确说明数据处理范围仅限用户当前设备。
    const title = document.createElement('h2'); // 创建授权对话框的主要标题。
    title.id = 'data-consent-title'; // 提供给 aria-labelledby 使用的唯一标题标识。
    title.textContent = '开启当前网页的可视化编辑'; // 直接描述用户即将授权的具体操作对象。
    const description = document.createElement('p'); // 创建一段完整且易理解的数据处理说明。
    description.className = 'data-consent-description'; // 应用适合连续阅读的字号和行高。
    description.textContent = '编辑器会读取和修改当前网页内容，并在本机保存页面地址、标题和你创建的批注。'; // 披露实际处理的数据类型和用途。
    const assurance = document.createElement('p'); // 创建独立的数据使用限制说明，避免关键信息埋在长段落中。
    assurance.className = 'data-consent-assurance'; // 使用带边线的提示样式突出“不上传、不共享”的承诺。
    assurance.textContent = '这些数据不会上传、共享、出售或用于广告。'; // 明确披露数据不会离开设备或用于其他目的。
    const actions = document.createElement('div'); // 创建用于排列取消和同意按钮的操作区域。
    actions.className = 'data-consent-actions'; // 应用右对齐布局并保持按钮间距稳定。
    const cancelButton = document.createElement('button'); // 创建允许用户拒绝授权的次要按钮。
    cancelButton.type = 'button'; // 防止按钮在特殊网页结构中意外触发表单提交。
    cancelButton.className = 'data-consent-button data-consent-button-secondary'; // 使用低强调样式表达可安全退出。
    cancelButton.textContent = '暂不开启'; // 用结果导向文案说明取消不会修改网页。
    const acceptButton = document.createElement('button'); // 创建明确同意并继续的主要操作按钮。
    acceptButton.type = 'button'; // 防止按钮继承宿主网页表单的默认提交行为。
    acceptButton.className = 'data-consent-button data-consent-button-primary'; // 使用主色突出用户授权后的继续操作。
    acceptButton.textContent = '同意并开启'; // 同时表达授权和开启编辑器两个直接结果。
    actions.append(cancelButton, acceptButton); // 按次要操作在前、主要操作在后的顺序加入按钮。
    dialog.append(eyebrow, title, description, assurance, actions); // 按阅读顺序组装授权对话框内容。
    overlay.appendChild(dialog); // 将对话框放入覆盖层中央显示。
    const closeDialog = (): void => { // 统一清理浮层和键盘监听器，避免残留事件。
      document.removeEventListener('keydown', handleKeydown, true); // 移除捕获阶段监听器，恢复网页原有键盘行为。
      overlay.remove(); // 从隔离容器中移除授权界面。
    }; // 完成通用清理函数定义。
    const handleKeydown = (event: KeyboardEvent): void => { // 支持用户通过 Escape 键拒绝并关闭授权界面。
      if (event.key !== 'Escape') return; // 非 Escape 按键不拦截，保持正常键盘导航。
      event.preventDefault(); // 阻止网页同时响应 Escape，确保一次操作只有一个结果。
      event.stopPropagation(); // 防止按键继续传播到宿主网页或其他编辑器组件。
      closeDialog(); // 先清理授权界面及事件监听器。
      onCancel(); // 再通知调用方保持浏览模式并释放临时容器。
    }; // 完成键盘关闭逻辑定义。
    cancelButton.addEventListener('click', () => { // 处理用户主动点击暂不开启按钮的行为。
      closeDialog(); // 点击取消后立即移除授权界面。
      onCancel(); // 通知调用方不要初始化编辑器。
    }); // 完成取消按钮事件绑定。
    acceptButton.addEventListener('click', () => { // 处理用户明确同意数据处理的行为。
      closeDialog(); // 同意后先移除授权界面，为编辑器工具栏腾出空间。
      onAccept(); // 通知调用方保存授权并启动编辑器。
    }); // 完成同意按钮事件绑定。
    document.addEventListener('keydown', handleKeydown, true); // 在捕获阶段监听 Escape，确保关闭操作可靠。
    this.container.appendChild(overlay); // 所有内容和事件就绪后再一次性显示授权界面。
    acceptButton.focus(); // 默认聚焦主要按钮，方便键盘用户直接确认或切换选择。
  } // 完成数据处理授权界面创建。

  private getBaseStyles(): string {
    return `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px; color: #333;
      }
      .editor-root { position: relative; width: 100%; pointer-events: none; }
      .editor-root > * { pointer-events: auto; }
      .first-time-hint {
        position: fixed; top: 52px; left: 50%; transform: translateX(-50%);
        background: #1a73e8; color: white; padding: 8px 16px; border-radius: 8px;
        font-size: 13px; display: flex; align-items: center; gap: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10; white-space: nowrap;
      }
      .first-time-hint button {
        background: none; border: none; color: white; cursor: pointer;
        font-size: 16px; padding: 0 2px; opacity: 0.8;
      }
      .first-time-hint button:hover { opacity: 1; }
      .data-consent-overlay { /* 使用覆盖层隔离授权操作，避免宿主网页元素遮挡。 */
        position: fixed; inset: 0; display: grid; place-items: center; /* 固定覆盖整个可视区域并稳定居中对话框。 */
        padding: 24px; background: rgba(17, 24, 39, 0.58); pointer-events: auto; /* 提供足够点击区域并阻止误操作网页。 */
        z-index: 20; box-sizing: border-box; /* 保证覆盖层位于编辑器内部最高层且尺寸计算可预测。 */
      }
      .data-consent-dialog { /* 使用克制的工具型面板承载必要隐私信息。 */
        width: min(420px, 100%); padding: 24px; box-sizing: border-box; /* 在桌面与窄屏上保持稳定且不溢出的宽度。 */
        background: #ffffff; color: #1f2937; border: 1px solid #d1d5db; border-radius: 8px; /* 使用高对比中性色确保内容清晰。 */
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; /* 提升层级并沿用插件字体体系。 */
      }
      .data-consent-eyebrow { /* 用小标签快速表明这是本地数据处理说明。 */
        margin-bottom: 8px; color: #2563eb; font-size: 12px; font-weight: 700; /* 以主色和字重建立清晰但不过度的强调。 */
      }
      .data-consent-dialog h2 { /* 控制紧凑面板内标题层级，避免使用过大字号。 */
        margin: 0 0 12px; color: #111827; font-size: 20px; line-height: 1.35; font-weight: 700; /* 保持标题易扫读并为正文留出空间。 */
      }
      .data-consent-description { /* 展示数据类型和用途的主要说明。 */
        margin: 0; color: #4b5563; font-size: 14px; line-height: 1.7; /* 使用舒适行高保证长句可读。 */
      }
      .data-consent-assurance { /* 突出不上传和不共享的关键限制。 */
        margin: 16px 0 0; padding: 10px 12px; color: #166534; font-size: 13px; line-height: 1.6; /* 用紧凑提示块增强信息辨识度。 */
        background: #f0fdf4; border-left: 3px solid #22c55e; /* 使用绿色边线表达本地处理和安全承诺。 */
      }
      .data-consent-actions { /* 稳定排列拒绝和同意两个明确选择。 */
        display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; /* 将主要操作放在阅读动线末端。 */
      }
      .data-consent-button { /* 为两个命令按钮提供一致的尺寸和键盘交互基础。 */
        min-height: 38px; padding: 0 14px; border-radius: 6px; font-size: 13px; font-weight: 600; /* 确保按钮文字完整并提供足够点击区域。 */
        letter-spacing: 0; cursor: pointer; transition: background-color 160ms ease, border-color 160ms ease; /* 保持文字自然并提供克制反馈。 */
      }
      .data-consent-button:focus-visible { /* 为键盘用户清晰标记当前聚焦按钮。 */
        outline: 3px solid rgba(37, 99, 235, 0.28); outline-offset: 2px; /* 使用高可见轮廓且不改变按钮尺寸。 */
      }
      .data-consent-button-secondary { /* 将取消操作设计为低强调的中性按钮。 */
        border: 1px solid #d1d5db; background: #ffffff; color: #374151; /* 与主按钮形成明确但不过分的层级差。 */
      }
      .data-consent-button-secondary:hover { background: #f3f4f6; border-color: #9ca3af; } /* 悬停时只做轻微中性色变化。 */
      .data-consent-button-primary { /* 将同意并开启设为清晰的主要命令。 */
        border: 1px solid #1d4ed8; background: #2563eb; color: #ffffff; /* 使用高对比主色保证动作易识别。 */
      }
      .data-consent-button-primary:hover { background: #1d4ed8; border-color: #1e40af; } /* 悬停时加深颜色提供可靠反馈。 */
      @media (max-width: 480px) { /* 在窄屏页面上改为纵向按钮，防止文字挤压。 */
        .data-consent-overlay { padding: 16px; } /* 缩小外边距但保留安全留白。 */
        .data-consent-dialog { padding: 20px; } /* 适当降低内边距以扩大正文可用宽度。 */
        .data-consent-actions { flex-direction: column-reverse; } /* 保持主要操作优先且每个按钮占据独立一行。 */
        .data-consent-button { width: 100%; } /* 使用完整宽度避免按钮文字溢出。 */
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
