# Kiểm thử tự động · Kho BaBa

Hai bộ kiểm thử chạy trên GitHub Actions (`.github/workflows/test.yml`) mỗi khi có pull request hoặc code vào `main`. Không bộ nào chạm vào database thật.

## 1. Database (`tests/db`)

Dựng một database trống từ **toàn bộ** file trong `supabase/migrations/`, rồi chạy các file `t_*.sql`. Vì dựng lại từ đầu, bộ này cũng kiểm luôn việc repo có đủ để tạo lại database hay không.

| File | Kiểm gì |
|---|---|
| `t_01_ghi_don.sql` | Tổng tiền, giảm 5%/10% theo phần, đơn tặng, gửi lại không trùng, hoàn tác, sửa đơn |
| `t_02_tru_kho.sql` | Trừ nguyên liệu, syrup, bao bì chai và cốc, túi theo đơn; hoàn tác cộng lại |
| `t_03_ghi_cuoi_ngay.sql` | Chai hủy trừ kho, mỗi ngày một bản, sửa, hoàn tác, nhân viên chỉ trong ngày |
| `t_04_phan_quyen.sql` | RLS: ai thấy gì; không ghi thẳng vào bảng; mọi bảng đều bật RLS |
| `t_05_gia_von_bao_cao.sql` | Giá vốn chuẩn, báo cáo lãi gộp và lãi ròng |
| `t_06_chi_phi_kho.sql` | Chi phí, nhập hàng, kiểm kê, tiền đầu ngày |
| `t_07_viec_tu_dong.sql` | Nhắc 06:00 và 21:00 |

Các file phụ:

- `00_shim.sql`: giả lập phần Supabase có sẵn mà Postgres trần không có (vai trò `anon`/`authenticated`, `auth.uid()`, `cron`, `net`, `vault`).
- `01_helpers.sql`: hàm trợ giúp trong schema `t` (`t.login`, `t.eq`, `t.throws`, `t.fixture`…).
- `after_0018.sql`: tạo tài khoản admin và cơ sở Phan Văn Hớn, là hai thứ ở production được tạo qua app trước khi các migration nhập dữ liệu chạy. File `after_<số>.sql` được chạy ngay sau migration có số đó.

### Chạy trên máy

Cần `psql` và một máy chủ Postgres (bản 16 trở lên) mà tài khoản có quyền tạo database:

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=... npm run test:db
```

Script tạo database `baba_test` (xóa nếu đã có), không đụng database nào khác.

### Thêm một kiểm thử

1. Tạo `tests/db/t_NN_ten.sql`, bọc trong `begin; … rollback;` để không để lại dữ liệu.
2. Gọi `t.fixture()` để có 2 cơ sở, 1 chủ, 1 nhân viên, 1 người ngoài.
3. Đóng vai bằng `perform t.login(<uid>)`. Muốn kiểm RLS khi đọc bảng thì thêm `set local role authenticated;`.
4. Khẳng định bằng `t.eq(thực tế, mong đợi, 'mô tả')`, `t.ok(điều kiện, 'mô tả')`, `t.throws('câu SQL', 'mô tả', 'chữ phải có trong lỗi')`.

Quy ước: mỗi migration đổi hành vi một hàm `fn_*` thì thêm hoặc sửa kiểm thử tương ứng trong cùng PR.

## 2. App (`src/lib/__tests__`)

Unit test bằng Vitest cho các hàm tính toán thuần (giảm giá, kỳ báo cáo). Chạy: `npm test`.

Con số trong `discount.test.ts` trùng với `t_01_ghi_don.sql` để phép tính ở app và ở máy chủ không lệch nhau.

## Giới hạn

- Không kiểm giao diện (bấm nút, bố cục màn hình).
- Không kiểm Edge Function (`send-push`, `tro-ly`).
- Database kiểm thử là Postgres trần có giả lập, không phải Supabase thật. Cấu trúc đã được đối chiếu khớp với production ngày 17/11/2026 (cột, ràng buộc, index, policy, trigger, hàm).
- Dữ liệu danh mục trong database kiểm thử là dữ liệu do migration tạo; những gì sửa qua màn Quản trị trên production thì không có ở đây.
