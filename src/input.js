/* 入力 ---------------------------------------------------------------------
   スマホ: ドラッグでカービング、上フリックでジャンプ、下に引くとタック、
           ダブルタップでブースト。
   PC:     ←→ / A D で操作、Space ジャンプ、↓ タック、Shift ブースト。      */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});
  const { clamp } = SB.util;

  class Input {
    constructor(el) {
      this.el = el;
      this.steer = 0;        // -1..1 左右
      this.tuck = false;     // 前傾（加速）
      this.jumpQueued = false;
      this.boostQueued = false;

      this.active = false;
      this.originX = 0;
      this.originY = 0;
      this.curX = 0;
      this.curY = 0;
      this.startT = 0;
      this.lastTapT = 0;
      this.lastTapX = 0;
      this.lastTapY = 0;
      this.moved = 0;
      this.flickBuf = [];     // 直近の縦移動サンプル（フリック判定用）
      this.keys = new Set();
      this.held = { tuck: false };   // 押している間だけ効くもの
      this.padSteer = 0;             // シーソーによる操舵（-1..1）
      this.padActive = false;
      this.padJumpLatch = false;
      this.enabled = true;

      this._bind();
    }

    /* シーソー型の操作板。
       触れた位置が中心からどちら側かで向きが決まる。押したまま指を滑ら
       せれば境界をまたいだ瞬間に切り替わるので、押し間違えても指を動か
       すだけで直せる。横方向は中心からの深さで曲がり具合も変える。   */
    bindSeesaw(sw) {
      const axis = sw.dataset.axis;
      const halves = [...sw.querySelectorAll('.seesaw-half')];
      const mark = (zone) => {
        for (const h of halves) h.classList.toggle('on', h.dataset.zone === zone);
      };

      const apply = (e) => {
        const r = sw.getBoundingClientRect();
        if (axis === 'x') {
          const t = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2 || 1), -1, 1);
          const a = Math.abs(t);
          if (a < 0.08) {                    // ど真ん中だけは無反応にする
            this.padSteer = 0;
            mark(null);
          } else {
            // 端に近いほど深く曲がる。押した瞬間から効くよう 0.55 から始める
            this.padSteer = Math.sign(t) * (0.55 + 0.45 * Math.min(1, (a - 0.08) / 0.72));
            mark(t < 0 ? 'left' : 'right');
          }
          this.padActive = true;
        } else {
          const t = (e.clientY - (r.top + r.height / 2)) / (r.height / 2 || 1);
          const jump = t < -0.04;
          // 上側へ「入った瞬間」に一度だけ跳ぶ。押しっぱなしで連発しない
          if (jump && !this.padJumpLatch) this.jumpQueued = true;
          this.padJumpLatch = jump;
          this.held.tuck = t > 0.04;
          mark(jump ? 'jump' : (this.held.tuck ? 'tuck' : null));
        }
      };

      const release = () => {
        if (axis === 'x') { this.padSteer = 0; this.padActive = false; }
        else { this.held.tuck = false; this.padJumpLatch = false; }
        mark(null);
      };

      sw.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        sw.setPointerCapture && sw.setPointerCapture(e.pointerId);
        sw.__id = e.pointerId;
        apply(e);
      }, { passive: false });

      sw.addEventListener('pointermove', (e) => {
        if (sw.__id !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        apply(e);
      }, { passive: false });

      const end = (e) => {
        if (sw.__id !== e.pointerId) return;
        e.stopPropagation();
        sw.__id = null;
        release();
      };
      sw.addEventListener('pointerup', end);
      sw.addEventListener('pointercancel', end);
      sw.addEventListener('contextmenu', (e) => e.preventDefault());
      sw.__release = release;
    }

    /* 画面上の操作ボタン。押している間だけ効くもの（data-hold）と、
       押した瞬間に一度だけ効くもの（data-tap）を同じ仕組みで拾う。 */
    bindPad(root) {
      if (!root) return;
      for (const sw of root.querySelectorAll('.seesaw')) this.bindSeesaw(sw);

      const press = (btn, on) => {
        const hold = btn.dataset.hold;
        if (hold) this.held[hold] = on;
        btn.classList.toggle('pressed', on);
      };

      for (const btn of root.querySelectorAll('[data-hold],[data-tap]')) {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();                 // 下の操作レイヤーに渡さない
          btn.setPointerCapture && btn.setPointerCapture(e.pointerId);
          press(btn, true);
          const tap = btn.dataset.tap;
          if (tap === 'jump') this.jumpQueued = true;
          if (tap === 'boost') this.boostQueued = true;
        }, { passive: false });

        const release = (e) => { e.stopPropagation(); press(btn, false); };
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        // 指がボタンの外へ滑ったときに押しっぱなしにならないようにする
        btn.addEventListener('pointerleave', () => press(btn, false));
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
      }

      // 何かの拍子に離した判定を取り逃しても、必ず戻せるようにしておく
      addEventListener('pointerup', () => this.releaseAll(root));
      addEventListener('pointercancel', () => this.releaseAll(root));
      addEventListener('blur', () => this.releaseAll(root));
    }

    releaseAll(root) {
      this.held.tuck = false;
      this.padSteer = 0;
      this.padActive = false;
      this.padJumpLatch = false;
      if (!root) return;
      for (const b of root.querySelectorAll('.pressed')) b.classList.remove('pressed');
      for (const h of root.querySelectorAll('.seesaw-half.on')) h.classList.remove('on');
      for (const sw of root.querySelectorAll('.seesaw')) sw.__id = null;
    }

    get radius() { return Math.max(70, Math.min(innerWidth, innerHeight) * 0.24); }

    _bind() {
      const el = this.el;
      const opts = { passive: false };

      el.addEventListener('pointerdown', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        el.setPointerCapture && el.setPointerCapture(e.pointerId);
        this.active = true;
        this.originX = this.curX = e.clientX;
        this.originY = this.curY = e.clientY;
        this.startT = performance.now();
        this.moved = 0;
        this.lowY = e.clientY;      // 指が一番下にあった位置（上への移動量を測る基準）
        this.flickBuf.length = 0;
      }, opts);

      el.addEventListener('pointermove', (e) => {
        if (!this.active) return;
        e.preventDefault();
        const now = performance.now();
        this.moved += Math.hypot(e.clientX - this.curX, e.clientY - this.curY);
        this.curX = e.clientX;
        this.curY = e.clientY;

        // 直近だけを残しつつ、必ず2点は保持する（1点しか残らないと
        // 速度が計算できず、指の動きが遅い端末でフリックを取りこぼす）
        this.flickBuf.push({ t: now, y: e.clientY });
        while (this.flickBuf.length > 2 && now - this.flickBuf[0].t > 140) this.flickBuf.shift();

        const r = this.radius;
        // 横: 支点をゆっくり引きずることで、端まで切っても切り返せるようにする
        const dx = this.curX - this.originX;
        if (dx > r) this.originX = this.curX - r;
        if (dx < -r) this.originX = this.curX + r;

        // 上方向のスワイプ → ジャンプ。
        // 素早いフリックと、ゆっくりでも大きく上げる動きの両方を拾う。
        this.lowY = Math.max(this.lowY, this.curY);
        if (this.flickBuf.length > 1) {
          const a = this.flickBuf[0], b = this.flickBuf[this.flickBuf.length - 1];
          const vy = (b.y - a.y) / Math.max(1, b.t - a.t) * 1000; // px/秒
          const rise = this.lowY - this.curY;
          if ((vy < -800 && rise > 24) || (vy < -380 && rise > this.radius * 0.5)) {
            this.jumpQueued = true;
            this.flickBuf.length = 0;
            this.lowY = this.curY;
            this.originY = this.curY;
          }
        }
      }, opts);

      const end = (e) => {
        if (!this.active) return;
        e.preventDefault();
        this.active = false;
        this.tuck = false;

        // ダブルタップ（ほぼ動かさずに素早く2回）→ ブースト
        const now = performance.now();
        const isTap = this.moved < 18 && now - this.startT < 260;
        if (isTap) {
          const near = Math.hypot(this.curX - this.lastTapX, this.curY - this.lastTapY) < 80;
          if (now - this.lastTapT < 320 && near) {
            this.boostQueued = true;
            this.lastTapT = 0;
          } else {
            this.lastTapT = now;
            this.lastTapX = this.curX;
            this.lastTapY = this.curY;
          }
        }
      };
      el.addEventListener('pointerup', end, opts);
      el.addEventListener('pointercancel', end, opts);

      addEventListener('keydown', (e) => {
        if (e.repeat) { e.preventDefault(); return; }
        this.keys.add(e.code);
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.jumpQueued = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.boostQueued = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      });
      addEventListener('keyup', (e) => this.keys.delete(e.code));
      addEventListener('blur', () => { this.keys.clear(); this.active = false; this.tuck = false; });
    }

    /* 毎フレーム、押されているものだけから状態を作り直す。
       前の値に OR を重ねると、離しても解除されずに残ってしまう。 */
    update() {
      const k = this.keys;
      let steer = 0;
      let tuck = false;

      if (k.has('ArrowLeft') || k.has('KeyA')) steer -= 1;
      if (k.has('ArrowRight') || k.has('KeyD')) steer += 1;
      if (this.padActive) steer = this.padSteer;   // 操作板を触っていればそちらが優先

      // 操作板を使っていないときだけ、ドラッグでの操舵を見る
      if (this.active && !this.padActive) {
        const r = this.radius;
        steer = clamp((this.curX - this.originX) / r, -1, 1);
        tuck = this.curY - this.originY > r * 0.45;
      }

      this.tuck = tuck || this.held.tuck || k.has('ArrowDown') || k.has('KeyS');
      this.steer = clamp(steer, -1, 1);
    }

    consumeJump() { const v = this.jumpQueued; this.jumpQueued = false; return v; }
    consumeBoost() { const v = this.boostQueued; this.boostQueued = false; return v; }
    reset() {
      this.active = false; this.steer = 0; this.tuck = false;
      this.jumpQueued = this.boostQueued = false;
      this.releaseAll(document.getElementById('pad'));
    }
  }

  SB.Input = Input;
})(window);
