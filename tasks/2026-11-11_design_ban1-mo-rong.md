# Task design · Bản 1 mở rộng và danh sách món mới

**Trạng thái:** Đã làm trên nhánh `ban1-mo-rong` (11/11); migration 0012, 0013 chờ chạy trên Supabase · **Ngày giao:** 11/11/2026 · **Người duyệt:** Tùng

## Đọc trước

- Biên bản họp `docs/bien-ban/2026-11-11_hop-ket-qua-test.md` (Project: `claude/BaBa_Bien_ban_hop_2026-11-11.md`): mục 1–6.
- `docs/phan-tich/BaBa_User_Stories.md`, `docs/phan-tich/BaBa_Thiet_ke_DB.md`.

## Nơi làm

Canvas có sẵn "Kho BaBa – Thiết kế app bản 1 (phong cách hiện đại)", slug `5a78cd59-3e4a-4a15-b6be-f7d2cb82e624`. **Không tạo canvas mới.** Giữ phong cách:
- nền `#F7F7F7`; chữ Be Vietnam Pro, Quicksand chỉ dùng cho tiêu đề lớn; màu nhấn `#296241`;
- mỗi màn chỉ **một** nút nền xanh đậm; nút phụ viền xanh, nền trắng; chip nền trắng (chip đang chọn có viền và chữ xanh); nút "+" dạng viền;
- ẩn thanh cuộn; khung điện thoại 390 px; tiếng Việt, không emoji.

Sửa màn cũ thì sửa đúng artboard đó. Màn mới thì thêm artboard, đặt mã mới. Màn mới phải vẽ cả trạng thái trống và trạng thái lỗi (nếu có).

## Việc cần làm

### A. Danh sách món mới (áp dụng cho mọi màn đang vẽ món)

Danh sách đã chốt, 9 món trong 4 dòng:

| Dòng | # | Tên hiển thị | Tên ngắn trên ô | Ghi chú |
| --- | --- | --- | --- | --- |
| Mầm Xanh | 1 | Mầm Đỏ Hồng Đào | Đỏ Hồng Đào | Công thức cũ |
| Mầm Xanh | 2 | Mầm Vàng Thơm Ngon | Vàng Thơm Ngon | Công thức cũ |
| Mầm Xanh | 3 | Mầm Đen Khỏe Mạnh | Đen Khỏe Mạnh | Công thức cũ |
| Mầm Sáng | 4 | Mầm Sáng Hồng Đào | Sáng Hồng Đào | Công thức cũ |
| Mầm Sáng | 5 | Mè đen · Đậu đen · Điều *(tên tạm)* | Mè · Đậu đen · Điều | Món mới, chưa có công thức |
| Mầm Lành | 6 | Mầm Sáng Trí Tuệ | Sáng Trí Tuệ | Công thức cũ, chuyển sang dòng Mầm Lành |
| Mầm Lành | 7 | Gạo lứt · Hạnh nhân · Điều *(tên tạm)* | Gạo lứt · Hạnh nhân | Món mới, chưa có công thức |
| Mầm Trẻ | 8 | Mầm Sữa Matcha | Matcha | Công thức mới (Matcha + điều + óc chó), bổ sung sau |
| Mầm Trẻ | 9 | Mầm Sữa Cacao | Cacao | Công thức mới (Cacao + điều + hạnh nhân), bổ sung sau |

**Bỏ khỏi menu:** Sáng Mắt Trong, Lành Nhẹ Bụng, Lành Vững Xương, Lành Năng Lượng, Cold Brew.

- [x] B01 Ghi đơn và S03 (món hết, mất mạng): lưới 9 ô theo 4 dòng. Mầm Xanh 3 ô, Mầm Sáng 2, Mầm Lành 2, Mầm Trẻ 2. Kiểm tra tên tạm dài có vừa ô 112 px không; không vừa thì đề xuất cách xuống dòng hoặc cắt chữ.
- [x] C01, C02, C04 (Nấu): danh sách 9 món. Vẽ trạng thái **"Chưa có công thức"** cho món 5 và 7: vẫn chọn số chai được, nhưng phần nguyên liệu ghi "Chưa có công thức, kho không bị trừ".
- [x] D04, E01, F01: thay tên và số món.
- [x] Màu nhận diện cho món 5 và 7: đề xuất 2 màu hợp với nguyên liệu (xám đen cho mè đen, be nâu cho gạo lứt).
- [x] C03 (Mẻ): bỏ Cold Brew khỏi menu thì thẻ "Cốt cold brew" còn cần không? Đề xuất ẩn, ghi vào Câu hỏi mở.

### B. Các màn mới và màn sửa theo biên bản (mục 6, DS1 → DS12)

