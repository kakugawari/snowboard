/* ぬいぐるみライダー ---------------------------------------------------------
   画像は使わず、すべて円と角丸で組む。単位は「メートル」で書き、描画時に
   u（1mあたりのピクセル数）を掛ける。原点は板の接地点。                    */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});
  const { clamp, lerp, roundRect, ellipse, rgba, TAU } = SB.util;

  const FUR = '#e6bd91';
  const FUR_D = '#cfa176';
  const BELLY = '#f6e7d2';
  const MUZZLE = '#f8ecd9';
  const EAR_IN = '#f0aeae';
  const HAT = '#6fcbbd';
  const HAT_D = '#4fae9f';
  const SCARF = '#e2483f';
  const SCARF_D = '#b8352d';
  const BOARD = '#4a7ce0';
  const BOARD_D = '#2f57ac';
  const BOOT = '#3b4150';
  const NOSE = '#5b4034';

  function capsule(ctx, x1, y1, x2, y2, r, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /* st: { lean, spin, airT, tuck, crash, t, blink, squash, speedRatio } */
  function drawPlushie(ctx, px, py, u, st) {
    const lean = st.lean || 0;
    const spin = st.spin || 0;
    const air = st.air ? 1 : 0;
    const tuck = st.tuck || 0;
    const crash = st.crash || 0;
    const t = st.t || 0;
    const sq = st.squash || 1;   // 1 = 通常、<1 で潰れる

    /* 向きの考え方。
       進行方向を向いて滑るのが自然なので、既定は「背中を見せる」= 角度 π。
       ジャンプ中や転倒時だけ look が 1 に近づき、頭だけがこちらを向く。
       胴と頭で角度を分けているので「肩越しに振り返る」形になる。       */
    const look = clamp(st.look || 0, 0, 1);
    const bodyAngle = spin + Math.PI;
    const headAngle = spin + Math.PI * (1 - look);

    const cs = Math.cos(bodyAngle);
    const facing = cs >= 0 ? 1 : -1;
    const flat = Math.max(Math.abs(cs), 0.16);

    const hcs = Math.cos(headAngle);
    const headFacing = hcs >= 0 ? 1 : -1;
    const headFlat = Math.max(Math.abs(hcs), 0.22);
    // 胴に掛かっている横方向の変形を、頭のぶんだけ差し替えるための係数
    const headFix = (headFlat * headFacing) / (flat * facing);

    ctx.save();
    ctx.translate(px, py);

    // 接地影（空中では薄く小さく）
    if (!st.hideShadow) {
      const shA = st.air ? 0.16 : 0.34;
      const shS = st.air ? 0.7 : 1;
      ctx.fillStyle = `rgba(90,120,160,${shA})`;
      ellipse(ctx, 0, st.shadowY || 0, 0.95 * u * shS, 0.20 * u * shS);
      ctx.fill();
    }

    ctx.rotate(crash ? st.crashRot || 0 : lean * 0.45);
    ctx.scale(flat * u, u * sq);   // 以降はメートル単位で描ける
    ctx.scale(facing, 1);

    const bob = Math.sin(t * 9) * 0.012 * (1 - air) * (st.speedRatio || 0);
    const crouch = lerp(0, 0.16, tuck) + air * 0.05;

    /* --- スノーボード（後ろから見た形） --- */
    ctx.save();
    ctx.rotate(-lean * 0.25);
    const bw = 0.44, bh = 0.10;
    ctx.fillStyle = BOARD_D;
    roundRect(ctx, -bw, -bh * 0.4, bw * 2, bh * 1.5, bh * 0.7); ctx.fill();
    ctx.fillStyle = BOARD;
    roundRect(ctx, -bw * 0.96, -bh * 0.9, bw * 1.92, bh * 1.3, bh * 0.65); ctx.fill();
    // トップシートの模様（雪の結晶っぽい線）
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    ctx.moveTo(-bw * 0.5, -bh * 0.3); ctx.lineTo(bw * 0.5, -bh * 0.3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ellipse(ctx, 0, -bh * 0.3, 0.05, 0.035); ctx.fill();
    ctx.restore();

    const yBoard = -0.10;

    /* --- 脚とブーツ --- */
    for (const side of [-1, 1]) {
      const bx = side * 0.17;
      capsule(ctx, bx, yBoard - 0.30 + crouch, bx * 0.9, yBoard - 0.02, 0.075, FUR_D);
      ctx.fillStyle = BOOT;
      roundRect(ctx, bx - 0.10, yBoard - 0.14, 0.20, 0.14, 0.05); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(bx - 0.09, yBoard - 0.10, 0.18, 0.022);
    }

    const yBody = yBoard - 0.34 + crouch + bob;

    /* --- 奥側の腕（体の後ろに描く） --- */
    const armSwing = air ? -0.9 : lerp(0.25, -0.15, tuck) + Math.sin(t * 4) * 0.06;
    const armLen = 0.34;
    const drawArm = (side, back) => {
      const sx = side * 0.20, sy = yBody - 0.10;
      const a = armSwing + side * (air ? 0.5 : 0.25) - lean * side * 0.5;
      const ex = sx + side * Math.cos(a) * armLen;
      const ey = sy - Math.sin(a) * armLen;
      capsule(ctx, sx, sy, ex, ey, 0.078, back ? FUR_D : FUR);
      ctx.fillStyle = back ? FUR_D : FUR;
      ellipse(ctx, ex, ey, 0.085, 0.085); ctx.fill();
      // てのひらの色違い（ミトン風）
      ctx.fillStyle = back ? '#c96f68' : SCARF;
      ellipse(ctx, ex, ey, 0.062, 0.062); ctx.fill();
    };
    drawArm(-1, true);

    /* --- 胴体 --- */
    ctx.fillStyle = FUR;
    ellipse(ctx, 0, yBody, 0.27, 0.26); ctx.fill();
    if (facing > 0) {
      ctx.fillStyle = BELLY;
      ellipse(ctx, 0, yBody + 0.03, 0.18, 0.17); ctx.fill();
    } else {
      // 背中: 縫い目とぬいぐるみのタグ
      ctx.strokeStyle = rgba(FUR_D, 0.9);
      ctx.lineWidth = 0.018;
      ctx.setLineDash([0.035, 0.03]);
      ctx.beginPath();
      ctx.moveTo(0, yBody - 0.24); ctx.lineTo(0, yBody + 0.22);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fdf6ea';
      roundRect(ctx, 0.14, yBody - 0.02, 0.10, 0.13, 0.02); ctx.fill();
    }

    /* --- マフラー --- */
    const wind = 0.10 + (st.speedRatio || 0) * 0.55;
    ctx.fillStyle = SCARF;
    ellipse(ctx, 0, yBody - 0.22, 0.20, 0.085); ctx.fill();
    ctx.fillStyle = SCARF_D;
    ctx.beginPath();
    const tailBase = yBody - 0.22;
    ctx.moveTo(-0.06, tailBase - 0.03);
    ctx.quadraticCurveTo(
      -0.34 - wind * 0.7, tailBase - 0.10 + Math.sin(t * 7) * 0.06,
      -0.55 - wind, tailBase + 0.04 + Math.sin(t * 7 + 1) * 0.10
    );
    ctx.quadraticCurveTo(-0.36 - wind * 0.7, tailBase + 0.10, -0.05, tailBase + 0.08);
    ctx.closePath(); ctx.fill();
    // マフラーの縞
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(-0.30 - wind * 0.5, tailBase - 0.03);
    ctx.lineTo(-0.33 - wind * 0.5, tailBase + 0.09);
    ctx.stroke();

    /* --- 頭 --- */
    const yHead = yBody - 0.40;
    const headTilt = lean * 0.18 + (air ? Math.sin(t * 5) * 0.05 : 0) + look * 0.10;
    ctx.save();
    ctx.translate(look * 0.05, yHead);      // 振り返るぶん、わずかに肩へ寄せる
    ctx.rotate(headTilt);
    ctx.scale(headFix, 1);                  // ここから先だけ頭の向きになる

    // 耳
    for (const side of [-1, 1]) {
      ctx.fillStyle = FUR_D;
      ellipse(ctx, side * 0.235, -0.20, 0.105, 0.105); ctx.fill();
      if (headFacing > 0) {
        ctx.fillStyle = EAR_IN;
        ellipse(ctx, side * 0.245, -0.20, 0.055, 0.055); ctx.fill();
      }
    }
    // 顔の輪郭
    ctx.fillStyle = FUR;
    ellipse(ctx, 0, 0, 0.30, 0.285); ctx.fill();

    if (headFacing > 0) {
      // マズル
      ctx.fillStyle = MUZZLE;
      ellipse(ctx, 0, 0.10, 0.16, 0.115); ctx.fill();
      // 鼻と口
      ctx.fillStyle = NOSE;
      ctx.beginPath();
      ctx.moveTo(-0.045, 0.045); ctx.lineTo(0.045, 0.045); ctx.lineTo(0, 0.10);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = NOSE;
      ctx.lineWidth = 0.016;
      ctx.beginPath();
      ctx.moveTo(0, 0.10); ctx.lineTo(0, 0.135);
      ctx.moveTo(0, 0.135); ctx.quadraticCurveTo(-0.05, 0.175, -0.085, 0.13);
      ctx.moveTo(0, 0.135); ctx.quadraticCurveTo(0.05, 0.175, 0.085, 0.13);
      ctx.stroke();
      // 目（まばたき／転倒時は ×）
      const open = crash ? 0 : (st.blink === undefined ? 1 : st.blink);
      for (const side of [-1, 1]) {
        const ex = side * 0.125, ey = -0.02;
        if (crash) {
          ctx.strokeStyle = NOSE; ctx.lineWidth = 0.024;
          ctx.beginPath();
          ctx.moveTo(ex - 0.04, ey - 0.04); ctx.lineTo(ex + 0.04, ey + 0.04);
          ctx.moveTo(ex + 0.04, ey - 0.04); ctx.lineTo(ex - 0.04, ey + 0.04);
          ctx.stroke();
        } else if (open > 0.15) {
          ctx.fillStyle = NOSE;
          ellipse(ctx, ex, ey, 0.045, 0.052 * open); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ellipse(ctx, ex - 0.016, ey - 0.020 * open, 0.017, 0.017 * open); ctx.fill();
        } else {
          ctx.strokeStyle = NOSE; ctx.lineWidth = 0.022; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(ex - 0.045, ey); ctx.quadraticCurveTo(ex, ey + 0.03, ex + 0.045, ey);
          ctx.stroke();
        }
      }
      // ほっぺ
      ctx.fillStyle = 'rgba(240,150,150,0.55)';
      ellipse(ctx, -0.20, 0.07, 0.055, 0.038); ctx.fill();
      ellipse(ctx, 0.20, 0.07, 0.055, 0.038); ctx.fill();
    } else {
      // 後頭部の縫い目
      ctx.strokeStyle = rgba(FUR_D, 0.85);
      ctx.lineWidth = 0.018;
      ctx.setLineDash([0.035, 0.03]);
      ctx.beginPath();
      ctx.moveTo(0, -0.26); ctx.lineTo(0, 0.24);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ニット帽
    ctx.fillStyle = HAT;
    ctx.beginPath();
    ctx.arc(0, -0.03, 0.305, Math.PI * 1.06, Math.PI * 1.94);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = HAT_D;
    roundRect(ctx, -0.305, -0.135, 0.61, 0.10, 0.05); ctx.fill();
    // ぼんぼり
    const pomX = -0.10 - Math.sin(t * 6) * 0.02;
    ctx.fillStyle = '#fdf6ea';
    ellipse(ctx, pomX, -0.36, 0.085, 0.085); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ellipse(ctx, pomX + 0.02, -0.34, 0.06, 0.06); ctx.fill();
    // ゴーグル。額に上げている。後ろからはバンドだけが見える
    ctx.fillStyle = 'rgba(40,48,64,0.9)';
    roundRect(ctx, -0.235, -0.16, 0.47, 0.10, 0.045); ctx.fill();
    if (headFacing > 0) {
      ctx.fillStyle = 'rgba(150,215,235,0.9)';
      roundRect(ctx, -0.205, -0.145, 0.41, 0.062, 0.03); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      roundRect(ctx, -0.17, -0.138, 0.11, 0.045, 0.02); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(28,34,46,0.9)';
      roundRect(ctx, -0.235, -0.142, 0.47, 0.03, 0.015); ctx.fill();
    }

    ctx.restore();

    /* --- 手前の腕 --- */
    drawArm(1, false);

    /* --- 転倒中の星 --- */
    if (crash) {
      ctx.fillStyle = '#ffd25e';
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + (i / 3) * TAU;
        const sxp = Math.cos(a) * 0.34, syp = yHead - 0.42 + Math.sin(a) * 0.10;
        star(ctx, sxp, syp, 0.06);
      }
    }

    ctx.restore();
  }

  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  SB.drawPlushie = drawPlushie;
  SB.drawStar = star;
})(window);
