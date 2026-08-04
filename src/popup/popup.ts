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

sendToBackground({ type: 'GET_EDIT_MODE' }).then((response) => {
  if (response.type === 'EDIT_MODE_STATUS') {
    updateUI(response.mode);
  }
});

editToggle.addEventListener('change', async () => {
  const mode: EditorMode = editToggle.checked ? 'edit' : 'browse';
  try {
    const response = await sendToBackground({ type: 'TOGGLE_EDIT_MODE', mode });
    if (response.type === 'ERROR') {
      statusText.textContent = response.message;
      statusText.classList.remove('active');
      editToggle.checked = !editToggle.checked;
    } else if (response.type === 'CONSENT_REQUIRED') { // 首次使用时提示用户转到网页完成数据处理授权。
      statusText.textContent = '请在网页中确认隐私说明'; // 使用直白文案说明下一步操作，避免用户误以为开关失效。
      statusText.classList.remove('active'); // 授权完成前保持浏览模式的非激活视觉状态。
      editToggle.checked = false; // 授权完成前不把开关显示为已开启，确保界面与实际状态一致。
    } else if (response.type === 'EDIT_MODE_STATUS') { // 只有编辑状态响应包含 mode 字段，必须先完成类型收窄。
      updateUI(response.mode); // 使用后台返回的真实模式更新开关，避免界面依赖请求时的预期值。
    } else { // 理论上切换命令不会返回导出或复制响应，但仍为异常消息提供稳定反馈。
      statusText.textContent = '状态异常，请重试'; // 告知用户本次切换没有得到可识别的结果。
      statusText.classList.remove('active'); // 异常时保持非激活样式，避免误导用户编辑器已经开启。
      editToggle.checked = false; // 将开关恢复到安全的关闭状态。
    }
  } catch (e) {
    statusText.textContent = '切换失败，请刷新页面后重试';
    statusText.classList.remove('active');
    editToggle.checked = !editToggle.checked;
  }
});

btnExport.addEventListener('click', async () => {
  await sendToBackground({
    type: 'EXPORT_HTML',
    options: { includeStyles: true, includeResources: false, format: 'html' },
  });
});

btnCopy.addEventListener('click', async () => {
  await sendToBackground({ type: 'COPY_HTML' });
});
