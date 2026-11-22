(function (root) {
  var TG = root.TG = root.TG || {};

  // Interface: { getAll(): Promise<Record[]>, add(record): Promise<Record> }
  // Record: { id, name, score, levelReached, correctWords, accuracy, maxCombo, wpm, mode, language, createdAt }

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

  // Thay thế sau này: new TG.ApiAdapter('https://server/api/results')
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

  // Bảng xếp hạng chung qua Supabase (REST). Lỗi mạng -> dùng bản lưu cục bộ.
  var COLS = { id: 'id', name: 'name', score: 'score', levelReached: 'level_reached', correctWords: 'correct_words',
    accuracy: 'accuracy', maxCombo: 'max_combo', wpm: 'wpm', language: 'language', createdAt: 'created_at' };
  function toRow(rec) { var o = {}; for (var k in COLS) o[COLS[k]] = rec[k]; return o; }
  function fromRow(row) { var o = {}; for (var k in COLS) o[k] = row[COLS[k]]; o.createdAt = Number(o.createdAt); return o; }

  function SupabaseAdapter(url, anonKey, table) {
    this.endpoint = url.replace(/\/+$/, '') + '/rest/v1/' + (table || 'results');
    this.headers = { apikey: anonKey, Authorization: 'Bearer ' + anonKey, 'Content-Type': 'application/json' };
    this.local = new LocalStorageAdapter('tg_space_typing_results_cache_v1');
  }
  SupabaseAdapter.prototype.getAll = function () {
    var self = this;
    return fetch(this.endpoint + '?select=*&order=created_at.desc&limit=10000', { headers: this.headers })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) { return rows.map(fromRow); })
      .catch(function () { return self.local.getAll(); });
  };
  SupabaseAdapter.prototype.add = function (record) {
    var self = this;
    var h = {}; for (var k in this.headers) h[k] = this.headers[k];
    h.Prefer = 'return=minimal';
    self.local.add(record);
    return fetch(this.endpoint, { method: 'POST', headers: h, body: JSON.stringify(toRow(record)) })
      .then(function () { return record; }, function () { return record; });
  };

  // Chọn nơi lưu theo TG.CONFIG (js/config.js)
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
