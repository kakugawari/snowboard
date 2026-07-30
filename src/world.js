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
    return 14 * Math.sin(z * 0.0041) + 5.5 * Math.sin(z * 0.0113 + 1.3);
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
      this.nextVillageZ = 220;
      this.buildScenery();
    }

    /* 遠景（山脈・雲）は毎フレーム作らず、最初に一度だけ形を決める */
    buildScenery() {
      const rng = this.rng;
      /* 山脈は「独立した峰の集まり」として持つ。連続した稜線を1本引くより、
         峰ごとに陽の面と影の面を割り当てられるぶん、立体感が出る。
         日射しは右上から当たっている想定（空の太陽の位置と合わせる）。 */
      const makePeaks = (n, hMin, hMax, wMin, wMax) => {
        const peaks = [];
        for (let i = 0; i < n; i++) {
          peaks.push({
            x: (i + rng.range(-0.32, 0.32)) / n,   // 0..1（山脈の幅に対する位置）
            h: rng.range(hMin, hMax),              // 0..1（山脈の高さに対する比）
            w: rng.range(wMin, wMax),              // 裾の広がり
            skew: rng.range(-0.30, 0.30),          // 頂点の左右の寄り
            // 左右それぞれの肩。高さと張り出しを変えて、単純な三角形に見せない
            shoulderL: { at: rng.range(0.34, 0.66), out: rng.range(0.42, 0.72) },
            shoulderR: { at: rng.range(0.34, 0.66), out: rng.range(0.42, 0.72) },
            snowLine: rng.range(0.30, 0.52),       // 雪が下りてくる高さ
            jag: [rng(), rng(), rng(), rng(), rng(), rng()], // 雪線のギザギザ
            gullies: [rng(), rng(), rng()],        // 岩の筋
          });
        }
        // 高い峰から描いて、低い峰を手前に重ねる
        peaks.sort((a, b) => b.h - a.h);
        return peaks;
      };
      this.ranges = [
        // 尖った針ではなく幅のある山塊にする。奥ほど霞ませ、色差も小さくする
        { peaks: makePeaks(6, 0.50, 1.00, 0.16, 0.28), height: 0.32, depth: 0.13, fog: 0.30,
          lit: '#f2f8fd', shade: '#8fabd2', rock: '#5c7ba9', forest: '#63809f' },
        { peaks: makePeaks(8, 0.42, 0.80, 0.12, 0.22), height: 0.24, depth: 0.30, fog: 0.16,
          lit: '#edf5fc', shade: '#7091c1', rock: '#3e6491', forest: '#456188' },
        { peaks: makePeaks(10, 0.30, 0.62, 0.10, 0.17), height: 0.17, depth: 0.58, fog: 0.06,
          lit: '#e8f2fb', shade: '#5b7dae', rock: '#2d5080', forest: '#33507c' },
        // 地平線際のなだらかな丘。雪原と山脈のあいだを埋める
        { peaks: makePeaks(13, 0.22, 0.50, 0.07, 0.13), height: 0.105, depth: 0.86, fog: 0.02,
          lit: '#f0f7fd', shade: '#93b0d4', rock: '#7d9cc4', forest: '#2f4b6b' },
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
      this.nextVillageZ = 220;
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

      /* --- 山あいの集落 --- */
      if (this.nextVillageZ === undefined) this.nextVillageZ = 220;
      if (this.nextVillageZ < z0 + C.CHUNK && this.nextVillageZ >= z0) {
        this.spawnVillage(this.nextVillageZ);
        this.nextVillageZ += 380 + rng() * 260;
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

    /* ゲレンデから離れた斜面に山小屋をかたまりで置く。屋根の暖色が
       白一色の風景の中で目印になり、距離感も出る。 */
    spawnVillage(z) {
      const rng = this.rng;
      const side = rng.chance(0.5) ? -1 : 1;
      const base = C.PISTE_HALF + 22 + rng() * 30;
      const roofs = ['#b5613f', '#a94f38', '#9c5a3c', '#8f4a34'];
      const n = 4 + rng.int(0, 3);
      for (let i = 0; i < n; i++) {
        this.add({
          type: 'chalet',
          z: z + rng.range(-26, 26),
          x: side * (base + rng.range(-14, 14)),
          scale: rng.range(0.85, 1.25),
          warm: rng.pick(roofs),
          chimney: rng.chance(0.6),
          solid: false, r: 0,
        });
      }
      if (rng.chance(0.5)) {
        this.add({
          type: 'steeple', z: z + rng.range(-10, 10),
          x: side * (base + rng.range(-8, 8)), solid: false, r: 0,
        });
      }
      // 集落まわりの木立
      for (let i = 0; i < 8; i++) {
        this.add({
          type: 'pine', z: z + rng.range(-34, 34),
          x: side * (base + rng.range(-26, 26)),
          scale: rng.range(0.6, 1.0), snowy: true, phase: rng() * 6.28, solid: false, r: 0,
        });
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
