# Sao lưu dữ liệu lên Google Drive · Kho BaBa

Phiên bản 1.0 · 13/11/2026

## Vì sao cần
Project Supabase `BaBa` đang ở gói Free, gói này không có bản sao lưu tự động nào. Sổ cái nối thêm chỉ chống lỗi thao tác trong app; nếu mất project hoặc một migration làm sai dữ liệu hàng loạt thì cần bản sao ở chỗ khác.

## Cách chạy
- Google Apps Script `scripts/sao-luu/SaoLuuBaBa.gs` chạy trong tài khoản Google của Tùng, 23:45 mỗi đêm (giờ Việt Nam).
- Script gọi hàm `fn_backup_export` (migration 0025) qua REST, nhận một file JSON chứa mọi bảng `public` và danh sách tài khoản (`id`, `email`, ngày tạo, lần đăng nhập cuối). Không có mật khẩu, phiên đăng nhập hay khóa đẩy thông báo.
- File lưu vào Drive, thư mục **Kho BaBa – Sao lưu dữ liệu**, tên `baba_YYYY-MM-DD_HHmm.json`, không mã hóa. Phần mô tả file ghi số dòng từng bảng.
- Giữ 90 ngày gần nhất, cộng bản đầu tiên của mỗi tháng (giữ mãi). Lỗi thì gửi email cho chủ script.

## Bảo vệ
- Hàm chỉ đọc. Muốn gọi phải có mã sao lưu; database chỉ giữ SHA-256 của mã trong bảng `backup_tokens` (bật RLS, không policy nên không đọc được qua API).
- Mã nằm trong script ở Drive của Tùng, không có trong repo (repo public).
- Đổi mã: `update backup_tokens set revoked_at = now();` rồi thêm SHA-256 của mã mới và sửa `MA_SAO_LUU` trong script.

## Khôi phục
- **Xem hay lấy lại vài dòng:** mở file JSON, mỗi bảng là một mảng dòng (`tables.orders`, `tables.expenses`…). Ghi lại bằng bản ghi điều chỉnh theo quy tắc sổ cái, không ghi đè.
- **Mất cả project:** tạo project mới, chạy lần lượt `supabase/migrations/`, rồi nạp dữ liệu từ JSON theo thứ tự khóa ngoại (orgs → outlets → products, ingredients → …), ví dụ `insert into t select * from jsonb_populate_recordset(null::t, '<mảng>')`. Tài khoản đăng nhập phải tạo lại (cùng email); sau đó cập nhật `user_id` cũ sang id mới. Nên diễn tập một lần trên project tạm.

## Giới hạn
- Đây là bản xuất dữ liệu (logical export), không phải bản chụp nguyên database; cấu trúc lấy lại từ migration trong repo.
- Một lần xuất đi qua một lệnh REST: khi dữ liệu lớn cỡ vài chục MB thì cần chia nhỏ theo bảng. Hiện khoảng 1–2 MB.
