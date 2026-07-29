/* 汎用ユーティリティ ------------------------------------------------------ */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

  // フレームレート非依存の指数補間
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

  // mulberry32: 軽量なシード付き乱数
  function makeRng(seed) {
    let s = seed >>> 0;
    const rng = function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.range = (a, b) => a + rng() * (b - a);
    rng.int = (a, b) => Math.floor(rng.range(a, b + 1));
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.chance = (p) => rng() < p;
    return rng;
  }

  /* 色まわり。遠景を大気の色に溶かす（エアリアルパースペクティブ）ために
     16進カラーを一度だけ数値に落として、混色は数値のまま行う。 */
  // "#abc" / "#aabbcc" / "rgb(r,g,b)" のいずれも受ける（混色の結果を
  // そのまま次の混色に渡せるようにするため）
  function parseColor(color) {
    if (color[0] !== '#') {
      const m = color.match(/-?\d+(\.\d+)?/g);
      return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
    }
    const h = color.slice(1);
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbCache = new Map();
  function rgbOf(hex) {
    let v = rgbCache.get(hex);
    if (!v) {
      v = parseColor(hex);
      if (rgbCache.size > 512) rgbCache.clear();
      rgbCache.set(hex, v);
    }
    return v;
  }
  function mixHex(hexA, hexB, t) {
    const a = rgbOf(hexA), b = rgbOf(hexB);
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  }
  function shade(hex, amount) {
    const [r, g, b] = rgbOf(hex);
    const t = clamp(amount, -1, 1);
    const f = (c) => Math.round(t >= 0 ? lerp(c, 255, t) : lerp(c, 0, -t));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function rgba(hex, alpha) {
    const [r, g, b] = rgbOf(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // 角丸パス（Path2D の roundRect が無い環境向けのフォールバック込み）
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, rr); return; }
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function ellipse(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, Math.PI * 2);
  }

  const fmt = (n) => Math.floor(n).toLocaleString('ja-JP');

  SB.util = {
    clamp, lerp, smoothstep, easeOutCubic, easeOutBack, damp,
    makeRng, mixHex, shade, rgba, roundRect, ellipse, fmt, TAU: Math.PI * 2,
  };
})(window);
