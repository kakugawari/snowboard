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
  };

  /* --- UI ------------------------------------------------------------ */
  const ui = {
    haptics: store.get('sb_haptics', '1') !== '0',
    sound: store.get('sb_sound', '1') !== '0',
    _lastCombo: 0,
    _lastHearts: -1,

    setScreen(name) {
      for (const key of ['title', 'pause', 'result']) {
        els[key].classList.toggle('hidden', key !== name);
      }
    },
    setHud(on) { els.hud.classList.toggle('hidden', !on); },

    updateHud(d) {
      els.score.textContent = fmt(d.score);
      els.distance.textContent = fmt(d.distance);
      els.speed.textContent = fmt(d.speed);

      if (d.combo !== this._lastCombo) {
        this._lastCombo = d.combo;
        els.combo.textContent = d.combo > 1 ? `${d.combo} COMBO` : '';
        els.combo.classList.toggle('show', d.combo > 1);
      }
      if (d.hearts !== this._lastHearts) {
        this._lastHearts = d.hearts;
        els.hearts.innerHTML = '';
        for (let i = 0; i < 3; i++) {
          const s = document.createElement('span');
          s.textContent = '🩵';
          if (i >= d.hearts) s.className = 'lost';
          els.hearts.appendChild(s);
        }
      }
      els.boostFill.style.width = `${clamp(d.boost, 0, 100)}%`;
      els.boostWrap.classList.toggle('ready', d.boost >= 50 || d.boosting);
    },

    showResult(r) {
      els.resultTitle.textContent = r.isBest ? 'ハイスコア！' : 'おつかれさま！';
      els.resultTitle.classList.toggle('new-best', r.isBest);
      els.resultScore.textContent = fmt(r.score);
      els.resultDistance.textContent = `${fmt(r.distance)} m`;
      els.resultBells.textContent = fmt(r.bells);
      els.resultTricks.textContent = fmt(r.tricks);
      els.resultBest.textContent = fmt(r.best);
      this.setScreen('result');
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
  const game = new SB.Game(renderer, input, ui);
  SB.game = game;

  SB.audio.setEnabled(ui.sound);
  ui.refreshTitleBest(game);
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
  tap($('btn-title'), () => backToTitle());

  function backToTitle() {
    game.reset(true);
    game.state = 'title';
    ui.refreshTitleBest(game);
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
