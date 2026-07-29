/* SVG のアイコンから PNG を書き出す。
   iOS のホーム画面は SVG を読まないため PNG が必須。Android も PNG のほうが確実。

   ラスタライズには Chrome/Chromium のヘッドレススクリーンショットを使う
   （追加のパッケージを入れずに済ませるため）。

   使い方: node tools/build-icons.mjs
           CHROME=/path/to/chrome node tools/build-icons.mjs                 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CANDIDATES = [
  process.env.CHROME,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('Chrome/Chromium が見つかりません。CHROME=/path/to/chrome を指定してください。');
  process.exit(1);
}

/* マスカブル版を icon.svg から作る。
   OS が円や角丸に切り抜くので、四隅まで塗りつぶし（角丸をやめ）、
   主役のクマだけを中央80%の安全圏に収まるよう縮める。
   背景（空・山・雪面）は切り取られてよいので全面のまま残す。       */
function buildMaskable() {
  const src = readFileSync(resolve(root, 'assets/icon.svg'), 'utf8');
  const out = src
    .replace('<rect width="512" height="512" rx="112" fill="url(#sky)"/>',
             '<rect width="512" height="512" fill="url(#sky)"/>')
    .replace('<g transform="translate(256 322)">',
             '<g transform="translate(256 256) scale(0.8) translate(-256 -256)"><g transform="translate(256 322)">')
    .replace('</svg>', '</g></svg>');
  const dst = resolve(root, 'assets/icon-maskable.svg');
  writeFileSync(dst, out);
  console.log('assets/icon-maskable.svg  (icon.svg から生成)');
}
buildMaskable();

// [元SVG, 出力名, サイズ]
const JOBS = [
  ['assets/icon.svg', 'assets/icon-192.png', 192],
  ['assets/icon.svg', 'assets/icon-512.png', 512],
  ['assets/icon-maskable.svg', 'assets/icon-maskable-512.png', 512],
  // iOS のホーム画面用。角丸は OS 側が付けるので、四隅まで塗った版を使う
  ['assets/icon-maskable.svg', 'assets/apple-touch-icon.png', 180],
];

const work = resolve(tmpdir(), `icon-build-${process.pid}`);
mkdirSync(work, { recursive: true });

for (const [src, out, size] of JOBS) {
  const svg = readFileSync(resolve(root, src), 'utf8');
  const page = resolve(work, 'page.html');
  /* 目的のサイズちょうどのウィンドウで撮ると、小さい指定のときに
     Chrome が窓を広げてしまい絵が途中で切れる。2倍で描いて
     デバイスピクセル比 0.5 で撮る（0.5 が指定できる下限）。
     縮小されるぶん輪郭も滑らかになる。                          */
  const css = size * 2;
  writeFileSync(page, `<!DOCTYPE html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}
svg{display:block;width:${css}px;height:${css}px}</style>${svg}`);

  const png = resolve(root, out);
  // コンテナ内で root として動かす場合、サンドボックスを外さないと起動しない
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  execFileSync(chrome, [
    ...(asRoot ? ['--no-sandbox'] : []),
    '--headless', '--disable-gpu', '--hide-scrollbars',
    '--default-background-color=00000000',
    `--screenshot=${png}`,
    `--window-size=${css},${css}`,
    '--force-device-scale-factor=0.5',
    page,
  ], { stdio: 'pipe' });

  console.log(`${out}  ${size}x${size}  (${(readFileSync(png).length / 1024).toFixed(1)} KB)`);
}

rmSync(work, { recursive: true, force: true });