- [x] DS1 · Popup cảnh báo (mới): lớp phủ tối, icon cảnh báo cam, tiêu đề, nội dung, hai nút (nút chính và nút phụ viền). Vẽ 3 trường hợp: tiền lệch quá 20% (E02), kiểm kê lệch quá 30% (D05), đăng xuất khi còn đơn chờ (G01).
- [x] DS2 · Chi phí (mới):
  - danh sách theo tháng, biểu đồ tròn theo loại (Nhập hàng, Mặt bằng, Lương, Điện nước internet, Khác), lịch sử theo ngày;
  - bottom sheet thêm khoản chi; trạng thái trống;
  - khoản chi tự sinh từ phiếu nhập hàng mang nhãn "Từ phiếu nhập", không sửa tay được.
- [x] DS3 · Báo cáo cơ sở (F01 sửa): doanh thu, chi phí, lợi nhuận (= doanh thu − chi phí); biểu đồ theo tuần hoặc ngày; món bán chạy; menu "Xuất" với 3 file CSV (Đơn hàng, Theo tháng, Theo ngày); tỉ lệ hủy = hủy ÷ (nấu + tồn qua).
- [x] DS4 · Báo cáo admin (mới): bảng cơ sở × tháng gồm doanh thu, chi phí, lợi nhuận; bấm một cơ sở thì vào báo cáo của cơ sở đó; nút xuất "Toàn bộ cơ sở".
- [x] DS5 · Nhà cung cấp (mới): danh sách; chi tiết gồm liên hệ và các vật tư cung cấp; thêm và sửa; liên kết hai chiều với ô nhà cung cấp ở D02.
- [x] DS6 · Nhân viên (mới, cho chủ cơ sở): danh sách, thêm bằng email, gán vào một hoặc nhiều cơ sở mình sở hữu, gỡ.
- [x] DS7 · Quản trị (mới, cho admin): danh sách cơ sở, tạo cơ sở, thêm hoặc gỡ chủ cơ sở, danh sách admin.
- [x] DS8 · Đối chiếu:
  - E01 thêm nút chữ "Hiển thị cả những món không nấu/tồn";
  - E02 chọn một trong hai cách nhập: "Số tiền thu được" hoặc "Tổng tiền trong hộp" (app tự trừ tiền đầu ngày);
  - E03 trạng thái đã chốt có nút "Mở khóa ngày" (chỉ chủ cơ sở) và bottom sheet nhập lý do. Xem biên bản mục 5.
- [x] DS9 · Trang chủ (A04): ô tiền mặt đầu ngày; số đơn dạng "6 đơn · 1 tặng"; Việc hôm nay gom mọi "Nên đặt" thành một dòng; dòng cam "Ngày … đang mở lại, cần chốt lại". **Giữ nguyên** số chai to hơn số tiền.
- [x] DS10 · Tồn kho (D01): cơ sở mới hiện đủ danh sách vật tư (số 0) kèm thẻ "Nhập lần đầu" ở đầu; bỏ S05. **Giữ nguyên** cách giữ chip như hiện tại.
- [x] DS11 · Tài khoản (G01): mục theo vai trò. Ai cũng có Nhà cung cấp; chủ cơ sở có thêm Nhân viên; admin có thêm Quản trị và Báo cáo nhiều cơ sở. Chủ cơ sở không thấy nút tạo cơ sở.
- [x] DS13 · Nhập số liệu tháng cũ (mới, cho chủ cơ sở): dùng khi chuyển từ Knote sang. Một danh sách theo tháng các khoản đã nhập, cùng bottom sheet thêm khoản: chọn **Doanh thu** hoặc **Chi phí** (có loại chi), số tiền, tháng. Chỉ nhập được cho các tháng trước tháng hiện tại. Số liệu này cộng vào báo cáo và mang nhãn "Nhập tay".
- [x] DS12 · N01: cập nhật sơ đồ điều hướng.

Tham khảo Knote (ảnh trong biên bản) cho chi phí và lợi nhuận, nhưng vẽ theo phong cách Kho BaBa, không chép giao diện Knote.

## Cần đề xuất rồi hỏi Tùng

1. Chỗ đặt Chi phí trong điều hướng 5 tab. Đề xuất: Báo cáo có hai tab Doanh thu / Chi phí, cộng một lối tắt "Ghi chi phí" từ Trang chủ.
2. Cách hiện khoản chi tự sinh từ phiếu nhập.

## Câu hỏi mở

- Tên món 1 và 4 trong danh sách mới là "Hồng **Đào**", trong khi tên cũ là "Hồng **Hào**". Đang vẽ theo danh sách mới; chờ Tùng xác nhận.
- Món 6 "Mầm Sáng Trí Tuệ" nằm ở dòng Mầm Lành nhưng tên có chữ "Sáng". Giữ tên này?

## Bàn giao

Gửi link canvas và danh sách artboard đã thêm hoặc sửa. Không viết code app.
