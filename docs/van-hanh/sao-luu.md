# Sao lưu dữ liệu lên Google Drive · Kho BaBa

Phiên bản 2.0 · 20/11/2026 · thay bản 1.0 (13/11, Apps Script gọi `fn_backup_export`, đã thôi dùng)

## Vì sao cần
Project Supabase `BaBa` đang ở gói Free, gói này không có bản sao lưu tự động nào. Sổ cái nối thêm chỉ chống lỗi thao tác trong app; nếu mất project hoặc một migration làm sai dữ liệu hàng loạt thì cần bản sao ở chỗ khác.

## Cách chạy
- `.github/workflows/backup.yml` chạy trên máy ảo GitHub Actions lúc **02:00 giờ Việt Nam** mỗi đêm (cron `0 19 * * *` UTC). Không cần máy ai bật. Chạy tay: tab Actions → Backup → Run workflow.
- `pg_dump` 17, định dạng custom, xuất các schema `public` (dữ liệu app), `auth` (tài khoản đăng nhập), `storage`, `supabase_migrations`. Lịch `pg_cron` xuất riêng thành file CSV.
- Trước khi đẩy lên, tự kiểm: file ít nhất 50 KB và có ít nhất 20 bảng dữ liệu (`pg_restore --list`). Không đạt thì job báo đỏ, không đẩy.
- `rclone` đẩy lên Google Drive, thư mục `BaBa-backup`, tên `baba_YYYY-MM-DD_HHmm.dump` và `baba_YYYY-MM-DD_HHmm_cron.csv`. Đẩy xong kiểm lại kích thước trên Drive. Giữ 60 ngày gần nhất.

## Bí mật (chỉ ghi tên, không ghi giá trị)
| Tên | Ở đâu | Là gì |
| --- | --- | --- |
| `SUPABASE_DB_URL` | GitHub → Settings → Secrets → Actions | Chuỗi kết nối **Session pooler** (`…pooler.supabase.com:5432`). Máy GitHub chỉ đi IPv4 nên không dùng địa chỉ `db.<ref>.supabase.co` |
| `RCLONE_CONF` | như trên | Cấu hình rclone có mục `[gdrive]`, quyền `drive.file` |

Mật khẩu database chỉ gồm chữ và số: ký tự `@ # / : ?` làm hỏng chuỗi kết nối và từng làm lộ một phần mật khẩu trong log công khai. Lỡ lộ thì đặt lại mật khẩu trên Supabase rồi sửa secret. Repo công khai nên log Actions ai cũng đọc được: lần chạy nào in ra dữ liệu thì xóa lần chạy đó.

## Khôi phục
- **Mất cả project:** tạo project Supabase mới cùng vùng, tải file `.dump` mới nhất, chạy `pg_restore --no-owner --no-privileges -d "<chuỗi kết nối project mới>" baba_<ngày>.dump`. Tạo lại lịch cron theo file CSV. Đổi `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` trên Vercel rồi deploy lại.
- **Lấy lại vài dòng:** `pg_restore` vào một database tạm, đọc dòng cần, ghi lại bằng bản ghi điều chỉnh theo quy tắc sổ cái, không ghi đè.
- Thứ không có trong file: khóa gửi thông báo đẩy (kho bí mật Supabase), cấu hình Auth và SMTP, Edge Function (lấy lại từ repo), biến môi trường Vercel.
- **Chưa diễn tập khôi phục lần nào.** Nên làm một lần trên project tạm và ghi thời gian, các bước tay vào đây.

## Phần cũ còn sót
Bảng `backup_tokens` và hàm `fn_backup_export` (migration 0025) của cách cũ vẫn còn trong database nhưng không dùng. Script Apps Script cũ nên tắt trigger trong tài khoản Google nếu còn chạy.
