# Ghi chú triển khai · Kho BaBa bản 1

Phiên bản 1.0 · 10/11/2026

Tài liệu này ghi lại **code thực tế khác thiết kế ở đâu**, màn hình nằm ở file nào, và còn thiếu những gì. Đọc sau `BaBa_User_Stories.md` và `BaBa_Thiet_ke_DB.md`. Nếu tài liệu này mâu thuẫn với hai tài liệu kia về chuyện **code đang làm gì**, tin tài liệu này. Còn chuyện **code nên làm gì**, tin User Stories.

---

## 1. Trạng thái

| Hạng mục | Trạng thái |
| --- | --- |
| Database (migration 0001–0011) | Đã chạy trên Supabase project `fsqpajvjjmpyrgllrhgz`. Đã kiểm thử luồng nấu → bán → đối chiếu → chuyển tồn trong transaction rollback |
| Frontend 18 trang | Đã code, `npm run typecheck` và `npm run build` sạch. Chưa có test tự động |
| Deploy | Repo đã nối Vercel; cần 2 biến môi trường (xem README) |
| Đăng nhập bằng mã 6 số | **Đang chặn.** Supabase gói Free không cho sửa mẫu email khi chưa có custom SMTP, mà mẫu mặc định chỉ có link. Cần cài SMTP Resend rồi thêm `{{ .Token }}` vào mẫu "Magic link or OTP" và "Confirm sign up". Tạm thời bấm link trong email vẫn đăng nhập được (app tự nhận phiên từ URL), điều kiện Site URL trỏ đúng địa chỉ Vercel |
| Email nhắc đặt hàng | Chưa có. Thông báo chỉ hiện trong app (`notifications.emailed_at` luôn null) |

---

## 2. Màn hình ↔ đường dẫn ↔ file

Bản thiết kế gốc là artifact Design `5a78cd59-3e4a-4a15-b6be-f7d2cb82e624` trên claude.ai. Bản xuất HTML của từng màn nằm ở `docs/thiet-ke/man-hinh/<mã>.dc.html` (mở bằng trình duyệt; `Main.dc.html` là A01). `N01.dc.html` là sơ đồ điều hướng.

| Mã | Tên | Route | File |
| --- | --- | --- | --- |
| A01, A02, S01 | Đăng nhập, nhập mã, lỗi mã | (khi chưa đăng nhập) | `src/pages/Login.tsx` |
| A03 | Chọn / tạo cơ sở | `/co-so` | `src/pages/Outlets.tsx` |
| A04, S02 | Trang chủ, trang chủ trống đầu ngày | `/` | `src/pages/Home.tsx` |
| B01, S03, S04 | Ghi đơn, mất mạng / món hết, lỗi lưu | `/ban` | `src/pages/Order.tsx` |
| B02 | Đã lưu đơn | `/ban/da-luu` | `src/pages/OrderSaved.tsx` |
| C01 | Kế hoạch nấu | `/nau` | `src/pages/CookPlan.tsx` |
| C02, C04 | Nguyên liệu tổng / theo món, ghi đã nấu | `/nau/nguyen-lieu?plan=&xem=mon` | `src/pages/Ingredients.tsx` |
| C03 | Mẻ syrup, cốt | `/nau/me` | `src/pages/Batches.tsx` |
| D01, S05 | Tồn kho, kho trống | `/kho` | `src/pages/Stock.tsx` |
| D02 | Chi tiết vật tư | `/kho/:id` | `src/pages/StockItem.tsx` |
| D03 | Nhập hàng | `/kho/nhap?vt=` | `src/pages/Purchase.tsx` |
| D04 | Chai đang có | `/kho/chai` | `src/pages/Bottles.tsx` |
| D05 | Kiểm kê | `/kho/kiem-ke` | `src/pages/StockCount.tsx` |
| E01–E03 | Đối chiếu cuối ngày (3 bước trong một trang) | `/doi-chieu?ngay=` | `src/pages/DayClose.tsx` |
| F01 | Doanh thu | `/bao-cao` | `src/pages/Revenue.tsx` |
| F02 | Thông báo | `/thong-bao` | `src/pages/Notifications.tsx` |
| F03 | Lịch sử | `/lich-su` | `src/pages/History.tsx` |
| G01 | Tài khoản | `/tai-khoan` | `src/pages/Account.tsx` |

