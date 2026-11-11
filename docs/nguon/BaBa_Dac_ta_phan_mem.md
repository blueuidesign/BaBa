# Đặc tả phần mềm "Kho BaBa" – Hệ thống vận hành cho Sữa lành từ BaBa

Phiên bản: 1.1 · Ngày: 09/11/2026 · Người lập: Claude theo yêu cầu của người sáng lập BaBa
Mục đích: tài liệu đầu vào để một đội phát triển (hoặc một AI khác) xây dựng phần mềm, theo từng giai đoạn, giữ được dữ liệu và người dùng dùng liên tục khi nâng cấp.

---

## 1. Bối cảnh dự án

### 1.1 Thương hiệu
- **Tên:** Sữa lành từ BaBa (gọi tắt BaBa). Slogan: *Sữa lành từ hạt mầm, nuôi dưỡng từ tình thâm.*
- **Sản phẩm cốt lõi:** sữa hạt tươi không chất bảo quản, chai 330 ml, bán trong ngày hoặc giữ lạnh 0–4 °C; ly xay nóng tại chỗ; set ăn healthy (đồ hấp, luộc) mang đi; bánh và đồ uống pha chế cho người lớn ở mô hình lớn.
- **Khách hàng:** trẻ em, cha mẹ, nhân viên văn phòng.
- **Ba sứ mệnh:** (1) Tốt lành đi trước, ngon miệng theo sau; (2) Thực phẩm không có lỗi, chỉ có cái muốn không biết điểm dừng; (3) Mọi dưỡng chất đều có sứ mệnh.
- **Mức ngọt:** không đường (0 ml), ít ngọt (10 ml), ngọt vừa (20 ml syrup mỗi chai hoặc ly). Không có mức ngọt nhiều.
- **Dòng thời trang trẻ em BABA’s Hug** (ý nghĩa "Cái ôm không xiết chặt") và khu phức hợp **BaBa’s Garden** là tầm nhìn dài hạn; phần mềm cần mở được cho các nguồn thu ngoài sữa.

### 1.2 Mô hình kinh doanh (theo tài liệu "Ba mô hình đồng hành")
| Mô hình | Mô tả | Vốn ước tính | Cam kết tối thiểu |
| --- | --- | --- | --- |
| 1 · Xe lưu động | Gia đình nấu tại nhà, bán chai đóng sẵn bằng xe máy, buổi sáng | 5 triệu | 3 tháng, 3 buổi sáng/tuần, tối thiểu 4 món |
| 2 · Takeaway | Vỉa hè (chế biến tại nhà) hoặc mặt bằng nhỏ (chế biến tại chỗ); chai, ly xay tại chỗ, set ăn mang đi | 15 / 50 triệu | 6 tháng, 5 buổi sáng/tuần, tối thiểu 3 trong 4 dòng |
| 3 · Hoàn thiện | Quán ngồi hoặc quán có khu trải nghiệm nhỏ; đủ 4 dòng, đồ uống người lớn, bánh | 500 triệu / 1 tỷ | 1 năm (5 ngày/tuần) / 3 năm (cả tuần) |
| BaBa’s Garden | Khu phức hợp 3–6 khu cho trẻ em và cha mẹ | 5–12 tỷ | 5 năm, cả tuần |

**Chính sách tài chính giữa BaBa và điểm bán**
- Không thu phí nhượng quyền thương hiệu.
- **Chi phí vận hành BaBa chung (bắt buộc): 1.000 đ cho mỗi chai hoặc ly bán ra thực tế**, tính theo số liệu trên phần mềm, thanh toán hằng tháng.
- Mô hình 3: thêm **đóng góp phát triển hệ thống** 5% lợi nhuận (quán ngồi), 7% (quán có không gian); BaBa’s Garden 10% lợi nhuận toàn khu vườn. Lợi nhuận = doanh thu trừ chi phí vận hành, tính theo quý; không có lợi nhuận thì không phát sinh.
- Đóng góp tùy tâm: tự do, không ràng buộc.
- Điểm bán tự bỏ vốn, tự quản lý tài chính; bán đúng giá niêm yết chung; làm đúng công thức chuẩn; ghi nhận bán hàng trên ứng dụng Kho BaBa để minh bạch.
- Điều khoản chung: an toàn thực phẩm; món sáng tạo phải được BaBa duyệt công thức; bảo vệ điểm bán theo bán kính; nhắc nhở trước khi ngừng cho dùng nhận diện; tự động tiếp tục sau thời gian cam kết.

### 1.3 Lộ trình kinh doanh (24 tháng, từ 12/2026)
- **Giai đoạn 1 (12/2026–2/2027):** 1 điểm Mô hình 2 của BaBa chạy thật; 3 xe Mô hình 1 với 3 gia đình thân quen; xây nhận diện online; nộp đơn nhãn hiệu.
- **Giai đoạn 2 (3–8/2027):** điểm chế biến ổn định làm nơi học việc; thêm 5 xe (tổng 8); 2 điểm vỉa hè; hoạt động cộng đồng, KOL.
- **Giai đoạn 3 (9/2027–11/2028):** 30 xe, 10 điểm vỉa hè, 5 điểm có khu chế biến, 1 quán có khu trải nghiệm nhỏ (trước đầu hè 2028).
- **Tầm nhìn 5 năm:** BaBa’s Garden bản 3 khu khoảng 2031.

Phần mềm phải đi theo lộ trình này: **giai đoạn 1 phục vụ người bán hàng tại một điểm; giai đoạn 2 phục vụ mạng lưới đối tác độc lập; giai đoạn 3 phục vụ quán lớn và khu vườn nhiều nguồn thu.**

---

## 2. Hiện trạng: ứng dụng Kho BaBa (artifact đã có)

### 2.1 Tổng quan ứng dụng hiện tại
Kho BaBa là ứng dụng web một trang (HTML và JavaScript thuần), chạy trong trình duyệt điện thoại hoặc máy tính, thiết kế cho người đứng quầy thao tác bằng một tay. Ứng dụng có một thanh tiêu đề (tên ứng dụng và nút chọn điểm bán), một vùng nội dung, một thanh lưu cố định ở đáy màn hình cho các thao tác ghi, và thanh điều hướng 5 mục: **Bán hàng, Nhập & làm, Tồn kho, Doanh thu, Lịch sử**. Dữ liệu được ghi thành các "ghi chép" (sự kiện) theo từng điểm bán; tồn kho và doanh thu được tính lại từ các ghi chép này mỗi khi có thay đổi. Ứng dụng nhớ mục đang mở, điểm bán đang chọn và có thông báo ngắn (toast) sau mỗi lần lưu.

### 2.2 Các khối tính năng và mục đích

