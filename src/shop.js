/* 装備とコイン ---------------------------------------------------------------
   拾った鈴は走り終わりに「貯金」へ加算され、装備の購入に使える。
   効果は数値ひとつで表され、ゲーム側はレベルを見て係数を掛けるだけにする。
   バランスを触りたいときは、この DEFS だけを見ればよいようにしてある。   */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});
  const { store, clamp } = SB.util;

  const DEFS = [
    {
      id: 'speed', icon: '⚡', name: 'ホットワックス',
      max: 4, base: 90,
      lead: '滑走の最高速が上がる',
      effect: (lv) => (lv ? `最高速 +${(lv * 1.6).toFixed(1)} m/s` : '最高速はそのまま'),
    },
    {
      id: 'jump', icon: '🥾', name: 'バネ入りブーツ',
      max: 4, base: 85,
      lead: '高く跳べて、回転トリックを決めやすい',
      effect: (lv) => (lv ? `ジャンプ力 +${lv * 11}%` : 'ジャンプ力はそのまま'),
    },
    {
      id: 'magnet', icon: '🔔', name: 'ふしぎな鈴',
      max: 3, base: 100,
      lead: '離れた鈴まで吸い寄せる',
      effect: (lv) => (lv ? `引き寄せ範囲 +${lv * 35}%` : '引き寄せ範囲はそのまま'),
    },
    {
      id: 'boost', icon: '🚀', name: 'ロケットマフラー',
      max: 3, base: 130,
      lead: 'ブーストが貯まりやすく、長く続く',
      effect: (lv) => (lv ? `ゲージ +${lv * 30}% / 時間 +${(lv * 0.45).toFixed(1)}秒` : 'ブーストはそのまま'),
    },
    {
      id: 'heart', icon: '🩵', name: 'もこもこパッド',
      max: 2, base: 260,
      lead: 'ぶつかっても平気な回数が増える',
      effect: (lv) => `ライフ ${3 + lv}`,
    },
  ];

  const Shop = {
    defs: DEFS,
    coins: 0,
    levels: {},

    load() {
      this.coins = Math.max(0, Number(store.get('sb_coins', 0)) || 0);
      let saved = {};
      try { saved = JSON.parse(store.get('sb_upgrades', '{}')) || {}; } catch (e) { saved = {}; }
      this.levels = {};
      for (const d of DEFS) {
        this.levels[d.id] = clamp(Math.floor(Number(saved[d.id]) || 0), 0, d.max);
      }
      return this;
    },

    save() {
      store.set('sb_coins', Math.floor(this.coins));
      store.set('sb_upgrades', JSON.stringify(this.levels));
    },

    lv(id) { return this.levels[id] || 0; },

    // 次のレベルの値段。上限まで上げ切っていれば null
    cost(def) {
      const lv = this.lv(def.id);
      if (lv >= def.max) return null;
      return Math.round(def.base * Math.pow(1.8, lv) / 5) * 5;
    },

    canBuy(def) {
      const c = this.cost(def);
      return c !== null && this.coins >= c;
    },

    buy(def) {
      const c = this.cost(def);
      if (c === null || this.coins < c) return false;
      this.coins -= c;
      this.levels[def.id] = this.lv(def.id) + 1;
      this.save();
      return true;
    },

    addCoins(n) {
      this.coins += Math.max(0, Math.floor(n));
      this.save();
    },

    // 開発用。コンソールから SB.shop.reset() で買い直せる
    reset() {
      this.coins = 0;
      for (const d of DEFS) this.levels[d.id] = 0;
      this.save();
    },
  };

  SB.shop = Shop.load();
})(window);
