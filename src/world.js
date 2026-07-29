/* コース生成 ---------------------------------------------------------------
   z = 進行方向（メートル）、x = 横方向、y = 高さ。
   地形は正弦波の合成でうねりを作り、コース自体も左右に蛇行させる。       */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});
  const { clamp, makeRng } = SB.util;

  const C = {
    PISTE_HALF: 7.2,      // ゲレンデの半幅(m)
    OUT_LIMIT: 17,        // ここまでは出られる（それ以上は雪壁で押し戻す）
    SEG_LEN: 2,           // 地面の1区画の長さ(m)
    VIEW: 240,            // 描画距離(m)
    CHUNK: 8,             // 生成単位(m)
  };

  // うねる地形
  function terrainY(z) {
    return (
      2.4 * Math.sin(z * 0.0091) +
      1.3 * Math.sin(z * 0.0203 + 2.1) +
      0.6 * Math.sin(z * 0.047 + 0.7)
    );
  }
  // コースの中心線（蛇行）
  function centerX(z) {
    return 11 * Math.sin(z * 0.0043) + 4.5 * Math.sin(z * 0.0117 + 1.3);
  }

  class World {
    constructor(seed) {
      this.rng = makeRng(seed || (Math.random() * 1e9) | 0);
      this.objects = [];     // z 昇順
      this.head = 0;         // これより前は通過済み
      this.nextZ = 40;       // 生成済みの先端
      this.nextTowerZ = 90;
      this.nextPoleZ = 0;
      this.nextEventZ = 90;  // 障害物パターンの次の配置位置
      this.buildScenery();
    }

    /* 遠景（山脈・雲）は毎フレーム作らず、最初に一度だけ形を決める */
    buildScenery() {
      const rng = this.rng;
      /* 稜線: 整数倍音の正弦波を重ねる。周期が揃うので横に繰り返しても
         継ぎ目が出ない。仕上げに指数をかけて峰を尖らせる。 */
      const ridge = (n, harmonics, sharp) => {
        const phases = harmonics.map(() => rng() * Math.PI * 2);
        const amps = harmonics.map((k) => 1 / Math.pow(k, 0.85));
        const norm = amps.reduce((a, b) => a + b, 0);
        const pts = new Array(n);
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          let v = 0;
          for (let h = 0; h < harmonics.length; h++) {
            v += amps[h] * Math.sin(t * Math.PI * 2 * harmonics[h] + phases[h]);
          }
          pts[i] = Math.pow(clamp(0.5 + v / (norm * 2), 0, 1), sharp);
        }
        return pts;
      };
      this.ranges = [
        { pts: ridge(96, [1, 2, 3, 5, 9], 1.5), height: 0.40, depth: 0.16, snowLine: 0.34, color: '#93a9c6', snow: '#dbe6f3' },
        { pts: ridge(96, [1, 2, 4, 7, 11], 1.7), height: 0.30, depth: 0.34, snowLine: 0.40, color: '#8195b6', snow: '#cddbec' },
        { pts: ridge(96, [2, 3, 5, 8, 13], 1.9), height: 0.20, depth: 0.62, snowLine: 0.46, color: '#6f84a6', snow: '#bccde3' },
      ];
      this.clouds = [];
      for (let i = 0; i < 9; i++) {
        this.clouds.push({
          x: rng(), y: rng.range(0.06, 0.42), s: rng.range(0.5, 1.5),
          spd: rng.range(0.0006, 0.0022), puffs: rng.int(3, 5), seed: rng() * 100,
        });
      }
      this.birds = [];
      for (let i = 0; i < 3; i++) {
        this.birds.push({ x: rng(), y: rng.range(0.12, 0.3), spd: rng.range(0.01, 0.02), ph: rng() * 6 });
      }
    }

    reset() {
      this.objects.length = 0;
      this.head = 0;
      this.nextZ = 40;
      this.nextTowerZ = 90;
      this.nextPoleZ = 0;
      this.nextEventZ = 90;
    }

    add(o) { this.pending.push(o); }

    /* camZ より前方 VIEW メートルまでを埋める */
    ensure(camZ, difficulty) {
      const limit = camZ + C.VIEW;
      while (this.nextZ < limit) {
        this.pending = [];
        this.fillChunk(this.nextZ, difficulty);
        this.pending.sort((a, b) => a.z - b.z);
        for (const o of this.pending) this.objects.push(o);
        this.nextZ += C.CHUNK;
      }
      // 通過した分を捨てる
      while (this.head < this.objects.length && this.objects[this.head].z < camZ - 20) this.head++;
      if (this.head > 400) { this.objects.splice(0, this.head); this.head = 0; }
    }

    fillChunk(z0, d) {
      const rng = this.rng;
      const half = C.PISTE_HALF;

      /* --- ゲレンデ外の森 --- */
      const density = 3;
      for (let i = 0; i < density; i++) {
        for (const side of [-1, 1]) {
          if (!rng.chance(0.85)) continue;
          const z = z0 + rng() * C.CHUNK;
          const off = half + 1.5 + Math.pow(rng(), 0.6) * 46;
          const kind = rng() < 0.82 ? 'pine' : 'bush';
          this.add({
            type: kind, z, x: side * off,
            scale: rng.range(0.75, 1.6) * (kind === 'pine' ? 1 : 0.5),
            snowy: rng.chance(0.7), phase: rng() * 6.28, r: 0, solid: false,
          });
        }
      }
      // 岩やこぶ（雪面のアクセント）
      if (rng.chance(0.5)) {
        this.add({
          type: 'mogul', z: z0 + rng() * C.CHUNK,
          x: (rng() - 0.5) * 2 * (half + 6), scale: rng.range(0.7, 1.5), solid: false, r: 0,
        });
      }

      /* --- コース脇のポール（速度感の基準になる） --- */
      while (this.nextPoleZ < z0 + C.CHUNK) {
        if (this.nextPoleZ >= z0) {
          for (const side of [-1, 1]) {
            this.add({ type: 'pole', z: this.nextPoleZ, x: side * half, solid: false, r: 0, side });
          }
        }
        this.nextPoleZ += 12;
      }

      /* --- リフト（風景の主役） --- */
      if (this.nextTowerZ < z0 + C.CHUNK && this.nextTowerZ >= z0) {
        this.add({ type: 'tower', z: this.nextTowerZ, x: -(half + 13), scale: 1, solid: false, r: 0 });
        this.nextTowerZ += 150;
      }

      /* --- 障害物・アイテムのパターン --- */
      if (this.nextEventZ < z0 + C.CHUNK && this.nextEventZ >= z0) {
        this.spawnPattern(this.nextEventZ, d);
        this.nextEventZ += Math.max(26, 62 - d * 30) + rng() * 24;
      }
    }

    spawnPattern(z, d) {
      const rng = this.rng;
      const half = C.PISTE_HALF;
      const pool = ['trees', 'rocks', 'bells', 'ramp', 'snowman', 'slalom', 'ice'];
      // 序盤はアイテム多め、進むほど障害物が増える
      const weights = {
        trees: 0.6 + d * 1.4, rocks: 0.5 + d * 1.2, bells: 1.5 - d * 0.4,
        ramp: 1.0, snowman: 0.4 + d * 0.6, slalom: 0.7 + d * 0.5, ice: 0.2 + d * 0.7,
      };
      let total = 0;
      for (const k of pool) total += weights[k];
      let pick = rng() * total, kind = pool[0];
      for (const k of pool) { pick -= weights[k]; if (pick <= 0) { kind = k; break; } }

      const lane = () => rng.range(-half + 1, half - 1);

      switch (kind) {
        case 'trees': {
          const n = 2 + Math.floor(d * 3 + rng() * 2);
          const gap = rng.range(-half + 2.5, half - 2.5); // 通れる隙間を必ず1つ作る
          for (let i = 0; i < n; i++) {
            let x = lane();
            if (Math.abs(x - gap) < 3.4) x += (x < gap ? -1 : 1) * 3.6;
            if (Math.abs(x) > half - 0.5) continue;
            this.add({
              type: 'pine', z: z + rng() * 12, x, scale: rng.range(0.9, 1.35),
              snowy: true, phase: rng() * 6.28, solid: true, r: 1.0, height: 4,
            });
          }
          break;
        }
        case 'rocks': {
          const n = 2 + Math.floor(d * 3);
          for (let i = 0; i < n; i++) {
            this.add({
              type: 'rock', z: z + rng() * 14, x: lane(), scale: rng.range(0.8, 1.4),
              solid: true, r: 1.1, height: 1.2, phase: rng() * 6.28,
            });
          }
          break;
        }
        case 'snowman': {
          const x = lane();
          this.add({ type: 'snowman', z, x, scale: rng.range(0.9, 1.2), solid: true, r: 1.0, height: 2.2 });
          for (let i = 0; i < 4; i++) {
            this.add({ type: 'bell', z: z + 8 + i * 3.5, x: x + (i + 1) * 1.2 * (x > 0 ? -1 : 1), y: 0.9, solid: false, r: 1.5 });
          }
          break;
        }
        case 'slalom': {
          const n = 3 + Math.floor(d * 3);
          let x = lane();
          for (let i = 0; i < n; i++) {
            const zz = z + i * 16;
            x = clamp(x + rng.range(-7, 7), -half + 2, half - 2);
            this.add({ type: 'gate', z: zz, x, solid: false, r: 0, w: 2.6, hitZone: true, scored: false });
            for (let j = 0; j < 3; j++) {
              this.add({ type: 'bell', z: zz - 3 + j * 3, x, y: 0.9, solid: false, r: 1.5 });
            }
          }
          break;
        }
        case 'ice': {
          const x = lane();
          this.add({ type: 'ice', z, x, scale: rng.range(1.2, 2.2), solid: false, r: 3.2, slick: true });
          break;
        }
        case 'ramp': {
          const x = lane();
          this.add({ type: 'ramp', z, x, scale: rng.range(0.9, 1.3), solid: false, r: 2.0, kicker: true });
          // 飛んだ先に空中アイテムの弧を置く
          for (let i = 0; i < 6; i++) {
            const t = i / 5;
            this.add({
              type: 'bell', z: z + 10 + i * 5, x: x + rng.range(-0.6, 0.6),
              y: 1.2 + Math.sin(t * Math.PI) * 4.2, solid: false, r: 1.7, air: true,
            });
          }
          break;
        }
        default: { // bells
          const x0 = lane(), x1 = lane();
          const n = 7 + Math.floor(rng() * 4);
          for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            this.add({
              type: 'bell', z: z + i * 4.5, x: x0 + (x1 - x0) * t, y: 0.9, solid: false, r: 1.5,
            });
          }
        }
      }
    }
  }

  SB.C = C;
  SB.terrainY = terrainY;
  SB.centerX = centerX;
  SB.World = World;
})(window);
