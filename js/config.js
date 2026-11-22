(function (root) {
  var TG = root.TG = root.TG || {};
  // Điền để dùng bảng xếp hạng chung (Supabase). Để trống -> lưu localStorage trên từng máy.
  TG.CONFIG = {
    supabaseUrl: '',
    supabaseAnonKey: ''
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