| Khối tính năng | Mục đích | Thành phần chính |
| --- | --- | --- |
| A. Điểm bán và lưu trữ | Mỗi điểm bán có kho và lịch sử riêng; nhiều người dùng chung một kho khi được mời | Chọn, tạo điểm bán; lưu chung qua đám mây khi đăng nhập và được mời quyền ghi; chế độ "dùng tạm trên máy này" lưu cục bộ; chế độ chỉ xem khi không có quyền ghi; banner báo mất kết nối |
| B. Ghi bán hàng và trừ kho tự động | Ghi nhanh số chai bán trong ngày, tự tính doanh thu và nguyên liệu đã dùng | Bộ đếm cộng trừ cho 12 món theo 4 dòng; ghi số ly ít ngọt, ngọt vừa; kiểm tra số ly có đường không vượt tổng số chai; tự trừ nguyên liệu theo công thức và syrup theo mức ngọt; lưu giá tại thời điểm bán |
| C. Nhập hàng và làm bán thành phẩm | Ghi nguyên liệu mua về và các mẻ tự làm, để kho luôn đúng | Form nhập hàng (nguyên liệu, số lượng, ghi chú, ngày); mẻ nấu syrup ngọt lành và mẻ ủ cốt cold brew với số mẻ, hiển thị lượng nguyên liệu cần dùng, cảnh báo khi kho chưa đủ |
| D. Tồn kho, cảnh báo và kiểm kê | Biết lúc nào cần đặt hàng, hàng tự làm sắp hết hạn, và sửa sổ cho khớp thực tế | Danh sách 20 nguyên liệu với số tồn, thanh mức, nhãn "Cần đặt" hoặc "Đủ"; lọc chỉ hiện nguyên liệu cần đặt; xem hướng dẫn bảo quản; sửa mức tối thiểu riêng; cảnh báo hết hạn (cơm dừa 1 ngày, cốt 7 ngày, syrup 14 ngày); chế độ kiểm kê nhập số thực tế, hiện chênh lệch |
| E. Doanh thu | Theo dõi kết quả bán theo ngày, tháng, món, dòng | Chọn tháng; tổng doanh thu, số chai, trung bình mỗi ngày bán, ngày bán tốt nhất; biểu đồ cột theo ngày bấm được; xem theo ngày hoặc cả tháng; bảng theo món và theo dòng; số ly ít ngọt, ngọt vừa |
| F. Lịch sử và sửa sai | Xem lại mọi lần ghi và xóa ghi nhầm để tồn kho tự tính lại | 80 ghi chép gần nhất với biểu tượng theo loại (bán, nhập, làm mẻ, kiểm kê), ngày và chi tiết ngắn; nút xóa có hỏi xác nhận |

### 2.3 Các màn hình và kịch bản sử dụng

**Màn hình 1. Kết nối kho chung**
Khi mở ứng dụng lần đầu trên một máy chưa đăng nhập hoặc chưa được mời, màn hình báo "Chưa kết nối kho chung" và giải thích hai lý do thường gặp. Người dùng có thể đăng nhập rồi bấm "Tải lại trang", hoặc chọn "Dùng tạm trên máy này" để ghi chép cục bộ. Chủ ứng dụng dùng màn hình này để biết nhân viên nào chưa được mời quyền ghi.

**Màn hình 2. Chọn hoặc tạo điểm bán**
Bấm tên điểm bán trên thanh tiêu đề sẽ mở danh sách điểm bán, mỗi điểm có kho và lịch sử riêng. Chủ điểm bán gõ tên và bấm "Tạo điểm bán" khi mở thêm một xe hay một quầy mới. Nhân viên chọn đúng điểm mình đứng trước khi ghi, để số liệu không lẫn giữa các điểm.

**Màn hình 3. Ghi bán hàng**
Cuối buổi, nhân viên chọn ngày bán, bấm dấu cộng cho từng món theo số chai đã bán, rồi ghi số ly ít ngọt và ngọt vừa. Ứng dụng báo lỗi nếu số ly có đường nhiều hơn tổng số chai, và nút lưu hiện "Lưu 45 chai" khi hợp lệ. Sau khi lưu, góc trên hiện tổng số chai đã ghi trong ngày, kho nguyên liệu và syrup được trừ tự động.

**Màn hình 4. Nhập hàng**
Khi nhận hàng từ chợ hoặc nhà cung cấp, nhân viên chọn nguyên liệu, nhập số lượng theo gram hoặc ml, ghi chú nhà cung cấp hay hạn dùng và chọn ngày nhập. Màn hình hiện số còn trong kho của nguyên liệu đang chọn để tránh nhập trùng. Bấm "Thêm vào kho" thì tồn kho tăng ngay và ghi chép xuất hiện trong Lịch sử.

**Màn hình 5. Làm mẻ: nấu syrup, ủ cốt cold brew**
Khi nấu syrup ngọt lành hoặc ủ cốt cold brew, người làm chọn số mẻ và xem ngay lượng đường thốt nốt, đường phèn, hoa nhài hoặc cà phê cần dùng. Nếu kho chưa đủ nguyên liệu, màn hình cảnh báo nhưng vẫn cho ghi trong trường hợp hàng đã có mà chưa nhập. Bấm "Ghi đã nấu" hoặc "Ghi đã ủ" thì thành phẩm được cộng vào kho kèm ngày làm để tính hạn dùng.

**Màn hình 6. Tồn kho**
Đầu buổi, chủ điểm mở Tồn kho để xem dòng tóm tắt "N nguyên liệu cần đặt hàng" và các cảnh báo hết hạn ở trên cùng. Bật "Chỉ hiện nguyên liệu cần đặt" để lập danh sách đi chợ, bấm vào từng nguyên liệu để xem cách bảo quản. Nếu điểm bán bán ít hoặc nhiều hơn mức chuẩn, chủ điểm sửa mức tối thiểu riêng và bấm "Lưu".

**Màn hình 7. Kiểm kê cuối ngày**
Cuối ngày hoặc cuối tuần, nhân viên bấm "Kiểm kê", cân đếm thực tế rồi nhập số vào ô của từng nguyên liệu đã đếm. Màn hình hiện số trên sổ và chênh lệch ngay khi nhập, ô bỏ trống giữ nguyên số sổ. Bấm "Lưu" thì sổ kho được đặt lại theo số thực tế, giúp phát hiện hao hụt hoặc ghi thiếu.

**Màn hình 8. Doanh thu**
Chủ điểm chọn tháng để xem tổng doanh thu, số chai, trung bình mỗi ngày bán và ngày bán tốt nhất. Bấm vào một cột trong biểu đồ để xem chi tiết ngày đó, hoặc chọn "Cả tháng" để xem toàn tháng. Bảng theo món và theo dòng giúp biết món nào bán chạy để điều chỉnh lượng nấu và nhập nguyên liệu.

**Màn hình 9. Lịch sử**
Khi số liệu có vẻ sai, người dùng mở Lịch sử để xem 80 ghi chép gần nhất theo thứ tự mới nhất. Mỗi dòng cho biết loại ghi chép, ngày và chi tiết ngắn như số chai hay số lượng nhập. Ghi nhầm thì bấm "Xoá", xác nhận, rồi ghi lại; tồn kho và doanh thu được tính lại ngay.

