/* なかま（キャラクター）とレベル -----------------------------------------------
   走った距離・拾った鈴・決めた技が経験値になり、レベルが上がると新しい
   なかまが増える。見た目だけでなく、ひとつずつ得意なことを持たせてある。
   選ぶ楽しみを作るためで、どれを選んでも極端に有利にはならない範囲。

   見た目は plushie.js に渡す色と形の指定だけで表す。画像は持たない。
     ears  … 'round'(くま) / 'long'(うさぎ) / 'pointy'(ねこ) / 'none'(とり)
     face  … 'muzzle'（けもの）/ 'beak'（くちばし）                        */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});
  const { store, clamp } = SB.util;

  const CHARS = [
    {
      id: 'bear', name: 'くま', unlock: 1,
      lead: 'バランス型。鈴のコンボが切れにくい',
      perk: { combo: 0.35 },
      perkText: 'コンボの猶予 +35%',
      skin: {
        ears: 'round', face: 'muzzle',
        fur: '#e6bd91', furD: '#cfa176', belly: '#f6e7d2', muzzle: '#f8ecd9',
        earIn: '#f0aeae', hat: '#6fcbbd', hatD: '#4fae9f',
        scarf: '#e2483f', scarfD: '#b8352d', mitten: '#e2483f', mittenD: '#c96f68',
        board: '#4a7ce0', boardD: '#2f57ac', boot: '#3b4150', nose: '#5b4034',
      },
    },
    {
      id: 'rabbit', name: 'うさぎ', unlock: 3,
      lead: '長い耳とバネの脚。とにかく高く跳ぶ',
      perk: { jump: 0.14 },
      perkText: 'ジャンプ力 +14%',
      skin: {
        ears: 'long', face: 'muzzle',
        fur: '#f4f0f4', furD: '#dcd4e0', belly: '#fffdff', muzzle: '#fffafd',
        earIn: '#f7b6c8', hat: '#ffd166', hatD: '#e0ac3d',
        scarf: '#7fb4e8', scarfD: '#5b8fc4', mitten: '#7fb4e8', mittenD: '#6ba0d4',
        board: '#ff8fab', boardD: '#dd6a88', boot: '#55506a', nose: '#c47a8e',
      },
    },
    {
      id: 'penguin', name: 'ぺんぎん', unlock: 5,
      lead: '氷の上が本業。素の滑りがいちばん速い',
      perk: { speed: 1.3 },
      perkText: '最高速 +1.3 m/s',
      skin: {
        ears: 'none', face: 'beak',
        fur: '#46536b', furD: '#333e52', belly: '#f7fbff', muzzle: '#f7fbff',
        earIn: '#f7fbff', hat: '#ff6f61', hatD: '#d94f43',
        scarf: '#ffd166', scarfD: '#e0ac3d', mitten: '#ffb347', mittenD: '#e09a35',
        board: '#34c6c6', boardD: '#1f9e9e', boot: '#2b3242', nose: '#ffa62b',
      },
    },
    {
      id: 'cat', name: 'ねこ', unlock: 8,
      lead: 'ひげが鈴を見つける。遠くの鈴まで吸い寄せる',
      perk: { magnet: 0.45 },
      perkText: '鈴の引き寄せ +45%',
      skin: {
        ears: 'pointy', face: 'muzzle', whiskers: true,
        fur: '#b9c2d0', furD: '#9aa5b6', belly: '#f2f5fa', muzzle: '#fbfdff',
        earIn: '#f2a6b8', hat: '#a68cf0', hatD: '#8670d4',
        scarf: '#ffd166', scarfD: '#e0ac3d', mitten: '#ffd166', mittenD: '#e0ac3d',
        board: '#ff7b54', boardD: '#dd5c38', boot: '#3b4150', nose: '#6b5b7a',
      },
    },
    {
      id: 'panda', name: 'パンダ', unlock: 12,
      lead: 'もこもこで打たれ強い。ライフがひとつ多い',
      perk: { heart: 1 },
      perkText: 'ライフ +1',
      skin: {
        ears: 'round', face: 'muzzle',
        earOuter: '#2c2c34', eyePatch: '#2c2c34',
        fur: '#f6f4f2', furD: '#e0dcd8', belly: '#ffffff', muzzle: '#ffffff',
        earIn: '#4a4a52', hat: '#7ed957', hatD: '#5cb63c',
        scarf: '#e2483f', scarfD: '#b8352d', mitten: '#2c2c34', mittenD: '#45454f',
        board: '#ffd166', boardD: '#e0ac3d', boot: '#2c2c34', nose: '#2c2c34',
      },
    },
  ];

  const byId = {};
  for (const c of CHARS) byId[c.id] = c;

  const MAX_LEVEL = 30;

  const Chars = {
    list: CHARS,
    maxLevel: MAX_LEVEL,
    level: 1,
    xp: 0,          // 今のレベルの中での経験値
    selected: 'bear',

    /* 次のレベルまでに必要な経験値。1走りでだいたい 400〜900 くらい入るので、
       うさぎが2走りめ、ぺんぎんが4走りめ、パンダが15走りめあたりで来る。 */
    need(lv) { return 380 + (Math.max(1, lv) - 1) * 60; },

    get(id) { return byId[id] || CHARS[0]; },
    current() { return this.get(this.selected); },
    unlocked(def) { return this.level >= def.unlock; },

    /* 選んでいるなかまの得意なこと。持っていない項目は 0 */
    perk(key) {
      const p = this.current().perk || {};
      return p[key] || 0;
    },

    load() {
      this.level = clamp(Math.floor(Number(store.get('sb_level', 1)) || 1), 1, MAX_LEVEL);
      this.xp = Math.max(0, Number(store.get('sb_xp', 0)) || 0);
      const sel = store.get('sb_char', 'bear');
      // 保存が壊れていたり、まだ仲間になっていない子が入っていたらくまへ戻す
      this.selected = byId[sel] && this.level >= byId[sel].unlock ? sel : 'bear';
      return this;
    },

    save() {
      store.set('sb_level', this.level);
      store.set('sb_xp', Math.floor(this.xp));
      store.set('sb_char', this.selected);
    },

    select(id) {
      const def = byId[id];
      if (!def || !this.unlocked(def)) return false;
      this.selected = id;
      this.save();
      return true;
    },

    /* 走り終わりに経験値を足す。上がったレベルと、新しく増えたなかまを返す */
    addXp(n) {
      const gained = Math.max(0, Math.floor(n));
      const before = this.level;
      this.xp += gained;
      while (this.level < MAX_LEVEL && this.xp >= this.need(this.level)) {
        this.xp -= this.need(this.level);
        this.level++;
      }
      if (this.level >= MAX_LEVEL) this.xp = Math.min(this.xp, this.need(MAX_LEVEL));
      this.save();
      return {
        gained,
        levels: this.level - before,
        joined: CHARS.filter((c) => c.unlock > before && c.unlock <= this.level),
      };
    },

    // 開発用。コンソールから SB.chars.reset() でやり直せる
    reset() {
      this.level = 1; this.xp = 0; this.selected = 'bear';
      this.save();
    },
  };

  SB.chars = Chars.load();
})(window);
