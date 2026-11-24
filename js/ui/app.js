(function (root) {
  'use strict';

  var TG = root.TG = root.TG || {};

  function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatRank(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return String(rank);
  }

  var nameInput = document.getElementById('player-name-input');
  var btnRandomName = document.getElementById('btn-random-name');
  var langToggle = document.getElementById('lang-toggle');
  var nameCounter = document.getElementById('name-counter');

  var playField = document.getElementById('play-field');
  var hudHearts = document.getElementById('hud-hearts');
  var heartSpans = hudHearts ? hudHearts.querySelectorAll('.heart') : [];
  var hudScore = document.getElementById('hud-score');
  var hudLevel = document.getElementById('hud-level');
  var hudProgressText = document.getElementById('hud-progress-text');
  var hudProgressBar = document.getElementById('hud-progress-bar');
  var hudCombo = document.getElementById('hud-combo');
  var comboFire = document.getElementById('combo-fire');

  var dangerLine = document.getElementById('danger-line');
  var wordsContainer = document.getElementById('words-container');
  var effectsLayer = document.getElementById('effects-layer');
  var spaceship = document.getElementById('spaceship');

  var overlayIdle = document.getElementById('overlay-idle');
  var overlayCountdown = document.getElementById('overlay-countdown');
  var overlayTransition = document.getElementById('overlay-transition');
  var overlayGameover = document.getElementById('overlay-gameover');

  var btnOverlayStart = document.getElementById('btn-overlay-start');
  var countdownPlayerName = document.getElementById('countdown-player-name');
  var countdownAutoNote = document.getElementById('countdown-auto-note');
  var countdownNumber = document.getElementById('countdown-number');

  var transitionTitle = document.getElementById('transition-title');
  var transitionBonusVal = document.getElementById('transition-bonus-val');
  var transitionNextMsg = document.getElementById('transition-next-msg');

  var statScore = document.getElementById('stat-score');
  var statLevel = document.getElementById('stat-level');
  var statCorrectWords = document.getElementById('stat-correct-words');
  var statAccuracy = document.getElementById('stat-accuracy');
  var statCorrectChars = document.getElementById('stat-correct-chars');
  var statWrongKeys = document.getElementById('stat-wrong-keys');
  var statMaxCombo = document.getElementById('stat-max-combo');
  var statWpm = document.getElementById('stat-wpm');
  var gameoverRankBanner = document.getElementById('gameover-rank-banner');
  var btnRestart = document.getElementById('btn-restart');

  var boardFilterTag = document.getElementById('board-filter-tag');
  var scoresTbody = document.getElementById('scores-tbody');
  var boardMyRank = document.getElementById('board-my-rank');
  var playsTbody = document.getElementById('plays-tbody');
  var playsSubline = document.getElementById('plays-subline');

  var lb = new TG.Leaderboard(TG.createAdapter());
  var engine = null;
  var currentLanguage = 'en';
  var lastRecordId = null;
  var wordElementsMap = new Map();
  var lastCombo = 0;
  var extinguishTimer = null;

  function getComboTier(combo) {
    if (combo >= 8) return 4;
    if (combo >= 5) return 3;
    if (combo >= 3) return 2;
    if (combo >= 1) return 1;
    return 0;
  }

  function setComboFireTier(combo) {
    var tier = getComboTier(combo);
    if (tier === 0) {
      hideComboFire();
      return;
    }
    if (extinguishTimer) {
      clearTimeout(extinguishTimer);
      extinguishTimer = null;
    }
    if (!comboFire) return;
    comboFire.style.display = 'flex';
    comboFire.classList.remove('extinguishing');
    comboFire.classList.add('active');
    comboFire.classList.toggle('tier-1', tier === 1);
    comboFire.classList.toggle('tier-2', tier === 2);
    comboFire.classList.toggle('tier-3', tier === 3);
    comboFire.classList.toggle('tier-4', tier === 4);
  }

  function triggerFireFlare() {
    if (!comboFire || lastCombo < 1) return;
    comboFire.classList.remove('flaring');
    void comboFire.offsetWidth;
    comboFire.classList.add('flaring');
  }

  function extinguishComboFire() {
    if (extinguishTimer) {
      clearTimeout(extinguishTimer);
      extinguishTimer = null;
    }
    if (!comboFire) return;
    if (!comboFire.classList.contains('active')) {
      hideComboFire();
      return;
    }
    comboFire.classList.remove('flaring');
    comboFire.classList.add('extinguishing');

    extinguishTimer = setTimeout(function () {
      resetComboFire();
    }, 500);
  }

  function hideComboFire() {
    if (extinguishTimer) {
      clearTimeout(extinguishTimer);
      extinguishTimer = null;
    }
    if (comboFire) {
      comboFire.className = 'combo-fire';
      comboFire.style.display = 'none';
    }
  }

  function resetComboFire() {
    if (extinguishTimer) {
      clearTimeout(extinguishTimer);
      extinguishTimer = null;
    }
    lastCombo = 0;
    if (comboFire) {
      comboFire.className = 'combo-fire';
      comboFire.style.display = 'none';
    }
  }

  function handleComboLoss() {
    if (lastCombo > 0) {
      extinguishComboFire();
      lastCombo = 0;
    }
  }

  function updateNameCounter() {
    if (nameCounter && nameInput) nameCounter.textContent = nameInput.value.length + '/' + TG.names.MAX_LEN;
  }

  function setControlsDisabled(disabled) {
    if (nameInput) nameInput.disabled = disabled;
    if (btnRandomName) btnRandomName.disabled = disabled;
    if (langToggle) {
      var langBtns = langToggle.querySelectorAll('.seg-btn');
      for (var b = 0; b < langBtns.length; b++) langBtns[b].disabled = disabled;
      langToggle.classList.toggle('is-disabled', disabled);
    }
    if (btnOverlayStart) btnOverlayStart.disabled = disabled;
  }

  function showOverlay(overlayEl) {
    var overlays = [overlayIdle, overlayCountdown, overlayTransition, overlayGameover];
    for (var i = 0; i < overlays.length; i++) {
      if (overlays[i]) {
        if (overlays[i] === overlayEl) {
          overlays[i].classList.add('active');
        } else {
          overlays[i].classList.remove('active');
        }
      }
    }
  }

  function updateFilterTag() {
    var langLabel = 'English';
    for (var j = 0; j < TG.LANGUAGES.length; j++) {
      if (TG.LANGUAGES[j].code === currentLanguage) langLabel = TG.LANGUAGES[j].label;
    }
    if (boardFilterTag) boardFilterTag.textContent = langLabel;
  }

  function renderScoresBoard(scoresData) {
    if (!scoresTbody) return;
    if (!scoresData || !scoresData.rows || scoresData.rows.length === 0) {
      scoresTbody.innerHTML = '<tr><td colspan="5" class="td-empty">Chưa có kết quả nào</td></tr>';
      if (boardMyRank) boardMyRank.style.display = 'none';
      return;
    }

    var html = '';
    for (var i = 0; i < scoresData.rows.length; i++) {
      var r = scoresData.rows[i];
      var rowClass = r.isMine ? ' class="is-mine"' : '';
      var safeName = escapeHTML(r.name);
      var formattedScore = TG.leaderboardUtils.formatNumber(r.score);
      html += '<tr' + rowClass + '>' +
        '<td class="td-rank">' + formatRank(r.rank) + '</td>' +
        '<td class="td-name" title="' + safeName + '">' + safeName + '</td>' +
        '<td class="td-num">' + formattedScore + '</td>' +
        '<td class="td-num">' + (r.wpm || 0) + '</td>' +
        '<td class="td-num">' + r.correctWords + '</td>' +
        '</tr>';
    }
    scoresTbody.innerHTML = html;

    if (boardMyRank) {
      if (scoresData.myRank && !scoresData.inTop) {
        var myName = scoresData.myRow ? escapeHTML(scoresData.myRow.name) : '';
        var myScore = scoresData.myRow ? TG.leaderboardUtils.formatNumber(scoresData.myRow.score) : '0';
        boardMyRank.innerHTML = 'Hạng của bạn: #' + scoresData.myRank + ' (' + myName + ' • ' + myScore + ' điểm)';
        boardMyRank.style.display = 'block';
      } else {
        boardMyRank.style.display = 'none';
      }
    }
  }

  function renderPlaysBoard(playsData) {
    if (!playsTbody) return;
    if (playsSubline && playsData) {
      var totalFormatted = TG.leaderboardUtils.formatNumber(playsData.totalPlays || 0);
      var h24Formatted = TG.leaderboardUtils.formatNumber(playsData.plays24h || 0);
      playsSubline.textContent = 'Σ ' + totalFormatted + ' lượt • ' + h24Formatted + ' trong 24 tiếng';
    }

    if (!playsData || !playsData.rows || playsData.rows.length === 0) {
      playsTbody.innerHTML = '<tr><td colspan="4" class="td-empty">Chưa có lượt chơi nào</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < playsData.rows.length; i++) {
      var g = playsData.rows[i];
      var safeName = escapeHTML(g.name);
      var totalPlays = TG.leaderboardUtils.formatNumber(g.total);
      var last24hPlays = TG.leaderboardUtils.formatNumber(g.last24h);
      html += '<tr>' +
        '<td class="td-rank">' + formatRank(g.rank) + '</td>' +
        '<td class="td-name" title="' + safeName + '">' + safeName + '</td>' +
        '<td class="td-num">' + totalPlays + '</td>' +
        '<td class="td-num"><strong class="bold-24h">' + last24hPlays + '</strong></td>' +
        '</tr>';
    }
    playsTbody.innerHTML = html;
  }

  function refreshLeaderboards(highlightId) {
    if (highlightId !== undefined) {
      lastRecordId = highlightId;
    }
    updateFilterTag();
    return lb.getBoards({
      language: currentLanguage,
      highlightId: lastRecordId,
      limit: 10
    }).then(function (boards) {
      renderScoresBoard(boards.scores);
      renderPlaysBoard(boards.plays);
      return boards;
    });
  }

  function triggerLaser(from, to) {
    if (!effectsLayer) return;
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(from.x));
    line.setAttribute('y1', String(from.y));
    line.setAttribute('x2', String(to.x));
    line.setAttribute('y2', String(to.y));
    line.setAttribute('class', 'laser-beam');
    effectsLayer.appendChild(line);

    setTimeout(function () {
      if (line.parentNode) line.parentNode.removeChild(line);
    }, 120);
  }

  function triggerExplosion(x, y, width, points, multiplier) {
    if (!playField) return;
    var cx = x + width / 2;
    var cy = y + 14;

    var floatEl = document.createElement('div');
    floatEl.className = 'floating-score';
    floatEl.style.left = cx + 'px';
    floatEl.style.top = cy + 'px';
    var text = '+' + points;
    if (multiplier > 1) {
      text += ' (×' + multiplier + ')';
    }
    floatEl.textContent = text;
    playField.appendChild(floatEl);

    var blastEl = document.createElement('div');
    blastEl.className = 'blast-wave';
    blastEl.style.left = cx + 'px';
    blastEl.style.top = cy + 'px';
    playField.appendChild(blastEl);

    setTimeout(function () {
      if (floatEl.parentNode) floatEl.parentNode.removeChild(floatEl);
      if (blastEl.parentNode) blastEl.parentNode.removeChild(blastEl);
    }, 750);
  }

  function triggerMistakeShake() {
    if (!playField) return;
    playField.classList.remove('field-shake');

    void playField.offsetWidth;
    playField.classList.add('field-shake');
    setTimeout(function () {
      playField.classList.remove('field-shake');
    }, 250);
  }

  function triggerLifeLostFlash() {
    if (!playField) return;
    playField.classList.remove('field-hit');
    void playField.offsetWidth;
    playField.classList.add('field-hit');
    setTimeout(function () {
      playField.classList.remove('field-hit');
    }, 320);
  }

  function renderWords(words) {
    if (!wordsContainer) return;
    var activeIds = new Set();

    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      activeIds.add(w.id);

      var el = wordElementsMap.get(w.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'word-item';
        wordsContainer.appendChild(el);
        wordElementsMap.set(w.id, el);
      }

      el.style.left = w.x + 'px';
      el.style.top = w.y + 'px';
      el.style.width = w.width + 'px';

      if (w.locked) {
        el.classList.add('locked');
      } else {
        el.classList.remove('locked');
      }

      if (w.diving) {
        el.classList.add('diving');
      } else {
        el.classList.remove('diving');
      }

      var inner = '';
      if (w.locked && w.typedText) {
        inner = '<span class="typed-text">' + escapeHTML(w.typedText) + '</span><span class="rest-text">' + escapeHTML(w.restText) + '</span>';
      } else {
        inner = '<span class="rest-text">' + escapeHTML(w.text) + '</span>';
      }

      if (w.locked && w.hint && w.hint !== w.text) {
        inner += '<span class="telex-hint">' + escapeHTML(w.hint) + '</span>';
      }

      if (el._cachedHtml !== inner) {
        el.innerHTML = inner;
        el._cachedHtml = inner;
      }
    }

    wordElementsMap.forEach(function (el, id) {
      if (!activeIds.has(id)) {
        if (el.parentNode) el.parentNode.removeChild(el);
        wordElementsMap.delete(id);
      }
    });
  }

  function clearAllWords() {
    wordElementsMap.forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    wordElementsMap.clear();
  }

  function handleEngineFrame(state) {
    if (dangerLine) {
      dangerLine.style.top = state.dangerY + 'px';
    }

    if (spaceship) {
      spaceship.style.left = state.ship.x + 'px';
      spaceship.style.top = state.ship.y + 'px';
    }

    if (heartSpans && heartSpans.length >= 3) {
      for (var i = 0; i < 3; i++) {
        var isAlive = state.hearts && state.hearts[i];
        heartSpans[i].textContent = isAlive ? '♥' : '♡';
        heartSpans[i].className = 'heart ' + (isAlive ? 'active' : 'empty');
      }
    }
    if (hudScore) {
      hudScore.textContent = TG.leaderboardUtils.formatNumber(state.score);
    }
    if (hudLevel) {
      hudLevel.textContent = 'Ván ' + state.level;
    }
    if (hudProgressText) {
      hudProgressText.textContent = state.killedThisLevel + '/' + state.target;
    }
    if (hudProgressBar) {
      var pct = Math.min(100, Math.round((state.killedThisLevel / state.target) * 100));
      hudProgressBar.style.width = pct + '%';
    }
    if (hudCombo) {
      if (state.combo > 0) {
        hudCombo.textContent = state.combo + ' (×' + state.comboMultiplier + ')';
        hudCombo.className = 'hud-value ' + (state.combo >= 8 ? 'neon-blue-fire' : (state.combo >= 5 ? 'neon-red' : (state.combo >= 3 ? 'neon-gold' : 'neon-green')));
      } else {
        hudCombo.textContent = '0';
        hudCombo.className = 'hud-value';
      }
    }

    var currentCombo = state.combo || 0;
    if (lastCombo > 0 && currentCombo === 0) {
      handleComboLoss();
    } else if (currentCombo > 0) {
      if (currentCombo !== lastCombo) {
        setComboFireTier(currentCombo);
        lastCombo = currentCombo;
      }
    }

    if (state.state === 'countdown') {
      showOverlay(overlayCountdown);
      if (countdownNumber) {
        countdownNumber.textContent = Math.max(1, Math.ceil(state.timerMs / 1000));
      }
    } else if (state.state === 'playing') {
      showOverlay(null);
    } else if (state.state === 'levelTransition') {
      showOverlay(overlayTransition);
    } else if (state.state === 'gameover') {
      showOverlay(overlayGameover);
    }

    renderWords(state.words || []);
  }

  function attachEngineListeners(eng) {
    eng.on('frame', handleEngineFrame);

    eng.on('countdown', function (payload) {
      showOverlay(overlayCountdown);
      if (countdownPlayerName) {
        countdownPlayerName.textContent = payload.playerName;
      }
      if (countdownAutoNote) {
        countdownAutoNote.style.display = payload.nameGenerated ? 'block' : 'none';
      }
      if (countdownNumber) {
        countdownNumber.textContent = Math.max(1, Math.ceil(payload.ms / 1000));
      }
    });

    eng.on('levelStart', function () {
      showOverlay(null);
    });

    eng.on('levelComplete', function (payload) {
      if (transitionTitle) {
        transitionTitle.textContent = 'HOÀN THÀNH VÁN ' + payload.level + '!';
      }
      if (transitionBonusVal) {
        transitionBonusVal.textContent = '+' + payload.bonus + ' điểm';
      }
      if (transitionNextMsg) {
        transitionNextMsg.textContent = 'Nhấn Space để chơi Ván ' + payload.nextLevel;
      }
      showOverlay(overlayTransition);
    });

    eng.on('shot', function (payload) {
      triggerLaser(payload.from, payload.to);
    });

    eng.on('wordDestroyed', function (payload) {
      triggerExplosion(payload.x, payload.y, payload.width, payload.points, payload.multiplier);
      if (payload && payload.combo > 0) {
        setComboFireTier(payload.combo);
        lastCombo = payload.combo;
        triggerFireFlare();
      }
    });

    eng.on('wordMistake', function () {
      triggerMistakeShake();
      handleComboLoss();
    });

    eng.on('wrongKey', function () {
      triggerMistakeShake();
      handleComboLoss();
    });

    eng.on('lifeLost', function () {
      triggerLifeLostFlash();
      handleComboLoss();
    });

    eng.on('gameOver', function (payload) {
      var res = payload.result;
      if (statScore) statScore.textContent = TG.leaderboardUtils.formatNumber(res.score);
      if (statLevel) statLevel.textContent = res.levelReached;
      if (statCorrectWords) statCorrectWords.textContent = res.correctWords;
      if (statAccuracy) statAccuracy.textContent = res.accuracy + '%';
      if (statCorrectChars) statCorrectChars.textContent = res.correctChars;
      if (statWrongKeys) statWrongKeys.textContent = res.wrongKeys;
      if (statMaxCombo) statMaxCombo.textContent = res.maxCombo;
      if (statWpm) statWpm.textContent = res.wpm;

      refreshLeaderboards(payload.recordId).then(function (boards) {
        if (gameoverRankBanner) {
          if (boards.scores.myRank) {
            if (!boards.scores.inTop) {
              gameoverRankBanner.textContent = 'Hạng của bạn: #' + boards.scores.myRank;
              gameoverRankBanner.className = 'rank-banner not-in-top';
              gameoverRankBanner.style.display = 'block';
            } else {
              gameoverRankBanner.textContent = 'Hạng của bạn: #' + boards.scores.myRank + ' 🏆';
              gameoverRankBanner.className = 'rank-banner in-top';
              gameoverRankBanner.style.display = 'block';
            }
          } else {
            gameoverRankBanner.style.display = 'none';
          }
        }
      });

      setControlsDisabled(false);
      showOverlay(overlayGameover);
    });
  }

  function startNewGame() {
    resetComboFire();
    var rawName = nameInput ? nameInput.value : '';

    if (engine) {
      engine.destroy();
      clearAllWords();
    }

    var w = playField ? playField.clientWidth : 800;
    var h = playField ? playField.clientHeight : 560;

    engine = new TG.GameEngine({
      width: w,
      height: h,
      playerName: rawName,
      language: currentLanguage,
      leaderboard: lb,
      topOffset: (document.getElementById('hud-bar') || {}).offsetHeight || 0
    });

    if (nameInput) {
      nameInput.value = engine.playerName;
      updateNameCounter();
    }

    setControlsDisabled(true);
    attachEngineListeners(engine);
    engine.start();
  }

  function restartGame() {
    resetComboFire();

    startNewGame();
  }

  function initUI() {
    resetComboFire();
    if (comboFire) {
      comboFire.addEventListener('animationend', function (e) {
        if (e.animationName === 'combo-flare-pulse') {
          comboFire.classList.remove('flaring');
        }
      });
    }

    if (langToggle && TG.LANGUAGES) {
      langToggle.innerHTML = '';
      TG.LANGUAGES.forEach(function (lang) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'seg-btn' + (lang.code === currentLanguage ? ' active' : '');
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', lang.code === currentLanguage ? 'true' : 'false');
        btn.setAttribute('data-lang', lang.code);
        btn.textContent = lang.label;
        btn.addEventListener('click', function () {
          if (currentLanguage === lang.code) return;
          currentLanguage = lang.code;
          var all = langToggle.querySelectorAll('.seg-btn');
          for (var k = 0; k < all.length; k++) {
            var on = all[k] === btn;
            all[k].classList.toggle('active', on);
            all[k].setAttribute('aria-checked', on ? 'true' : 'false');
          }
          refreshLeaderboards();
        });
        langToggle.appendChild(btn);
      });
    }

    if (nameInput) {
      nameInput.addEventListener('input', updateNameCounter);
      updateNameCounter();
    }

    if (btnRandomName && nameInput) {
      btnRandomName.addEventListener('click', function () {
        nameInput.value = TG.names.randomName();
        updateNameCounter();
        if (nameInput.focus) nameInput.focus();
      });
    }

    if (btnOverlayStart) {
      btnOverlayStart.addEventListener('click', startNewGame);
    }
    if (btnRestart) {
      btnRestart.addEventListener('click', restartGame);
    }

    if (nameInput) {
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          startNewGame();
        }
      });
    }

    window.addEventListener('keydown', function (e) {
      var isSpace = e.key === ' ' || e.code === 'Space' || e.key === 'Spacebar';

      if (isSpace) {
        if (document.activeElement !== nameInput) {
          e.preventDefault();
        }
      }

      if (engine) {
        var res = engine.handleKey(e.key);
        if (res && res.preventDefault) {
          e.preventDefault();
        }
      }
    });

    window.addEventListener('resize', function () {
      if (engine && playField) {
        engine.resize(playField.clientWidth, playField.clientHeight);
      }
    });

    refreshLeaderboards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
