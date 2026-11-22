(function (root) {
  var TG = root.TG = root.TG || {};

  // Bảng nguyên âm: [không dấu, huyền, sắc, hỏi, ngã, nặng]
  var VOWELS = {
    'a': 'aàáảãạ', 'aw': 'ăằắẳẵặ', 'aa': 'âầấẩẫậ',
    'e': 'eèéẻẽẹ', 'ee': 'êềếểễệ',
    'i': 'iìíỉĩị',
    'o': 'oòóỏõọ', 'oo': 'ôồốổỗộ', 'ow': 'ơờớởỡợ',
    'u': 'uùúủũụ', 'uw': 'ưừứửữự',
    'y': 'yỳýỷỹỵ'
  };
  var TONE_KEYS = ['', 'f', 's', 'r', 'x', 'j'];
  var CHAR_MAP = { 'đ': { keys: 'dd', tone: '' } };
  Object.keys(VOWELS).forEach(function (keys) {
    var chars = VOWELS[keys];
    for (var t = 0; t < chars.length; t++) CHAR_MAP[chars[t]] = { keys: keys, tone: TONE_KEYS[t] };
  });

  function decompose(ch) {
    if (CHAR_MAP[ch]) return CHAR_MAP[ch];
    return { keys: ch, tone: '' };
  }

  // Trả về các cách gõ Telex hợp lệ cho 1 từ:
  // [{ keys: 'phowr', progress: [số ký tự hiển thị đã xong sau mỗi phím] }]
  // Chấp nhận: dấu thanh gõ ngay sau nguyên âm mang dấu, hoặc gõ ở cuối từ; "ươ" gõ "uow" hoặc "uwow".
  function variants(word) {
    word = String(word).normalize('NFC');
    var chars = Array.from(word);
    var tokens = [];   // { len, options: [keys...], tone }
    for (var i = 0; i < chars.length; i++) {
      var d = decompose(chars[i]);
      var next = chars[i + 1] ? decompose(chars[i + 1]) : null;
      if (d.keys === 'uw' && next && next.keys === 'ow') {
        tokens.push({ len: 2, options: ['uow', 'uwow'], tone: d.tone || next.tone });
        i++;
        continue;
      }
      tokens.push({ len: 1, options: [d.keys], tone: d.tone });
    }
    var tone = '';
    tokens.forEach(function (t) { if (t.tone) tone = t.tone; });

    // tổ hợp các lựa chọn của từng token
    var combos = [[]];
    tokens.forEach(function (t) {
      var next = [];
      combos.forEach(function (c) { t.options.forEach(function (o) { next.push(c.concat([o])); }); });
      combos = next;
    });

    var out = [];
    var seen = {};
    combos.forEach(function (combo) {
      var placements = tone ? ['inline', 'end'] : ['none'];
      placements.forEach(function (place) {
        var keys = '';
        var progress = [];
        var done = 0;
        for (var k = 0; k < tokens.length; k++) {
          var part = combo[k];
          if (place === 'inline' && tokens[k].tone) part += tokens[k].tone;
          for (var p = 0; p < part.length; p++) {
            keys += part[p];
            progress.push(p === part.length - 1 ? done + tokens[k].len : done);
          }
          done += tokens[k].len;
        }
        if (place === 'end') {
          // từ chỉ xong khi gõ dấu cuối cùng
          progress[progress.length - 1] = done - 1;
          keys += tone;
          progress.push(done);
        }
        if (!seen[keys]) { seen[keys] = true; out.push({ keys: keys, progress: progress }); }
      });
    });
    return out;
  }

  // Gợi ý cách gõ (cách thứ nhất), ví dụ phở -> "phowr"
  function hint(word) { return variants(word)[0].keys; }

  // ---------- Bộ dịch Telex tự do (giống Unikey) ----------
  // Mỗi ký tự = { base, mod, tone }: base là chữ gốc a-z, mod là phím biến đổi ('w','a','e','o','d'), tone là phím dấu.
  var COMPOSE = {};
  Object.keys(CHAR_MAP).forEach(function (ch) { COMPOSE[CHAR_MAP[ch].keys + '|' + CHAR_MAP[ch].tone] = ch; });
  var TONES = { s: 1, f: 1, r: 1, x: 1, j: 1 };
  var MOD_TARGETS = { w: { a: 1, o: 1, u: 1 }, a: { a: 1 }, e: { e: 1 }, o: { o: 1 }, d: { d: 1 } };

  function parts(ch) {
    var d = CHAR_MAP[ch];
    if (!d) return { base: ch, mod: '', tone: '' };
    return { base: d.keys[0], mod: d.keys.slice(1), tone: d.tone };
  }
  function build(p) {
    if (!p.mod && !p.tone) return p.base;
    return COMPOSE[p.base + p.mod + '|' + p.tone] || null;
  }

  // Chuỗi đang gõ có thể còn trở thành target không (chỉ thiếu dấu, không sai dấu)
  function compatible(cur, target) {
    if (cur.length > target.length) return false;
    for (var i = 0; i < cur.length; i++) {
      var a = cur[i], b = target[i];
      if (a.base !== b.base) return false;
      if (a.mod && a.mod !== b.mod) return false;
      if (a.tone && a.tone !== b.tone) return false;
    }
    return true;
  }

  function key(cur) { return cur.map(build).join(''); }

  // Các trạng thái có thể sau khi gõ thêm 1 phím (phím chỉ tác động lên ký tự đã gõ trước đó)
  function step(cur, k) {
    var out = [cur.concat([{ base: k, mod: '', tone: '' }])];
    var i, p;
    if (TONES[k]) {
      for (i = 0; i < cur.length; i++) {
        p = cur[i];
        if (!VOWELS[p.base] || p.tone === k) continue;
        var withTone = cur.slice(); withTone[i] = { base: p.base, mod: p.mod, tone: k };
        if (build(withTone[i])) out.push(withTone);
      }
    }
    var targets = MOD_TARGETS[k];
    if (targets) {
      var mod = k === 'a' || k === 'e' || k === 'o' ? k : (k === 'd' ? 'd' : 'w');
      for (i = 0; i < cur.length; i++) {
        p = cur[i];
        if (!targets[p.base] || p.mod) continue;
        var next = cur.slice(); next[i] = { base: p.base, mod: mod, tone: p.tone };
        if (!build(next[i])) continue;
        out.push(next);
        // "uo" + w -> "ươ"
        if (k === 'w' && p.base === 'u' && cur[i + 1] && cur[i + 1].base === 'o' && !cur[i + 1].mod) {
          var both = next.slice(); both[i + 1] = { base: 'o', mod: 'w', tone: cur[i + 1].tone };
          out.push(both);
        }
      }
    }
    return out;
  }

  // Bộ so khớp cho 1 từ: feed(phím) -> { ok, complete, progress }
  function createMatcher(word) {
    var target = Array.from(String(word).normalize('NFC')).map(parts);
    var targetStr = String(word).normalize('NFC');
    var states = [[]];
    function progressOf(cur) {
      var n = 0;
      while (n < cur.length && build(cur[n]) === targetStr[n] && cur[n].base === target[n].base) n++;
      return n;
    }
    return {
      reset: function () { states = [[]]; },
      feed: function (k) {
        var seen = {};
        var next = [];
        states.forEach(function (cur) {
          step(cur, k).forEach(function (c) {
            if (!compatible(c, target)) return;
            var id = key(c);
            if (seen[id]) return;
            seen[id] = true;
            next.push(c);
          });
        });
        if (!next.length) return { ok: false, complete: false, progress: 0 };
        states = next;
        var best = 0, complete = false;
        states.forEach(function (c) {
          var pr = progressOf(c);
          if (pr > best) best = pr;
          if (key(c) === targetStr) complete = true;
        });
        return { ok: true, complete: complete, progress: best };
      },
      text: function () { return states.length ? key(states[0]) : ''; }
    };
  }

  TG.telex = { variants: variants, hint: hint, decompose: decompose, createMatcher: createMatcher };

  if (typeof module !== 'undefined' && module.exports) module.exports = TG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
