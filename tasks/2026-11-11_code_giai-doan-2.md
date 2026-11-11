# Task code · Giai đoạn 2: chi phí, lợi nhuận, quản lý người dùng và nhà cung cấp

**Trạng thái:** Đã làm trên nhánh `ban1-mo-rong` (11/11), trừ L5 và cập nhật tài liệu DB/User Stories. Migration 0012, 0013 đã chạy 11/11

## Đọc trước

- `CLAUDE.md`.
- Biên bản `docs/bien-ban/2026-11-11_hop-ket-qua-test.md`.
- Bản thiết kế đã duyệt trên canvas `5a78cd59-3e4a-4a15-b6be-f7d2cb82e624` (DS1 → DS12).

## Bước 0 · Thiết kế DB (gửi Tùng xem trước khi viết migration)

- [x] `expenses` (loại chi là check constraint 5 giá trị, chưa tách bảng `expense_categories`): sổ nối thêm, sai thì tạo bản ghi đảo kèm lý do. Khoản chi tự sinh từ phiếu nhập có giá trỏ về `purchases`.
- [x] `cash_opens`: tiền mặt đầu ngày theo (cơ sở, ngày), nối thêm.
- [x] Mở khóa ngày đã chốt: thêm bản ghi mới, không sửa bản chốt cũ. Đơn ở ngày đang mở lại được ghi như ngày chưa chốt.
- [x] Nhân viên và chủ cơ sở: dùng `memberships` và `org_memberships` sẵn có; thêm hàm cho chủ cơ sở thêm hoặc gỡ `staff`, admin thêm hoặc gỡ `owner`.
- [x] Nhà cung cấp: `suppliers` + `outlet_ingredient_settings.supplier_id`.
- [ ] Cập nhật `docs/phan-tich/BaBa_Thiet_ke_DB.md` lên 1.3, User Stories lên 1.2. Tạm ghi khác biệt ở `Ghi_chu_trien_khai.md` 1.1.

## Làm theo thứ tự

- [x] Popup cảnh báo dùng chung; thay mọi `confirm()` trong app.
- [x] Chi phí: ghi, danh sách, thống kê theo loại.
- [x] Nhập số liệu tháng cũ (chủ cơ sở và admin): bảng `historical_entries` nối thêm, gồm (cơ sở, tháng, loại doanh thu hoặc chi phí, loại chi, số tiền, ghi chú). Chỉ nhập cho tháng trước tháng hiện tại; sai thì tạo bản đảo. Báo cáo cộng số liệu này vào, có nhãn "Nhập tay".
- [x] Báo cáo cơ sở: doanh thu, chi phí, lợi nhuận.
- [x] CSV Theo tháng và Theo ngày.
- [x] Báo cáo và xuất file toàn bộ cơ sở cho admin.
- [x] Nhà cung cấp.
- [x] Nhân viên (chủ cơ sở).
- [x] Quản trị chủ cơ sở (admin).
- [x] Mở khóa ngày đã chốt (chỉ chủ cơ sở và admin).
- [x] Tiền mặt đầu ngày và hai cách nhập tiền ở E02.
- [x] D01 hiện đủ vật tư cho cơ sở mới.
- [ ] L5 (chưa làm, chờ Tùng chốt): E01 báo theo từng món khi số còn lớn hơn *nấu + tồn qua − đơn ghi* (nếu Tùng đã chốt).

Chia thành vài PR theo nhóm tính năng; mỗi PR có cách kiểm tra trên điện thoại. **Không merge.**
