(function (root) {
  var TG = root.TG = root.TG || {};

  var LEVELS = [
    { target: 10, maxWords: 3, minLen: 3, maxLen: 5 },
    { target: 13, maxWords: 4, minLen: 4, maxLen: 6 },
    { target: 16, maxWords: 5, minLen: 5, maxLen: 8 },
    { target: 17, maxWords: 5, minLen: 6, maxLen: Infinity }
  ];
  var SPEED_STEP = 0.15;

  function getLevelConfig(level) {
    level = Math.max(1, Math.floor(level));
    var base = level <= 4
      ? LEVELS[level - 1]
      : { target: 17 + (level - 4), maxWords: 6, minLen: 6, maxLen: Infinity };
    return {
      level: level,
      target: base.target,
      maxWords: base.maxWords,
      minLen: base.minLen,
      maxLen: base.maxLen,
      speedMultiplier: Math.round((1 + SPEED_STEP * (level - 1)) * 100) / 100
    };
  }

  function comboMultiplier(combo) {
    if (combo >= 8) return 3;
    if (combo >= 5) return 2;
    if (combo >= 3) return 1.5;
    return 1;
  }

  // combo = số từ đúng liên tiếp TRƯỚC từ này ("đang combo")
  function wordScore(length, combo) {
    return Math.round((10 + 2 * length) * comboMultiplier(combo));
  }

  function levelBonus(levelCleared, livesLeft) {
    return 50 * levelCleared + 25 * livesLeft;
  }

  function accuracy(correctKeys, wrongKeys) {
    var total = correctKeys + wrongKeys;
    return total === 0 ? 0 : Math.round((correctKeys / total) * 10000) / 100;
  }

  function wpm(completedChars, elapsedMs) {
    var minutes = elapsedMs / 60000;
    return minutes <= 0 ? 0 : Math.round((completedChars / 5 / minutes) * 10) / 10;
  }

  // Tính lại kết quả từ nhật ký ván chơi (giống hệt hàm submit_result trên server).
  // Trả về { ok, error?, score, levelReached, correctWords, maxCombo, chars }
  function replayLog(log) {
    var tokens = log ? String(log).split(',') : [];
    var level = 1, cfg = getLevelConfig(1), lives = 3, score = 0, combo = 0, maxCombo = 0;
    var correct = 0, killed = 0, chars = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (lives <= 0) return { ok: false, error: 'event after game over' };
      if (t === 'm') { combo = 0; continue; }
      if (t === 'b') { lives -= 1; combo = 0; continue; }
      if (t === 'L') {
        if (killed < cfg.target) return { ok: false, error: 'level not cleared' };
        score += levelBonus(level, lives);
        level += 1; cfg = getLevelConfig(level); killed = 0;
        continue;
      }
      if (!/^\d{1,2}$/.test(t)) return { ok: false, error: 'bad token' };
      var len = Number(t);
      if (killed >= cfg.target) return { ok: false, error: 'word after level cleared' };
      if (len < cfg.minLen || len > Math.min(cfg.maxLen, 20)) return { ok: false, error: 'bad word length' };
      score += wordScore(len, combo);
      combo += 1; if (combo > maxCombo) maxCombo = combo;
      correct += 1; killed += 1; chars += len;
    }
    if (lives !== 0) return { ok: false, error: 'game not over' };
    return { ok: true, score: score, levelReached: level, correctWords: correct, maxCombo: maxCombo, chars: chars };
  }

  TG.rules = {
    replayLog: replayLog,
    MAX_LIVES: 3,
    getLevelConfig: getLevelConfig,
    comboMultiplier: comboMultiplier,
    wordScore: wordScore,
    levelBonus: levelBonus,
    accuracy: accuracy,
    wpm: wpm
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
