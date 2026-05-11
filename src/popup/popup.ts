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
    } else {
      updateUI(mode);
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
