/**
 * Kho BaBa · Sao lưu dữ liệu Supabase lên Google Drive mỗi đêm.
 * Chạy trong Google Apps Script của tài khoản Drive nhận bản sao lưu.
 *
 * Cài một lần:
 *   1. script.google.com → Dự án mới → dán toàn bộ file này vào Code.gs → Lưu.
 *   2. Điền MA_SAO_LUU bên dưới (mã Tùng nhận trong chat; KHÔNG đưa mã này lên GitHub).
 *   3. Chọn hàm caiLich → Chạy → cấp quyền (Drive, gửi email, kết nối ra ngoài).
 *      caiLich tạo lịch 23:45 mỗi đêm và chạy luôn một lần để kiểm tra.
 *
 * Giữ bản: 90 ngày gần nhất + bản ngày 01 của mọi tháng (giữ mãi).
 * Lỗi thì gửi email cho chủ script.
 */
const CAU_HINH = {
  SUPABASE_URL: 'https://fsqpajvjjmpyrgllrhgz.supabase.co',
  PUBLISHABLE_KEY: 'sb_publishable_Xcf9mfrkycy2ZqoxBHH-Tw_iQ60K8hV', // khóa công khai, giống trong app
  MA_SAO_LUU: '__DIEN_MA_SAO_LUU__',
  THU_MUC_ID: '15wi7SFS-53irmBOyAYiZ9Z0oEtYwoYZo', // Drive: "Kho BaBa – Sao lưu dữ liệu"
  GIU_NGAY: 90,
  BANG_BAT_BUOC: ['orders', 'order_lines', 'expenses', 'outlets', 'ingredients', 'stock_movements'],
};

function saoLuu() {
  try {
    const res = UrlFetchApp.fetch(CAU_HINH.SUPABASE_URL + '/rest/v1/rpc/fn_backup_export', {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: CAU_HINH.PUBLISHABLE_KEY },
      payload: JSON.stringify({ p_token: CAU_HINH.MA_SAO_LUU }),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    const text = res.getContentText();
    if (code !== 200) throw new Error('Supabase trả mã ' + code + ': ' + text.slice(0, 300));

    const data = JSON.parse(text);
    const tables = data.tables || {};
    const thieu = CAU_HINH.BANG_BAT_BUOC.filter((t) => !Array.isArray(tables[t]));
    if (thieu.length) throw new Error('Bản xuất thiếu bảng: ' + thieu.join(', '));

    const soDong = Object.keys(tables).map((t) => t + ': ' + tables[t].length).join(', ');
    const ten = 'baba_' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd_HHmm') + '.json';
    const thuMuc = DriveApp.getFolderById(CAU_HINH.THU_MUC_ID);
    const file = thuMuc.createFile(ten, text, 'application/json');
    file.setDescription('Xuất lúc ' + data.exported_at + ' · ' + soDong);

    donBanCu(thuMuc);
    console.log('Đã lưu ' + ten + ' (' + Math.round(text.length / 1024) + ' KB). ' + soDong);
    return ten;
  } catch (e) {
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      '[Kho BaBa] Sao lưu dữ liệu đêm nay bị lỗi',
      'Lỗi: ' + e.message + '\n\nBản sao lưu đêm nay chưa có. Mở script.google.com, dự án sao lưu Kho BaBa, chạy hàm saoLuu để thử lại.\n' +
      'Nếu lỗi là "Mã sao lưu không đúng" thì mã đã bị đổi hoặc thu hồi.'
    );
    throw e;
  }
}

/** Xóa (bỏ vào Thùng rác) bản cũ hơn GIU_NGAY ngày, trừ bản đầu tiên của mỗi tháng. */
function donBanCu(thuMuc) {
  const hanCuoi = Date.now() - CAU_HINH.GIU_NGAY * 86400000;
  const files = [];
  const it = thuMuc.getFilesByType('application/json');
  while (it.hasNext()) files.push(it.next());
  files.sort((a, b) => a.getName().localeCompare(b.getName()));
  const thangDaGiu = {};
  files.forEach((f) => {
    const m = f.getName().match(/^baba_(\d{4}-\d{2})-\d{2}_/);
    if (!m) return;
    if (!thangDaGiu[m[1]]) { thangDaGiu[m[1]] = true; return; } // bản đầu tháng: giữ mãi
    if (f.getDateCreated().getTime() < hanCuoi) f.setTrashed(true);
  });
}

/** Chạy một lần: tạo lịch 23:45 mỗi đêm (giờ Việt Nam) và sao lưu thử ngay. */
function caiLich() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'saoLuu')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('saoLuu').timeBased().everyDays(1).atHour(23).nearMinute(45)
    .inTimezone('Asia/Ho_Chi_Minh').create();
  console.log('Đã đặt lịch 23:45 mỗi đêm. Chạy thử ngay…');
  saoLuu();
}
