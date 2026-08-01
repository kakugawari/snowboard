/* 技 -------------------------------------------------------------------------
   操作は今までどおり「跳ぶ」だけ。跳んだ瞬間にこの中から1つ選ばれ、
   ポーズと名前が変わる。空中で左右に振れば回転が加わり、名前も
   「ばんざい 360°」のようにつながる。

   pose の見かた（すべて省略可）
     arms  … [左腕, 右腕] の角度。0 = 真横、+ = 上、- = 下（ラジアン）
     grab  … { side: -1|1, x: 板の上のつかむ位置 } どちらの手で板をつかむか
     lift  … 板と足を体へ引きつける量（グラブらしさはここで決まる）
     tilt  … 板だけの傾き
     roll  … 体ごとの傾き。遠くの小さい絵でも見分けがつくのはこれ
     legs  … 足の開き。1 が普段どおり、大きいと大の字、小さいと団子   */
(function (global) {
  'use strict';
  const SB = global.SB || (global.SB = {});

  const TRICKS = [
    {
      id: 'banzai', name: 'ばんざい', points: 60,
      pose: { arms: [1.15, 1.15], lift: 0.02, legs: 1.15 },
    },
    {
      id: 'butterfly', name: 'ちょうちょ', points: 70,
      pose: { arms: [0.05, 0.05], lift: 0, tilt: 0.12, legs: 1.5 },
    },
    {
      id: 'dango', name: 'だんごむし', points: 90,
      pose: { arms: [-1.25, -1.25], lift: 0.14, legs: 0.5 },
    },
    {
      id: 'rocket', name: 'ロケット', points: 85,
      pose: { arms: [1.2, 1.2], lift: -0.04, tilt: 0.28, roll: 0.4, legs: 0.7 },
    },
    {
      id: 'foldArms', name: 'うでぐみ', points: 95,
      pose: { arms: [-0.25, -0.25], lift: 0.05, roll: 0.22, legs: 0.75 },
    },
    {
      id: 'grabToe', name: 'つまさきグラブ', points: 120,
      pose: { arms: [0, 1.2], grab: { side: -1, x: -0.42 }, lift: 0.09, tilt: -0.26, roll: -0.34 },
    },
    {
      id: 'grabHeel', name: 'かかとグラブ', points: 120,
      pose: { arms: [1.2, 0], grab: { side: 1, x: 0.42 }, lift: 0.09, tilt: 0.26, roll: 0.34 },
    },
    {
      id: 'scarecrow', name: 'かかしポーズ', points: 75,
      pose: { arms: [1.2, -1.35], lift: 0.03, tilt: -0.14, roll: -0.16, legs: 1.55 },
    },
    {
      id: 'lieDown', name: 'ねそべり', points: 100,
      pose: { arms: [1.1, -1.0], lift: 0.08, tilt: 0.1, roll: -0.55, legs: 1.2 },
    },
    {
      id: 'superman', name: 'とびだしポーズ', points: 130,
      pose: { arms: [0.6, 0.6], lift: -0.06, tilt: 0.4, roll: 0.62, legs: 0.85 },
    },
  ];

  const byId = {};
  for (const t of TRICKS) byId[t.id] = t;

  SB.tricks = {
    list: TRICKS,
    get(id) { return byId[id]; },

    /* 跳ぶたびに1つ選ぶ。直前と同じ技は避けて、変化を感じられるようにする */
    pick(prevId) {
      if (TRICKS.length < 2) return TRICKS[0];
      let t = TRICKS[Math.floor(Math.random() * TRICKS.length)];
      if (t.id === prevId) {
        t = TRICKS[(TRICKS.indexOf(t) + 1 + Math.floor(Math.random() * (TRICKS.length - 1))) % TRICKS.length];
      }
      return t;
    },
  };
})(window);