Dùng chung: `src/lib/app.tsx` (phiên, cơ sở, danh mục, hàng đợi, `bump()` để làm mới dữ liệu), `src/lib/data.ts` (`useLoad`, truy vấn hay dùng), `src/lib/queue.ts` (hàng đợi ngoại tuyến), `src/lib/format.ts` (tiền, ngày VN), `src/components/ui.tsx` (Header, Nav, Stepper, Icon…), `src/styles.css` (theme).

---

## 3. Khác với `BaBa_Thiet_ke_DB.md`

| Thiết kế ghi | Code thực tế | Lý do / ảnh hưởng |
| --- | --- | --- |
| View `v_bottles_on_hand` | Hàm `fn_bottles_on_hand(p_outlet, p_date)` trả `product_id, carried, cooked, sold, left_qty, closed` | Cần tham số ngày và đệ quy tồn qua; view không làm gọn được |
| Cột `ingredients.group` | Cột `grp` | `group` là từ khóa SQL |
| Thứ tự migration ở mục 8 | Thực tế: 0001 core · 0002 catalog · 0003 outlet_settings · 0004 ledger · 0005 views · 0006 functions · 0007 policies · 0008 seed · 0009 jobs · 0010 display_fix (`fmt_qty`, viết lại `v_activity`) · 0011 security_hardening | Mọi migration mới đánh số tiếp từ 0012 |
| RPC `fn_ingredients_needed` | Không có; C02/C04 tính ở client từ `catalog.allProducts[].recipe` và `catalog.packaging` | Danh mục đã tải sẵn ở client, đỡ một lượt gọi |
| Partition sẵn cho `stock_movements` | Chưa partition; chưa có `stock_balances_daily` | Làm khi vượt ngưỡng ở mục 7b |
| Edge Function `send-digest-email` | Chưa có | Chờ SMTP/Resend |
| `fn_close_day(outlet_id, business_date, payload)` | `fn_close_day(p jsonb, p_commit boolean)`; `p_commit = false` trả bản xem trước, `true` thì ghi | Màn E03 cần xem trước khi chốt |
| Đánh dấu tặng | `fn_mark_gift(p_order)`: đảo đơn gốc rồi tạo đơn `is_gift` giá 0 | Đúng story B-2 |
| Giờ cron | `pg_cron` chạy theo UTC: `0 23 * * *` (06:00 VN), `0 14 * * *` (21:00 VN) | |

---

## 4. Khác với User Stories (chưa làm hoặc làm khác)

| Story | Chưa đạt | Ghi chú |
| --- | --- | --- |
| A-1 | Mã hết hạn sau 10 phút; khóa 5 lần sai | Đang theo mặc định Supabase Auth (mã sống 1 giờ). Chỉnh ở Authentication → Sign In / Providers → Email |
| S-1 | Ghi nấu, nhập hàng, kiểm kê **chưa** chạy ngoại tuyến | Chỉ ghi đơn đi qua hàng đợi `callOrQueue`. Các màn khác gọi RPC trực tiếp, mất mạng thì báo lỗi |
| F-2 | Email nhắc, thông báo đẩy | Chưa có; `push_subscriptions` mới có bảng |
| F-1 | Xuất file nền khi > 20.000 dòng | CSV xuất thẳng ở client |
| D-3 | Ảnh hóa đơn | Chưa có ô tải ảnh; cột `receipt_url` đã có |
| A-5 | Xóa dữ liệu tạm khi đăng xuất | Cần kiểm tra lại |

---

## 5. Việc vận hành cần làm tay

1. Cài custom SMTP (Resend) cho Supabase, sửa 2 mẫu email có `{{ .Token }}`, đặt Email OTP Length = 6.
2. Supabase → Authentication → URL Configuration: Site URL và Redirect URLs = địa chỉ Vercel.
3. Mời người vào cơ sở: `select public.fn_invite_member('<outlet_id>', '<email>', 'staff');` trong SQL Editor (chưa có màn hình).
4. Khi chạy thật: nâng Supabase lên gói Pro để không bị tạm dừng sau 7 ngày không dùng, bật PITR.

---

## 6. Câu hỏi cần hỏi Hà

- Ngoài đơn, Hà có cần ghi nấu và nhập hàng khi mất mạng không, hay lúc đó thường đang ở nhà có wifi?
- Cuối ngày Hà có nhận chuyển khoản không, và xem tổng chuyển khoản trong ngày ở app ngân hàng nào?
- Nhân viên có được xem doanh thu tháng không (hiện chỉ xem hôm nay)?
