(function (root) {
  var TG = root.TG = root.TG || {};

  function LocalStorageAdapter(key, storage) {
    this.key = key || 'tg_space_typing_results_v1';
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this._memory = [];
  }
  LocalStorageAdapter.prototype._read = function () {
    if (!this.storage) return this._memory.slice();
    try {
      var data = JSON.parse(this.storage.getItem(this.key) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  };
  LocalStorageAdapter.prototype._write = function (list) {
    if (!this.storage) { this._memory = list.slice(); return; }
    try { this.storage.setItem(this.key, JSON.stringify(list)); } catch (e) { this._memory = list.slice(); }
  };
  LocalStorageAdapter.prototype.getAll = function () {
    return Promise.resolve(this._read());
  };
  LocalStorageAdapter.prototype.add = function (record) {
    var list = this._read();
    list.push(record);
    this._write(list);
    return Promise.resolve(record);
  };

  function ApiAdapter(baseUrl) { this.baseUrl = baseUrl; }
  ApiAdapter.prototype.getAll = function () {
    return fetch(this.baseUrl).then(function (r) { return r.json(); });
  };
  ApiAdapter.prototype.add = function (record) {
    return fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    }).then(function (r) { return r.json(); });
  };

  var COLS = { id: 'id', name: 'name', score: 'score', levelReached: 'level_reached', correctWords: 'correct_words',
    accuracy: 'accuracy', maxCombo: 'max_combo', wpm: 'wpm', language: 'language', createdAt: 'created_at' };
  function fromRow(row) { var o = {}; for (var k in COLS) o[k] = row[COLS[k]]; o.createdAt = Number(o.createdAt); return o; }

  function SupabaseAdapter(url, anonKey, table) {
    this.endpoint = url.replace(/\/+$/, '') + '/rest/v1/' + (table || 'results');
    this.rpc = url.replace(/\/+$/, '') + '/rest/v1/rpc/submit_result';
    this.headers = { apikey: anonKey, Authorization: 'Bearer ' + anonKey, 'Content-Type': 'application/json' };
    this.local = new LocalStorageAdapter('tg_space_typing_results_cache_v1');
  }
  SupabaseAdapter.prototype.getAll = function () {
    var self = this;
    var cols = Object.keys(COLS).map(function (k) { return COLS[k]; }).join(',');
    return fetch(this.endpoint + '?select=' + cols + '&order=created_at.desc&limit=10000', { headers: this.headers })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) { return rows.map(fromRow); })
      .catch(function () { return self.local.getAll(); });
  };
  SupabaseAdapter.prototype.add = function (record) {
    var self = this;
    var h = {}; for (var k in this.headers) h[k] = this.headers[k];
    h.Prefer = 'return=minimal';
    self.local.add(record);

    var body = {
      p_id: record.id, p_name: record.name, p_language: record.language,
      p_score: record.score, p_level_reached: record.levelReached, p_correct_words: record.correctWords,
      p_max_combo: record.maxCombo, p_accuracy: record.accuracy, p_wpm: record.wpm,
      p_play_ms: record.playMs, p_log: record.log || ''
    };
    return fetch(this.rpc, { method: 'POST', headers: h, body: JSON.stringify(body) })
      .then(function (r) {
        if (!r.ok && typeof console !== 'undefined') r.text().then(function (t) { console.warn('submit_result rejected:', t); });
        return record;
      }, function () { return record; });
  };

  function createAdapter() {
    var c = TG.CONFIG || {};
    if (c.supabaseUrl && c.supabaseAnonKey) return new SupabaseAdapter(c.supabaseUrl, c.supabaseAnonKey);
    return new LocalStorageAdapter();
  }

  TG.LocalStorageAdapter = LocalStorageAdapter;
  TG.ApiAdapter = ApiAdapter;
  TG.SupabaseAdapter = SupabaseAdapter;
  TG.createAdapter = createAdapter;

  if (typeof module !== 'undefined' && module.exports) module.exports = TG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