### 2.4 Thành phần dùng chung
- **Thanh lưu cố định:** nút chính của màn hình (Lưu chai, Lưu kiểm kê) luôn nằm ở đáy, bị khóa khi dữ liệu chưa hợp lệ hoặc không có quyền ghi.
- **Bộ đếm cộng trừ:** nút lớn, ô số mở bàn phím số trên điện thoại.
- **Thông báo:** toast ngắn sau khi lưu; banner đỏ khi mất kết nối dữ liệu.
- **Quyền chỉ xem:** người không có quyền ghi vẫn xem được mọi màn hình, các nút ghi bị khóa.

### 2.5 Mô hình dữ liệu hiện có (event sourcing đơn giản)
Mọi thay đổi là một **sự kiện** được nối thêm, tồn kho được tính lại từ đầu bằng cách duyệt toàn bộ sự kiện:
- `sale`: `{date, counts:{productId: qty}, sweet:{light, medium}, usage:{itemId: qty}, revenue}`
- `in`: `{date, item, qty, note}`
- `make`: `{date, out:'syrup'|'cot', qty, uses:{itemId: qty}}`
- `count`: `{date, values:{itemId: qty}}` (kiểm kê đặt lại tồn kho)
- Cài đặt theo điểm bán: `{min:{itemId: qty}}`.
- Hai backend: lưu cục bộ trình duyệt, hoặc Firestore theo cấu trúc `stores/{storeId}/events/{eventId}`, `stores/{storeId}/config/settings`. Có khái niệm **store** (điểm bán) ngay từ đầu.

### 2.6 Hạn chế cần khắc phục
- Chỉ một người dùng chung một cấu hình; chưa có đăng nhập, phân quyền, không biết ai ghi gì.
- Danh mục món, giá, định lượng **cố định trong mã nguồn**; đổi công thức phải sửa code.
- Bán hàng ghi theo ngày, không theo từng đơn; không có ca, không có hình thức thanh toán, không có khách hàng.
- Chưa có chi phí, lợi nhuận, công nợ, không có khoản 1.000 đ/chai.
- Tính kho bằng cách duyệt toàn bộ sự kiện: ổn cho vài nghìn sự kiện, không ổn cho mạng lưới 50 điểm nhiều năm.
- Chưa có xuất dữ liệu, sao lưu, lịch sử sửa xóa; chưa làm việc ngoại tuyến có đồng bộ.
- Chưa có khái niệm đối tác, hợp đồng, cam kết, phí.

Điểm tốt cần giữ: tư duy **sổ cái sự kiện không sửa đè**, kiểm kê điều chỉnh bằng sự kiện mới, cảnh báo tồn kho và hạn dùng, giao diện rất đơn giản cho người bán.

---

## 3. Mục tiêu và nguyên tắc thiết kế phần mềm

### 3.1 Mục tiêu
1. Người bán ghi được một ca bán hàng trong **dưới 1 phút trên điện thoại**, kể cả khi mạng yếu.
2. BaBa trung tâm nhìn được toàn mạng lưới: bán ra, tồn kho, chất lượng, phí phải thu, hoạt động cộng đồng.
3. Đối tác độc lập tự quản điểm của mình nhưng dùng chung công thức, giá, thương hiệu và báo cáo minh bạch.
4. Nâng cấp giữa các giai đoạn **không mất dữ liệu, không bắt người dùng học lại từ đầu**.

### 3.2 Nguyên tắc kỹ thuật bắt buộc
- **Đa điểm bán ngay từ ngày đầu (multi-tenant):** mọi bản ghi đều thuộc một `outlet_id` và một `org_id`. Giai đoạn 1 chỉ có 1 org (BaBa) và vài outlet, nhưng cấu trúc đã sẵn cho hàng trăm.
- **Sổ cái không sửa đè (append-only ledger):** bán hàng, nhập kho, sản xuất, kiểm kê, phí, thanh toán đều là bản ghi nối thêm. Sửa sai bằng bản ghi điều chỉnh hoặc đảo ngược, có lý do. Không xóa cứng.
- **Danh mục có phiên bản:** công thức, định lượng, giá niêm yết, mức ngọt là dữ liệu có hiệu lực theo thời gian (`valid_from`, `valid_to`), không phải hằng số trong code. Bản ghi bán hàng lưu lại giá và định lượng tại thời điểm bán.
- **Tồn kho tính theo số dư tích lũy:** lưu `stock_balance` theo ngày (snapshot) cộng dồn từ `stock_movements`, không duyệt toàn bộ lịch sử mỗi lần mở.
- **Ưu tiên di động, làm việc ngoại tuyến:** PWA, hàng đợi đồng bộ, mỗi bản ghi có `client_id` (UUID sinh ở máy) để chống trùng khi gửi lại.
- **Tiếng Việt là ngôn ngữ chính**, định dạng tiền `15.000 đ`, ngày `dd/mm/yyyy`, múi giờ Asia/Ho_Chi_Minh.
- **Di chuyển dữ liệu từ bản artifact:** có công cụ nhập từ JSON sự kiện cũ (`sale/in/make/count`) sang bảng mới; chạy một lần cho từng điểm.
- **Mọi thay đổi lược đồ phải thêm chứ không đổi nghĩa cột cũ** (additive migrations), kèm script backfill; tính năng mới bật bằng cờ tính năng (feature flag) theo org hoặc outlet.
- **Nhật ký kiểm toán (audit log)** cho mọi thao tác ghi: ai, lúc nào, thiết bị nào, giá trị trước và sau.
- Bảo vệ dữ liệu cá nhân theo quy định Việt Nam (Nghị định 13/2023 về bảo vệ dữ liệu cá nhân): thu thập tối thiểu, có đồng ý, có xóa theo yêu cầu.

---

## 4. Người dùng và vai trò

| Vai trò | Thuộc | Xuất hiện từ | Quyền chính |
| --- | --- | --- | --- |
| Chủ hệ thống (BaBa Admin) | org BaBa | GĐ1 | Toàn quyền: danh mục, giá, công thức, mở outlet, xem mọi báo cáo, phí |
| Quản lý vận hành BaBa | org BaBa | GĐ2 | Duyệt đối tác, kiểm tra chất lượng, đối soát phí, hỗ trợ |
| Chủ điểm bán (đối tác) | outlet | GĐ1 (chính BaBa), GĐ2 (đối tác) | Quản lý điểm của mình: nhân viên, ca, kho, báo cáo, nộp phí |
| Nhân viên đứng quầy | outlet | GĐ1 | Ghi bán hàng, nhập kho, kiểm kê trong ca; không sửa giá |
| Kế toán / tài chính | org hoặc outlet | GĐ2 | Xem doanh thu, chi phí, công nợ; xuất báo cáo |
| Giáo viên, cộng tác viên | outlet (GĐ3) | GĐ3 | Điểm danh lớp, workshop |
| Khách hàng / thành viên | public | GĐ3 | Thẻ thành viên, đặt chỗ, tích điểm trả chai (tùy chọn) |

