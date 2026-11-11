# Task code · Giai đoạn 1: sửa lỗi test và đổi danh sách món

**Trạng thái:** Chưa làm · **Ngày giao:** 11/11/2026 · **Làm song song với task design**

## Đọc trước

- `CLAUDE.md` (mục "Danh mục món" và "Task").
- Biên bản `docs/bien-ban/2026-11-11_hop-ket-qua-test.md`: mục 1–3 và 6.
- `docs/phan-tich/Ghi_chu_trien_khai.md`.

Làm trên nhánh mới, mỗi việc một commit, chạy `npm run typecheck` và `npm run build` trước khi commit. Mở một PR vào `main`, kèm bảng việc đã làm và cách kiểm tra từng việc trên điện thoại. **Không merge.** Những việc cần thiết kế mới (popup, chi phí, nhà cung cấp, nhân viên, mở khóa ngày, tiền đầu ngày) không làm ở task này.

## A. Đổi danh sách món (migration mới, đánh số từ `0012`)

Danh sách đã chốt: 9 món, 4 dòng.

| Dòng (`line`) | Mã | Tên | Tên ngắn | Việc |
| --- | --- | --- | --- | --- |
| xanh | `md` | Mầm Đỏ Hồng Đào | Đỏ Hồng Đào | Đổi tên (xem Câu hỏi mở) |
| xanh | `mv` | Mầm Vàng Thơm Ngon | Vàng Thơm Ngon | Giữ |
| xanh | `mden` | Mầm Đen Khỏe Mạnh | Đen Khỏe Mạnh | Giữ (sửa chính tả "Khoẻ" → "Khỏe" nếu cần) |
| sang | `sh` | Mầm Sáng Hồng Đào | Sáng Hồng Đào | Đổi tên |
| sang | `sme` *(mới)* | Mè đen · Đậu đen · Điều | Mè · Đậu đen · Điều | Thêm; tên tạm; chưa có công thức |
| lanh | `stt` | Mầm Sáng Trí Tuệ | Sáng Trí Tuệ | Chuyển `line` từ `sang` sang `lanh` |
| lanh | `lgl` *(mới)* | Gạo lứt · Hạnh nhân · Điều | Gạo lứt · Hạnh nhân | Thêm; tên tạm; chưa có công thức |
| tre | `tmc` | Mầm Sữa Matcha | Matcha | Giữ công thức cũ tới khi có công thức mới (Matcha + điều + óc chó) |
| tre | `tcc` | Mầm Sữa Cacao | Cacao | Giữ công thức cũ tới khi có công thức mới (Cacao + điều + hạnh nhân) |

- [ ] **Ngừng bán** `smt`, `lnb`, `lvx`, `lnl`, `tcb`: đặt `products.status = 'retired'`, tắt trong `outlet_menu` của mọi cơ sở, bỏ khỏi `model_default_menu`. **Không xóa** sản phẩm, giá hay công thức, vì đơn và mẻ nấu cũ còn trỏ tới.
- [ ] Thêm 2 món mới:
  - thêm vào `products` với màu theo design;
  - thêm vật tư mới `dau_den` (Đậu đen) và `gao_lut` (Gạo lứt rang), nhóm nguyên liệu chính, đơn vị g, để có chỗ khi bổ sung công thức;
  - **chưa có giá** (xem Câu hỏi mở): tạo sản phẩm nhưng để **tắt** trong `outlet_menu`; khi Tùng gửi giá thì thêm `product_prices` và bật lên.
- [ ] Đổi tên dùng `update` trên `products.name` và `short_name`. Đây là thuộc tính hiển thị nên đổi trực tiếp được; đơn cũ vẫn trỏ cùng sản phẩm.
- [ ] Sắp xếp `sort_order` theo đúng thứ tự 1 → 9.
- [ ] **Món chưa có công thức:**
  - ghi nấu vẫn được;
  - không trừ nguyên liệu, chỉ trừ bao bì;
  - màn Nấu hiện "Chưa có công thức, kho không bị trừ";
  - kiểm tra `fn_post_cook_run` không báo lỗi khi không có `recipe_id`.
