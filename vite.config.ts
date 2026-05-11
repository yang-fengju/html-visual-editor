import { defineConfig } from 'vite';
import { resolve } from 'path';

// Chrome 扩展需要三个独立入口，分别构建
// content script 和 background 必须是 IIFE（不支持 ES modules）
// popup 是独立 HTML 页面
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    target: 'chrome110',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