Phân quyền theo ma trận `role × resource × action`, kiểm tra ở backend (row-level security theo `org_id`, `outlet_id`).

---

## 5. Giai đoạn 1 – Vận hành một điểm bán (12/2026–2/2027)

Mục tiêu: thay thế artifact hiện tại bằng sản phẩm thật cho điểm Mô hình 2 của BaBa và 3 xe Mô hình 1, có đăng nhập, có số liệu tin cậy để quyết định mở rộng.

### 5.1 Tính năng
**A. Tài khoản và điểm bán**
- Đăng nhập bằng số điện thoại (OTP) hoặc email; mời nhân viên vào outlet bằng mã hoặc link.
- Hồ sơ outlet: tên, mô hình (1/2/3), địa chỉ, giờ bán, người phụ trách, trạng thái (chuẩn bị, đang bán, tạm dừng).

**B. Danh mục trung tâm (BaBa quản lý, outlet dùng)**
- Nguyên liệu: tên, đơn vị (g/ml), mức tối thiểu mặc định, hướng dẫn bảo quản, hạn dùng, loại (mua vào / tự làm).
- Sản phẩm: dòng (Mầm Xanh, Mầm Sáng, Mầm Lành, Mầm Trẻ), tên, giá niêm yết, màu nhận diện, có caffeine hay không, quy cách (chai 330 ml, ly nóng), trạng thái.
- Công thức (BOM) có phiên bản: định lượng nguyên liệu cho một đơn vị sản phẩm (xem Phụ lục A); mẻ sản xuất (syrup, cốt cold brew).
- Mức ngọt: 0 / 10 / 20 ml syrup.
- Set ăn healthy, bánh, đồ uống người lớn: sản phẩm không có BOM chi tiết ở GĐ1, chỉ ghi giá và số lượng.
- Outlet chọn **menu con** từ danh mục (tối thiểu theo cam kết mô hình); không sửa giá niêm yết, chỉ được bật tắt món.

**C. Bán hàng**
- Màn hình bán nhanh: lưới món theo dòng, bấm cộng số lượng, chọn mức ngọt, chọn hình thức thanh toán (tiền mặt, chuyển khoản, ví), ghi chú; lưu thành **đơn hàng** với thời gian.
- Chế độ "ghi gộp cuối buổi" (giữ thói quen artifact): nhập tổng số theo món và mức ngọt cho một buổi, hệ thống tạo một đơn gộp.
- Mỗi dòng đơn lưu giá và định lượng tại thời điểm bán; tự tạo `stock_movements` trừ kho.
- Hủy hoặc sửa đơn: tạo đơn đảo ngược, ghi lý do; chỉ chủ điểm được duyệt sau khi chốt ca.
- Ca bán: mở ca, đóng ca với tiền mặt đầu ca, cuối ca, chênh lệch; báo cáo ca gửi chủ điểm.

**D. Kho và sản xuất**
- Nhập kho: nguyên liệu, số lượng, giá mua (tùy chọn, để tính giá vốn), nhà cung cấp, số lô, hạn dùng.
- Mẻ sản xuất: chọn công thức mẻ, số mẻ; tự cộng thành phẩm, trừ nguyên liệu; ghi ngày làm để tính hạn.
- Tồn kho theo nguyên liệu: số dư, mức tối thiểu riêng của outlet, cảnh báo thiếu và hết hạn; kiểm kê theo danh sách, ghi chênh lệch có lý do (hao hụt, hỏng, nhập sai).
- Hủy hàng: ghi sữa đổ bỏ, hết hạn (để đo tỉ lệ hủy, một chỉ số quan trọng của sữa tươi).

**E. Doanh thu và chi phí**
- Doanh thu theo ngày, tuần, tháng, theo món, theo mức ngọt, theo hình thức thanh toán; so sánh kỳ trước.
- Giá vốn ước tính theo định lượng × giá mua trung bình; lợi nhuận gộp theo món.
- Ghi chi phí vận hành đơn giản: nguyên liệu, bao bì, thuê mặt bằng, điện nước, xăng xe, nhân sự, khác; theo tháng.
- Bảng điều khiển: hôm nay bán bao nhiêu chai, doanh thu, tỉ lệ hủy, cảnh báo kho, món bán chạy.

**F. Quy trình và tài liệu**
- Thư viện tài liệu chuẩn: quy trình sơ chế, công thức, bảo quản, vệ sinh (nội dung từ bộ hướng dẫn 16 trang); xem được ngoại tuyến.
- Checklist mở ca và đóng ca (vệ sinh, nhiệt độ tủ mát, hạn dùng) với tick và giờ; lưu lại để kiểm tra chất lượng sau này.

**G. Xuất dữ liệu và sao lưu**
- Xuất CSV/Excel: đơn hàng, kho, chi phí theo khoảng thời gian.
- Nhập dữ liệu từ artifact cũ (JSON sự kiện) để không mất lịch sử của điểm đã chạy thử.

### 5.2 Tiêu chí nghiệm thu GĐ1
- Ghi một buổi bán 60 chai trong dưới 1 phút trên điện thoại, không mạng vẫn lưu, có mạng tự đồng bộ.
- Tồn kho sau 30 ngày sai lệch so với kiểm kê dưới 5% cho nguyên liệu chính.
- Báo cáo tháng xuất được cho kế toán.
- Toàn bộ số liệu của điểm chạy thử (artifact) nhập được vào hệ thống mới.

---

## 6. Giai đoạn 2 – Mạng lưới đối tác độc lập (3–8/2027 và tiếp theo)

Mục tiêu: các điểm bán của đối tác hoạt động độc lập về tài chính nhưng dùng chung hệ thống, nộp chi phí vận hành BaBa chung 1.000 đ/chai, và phối hợp với BaBa về chất lượng, công thức, truyền thông.

### 6.1 Tính năng
**A. Quản lý đối tác và điểm bán**
- Hồ sơ đối tác (cá nhân hoặc hộ kinh doanh): thông tin liên hệ, giấy tờ an toàn thực phẩm (tải lên, ngày hết hạn, nhắc gia hạn), ngày bắt đầu.
- Thỏa thuận hợp tác số hóa: mô hình, cam kết thời gian tối thiểu, lịch bán tối thiểu, số món tối thiểu, bán kính bảo vệ, ngày hiệu lực; trạng thái hợp tác (thử việc, đang hoạt động, nhắc nhở, tạm dừng, kết thúc).
- Quy trình gia nhập (onboarding): liên hệ → học việc → chuẩn bị → ký thỏa thuận → khai trương; checklist từng bước, ai phụ trách.
- Bản đồ điểm bán, kiểm tra bán kính bảo vệ khi mở điểm mới.

