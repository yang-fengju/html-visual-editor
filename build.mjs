import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cpSync, mkdirSync, rmSync, existsSync, renameSync, readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, 'dist');
const tmpDir = resolve(__dirname, '.tmp-build');

// 清理
if (existsSync(distDir)) rmSync(distDir, { recursive: true });
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
mkdirSync(distDir, { recursive: true });

// 1. 构建 content script
console.log('\n📦 构建 content script...');
await build({
  configFile: false,
  build: {
    outDir: resolve(tmpDir, 'content'),
    emptyDirBeforeWrite: true,
    target: 'chrome110',
    rollupOptions: {
      input: resolve(__dirname, 'src/content/index.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        inlineDynamicImports: true,
      },
    },
    manifest: false,
  },
});
cpSync(resolve(tmpDir, 'content/content.js'), resolve(distDir, 'content.js'));

// 2. 构建 background
console.log('\n📦 构建 background...');
await build({
  configFile: false,
  build: {
    outDir: resolve(tmpDir, 'background'),
    emptyDirBeforeWrite: true,
    target: 'chrome110',
    rollupOptions: {
      input: resolve(__dirname, 'src/background/index.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'background.js',
        inlineDynamicImports: true,
      },
    },
    manifest: false,
  },
});
cpSync(resolve(tmpDir, 'background/background.js'), resolve(distDir, 'background.js'));

// 3. 构建 popup
console.log('\n📦 构建 popup...');
await build({
  configFile: false,
  build: {
    outDir: resolve(distDir, 'popup'),
    emptyDirBeforeWrite: true,
    target: 'chrome110',
    rollupOptions: {
      input: resolve(__dirname, 'src/popup/index.html'),
      output: {
        entryFileNames: 'popup.js',
        assetFileNames: '[name].[ext]',
      },
    },
    manifest: false,
  },
});

// 4. 复制静态资源
console.log('\n📋 复制静态资源...');
cpSync(resolve(__dirname, 'public/manifest.json'), resolve(distDir, 'manifest.json'));
cpSync(resolve(__dirname, 'public/icons'), resolve(distDir, 'icons'), { recursive: true });

// 清理临时目录
rmSync(tmpDir, { recursive: true });

// 修复 popup HTML 路径 — Vite 输出在 src/popup/index.html 里，需要移到 popup/ 根目录
const popupHtmlSrc = resolve(distDir, 'popup/src/popup/index.html');
const popupHtmlDst = resolve(distDir, 'popup/index.html');
if (existsSync(popupHtmlSrc) && popupHtmlSrc !== popupHtmlDst) {
  cpSync(popupHtmlSrc, popupHtmlDst);
  rmSync(resolve(distDir, 'popup/src'), { recursive: true });
}

// 清理 popup 目录下的冗余文件（Vite 复制的 public 资源）
const popupRedundant = ['popup/icons', 'popup/manifest.json'];
for (const f of popupRedundant) {
  const p = resolve(distDir, f);
  if (existsSync(p)) rmSync(p, { recursive: true });
}

// 修复 popup HTML 中的绝对路径为相对路径
if (existsSync(popupHtmlDst)) {
  let html = readFileSync(popupHtmlDst, 'utf-8');
  html = html.replace(/src="\/popup\.js"/g, 'src="popup.js"');
  html = html.replace(/href="\/index\.css"/g, 'href="index.css"');
  writeFileSync(popupHtmlDst, html);
}

// 验证
console.log('\n🔍 验证构建产物...');
const requiredFiles = ['manifest.json', 'content.js', 'background.js', 'popup/index.html', 'icons/icon16.png'];
let allOk = true;
for (const f of requiredFiles) {
  if (!existsSync(resolve(distDir, f))) {
    console.error(`  ❌ 缺少: ${f}`);
    allOk = false;
  } else {
    console.log(`  ✓ ${f}`);
  }
}

if (allOk) console.log('\n✅ 构建完成！');
else { console.error('\n❌ 构建不完整'); process.exit(1); }
