/* 起動と画面まわり ---------------------------------------------------------- */
(function (global) {
  'use strict';
  const SB = global.SB;
  const { fmt, clamp, store } = SB.util;

  const $ = (id) => document.getElementById(id);

  const els = {
    hud: $('hud'), score: $('score'), distance: $('distance'), speed: $('speed'),
    combo: $('combo'), hearts: $('hearts'), boostFill: $('boost-fill'),
    boostWrap: document.querySelector('.boost-wrap'),
    title: $('screen-title'), pause: $('screen-pause'), result: $('screen-result'),
    titleBest: $('title-best'),
    resultTitle: $('result-title'), resultScore: $('result-score'),
    resultDistance: $('result-distance'), resultBells: $('result-bells'),
    resultTricks: $('result-tricks'), resultBest: $('result-best'),
    pad: $('pad'), padBoost: document.querySelector('.pad-boost'),
    shop: $('screen-shop'), shopList: $('shop-list'), shopCoins: $('shop-coins'),
    titleCoins: $('title-coins'), resultEarned: $('result-earned'), resultCoins: $('result-coins'),
    versus: $('versus'), versusName: $('versus-name'), versusGap: $('versus-gap'),
    verdict: $('result-verdict'),
    chars: $('screen-chars'), charList: $('char-list'),
    charsLv: $('chars-lv'), charsNext: $('chars-next'),
    titleLv: $('title-lv'), titleXp: $('title-xp'), titleXpFill: $('title-xpfill'),
    titleChar: $('title-char'),
    resultLv: $('result-lv'), resultXp: $('result-xp'),
    resultXpFill: $('result-xpfill'), resultLevelup: $('result-levelup'),
  };

  /* --- UI ------------------------------------------------------------ */
  const ui = {
    haptics: store.get('sb_haptics', '1') !== '0',
    sound: store.get('sb_sound', '1') !== '0',
    _lastCombo: 0,
    _lastHearts: -1,

    setScreen(name) {
      for (const key of ['title', 'pause', 'result', 'shop', 'chars']) {
        els[key].classList.toggle('hidden', key !== name);
      }
    },
    setHud(on) {
      els.hud.classList.toggle('hidden', !on);
      els.pad.classList.toggle('hidden', !on);
    },

    updateHud(d) {
      els.score.textContent = fmt(d.score);
      els.distance.textContent = fmt(d.distance);
      els.speed.textContent = fmt(d.speed);

      if (d.combo !== this._lastCombo) {
        this._lastCombo = d.combo;
        els.combo.textContent = d.combo > 1 ? `${d.combo} COMBO` : '';
        els.combo.classList.toggle('show', d.combo > 1);
      }
      if (d.hearts !== this._lastHearts || d.maxHearts !== this._lastMax) {
        this._lastHearts = d.hearts;
        this._lastMax = d.maxHearts;
        els.hearts.innerHTML = '';
        for (let i = 0; i < d.maxHearts; i++) {
          const s = document.createElement('span');
          s.textContent = '🩵';
          if (i >= d.hearts) s.className = 'lost';
          els.hearts.appendChild(s);
        }
      }
      // ライバルとの差。前にいるか後ろにいるかで色と文言を変える
      if (d.rivalName !== undefined) {
        const ahead = d.rivalGap < 0;           // 相手が後ろ＝こちらがリード
        const m = Math.round(Math.abs(d.rivalGap));
        els.versusName.textContent = d.rivalAce ? `★ ${d.rivalName}` : d.rivalName;
        els.versus.classList.toggle('ace', !!d.rivalAce);
        els.versusGap.textContent = ahead ? `${m}m リード` : `${m}m うしろ`;
        els.versus.classList.toggle('ahead', ahead);
      }

      els.boostFill.style.width = `${clamp(d.boost, 0, 100)}%`;
      const ready = d.boost >= 50 || d.boosting;
      els.boostWrap.classList.toggle('ready', ready);
      els.padBoost.classList.toggle('ready', ready);
    },

    showResult(r) {
      els.resultTitle.textContent = r.isBest ? 'ハイスコア！' : 'おつかれさま！';
      els.resultTitle.classList.toggle('new-best', r.isBest);
      els.resultScore.textContent = fmt(r.score);
      els.resultDistance.textContent = `${fmt(r.distance)} m`;
      els.resultBells.textContent = fmt(r.bells);
      els.resultTricks.textContent = fmt(r.tricks);
      els.resultBest.textContent = fmt(r.best);
      els.resultEarned.textContent = `+${fmt(r.earned)}`;
      els.resultCoins.textContent = fmt(r.coins);

      const gap = Math.round(r.rivalGap);
      const who = r.rivalAce ? `★${r.rivalName}` : r.rivalName;
      els.verdict.textContent = gap >= 0
        ? `🏆 ${who}に ${fmt(gap)}m 差で かち！${r.bonus ? ` 🔔+${r.bonus}` : ''}`
        : `${who}に ${fmt(-gap)}m 差で まけ…`;
      els.verdict.classList.toggle('win', gap >= 0);
      els.verdict.classList.toggle('ace', !!r.rivalAce);

      // 経験値。上がったぶんは文章で出す（棒だけだと気づかれない）
      const ch = SB.chars;
      els.resultLv.textContent = ch.level;
      els.resultXp.textContent = `+${fmt(r.xp.gained)}`;
      els.resultXpFill.style.width = `${clamp(ch.xp / ch.need(ch.level) * 100, 0, 100)}%`;
      const lines = [];
      if (r.xp.levels > 0) lines.push(`レベルアップ！ Lv ${ch.level}`);
      for (const c of r.xp.joined) lines.push(`🎉 ${c.name}が なかまに なった！`);
      els.resultLevelup.textContent = lines.join('\n');
      els.resultLevelup.classList.toggle('show', lines.length > 0);

      this.setScreen('result');
    },

    /* 装備一覧。買うたびに作り直す（項目が5つなので十分速い） */
    renderShop() {
      const shop = SB.shop;
      els.shopCoins.textContent = fmt(shop.coins);
      els.titleCoins.textContent = fmt(shop.coins);
      els.shopList.innerHTML = '';

      for (const def of shop.defs) {
        const lv = shop.lv(def.id);
        const cost = shop.cost(def);
        const maxed = cost === null;

        const row = document.createElement('div');
        row.className = 'shop-item' + (maxed ? ' maxed' : '');

        const icon = document.createElement('div');
        icon.className = 'shop-icon';
        icon.textContent = def.icon;

        const mid = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'shop-name';
        name.textContent = def.name;
        const eff = document.createElement('div');
        eff.className = 'shop-effect';
        // まだ買っていないうちは何が起きるか、買った後は今の効果を出す
        eff.textContent = lv === 0 ? def.lead : def.effect(lv);
        const pips = document.createElement('div');
        pips.className = 'pips';
        for (let i = 0; i < def.max; i++) {
          const pip = document.createElement('i');
          if (i < lv) pip.className = 'on';
          pips.appendChild(pip);
        }
        mid.append(name, eff, pips);

        const buy = document.createElement('button');
        buy.className = 'shop-buy' + (maxed ? ' done' : '');
        if (maxed) {
          buy.textContent = 'MAX';
          buy.disabled = true;
        } else {
          buy.textContent = `🔔 ${fmt(cost)}`;
          buy.disabled = !shop.canBuy(def);
          buy.addEventListener('click', () => {
            if (!shop.buy(def)) return;
            SB.audio.resume();
            SB.audio.coin(4);
            this.renderShop();
          });
        }

        row.append(icon, mid, buy);
        els.shopList.appendChild(row);
      }
    },

    /* なかま一覧。まだ増えていない子も、どのレベルで来るかを見せておく */
    renderChars() {
      const ch = SB.chars;
      els.charsLv.textContent = ch.level;
      const next = ch.list.find((c) => c.unlock > ch.level);
      els.charsNext.textContent = next ? `Lv ${next.unlock} で ${next.name}` : 'ぜんいん そろった！';
      els.charList.innerHTML = '';

      for (const def of ch.list) {
        const open = ch.unlocked(def);
        const row = document.createElement('button');
        row.className = 'char-item'
          + (open ? '' : ' locked')
          + (def.id === ch.selected ? ' on' : '');
        row.disabled = !open;

        // 見た目はゲーム中とまったく同じ描画関数で出す
        const cv = document.createElement('canvas');
        cv.className = 'char-face';
        cv.width = 132; cv.height = 132;
        const c = cv.getContext('2d');
        c.save();
        if (!open) c.globalAlpha = 0.25;
        // 全身が枠いっぱいに入る位置。マフラーが左へ伸びるぶん右に寄せる
        SB.drawPlushie(c, 74, 112, 64, {
          skin: def.skin, lean: 0, spin: 0, air: false, look: 1,
          tuck: 0, crash: 0, t: 0.4, blink: 1, squash: 1,
          speedRatio: 0, hideShadow: true,
        });
        c.restore();

        const mid = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'char-name';
        name.textContent = def.name;   // 名前は先に見せる（楽しみになるので）
        const eff = document.createElement('div');
        eff.className = 'char-effect';
        eff.textContent = open ? def.lead : `Lv ${def.unlock} で なかまに なる`;
        const perk = document.createElement('div');
        perk.className = 'char-perk';
        perk.textContent = open ? def.perkText : '';
        mid.append(name, eff, perk);

        row.append(cv, mid);
        if (open) {
          row.addEventListener('click', () => {
            if (!ch.select(def.id)) return;
            SB.audio.resume();
            SB.audio.ui();
            this.renderChars();
            this.refreshTitleLevel();
          });
        }
        els.charList.appendChild(row);
      }
    },

    refreshTitleLevel() {
      const ch = SB.chars;
      els.titleLv.textContent = ch.level;
      els.titleXp.textContent = `${fmt(ch.xp)} / ${fmt(ch.need(ch.level))}`;
      els.titleXpFill.style.width = `${clamp(ch.xp / ch.need(ch.level) * 100, 0, 100)}%`;
      els.titleChar.textContent = ch.current().name;
    },

    refreshTitleBest(game) {
      els.titleBest.textContent = game.best > 0
        ? `ベスト ${fmt(game.best)} 点 / ${fmt(game.bestDist)} m`
        : '';
    },
  };

  /* --- 生成 ---------------------------------------------------------- */
  const renderer = new SB.Renderer($('game'));
  const input = new SB.Input($('touch'));
  input.bindPad($('pad'));
  const game = new SB.Game(renderer, input, ui);
  SB.game = game;

  SB.audio.setEnabled(ui.sound);
  ui.refreshTitleBest(game);
  ui.refreshTitleLevel();
  ui.renderShop();
  ui.setScreen('title');
  ui.setHud(false);

  /* --- ボタン -------------------------------------------------------- */
  const tap = (el, fn) => {
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      SB.audio.resume();
      SB.audio.ui();
      fn();
    });
  };

  tap($('btn-start'), () => game.start());
  tap($('btn-retry'), () => game.start());
  tap($('btn-pause'), () => game.togglePause());
  tap($('btn-resume'), () => game.togglePause());
  tap($('btn-quit'), () => backToTitle());
  tap($('btn-chars'), () => { ui.renderChars(); ui.setScreen('chars'); });
  tap($('btn-chars2'), () => { ui.renderChars(); ui.setScreen('chars'); });
  tap($('btn-chars-close'), () => backToTitle());
  tap($('btn-shop'), () => { ui.renderShop(); ui.setScreen('shop'); });
  tap($('btn-shop2'), () => { ui.renderShop(); ui.setScreen('shop'); });
  tap($('btn-shop-close'), () => backToTitle());
  tap($('btn-title'), () => backToTitle());

  function backToTitle() {
    game.abandonRun();         // 途中でやめても拾った鈴は持ち帰る
    game.reset(true);          // 買った装備を次の走りへ反映させる
    game.state = 'title';
    ui.refreshTitleBest(game);
    ui.refreshTitleLevel();
    ui.renderShop();
    ui.setScreen('title');
    ui.setHud(false);
  }

  const soundBtn = $('btn-sound');
  tap(soundBtn, () => {
    ui.sound = !ui.sound;
    store.set('sb_sound', ui.sound ? '1' : '0');
    soundBtn.classList.toggle('on', ui.sound);
    SB.audio.setEnabled(ui.sound);
  });
  soundBtn.classList.toggle('on', ui.sound);

  const hapticsBtn = $('btn-haptics');
  tap(hapticsBtn, () => {
    ui.haptics = !ui.haptics;
    store.set('sb_haptics', ui.haptics ? '1' : '0');
    hapticsBtn.classList.toggle('on', ui.haptics);
  });
  hapticsBtn.classList.toggle('on', ui.haptics);

  // Esc / P でポーズ、タイトルとリザルトでは Enter / Space で開始
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (game.state === 'run' || game.state === 'paused') game.togglePause();
    }
    if ((e.code === 'Enter' || e.code === 'Space') && (game.state === 'title' || game.state === 'over')) {
      SB.audio.resume();
      game.start();
    }
  });

  // バックグラウンドに回ったら自動ポーズ
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'run') game.togglePause();
  });

  /* --- メインループ --------------------------------------------------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* --- PWA ------------------------------------------------------------ */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* オフライン非対応でも遊べる */ });
    });
  }
})(window);