**B. Danh mục trung tâm phân phối xuống outlet**
- BaBa phát hành phiên bản công thức, giá, tài liệu; outlet nhận thông báo và phải xác nhận đã đọc. Giá niêm yết chung khóa, outlet không sửa.
- Món sáng tạo của outlet: gửi đề xuất công thức, BaBa duyệt, mới được bán (ghi rõ quyền sáng tạo theo mô hình: 1 món sau tháng 3, tối đa 3 món sau tháng 6...).
- Menu con theo outlet; kiểm tra tự động số món tối thiểu theo cam kết.

**C. Phí và đối soát**
- **Sổ phí (fee ledger):** mỗi đơn hàng sinh dòng phí `1.000 đ × số chai, ly`; tỉ lệ cấu hình được theo org, có hiệu lực theo thời gian. Set ăn, bánh có tính phí hay không là tham số (mặc định: chỉ chai và ly sữa).
- Bảng kê tháng cho từng outlet: số chai, ly, phí phải nộp, đóng góp tùy tâm, điều chỉnh; xuất PDF.
- Thanh toán: outlet xác nhận chuyển khoản (ảnh chứng từ, mã giao dịch), BaBa đối soát, trạng thái (chưa nộp, chờ đối soát, đã nộp, quá hạn). Tích hợp QR chuyển khoản ngân hàng theo chuẩn VietQR nếu có.
- Nhắc nợ tự động, lịch sử nộp phí.

**D. Chất lượng và đào tạo**
- Checklist kiểm tra chất lượng (QC) định kỳ do BaBa thực hiện tại điểm: vệ sinh, bảo quản, đúng công thức, đúng giá, nhận diện; chấm điểm, ảnh, yêu cầu khắc phục, hạn.
- Hồ sơ học việc: nội dung đã học, ngày, người hướng dẫn, kết quả; cấp "chứng nhận đã học việc" nội bộ trước khi mở bán.
- Thư viện video, tài liệu theo phiên bản; theo dõi ai đã xem.

**E. Phối hợp và truyền thông**
- Thông báo từ BaBa đến toàn mạng lưới hoặc nhóm outlet; xác nhận đã đọc.
- Yêu cầu hỗ trợ (ticket): thiết bị, nguyên liệu, công thức, phần mềm; theo dõi trạng thái.
- Đặt nguyên liệu, bao bì từ BaBa (nếu BaBa cung ứng chung): đơn đặt, giao, đối chiếu kho.
- Lịch hoạt động cộng đồng, sự kiện; outlet đăng ký tham gia; báo cáo hình ảnh (có đánh dấu đã xin phép phụ huynh).

**F. Báo cáo mạng lưới cho BaBa**
- Toàn mạng lưới: số điểm đang bán, chai/ngày, doanh thu, phí phải thu, tỉ lệ hủy, điểm có cảnh báo.
- Xếp hạng theo mô hình, khu vực; phát hiện điểm bán ít hơn cam kết (lịch bán tối thiểu) để hỗ trợ sớm.
- Chỉ số sứ mệnh: số gia đình cùng khởi nghiệp, số chai nhựa thay bằng bình BaBa (ghi tại quầy), sữa tặng.

**G. Dữ liệu riêng tư giữa các outlet**
- Outlet chỉ thấy số liệu của mình. BaBa thấy toàn bộ. Có tùy chọn chia sẻ ẩn danh thứ hạng để động viên.

### 6.2 Tiêu chí nghiệm thu GĐ2
- Mở một outlet mới trong dưới 10 phút; đối tác tự thao tác được sau một buổi hướng dẫn.
- Bảng kê phí tháng khớp 100% với tổng số chai, ly trên đơn hàng; mọi điều chỉnh có lý do.
- Phiên bản công thức mới đến đúng các outlet, có xác nhận đọc.

---

## 7. Giai đoạn 3 – Quán lớn và BaBa’s Garden (9/2027 trở đi)

Mục tiêu: hỗ trợ quán ngồi, quán có khu trải nghiệm, và khu vườn nhiều nguồn thu; chia lợi nhuận theo quý; đo lường sứ mệnh và thiện nguyện.

### 7.1 Tính năng
**A. Bán tại chỗ**
- Bàn, gọi món theo bàn, tách gộp hóa đơn; bếp nhận lệnh (set ăn, bánh); in hóa đơn, gửi hóa đơn điện tử theo quy định.
- Nhiều quầy trong một cơ sở (quán sữa, khu chơi, lớp sáng tạo, thời trang, sách) = nhiều **khu doanh thu (revenue center)** trong cùng outlet.

**B. Nguồn thu ngoài sữa**
- Vé khu chơi theo lượt, theo giờ, ngày thường và cuối tuần; check-in, check-out.
- Lớp và workshop: lịch, sức chứa, đăng ký, học phí, điểm danh, giáo viên cộng tác và thù lao theo buổi.
- Sản phẩm vật lý (BABA’s Hug, sách, cây, set quà): tồn kho theo SKU, size, màu; bán tại chỗ và online; đặt trước.
- Combo (ví dụ combo Reading: sữa + bánh, đọc miễn phí) và thẻ thành viên gia đình.

**C. Lợi nhuận và chia sẻ**
- Sổ cái kế toán đơn giản theo outlet: doanh thu theo khu, giá vốn, chi phí vận hành (mặt bằng, nhân sự, điện nước, giáo viên...).
- **Bảng kê quý:** lợi nhuận = doanh thu trừ chi phí vận hành; áp tỉ lệ 5% / 7% / 10% theo mô hình; BaBa’s Garden tính chung toàn khu vườn; không có lợi nhuận thì không phát sinh. Có quy trình hai bên xác nhận.
- Khoản 1.000 đ/chai, ly vẫn tính song song.

**D. Thiện nguyện và sứ mệnh (Gieo Mầm Thương)**
- Ghi hoạt động: loại (buổi cộng đồng, ngày chơi miễn phí, tặng sữa, sách đi xa, áo thương, gieo cây), ngày, số trẻ, số sữa, số sách, ảnh, đơn vị phối hợp.
- Quỹ Hạt Mầm: tự trích 500 đ mỗi chai tại BaBa’s Garden; sổ quỹ thu, chi, số dư; báo cáo công khai mỗi quý.
- Bảng chỉ số sứ mệnh toàn hệ thống.

**E. Khách hàng và cộng đồng**
- Hồ sơ gia đình (có đồng ý), thẻ thành viên, tích điểm trả chai, lịch sử tham gia lớp; nhắc lịch; Zalo OA tích hợp thông báo.
- Đặt chỗ lớp, workshop, sinh nhật trọn gói.

**F. Nhân sự**
- Ca làm, chấm công, bảng lương theo giờ cho nhân viên quán (mở rộng từ "ca bán" ở GĐ1).

