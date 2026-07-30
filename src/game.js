/* ゲーム本体 ---------------------------------------------------------------- */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});
  const { clamp, lerp, damp, easeOutCubic, fmt, store, TAU } = SB.util;
  const C = SB.C;

  const CAM_BACK = 6.4;    // カメラは何m後ろか
  const CAM_HEIGHT = 3.0;
  const GRAVITY = 22;
  const MAX_HEARTS = 3;

  const TRICK_NAMES = { 1: 'SPIN 360°', 2: 'SPIN 720°', 3: 'SPIN 1080°', 4: 'SPIN 1440°' };

  class Game {
    constructor(renderer, input, ui) {
      this.r = renderer;
      this.input = input;
      this.ui = ui;
      this.state = 'title';
      this.t = 0;
      this.best = Number(store.get('sb_best', 0));
      this.bestDist = Number(store.get('sb_bestdist', 0));

      this.world = new SB.World();
      this.flakes = [];
      for (let i = 0; i < 70; i++) {
        this.flakes.push({ x: Math.random(), y: Math.random(), d: Math.random(), r: 1 + Math.random() * 2.2, drift: Math.random() * TAU });
      }
      this.particles = [];
      this.popups = [];
      this.cam = { x: 0, y: 0, z: 0, fov: 1, pitch: 0, roll: 0, shakeX: 0, shakeY: 0 };
      this.shake = 0;
      this.flashA = 0;
      this.flashColor = '#ffffff';
      this.reset(true);
    }

    reset(demo) {
      this.world.reset();
      this.particles.length = 0;
      this.popups.length = 0;
      this.trail = [];
      this.floaters = [];
      this.sprayAcc = 0;
      this.punch = 0;
      this.demo = !!demo;
      this.p = {
        x: 0, z: 0, y: 0, vy: 0, vx: 0,
        speed: 12, lean: 0, spin: 0, spinVel: 0,
        air: false, airTime: 0, squash: 1,
        blink: 1, blinkTimer: 2,
        crash: 0, crashRot: 0, invuln: 0,
        grabbed: 0, look: 0,
      };
      this.score = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.bells = 0;
      this.tricks = 0;
      this.hearts = MAX_HEARTS;
      this.boost = 0;          // 0..100 のゲージ
      this.boostTime = 0;
      this.slick = 0;          // アイスバーンの残り時間
      this.readyTimer = 0;
      this.distance = 0;
      this.startedAt = 0;
    }

    start() {
      this.reset(false);
      this.state = 'ready';
      this.readyTimer = 2.2;
      this.input.reset();
      SB.audio.resume();
      this.ui.setScreen(null);
      this.ui.setHud(true);
    }

    gameOver() {
      this.state = 'over';
      const isBest = this.score > this.best;
      if (isBest) { this.best = this.score; store.set('sb_best', Math.floor(this.score)); }
      if (this.distance > this.bestDist) { this.bestDist = this.distance; store.set('sb_bestdist', Math.floor(this.distance)); }
      this.ui.showResult({
        score: this.score, distance: this.distance, bells: this.bells,
        tricks: this.tricks, best: this.best, isBest,
      });
      this.ui.setHud(false);
    }

    togglePause() {
      if (this.state === 'run') { this.state = 'paused'; this.ui.setScreen('pause'); }
      else if (this.state === 'paused') { this.state = 'run'; this.ui.setScreen(null); }
    }

    /* --- 更新 --------------------------------------------------------- */
    update(dt) {
      this.t += dt;
      if (this.state === 'paused' || this.state === 'over') { this.updateFlakes(dt, 0.2); return; }

      this.input.update();
      const p = this.p;
      const running = this.state === 'run';

      if (this.state === 'ready') {
        this.readyTimer -= dt;
        if (this.readyTimer <= 0) { this.state = 'run'; this.startedAt = this.t; }
      }

      /* 入力 */
      let steer = 0;
      if (this.demo) {
        steer = Math.sin(this.t * 0.45) * 0.3 + Math.sin(this.t * 0.21) * 0.12;
      } else if (running && !p.crash) {
        steer = this.input.steer;
        if (this.input.consumeJump() && !p.air) this.jump();
        if (this.input.consumeBoost()) this.tryBoost();
      } else {
        this.input.consumeJump(); this.input.consumeBoost();
      }
      const tuck = !this.demo && running && !p.crash && this.input.tuck;

      /* 速度 */
      const diffRamp = clamp(p.z / 2200, 0, 1);
      const offPiste = Math.abs(p.x) > C.PISTE_HALF;
      let target = 13 + diffRamp * 13;
      if (this.demo) target = 11;
      if (tuck) target += 6;
      if (offPiste) target -= 7.5;
      if (this.boostTime > 0) target += 15;
      if (p.crash) target = 4;
      p.speed = damp(p.speed, Math.max(3, target), p.crash ? 6 : 2.2, dt);

      const speedRatio = clamp((p.speed - 12) / 26, 0, 1);

      /* 左右 */
      if (!p.crash) {
        const grip = this.slick > 0 ? 0.45 : 1;
        const authority = p.air ? 0.5 : 1;
        const targetVx = steer * (5.0 + p.speed * 0.12) * authority;
        p.vx = damp(p.vx, targetVx, (this.slick > 0 ? 2.2 : 7) * grip + 1, dt);
        p.lean = damp(p.lean, clamp(steer, -1, 1) * (p.air ? 0.5 : 1), 8, dt);
      } else {
        p.vx = damp(p.vx, 0, 3, dt);
        p.lean = damp(p.lean, 0, 4, dt);
      }
      p.x += p.vx * dt;

      // コース外の雪壁でやんわり戻す
      const lim = C.OUT_LIMIT;
      if (Math.abs(p.x) > lim) {
        p.x = clamp(p.x, -lim, lim);
        p.vx *= -0.25;
        if (!p.crash) this.spray(6, 1.2);
      }

      /* 前進 */
      p.z += p.speed * dt;
      this.distance = p.z;

      // シュプール（接地しているときだけ刻む＝ジャンプ中は途切れる）
      if (!p.air && !p.crash) {
        const tail = this.trail[this.trail.length - 1];
        if (!tail || p.z - tail.z > 0.3) {
          this.trail.push({ z: p.z, x: p.x, w: 0.20 + Math.abs(p.lean) * 0.28 });
        }
      }
      while (this.trail.length && this.trail[0].z < p.z - CAM_BACK - 1.5) this.trail.shift();
      this.slick = Math.max(0, this.slick - dt);

      /* 空中 */
      if (p.air) {
        p.airTime += dt;
        p.vy -= GRAVITY * dt;
        p.y += p.vy * dt;
        p.spinVel = damp(p.spinVel, steer * 11, 7, dt);
        p.spin += p.spinVel * dt;
        if (tuck) p.grabbed += dt;
        if (p.y <= 0) this.land();
      } else {
        p.y = 0;
        p.spin = damp(p.spin, Math.round(p.spin / TAU) * TAU, 14, dt);
        p.squash = damp(p.squash, 1, 9, dt);
      }

      /* 転倒 */
      if (p.crash > 0) {
        p.crash -= dt;
        p.crashRot += dt * 7;
        if (p.crash <= 0) { p.crash = 0; p.crashRot = 0; p.invuln = 1.6; }
      }
      p.invuln = Math.max(0, p.invuln - dt);

      // ジャンプ中と転倒中だけ、肩越しにこちらを向く
      p.look = damp(p.look, (p.air || p.crash > 0) ? 1 : 0, 11, dt);

      /* まばたき */
      p.blinkTimer -= dt;
      if (p.blinkTimer <= 0) { p.blinkTimer = 2 + Math.random() * 3.5; p.blinkAnim = 0.18; }
      if (p.blinkAnim > 0) { p.blinkAnim -= dt; p.blink = p.blinkAnim > 0.09 ? 0.1 : 1; } else p.blink = 1;

      /* ブースト */
      if (this.boostTime > 0) {
        this.boostTime -= dt;
        if (this.boostTime <= 0) this.boostTime = 0;
      }

      /* コンボの持続 */
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      /* スコア（滑走距離） */
      if (running && !this.demo) this.score += p.speed * dt * (this.boostTime > 0 ? 2 : 1);

      /* ワールド */
      this.world.ensure(p.z - CAM_BACK, diffRamp);
      if (!this.demo && running) this.collide(dt);

      /* カメラ */
      const cam = this.cam;
      cam.z = p.z - CAM_BACK;
      const absX = SB.centerX(p.z) + p.x;
      // 自機は画面中央からわずかにずらすだけにする（大きく離れると
      // 画面外に出てしまうので、ずれ幅そのものに上限を設ける）
      const lateralOffset = clamp(p.x * 0.12, -0.7, 0.7);
      cam.x = SB.centerX(cam.z) + p.x - lateralOffset;   // 減衰させると追従が遅れて自機が画面端へ逃げる
      const groundY = SB.terrainY(p.z);
      cam.y = damp(cam.y, groundY + CAM_HEIGHT + p.y * 0.35, 8, dt);
      cam.fov = damp(cam.fov, this.boostTime > 0 ? 0.86 : (tuck ? 0.93 : 1), 4, dt) - this.punch * 0.016;
      cam.pitch = damp(cam.pitch, clamp(-p.vy * 0.004, -0.05, 0.05) + (tuck ? 0.02 : 0), 5, dt);
      cam.roll = damp(cam.roll, clamp(-p.lean * 0.035 - p.vx * 0.0015, -0.05, 0.05), 7, dt);
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const sh = this.shake * this.shake;
      cam.shakeX = (Math.random() - 0.5) * 26 * sh;
      cam.shakeY = (Math.random() - 0.5) * 26 * sh;
      this.absX = absX;

      /* 演出 */
      this.updateFlakes(dt, speedRatio);
      this.updateParticles(dt);
      this.updateFloaters(dt);
      this.updatePopups(dt);
      this.punch = Math.max(0, this.punch - dt * 3.4);
      this.flashA = Math.max(0, this.flashA - dt * 2.2);
      if (!p.air && !p.crash && p.speed > 8) {
        const rate = (Math.abs(p.lean) > 0.35 ? 22 * Math.abs(p.lean) : 0) + (offPiste ? 26 : 0);
        this.sprayAcc += rate * dt;
        const n = Math.floor(this.sprayAcc);
        if (n > 0) { this.sprayAcc -= n; this.spray(n, 0.5 + speedRatio); }
      }
      SB.audio.updateRide(speedRatio, !p.air, dt);

      /* HUD */
      if (!this.demo) {
        this.ui.updateHud({
          score: this.score, distance: this.distance, speed: p.speed * 3.6,
          combo: this.combo, hearts: this.hearts, boost: this.boost,
          boosting: this.boostTime > 0,
        });
      }
    }

    jump() {
      const p = this.p;
      p.air = true;
      p.vy = 7.2 + p.speed * 0.07;
      p.airTime = 0;
      p.grabbed = 0;
      p.squash = 1.12;
      this.spray(10, 1.4);
      SB.audio.jump();
    }

    land() {
      const p = this.p;
      p.y = 0;
      p.air = false;
      p.vy = 0;
      p.squash = 0.82;
      this.spray(14, 1.6);
      SB.audio.land();
      this.shake = Math.max(this.shake, Math.min(0.4, p.airTime * 0.25));

      // 回転トリックの判定（270°以上で1回転ぶんとみなす）
      const rot = Math.floor(Math.abs(p.spin) / (TAU * 0.75));
      if (rot > 0 && !p.crash) {
        const name = TRICK_NAMES[Math.min(rot, 4)] || `SPIN ${rot * 360}°`;
        const pts = 150 * rot * rot * Math.max(1, this.combo);
        this.addScore(pts);
        this.popup(name, '#ffd25e', pts);
        this.boost = Math.min(100, this.boost + 12 * rot);
        this.tricks += rot;
        SB.audio.trick(rot);
        this.bumpCombo();
      }
      if (p.airTime > 0.5) {
        const air = Math.floor(p.airTime * 100) * (p.grabbed > 0.3 ? 2 : 1);
        this.addScore(air);
        if (p.grabbed > 0.3) { this.popup('GRAB!', '#8fd18a', air); this.tricks++; }
        this.boost = Math.min(100, this.boost + p.airTime * 8);
      }
      p.spin = 0;
      p.spinVel = 0;
      p.airTime = 0;
      p.grabbed = 0;
    }

    tryBoost() {
      if (this.boost < 50 || this.boostTime > 0) return;
      this.boost -= 50;
      this.boostTime = 2.6;
      this.shake = 0.5;
      this.flash(0.35, '#bfe6ff');
      this.spray(24, 2.2);
      SB.audio.boost();
      this.vibrate(30);
      this.popup('BOOST!', '#7fd8ff');
    }

    bumpCombo() {
      this.combo++;
      this.comboTimer = 3.2;
    }

    addScore(n) { this.score += n; }

    /* --- 当たり判定 ---------------------------------------------------- */
    collide(dt) {
      const p = this.p;
      const objs = this.world.objects;
      // 1フレームで進む距離。これより判定が薄いとすり抜けてしまう
      const reach = Math.max(1.1, p.speed * dt * 0.7);
      for (let i = this.world.head; i < objs.length; i++) {
        const o = objs[i];
        const dz = o.z - p.z;
        if (dz > 6) break;
        if (dz < -3) continue;

        if (o.type === 'bell') {
          if (o.taken) continue;
          // 近づいた鈴は自分の方へ吸い寄せる。線で並んだ鈴を拾うときの
          // 「すっと吸い込まれる」感じが、爽快さのほとんどを作る。
          if (dz > -1 && dz < 6) {
            const bx = p.x - o.x, by = p.y - (o.y || 0);
            const d3 = Math.hypot(bx, by, dz);
            if (d3 < 4.2) {
              const k = Math.min(1, (1 - d3 / 4.2) * 11 * dt);
              o.x += bx * k;
              o.y = (o.y || 0) + by * k;
              o.pulled = true;
            }
          }
          if (Math.abs(dz) < Math.max(1.8, reach) && Math.abs(o.x - p.x) < 1.7 && Math.abs((o.y || 0) - p.y) < 1.9) {
            o.taken = true;
            this.bells++;
            this.bumpCombo();
            const pts = 10 * Math.min(this.combo, 20);
            this.addScore(pts);
            this.boost = Math.min(100, this.boost + 4);

            const milestone = this.combo > 1 && this.combo % 5 === 0;
            this.sparkle(o, milestone);
            this.ring(o, milestone);
            this.floater(o, `+${pts}`, milestone ? '#ffd98a' : '#ffffff', milestone ? 1.35 : 1);
            this.punch = Math.min(1, this.punch + (milestone ? 0.55 : 0.3));
            SB.audio.coin(this.combo);
            if (milestone) {
              this.flash(0.12, '#fff3cf');
              this.vibrate(12);
              SB.audio.comboUp(this.combo);
              if (this.combo % 10 === 0) this.popup(`${this.combo} COMBO!`, '#ffb3d9');
            }
          }
          continue;
        }

        if (o.type === 'gate' && !o.scored) {
          if (dz < 0 && dz > -2.5) {
            o.scored = true;
            if (Math.abs(o.x - p.x) < o.w) {
              this.bumpCombo();
              const pts = 200 * Math.min(this.combo, 15);
              this.addScore(pts);
              this.popup('通過!', '#8fd18a', pts);
              this.boost = Math.min(100, this.boost + 8);
            }
          }
          continue;
        }

        if (o.type === 'ramp' && !o.used) {
          if (Math.abs(dz) < Math.max(1.6, reach) && Math.abs(o.x - p.x) < 2.6 && !p.air) {
            o.used = true;
            p.air = true;
            p.vy = 9.5 + p.speed * 0.1;
            p.airTime = 0;
            p.grabbed = 0;
            p.squash = 1.2;
            this.spray(12, 1.5);
            SB.audio.jump();
            this.popup('AIR!', '#ffffff');
          }
          continue;
        }

        if (o.type === 'ice' && !p.air) {
          if (Math.abs(dz) < 2.5 && Math.abs(o.x - p.x) < 3.0) this.slick = 0.9;
          continue;
        }

        if (o.solid && !o.smashed) {
          const rad = (o.r || 1) + 0.55;
          const height = o.height || 3;
          if (Math.abs(dz) < reach && Math.abs(o.x - p.x) < rad && p.y < height) {
            if (this.boostTime > 0) {
              o.smashed = true; o.solid = false;
              this.puff(o);
              this.addScore(120);
              this.popup('SMASH!', '#ffd25e', 120);
              this.shake = Math.max(this.shake, 0.35);
              SB.audio.noise(0.25, 1600, 300, 0.2);
            } else if (p.invuln <= 0 && !p.crash) {
              this.wipeout(o);
            }
          }
        }
      }
    }

    wipeout(o) {
      const p = this.p;
      p.crash = 1.15;
      p.crashRot = 0;
      p.air = false;
      p.y = 0;
      p.vy = 0;
      p.speed *= 0.35;
      p.spin = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.hearts--;
      this.shake = 0.9;
      this.flash(0.5, '#ffffff');
      this.puff(o, 22);
      SB.audio.crash();
      this.vibrate([40, 60, 40]);
      this.popup('いたっ！', '#ff8a8a');
      if (this.hearts <= 0) setTimeout(() => { if (this.state === 'run') this.gameOver(); }, 900);
    }

    vibrate(pattern) {
      if (navigator.vibrate && this.ui.haptics) { try { navigator.vibrate(pattern); } catch (e) { /* 無視 */ } }
    }

    flash(a, color) { this.flashA = Math.max(this.flashA, a); this.flashColor = color || '#ffffff'; }

    /* --- パーティクル --------------------------------------------------- */
    spray(n, power) {
      const p = this.p;
      for (let i = 0; i < n; i++) {
        this.particles.push({
          kind: 'snow',
          x: p.x + (Math.random() - 0.5) * 0.8,
          y: Math.random() * 0.3,
          z: p.z - 0.4 + Math.random() * 0.6,
          vx: (Math.random() - 0.5) * 3 * power - p.vx * 0.25,
          vy: 1.2 + Math.random() * 2.4 * power,
          vz: -0.6 - Math.random() * 1.8,
          life: 0.5 + Math.random() * 0.5,
          age: 0,
          r: 0.045 + Math.random() * 0.075,
        });
      }
      if (this.particles.length > 320) this.particles.splice(0, this.particles.length - 320);
    }

    puff(o, n) {
      for (let i = 0; i < (n || 16); i++) {
        this.particles.push({
          kind: 'snow',
          x: o.x + (Math.random() - 0.5) * 1.6,
          y: 0.3 + Math.random() * 1.6,
          z: o.z + (Math.random() - 0.5) * 1.2,
          vx: (Math.random() - 0.5) * 6,
          vy: 1 + Math.random() * 4,
          vz: (Math.random() - 0.5) * 5,
          life: 0.6 + Math.random() * 0.6,
          age: 0,
          r: 0.14 + Math.random() * 0.26,
        });
      }
    }

    sparkle(o, big) {
      const n = big ? 18 : 11;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + Math.random() * 0.4;
        const sp = (big ? 5.5 : 3.8) * (0.5 + Math.random() * 0.7);
        this.particles.push({
          kind: 'spark',
          x: o.x, y: (o.y || 0.9), z: o.z,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp * 0.8 + 1.2,
          vz: (Math.random() - 0.5) * 2.4,
          life: 0.42 + Math.random() * 0.34,
          age: 0,
          r: big ? 0.13 : 0.1,
        });
      }
    }

    /* 取った瞬間に広がる輪。一瞬で消えるが「拾えた」信号として強い */
    ring(o, big) {
      this.particles.push({
        kind: 'ring',
        x: o.x, y: (o.y || 0.9), z: o.z,
        vx: 0, vy: 0.8, vz: 0,
        life: big ? 0.5 : 0.36, age: 0,
        r: big ? 2.6 : 1.8,
      });
    }

    /* 拾った場所から浮き上がる得点表示 */
    floater(o, text, color, scale) {
      this.floaters.push({
        x: o.x, y: (o.y || 0.9), z: o.z,
        text, color, scale: scale || 1, age: 0, life: 0.7,
      });
      if (this.floaters.length > 14) this.floaters.shift();
    }

    updateFloaters(dt) {
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.age += dt;
        f.y += (2.6 - f.age * 1.4) * dt;
        if (f.age >= f.life || f.z < this.cam.z + 1) this.floaters.splice(i, 1);
      }
    }

    drawFloaters(ctx) {
      for (const f of this.floaters) {
        const pr = this.r.project(SB.centerX(f.z) + f.x, SB.terrainY(f.z) + f.y, f.z);
        if (!pr || pr.dz < 2) continue;
        const t = f.age / f.life;
        const size = clamp(pr.s * 0.26 * f.scale, 11, 30 * f.scale);
        ctx.save();
        ctx.globalAlpha = clamp(1 - t * t, 0, 1);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${size}px system-ui, sans-serif`;
        ctx.lineWidth = size * 0.2;
        ctx.strokeStyle = 'rgba(24,48,84,0.5)';
        ctx.strokeText(f.text, pr.x, pr.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, pr.x, pr.y);
        ctx.restore();
      }
    }

    updateParticles(dt) {
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const q = ps[i];
        q.age += dt;
        if (q.age >= q.life || q.z < this.cam.z + 1) { ps.splice(i, 1); continue; }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z += q.vz * dt;
        q.vy -= 7 * dt;
        q.vx *= 1 - 1.4 * dt;
        q.vz *= 1 - 1.4 * dt;
        if (q.y < 0) { q.y = 0; q.vy *= -0.2; }
      }
    }

    updateFlakes(dt, speedRatio) {
      for (const f of this.flakes) {
        f.y += dt * (0.05 + f.d * 0.12 + speedRatio * f.d * 1.1);
        f.drift += dt * 2;
        f.x += Math.sin(f.drift) * dt * 0.012 - this.p.vx * dt * 0.006 * f.d;
        if (f.y > 1.05) { f.y = -0.05; f.x = Math.random(); }
        if (f.x > 1.05) f.x -= 1.1; else if (f.x < -0.05) f.x += 1.1;
      }
    }

    popup(text, color, pts) {
      this.popups.push({ text, color: color || '#ffffff', pts: pts || 0, age: 0, life: 1.3, x: (Math.random() - 0.5) * 0.1 });
      if (this.popups.length > 6) this.popups.shift();
    }

    updatePopups(dt) {
      for (let i = this.popups.length - 1; i >= 0; i--) {
        const p = this.popups[i];
        p.age += dt;
        if (p.age >= p.life) this.popups.splice(i, 1);
      }
    }

    /* --- 描画 ---------------------------------------------------------- */
    render() {
      const r = this.r;
      const ctx = r.ctx;
      const { W, H } = r;
      const p = this.p;

      ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
      r.setCamera(this.cam);

      // カメラロールは画面全体に掛け、隅が空かないよう少し拡大する
      ctx.save();
      const ra = Math.abs(this.cam.roll);
      const cover = Math.max(
        (W * Math.cos(ra) + H * Math.sin(ra)) / W,
        (H * Math.cos(ra) + W * Math.sin(ra)) / H
      ) + 0.004;
      ctx.translate(W / 2, H / 2);
      ctx.rotate(this.cam.roll);
      ctx.scale(cover, cover);
      ctx.translate(-W / 2, -H / 2);

      r.drawSky(this.world, this.t);
      r.drawWorld(this.world, this.t);
      r.drawTrail(this.trail);
      this.drawParticles(ctx, 'behind');
      this.drawRider(ctx);
      this.drawParticles(ctx, 'front');
      this.drawFloaters(ctx);

      ctx.restore();

      const speedRatio = clamp((p.speed - 12) / 26, 0, 1);
      r.drawSnowfall(this.flakes, speedRatio);
      r.drawSpeedLines(speedRatio * 0.5 + (this.boostTime > 0 ? 0.7 : 0));
      r.drawVignette(speedRatio, this.boostTime > 0 ? 1 : 0);
      if (this.flashA > 0) r.flash(this.flashA * 0.6, this.flashColor);

      this.drawPopups(ctx);
      if (this.state === 'ready') this.drawCountdown(ctx);
    }

    riderScreen() {
      const p = this.p;
      const absX = SB.centerX(p.z) + p.x;
      const gy = SB.terrainY(p.z);
      const rider = this.r.project(absX, gy + p.y, p.z);
      const ground = this.r.project(absX, gy, p.z);
      return { rider, ground };
    }

    drawRider(ctx) {
      const p = this.p;
      const { rider, ground } = this.riderScreen();
      if (!rider) return;
      // 無敵時間中は点滅
      if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return;
      const u = rider.s;
      SB.drawPlushie(ctx, rider.x, rider.y, u, {
        lean: p.lean,
        spin: p.spin,
        air: p.air,
        tuck: this.input.tuck && !p.air ? 1 : (p.air && p.grabbed > 0 ? 1 : 0),
        crash: p.crash > 0 ? 1 : 0,
        crashRot: p.crashRot,
        look: p.look,
        t: this.t,
        blink: p.blink,
        squash: p.squash,
        speedRatio: clamp((p.speed - 12) / 26, 0, 1),
        shadowY: ground ? ground.y - rider.y : 0,
      });
    }

    drawParticles(ctx, layer) {
      const r = this.r;
      const pz = this.p.z;
      for (const q of this.particles) {
        const isFront = q.z < pz;
        if ((layer === 'front') !== isFront) continue;
        const pr = r.project(SB.centerX(q.z) + q.x, SB.terrainY(q.z) + q.y, q.z);
        if (!pr || pr.dz < 3) continue;
        const a = 1 - q.age / q.life;
        if (q.kind === 'ring') {
          const rt = q.age / q.life;
          ctx.strokeStyle = `rgba(255,225,150,${(1 - rt) * 0.85})`;
          ctx.lineWidth = Math.max(1, pr.s * 0.06 * (1 - rt));
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, q.r * pr.s * (0.2 + rt * 1.1), 0, TAU);
          ctx.stroke();
        } else if (q.kind === 'spark') {
          ctx.fillStyle = `rgba(255,222,140,${a})`;
          SB.drawStar(ctx, pr.x, pr.y, q.r * pr.s * 1.6);
        } else {
          ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, clamp(q.r * pr.s * (1 + q.age), 0.5, 13), 0, TAU);
          ctx.fill();
        }
      }
    }

    drawPopups(ctx) {
      const { W, H } = this.r;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let i = 0;
      for (const p of this.popups) {
        const t = p.age / p.life;
        const a = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4);
        const y = H * 0.40 - i * H * 0.055 - easeOutCubic(t) * H * 0.06;
        const size = Math.max(18, H * 0.038);
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.font = `900 ${size}px system-ui, sans-serif`;
        ctx.lineWidth = size * 0.18;
        ctx.strokeStyle = 'rgba(20,40,70,0.55)';
        ctx.fillStyle = p.color;
        const label = p.pts ? `${p.text}  +${fmt(p.pts)}` : p.text;
        ctx.strokeText(label, W * 0.5 + p.x * W, y);
        ctx.fillText(label, W * 0.5 + p.x * W, y);
        i++;
      }
      ctx.restore();
    }

    drawCountdown(ctx) {
      const { W, H } = this.r;
      const n = Math.ceil(this.readyTimer - 0.2);
      const label = n <= 0 ? 'GO!' : String(Math.min(3, n));
      const frac = 1 - ((this.readyTimer - 0.2) % 1);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const size = H * (0.12 + (1 - frac) * 0.03);
      ctx.font = `900 ${size}px system-ui, sans-serif`;
      ctx.globalAlpha = clamp(1 - Math.pow(frac, 3), 0.15, 1);
      ctx.lineWidth = size * 0.14;
      ctx.strokeStyle = 'rgba(20,40,70,0.5)';
      ctx.fillStyle = n <= 0 ? '#8fe0a0' : '#ffffff';
      ctx.strokeText(label, W / 2, H * 0.38);
      ctx.fillText(label, W / 2, H * 0.38);
      ctx.restore();
    }
  }

  SB.Game = Game;
  SB.CAM_BACK = CAM_BACK;
})(window);
