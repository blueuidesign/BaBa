# Task code · Giai đoạn 2: chi phí, lợi nhuận, quản lý người dùng và nhà cung cấp

**Trạng thái:** Chờ (chỉ bắt đầu khi Tùng đã duyệt task design `2026-11-11_design_ban1-mo-rong.md`)

## Đọc trước

- `CLAUDE.md`.
- Biên bản `docs/bien-ban/2026-11-11_hop-ket-qua-test.md`.
- Bản thiết kế đã duyệt trên canvas `5a78cd59-3e4a-4a15-b6be-f7d2cb82e624` (DS1 → DS12).

## Bước 0 · Thiết kế DB (gửi Tùng xem trước khi viết migration)

- [ ] `expenses` + `expense_categories`: sổ nối thêm, sai thì tạo bản ghi đảo kèm lý do. Khoản chi tự sinh từ phiếu nhập có giá trỏ về `purchases`.
- [ ] `cash_opens`: tiền mặt đầu ngày theo (cơ sở, ngày), nối thêm.
- [ ] Mở khóa ngày đã chốt: thêm bản ghi mới, không sửa bản chốt cũ. Đơn ở ngày đang mở lại được ghi như ngày chưa chốt.
- [ ] Nhân viên và chủ cơ sở: dùng `memberships` và `org_memberships` sẵn có; thêm hàm cho chủ cơ sở thêm hoặc gỡ `staff`, admin thêm hoặc gỡ `owner`.
- [ ] Nhà cung cấp: `suppliers` + `outlet_ingredient_settings.supplier_id`.
- [ ] Cập nhật `docs/phan-tich/BaBa_Thiet_ke_DB.md` lên 1.3, User Stories lên 1.2.

## Làm theo thứ tự

- [ ] Popup cảnh báo dùng chung; thay mọi `confirm()` trong app.
- [ ] Chi phí: ghi, danh sách, thống kê theo loại.
- [ ] Báo cáo cơ sở: doanh thu, chi phí, lợi nhuận.
- [ ] CSV Theo tháng và Theo ngày.
- [ ] Báo cáo và xuất file toàn bộ cơ sở cho admin.
- [ ] Nhà cung cấp.
- [ ] Nhân viên (chủ cơ sở).
- [ ] Quản trị chủ cơ sở (admin).
- [ ] Mở khóa ngày đã chốt (chỉ chủ cơ sở và admin).
- [ ] Tiền mặt đầu ngày và hai cách nhập tiền ở E02.
- [ ] D01 hiện đủ vật tư cho cơ sở mới.
- [ ] L5: E01 báo theo từng món khi số còn lớn hơn *nấu + tồn qua − đơn ghi* (nếu Tùng đã chốt).

Chia thành vài PR theo nhóm tính năng; mỗi PR có cách kiểm tra trên điện thoại. **Không merge.**