### 7.2 Tiêu chí nghiệm thu GĐ3
- Bảng kê quý khớp giữa sổ cái và hai bên; số liệu từng khu doanh thu tách bạch.
- Báo cáo sứ mệnh quý xuất được dưới dạng PDF đăng Fanpage.

---

## 8. Thiết kế dữ liệu

### 8.1 Nguyên tắc chung
- Khóa chính `uuid`; mọi bảng có `org_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` (xóa mềm), `client_id` cho bản ghi tạo ở thiết bị.
- Bảng nghiệp vụ thuộc điểm bán có `outlet_id`. Bảng danh mục trung tâm có `org_id` và phiên bản.
- Tiền lưu số nguyên VND; số lượng lưu số thập phân với đơn vị chuẩn (g, ml, cái).
- Thời gian lưu UTC, hiển thị theo Asia/Ho_Chi_Minh; ngày nghiệp vụ `business_date` lưu riêng (ca đêm vẫn thuộc đúng ngày bán).

### 8.2 Các bảng chính (theo giai đoạn xuất hiện)

**GĐ1 – Nền tảng**
- `orgs` (id, name, settings)
- `outlets` (id, org_id, code, name, model: 'M1'|'M2_street'|'M2_shop'|'M3_seat'|'M3_experience'|'GARDEN', address, lat, lng, status, opened_at, owner_user_id, timezone)
- `users` (id, phone, email, name, status) · `memberships` (user_id, org_id, outlet_id nullable, role, status)
- `ingredients` (id, org_id, code, name, unit, kind: 'purchased'|'made', shelf_days, storage_note, default_min_qty, status)
- `products` (id, org_id, code, name, line, color, has_caffeine, kind: 'milk_bottle'|'milk_hot'|'meal_set'|'bakery'|'adult_drink'|'ticket'|'class'|'goods'|'combo', status)
- `product_prices` (id, product_id, price_vnd, price_list_id, valid_from, valid_to)
- `price_lists` (id, org_id, name, applies_to_models[]) — giá niêm yết chung; cho phép bảng giá riêng cho ly tại chỗ ở GĐ3
- `recipes` (id, product_id, version, valid_from, valid_to, yield_qty, yield_unit, status: 'draft'|'approved'|'retired', approved_by) · `recipe_items` (recipe_id, ingredient_id, qty, unit)
- `batch_recipes` (id, org_id, name, output_ingredient_id, output_qty, version, valid_from) · `batch_recipe_items`
- `sweetness_levels` (id, org_id, code, name, syrup_ml, valid_from)
- `outlet_menu` (outlet_id, product_id, enabled, since)
- `shifts` (id, outlet_id, opened_by, opened_at, closed_at, cash_open, cash_close, cash_expected, note)
- `orders` (id, outlet_id, shift_id, business_date, placed_at, channel: 'counter'|'aggregate'|'online', status, total_vnd, payment_method, note, reversal_of_order_id)
- `order_lines` (id, order_id, product_id, qty, unit_price_vnd, sweetness_level_id, recipe_version_id, line_total_vnd)
- `stock_movements` (id, outlet_id, ingredient_id, qty_delta, reason: 'sale'|'purchase'|'batch_in'|'batch_use'|'count_adjust'|'waste'|'transfer', ref_type, ref_id, business_date, unit_cost_vnd nullable, lot_id nullable)
- `stock_balances` (outlet_id, ingredient_id, business_date, qty_end) — snapshot ngày, tính lại từ movements
- `purchases` (id, outlet_id, supplier_id, purchased_at, total_vnd) · `purchase_lines` (ingredient_id, qty, unit_cost_vnd, lot_no, expires_at)
- `production_batches` (id, outlet_id, batch_recipe_id, version, count, produced_at, expires_at)
- `stock_counts` (id, outlet_id, counted_at, counted_by) · `stock_count_lines` (ingredient_id, qty_book, qty_actual, reason)
- `waste_logs` (id, outlet_id, product_id or ingredient_id, qty, reason, logged_at)
- `expenses` (id, outlet_id, category, amount_vnd, spent_on, note, attachment_url)
- `documents` (id, org_id, title, type: 'sop'|'recipe'|'training'|'policy', version, file_url, published_at) · `document_reads` (document_id, user_id, read_at)
- `checklists` (id, org_id, name, scope: 'open'|'close'|'qc') · `checklist_items` · `checklist_runs` (outlet_id, shift_id, checklist_id, completed_by, completed_at) · `checklist_run_items` (item_id, checked, value, photo_url)
- `audit_logs` (id, org_id, actor_id, entity, entity_id, action, before_json, after_json, at, device)
- `sync_queue` (phía client) và `idempotency_keys` (phía server, theo client_id)

**GĐ2 – Đối tác và phí**
- `partners` (id, org_id, user_id, legal_name, type: 'individual'|'household_business', tax_code nullable, address) · `partner_documents` (partner_id, kind: 'food_safety_cert'|'health_check'|'business_license', file_url, issued_at, expires_at)
- `agreements` (id, outlet_id, partner_id, model, start_date, min_months, min_sessions_per_week, min_products, protection_radius_m, fee_rule_id, profit_share_rule_id nullable, status, signed_at, signed_doc_url)
- `fee_rules` (id, org_id, name, per_unit_vnd: 1000, applies_to_kinds: ['milk_bottle','milk_hot'], valid_from, valid_to)
- `fee_ledger` (id, outlet_id, order_line_id, business_date, units, amount_vnd, rule_id) — sinh tự động khi tạo đơn
- `fee_statements` (id, outlet_id, period_month, units_total, fee_total_vnd, voluntary_vnd, adjustments_vnd, status: 'draft'|'issued'|'paid'|'overdue', issued_at, due_at) · `fee_statement_lines`
- `payments` (id, outlet_id, statement_id, amount_vnd, method, paid_at, reference, proof_url, reconciled_by, reconciled_at)
- `menu_proposals` (id, outlet_id, product_draft_json, recipe_draft_json, status, reviewed_by, reviewed_at, note)
- `catalog_releases` (id, org_id, version, summary, published_at) · `release_acknowledgements` (release_id, outlet_id, acknowledged_by, at)
- `qc_inspections` (id, outlet_id, inspector_id, inspected_at, score, checklist_run_id, findings_json, follow_up_due) 
- `training_records` (id, user_id, outlet_id, module, trainer_id, completed_at, result)
- `onboarding_steps` (outlet_id, step, status, owner_id, due_at, done_at)
- `announcements` (org_id, title, body, audience_json, published_at) · `announcement_reads`
- `support_tickets` (outlet_id, category, body, status, assignee_id, created_at, resolved_at)
- `supply_orders` (outlet_id, status, lines) nếu BaBa cung ứng chung
- `community_events` (org_id or outlet_id, type, date, children_count, items_given_json, photos, consent_confirmed)

