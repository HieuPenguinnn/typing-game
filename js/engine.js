(function (root) {
  var TG = root.TG = root.TG || {};
  var rules = TG.rules;

  var DEFAULTS = {
    width: 800,
    height: 600,
    topOffset: 0,
    bottomOffset: 90,
    baseFallSeconds: 11,
    charWidth: 14,
    wordHeight: 28,
    countdownMs: 3000,
    levelTransitionMs: 600,
    mistakeBoost: 3,
    mistakeBoostMs: 500,
    stepMs: 16,
    language: 'en',
    playerName: '',
    leaderboard: null,
    rng: Math.random,
    now: function () { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); },
    clock: function () { return Date.now(); }
  };

  var variantCache = {};

  function keyVariants(text) {
    if (!variantCache[text]) {
      variantCache[text] = TG.telex ? TG.telex.variants(text) : [{ keys: text, progress: text.split('').map(function (_, i) { return i + 1; }) }];
    }
    return variantCache[text];
  }
  function firstKey(text) { return keyVariants(text)[0].keys[0]; }

  function Engine(options) {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    for (var j in (options || {})) if (options[j] !== undefined) o[j] = options[j];
    this.opts = o;
    this.rng = o.rng;
    this.listeners = {};
    var resolved = TG.names.resolveName(o.playerName, o.rng);
    this.playerName = resolved.name;
    this.nameGenerated = resolved.generated;
    this.language = o.language;
    this.width = o.width;
    this.height = o.height;
    this._raf = null;
    this._interval = null;
    this._reset();
  }

  Engine.prototype._reset = function () {
    this.state = 'idle';
    this.level = 1;
    this.levelConfig = rules.getLevelConfig(1);
    this.lives = rules.MAX_LIVES;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.correctWords = 0;
    this.correctChars = 0;
    this.wrongKeys = 0;
    this.completedChars = 0;
    this.killedThisLevel = 0;
    this.words = [];
    this.lockedId = null;
    this.nextId = 1;
    this.lastWord = null;
    this.playMs = 0;
    this.timerMs = 0;
    this.pendingLevelComplete = false;
    this.result = null;
    this.log = [];
    this.lastTick = null;
  };

  Engine.prototype.on = function (type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
    return this;
  };
  Engine.prototype.off = function (type, fn) {
    var l = this.listeners[type];
    if (l) this.listeners[type] = l.filter(function (f) { return f !== fn; });
    return this;
  };
  Engine.prototype._emit = function (type, payload) {
    var l = (this.listeners[type] || []).concat(this.listeners['*'] || []);
    for (var i = 0; i < l.length; i++) {
      try { l[i](payload, type); } catch (e) { if (typeof console !== 'undefined') console.error(e); }
    }
  };

  Engine.prototype.resize = function (width, height) {
    this.width = width;
    this.height = height;
  };
  Engine.prototype.dangerY = function () { return this.height - this.opts.bottomOffset; };
  Engine.prototype.shipPosition = function () {
    return { x: this.width / 2, y: this.height - this.opts.bottomOffset / 2 };
  };
  Engine.prototype._speed = function () {
    return ((this.dangerY() - this.opts.topOffset) / this.opts.baseFallSeconds) * this.levelConfig.speedMultiplier;
  };
  Engine.prototype._wordWidth = function (text) {
    return text.length * this.opts.charWidth + 16;
  };

  Engine.prototype.start = function () {
    this._stopLoop();
    this._reset();
    this.state = 'countdown';
    this.timerMs = this.opts.countdownMs;
    this.startedAt = this.opts.clock();
    this._emit('countdown', { playerName: this.playerName, nameGenerated: this.nameGenerated, ms: this.timerMs });
    this._startLoop();
    this._emitFrame();
  };

  Engine.prototype.restart = function () { this.start(); };
  Engine.prototype.destroy = function () { this._stopLoop(); this.listeners = {}; };

  Engine.prototype._startLoop = function () {
    var self = this;
    this.lastTick = this.opts.now();
    var loop = function () {
      self.tick();
      if (self.state !== 'gameover' && self.state !== 'idle') self._raf = requestAnimationFrame(loop);
    };
    if (typeof requestAnimationFrame !== 'undefined') this._raf = requestAnimationFrame(loop);

    if (typeof setInterval !== 'undefined') this._interval = setInterval(function () { self.tick(); }, 250);
  };
  Engine.prototype._stopLoop = function () {
    if (this._raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this._raf);
    if (this._interval) clearInterval(this._interval);
    this._raf = null;
    this._interval = null;
  };

  Engine.prototype.tick = function (nowMs) {
    var now = nowMs == null ? this.opts.now() : nowMs;
    if (this.lastTick == null) this.lastTick = now;
    var dt = now - this.lastTick;
    this.lastTick = now;
    this.advance(dt);
  };

  Engine.prototype.advance = function (dtMs) {
    if (this.state === 'idle' || this.state === 'gameover') return;
    var step = this.opts.stepMs;
    while (dtMs > 0 && this.state !== 'gameover') {
      var d = Math.min(step, dtMs);
      this._step(d);
      dtMs -= d;
    }
    this._emitFrame();
  };

  Engine.prototype._step = function (dt) {
    if (this.state === 'countdown') {
      this.timerMs -= dt;
      if (this.timerMs <= 0) this._beginLevel();
      return;
    }
    if (this.state === 'levelTransition') {
      if (this.timerMs > 0) this.timerMs -= dt;
      return;
    }
    if (this.state !== 'playing') return;

    this.playMs += dt;
    var speed = this._speed();
    var dangerY = this.dangerY();
    var hits = [];
    for (var i = 0; i < this.words.length; i++) {
      var w = this.words[i];
      var mult = 1;
      if (w.boostMs > 0) { mult = this.opts.mistakeBoost; w.boostMs -= dt; }
      w.y += speed * mult * (dt / 1000);
      if (w.y + this.opts.wordHeight >= dangerY) hits.push(w);
    }
    for (var h = 0; h < hits.length; h++) {
      this._wordHitBottom(hits[h]);
      if (this.state === 'gameover') return;
    }

    if (this.pendingLevelComplete) this._completeLevel();
  };

  Engine.prototype._beginLevel = function () {
    this.levelConfig = rules.getLevelConfig(this.level);
    this.killedThisLevel = 0;
    this.words = [];
    this.lockedId = null;
    this.pendingLevelComplete = false;
    this.state = 'playing';
    var top = this.opts.topOffset;
    var gap = (this.dangerY() - top) * 0.2;
    for (var i = 0; i < this.levelConfig.maxWords; i++) this._spawnWord(top - i * gap);
    this._emit('levelStart', { level: this.level, config: this.levelConfig });
  };

  Engine.prototype._completeLevel = function () {
    this.pendingLevelComplete = false;
    if (this.lives <= 0) return this._gameOver();
    var cleared = this.level;
    var bonus = rules.levelBonus(cleared, this.lives);
    this.score += bonus;
    this.log.push('L');
    this.words = [];
    this.lockedId = null;
    this.level += 1;
    this.state = 'levelTransition';
    this.timerMs = this.opts.levelTransitionMs;
    this._emit('levelComplete', {
      level: cleared, nextLevel: this.level, bonus: bonus, livesLeft: this.lives,
      score: this.score, waitForSpace: true
    });
  };

  Engine.prototype.nextLevel = function () {
    if (this.state !== 'levelTransition' || this.timerMs > 0) return false;
    this._beginLevel();
    this._emitFrame();
    return true;
  };

  Engine.prototype._pool = function () {
    var list = TG.WORDS[this.language] || TG.WORDS.en;
    var cfg = this.levelConfig;
    var pool = list.filter(function (w) { return w.length >= cfg.minLen && w.length <= cfg.maxLen; });
    if (pool.length < cfg.maxWords + 2) pool = list.slice();
    return pool;
  };

  Engine.prototype._pickWord = function () {
    var pool = this._pool();
    var self = this;
    var onScreen = {};
    var letters = {};
    this.words.forEach(function (w) { onScreen[w.text] = true; letters[firstKey(w.text)] = true; });
    var candidates = pool.filter(function (w) { return w !== self.lastWord && !onScreen[w] && !letters[firstKey(w)]; });
    if (!candidates.length) candidates = pool.filter(function (w) { return w !== self.lastWord && !onScreen[w]; });
    if (!candidates.length) candidates = pool.filter(function (w) { return w !== self.lastWord; });
    if (!candidates.length) candidates = pool;
    var word = candidates[Math.floor(this.rng() * candidates.length)];
    this.lastWord = word;
    return word;
  };

  Engine.prototype._spawnWord = function (y) {
    var text = this._pickWord();
    var width = this._wordWidth(text);
    var maxX = Math.max(0, this.width - width);
    var best = null, bestOverlap = Infinity;
    var startY = y == null ? this.opts.topOffset : y;
    for (var t = 0; t < 12; t++) {
      var x = this.rng() * maxX;
      var overlap = 0;
      for (var i = 0; i < this.words.length; i++) {
        var o = this.words[i];
        if (Math.abs(o.y - startY) > this.opts.wordHeight * 2.5) continue;
        var ow = Math.min(x + width, o.x + o.width) - Math.max(x, o.x);
        if (ow > 0) overlap += ow;
      }
      if (overlap < bestOverlap) { bestOverlap = overlap; best = x; }
      if (overlap === 0) break;
    }
    var word = { id: this.nextId++, text: text, x: best, y: startY, width: width, typed: 0, typedKeys: '', variants: keyVariants(text), matcher: TG.telex.createMatcher(text), boostMs: 0 };
    this.words.push(word);
    this._emit('wordSpawn', { word: this._wordView(word) });
    return word;
  };

  Engine.prototype._removeWord = function (word) {
    this.words = this.words.filter(function (w) { return w !== word; });
    if (this.lockedId === word.id) this.lockedId = null;
  };

  Engine.prototype._targetable = function () {
    var top = this.opts.topOffset;
    return this.words.filter(function (w) { return w.y >= top; });
  };

  Engine.prototype._nearestBottom = function (list) {
    var best = null;
    for (var i = 0; i < list.length; i++) if (!best || list[i].y > best.y) best = list[i];
    return best;
  };

  Engine.prototype._locked = function () {
    for (var i = 0; i < this.words.length; i++) if (this.words[i].id === this.lockedId) return this.words[i];
    return null;
  };

  Engine.prototype._lock = function (word, reason) {
    this.lockedId = word ? word.id : null;
    this._emit('lock', { wordId: this.lockedId, reason: reason });
  };

  Engine.prototype._autoLock = function (reason) {
    this._lock(this._nearestBottom(this._targetable()), reason);
  };

  Engine.prototype._wordHitBottom = function (word) {
    var wasLocked = this.lockedId === word.id;
    this._removeWord(word);
    this.lives -= 1;
    this.combo = 0;
    this.log.push('b');
    this._emit('lifeLost', { wordId: word.id, text: word.text, lives: this.lives, x: word.x, y: word.y });
    if (this.lives <= 0) { this._gameOver(); return; }
    this._spawnWord();
    if (wasLocked) this._autoLock('bottom');
  };

  Engine.prototype.handleKey = function (key) {
    var isSpace = key === ' ' || key === 'Spacebar' || key === 'Space';
    if (this.state === 'levelTransition') {
      if (isSpace) this.nextLevel();
      return { handled: isSpace, preventDefault: isSpace };
    }
    if (this.state !== 'playing' || this.pendingLevelComplete) {
      return { handled: false, preventDefault: isSpace && this.state !== 'idle' };
    }
    if (isSpace) { this._switchTarget(); return { handled: true, preventDefault: true }; }
    if (typeof key !== 'string' || key.length !== 1 || !/[a-z]/i.test(key)) {
      return { handled: false, preventDefault: false };
    }
    this._typeChar(key.toLowerCase());
    this._emitFrame();
    return { handled: true, preventDefault: true };
  };

  Engine.prototype._typeChar = function (ch) {
    var word = this._locked();
    if (!word) {
      var matches = this._targetable().filter(function (w) { return firstKey(w.text) === ch; });
      if (!matches.length) {
        this.wrongKeys += 1;
        this.combo = 0;
        this.log.push('m');
        this._emit('wrongKey', { key: ch, wordId: null });
        return;
      }
      word = this._nearestBottom(matches);
      this._lock(word, 'type');
    }
    var res = word.matcher.feed(ch);
    if (res.ok) {
      word.typedKeys += ch;
      word.typed = res.progress;
      this.correctChars += 1;
      this._emit('shot', { wordId: word.id, from: this.shipPosition(), to: { x: word.x + word.width / 2, y: word.y }, typed: word.typed });
      if (res.complete) this._destroyWord(word);
    } else {
      this.wrongKeys += 1;
      var expected = word.variants[0].keys[word.typedKeys.length];
      this.combo = 0;
      this.log.push('m');
      word.typed = 0;
      word.typedKeys = '';
      word.matcher.reset();
      word.boostMs = this.opts.mistakeBoostMs;
      this._emit('wordMistake', { wordId: word.id, key: ch, expected: expected });
    }
  };

  Engine.prototype._destroyWord = function (word) {
    var points = rules.wordScore(word.text.length, this.combo);
    var multiplier = rules.comboMultiplier(this.combo);
    this.score += points;
    this.combo += 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.correctWords += 1;
    this.completedChars += word.text.length;
    this.killedThisLevel += 1;
    this.log.push(String(word.text.length));
    this._removeWord(word);
    this._emit('wordDestroyed', {
      wordId: word.id, text: word.text, x: word.x, y: word.y, width: word.width,
      points: points, multiplier: multiplier, combo: this.combo
    });
    if (this.killedThisLevel >= this.levelConfig.target) {
      this.pendingLevelComplete = true;
      return;
    }
    this._spawnWord();
    this._autoLock('auto');
  };

  Engine.prototype._switchTarget = function () {
    var list = this._targetable().slice().sort(function (a, b) { return a.x - b.x; });
    if (this.words.length <= 1) return;
    var current = this._locked();
    if (!current) {
      var pick = this._nearestBottom(list);
      if (pick) this._lock(pick, 'space');
      return;
    }
    var others = list.filter(function (w) { return w.id !== current.id; });
    if (!others.length) return;
    current.typed = 0;
    current.typedKeys = '';
    current.matcher.reset();
    var idx = list.indexOf(current);
    var next = null;
    for (var i = 1; i <= list.length; i++) {
      var cand = list[(idx + i) % list.length];
      if (cand.id !== current.id) { next = cand; break; }
    }
    this._lock(next, 'space');
    this._emitFrame();
  };

  Engine.prototype._gameOver = function () {
    this.state = 'gameover';
    this.lives = Math.max(0, this.lives);
    this.pendingLevelComplete = false;
    this.lockedId = null;
    this._stopLoop();
    this.result = this.getStats();
    this.result.createdAt = this.opts.clock();
    var self = this;
    var payload = { result: this.result, recordId: null };
    var finish = function () { self._emit('gameOver', payload); self._emitFrame(); };
    if (this.opts.leaderboard) {
      this.opts.leaderboard.addResult(this.result).then(function (rec) {
        payload.recordId = rec && rec.id;
        self.result.id = payload.recordId;
        finish();
      }, function () { finish(); });
    } else {
      finish();
    }
  };

  Engine.prototype.getStats = function () {
    return {
      name: this.playerName,
      score: this.score,
      levelReached: this.level,
      correctWords: this.correctWords,
      accuracy: rules.accuracy(this.correctChars, this.wrongKeys),
      correctChars: this.correctChars,
      wrongKeys: this.wrongKeys,
      maxCombo: this.maxCombo,
      wpm: rules.wpm(this.completedChars, this.playMs),
      playMs: Math.round(this.playMs),
      log: this.log.join(','),
      language: this.language
    };
  };

  Engine.prototype._wordView = function (w) {
    return {
      id: w.id, text: w.text, x: w.x, y: w.y, width: w.width,
      typed: w.typed, typedKeys: w.typedKeys, hint: w.variants[0].keys, typedText: w.text.slice(0, w.typed), restText: w.text.slice(w.typed),
      locked: w.id === this.lockedId, diving: w.boostMs > 0
    };
  };

  Engine.prototype.getState = function () {
    var self = this;
    return {
      state: this.state,
      playerName: this.playerName,
      nameGenerated: this.nameGenerated,
      language: this.language,
      level: this.level,
      target: this.levelConfig.target,
      killedThisLevel: this.killedThisLevel,
      speedMultiplier: this.levelConfig.speedMultiplier,
      lives: this.lives,
      maxLives: rules.MAX_LIVES,
      hearts: [0, 1, 2].map(function (i) { return i < self.lives; }),
      score: this.score,
      combo: this.combo,
      comboMultiplier: rules.comboMultiplier(this.combo),
      timerMs: Math.max(0, this.timerMs),
      lockedId: this.lockedId,
      words: this.words.map(function (w) { return self._wordView(w); }),
      width: this.width,
      height: this.height,
      topOffset: this.opts.topOffset,
      dangerY: this.dangerY(),
      ship: this.shipPosition(),
      stats: this.getStats(),
      result: this.result
    };
  };

  Engine.prototype._emitFrame = function () { this._emit('frame', this.getState()); };

  TG.GameEngine = Engine;

  if (typeof module !== 'undefined' && module.exports) module.exports = TG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
