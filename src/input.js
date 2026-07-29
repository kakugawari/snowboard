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
      this.enabled = true;

      this._bind();
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

    update() {
      const k = this.keys;
      let steer = 0;
      if (k.has('ArrowLeft') || k.has('KeyA')) steer -= 1;
      if (k.has('ArrowRight') || k.has('KeyD')) steer += 1;

      if (this.active) {
        const r = this.radius;
        steer = clamp((this.curX - this.originX) / r, -1, 1);
        const dy = this.curY - this.originY;
        this.tuck = dy > r * 0.45;
      }
      this.tuck = this.tuck || k.has('ArrowDown') || k.has('KeyS');
      this.steer = steer;
    }

    consumeJump() { const v = this.jumpQueued; this.jumpQueued = false; return v; }
    consumeBoost() { const v = this.boostQueued; this.boostQueued = false; return v; }
    reset() { this.active = false; this.steer = 0; this.tuck = false; this.jumpQueued = this.boostQueued = false; }
  }

  SB.Input = Input;
})(window);
