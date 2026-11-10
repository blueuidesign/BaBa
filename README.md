# Kho BaBa

App bán hàng và kho cho quầy **Sữa lành từ BaBa**: ghi đơn, kế hoạch nấu, kho nguyên liệu, nhập hàng, đối chiếu cuối ngày, doanh thu.

- Frontend: React 19 + Vite + TypeScript, chạy dạng PWA (cài lên màn hình điện thoại).
- Backend: Supabase (Postgres + Auth + pg_cron). Mọi thao tác ghi đi qua hàm `fn_*` trong DB, hàm tự kiểm quyền.
- Tài liệu thiết kế: [`docs/BaBa_Thiet_ke_DB.md`](docs/BaBa_Thiet_ke_DB.md), [`docs/BaBa_User_Stories.md`](docs/BaBa_User_Stories.md).

## Chạy trên máy

```bash
cp .env.example .env.local  # đã điền sẵn URL và publishable key của project Supabase "BaBa"
npm install
npm run dev
```

## Đưa lên Vercel

1. Vercel → Add New Project → chọn repo này. Framework: Vite (tự nhận).
2. Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (lấy từ `.env.example`).
3. Deploy. `vercel.json` đã cấu hình để mọi đường dẫn trả về `index.html`.

## Cấu hình Supabase cần làm tay (một lần)

1. **Mẫu email đăng nhập phải chứa mã 6 số.** Supabase → Authentication → Email Templates → *Magic Link*: thêm `{{ .Token }}` vào nội dung, ví dụ `Mã đăng nhập Kho BaBa của bạn: {{ .Token }}`. Không có dòng này thì email chỉ có link, app không có mã để nhập.
2. **URL Configuration:** Site URL = địa chỉ Vercel; thêm cùng địa chỉ vào Redirect URLs.
3. **SMTP riêng (khuyên dùng):** SMTP mặc định của Supabase chỉ gửi vài email mỗi giờ. Khi có nhiều người dùng, cấu hình SMTP (ví dụ Resend) ở Authentication → SMTP Settings.

Migration trong `supabase/migrations` đã chạy trên project. Dựng project mới thì chạy lần lượt `0001` → `0011`.

## Phân quyền

| Vai trò | Lưu ở | Thấy gì |
|---|---|---|
| Admin | `org_memberships` | Mọi cơ sở của BaBa |
| Chủ cơ sở | `memberships.role = 'owner'` | Các cơ sở mình sở hữu, sửa cài đặt, xem mọi báo cáo |
| Nhân viên | `memberships.role = 'staff'` | Đúng cơ sở được gán, chỉ ghi đơn, nấu, nhập, đối chiếu |

Hai email `mr.tungvx@gmail.com`, `troon.org@gmail.com` nằm trong `bootstrap_admins`: lần đăng nhập đầu tiên sẽ tự thành admin.

Bản 1 chưa có màn hình phân quyền. Thêm người vào cơ sở bằng SQL (chạy trong SQL Editor):

```sql
-- người được mời đăng nhập lần đầu sẽ tự vào cơ sở với vai trò đã gán
select public.fn_invite_member('<outlet_id>', 'nhanvien@example.com', 'staff');
```

## Việc chạy ngầm (pg_cron)

| Giờ VN | Việc |
|---|---|
| 06:00 | Tạo thông báo vật tư cần đặt và sắp hết hạn |
| 21:00 | Nhắc nếu chưa đối chiếu cuối ngày |
| Chủ nhật | Dọn `audit_log` cũ |

## Giới hạn đã biết của bản 1

- Chỉ **ghi đơn** chạy được khi mất mạng (xếp hàng chờ gửi). Các màn khác cần mạng.
- Thông báo mới hiện trong app; **chưa gửi email** (cột `emailed_at` để sẵn, cần thêm Edge Function gửi qua Resend).
- Syrup chưa trừ theo mức ngọt từng đơn; số kho syrup được chỉnh qua kiểm kê hoặc ô "đo syrup" khi đối chiếu.
- Chưa có màn hình phân quyền và màn hình tổng hợp nhiều cơ sở cho founder.