- [ ] Thẻ "Cốt cold brew" ở màn Mẻ: ẩn khi cơ sở không bật món nào dùng cốt. Giữ dữ liệu.
- [ ] Kiểm tra lại cơ sở hiện có ("Test - Hạ Long", "Test v1.2 - 10.11"…): chai tồn của món ngừng bán vẫn đếm được ở đối chiếu và chuyển qua đêm đúng. Chỉ món ngừng bán **mà không còn chai** mới biến khỏi E01.
- [ ] Cập nhật `docs/phan-tich/BaBa_User_Stories.md` (12 món → 9 món), `docs/phan-tich/Ghi_chu_trien_khai.md`, và ghi chú ở Phụ lục A của Đặc tả rằng danh mục mới nằm trong migration.

## B. Sửa lỗi và cải tiến theo biên bản (CD1 → CD10)

- [ ] **CD1.** Ô số không tự bỏ dấu `-`. Gõ số âm thì báo dưới ô và không lưu. Tồn kho do hệ thống tính thì vẫn được âm. Sửa `NumberField`, `Stepper` (`src/components/ui.tsx`) và 3 ô ở `DayClose.tsx`.
- [ ] **CD2.** Màn Nấu:
  - mặc định 0;
  - nháp lưu localStorage theo khóa (cơ sở, ngày, loại kế hoạch); ghi nấu thành công thì xóa nháp;
  - `app.tsx`: sự kiện `TOKEN_REFRESHED` với cùng người dùng thì không gọi lại `reloadOutlets`;
  - kiểm lại E01, E02, D03, D05 với bước "khóa màn hình 2 phút rồi mở lại".
- [ ] **CD3.** Bỏ nút "Lấy theo 7 ngày".
- [ ] **CD4.** Đơn đã hoàn tác (gốc và bản đảo) không có trong CSV, báo cáo, Trang chủ. F03 ẩn mặc định, có công tắc "Hiện cả đơn đã hoàn tác". CSV dùng trạng thái tiếng Việt, số không nằm trong ngoặc kép, vẫn là định dạng CSV.
- [ ] **CD5.** Hoàn tác mẻ nấu:
  - được làm trong 10 phút, khi với mọi món của mẻ: *tồn qua + các mẻ khác − đã bán* ≥ 0;
  - không đạt thì ẩn nút;
  - viết migration mới thay `fn_reverse_cook_run`.
- [ ] **CD6.** Tỉ lệ hủy = hủy ÷ (nấu + tồn qua). Trang chủ hiện "N đơn · M tặng".
- [ ] **CD7.** Việc hôm nay: gom mọi "Nên đặt" thành một dòng; bấm vào mở D01.
- [ ] **CD8.** E01 thêm nút chữ (kiểu `quiet`) "Hiển thị cả những món không nấu/tồn".
- [ ] **CD9.** `fn_create_outlet` chỉ cho admin; ẩn phần tạo cơ sở ở A03 với người không phải admin. Email của Hà thêm vào `bootstrap_admins` khi Tùng gửi.
- [ ] **CD10.** Ghi kết quả vào `docs/ket-qua-test/` và cập nhật User Stories (C-1, C-2, C-3, D-1, E-1, F-1, A-3, A-4, B-2, mục phạm vi).

## Câu hỏi mở (chờ Tùng)

1. Giá bán của 2 món mới (món 5, món 7).
2. Tên món 1 và 4: "Hồng **Đào**" (danh sách mới) hay "Hồng **Hào**" (tên cũ)? Tạm thời đổi theo danh sách mới; nếu Tùng nói giữ "Hào" thì bỏ bước đổi tên.
3. Email của Hà.
4. Công thức cho món 5, món 7 và công thức mới của Matcha, Cacao (định lượng cho 1 chai).
