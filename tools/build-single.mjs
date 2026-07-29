/* index.html と CSS/JS を1枚の HTML にまとめる。
   URL を渡すだけで遊べる形、メールやAirDropで配れる形、
   Artifact のように外部ファイルを取りに行けない場所への埋め込み用。

   使い方: node tools/build-single.mjs [出力先]
           node tools/build-single.mjs --fragment 出力先   （<html>等を省く）  */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const outPath = resolve(root, args.filter((a) => !a.startsWith('--'))[0] || 'dist/index.html');

const html = read('index.html');
const css = read('styles.css');

// index.html が読み込んでいる順番のまま JS を連結する（依存順を二重管理しない）
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const js = scripts
  .map((src) => `/* ===== ${src} ===== */\n${read(src)}`)
  .join('\n');

// 単一ファイルには sw.js が付いてこないので、登録処理ごと落とす
const jsInline = js.replace(
  /\/\* --- PWA[\s\S]*?\n  }\n/,
  '/* --- 単一ファイル版では Service Worker を使わない --- */\n'
);

let body = html
  .split('<body>')[1].split('</body>')[0]
  .replace(/\s*<script src="[^"]+"><\/script>/g, '')
  .trim();

const inlined = `<style>\n${css}\n</style>\n\n${body}\n\n<script>\n${jsInline}\n</script>\n`;

let out;
if (fragment) {
  // <head> を自分で持てない埋め込み先向け。viewport は body 内でも解釈される
  out = `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>もふもふスノーボード</title>
${inlined}`;
} else {
  // アイコンもデータURIにして、この1枚だけで完結させる
  const iconUri = 'data:image/svg+xml;base64,' + Buffer.from(read('assets/icon.svg')).toString('base64');
  const head = html.split('<head>')[1].split('</head>')[0]
    .replace(/\s*<link rel="manifest"[^>]*>/, '')
    .replace(/\s*<link rel="stylesheet"[^>]*>/, '')
    .replace(/assets\/icon\.svg/g, iconUri)
    .trim();
  out = `<!DOCTYPE html>\n<html lang="ja">\n<head>\n${head}\n</head>\n<body>\n${inlined}</body>\n</html>\n`;
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);
console.log(`${outPath}  (${(out.length / 1024).toFixed(1)} KB, ${scripts.length} scripts inlined)`);
