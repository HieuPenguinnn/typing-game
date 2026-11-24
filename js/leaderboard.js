(function (root) {
  var TG = root.TG = root.TG || {};
  var DAY_MS = 24 * 60 * 60 * 1000;
  var MEDALS = ['gold', 'silver', 'bronze'];

  function medal(rank) { return rank <= 3 ? MEDALS[rank - 1] : null; }

  function compareScore(a, b) {
    return (b.score - a.score) ||
      (b.levelReached - a.levelReached) ||
      (b.correctWords - a.correctWords) ||
      (a.createdAt - b.createdAt);
  }

  // Bảng trái: lọc theo mode + language, mỗi lượt chơi là 1 dòng
  function rankScores(records, filter, limit) {
    filter = filter || {};
    var rows = records.filter(function (r) {
      return (!filter.mode || r.mode === filter.mode) &&
        (!filter.language || r.language === filter.language);
    }).slice().sort(compareScore);
    // Mỗi tên chỉ 1 dòng: giữ kỷ lục cao nhất (bản ghi đứng đầu sau khi sắp xếp)
    var seen = {};
    rows = rows.filter(function (r) {
      if (seen[r.name]) return false;
      seen[r.name] = true;
      return true;
    });
    return rows.slice(0, limit || rows.length).map(function (r, i) {
      return {
        rank: i + 1, medal: medal(i + 1), id: r.id, name: r.name, score: r.score,
        levelReached: r.levelReached, correctWords: r.correctWords,
        accuracy: r.accuracy, wpm: r.wpm, maxCombo: r.maxCombo, createdAt: r.createdAt
      };
    });
  }

  // Bảng phải: không lọc mode, gom theo tên
  function rankPlays(records, now, limit) {
    now = now == null ? Date.now() : now;
    var map = {};
    var plays24h = 0;
    records.forEach(function (r) {
      var g = map[r.name] || (map[r.name] = { name: r.name, total: 0, last24h: 0, firstAt: r.createdAt });
      g.total++;
      if (r.createdAt < g.firstAt) g.firstAt = r.createdAt;
      if (now - r.createdAt <= DAY_MS) { g.last24h++; plays24h++; }
    });
    var rows = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return (b.last24h - a.last24h) || (b.total - a.total) || (a.firstAt - b.firstAt);
    });
    return {
      totalPlays: records.length,
      plays24h: plays24h,
      rows: rows.slice(0, limit || rows.length).map(function (g, i) {
        return { rank: i + 1, medal: medal(i + 1), name: g.name, total: g.total, last24h: g.last24h };
      })
    };
  }

  function formatNumber(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function Leaderboard(adapter) {
    this.adapter = adapter || new TG.LocalStorageAdapter();
  }
  Leaderboard.prototype.addResult = function (result) {
    var record = {
      id: result.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      name: result.name,
      score: result.score,
      levelReached: result.levelReached,
      correctWords: result.correctWords,
      accuracy: result.accuracy,
      maxCombo: result.maxCombo,
      wpm: result.wpm,
      language: result.language,
      playMs: result.playMs,
      log: result.log,
      createdAt: result.createdAt || Date.now()
    };
    return this.adapter.add(record);
  };
  // Trả về { scores: { rows, myRank, myRow }, plays: { totalPlays, plays24h, rows } }
  Leaderboard.prototype.getBoards = function (opts) {
    opts = opts || {};
    var limit = opts.limit || 10;
    return this.adapter.getAll().then(function (records) {
      var all = rankScores(records, { mode: opts.mode, language: opts.language });
      // Lượt vừa chơi có thể không phải kỷ lục -> đánh dấu dòng của tên đó
      var myName = null;
      if (opts.highlightId) {
        for (var j = 0; j < records.length; j++) if (records[j].id === opts.highlightId) { myName = records[j].name; break; }
      }
      var myRow = null;
      if (myName != null) {
        for (var i = 0; i < all.length; i++) if (all[i].name === myName) { myRow = all[i]; break; }
      }
      var rows = all.slice(0, limit).map(function (r) {
        r.isMine = myName != null && r.name === myName;
        return r;
      });
      return {
        scores: { rows: rows, myRank: myRow ? myRow.rank : null, myRow: myRow, inTop: !!myRow && myRow.rank <= limit },
        plays: rankPlays(records, opts.now, limit)
      };
    });
  };

  TG.leaderboardUtils = { rankScores: rankScores, rankPlays: rankPlays, compareScore: compareScore, formatNumber: formatNumber };
  TG.Leaderboard = Leaderboard;

  if (typeof module !== 'undefined' && module.exports) module.exports = TG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
