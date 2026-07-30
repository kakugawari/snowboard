/* 効果音 -------------------------------------------------------------------
   音声ファイルは持たず、すべて WebAudio で合成する。
   滑走音（ノイズをローパス）＋ 効果音（短いエンベロープ）の2系統。         */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});
  const { clamp } = SB.util;

  const Audio = {
    ctx: null,
    master: null,
    windGain: null,
    windFilter: null,
    enabled: true,
    ready: false,

    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      const ctx = (this.ctx = new AC());

      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(ctx.destination);

      // 滑走音: ホワイトノイズをループ再生し、速度でカットオフと音量を動かす
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.03 * white) / 1.03; // ブラウンノイズ寄りにして耳あたりを柔らかく
        data[i] = last * 3.2;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.value = 400;
      this.windFilter.Q.value = 0.6;

      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;

      src.connect(this.windFilter).connect(this.windGain).connect(this.master);
      src.start();
      this.ready = true;
    },

    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.9 : 0;
    },

    // 滑走音の更新（0..1 の速度比、接地しているか）
    updateRide(speedRatio, grounded, dt) {
      if (!this.ready || !this.enabled) return;
      const t = this.ctx.currentTime;
      const target = grounded ? 0.05 + speedRatio * 0.3 : 0.03;
      this.windGain.gain.setTargetAtTime(target, t, 0.15);
      this.windFilter.frequency.setTargetAtTime(300 + speedRatio * 2200, t, 0.2);
    },

    tone(freq, dur, type, vol, sweepTo) {
      if (!this.ready || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(clamp(vol || 0.2, 0.0002, 1), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },

    noise(dur, from, to, vol) {
      if (!this.ready || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const len = Math.ceil(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(from, t);
      f.frequency.exponentialRampToValueAtTime(to, t + dur);
      f.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
    },

    /* 鈴の音。コンボが伸びるほど音階を上げる。半音ずつ上げると不協和に
       なるので、ペンタトニック（ヨナ抜き）を辿る。並んだ鈴を続けて拾うと
       短い旋律になり、それ自体が気持ちよさになる。 */
    coin(combo) {
      const scale = [0, 2, 4, 7, 9];
      const i = Math.max(0, Math.min((combo || 1) - 1, 24));
      const semi = scale[i % 5] + 12 * Math.floor(i / 5);
      const f = 620 * Math.pow(2, semi / 12);
      this.tone(f, 0.15, 'triangle', 0.17);
      this.tone(f * 2, 0.10, 'sine', 0.075);
      this.tone(f * 3, 0.06, 'sine', 0.03);
      this.noise(0.07, 3200, 6000, 0.05);      // きらめきの成分
    },

    // コンボの節目。上へ抜ける短いアルペジオ
    comboUp(combo) {
      const base = 700 * Math.pow(2, Math.min(combo / 40, 1));
      [0, 4, 7].forEach((semi, k) => {
        setTimeout(() => this.tone(base * Math.pow(2, semi / 12), 0.18, 'triangle', 0.12), k * 55);
      });
    },
    jump() { this.tone(320, 0.18, 'sine', 0.16, 760); this.noise(0.12, 900, 2600, 0.06); },
    land() { this.noise(0.22, 1200, 200, 0.16); },
    crash() {
      this.noise(0.5, 900, 90, 0.3);
      this.tone(180, 0.4, 'sawtooth', 0.14, 60);
    },
    boost() {
      this.tone(220, 0.5, 'sawtooth', 0.12, 880);
      this.noise(0.5, 400, 3000, 0.12);
    },
    trick(n) { this.tone(520 + n * 120, 0.22, 'square', 0.09, 1040 + n * 120); },
    ui() { this.tone(660, 0.09, 'triangle', 0.12); },
  };

  SB.audio = Audio;
})(window);
