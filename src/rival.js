/* ライバル -------------------------------------------------------------------
   一緒に滑る相手。追いつけない相手でも、置いていくだけの相手でもつまらない
   ので、離れすぎたら速さを寄せる（ゴムひもで結ばれているイメージ）。
   見えないところで勝手に決まるのではなく、常に画面の中で競っている状態を
   保つのが目的。                                                            */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});
  const { clamp, damp, lerp } = SB.util;
  const C = SB.C;

  const NAMES = ['ももちゃん', 'ゆきちゃん', 'こむぎ', 'あられ', 'きなこ'];

  class Rival {
    constructor() { this.reset(); }

    reset() {
      this.name = NAMES[Math.floor(Math.random() * NAMES.length)];
      this.z = 9;               // 少し前からスタートして、追う気持ちを作る
      this.x = 2.4;
      this.vx = 0;
      this.speed = 14;
      this.lean = 0;
      this.y = 0;
      this.vy = 0;
      this.air = false;
      this.t = 0;
      this.targetX = 0;
      this.pose = null;
      this.poseMix = 0;
      this.blink = 1;
      this.blinkTimer = 2;
      this.jumpCooldown = 2;
      this.bestGap = 0;         // どれだけ引き離されたか（最大値）
    }

    /* 前方の障害物を避ける進路を選ぶ。まず今の位置のまま行けるかを見て、
       だめなら左右にずらした候補から、いちばん安全なものを選ぶ。 */
    chooseLane(world, dt) {
      const half = C.PISTE_HALF - 1;
      const objs = world.objects;
      const cost = (x) => {
        let c = Math.abs(x - this.x) * 0.35;          // 大きく動くほど不利
        for (let i = world.head; i < objs.length; i++) {
          const o = objs[i];
          const dz = o.z - this.z;
          if (dz > 34) break;
          if (dz < 0) continue;
          if (o.solid && !o.smashed) {
            const d = Math.abs(o.x - x);
            if (d < 2.2) c += (2.2 - d) * (34 - dz) * 0.5;   // 近い障害ほど重く見る
          } else if (o.type === 'bell' && !o.taken) {
            if (Math.abs(o.x - x) < 1.4) c -= 1.2;           // 鈴は少し寄っていく
          }
        }
        return c;
      };

      let best = this.x, bestCost = Infinity;
      for (let k = -4; k <= 4; k++) {
        const x = clamp(this.x + k * 1.7, -half, half);
        const c = cost(x);
        if (c < bestCost) { bestCost = c; best = x; }
      }
      this.targetX = best;
    }

    update(dt, player, world, difficulty) {
      this.t += dt;
      if (dt <= 0) return;

      /* 速さ。素の巡航速度はプレイヤーのそれよりわずかに遅くしてある。
         だから普通に滑っていれば横に並び、しゃがんで加速したりブースト
         したりすれば前に出られる。逆に転べば置いていかれる。
         そのうえで、離れすぎたぶんだけゴムひものように寄せる。 */
      const gap = this.z - player.z;
      const base = 13.0 + difficulty * 12.6;
      let target = base;
      if (gap > 30) target -= Math.min(8, (gap - 30) * 0.22);   // 前に出すぎたら緩める
      if (gap < -30) target += Math.min(6, (-gap - 30) * 0.16); // 離されたら少し本気
      // プレイヤーが転んでいる間は少しだけ待ってあげる（置き去りにしない）
      if (player.crash > 0) target = Math.min(target, player.speed + 8);
      this.speed = damp(this.speed, Math.max(6, target), 1.4, dt);
      this.z += this.speed * dt;

      /* 進路 */
      if (!this.laneTimer || this.laneTimer <= 0) {
        this.chooseLane(world, dt);
        this.laneTimer = 0.25;
      }
      this.laneTimer -= dt;
      const dx = this.targetX - this.x;
      this.vx = damp(this.vx, clamp(dx * 2.2, -7, 7), 6, dt);
      this.x += this.vx * dt;
      this.lean = damp(this.lean, clamp(this.vx / 6, -1, 1), 7, dt);

      /* たまに跳ぶ。技も出す（見ていて楽しいので） */
      this.jumpCooldown -= dt;
      if (this.air) {
        this.vy -= 22 * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0; this.air = false; this.pose = null;
          this.jumpCooldown = 1.6 + Math.random() * 3.5;
        }
      } else if (this.jumpCooldown <= 0) {
        this.air = true;
        this.vy = 7 + Math.random() * 2.4;
        this.pose = SB.tricks ? SB.tricks.pick(this.pose && this.pose.id).pose : null;
      }
      this.poseMix = damp(this.poseMix, this.air && this.pose ? 1 : 0, 12, dt);

      /* まばたき */
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) { this.blinkTimer = 2 + Math.random() * 4; this.blinkAnim = 0.18; }
      if (this.blinkAnim > 0) { this.blinkAnim -= dt; this.blink = this.blinkAnim > 0.09 ? 0.1 : 1; }
      else this.blink = 1;

      if (gap > this.bestGap) this.bestGap = gap;
    }

    /* 画面に描く。自分より後ろにいるときはカメラに映らないので、
       そのぶんは HUD の差の表示で伝える。 */
    draw(ctx, renderer, player) {
      const gy = SB.terrainY(this.z);
      const rider = renderer.project(SB.centerX(this.z) + this.x, gy + this.y, this.z);
      const ground = renderer.project(SB.centerX(this.z) + this.x, gy, this.z);
      if (!rider) return;
      if (rider.x < -renderer.W * 0.5 || rider.x > renderer.W * 1.5) return;
      /* 抜き返したあと相手が真横まで来ると、画面いっぱいに膨らんで
         操作ボタンにかぶる。手前に来るほど薄くして、静かに消す。 */
      const fade = clamp((rider.dz - 5) / 4, 0, 1);
      if (fade <= 0) return;

      ctx.save();
      ctx.globalAlpha = fade;
      SB.drawPlushie(ctx, rider.x, rider.y, rider.s, {
        skin: SB.plushieSkins.rival,
        lean: this.lean,
        spin: 0,
        air: this.air,
        pose: this.pose,
        poseMix: this.poseMix,
        tuck: 0,
        crash: 0,
        t: this.t,
        blink: this.blink,
        squash: 1,
        speedRatio: clamp((this.speed - 12) / 26, 0, 1),
        shadowY: ground ? ground.y - rider.y : 0,
      });

      // 名札。誰と競っているのか分かるように、頭の上に小さく出す
      const size = clamp(rider.s * 0.2, 9, 22);
      ctx.save();
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = 'rgba(24,48,84,0.45)';
      ctx.strokeText(this.name, rider.x, rider.y - rider.s * 1.75);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.name, rider.x, rider.y - rider.s * 1.75);
      ctx.restore();

      ctx.restore();
    }
  }

  SB.Rival = Rival;
})(window);