**GĐ3 – Nhiều nguồn thu và lợi nhuận**
- `revenue_centers` (id, outlet_id, name: 'quán sữa'|'khu chơi'|'lớp sáng tạo'|'thời trang'|'sách'|'vườn', kind)
- `products.kind` mở rộng (đã có cột từ GĐ1), `products.revenue_center_id` nullable
- `goods_variants` (product_id, size, color, sku, barcode) · tồn kho hàng hóa dùng lại `stock_movements` với `variant_id`
- `tickets` (id, outlet_id, order_line_id, child_name nullable, check_in, check_out, rate_type: 'weekday'|'weekend')
- `classes` (id, outlet_id, title, teacher_id, starts_at, capacity, fee_vnd) · `class_enrollments` (class_id, family_id, child_name, paid_order_line_id, attended)
- `families` (id, org_id, parent_name, phone, consent_marketing, consent_photo, created_at) · `children` (family_id, nickname, birth_year) · `memberships_customer` (family_id, outlet_id, plan, valid_from, valid_to) · `loyalty_events` (family_id, type: 'bottle_return'|'purchase'|'redeem', points)
- `tables` · `table_sessions` (quán ngồi)
- `gl_accounts`, `gl_entries` (sổ cái đơn giản) hoặc map `orders`/`expenses` sang danh mục kế toán
- `profit_share_rules` (model, percent, period: 'quarter')
- `profit_statements` (outlet_id, period_quarter, revenue_vnd, cost_vnd, profit_vnd, percent, share_vnd, status, confirmed_by_outlet_at, confirmed_by_org_at)
- `charity_fund` (org_id, name: 'Quỹ Hạt Mầm', rule_per_unit_vnd: 500, scope) · `charity_fund_entries` (fund_id, type: 'accrual'|'spend', amount_vnd, ref, at) · `mission_metrics` (org_id, metric, period, value)
- `staff_shifts`, `timesheets`, `payroll_runs`

### 8.3 Quan hệ chính
`orgs 1–n outlets 1–n orders 1–n order_lines`; `order_lines → stock_movements` (theo recipe version); `order_lines → fee_ledger`; `outlets 1–1 agreements (hiện hành) n–1 partners`; `fee_ledger → fee_statements → payments`; `outlets 1–n revenue_centers 1–n products (GĐ3)`.

### 8.4 Chiến lược nâng cấp không gián đoạn
1. **Lược đồ chỉ cộng thêm:** cột mới có giá trị mặc định; bảng mới; không đổi kiểu hay ý nghĩa cột cũ. Khi cần đổi, tạo cột mới, backfill, chuyển ứng dụng sang đọc cột mới, giữ cột cũ một thời gian rồi mới gỡ.
2. **Dữ liệu GĐ1 là nguồn của GĐ2:** `orders` và `order_lines` đã có `outlet_id`, nên khi bật `fee_rules` ở GĐ2, chạy một lần script sinh `fee_ledger` cho các đơn từ ngày hiệu lực (thường là ngày ký thỏa thuận), không đụng vào đơn cũ.
3. **Outlet của BaBa và outlet đối tác cùng một cấu trúc:** khác nhau chỉ ở `agreements` và `fee_rules`; outlet nội bộ có `fee_rule = null`.
4. **Phiên bản danh mục:** đơn hàng cũ giữ `recipe_version_id` và `unit_price_vnd` nên đổi công thức, đổi giá không làm sai lịch sử và báo cáo cũ.
5. **Cờ tính năng theo outlet:** quán M3 bật bàn, vé, lớp; xe M1 vẫn thấy giao diện tối giản. Người dùng cũ không thấy gì thay đổi nếu outlet không bật tính năng mới.
6. **Nhập từ artifact:** `sale` → một `order` kênh `aggregate` với các `order_lines` và `stock_movements`; `in` → `purchases`; `make` → `production_batches`; `count` → `stock_counts`. Giữ `source='artifact_v0'` và id gốc để đối chiếu.
7. **Kiểm thử di chuyển dữ liệu:** trước mỗi lần nâng cấp, chạy trên bản sao, so sánh tổng doanh thu, tổng chai, tồn kho cuối kỳ giữa bản cũ và bản mới; lệch bằng 0 mới triển khai.
8. **Sao lưu hằng ngày, phục hồi theo thời điểm; xuất dữ liệu đầy đủ cho outlet khi kết thúc hợp tác.**

---

## 9. Kiến trúc và công nghệ đề xuất

