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
        this.history.push('media-change', () => { imgElement.src = oldSrc; }, () => { imgElement.src = newSrc; });
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  setMediaSource(element: HTMLVideoElement | HTMLAudioElement, src: string) {
    const oldSrc = element.src;
    element.src = src;
    this.history.push('media-change', () => { element.src = oldSrc; }, () => { element.src = src; });
  }

  showMediaDialog(element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement) {
    const isImage = element instanceof HTMLImageElement;
    const title = isImage ? '替换图片' : '设置媒体源';

    const dialog = document.createElement('div');
    dialog.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); padding: 24px; z-index: 2147483647; min-width: 400px;`;
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
      ${!isImage ? `<div style="margin-bottom: 16px;"><label style="display: block; font-size: 13px; margin-bottom: 4px;">或粘贴嵌入代码 (iframe)</label><textarea id="media-embed" placeholder="<iframe ...></iframe>" rows="3" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"></textarea></div>` : ''}
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button id="media-cancel" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">取消</button>
        <button id="media-confirm" style="padding: 8px 16px; border: none; border-radius: 4px; background: #4285f4; color: white; cursor: pointer;">确认</button>
      </div>
    `;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 2147483646;';
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    const cleanup = () => { dialog.remove(); overlay.remove(); };
    dialog.querySelector('#media-cancel')!.addEventListener('click', cleanup);
    overlay.addEventListener('click', cleanup);

    dialog.querySelector('#media-confirm')!.addEventListener('click', () => {
      const urlInput = dialog.querySelector('#media-url') as HTMLInputElement;
      const fileInput = dialog.querySelector('#media-file') as HTMLInputElement;
      const embedInput = dialog.querySelector('#media-embed') as HTMLTextAreaElement | null;

      if (urlInput.value) {
        if (isImage) this.replaceImageSrc(element as HTMLImageElement, urlInput.value);
        else this.setMediaSource(element as HTMLVideoElement | HTMLAudioElement, urlInput.value);
      } else if (fileInput.files?.[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (isImage) this.replaceImageSrc(element as HTMLImageElement, e.target!.result as string);
          else this.setMediaSource(element as HTMLVideoElement | HTMLAudioElement, e.target!.result as string);
        };
        reader.readAsDataURL(fileInput.files[0]);
      } else if (embedInput?.value) {
        const oldHTML = element.outerHTML;
        const parent = element.parentElement!;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = embedInput.value;
        const newEl = wrapper.firstElementChild || wrapper;
        parent.replaceChild(newEl, element);
        this.history.push('media-change', () => { parent.replaceChild(element, newEl); }, () => { parent.replaceChild(newEl, element); });
      }
      cleanup();
    });
  }

  private replaceImageSrc(img: HTMLImageElement, newSrc: string) {
    const oldSrc = img.src;
    img.src = newSrc;
    this.history.push('media-change', () => { img.src = oldSrc; }, () => { img.src = newSrc; });
  }
}
