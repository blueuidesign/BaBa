# Biên bản họp · Kết quả test bản 1 và việc tiếp theo

Ngày 11/11/2026 · Người quyết định: Tùng · Người ghi: Claude

**Đầu vào:**
- Tổng hợp test tự động `BaBa_Tong_hop_test_v1.2.md` (84/117 case, 9 case hỏng);
- Ghi chú test tay của Đức `Cải tiến.txt`;
- Kết quả test nhanh 10/11 (PR #5, mã T1110-xx);
- Ảnh app Knote (màn Tổng quan và Chi phí) làm tham khảo cho phần chi phí và lợi nhuận.

**Kết luận chung.** Luồng chính chạy được. Đợt này chia làm hai việc lớn:

1. **Sửa ngay** các lỗi làm sai dữ liệu. Việc này không cần thiết kế lại.
2. **Mở rộng bản 1** thêm bốn phần: chi phí và lợi nhuận, báo cáo nhiều cơ sở cho admin, quản lý nhân viên và chủ cơ sở, quản lý nhà cung cấp. Bốn phần này phải thiết kế và được Tùng duyệt rồi mới code.

Mục "Ngoài phạm vi bản 1" trong User Stories bỏ dòng "chi phí vận hành, lợi nhuận", vì phần này đưa vào bản 1.

---

## 1. Quyết định về lỗi

### L1 · Ô nhập số bỏ dấu trừ mà không báo · **Sửa ngay**

**Màn bị ảnh hưởng.** Đã kiểm tra trong code. Mọi ô số đều xóa ký tự `-` rồi lưu phần còn lại. Lỗi nằm ở `NumberField` và `Stepper` (`src/components/ui.tsx`) và ba ô của màn Đối chiếu, nên dính tới:
- D02: mức tối thiểu, số ngày giao;
- D03: số lượng nhập, giá mua;
- D05: số thực tế khi kiểm kê;
- E02: tiền mặt, chuyển khoản;
- E03: số ml syrup đo được;
- C01, C03, E01: ô số khi bấm vào sửa trực tiếp.

**Quyết định.**
- **Tồn kho được phép âm.** Số âm chỉ sinh ra khi hệ thống tự tính, ví dụ ghi nấu trước khi kịp nhập hàng. Kho âm báo cho người dùng biết cần nhập bù.
- **Mọi số do người dùng gõ phải là số dương**, gồm nhập hàng, kiểm kê, mức tối thiểu và tiền. Gõ dấu `-` thì báo ngay dưới ô, không lưu, và không tự sửa thành số dương.

### L2 · Màn Nấu mất số đang nhập · **Sửa ngay**

**Quyết định.**
- Mặc định mỗi món là **0**.
- Lưu nháp **ngay trên trình duyệt** (localStorage) mỗi lần bấm − +, theo khóa (cơ sở, ngày, loại kế hoạch). Tắt màn hình, đổi tab hay đóng app thì mở lại vẫn còn số.
- Ghi nấu thành công thì **xóa nháp, về 0**, lần sau không giữ lại.
- Khi app tự làm mới phiên đăng nhập (`TOKEN_REFRESHED`) với cùng người dùng, không tải lại cơ sở và danh mục. Đây là nguyên nhân gốc, và nó có thể làm mất số ở cả E01, E02, D03, D05.

### L3 · Xuất CSV · **Sửa phần đơn ngay, phần thống kê làm sau khi có chi phí**

**Quyết định.**
- **Giữ định dạng CSV.**
- Đơn đã hoàn tác **không xuất hiện** trong file xuất, báo cáo và số liệu: cả đơn gốc lẫn bản đảo. *Ghi chú kỹ thuật:* trong database hai bản ghi này vẫn còn, vì sổ cái chỉ nối thêm (ràng buộc bắt buộc của dự án). Chúng chỉ bị loại khỏi mọi chỗ người dùng xem và xuất. Lịch sử (F03) cũng ẩn mặc định; có thêm công tắc "Hiện cả đơn đã hoàn tác" để tra soát khi cần.
- Trạng thái và kênh ghi tiếng Việt (Bán, Tặng, Bổ sung cuối ngày…). Số ghi dạng số, không nằm trong ngoặc kép. Nếu sau này có chức năng nhập (import) thì phải đọc được các nhãn tiếng Việt này.
- **Thống kê tháng và thống kê ngày.** CSV chỉ chứa một bảng, không có nhiều sheet như Excel. Vì vậy mỗi bảng là một file CSV riêng, chọn trong một menu "Xuất":
  1. *Đơn hàng*: từng dòng đơn trong khoảng đã chọn.
  2. *Theo tháng*: mỗi tháng một dòng, gồm doanh thu, chi phí, lợi nhuận, số chai, số đơn.
  3. *Theo ngày*: chọn một tháng, mỗi ngày một dòng, cùng các cột như trên.
- **Admin** có thêm lựa chọn *Toàn bộ cơ sở*: mỗi dòng là một cặp (cơ sở, tháng), gồm doanh thu, chi phí, lợi nhuận.
- File (2), (3) và file toàn bộ cơ sở cần dữ liệu chi phí, nên làm sau khi xong phần chi phí (mục 4).

### L4 · Nút "Lấy theo 7 ngày" quay tròn · **Bỏ nút này tạm thời**

### L5 · Đối chiếu không báo khi số chai còn quá cao · **Giải thích, chờ Tùng chốt**

- **Hiện tại:** màn đếm chai (E01) chỉ báo khi số còn lớn hơn *nấu + tồn qua*, tức là lớn hơn số chai có ở đầu ngày.
- **Ví dụ:** Cold Brew nấu 4, đơn ghi 4. Người bán đếm thấy còn 1. Vậy là đã có 5 chai được tính (4 đã bán, 1 còn) trong khi chỉ có 4 chai. Có ba khả năng: ghi trùng một đơn, ghi đơn nhưng khách không lấy, hoặc quên ghi một mẻ nấu. E01 không báo gì vì 1 vẫn nhỏ hơn 4.
- **Không mất dấu hoàn toàn:** sang bước 3 (E03), app vẫn hiện hộp đỏ "Đếm được nhiều chai hơn sổ". Nhưng lúc đó chỉ còn con số tổng, người bán không biết món nào lệch để đi tìm.
- **Đề xuất:** ngay ở E01, báo theo từng món khi số còn lớn hơn *nấu + tồn qua − đơn ghi*. Câu báo: "Nhiều hơn sổ 1 chai: có thể ghi trùng đơn hoặc quên ghi nấu". Vẫn cho đi tiếp. Story E-1 sửa câu chữ tương ứng.

---

## 2. Quyết định về cải tiến

| # | Nội dung | Quyết định |
| --- | --- | --- |
| C1 | Tồn kho cơ sở mới | **Hiện đủ danh sách vật tư ngay từ đầu**, kể cả số 0. Có thêm thẻ nhỏ ở đầu danh sách gồm nút Nhập hàng và Kiểm kê. Bỏ màn trống S05. Sửa story D-1 |
| C1b | Nhà cung cấp | **Màn quản lý nhà cung cấp mới:** danh sách, mỗi nhà cung cấp cung cấp những vật tư nào. Dữ liệu dùng chung với ô nhà cung cấp ở từng vật tư (D02), sửa ở chỗ này thì chỗ kia đổi theo |
| C2 | Trang chủ: số tiền và số chai | **Giữ nguyên** số chai to hơn tiền |
| C3 | Tồn kho giữ chip và vị trí cuộn | **Giữ thiết kế hiện tại**, không làm |
| C4 | Ngày đã chốt | **Thêm chức năng mở khóa ngày đã chốt, bắt buộc nhập lý do.** Chỉ chủ cơ sở và admin dùng được, nhân viên không. Hướng thiết kế ở mục 5 |
| C5 | Hoàn tác mẻ nấu | **Giữ nút, giữ giới hạn 10 phút.** Đổi điều kiện: hoàn tác được khi hôm đó chưa bán đơn nào, *hoặc* các đơn đã bán vẫn nằm trong số tồn từ hôm qua. Cách tính: với từng món của mẻ, sau khi bỏ mẻ đi, *tồn qua + các mẻ khác − đã bán* vẫn ≥ 0. Không đạt thì ẩn nút, không để bấm rồi mới báo |
| C6 | Hộp xác nhận mặc định của trình duyệt | **Tự làm popup cảnh báo:** có lớp phủ tối phía sau, icon cảnh báo màu cam, hai nút. Dùng cho: tiền lệch quá 20% (E02), kiểm kê lệch quá 30% (D05), nhập trùng (D03), đăng xuất khi còn đơn chờ (G01). Thiết kế trước |

---

## 3. Yêu cầu mới

1. **Việc hôm nay (A04):** gom mọi cảnh báo "Nên đặt" của tất cả nhà cung cấp thành **một dòng** trên Trang chủ. Bấm vào thì mở Tồn kho; ở Tồn kho mới tách riêng theo từng nhà cung cấp.
2. **Đối chiếu (E01):** thêm nút dạng chữ "Hiển thị cả những món không nấu/tồn". Bấm vào thì hiện thêm các món còn lại để đếm. Dùng khi đầu ngày ghi thiếu (quên ghi nấu hoặc tồn) nhưng cuối ngày trên quầy vẫn còn món đó.
3. **Tiền mặt đầu ngày:**
   - Trang chủ có ô nhập tiền mặt đầu ca.
   - Cuối ngày ở E02, người bán **chọn một trong hai** cách nhập: *Số tiền thu được trong ngày*, hoặc *Tổng tiền đang có trong hộp* (app tự trừ tiền đầu ngày).
   - Lý do có hai cách: trong ngày có thể có người lấy bớt hoặc bỏ thêm tiền vào hộp.
4. **Đơn tặng:**
   - Vẫn tính vào số đơn ở Trang chủ, nhưng hiện thêm số đơn tặng, ví dụ "6 đơn · 1 tặng".
   - Đơn tặng không tính vào doanh thu (giữ như cũ).
5. **Tỉ lệ hủy** = chai hủy ÷ (số nấu + số tồn qua).
6. **Chi phí và lợi nhuận** (tham khảo Knote):
   - **Ghi chép chi phí** theo loại. Loại mặc định: Nhập hàng, Mặt bằng, Lương, Điện nước internet, Khác. Mỗi khoản gồm ngày, loại, nội dung, số tiền.
   - **Thống kê chi phí:** biểu đồ tròn theo loại và lịch sử theo ngày (giống màn Chi phí của Knote).
   - **Báo cáo:** hiện doanh thu, chi phí, lợi nhuận (= doanh thu − chi phí), cùng biểu đồ theo tuần hoặc theo ngày và món bán chạy (giống màn Tổng quan của Knote).
   - **Phải chốt khi thiết kế:** phiếu Nhập hàng (D03) đã có ô giá mua. Cần quyết định nhập hàng có giá thì có **tự sinh một khoản chi "Nhập hàng"** hay không, để không phải ghi hai lần mà cũng không bị tính trùng. Đề xuất: tự sinh, và khoản chi này hiện là "từ phiếu nhập" (không sửa tay được, muốn sửa thì sửa phiếu).
7. **Báo cáo nhiều cơ sở cho admin:** xem doanh thu, chi phí, lợi nhuận theo từng cơ sở và theo tháng, có xuất file toàn bộ cơ sở. Thiết kế trước.
8. **Phân quyền:**
   - Chỉ **admin** tạo được cơ sở mới. Chủ cơ sở không còn thấy chức năng tạo cơ sở.
   - **Thêm email của Hà vào danh sách admin.** *Chưa có email của Hà, Tùng gửi sau.*
   - **Admin quản lý chủ cơ sở:** thêm hoặc gỡ chủ cho từng cơ sở.
   - **Chủ cơ sở quản lý nhân viên** ngay trong app: thêm bằng email, gán vào một hoặc nhiều cơ sở mình sở hữu, gỡ ra.
   - Nhân viên đăng nhập bằng email như bình thường. Nhân viên chỉ thấy các cơ sở được gán; được gán từ hai cơ sở trở lên thì đổi cơ sở trong Tài khoản.

---

## 4. Việc cần Tùng làm hoặc chốt

1. Gửi email của Hà để thêm vào danh sách admin.
2. Chốt L5: báo theo từng món ở E01 như đề xuất?
3. Chốt cách xử lý khoản chi Nhập hàng (mục 3.6): đề xuất tự sinh từ phiếu nhập.
4. Merge PR #2 (tài liệu và CLAUDE.md) và PR #5 (kết quả test 10/11), để phiên code đọc được tài liệu từ `main`.
5. Duyệt bản thiết kế của phiên design trước khi chuyển cho phiên code giai đoạn 2.

---

## 5. Đề xuất hướng thiết kế: mở khóa ngày đã chốt (C4)

- **Lối vào.**
  - Ở màn Đối chiếu của ngày đã chốt, đầu màn có thanh trạng thái "Ngày 10/11 đã chốt lúc 21:05 · Hà" kèm nút viền "Mở khóa ngày". Nút chỉ hiện với chủ cơ sở và admin.
  - Nhân viên thấy dòng "Chỉ chủ cơ sở mở khóa được".
  - Ở B01, khi bị chặn vì ngày đã chốt, câu báo nói rõ: "Ngày đã chốt. Nhờ chủ cơ sở mở khóa nếu cần sửa".
- **Mở khóa.** Một bottom sheet có ô lý do (bắt buộc), gợi ý nhanh vài lý do ("Quên ghi đơn", "Ghi nhầm số chai", "Sai tiền") và nút "Mở khóa".
- **Sau khi mở.**
  - Ngày trở lại trạng thái chưa chốt: ghi đơn, hoàn tác được như thường.
  - Trang chủ và Việc hôm nay hiện dòng màu cam "Ngày 10/11 đang mở lại, cần chốt lại".
  - Lần chốt sau tạo bản chốt mới thay bản cũ.
- **Lưu vết.** Lịch sử (F03) có dòng "Mở khóa ngày 10/11 · lý do · người mở". Bản chốt cũ vẫn giữ, theo đúng nguyên tắc sổ cái.

---

## 6. Phân chia công việc

### Phiên Design (canvas "Kho BaBa – Thiết kế app bản 1 (phong cách hiện đại)")

| Mã | Màn | Nội dung |
| --- | --- | --- |
| DS1 | Popup cảnh báo (mới) | Lớp phủ tối, icon cảnh báo cam, tiêu đề, nội dung, hai nút (nút chính và nút phụ viền). Vẽ 3 trường hợp: tiền lệch quá 20%, kiểm kê lệch quá 30%, đăng xuất khi còn đơn chờ |
| DS2 | Chi phí (mới) | Danh sách theo tháng, biểu đồ tròn theo loại, lịch sử theo ngày; bottom sheet thêm khoản chi; trạng thái trống. Đề xuất chỗ đặt trong điều hướng (đề xuất: Báo cáo có hai tab Doanh thu / Chi phí, cộng lối tắt từ Trang chủ) |
| DS3 | Báo cáo cơ sở (F01 sửa) | Doanh thu, chi phí, lợi nhuận; biểu đồ; món bán chạy; menu Xuất với 3 loại file |
| DS4 | Báo cáo admin (mới) | Bảng các cơ sở × doanh thu / chi phí / lợi nhuận theo tháng; bấm một cơ sở thì vào báo cáo của cơ sở đó; xuất toàn bộ cơ sở |
| DS5 | Nhà cung cấp (mới) | Danh sách nhà cung cấp, chi tiết (liên hệ, các vật tư cung cấp), thêm và sửa; liên kết với D02 |
| DS6 | Nhân viên (mới, cho chủ cơ sở) | Danh sách nhân viên, thêm bằng email, gán cơ sở, gỡ |
| DS7 | Quản trị (mới, cho admin) | Danh sách cơ sở, tạo cơ sở, thêm hoặc gỡ chủ cơ sở, danh sách admin |
| DS8 | Đối chiếu (E01, E02, E03 sửa) | Nút "Hiển thị cả những món không nấu/tồn"; E02 chọn "Số tiền thu được" hoặc "Tổng tiền trong hộp"; E03 trạng thái đã chốt kèm mở khóa (mục 5) |
| DS9 | Trang chủ (A04 sửa) | Ô tiền mặt đầu ngày; số đơn có thêm số đơn tặng; Việc hôm nay gom "Nên đặt" thành một dòng; dòng "ngày đang mở lại" |
| DS10 | Tồn kho (D01 sửa) | Cơ sở mới hiện đủ vật tư, thẻ nhập lần đầu ở đầu danh sách; bỏ S05 |
| DS11 | Tài khoản (G01 sửa) | Mục mới theo vai trò: Nhà cung cấp, Nhân viên (chủ cơ sở), Quản trị và Báo cáo nhiều cơ sở (admin); bỏ nút tạo cơ sở với chủ cơ sở |
| DS12 | Sơ đồ điều hướng (N01) | Cập nhật theo các màn mới |

### Phiên Code giai đoạn 1 (làm ngay, không cần thiết kế)

| Mã | Việc |
| --- | --- |
| CD1 | L1: ô số báo lỗi khi gõ số âm, không tự bỏ dấu trừ (mọi màn) |
| CD2 | L2: Nấu mặc định 0, nháp localStorage, xóa nháp sau khi ghi nấu; sửa `TOKEN_REFRESHED` trong `app.tsx`; kiểm lại E01, E02, D03, D05 |
| CD3 | L4: bỏ nút "Lấy theo 7 ngày" |
| CD4 | L3 phần đơn: loại đơn đã hoàn tác (gốc và bản đảo) khỏi CSV, báo cáo, Trang chủ; F03 ẩn mặc định, có công tắc hiện; trạng thái tiếng Việt; số không nằm trong ngoặc kép |
| CD5 | C5: điều kiện hoàn tác mẻ nấu mới (sửa `fn_reverse_cook_run`, migration mới), ẩn nút khi không đạt |
| CD6 | Tỉ lệ hủy chia cho (nấu + tồn qua); Trang chủ hiện "N đơn · M tặng" |
| CD7 | Việc hôm nay gom "Nên đặt" thành một dòng, bấm vào mở D01 |
| CD8 | E01 thêm nút chữ "Hiển thị cả những món không nấu/tồn" (dùng kiểu nút `quiet` có sẵn) |
| CD9 | Phân quyền: `fn_create_outlet` chỉ cho admin; ẩn phần tạo cơ sở với người không phải admin; thêm email Hà vào `bootstrap_admins` khi có |
| CD10 | Cập nhật tài liệu: User Stories (C-1, C-2, C-3, D-1, E-1, F-1, A-3, A-4, B-2, phạm vi), Ghi chú triển khai, ghi kết quả vào `docs/ket-qua-test/` |

### Phiên Code giai đoạn 2 (sau khi Tùng duyệt thiết kế)

Gồm: chi phí (bảng `expenses` và loại chi, nối thêm, tự sinh từ phiếu nhập nếu được chốt), báo cáo lợi nhuận, báo cáo và xuất file admin, CSV theo tháng và theo ngày, nhà cung cấp, nhân viên, quản trị chủ cơ sở, mở khóa ngày, popup cảnh báo, tiền mặt đầu ngày, D01 hiện đủ danh sách, L5 (nếu đã chốt).

---

## 7. Prompt cho từng phiên

### 7.1 Prompt phiên Design

```
Dự án Kho BaBa (Project "Sữa lành từ BaBa"). Đọc trước: claude/BaBa_Bien_ban_hop_2026-11-11.md (biên bản này), claude/BaBa_User_Stories.md, claude/BaBa_Thiet_ke_DB.md.

Cập nhật bản thiết kế trên canvas có sẵn "Kho BaBa – Thiết kế app bản 1 (phong cách hiện đại)", slug 5a78cd59-3e4a-4a15-b6be-f7d2cb82e624. KHÔNG tạo canvas mới. Giữ đúng phong cách đang có:
- nền xám #F7F7F7, chữ Be Vietnam Pro, Quicksand chỉ cho tiêu đề lớn, màu nhấn #296241;
- mỗi màn chỉ MỘT nút nền xanh đậm (primary), nút phụ viền xanh nền trắng, chip nền trắng (đang chọn: viền và chữ xanh);
- nút "+" dạng viền; ẩn thanh cuộn; khung điện thoại 390 px; tiếng Việt, không emoji.

Làm các màn DS1 → DS12 trong mục 6 của biên bản. Sửa màn cũ thì sửa đúng artboard đó; màn mới thì thêm artboard và đặt mã mới nối tiếp (ví dụ H01 Chi phí, H02 Thêm khoản chi, K01 Báo cáo admin, P01 Nhà cung cấp, Q01 Nhân viên, R01 Quản trị, W01 Popup cảnh báo). Mỗi màn mới vẽ cả trạng thái trống và trạng thái lỗi nếu có.

Tham khảo Knote (ảnh trong biên bản: màn Tổng quan có doanh thu, chi tháng này, doanh thu − chi phí, biểu đồ theo tuần, hàng bán chạy; màn Chi phí có biểu đồ tròn theo loại và lịch sử theo ngày) nhưng vẽ theo phong cách Kho BaBa, không chép giao diện Knote.

Hai điểm cần đề xuất rồi hỏi Tùng: (1) chỗ đặt Chi phí trong điều hướng 5 tab hiện có; (2) cách hiện khoản chi tự sinh từ phiếu nhập hàng.

Xong thì cập nhật N01 (sơ đồ điều hướng), gửi link canvas và danh sách màn đã thêm/sửa. Không viết code app.
```

### 7.2 Prompt phiên Code giai đoạn 1

```
Dự án Kho BaBa, repo blueuidesign/BaBa. Đọc CLAUDE.md và docs/ trên main (nếu PR #2 chưa merge thì đọc trên nhánh docs-nguon-va-phan-tich). Đọc biên bản claude/BaBa_Bien_ban_hop_2026-11-11.md trong Project, làm các việc CD1 → CD10 ở mục 6.

Ràng buộc: sổ cái chỉ nối thêm (không DELETE, không sửa đè); mọi thay đổi DB là migration mới đánh số từ 0012 và áp lên Supabase project fsqpajvjjmpyrgllrhgz; RLS và hàm fn_* tự kiểm quyền; giao diện tiếng Việt, theo phong cách hiện tại (một nút primary mỗi màn).

Lưu ý:
- CD1: số tồn kho do hệ thống tính được phép âm; chỉ chặn số âm do người dùng gõ. Báo dưới ô, không tự sửa số.
- CD2: nháp localStorage theo khóa (outlet, ngày, loại kế hoạch); ghi nấu thành công thì xóa nháp; nguyên nhân gốc là onAuthStateChange gọi lại reloadOutlets khi TOKEN_REFRESHED.
- CD4: đơn đã hoàn tác vẫn còn trong DB, chỉ loại khỏi xuất file, báo cáo, Trang chủ; F03 có công tắc "Hiện cả đơn đã hoàn tác".
- CD5: cho hoàn tác mẻ nấu trong 10 phút nếu với mọi món của mẻ: tồn qua + các mẻ khác − đã bán ≥ 0. Không đạt thì ẩn nút.
- CD9: email của Hà chưa có; để chỗ và ghi vào Ghi chú triển khai.

Mỗi việc một commit, chạy npm run typecheck và npm run build trước khi commit. Làm trên nhánh mới, mở một PR vào main kèm bảng việc đã làm và cách kiểm tra từng việc trên điện thoại. Không merge. Việc nào cần thiết kế mới (popup, chi phí, nhà cung cấp, nhân viên, mở khóa ngày, tiền đầu ngày) thì KHÔNG làm ở phiên này.
```

### 7.3 Prompt phiên Code giai đoạn 2 (chỉ dùng sau khi Tùng duyệt thiết kế)

```
Dự án Kho BaBa, repo blueuidesign/BaBa. Đọc CLAUDE.md, docs/, biên bản claude/BaBa_Bien_ban_hop_2026-11-11.md và bản thiết kế đã duyệt trên canvas 5a78cd59-3e4a-4a15-b6be-f7d2cb82e624 (các màn DS1 → DS12).

Trước khi code: viết bổ sung thiết kế DB (bảng expenses + expense_categories nối thêm, đảo bằng bản ghi đảo; cash_opens cho tiền đầu ngày; mở khóa ngày đã chốt bằng bản ghi mới, không sửa bản chốt cũ; quản lý nhân viên/chủ cơ sở qua memberships và org_memberships sẵn có; nhà cung cấp dùng bảng suppliers + outlet_ingredient_settings.supplier_id). Cập nhật docs/phan-tich/BaBa_Thiet_ke_DB.md lên 1.3 và User Stories lên 1.2, gửi Tùng xem phần thay đổi trước khi viết migration.

Sau đó làm theo thứ tự: popup cảnh báo dùng chung → chi phí → báo cáo lợi nhuận cơ sở → CSV theo tháng/ngày → báo cáo và xuất toàn bộ cơ sở cho admin → nhà cung cấp → nhân viên (chủ cơ sở) → quản trị chủ cơ sở (admin) → mở khóa ngày → tiền mặt đầu ngày và hai cách nhập tiền ở E02 → D01 hiện đủ vật tư → L5 nếu đã chốt.

Ràng buộc như giai đoạn 1. Chia thành vài PR theo nhóm tính năng, mỗi PR có cách kiểm tra trên điện thoại. Không merge.
```

---

## 8. Bổ sung (10:17): danh sách món đã chốt

9 món, 4 dòng:
- **Mầm Xanh:** 1 Mầm Đỏ Hồng Đào · 2 Mầm Vàng Thơm Ngon · 3 Mầm Đen Khỏe Mạnh.
- **Mầm Sáng:** 4 Mầm Sáng Hồng Đào · 5 *Mè đen · Đậu đen · Điều* (tên tạm).
- **Mầm Lành:** 6 Mầm Sáng Trí Tuệ · 7 *Gạo lứt · Hạnh nhân · Điều* (tên tạm).
- **Mầm Trẻ:** 8 Mầm Sữa Matcha (công thức mới: matcha + điều + óc chó) · 9 Mầm Sữa Cacao (công thức mới: cacao + điều + hạnh nhân).

**Ngừng bán:** Sáng Mắt Trong, Lành Nhẹ Bụng, Lành Vững Xương, Lành Năng Lượng, Cold Brew. Các món này chuyển trạng thái ngừng bán, không xóa.

Món không ghi nguyên liệu thì giữ công thức cũ. Công thức của món 5, 7 và công thức mới của 8, 9 sẽ bổ sung sau; trong lúc chờ, Matcha và Cacao dùng công thức cũ.

**Việc giao:** `tasks/2026-11-11_design_ban1-mo-rong.md` (mục A), `tasks/2026-11-11_code_giai-doan-1.md` (mục A). Quy tắc danh mục đã ghi vào `CLAUDE.md`.

**Chờ Tùng:**
- giá bán món 5, món 7;
- tên món 1 và 4 là "Hồng Đào" hay "Hồng Hào" như cũ;
- công thức cho món 5, 7, 8, 9.

## 9. Bổ sung (10:22): nhập số liệu tháng cũ

Chủ cơ sở cần nhập doanh thu và chi phí của các tháng trước để báo cáo đủ số liệu khi chuyển từ Knote sang. Cách nhập phải đơn giản, gồm ba thứ: loại (doanh thu hoặc chi phí), số tiền, tháng. Việc giao: DS13 (design), giai đoạn 2 (code).

Tùng giao Claude làm luôn phần thiết kế, code và deploy, tự gộp các PR cần thiết, không chờ duyệt thiết kế riêng.