- **Backend:** PostgreSQL (khuyến nghị Supabase để có Auth, Row Level Security, Realtime, Storage nhanh) hoặc Firebase nếu muốn kế thừa Firestore hiện tại. PostgreSQL phù hợp hơn cho đối soát phí, báo cáo và lợi nhuận theo quý.
- **Frontend:** PWA (React hoặc Vue), mobile-first, hoạt động ngoại tuyến với IndexedDB và hàng đợi đồng bộ; một mã nguồn cho điện thoại và máy tính.
- **Báo cáo:** materialized views cho doanh thu ngày, tồn kho ngày, phí tháng; cron làm mới theo giờ.
- **Tệp:** ảnh chứng từ, giấy tờ, ảnh hoạt động lưu object storage, có thời hạn truy cập.
- **Thông báo:** Zalo OA hoặc SMS cho OTP và nhắc phí; email cho bảng kê.
- **Giao diện:** theo BaBa Design System (xanh #296241, kem #F7F3EB, Quicksand); chữ tối thiểu 16 px trên điện thoại; nút lớn cho thao tác tại quầy.
- **Bảo mật:** RLS theo `org_id` và `outlet_id`; 2 lớp quyền (membership, role); nhật ký kiểm toán; mã hóa dữ liệu cá nhân nhạy cảm; xóa dữ liệu theo yêu cầu.

---

## 10. Những điểm cần bổ sung hoặc cải thiện so với artifact hiện tại (tóm tắt)

| Vấn đề hiện tại | Cách xử lý |
| --- | --- |
| Danh mục cố định trong mã | Danh mục có phiên bản trong cơ sở dữ liệu, BaBa quản lý, phát hành xuống outlet |
| Ghi theo ngày, không theo đơn | Đơn hàng và dòng đơn; vẫn giữ chế độ ghi gộp cuối buổi |
| Không có người dùng, quyền | Đăng nhập OTP, membership, role, RLS |
| Tính kho duyệt toàn bộ lịch sử | Snapshot số dư ngày + movements |
| Không có phí, công nợ | Fee ledger, bảng kê tháng, thanh toán, đối soát |
| Không có chi phí, lợi nhuận | Expenses, giá vốn, sổ cái đơn giản, bảng kê quý |
| Không có chất lượng, đào tạo | Checklist, QC, hồ sơ học việc, tài liệu có phiên bản |
| Không có đối tác, hợp đồng | Partners, agreements, onboarding, bán kính bảo vệ |
| Không xuất, không sao lưu | Xuất CSV/PDF, sao lưu ngày, nhập từ artifact |
| Không đo sứ mệnh | Community events, Quỹ Hạt Mầm, mission metrics |

---

## 11. Lộ trình phát triển gợi ý

| Mốc | Thời gian | Nội dung |
| --- | --- | --- |
| Sprint 0 | 2 tuần | Chốt lược đồ GĐ1, thiết kế màn hình theo Design System, dựng Auth và RLS |
| GĐ1 bản 1 | 6–8 tuần | Bán hàng, kho, sản xuất, kiểm kê, doanh thu, chi phí, checklist, xuất dữ liệu, nhập từ artifact; chạy tại điểm Mô hình 2 và 3 xe |
| GĐ1 bản 2 | 4 tuần | Ngoại tuyến, ca bán, cảnh báo, bảng điều khiển; sửa theo phản hồi thực tế |
| GĐ2 bản 1 | 8–10 tuần | Đối tác, thỏa thuận, fee ledger, bảng kê, thanh toán, phát hành danh mục, thông báo |
| GĐ2 bản 2 | 6 tuần | QC, đào tạo, ticket, bản đồ, báo cáo mạng lưới, chỉ số sứ mệnh |
| GĐ3 | theo mốc quán trải nghiệm | Bàn, vé, lớp, hàng hóa, thành viên, sổ cái, bảng kê quý, Quỹ Hạt Mầm |

---

## 12. Câu hỏi mở cần chủ dự án chốt
1. Set ăn healthy, bánh, đồ uống người lớn có tính khoản 1.000 đ/đơn vị không, hay chỉ chai và ly sữa?
2. Bán kính bảo vệ (m) và số tuần ngừng bán tối đa trước khi nhắc nhở.
3. Định nghĩa chi phí vận hành được trừ khi tính lợi nhuận GĐ3 (có tính khấu hao thiết bị, lương chủ quán không).
4. BaBa có cung ứng nguyên liệu chung cho đối tác không (quyết định có cần module đặt hàng nội bộ).
5. Hóa đơn điện tử và thuế hộ kinh doanh: cần tích hợp từ GĐ nào.
6. Có cho outlet đặt giá bán ly tại chỗ khác giá chai hay không.

---

## Phụ lục A – Dữ liệu danh mục hiện hành (để seed)

**Nguyên liệu** (mã, tên, đơn vị, mức tối thiểu, hạn dùng nếu tự làm):
dau_do Đậu đỏ khô g 3000 · bap Bắp Mỹ hạt g 3000 · me Mè đen g 1000 · dieu Hạt điều g 3000 · hanh_nhan Hạnh nhân g 1000 · oc_cho Óc chó g 500 · thanh_long Thanh long đỏ g 1000 · ca_rot Cà rốt g 1000 · bi_do Bí đỏ g 1000 · khoai Khoai lang mật g 1000 · dua Cơm dừa tươi g 500 (hạn 1 ngày) · la_dua Bột lá dứa g 50 · cacao Bột cacao g 300 · matcha Matcha g 100 · cot Cốt cold brew ml 1200 (tự làm, hạn 7 ngày) · syrup Syrup ngọt lành ml 1000 (tự làm, hạn 14 ngày) · caphe Cà phê rang xay g 400 · thot_not Đường thốt nốt g 500 · phen Đường phèn g 500 · nhai Hoa nhài khô g 20.

**Sản phẩm, giá, định lượng cho 1 chai 330 ml**
| Dòng | Mã | Tên | Giá | Định lượng |
| --- | --- | --- | --- | --- |
| Mầm Xanh | md | Mầm Đỏ Hồng Hào | 15.000 | đậu đỏ 40 g |
| Mầm Xanh | mv | Mầm Vàng Thơm Ngon | 15.000 | bắp 140 g |
| Mầm Xanh | mden | Mầm Đen Khoẻ Mạnh | 15.000 | mè đen 28 g |
| Mầm Sáng | sh | Mầm Sáng Hồng Hào | 20.000 | đậu đỏ 20 g, hạt điều 20 g, thanh long 50 g |
| Mầm Sáng | smt | Mầm Sáng Mắt Trong | 20.000 | hạnh nhân 25 g, đậu đỏ 15 g, cà rốt 50 g |
| Mầm Sáng | stt | Mầm Sáng Trí Tuệ | 25.000 | óc chó 15 g, hạt điều 20 g, bí đỏ 60 g |
| Mầm Lành | lnb | Mầm Lành Nhẹ Bụng | 20.000 | bắp 70 g, hạt điều 18 g, khoai lang mật 50 g |
| Mầm Lành | lvx | Mầm Lành Vững Xương | 20.000 | mè đen 18 g, hạt điều 25 g, bột lá dứa 0,75 g |
| Mầm Lành | lnl | Mầm Lành Năng Lượng | 25.000 | hạnh nhân 20 g, hạt điều 25 g, cơm dừa 30 g |
| Mầm Trẻ | tcc | Mầm Sữa Cacao | 30.000 | hạt điều 35 g, cacao 9 g |
| Mầm Trẻ | tmc | Mầm Sữa Matcha | 30.000 | hạt điều 32 g, matcha 3,5 g (caffeine) |
| Mầm Trẻ | tcb | Mầm Sữa Cold Brew | 30.000 | hạt điều 30 g, cốt cold brew 75 ml (caffeine) |

**Mẻ sản xuất:** syrup ngọt lành 1 lít = thốt nốt 375 g + đường phèn 250 g + hoa nhài 5 g (cho hoa nhài sau khi tắt bếp); cốt cold brew 1.200 ml = cà phê rang xay 200 g.
**Mức ngọt:** không đường 0 ml, ít ngọt 10 ml, ngọt vừa 20 ml syrup mỗi chai hoặc ly.
**Set ăn healthy:** mang đi 15–20K (Mô hình 2); tại chỗ 25–55K (Mô hình 3, Garden). **Bảng giá tham khảo BaBa’s Garden:** vé khu chơi 150K ngày thường, 200K cuối tuần; lớp sáng tạo 150–350K/buổi; workshop 250–450K/vé; thời trang 250–850K; sữa xay nóng 25–45K; đồ uống người lớn 45–75K; bánh 25–45K; combo Reading 59–79K.

## Phụ lục B – Thuật ngữ
- **Outlet / điểm bán:** một xe, một quầy, một quán, một khu vườn.
- **Đối tác:** cá nhân hoặc hộ kinh doanh vận hành điểm bán theo thỏa thuận với BaBa.
- **Chi phí vận hành BaBa chung:** 1.000 đ cho mỗi chai, ly sữa bán ra.
- **Đóng góp phát triển hệ thống:** phần trăm lợi nhuận Mô hình 3 và BaBa’s Garden.
- **Gieo Mầm Thương:** chương trình thiện nguyện; **Quỹ Hạt Mầm:** 500 đ mỗi chai tại BaBa’s Garden.
- **Kho BaBa:** tên ứng dụng vận hành dùng chung toàn hệ thống.
