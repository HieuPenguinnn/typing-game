(function (root) {
  var TG = root.TG = root.TG || {};

  var PREFIXES = [
    'PhiHanhGia', 'SaoBang', 'TocDoKing', 'ThienHa', 'TenLua', 'SaoChoi', 'TinhVan', 'VuTru',
    'PhiThuyen', 'MatTroi', 'MatTrang', 'SaoHoa', 'SaoMoc', 'LoDen', 'TiaChop', 'ManhSao',
    'SieuToc', 'PhiCong', 'CometX', 'Galaxy'
  ];
  var MAX_LEN = 20;

  function randomName(rng) {
    rng = rng || Math.random;
    var prefix = PREFIXES[Math.floor(rng() * PREFIXES.length)];
    var num = String(Math.floor(rng() * 100)).padStart(2, '0');
    return prefix + num;
  }

  function sanitizeName(raw) {
    return String(raw == null ? '' : raw).trim().slice(0, MAX_LEN).trim();
  }

  // Trả về { name, generated }: tên rỗng/toàn khoảng trắng -> sinh tên ngẫu nhiên
  function resolveName(raw, rng) {
    var name = sanitizeName(raw);
    if (name) return { name: name, generated: false };
    return { name: randomName(rng), generated: true };
  }

  TG.names = {
    PREFIXES: PREFIXES,
    MAX_LEN: MAX_LEN,
    randomName: randomName,
    sanitizeName: sanitizeName,
    resolveName: resolveName
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
