/* ぬいぐるみライダー ---------------------------------------------------------
   画像は使わず、すべて円と角丸で組む。単位は「メートル」で書き、描画時に
   u（1mあたりのピクセル数）を掛ける。原点は板の接地点。                    */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});
  const { clamp, lerp, roundRect, ellipse, rgba, TAU } = SB.util;

  /* 見た目一式。なかまの色と形は chars.js が持っていて、ここへ渡ってくる。
     ここに残しているのは、渡されなかったときの既定と、なかまには居ない
     特別な相手のぶん。 */
  const SKINS = {
    bear: {
      ears: 'round', face: 'muzzle',
      fur: '#e6bd91', furD: '#cfa176', belly: '#f6e7d2', muzzle: '#f8ecd9',
      earIn: '#f0aeae', hat: '#6fcbbd', hatD: '#4fae9f',
      scarf: '#e2483f', scarfD: '#b8352d', mitten: '#e2483f', mittenD: '#c96f68',
      board: '#4a7ce0', boardD: '#2f57ac', boot: '#3b4150', nose: '#5b4034',
    },
    // ふつうのライバル。なかまの誰とも重ならない色にしてある
    rival: {
      ears: 'round', face: 'muzzle',
      fur: '#d8d3e8', furD: '#bdb6d4', belly: '#f2eff8', muzzle: '#faf7ff',
      earIn: '#e8aecb', hat: '#f2a2bf', hatD: '#d97fa2',
      scarf: '#5cc2b4', scarfD: '#3f9d90', mitten: '#5cc2b4', mittenD: '#4aa79a',
      board: '#f2b23c', boardD: '#c98a1c', boot: '#4a4358', nose: '#5a4a63',
    },
    // とても強い相手。黒と金で、遠くからでも「あ、あいつだ」と分かる
    ace: {
      ears: 'pointy', face: 'muzzle', whiskers: true,
      fur: '#5b5470', furD: '#443f56', belly: '#d9d2ea', muzzle: '#e7e1f4',
      earIn: '#b9a0e0', hat: '#1f2430', hatD: '#12161f',
      scarf: '#ffc93c', scarfD: '#e0a91c', mitten: '#ffc93c', mittenD: '#e0a91c',
      board: '#151a26', boardD: '#05070c', boot: '#1a1f2b', nose: '#2b2536',
    },
  };

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
    const S = st.skin || SKINS.bear;
    // 技のポーズは空中でだけ効かせる。着地したら普通の姿勢へ戻す
    const pose = (st.air && st.pose) ? st.pose : null;
    const poseMix = clamp(st.poseMix === undefined ? (pose ? 1 : 0) : st.poseMix, 0, 1);
    const lift = pose ? (pose.lift || 0) * poseMix : 0;
    const boardTilt = pose ? (pose.tilt || 0) * poseMix : 0;
    const poseRoll = pose ? (pose.roll || 0) * poseMix : 0;
    // 足の開き。1 が普段どおり。広げると大の字、狭めると団子になる
    const legSpread = pose ? lerp(1, pose.legs === undefined ? 1 : pose.legs, poseMix) : 1;

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

    // 技の傾きは体ごと回す。小さく映っていても形で見分けがつくのはここ
    ctx.rotate(crash ? st.crashRot || 0 : lean * 0.45 + poseRoll);
    ctx.scale(flat * u, u * sq);   // 以降はメートル単位で描ける
    ctx.scale(facing, 1);

    const bob = Math.sin(t * 9) * 0.012 * (1 - air) * (st.speedRatio || 0);
    const crouch = lerp(0, 0.16, tuck) + air * 0.05;

    /* --- スノーボード（後ろから見た形） --- */
    ctx.save();
    ctx.translate(0, -lift);
    ctx.rotate(-lean * 0.25 + boardTilt);
    const bw = 0.44, bh = 0.10;
    ctx.fillStyle = S.boardD;
    roundRect(ctx, -bw, -bh * 0.4, bw * 2, bh * 1.5, bh * 0.7); ctx.fill();
    ctx.fillStyle = S.board;
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
    const yFoot = yBoard - lift;      // 板と一緒に足が上がる＝脚が畳まれる

    /* --- 脚とブーツ --- */
    for (const side of [-1, 1]) {
      const bx = side * 0.17 * legSpread;
      capsule(ctx, bx, yBoard - 0.30 + crouch, bx * 0.9, yFoot - 0.02, 0.075, S.furD);
      ctx.fillStyle = S.boot;
      roundRect(ctx, bx - 0.10, yFoot - 0.14, 0.20, 0.14, 0.05); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(bx - 0.09, yFoot - 0.10, 0.18, 0.022);
    }

    const yBody = yBoard - 0.34 + crouch + bob;

    /* --- 奥側の腕（体の後ろに描く） --- */
    const armSwing = air ? -0.9 : lerp(0.25, -0.15, tuck) + Math.sin(t * 4) * 0.06;
    // 技のときは腕をめいっぱい伸ばす。短いままだと角度を変えても違いが出ない
    const armLen = 0.34 + (pose ? 0.12 * poseMix : 0);
    const drawArm = (side, back) => {
      // 技のときは肩を少し外へ出す。真上に上げた手が頭に隠れてしまうため
      const sx = side * (0.20 + (pose ? 0.05 * poseMix : 0)), sy = yBody - 0.10;
      let ex, ey;
      const grab = pose && pose.grab && pose.grab.side === side;
      if (grab) {
        // 板は傾いているので、掴む点も一緒に回してから狙う。
        // そうしないと手が板から浮いて、掴んでいるように見えない
        const ct = Math.cos(boardTilt), stt = Math.sin(boardTilt);
        const gx = pose.grab.x, gy = -0.10;      // 板の上面
        const tx = gx * ct - gy * stt;
        const ty = gx * stt + gy * ct - lift;
        ex = lerp(sx + side * armLen * 0.5, tx, poseMix);
        ey = lerp(sy - armLen * 0.2, ty, poseMix);
      } else {
        const base = armSwing + side * (air ? 0.5 : 0.25) - lean * side * 0.5;
        const target = pose ? pose.arms[side < 0 ? 0 : 1] : base;
        const a = lerp(base, target, pose ? poseMix : 0);
        ex = sx + side * Math.cos(a) * armLen;
        ey = sy - Math.sin(a) * armLen;
      }
      capsule(ctx, sx, sy, ex, ey, 0.078, back ? S.furD : S.fur);
      ctx.fillStyle = back ? S.furD : S.fur;
      ellipse(ctx, ex, ey, 0.085, 0.085); ctx.fill();
      // てのひらの色違い（ミトン風）
      ctx.fillStyle = back ? S.mittenD : S.mitten;
      ellipse(ctx, ex, ey, 0.062, 0.062); ctx.fill();
    };
    // 掴んでいる腕は必ず手前に描く。奥に回ると胴に隠れて何も見えない
    const frontSide = pose && pose.grab ? pose.grab.side : 1;
    drawArm(-frontSide, true);

    /* --- 胴体 --- */
    ctx.fillStyle = S.fur;
    ellipse(ctx, 0, yBody, 0.27, 0.26); ctx.fill();
    if (facing > 0) {
      ctx.fillStyle = S.belly;
      ellipse(ctx, 0, yBody + 0.03, 0.18, 0.17); ctx.fill();
    } else {
      // 背中: 縫い目とぬいぐるみのタグ
      ctx.strokeStyle = rgba(S.furD, 0.9);
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
    ctx.fillStyle = S.scarf;
    ellipse(ctx, 0, yBody - 0.22, 0.20, 0.085); ctx.fill();
    ctx.fillStyle = S.scarfD;
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

    // 耳。種類ごとに形を変える（ここがいちばん見分けのつくところ）
    const earOuter = S.earOuter || S.furD;
    for (const side of [-1, 1]) {
      if (S.ears === 'none') break;
      if (S.ears === 'long') {
        // うさぎ。外へ少し倒した細長い耳
        ctx.save();
        ctx.translate(side * 0.15, -0.20);
        ctx.rotate(side * 0.2);
        ctx.fillStyle = earOuter;
        ellipse(ctx, 0, -0.22, 0.085, 0.26); ctx.fill();
        if (headFacing > 0) {
          ctx.fillStyle = S.earIn;
          ellipse(ctx, 0, -0.22, 0.046, 0.20); ctx.fill();
        }
        ctx.restore();
      } else if (S.ears === 'pointy') {
        // ねこ。三角の耳
        const bx = side * 0.13, tx = side * 0.33;
        ctx.fillStyle = earOuter;
        ctx.beginPath();
        ctx.moveTo(bx, -0.17); ctx.lineTo(tx, -0.16); ctx.lineTo(side * 0.27, -0.44);
        ctx.closePath(); ctx.fill();
        if (headFacing > 0) {
          ctx.fillStyle = S.earIn;
          ctx.beginPath();
          ctx.moveTo(bx + side * 0.045, -0.19); ctx.lineTo(tx - side * 0.03, -0.185);
          ctx.lineTo(side * 0.26, -0.36);
          ctx.closePath(); ctx.fill();
        }
      } else {
        // くま・パンダ。丸い耳
        ctx.fillStyle = earOuter;
        ellipse(ctx, side * 0.235, -0.20, 0.105, 0.105); ctx.fill();
        if (headFacing > 0) {
          ctx.fillStyle = S.earIn;
          ellipse(ctx, side * 0.245, -0.20, 0.055, 0.055); ctx.fill();
        }
      }
    }
    // 顔の輪郭
    ctx.fillStyle = S.fur;
    ellipse(ctx, 0, 0, 0.30, 0.285); ctx.fill();

    if (headFacing > 0) {
      const beak = S.face === 'beak';
      if (beak) {
        // とり。顔の下半分が白く、真ん中にくちばし
        ctx.fillStyle = S.muzzle;
        ellipse(ctx, 0, 0.045, 0.215, 0.215); ctx.fill();
        ctx.fillStyle = S.nose;
        ctx.beginPath();
        ctx.moveTo(-0.085, 0.055); ctx.lineTo(0.085, 0.055); ctx.lineTo(0, 0.175);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 0.014;
        ctx.beginPath();
        ctx.moveTo(-0.06, 0.088); ctx.lineTo(0.06, 0.088);
        ctx.stroke();
      } else {
        // マズル
        ctx.fillStyle = S.muzzle;
        ellipse(ctx, 0, 0.10, 0.16, 0.115); ctx.fill();
        // 鼻と口
        ctx.fillStyle = S.nose;
        ctx.beginPath();
        ctx.moveTo(-0.045, 0.045); ctx.lineTo(0.045, 0.045); ctx.lineTo(0, 0.10);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = S.nose;
        ctx.lineWidth = 0.016;
        ctx.beginPath();
        ctx.moveTo(0, 0.10); ctx.lineTo(0, 0.135);
        ctx.moveTo(0, 0.135); ctx.quadraticCurveTo(-0.05, 0.175, -0.085, 0.13);
        ctx.moveTo(0, 0.135); ctx.quadraticCurveTo(0.05, 0.175, 0.085, 0.13);
        ctx.stroke();
        if (S.whiskers) {
          ctx.strokeStyle = rgba(S.nose, 0.5);
          ctx.lineWidth = 0.012;
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (const side of [-1, 1]) {
            for (const dy of [-0.02, 0.012, 0.045]) {
              ctx.moveTo(side * 0.15, 0.09 + dy * 0.4);
              ctx.lineTo(side * 0.34, 0.06 + dy);
            }
          }
          ctx.stroke();
        }
      }
      // 目のまわりの模様（パンダ）。目より先に敷く
      if (S.eyePatch) {
        ctx.fillStyle = S.eyePatch;
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * 0.135, -0.025);
          ctx.rotate(side * 0.4);
          ellipse(ctx, 0, 0, 0.085, 0.11); ctx.fill();
          ctx.restore();
        }
      }
      // 目（まばたき／転倒時は ×）
      const open = crash ? 0 : (st.blink === undefined ? 1 : st.blink);
      const eyeInk = S.eyePatch ? '#2c2c34' : S.nose;
      for (const side of [-1, 1]) {
        const ex = side * 0.125, ey = -0.02;
        if (crash) {
          ctx.strokeStyle = eyeInk; ctx.lineWidth = 0.024;
          ctx.beginPath();
          ctx.moveTo(ex - 0.04, ey - 0.04); ctx.lineTo(ex + 0.04, ey + 0.04);
          ctx.moveTo(ex + 0.04, ey - 0.04); ctx.lineTo(ex - 0.04, ey + 0.04);
          ctx.stroke();
        } else if (open > 0.15) {
          // 黒い模様の上では、白目を敷かないと目が消える
          if (S.eyePatch) {
            ctx.fillStyle = '#ffffff';
            ellipse(ctx, ex, ey, 0.048, 0.055 * open); ctx.fill();
            ctx.fillStyle = eyeInk;
            ellipse(ctx, ex, ey, 0.028, 0.034 * open); ctx.fill();
          } else {
            ctx.fillStyle = eyeInk;
            ellipse(ctx, ex, ey, 0.045, 0.052 * open); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ellipse(ctx, ex - 0.016, ey - 0.020 * open, 0.017, 0.017 * open); ctx.fill();
          }
        } else {
          ctx.strokeStyle = eyeInk; ctx.lineWidth = 0.022; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(ex - 0.045, ey); ctx.quadraticCurveTo(ex, ey + 0.03, ex + 0.045, ey);
          ctx.stroke();
        }
      }
      // ほっぺ。黒い模様やくちばしの子には要らない
      if (!S.eyePatch && !beak) {
        ctx.fillStyle = 'rgba(240,150,150,0.55)';
        ellipse(ctx, -0.20, 0.07, 0.055, 0.038); ctx.fill();
        ellipse(ctx, 0.20, 0.07, 0.055, 0.038); ctx.fill();
      }
    } else {
      // 後頭部の縫い目
      ctx.strokeStyle = rgba(S.furD, 0.85);
      ctx.lineWidth = 0.018;
      ctx.setLineDash([0.035, 0.03]);
      ctx.beginPath();
      ctx.moveTo(0, -0.26); ctx.lineTo(0, 0.24);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ニット帽
    ctx.fillStyle = S.hat;
    ctx.beginPath();
    ctx.arc(0, -0.03, 0.305, Math.PI * 1.06, Math.PI * 1.94);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = S.hatD;
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
    drawArm(frontSide, false);

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

  SB.plushieSkins = SKINS;
  SB.drawPlushie = drawPlushie;
  SB.drawStar = star;
})(window);
