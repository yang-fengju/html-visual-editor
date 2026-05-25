import { createRequire } from 'module';
const require = createRequire('/home/lm/.nvm/versions/node/v24.13.1/lib/node_modules/sharp/');
const sharp = require('./lib/index.js');
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 图标设计：圆角矩形背景 + HTML 尖括号 + 铅笔
// 表达「可视化编辑 HTML」的概念
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F46E5"/>
      <stop offset="100%" style="stop-color:#7C3AED"/>
    </linearGradient>
  </defs>
  <!-- 圆角矩形背景 -->
  <rect x="4" y="4" width="120" height="120" rx="24" ry="24" fill="url(#bg)"/>

  <!-- HTML 尖括号 < > -->
  <text x="26" y="82" font-family="Arial, Helvetica, sans-serif" font-size="60" font-weight="bold" fill="rgba(255,255,255,0.35)">&lt;/&gt;</text>

  <!-- 铅笔图形 -->
  <g transform="translate(68, 22) rotate(35, 30, 45)">
    <!-- 笔杆 -->
    <rect x="24" y="10" width="14" height="56" rx="2" fill="#FCD34D"/>
    <rect x="24" y="10" width="14" height="56" rx="2" fill="url(#pencilShade)" opacity="0.15"/>
    <!-- 笔杆条纹 -->
    <rect x="24" y="10" width="5" height="56" rx="1" fill="#FBBF24"/>
    <rect x="33" y="10" width="5" height="56" rx="1" fill="#F59E0B"/>
    <!-- 笔尖金属环 -->
    <rect x="22" y="62" width="18" height="8" rx="1" fill="#9CA3AF"/>
    <!-- 笔尖 -->
    <polygon points="25,70 37,70 31,88" fill="#F7E5C0"/>
    <polygon points="29,78 33,78 31,88" fill="#374151"/>
    <!-- 笔头橡皮 -->
    <rect x="24" y="4" width="14" height="8" rx="3" fill="#FB7185"/>
  </g>
</svg>`;

const sizes = [16, 48, 128];

for (const size of sizes) {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  const outPath = resolve(__dirname, `public/icons/icon${size}.png`);
  writeFileSync(outPath, buf);
  console.log(`Generated icon${size}.png (${buf.length} bytes)`);
}

console.log('Done!');
