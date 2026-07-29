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
    skyTop: '#3d6fb5',
    skyMid: '#86b3e0',
    skyLow: '#cfe0f2',
    haze: '#dfe9f5',
    sun: '#fff6d8',
    snow: '#f4f8fd',
    snowShade: '#dce8f6',
    piste: '#ffffff',
    pisteAlt: '#eaf2fc',
    powder: '#e4eefb',
    pine: '#2f5a45',
    pineDark: '#22412f',
    trunk: '#4a3728',
    rock: '#7d7d86',
    rockDark: '#5b5b64',
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
      this.focal = this.H * 0.78 * cam.fov;
      this.horizon = this.H * 0.44 + cam.pitch * this.H + cam.shakeY;
      this.cx = this.W * 0.5 + cam.shakeX;
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

      const g = ctx.createLinearGradient(0, 0, 0, Math.max(hz, 10));
      g.addColorStop(0, PAL.skyTop);
      g.addColorStop(0.55, PAL.skyMid);
      g.addColorStop(1, PAL.skyLow);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, Math.max(hz, 0));
      if (hz < 0) { ctx.fillStyle = PAL.skyLow; ctx.fillRect(0, 0, W, H); }

      // 太陽とその光暈
      const sx = W * 0.74 - this.cam.x * 1.2;
      const sy = hz - H * 0.30;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.42);
      glow.addColorStop(0, 'rgba(255,250,225,0.95)');
      glow.addColorStop(0.16, 'rgba(255,244,205,0.45)');
      glow.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, Math.max(hz, 0));
      ctx.fillStyle = PAL.sun;
      ellipse(ctx, sx, sy, H * 0.035, H * 0.035); ctx.fill();

      // 雲
      for (const c of world.clouds) {
        c.x += c.spd * 0.016;
        if (c.x > 1.3) c.x = -0.3;
        const cxp = c.x * W * 1.4 - W * 0.2 - this.cam.x * 2.4;
        const cyp = c.y * hz;
        this.cloud(cxp, cyp, c.s * H * 0.05, c.puffs, c.seed);
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

    cloud(x, y, r, puffs, seed) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      for (let i = 0; i < puffs; i++) {
        const a = seed + i * 1.7;
        const px = x + (i - puffs / 2) * r * 0.85;
        const py = y + Math.sin(a) * r * 0.18;
        ellipse(ctx, px, py, r * (0.7 + (Math.sin(a * 3) + 1) * 0.3), r * 0.5);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ellipse(ctx, x, y + r * 0.28, r * puffs * 0.42, r * 0.34);
      ctx.fill();
    }

    drawRanges(world) {
      const { ctx, W, H } = this;
      const hz = this.horizon;
      for (let li = 0; li < world.ranges.length; li++) {
        const R = world.ranges[li];
        const n = R.pts.length;
        const spanW = W * 2.4;
        const off = -this.cam.x * (0.6 + R.depth * 2.2) - (this.cam.z * 0.02 * R.depth);
        const x0 = ((off % spanW) + spanW) % spanW - spanW * 0.5;
        const base = hz + H * 0.012 * (1 - R.depth);
        const peak = H * R.height;
        const fogAmt = 0.12 + (1 - R.depth) * 0.30;

        // 稜線を左右に繰り返して、横に流れても途切れないようにする
        ctx.beginPath();
        ctx.moveTo(-W, base + 10);
        for (let rep = -1; rep <= 1; rep++) {
          for (let i = 0; i < n; i++) {
            ctx.lineTo(x0 - W * 0.7 + rep * spanW + (i / (n - 1)) * spanW, base - R.pts[i] * peak);
          }
        }
        ctx.lineTo(W * 2, base + 10);
        ctx.closePath();
        ctx.fillStyle = mixHex(R.color, PAL.haze, fogAmt);
        ctx.fill();

        // 雪線から上を白く。稜線でクリップするので峰の形に沿う
        ctx.save();
        ctx.clip();
        const snowY = base - peak * R.snowLine;
        const g = ctx.createLinearGradient(0, snowY - peak * 0.55, 0, snowY + peak * 0.22);
        g.addColorStop(0, mixHex(R.snow, PAL.haze, fogAmt * 0.6));
        g.addColorStop(0.55, mixHex(R.snow, PAL.haze, fogAmt * 0.75));
        g.addColorStop(1, mixHex(R.color, PAL.haze, fogAmt));
        ctx.fillStyle = g;
        ctx.fillRect(-W, snowY - peak, W * 4, peak * 1.3);
        // 麓ほど霞ませて、山を空気の層の向こうに置く
        const vg = ctx.createLinearGradient(0, base - peak * 0.55, 0, base + 4);
        vg.addColorStop(0, rgba(PAL.haze, 0));
        vg.addColorStop(1, rgba(PAL.haze, 0.85));
        ctx.fillStyle = vg;
        ctx.fillRect(-W, base - peak * 0.55, W * 4, peak * 0.55 + 6);
        ctx.restore();
      }

      // 谷底の霞
      const hazeG = ctx.createLinearGradient(0, hz - H * 0.10, 0, hz + H * 0.02);
      hazeG.addColorStop(0, rgba(PAL.haze, 0));
      hazeG.addColorStop(1, rgba(PAL.haze, 0.95));
      ctx.fillStyle = hazeG;
      ctx.fillRect(0, hz - H * 0.10, W, H * 0.12);
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
      return {
        z,
        x: this.cx + (cxw - this.cam.x) * s,
        y: this.horizon + (this.cam.y - SB.terrainY(z)) * s,
        w: half * s,
        s, dz,
        fog: this.fog(dz),
      };
    }

    groundQuad(n, f, idx) {
      const ctx = this.ctx, W = this.W;
      if (f.y >= n.y + 0.4) return;   // 丘の裏側（見えない面）は捨てる

      /* 縞の強さは距離で決める。手前は縞が画面上で巨大になり縞模様に
         見えてしまうので薄く、中距離だけはっきりさせて速度感を出す。 */
      const stripe = (idx % 2) ? clamp((n.dz - 4) / 16, 0, 1) : 0;

      // 一面の雪原（ゲレンデの塗りに完全に隠れる手前の区画では省略する）
      const m = W * 0.07;   // カメラロールで少し広く描いている分の余白
      const covered = n.x - n.w < -m && n.x + n.w > W + m
                   && f.x - f.w < -m && f.x + f.w > W + m;
      if (!covered) {
      const wide = 120;
      ctx.fillStyle = mixHex(mixHex(PAL.snow, PAL.snowShade, stripe * 0.55), PAL.haze, n.fog);
      ctx.beginPath();
      ctx.moveTo(n.x - wide * n.s, n.y);
      ctx.lineTo(f.x - wide * f.s, f.y);
      ctx.lineTo(f.x + wide * f.s, f.y);
      ctx.lineTo(n.x + wide * n.s, n.y);
      ctx.closePath();
      ctx.fill();
      }

      // 圧雪バーン（横縞が流れることで速度が読める）
      ctx.fillStyle = mixHex(mixHex(PAL.piste, PAL.pisteAlt, stripe), PAL.haze, n.fog);
      ctx.beginPath();
      ctx.moveTo(n.x - n.w, n.y);
      ctx.lineTo(f.x - f.w, f.y);
      ctx.lineTo(f.x + f.w, f.y);
      ctx.lineTo(n.x + n.w, n.y);
      ctx.closePath();
      ctx.fill();

      // 圧雪車の縦筋。手前だけ描けば十分で、遠近感の手掛かりになる
      if (n.dz < 46 && n.s > 1) {
        ctx.strokeStyle = `rgba(198,216,238,${0.5 * (1 - n.fog) * clamp((46 - n.dz) / 26, 0, 1)})`;
        ctx.lineWidth = 1;
        const step = C.PISTE_HALF / 3;
        for (let k = -2; k <= 2; k++) {
          const o = k * step;
          ctx.beginPath();
          ctx.moveTo(n.x + o * n.s, n.y);
          ctx.lineTo(f.x + o * f.s, f.y);
          ctx.stroke();
        }
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
        ctx.fillStyle = mixHex(PAL.powder, PAL.haze, n.fog);
        const eg = 0.9;
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
      const zBase = SB.terrainY(o.z);
      const cx = SB.centerX(o.z);
      const p = this.project(cx + o.x, zBase + (o.y || 0), o.z);
      if (!p) return;
      const m = 26; // 画面外の余白
      if (p.x < -this.W * 0.6 - m || p.x > this.W * 1.6 + m) return;
      if (p.y < -this.H) return;
      const f = this.fog(p.dz);
      if (f > 0.9) return;
      const s = p.s;

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
      }
    }

    pine(x, y, s, f, o) {
      const ctx = this.ctx;
      const h = 5.0 * s, w = 1.5 * s;
      const sway = Math.sin(o.phase) * 0.02;
      ctx.save();
      ctx.translate(x, y);
      // 影
      ctx.fillStyle = rgba('#8aa4c4', 0.28 * (1 - f));
      ellipse(ctx, 0, 0, w * 0.9, w * 0.28); ctx.fill();

      ctx.fillStyle = mixHex(PAL.trunk, PAL.haze, f);
      ctx.fillRect(-w * 0.09, -h * 0.28, w * 0.18, h * 0.28);

      const dark = mixHex(PAL.pineDark, PAL.haze, f);
      const lit = mixHex(PAL.pine, PAL.haze, f);
      for (let i = 0; i < 4; i++) {
        const t = i / 4;
        const yTop = -h * (0.30 + t * 0.68) - h * 0.16;
        const yBot = -h * (0.24 + t * 0.62);
        const ww = w * (1 - t * 0.62);
        ctx.fillStyle = i % 2 ? dark : lit;
        ctx.beginPath();
        ctx.moveTo(sway * h * (1 + t), yTop);
        ctx.lineTo(-ww, yBot);
        ctx.lineTo(ww, yBot);
        ctx.closePath();
        ctx.fill();
        if (o.snowy) {
          // 枝に積もった雪
          ctx.fillStyle = rgba(PAL.snow, (1 - f) * 0.9);
          ctx.beginPath();
          ctx.moveTo(sway * h * (1 + t), yTop + h * 0.03);
          ctx.lineTo(-ww * 0.72, yBot - h * 0.02);
          ctx.lineTo(-ww * 0.3, yBot - h * 0.05);
          ctx.lineTo(ww * 0.2, yBot - h * 0.01);
          ctx.lineTo(ww * 0.62, yBot - h * 0.03);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
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
      ctx.fillStyle = rgba('#8aa4c4', 0.3 * (1 - f));
      ellipse(ctx, x, y, r * 1.05, r * 0.3); ctx.fill();
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
      ctx.fillStyle = rgba('#8aa4c4', 0.3 * (1 - f));
      ellipse(ctx, x, y, r * 1.5, r * 0.4); ctx.fill();
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
    }

    gate(x, y, s, f, o) {
      const ctx = this.ctx;
      const h = 2.0 * s, w = o.w * s;
      const col = mixHex(o.scored ? '#8fd18a' : '#ff9f43', PAL.haze, f);
      for (const side of [-1, 1]) {
        const px = x + side * w;
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.2, 0.11 * s);
        ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y - h); ctx.stroke();
        ctx.fillStyle = col;
        ellipse(ctx, px, y - h, 0.2 * s, 0.2 * s); ctx.fill();
      }
      // 上部の旗
      ctx.fillStyle = rgba(o.scored ? '#8fd18a' : '#ff9f43', (1 - f) * 0.75);
      ctx.beginPath();
      ctx.moveTo(x - w, y - h);
      ctx.lineTo(x + w, y - h);
      ctx.lineTo(x + w, y - h + 0.42 * s);
      ctx.lineTo(x - w, y - h + 0.42 * s);
      ctx.closePath(); ctx.fill();
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
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const p of flakes) {
        const r = p.r * (0.6 + p.d);
        ctx.globalAlpha = 0.35 + p.d * 0.6;
        ctx.beginPath();
        ctx.ellipse(p.x * W, p.y * H, r, r * (1 + speedRatio * p.d * 2.5), 0, 0, TAU);
        ctx.fill();
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

    drawVignette(speedRatio, boost) {
      const { ctx, W, H } = this;
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(10,24,48,${0.20 + speedRatio * 0.16})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
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
