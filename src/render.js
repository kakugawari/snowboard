/* 描画 ---------------------------------------------------------------------
   セグメント方式の擬似3D。遠いものから順に台形を敷き詰め、その区画に属する
   オブジェクトを重ねる（ペインターズアルゴリズム）。
   遠景ほど大気の色に溶かして、奥行きを出す。                              */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});
  const { clamp, lerp, mixHex, rgba, roundRect, ellipse, TAU } = SB.util;
  const C = SB.C;

  const PAL = {
    skyTop: '#2c62ac',
    skyMid: '#7fb0e2',
    skyLow: '#cfe1f2',
    skyWarm: '#eef0ec',   // 地平線ぎわ。わずかに暖色へ振る
    haze: '#dfe9f5',
    sun: '#fff6d8',
    snow: '#f4f8fd',
    sunlit: '#fffdf4',      // 日の当たる雪（わずかに暖色）
    snowDeep: '#b9cee8',    // 落ち込んだ面の影（青）
    foreCool: '#a8c4e2',    // 足元。寒色に沈めて中景を引き立てる
    snowShade: '#dce8f6',
    piste: '#ffffff',
    pisteAlt: '#eaf2fc',
    powder: '#e4eefb',
    pine: '#2f5a45',
    pineDark: '#22412f',
    trunk: '#4a3728',
    rock: '#9aa9bd',
    rockDark: '#78899f',
    ice: '#bcd9ef',
    gold: '#ffd25e',
    goldDark: '#e8a72c',
    red: '#e2483f',
    steel: '#6b7480',
  };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.dpr = 1;
      this.W = 0; this.H = 0;
      this.resize();
      addEventListener('resize', () => this.resize());
      addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    }

    resize() {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);  // 2倍を超えても見た目は変わらず、塗り面積だけ増える
      const w = this.canvas.clientWidth || innerWidth;
      const h = this.canvas.clientHeight || innerHeight;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.W = w; this.H = h;
    }

    /* --- カメラ ------------------------------------------------------- */
    setCamera(cam) {
      this.cam = cam;
      // 横長の画面では H が小さくなり、H だけを基準にすると全体が縮んで
      // しまう。横幅も見て、寄り気味の画角にする。
      this.focal = Math.max(this.H * 0.78, this.W * 0.50) * cam.fov;
      this.horizon = this.H * 0.44 + cam.pitch * this.H + cam.shakeY;
      this.cx = this.W * 0.5 + cam.shakeX;
      // 遠景の山も H 基準だと横長で潰れるので、画面比に応じて持ち上げる
      this.skyScale = 1 + 0.42 * clamp(this.W / this.H - 0.8, 0, 1.6);
    }

    project(x, y, z) {
      const dz = z - this.cam.z;
      if (dz < 0.8) return null;
      const s = this.focal / dz;
      return {
        x: this.cx + (x - this.cam.x) * s,
        y: this.horizon + (this.cam.y - y) * s,
        s, dz,
      };
    }

    fog(dz) { return clamp((dz - 40) / 190, 0, 0.92); }

    /* --- 空・遠景 ----------------------------------------------------- */
    drawSky(world, t) {
      const { ctx, W, H } = this;
      const hz = this.horizon;

      /* 空は上ほど濃い青、地平線に近づくほど淡く暖かい。上下だけでなく
         「太陽の側が暖かい」ことまで描くと、時間帯のある空気になる。 */
      const skyH = Math.max(hz, 10);
      const g = ctx.createLinearGradient(0, 0, 0, skyH);
      g.addColorStop(0, PAL.skyTop);
      g.addColorStop(0.42, PAL.skyMid);
      g.addColorStop(0.82, PAL.skyLow);
      g.addColorStop(1, PAL.skyWarm);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, Math.max(hz, 0));
      if (hz < 0) { ctx.fillStyle = PAL.skyLow; ctx.fillRect(0, 0, W, H); }

      const sx = W * 0.74 - this.cam.x * 1.2;
      const sy = Math.max(H * 0.14, hz - H * 0.30 * this.skyScale);
      this.sunX = sx; this.sunY = sy;

      // 光暈は2枚重ね。広く淡いものと、芯の近くの濃いもの
      const gr = Math.max(W, H) * 0.42;
      const wide = ctx.createRadialGradient(sx, sy, 0, sx, sy, gr);
      wide.addColorStop(0, 'rgba(255,246,214,0.46)');
      wide.addColorStop(0.35, 'rgba(255,240,200,0.16)');
      wide.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = wide;
      ctx.fillRect(sx - gr, Math.max(0, sy - gr), gr * 2, Math.min(hz, sy + gr) - Math.max(0, sy - gr));

      // 光の筋。太陽から扇状に薄く伸ばす
      if (hz > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, hz);
        ctx.clip();
        const rays = 5;
        const reach = Math.max(W, H) * 0.85;
        for (let i = 0; i < rays; i++) {
          const a = 1.18 + i * 0.19 + Math.sin(t * 0.08 + i) * 0.012;
          const spread = 0.030 + (i % 3) * 0.012;
          ctx.fillStyle = `rgba(255,248,226,${0.055 + (i % 2) * 0.03})`;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(a - spread) * reach, sy + Math.sin(a - spread) * reach);
          ctx.lineTo(sx + Math.cos(a + spread) * reach, sy + Math.sin(a + spread) * reach);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      const core = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.165 * this.skyScale);
      core.addColorStop(0, 'rgba(255,253,240,0.98)');
      core.addColorStop(0.22, 'rgba(255,247,215,0.6)');
      core.addColorStop(1, 'rgba(255,242,200,0)');
      const cr = H * 0.17 * this.skyScale;
      ctx.fillStyle = core;
      ctx.fillRect(sx - cr, sy - cr, cr * 2, cr * 2);
      ctx.fillStyle = '#fffdf2';
      ellipse(ctx, sx, sy, H * 0.032 * this.skyScale, H * 0.032 * this.skyScale); ctx.fill();

      // 雲
      for (const c of world.clouds) {
        c.x += c.spd * 0.016;
        if (c.x > 1.3) c.x = -0.3;
        const cxp = c.x * W * 1.4 - W * 0.2 - this.cam.x * 2.4;
        const cyp = c.y * hz;
        this.cloud(cxp, cyp, c.s * H * 0.055 * this.skyScale, c.puffs, c.seed, sx);
      }

      // 鳥（小さな動き。風景に生き物がいると印象が変わる）
      ctx.strokeStyle = 'rgba(60,70,90,0.35)';
      ctx.lineWidth = Math.max(1, H * 0.0016);
      for (const b of world.birds) {
        b.x += b.spd * 0.016;
        if (b.x > 1.2) b.x = -0.2;
        const bx = b.x * W, by = b.y * hz + Math.sin(t * 0.7 + b.ph) * H * 0.01;
        const flap = Math.sin(t * 6 + b.ph) * 0.5 + 0.6;
        const s = H * 0.008;
        ctx.beginPath();
        ctx.moveTo(bx - s, by);
        ctx.quadraticCurveTo(bx - s * 0.4, by - s * flap, bx, by);
        ctx.quadraticCurveTo(bx + s * 0.4, by - s * flap, bx + s, by);
        ctx.stroke();
      }

      this.drawRanges(world);
    }

    /* 雲は白い塊ではなく、下側の影・白い本体・太陽側の縁の3層で描く。
       この3層があるだけで、平面的な楕円が立体になる。 */
    cloud(x, y, r, puffs, seed, sunX) {
      const ctx = this.ctx;
      const lobe = (i) => {
        const a = seed + i * 1.7;
        return {
          x: x + (i - puffs / 2) * r * 0.82,
          y: y + Math.sin(a) * r * 0.16,
          rx: r * (0.72 + (Math.sin(a * 3) + 1) * 0.28),
          ry: r * 0.5,
        };
      };

      // 影（下にずらした同じ形）
      ctx.fillStyle = 'rgba(176,196,222,0.55)';
      for (let i = 0; i < puffs; i++) {
        const l = lobe(i);
        ellipse(ctx, l.x, l.y + r * 0.20, l.rx * 0.96, l.ry * 0.92);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(186,205,229,0.5)';
      ellipse(ctx, x, y + r * 0.34, r * puffs * 0.4, r * 0.3); ctx.fill();

      // 本体
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      for (let i = 0; i < puffs; i++) {
        const l = lobe(i);
        ellipse(ctx, l.x, l.y, l.rx, l.ry);
        ctx.fill();
      }

      // 太陽の側だけ縁を暖色に光らせる
      const dir = sunX !== undefined && sunX < x ? -1 : 1;
      ctx.fillStyle = 'rgba(255,252,242,0.42)';
      for (let i = 0; i < puffs; i++) {
        const l = lobe(i);
        ellipse(ctx, l.x + dir * l.rx * 0.16, l.y - l.ry * 0.22, l.rx * 0.68, l.ry * 0.5);
        ctx.fill();
      }
    }

    /* 山脈は形が変わらないので、一度オフスクリーンに描いて毎フレーム貼るだけに
       する。描画コストがほぼ消えるぶん、峰ごとの陰影や岩の筋まで描き込める。 */
    buildRanges(world) {
      const { W, H, dpr } = this;
      this.rangeKey = `${W}x${H}@${dpr}`;
      const skyScale = this.skyScale || 1;
      this.rangeArt = world.ranges.map((R) => {
        const spanW = Math.round(W * 2.4);
        const peakH = H * R.height * skyScale;
        const pad = Math.round(H * 0.06);           // 裾の森が下へはみ出すぶん
        const h = Math.ceil(peakH * 1.05 + pad);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(spanW * dpr));
        cv.height = Math.max(1, Math.round(h * dpr));
        const c = cv.getContext('2d');
        c.scale(dpr, dpr);
        this.paintRange(c, R, spanW, h - pad, peakH);
        // 霞は描いた画素だけに乗せる
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = rgba(PAL.haze, R.fog);
        c.fillRect(0, 0, spanW, h);
        c.globalCompositeOperation = 'source-over';
        return { cv, w: spanW, h, baseY: h - pad };
      });
    }

    paintRange(c, R, w, baseY, peakH) {
      const lit = R.lit, shade = R.shade, rock = R.rock;
      const rockLit = mixHex(rock, lit, 0.22);

      for (let rep = -1; rep <= 1; rep++) {
        for (const p of R.peaks) {
          const cx = (p.x + rep) * w;
          const pw = p.w * w;
          if (cx + pw < 0 || cx - pw > w) continue;
          const ax = cx + p.skew * pw;              // 頂点
          const ay = baseY - p.h * peakH;
          // 稜線（頂点 → 肩 → 裾）。肩を挟むことで山塊らしい輪郭になる
          const side = (dir) => {
            const sh = dir < 0 ? p.shoulderL : p.shoulderR;
            return [
              [ax, ay],
              [cx + dir * pw * sh.out, baseY - p.h * peakH * sh.at],
              [cx + dir * pw, baseY],
            ];
          };
          const left = side(-1), right = side(1);

          const outline = new Path2D();
          outline.moveTo(ax, ay);
          for (let i = 1; i < right.length; i++) outline.lineTo(right[i][0], right[i][1]);
          for (let i = left.length - 1; i >= 1; i--) outline.lineTo(left[i][0], left[i][1]);
          outline.closePath();

          c.save();
          c.clip(outline);

          // 岩肌。頂点を境に右（陽）と左（影）で明度を変える
          c.fillStyle = rock;
          c.fillRect(cx - pw - 2, ay - 2, pw * 2 + 4, peakH + 4);
          c.fillStyle = rockLit;
          c.fillRect(ax, ay - 2, pw + 2, peakH + 4);

          // 冠雪。下端をギザギザにして、岩が顔を出しているように見せる
          const snowY = ay + p.h * peakH * p.snowLine;
          const at = (pts, y) => {            // 稜線上で高さ y の位置の x を求める
            for (let i = 0; i < pts.length - 1; i++) {
              const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
              if (y >= y1 && y <= y2) return x1 + (x2 - x1) * ((y - y1) / (y2 - y1 || 1));
            }
            return pts[pts.length - 1][0];
          };
          const snow = new Path2D();
          snow.moveTo(at(left, snowY), snowY);
          const steps = p.jag.length;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const xx = lerp(at(left, snowY), at(right, snowY), t);
            const yy = snowY - (i % 2 ? 1 : -1) * p.jag[Math.min(i, steps - 1)] * peakH * 0.10;
            snow.lineTo(xx, yy);
          }
          snow.lineTo(at(right, snowY), snowY);
          snow.lineTo(cx + pw, ay - peakH);
          snow.lineTo(cx - pw, ay - peakH);
          snow.closePath();

          c.save();
          c.clip(snow);
          c.fillStyle = shade;
          c.fillRect(cx - pw - 2, ay - peakH, pw * 2 + 4, peakH * 2);
          c.fillStyle = lit;
          c.fillRect(ax, ay - peakH, pw + 2, peakH * 2);
          c.restore();

          // 谷筋。稜線から流れ落ちる影で、白い面が平板にならないようにする
          c.fillStyle = rgba(shade, 0.5);
          for (let g = 0; g < p.gullies.length; g++) {
            const gx = ax + (p.gullies[g] - 0.5) * pw * 1.3;
            const top = ay + peakH * 0.04 * (g + 1);
            c.beginPath();
            c.moveTo(gx, top);
            c.lineTo(gx + pw * 0.05, baseY);
            c.lineTo(gx - pw * 0.05, baseY);
            c.closePath();
            c.fill();
          }
          c.restore();
        }
      }

      // 裾の樹林帯。周期関数で作るので左右につないでも継ぎ目が出ない
      c.fillStyle = R.forest;
      c.beginPath();
      c.moveTo(0, baseY + peakH * 0.2);
      const n = 90;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const bump =
          Math.sin(t * Math.PI * 2 * 3 + 0.7) * 0.5 +
          Math.sin(t * Math.PI * 2 * 7 + 2.1) * 0.3 +
          Math.sin(t * Math.PI * 2 * 13) * 0.2;
        c.lineTo(t * w, baseY - peakH * (0.045 + bump * 0.035));
      }
      c.lineTo(w, baseY + peakH * 0.2);
      c.closePath();
      c.fill();
    }

    drawRanges(world) {
      const { ctx, W, H } = this;
      const hz = this.horizon;
      if (this.rangeKey !== `${W}x${H}@${this.dpr}` || !this.rangeArt) this.buildRanges(world);

      for (let li = 0; li < world.ranges.length; li++) {
        const R = world.ranges[li];
        const art = this.rangeArt[li];
        const off = -this.cam.x * (0.6 + R.depth * 2.2) - this.cam.z * 0.02 * R.depth;
        const x0 = ((off % art.w) + art.w) % art.w - art.w;
        const top = hz + H * 0.012 * (1 - R.depth) - art.baseY;
        for (let x = x0; x < W; x += art.w) {
          ctx.drawImage(art.cv, x, top, art.w, art.h);
        }
      }

      // 谷底の霞。山の裾を地平線に溶かす
      const hazeG = ctx.createLinearGradient(0, hz - H * 0.085, 0, hz + H * 0.015);
      hazeG.addColorStop(0, rgba(PAL.haze, 0));
      hazeG.addColorStop(1, rgba(PAL.haze, 0.92));
      ctx.fillStyle = hazeG;
      ctx.fillRect(0, hz - H * 0.085, W, H * 0.1);
    }

    /* --- 地面とオブジェクト ------------------------------------------- */
    drawWorld(world, t) {
      const { ctx, H } = this;
      const cam = this.cam;
      const segLen = C.SEG_LEN;
      const startIdx = Math.floor((cam.z + 2) / segLen);
      const count = Math.ceil(C.VIEW / segLen);
      const half = C.PISTE_HALF;

      // 遠い側から手前へ。オブジェクトは z 昇順配列を後ろから消費する
      const objs = world.objects;
      let oi = objs.length - 1;
      const farLimit = cam.z + C.VIEW;
      while (oi >= 0 && objs[oi].z > farLimit) oi--;

      // 遠方は区画をまとめて描く（画面上では1px以下に潰れるため）
      let far = this.projectSeg((startIdx + count) * segLen, half);
      let i = count - 1;
      while (i >= 0) {
        const dz = (startIdx + i) * segLen - cam.z;
        const stride = dz > 120 ? 4 : dz > 60 ? 2 : 1;
        const iNext = Math.max(0, i - stride + 1);
        const z0 = (startIdx + iNext) * segLen;
        const near = this.projectSeg(z0, half);
        if (near && far) this.groundQuad(near, far, startIdx + iNext);
        while (oi >= 0 && objs[oi].z >= z0) {
          this.drawObject(objs[oi], t);
          oi--;
        }
        far = near;
        i = iNext - 1;
      }
    }

    projectSeg(z, half) {
      const dz = z - this.cam.z;
      if (dz < 1.0) return null;
      const s = this.focal / dz;
      const cxw = SB.centerX(z);
      // 前後の高さの差＝斜面の向き。光は上から当たるので、せり上がる面は
      // 明るく、落ち込む面は影になる。これで雪面のうねりが見えるようになる。
      const slope = (SB.terrainY(z + C.SEG_LEN) - SB.terrainY(z)) / C.SEG_LEN;
      return {
        z,
        x: this.cx + (cxw - this.cam.x) * s,
        y: this.horizon + (this.cam.y - SB.terrainY(z)) * s,
        w: half * s,
        s, dz, slope,
        fog: this.fog(dz),
      };
    }

    groundQuad(n, f, idx) {
      const ctx = this.ctx, W = this.W;
      if (f.y >= n.y + 0.4) return;   // 丘の裏側（見えない面）は捨てる

      /* 縞の強さは距離で決める。手前は縞が画面上で巨大になり縞模様に
         見えてしまうので薄く、中距離だけはっきりさせて速度感を出す。 */
      const stripe = (idx % 2) ? clamp((n.dz - 4) / 16, 0, 1) * 0.34 : 0;

      /* 斜面の向きで明るさを変える。せり上がる面は日を受けて白く、
         落ち込む面は陰る。平らな白い板が、うねる雪面に見えてくる。 */
      const light = clamp(n.slope * 3.4, -1, 1);
      // 足元は少し寒色に沈める。中景の明るさが引き立ち、奥行きも出る
      const nearCool = clamp((14 - n.dz) / 12, 0, 1) * 0.30;
      const snowTone = light >= 0
        ? mixHex(PAL.snow, PAL.sunlit, light * 0.55)
        : mixHex(PAL.snow, PAL.snowDeep, -light * 0.85);
      const pisteTone = light >= 0
        ? mixHex(PAL.piste, PAL.sunlit, light * 0.5)
        : mixHex(PAL.piste, PAL.snowDeep, -light * 0.8);

      // 一面の雪原（ゲレンデの塗りに完全に隠れる手前の区画では省略する）
      const m = W * 0.07;   // カメラロールで少し広く描いている分の余白
      const covered = n.x - n.w < -m && n.x + n.w > W + m
                   && f.x - f.w < -m && f.x + f.w > W + m;
      if (!covered) {
      const wide = 120;
      ctx.fillStyle = mixHex(mixHex(mixHex(snowTone, PAL.snowShade, stripe * 0.55), PAL.foreCool, nearCool), PAL.haze, n.fog);
      ctx.beginPath();
      ctx.moveTo(n.x - wide * n.s, n.y);
      ctx.lineTo(f.x - wide * f.s, f.y);
      ctx.lineTo(f.x + wide * f.s, f.y);
      ctx.lineTo(n.x + wide * n.s, n.y);
      ctx.closePath();
      ctx.fill();
      }

      // 圧雪バーン（横縞が流れることで速度が読める）
      ctx.fillStyle = mixHex(mixHex(mixHex(pisteTone, PAL.pisteAlt, stripe), PAL.foreCool, nearCool), PAL.haze, n.fog);
      ctx.beginPath();
      ctx.moveTo(n.x - n.w, n.y);
      ctx.lineTo(f.x - f.w, f.y);
      ctx.lineTo(f.x + f.w, f.y);
      ctx.lineTo(n.x + n.w, n.y);
      ctx.closePath();
      ctx.fill();

      /* 圧雪車が刻んだ溝。フォールラインに沿って走るので、遠近の手掛かりに
         なる。1本ずつ線を引くと本数ぶん命令が増えるため、区画ごとに細い
         台形をまとめて1回で塗る。 */
      if (n.dz < 44 && n.s > 0.9) {
        const fade = clamp((44 - n.dz) / 26, 0, 1) * (1 - n.fog);
        ctx.fillStyle = `rgba(196,214,236,${0.20 * fade})`;
        ctx.beginPath();
        const step = 0.4, gw = 0.085;         // 溝の間隔と幅(m)
        for (let o = -C.PISTE_HALF; o <= C.PISTE_HALF; o += step) {
          const nx = n.x + o * n.s, fx = f.x + o * f.s;
          if (nx < -20 && fx < -20) continue;
          if (nx > W + 20 && fx > W + 20) continue;
          ctx.moveTo(nx - gw * n.s, n.y);
          ctx.lineTo(fx - gw * f.s, f.y);
          ctx.lineTo(fx + gw * f.s, f.y);
          ctx.lineTo(nx + gw * n.s, n.y);
        }
        ctx.fill();
      }

      // 雪の粒のきらめき。区画番号から位置を決めるので流れずに手前へ来る
      if (n.dz < 30 && n.s > 2) {
        const a = (1 - n.dz / 30) * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        for (let k = 0; k < 3; k++) {
          const h = ((idx * 2654435761 + k * 40503) >>> 0) / 4294967296;
          const gx = n.x + (h * 2 - 1) * n.w * 0.95;
          const gy = lerp(n.y, f.y, ((h * 7.13) % 1));
          ctx.fillRect(gx, gy, 2, 1.5);
        }
      }

      // コース両端の陰影
      if (n.s > 0.4 && !covered) {
        ctx.fillStyle = mixHex(mixHex(PAL.powder, PAL.piste, 0.45), PAL.haze, n.fog);
        const eg = 0.7;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(n.x + side * n.w, n.y);
          ctx.lineTo(f.x + side * f.w, f.y);
          ctx.lineTo(f.x + side * (f.w + eg * f.s), f.y);
          ctx.lineTo(n.x + side * (n.w + eg * n.s), n.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    /* --- オブジェクト --------------------------------------------------- */
    drawObject(o, t) {
      const ctx0 = this.ctx;
      const zBase = SB.terrainY(o.z);
      const cx = SB.centerX(o.z);
      const p = this.project(cx + o.x, zBase + (o.y || 0), o.z);
      if (!p) return;
      const m = 26; // 画面外の余白
      if (p.x < -this.W * 0.6 - m || p.x > this.W * 1.6 + m) return;
      if (p.y < -this.H) return;
      const f = this.fog(p.dz);
      if (f > 0.9) return;
      // 真横を通り過ぎる物は画面を覆うだけなので、手前で薄れさせる
      const nearFade = clamp((p.dz - 1.5) / 2.5, 0, 1);
      if (nearFade <= 0.02) return;
      const s = p.s;

      if (nearFade < 1) { ctx0.save(); ctx0.globalAlpha = nearFade; }
      switch (o.type) {
        case 'pine': this.pine(p.x, p.y, s * (o.scale || 1), f, o); break;
        case 'bush': this.bush(p.x, p.y, s * (o.scale || 1), f); break;
        case 'rock': this.rock(p.x, p.y, s * (o.scale || 1), f, o); break;
        case 'mogul': this.mogul(p.x, p.y, s * (o.scale || 1), f); break;
        case 'snowman': this.snowman(p.x, p.y, s * (o.scale || 1), f); break;
        case 'pole': this.pole(p.x, p.y, s, f, o); break;
        case 'gate': this.gate(p.x, p.y, s, f, o); break;
        case 'ramp': this.ramp(p.x, p.y, s * (o.scale || 1), f); break;
        case 'ice': this.icePatch(p.x, p.y, s * (o.scale || 1), f); break;
        case 'bell': if (!o.taken) this.bell(p.x, p.y, s, f, t, o); break;
        case 'tower': this.tower(p.x, p.y, s, f, o); break;
        case 'chalet': this.chalet(p.x, p.y, s, f, o); break;
        case 'steeple': this.steeple(p.x, p.y, s, f, o); break;
      }
      if (nearFade < 1) ctx0.restore();
    }

    /* 落ち影。光は右上から来ているので、影は左手前へ長く伸びる。
       接地点に丸を置くだけより、物が地面に立っている感じが強く出る。 */
    castShadow(x, y, h, f, wide) {
      const ctx = this.ctx;
      const len = h * 0.9;
      ctx.fillStyle = `rgba(122,155,196,${0.30 * (1 - f)})`;
      ellipse(ctx, x - len * 0.34, y + h * 0.012, len * 0.5, (wide || h * 0.1), -0.13);
      ctx.fill();
    }

    /* 針葉樹。鋭い三角形を重ねるのではなく、裾が丸く垂れた段を重ね、
       その上に雪を厚く載せる。雪の量で「ぼってり感」が決まる。 */
    pine(x, y, s, f, o) {
      const ctx = this.ctx;
      const h = 5.2 * s, w = 1.8 * s;
      const sway = Math.sin(o.phase) * 0.02 * h;

      this.castShadow(x, y, h * 0.62, f, w * 0.34);

      ctx.save();
      ctx.translate(x, y);

      ctx.fillStyle = mixHex(PAL.trunk, PAL.haze, f);
      ctx.fillRect(-w * 0.08, -h * 0.26, w * 0.16, h * 0.26);

      const dark = mixHex(PAL.pineDark, PAL.haze, f);
      const lit = mixHex(PAL.pine, PAL.haze, f);
      const snow = mixHex('#ffffff', PAL.haze, f * 0.75);
      const snowShade = mixHex('#dae7f5', PAL.haze, f * 0.75);

      // 段の輪郭。drop で裾の垂れ具合、shrink で上すぼまりを決める
      const tier = (yTop, yBot, ww, drop) => {
        ctx.beginPath();
        ctx.moveTo(sway, yTop);
        ctx.quadraticCurveTo(ww * 0.72, yBot - (yBot - yTop) * 0.18, ww, yBot);
        ctx.quadraticCurveTo(ww * 0.45, yBot + drop, 0, yBot + drop * 1.15);
        ctx.quadraticCurveTo(-ww * 0.45, yBot + drop, -ww, yBot);
        ctx.quadraticCurveTo(-ww * 0.72, yBot - (yBot - yTop) * 0.18, sway, yTop);
        ctx.closePath();
      };

      for (let i = 0; i < 4; i++) {
        const t = i / 4;
        const ww = w * (1 - t * 0.60);
        const yBot = -h * (0.22 + t * 0.60);
        const yTop = yBot - h * 0.34;
        const drop = h * 0.035;

        ctx.fillStyle = i % 2 ? dark : lit;
        tier(yTop, yBot, ww, drop);
        ctx.fill();

        if (o.snowy) {
          // 枝に載った雪。段の上半分を覆い、下端をでこぼこにする
          const sy = yBot - (yBot - yTop) * 0.34;
          ctx.fillStyle = snow;
          ctx.beginPath();
          ctx.moveTo(sway, yTop);
          ctx.quadraticCurveTo(ww * 0.66, sy - (sy - yTop) * 0.2, ww * 0.86, sy);
          ctx.quadraticCurveTo(ww * 0.6, sy + drop * 0.7, ww * 0.34, sy + drop * 0.2);
          ctx.quadraticCurveTo(ww * 0.1, sy + drop * 0.9, -ww * 0.16, sy + drop * 0.3);
          ctx.quadraticCurveTo(-ww * 0.5, sy + drop * 1.0, -ww * 0.86, sy);
          ctx.quadraticCurveTo(-ww * 0.66, sy - (sy - yTop) * 0.2, sway, yTop);
          ctx.closePath();
          ctx.fill();
          // 雪の下側に薄く影を入れて、厚みを感じさせる
          ctx.fillStyle = rgba(snowShade, 0.55);
          ctx.beginPath();
          ctx.moveTo(-ww * 0.86, sy);
          ctx.quadraticCurveTo(-ww * 0.5, sy + drop * 1.0, -ww * 0.16, sy + drop * 0.3);
          ctx.quadraticCurveTo(-ww * 0.4, sy + drop * 0.4, -ww * 0.8, sy - drop * 0.1);
          ctx.closePath();
          ctx.fill();
        }
      }
      // てっぺんの雪
      if (o.snowy) {
        ctx.fillStyle = snow;
        ellipse(ctx, sway, -h * 0.92, w * 0.16, w * 0.13);
        ctx.fill();
      }
      ctx.restore();
    }

    /* 山あいの山小屋。急勾配の切妻に雪が厚く積もり、壁は木の色、
       窓には灯りが入る。遠景の中の暖色は距離感と生活感を出す。 */
    chalet(x, y, s, f, o) {
      const ctx = this.ctx;
      const w = 2.6 * s * (o.scale || 1);       // 半幅
      const wall = 2.4 * s * (o.scale || 1);
      const roof = 2.3 * s * (o.scale || 1);
      const warm = o.warm || '#b5613f';

      this.castShadow(x, y, (wall + roof) * 0.8, f, w * 0.34);

      // 壁
      ctx.fillStyle = mixHex('#c99b6e', PAL.haze, f);
      ctx.fillRect(x - w * 0.82, y - wall, w * 1.64, wall);
      ctx.fillStyle = mixHex('#a87c53', PAL.haze, f);
      ctx.fillRect(x - w * 0.82, y - wall, w * 0.34, wall);   // 陰になる面

      // 窓の灯り
      if (s > 0.6) {
        ctx.fillStyle = mixHex('#ffd98a', PAL.haze, f * 0.6);
        const ww = w * 0.22, wh = wall * 0.26;
        ctx.fillRect(x - w * 0.34, y - wall * 0.74, ww, wh);
        ctx.fillRect(x + w * 0.14, y - wall * 0.74, ww, wh);
      }

      // 屋根（軒が壁より外に出る）＋ 厚く積もった雪
      ctx.fillStyle = mixHex(warm, PAL.haze, f);
      ctx.beginPath();
      ctx.moveTo(x, y - wall - roof);
      ctx.lineTo(x + w, y - wall + roof * 0.06);
      ctx.lineTo(x - w, y - wall + roof * 0.06);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = mixHex('#ffffff', PAL.haze, f * 0.8);
      ctx.beginPath();
      ctx.moveTo(x, y - wall - roof);
      ctx.lineTo(x + w, y - wall + roof * 0.06);
      ctx.lineTo(x + w * 0.86, y - wall - roof * 0.06);
      ctx.quadraticCurveTo(x + w * 0.4, y - wall - roof * 0.44, x, y - wall - roof * 0.86);
      ctx.quadraticCurveTo(x - w * 0.4, y - wall - roof * 0.44, x - w * 0.86, y - wall - roof * 0.06);
      ctx.lineTo(x - w, y - wall + roof * 0.06);
      ctx.closePath(); ctx.fill();

      // 煙突
      if (o.chimney && s > 0.5) {
        ctx.fillStyle = mixHex('#8d6b52', PAL.haze, f);
        ctx.fillRect(x + w * 0.4, y - wall - roof * 0.72, w * 0.18, roof * 0.42);
      }
    }

    /* 教会。集落にひとつ混ぜると、遠景に高さのアクセントが生まれる */
    steeple(x, y, s, f, o) {
      const ctx = this.ctx;
      const w = 1.0 * s, wall = 5.2 * s, spire = 3.4 * s;
      ctx.fillStyle = mixHex('#e2e8ee', PAL.haze, f);
      ctx.fillRect(x - w * 0.5, y - wall, w, wall);
      ctx.fillStyle = mixHex('#6b7f9c', PAL.haze, f);
      ctx.beginPath();
      ctx.moveTo(x, y - wall - spire);
      ctx.lineTo(x + w * 0.62, y - wall);
      ctx.lineTo(x - w * 0.62, y - wall);
      ctx.closePath(); ctx.fill();
      if (s > 0.8) {
        ctx.fillStyle = mixHex('#3f5068', PAL.haze, f);
        ctx.fillRect(x - w * 0.18, y - wall * 0.86, w * 0.36, wall * 0.2);
      }
    }

    bush(x, y, s, f) {
      const ctx = this.ctx;
      const r = 1.1 * s;
      ctx.fillStyle = mixHex(PAL.pine, PAL.haze, f);
      ellipse(ctx, x, y - r * 0.5, r, r * 0.6); ctx.fill();
      ctx.fillStyle = rgba(PAL.snow, (1 - f) * 0.85);
      ellipse(ctx, x, y - r * 0.85, r * 0.8, r * 0.3); ctx.fill();
    }

    rock(x, y, s, f, o) {
      const ctx = this.ctx;
      const r = 1.25 * s;
      this.castShadow(x, y, r * 1.1, f, r * 0.3);
      ctx.fillStyle = mixHex(PAL.rockDark, PAL.haze, f);
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x - r * 0.62, y - r * 0.95);
      ctx.lineTo(x + r * 0.1, y - r * 1.15);
      ctx.lineTo(x + r * 0.85, y - r * 0.6);
      ctx.lineTo(x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = mixHex(PAL.rock, PAL.haze, f);
      ctx.beginPath();
      ctx.moveTo(x - r * 0.62, y - r * 0.95);
      ctx.lineTo(x + r * 0.1, y - r * 1.15);
      ctx.lineTo(x + r * 0.2, y - r * 0.5);
      ctx.lineTo(x - r * 0.4, y - r * 0.35);
      ctx.closePath();
      ctx.fill();
      // 冠雪
      ctx.fillStyle = rgba(PAL.snow, (1 - f) * 0.95);
      ctx.beginPath();
      ctx.moveTo(x - r * 0.66, y - r * 0.92);
      ctx.lineTo(x + r * 0.1, y - r * 1.15);
      ctx.lineTo(x + r * 0.86, y - r * 0.58);
      ctx.lineTo(x + r * 0.5, y - r * 0.62);
      ctx.lineTo(x - r * 0.1, y - r * 0.86);
      ctx.closePath();
      ctx.fill();
    }

    mogul(x, y, s, f) {
      // 雪面のうねり。輪郭を出さず、陰影だけでふくらみを感じさせる
      const ctx = this.ctx;
      const r = 1.8 * s;
      const a = (1 - f) * 0.5;
      ctx.fillStyle = `rgba(196,214,236,${a * 0.5})`;
      ellipse(ctx, x, y, r, r * 0.24); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${a * 0.55})`;
      ellipse(ctx, x, y - r * 0.07, r * 0.78, r * 0.16); ctx.fill();
    }

    snowman(x, y, s, f) {
      const ctx = this.ctx;
      const r = 0.62 * s;
      this.castShadow(x, y, r * 3.0, f, r * 0.42);
      const body = mixHex('#ffffff', PAL.haze, f);
      const shade = mixHex(PAL.snowShade, PAL.haze, f);
      ctx.fillStyle = shade; ellipse(ctx, x, y - r, r * 1.25, r * 1.15); ctx.fill();
      ctx.fillStyle = body; ellipse(ctx, x - r * 0.2, y - r * 1.1, r * 1.0, r * 0.95); ctx.fill();
      ctx.fillStyle = body; ellipse(ctx, x, y - r * 2.5, r * 0.85, r * 0.85); ctx.fill();
      // ニンジンの鼻と炭の目
      ctx.fillStyle = mixHex('#f08b3a', PAL.haze, f);
      ctx.beginPath();
      ctx.moveTo(x, y - r * 2.5);
      ctx.lineTo(x + r * 1.1, y - r * 2.42);
      ctx.lineTo(x, y - r * 2.28);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = mixHex('#3a3a44', PAL.haze, f);
      ellipse(ctx, x - r * 0.32, y - r * 2.72, r * 0.13, r * 0.15); ctx.fill();
      ellipse(ctx, x + r * 0.3, y - r * 2.72, r * 0.13, r * 0.15); ctx.fill();
      // 木の枝の腕
      ctx.strokeStyle = mixHex(PAL.trunk, PAL.haze, f);
      ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.beginPath();
      ctx.moveTo(x - r * 0.9, y - r * 1.4); ctx.lineTo(x - r * 2.0, y - r * 2.0);
      ctx.moveTo(x + r * 0.9, y - r * 1.4); ctx.lineTo(x + r * 2.0, y - r * 1.9);
      ctx.stroke();
    }

    pole(x, y, s, f, o) {
      const ctx = this.ctx;
      // 真横まで来た旗は画面を覆うだけなので、手前で消えるようにする
      const near = clamp((this.focal / s - 2.5) / 3.5, 0, 1);
      if (near <= 0.02) return;
      ctx.save();
      ctx.globalAlpha *= near;
      const h = 1.7 * s;
      ctx.strokeStyle = mixHex('#4c5462', PAL.haze, f);
      ctx.lineWidth = Math.max(1, 0.07 * s);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
      ctx.fillStyle = mixHex(o.side < 0 ? PAL.red : '#3f8de0', PAL.haze, f);
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + o.side * 0.75 * s, y - h * 0.86);
      ctx.lineTo(x, y - h * 0.66);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    gate(x, y, s, f, o) {
      const ctx = this.ctx;
      const near = clamp((this.focal / s - 2.5) / 3.5, 0, 1);
      if (near <= 0.02) return;
      ctx.save();
      ctx.globalAlpha *= near;
      const h = 2.0 * s, w = o.w * s;
      const base = o.scored ? '#7fc98a' : '#e8573f';
      const col = mixHex(base, PAL.haze, f);
      for (const side of [-1, 1]) {
        const px = x + side * w;
        ctx.strokeStyle = mixHex('#39424f', PAL.haze, f);
        ctx.lineWidth = Math.max(1.2, 0.09 * s);
        ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y - h); ctx.stroke();
        // 旗はポールから内向きに垂れる
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(px, y - h);
        ctx.quadraticCurveTo(px - side * w * 0.34, y - h * 0.94, px - side * w * 0.62, y - h * 0.72);
        ctx.quadraticCurveTo(px - side * w * 0.3, y - h * 0.76, px, y - h * 0.66);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = mixHex('#ffffff', PAL.haze, f);
        ellipse(ctx, px, y - h, 0.13 * s, 0.13 * s); ctx.fill();
      }
      ctx.restore();
    }

    ramp(x, y, s, f) {
      const ctx = this.ctx;
      const w = 2.6 * s, h = 1.5 * s, d = 3.2 * s;
      ctx.fillStyle = mixHex(PAL.snowShade, PAL.haze, f);
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.quadraticCurveTo(x - w * 0.6, y - h * 0.5, x - w * 0.55, y - h);
      ctx.lineTo(x + w * 0.55, y - h);
      ctx.quadraticCurveTo(x + w * 0.6, y - h * 0.5, x + w, y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = mixHex('#ffffff', PAL.haze, f);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.55, y - h);
      ctx.lineTo(x + w * 0.55, y - h);
      ctx.lineTo(x + w * 0.35, y - h - d * 0.12);
      ctx.lineTo(x - w * 0.35, y - h - d * 0.12);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(PAL.red, (1 - f) * 0.8);
      ctx.fillRect(x - w * 0.55, y - h - d * 0.02, w * 1.1, Math.max(1, 0.08 * s));
    }

    icePatch(x, y, s, f) {
      const ctx = this.ctx;
      const r = 2.4 * s;
      ctx.fillStyle = rgba(PAL.ice, (1 - f) * 0.75);
      ellipse(ctx, x, y, r, r * 0.3); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', (1 - f) * 0.7);
      ctx.lineWidth = Math.max(1, 0.05 * s);
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y - r * 0.06);
      ctx.lineTo(x + r * 0.2, y + r * 0.05);
      ctx.moveTo(x - r * 0.1, y + r * 0.12);
      ctx.lineTo(x + r * 0.6, y - r * 0.04);
      ctx.stroke();
    }

    bell(x, y, s, f, t, o) {
      const ctx = this.ctx;
      const r = 0.42 * s;
      const bob = Math.sin(t * 3 + o.z * 0.3) * r * 0.25;
      const yy = y + bob;
      ctx.fillStyle = rgba(PAL.gold, (1 - f) * 0.18);
      ellipse(ctx, x, yy, r * 1.5, r * 1.5); ctx.fill();
      // 鈴（金色の球）
      ctx.fillStyle = mixHex(PAL.goldDark, PAL.haze, f);
      ellipse(ctx, x, yy, r, r); ctx.fill();
      ctx.fillStyle = mixHex(PAL.gold, PAL.haze, f);
      ellipse(ctx, x - r * 0.15, yy - r * 0.15, r * 0.78, r * 0.78); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', (1 - f) * 0.9);
      ellipse(ctx, x - r * 0.32, yy - r * 0.36, r * 0.24, r * 0.18, -0.5); ctx.fill();
      ctx.fillStyle = mixHex('#b8791d', PAL.haze, f);
      ctx.fillRect(x - r * 0.62, yy + r * 0.06, r * 1.24, Math.max(1, r * 0.16));
    }

    tower(x, y, s, f, o) {
      const ctx = this.ctx;
      const TOWER_H = 11, SPAN = 150;   // 鉄塔の高さと支間（world.js の間隔と合わせる）
      const h = TOWER_H * s, w = 0.9 * s;
      const armY = y - h * 0.94;

      // ケーブルは「次の鉄塔の頂部」へ向けて張る。両端を実際に投影するので
      // 遠近に沿って正しく奥へ伸びる（横一直線に見えてしまうのを避ける）
      const z2 = o.z + SPAN;
      const p2 = this.project(SB.centerX(z2) + o.x, SB.terrainY(z2) + TOWER_H * 0.94, z2);
      if (p2 && p2.y > -this.H) {
        ctx.lineWidth = Math.max(1, 0.09 * s);
        ctx.strokeStyle = mixHex('#4a525e', PAL.haze, Math.min(0.92, f + 0.12));
        const w2 = 0.9 * p2.s;
        for (const side of [-1, 1]) {
          const ax = x + side * w * 1.9, bx = p2.x + side * w2 * 1.9;
          ctx.beginPath();
          ctx.moveTo(ax, armY);
          ctx.quadraticCurveTo((ax + bx) / 2, (armY + p2.y) / 2 + 3.2 * (s + p2.s) * 0.5, bx, p2.y);
          ctx.stroke();
        }
        // ゴンドラ（支間の途中に1台）
        const t = ((this.cam.z * 0.06 + o.z * 0.31) % 1 + 1) % 1;
        const gx = x + w * 1.9 + (p2.x + w2 * 1.9 - (x + w * 1.9)) * t;
        const gy = armY + (p2.y - armY) * t + 3.2 * lerp(s, p2.s, t) * (1 - Math.abs(t - 0.5) * 2) * 0.9;
        const gs = lerp(s, p2.s, t);
        ctx.strokeStyle = mixHex('#3f4650', PAL.haze, f);
        ctx.lineWidth = Math.max(1, 0.08 * gs);
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + 0.9 * gs); ctx.stroke();
        ctx.fillStyle = mixHex(PAL.red, PAL.haze, f);
        roundRect(ctx, gx - 0.6 * gs, gy + 0.8 * gs, 1.2 * gs, 1.5 * gs, 0.35 * gs);
        ctx.fill();
        ctx.fillStyle = mixHex('#cfe3f5', PAL.haze, f);
        roundRect(ctx, gx - 0.42 * gs, gy + 1.0 * gs, 0.84 * gs, 0.7 * gs, 0.2 * gs);
        ctx.fill();
      }

      const col = mixHex(PAL.steel, PAL.haze, f);
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, 0.24 * s);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();           // 支柱
      ctx.lineWidth = Math.max(1, 0.16 * s);
      ctx.beginPath();                                                                  // 腕木
      ctx.moveTo(x - w * 2.2, armY); ctx.lineTo(x + w * 2.2, armY);
      ctx.moveTo(x - w * 1.5, y - h * 0.72); ctx.lineTo(x, y - h * 0.86);
      ctx.moveTo(x + w * 1.5, y - h * 0.72); ctx.lineTo(x, y - h * 0.86);
      ctx.stroke();
      for (const side of [-1, 1]) {                                                     // 滑車
        ctx.fillStyle = col;
        ellipse(ctx, x + side * w * 1.9, armY + 0.25 * s, 0.3 * s, 0.22 * s); ctx.fill();
      }
    }

    /* ボードが刻んだ跡。カメラと自機の間の雪面に残る */
    drawTrail(pts) {
      if (pts.length < 2) return;
      const ctx = this.ctx;
      const proj = [];
      for (const p of pts) {
        const pr = this.project(SB.centerX(p.z) + p.x, SB.terrainY(p.z), p.z);
        if (pr) proj.push({ x: pr.x, y: pr.y, w: p.w * pr.s });
      }
      if (proj.length < 2) return;
      ctx.beginPath();
      for (let i = proj.length - 1; i >= 0; i--) {
        const q = proj[i];
        i === proj.length - 1 ? ctx.moveTo(q.x - q.w, q.y) : ctx.lineTo(q.x - q.w, q.y);
      }
      for (let i = 0; i < proj.length; i++) ctx.lineTo(proj[i].x + proj[i].w, proj[i].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(191,211,236,0.55)';
      ctx.fill();
      // 削れた雪の縁を明るく
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    /* --- 雪と速度演出 --------------------------------------------------- */
    drawSnowfall(flakes, speedRatio) {
      const { ctx, W, H } = this;
      const unit = Math.min(W, H) / 400;
      for (const p of flakes) {
        // 手前の粒ほど大きく、輪郭をぼかして薄く。奥行きが出る
        const r = p.r * (0.45 + p.d * 1.9) * unit;
        const px = p.x * W, py = p.y * H;
        ctx.globalAlpha = p.d > 0.86 ? 0.16 : 0.34 + p.d * 0.42;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * (1 + speedRatio * p.d * 2.2), 0, 0, TAU);
        ctx.fill();
        if (p.d > 0.86) {                       // 大粒にだけ、ごく淡いにじみ
          ctx.globalAlpha = 0.06;
          ctx.beginPath();
          ctx.ellipse(px, py, r * 1.9, r * 1.9, 0, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    drawSpeedLines(amount) {
      if (amount <= 0.01) return;
      const { ctx, W, H } = this;
      const cxp = W * 0.5, cyp = this.horizon;
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.28 * amount})`;
      ctx.lineWidth = Math.max(1, H * 0.003);
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + (i % 3) * 0.2;
        const r0 = Math.max(W, H) * (0.34 + (i % 5) * 0.03);
        const r1 = r0 + Math.max(W, H) * 0.22 * amount;
        ctx.beginPath();
        ctx.moveTo(cxp + Math.cos(a) * r0, cyp + Math.sin(a) * r0 * 1.1);
        ctx.lineTo(cxp + Math.cos(a) * r1, cyp + Math.sin(a) * r1 * 1.1);
        ctx.stroke();
      }
      ctx.restore();
    }

    buildVignette() {
      const { W, H, dpr } = this;
      this.vigKey = `${W}x${H}@${dpr}`;
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
      const c = cv.getContext('2d');
      c.scale(dpr, dpr);
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(10,24,48,1)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      this.vignette = cv;
    }

    drawVignette(speedRatio, boost) {
      const { ctx, W, H } = this;
      if (this.vigKey !== `${W}x${H}@${this.dpr}` || !this.vignette) this.buildVignette();
      ctx.globalAlpha = 0.20 + speedRatio * 0.16;
      ctx.drawImage(this.vignette, 0, 0, W, H);
      ctx.globalAlpha = 1;
      if (boost > 0) {
        const b = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30, W / 2, H / 2, Math.max(W, H) * 0.7);
        b.addColorStop(0, 'rgba(120,200,255,0)');
        b.addColorStop(1, `rgba(120,200,255,${0.22 * boost})`);
        ctx.fillStyle = b;
        ctx.fillRect(0, 0, W, H);
      }
    }

    flash(alpha, color) {
      if (alpha <= 0) return;
      this.ctx.fillStyle = rgba(color || '#ffffff', alpha);
      this.ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  SB.PAL = PAL;
  SB.Renderer = Renderer;
})(window);
