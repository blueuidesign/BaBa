# Mô tả chức năng · Kho BaBa bản 1 · User story

Phiên bản 1.1 · 09/11/2026 · Đã đối chiếu với bản thiết kế 28 màn và thiết kế DB 1.2

**Cách đọc.** Mỗi story có: mã, tên, mô tả ngắn (ai, muốn gì, để làm gì), tiêu chí nghiệm thu (Acceptance criteria, viết dạng *Khi… thì…*), và các trường hợp ngoại lệ (Exception) kèm cách app xử lý. Mã màn hình (A04, B01…) trỏ về bản thiết kế.

**Vai trò.** *Chủ cơ sở* (owner): người đứng bán và quản cơ sở, ví dụ Hà. *Nhân viên* (staff): người đứng quầy được chủ mời. *Admin BaBa*: hai tài khoản quản trị, quản danh mục chung. Nếu story không ghi vai trò thì áp dụng cho chủ cơ sở và nhân viên.

**Thuật ngữ.** *Chai* = một đơn vị bán (chai 330 ml hoặc ly). *Vật tư* = nguyên liệu, phụ gia, bán thành phẩm tự làm, bao bì. *Bản ghi* = một dòng trong sổ cái không sửa đè.

---

## Nhóm A · Vào app

### A-1 Đăng nhập bằng email và mã 6 số
**Mô tả.** Là người dùng, tôi muốn vào app chỉ bằng email và mã gửi về email, để không phải nhớ mật khẩu.

**Tiêu chí nghiệm thu**
- Khi nhập email hợp lệ và bấm "Gửi mã", thì trong 60 giây email nhận được mã 6 số, màn A02 hiện email vừa nhập và ô 6 số.
- Khi nhập đúng mã còn hạn, thì vào A03 nếu tài khoản thuộc từ 2 cơ sở, vào thẳng A04 của cơ sở duy nhất nếu chỉ có 1.
- Mã hết hạn sau 10 phút. Nút "Gửi lại" khóa 60 giây sau mỗi lần gửi và hiện đếm ngược.
- Phiên đăng nhập giữ 30 ngày trên thiết bị đã dùng; mở lại app không phải nhập mã.

**Ngoại lệ**
- Email sai định dạng: báo ngay dưới ô, không gửi.
- Mã sai hoặc hết hạn (S01): báo rõ lý do, cho thử lại, hiện số lần còn lại. Sai nhiều lần liên tiếp thì bị khóa tạm theo cấu hình của Supabase Auth (đặt 5 lần, 15 phút).
- Email chưa được mời vào cơ sở nào: vẫn đăng nhập được, nhưng A03 trống và hiện hướng dẫn "nhờ chủ cơ sở mời bằng email này".
- Mất mạng lúc bấm gửi: báo "chưa gửi được, kiểm tra mạng", không trừ lượt.

### A-2 Chọn cơ sở đang làm việc
**Mô tả.** Là người thuộc nhiều cơ sở, tôi muốn chọn đúng nơi đang đứng bán, để đơn và kho không lẫn giữa các cơ sở.

**Tiêu chí nghiệm thu**
- A03 liệt kê mọi cơ sở tôi là thành viên đang hoạt động, mỗi dòng có tên, mô hình, vai trò của tôi.
- Bấm vào một dòng là vào A04 của cơ sở đó ngay, không cần xác nhận.
- Cơ sở đang chọn có viền xanh và dấu tích; app nhớ lựa chọn cho lần mở sau.
- Đổi cơ sở được từ G01 ("Đổi cơ sở") bất cứ lúc nào.

**Ngoại lệ**
- Chỉ có 1 cơ sở: bỏ qua A03.
- Bị gỡ khỏi cơ sở đang mở: lần đồng bộ kế tiếp báo "bạn không còn thuộc cơ sở này" và đưa về A03.

### A-3 Tạo cơ sở mới
**Mô tả.** Là chủ cơ sở hoặc admin, tôi muốn mở thêm một xe hay một quầy, để cơ sở mới có kho và sổ riêng ngay.

**Tiêu chí nghiệm thu**
- Nhập tên và chọn mô hình (xe lưu động, takeaway vỉa hè, có mặt bằng) rồi bấm "Tạo cơ sở" thì cơ sở mới xuất hiện trong A03, người tạo là `owner`.
- Cơ sở mới dùng danh mục chung của BaBa (12 món, 22 vật tư, công thức, giá); menu bật sẵn theo mô hình (xe lưu động: 4 món Đỏ, Vàng, Cacao, Matcha; mô hình khác: đủ 12), chủ cơ sở bật tắt món trong cài đặt; kho trống (S05).
- Tên cơ sở không trùng trong cùng tổ chức.

**Ngoại lệ**
- Tên trống hoặc trùng: báo dưới ô, không tạo.
- Nhân viên (`staff`) không thấy phần tạo cơ sở.

### A-4 Trang chủ của cơ sở
**Mô tả.** Là người đứng bán, tôi muốn mở app là thấy ngay hôm nay bán được bao nhiêu, còn bao nhiêu chai và việc gì cần làm, để không phải đi tìm.

**Tiêu chí nghiệm thu**
- A04 hiện: đã bán hôm nay (chai, tiền, số đơn), còn trên quầy (chai; ghi rõ nấu bao nhiêu, tồn qua bao nhiêu), nút "Ghi đơn mới", danh sách việc hôm nay, 3 đơn gần nhất.
- "Việc hôm nay" chỉ hiện việc có thật: vật tư cần đặt (từ D-1), chưa đối chiếu (nếu hôm nay có đơn), kế hoạch nấu ngày mai (sau 15:00).
- Số liệu cập nhật ngay sau mỗi đơn lưu, không cần tải lại.
- Đầu ngày chưa nấu và chưa bán (S02): thay số liệu bằng lời nhắc ghi mẻ nấu, kèm chai tồn hôm qua.

**Ngoại lệ**
- Hôm qua chưa chốt ngày: "Việc hôm nay" hiện dòng "Chưa đối chiếu 08/11" ở đầu, màu cảnh báo; tồn qua lấy theo số sổ và ghi rõ "chưa đếm".
- Mất mạng: hiện số liệu lần đồng bộ cuối kèm giờ, banner "đang ngoại tuyến".

### A-5 Tài khoản
**Mô tả.** Là người dùng, tôi muốn xem mình là ai, đang ở cơ sở nào, và đi tới các mục quản lý, để mọi thứ ít dùng nằm gọn một chỗ.

**Tiêu chí nghiệm thu**
- G01 hiện tên, email, vai trò; cơ sở đang làm việc với nút "Đổi cơ sở"; mục Quản lý: Tồn kho và nhập hàng, Chai đang có, Lịch sử, Thông báo; mục Quản trị liệt kê admin BaBa (chỉ xem); Đăng xuất.
- Tên hiển thị lấy từ hồ sơ (do người mời nhập); sửa tên trong app để bản sau.
- Đăng xuất hỏi xác nhận một lần; đăng xuất xóa dữ liệu tạm trên máy nếu không còn đơn chờ gửi.

**Ngoại lệ**
- Còn đơn chờ gửi (ngoại tuyến) mà bấm đăng xuất: cảnh báo "còn N đơn chưa gửi, đăng xuất sẽ mất", yêu cầu xác nhận lần hai.

---

## Nhóm B · Ghi đơn

### B-1 Ghi một đơn bằng lưới món
**Mô tả.** Là người đứng bán, tôi muốn bấm vào ô món để cộng số chai và lưu đơn trong vài giây, để không bỏ sót đơn lúc đông khách.

**Tiêu chí nghiệm thu**
- B01 hiện lưới ô theo 4 dòng, chỉ gồm món cơ sở đã bật, mỗi ô có ảnh, tên ngắn, giá, số chai còn.
- Bấm một ô: số lượng tăng 1, ô có viền xanh và huy hiệu số ở góc; bấm tiếp tăng tiếp.
- Thanh dưới hiện từng món đã chọn dạng chip "Tên ×N" có nút bớt một; tổng chai và tổng tiền cập nhật tức thì.
- Nút "Lưu đơn" chỉ bấm được khi có ít nhất 1 chai. Lưu xong sang B02 trong dưới 1 giây (ghi tại máy trước, gửi máy chủ sau).
- Giá lấy theo bảng giá hiệu lực tại thời điểm lưu và được lưu vào từng dòng đơn.
- Lưu đơn không trừ vật tư nào (nguyên liệu và bao bì đã trừ lúc ghi nấu); chỉ giảm số chai còn trên quầy của món đó.

**Ngoại lệ**
- Món đã hết chai (còn 0): ô mờ, nhãn "Hết", không bấm được (S03). Chủ cơ sở bật được "cho bán khi sổ hết" trong cài đặt cơ sở (bản 1 bật bằng admin) nếu sổ sai; khi đó ô không mờ nhưng hiện "còn −1" để nhắc sửa ở đối chiếu.
- Mất mạng (S03): vẫn lưu được, banner vàng báo số đơn chờ gửi; có mạng lại thì tự gửi theo thứ tự, không tạo trùng (mỗi đơn có mã máy duy nhất).
- Máy chủ không trả lời sau 10 giây (S04): hỏi Thử lại / Giữ gửi sau / Bỏ đơn. "Bỏ đơn" phải xác nhận.
- Bấm lưu hai lần liên tiếp: chỉ tạo một đơn.

### B-2 Xem đơn vừa lưu, hoàn tác, đánh dấu tặng
**Mô tả.** Là người đứng bán, tôi muốn thấy ngay đơn vừa lưu có đúng không và sửa được trong tích tắc, để sai sót không lọt vào sổ.

**Tiêu chí nghiệm thu**
- B02 hiện số đơn trong ngày, giờ, tổng tiền, từng dòng, số chai còn trên quầy sau đơn.
- "Hoàn tác đơn này" tạo một bản ghi đảo và đánh dấu đơn gốc đã đảo; cả hai còn trong Lịch sử; quay về B01 với lưới trống.
- "Đánh dấu tặng" đổi giá mọi dòng về 0 bằng cách tạo đơn đảo và đơn mới `is_gift`, vẫn trừ chai; doanh thu không tính đơn tặng. Chai tặng đã ghi kiểu này **không** nhập lại vào ô "Tặng" ở đối chiếu cuối ngày (E-1), vì đã nằm trong số đơn ghi.
- "Thêm đơn mới" về B01 với lưới trống.

**Ngoại lệ**
- Hoàn tác đơn của ngày đã chốt: không cho; muốn sửa thì chủ cơ sở chốt lại ngày đó (E-3) kèm lý do.
- Hoàn tác khi đơn chưa gửi được lên máy chủ: xóa khỏi hàng chờ, không tạo bản ghi nào.

---

## Nhóm C · Nấu

### C-1 Lập kế hoạch nấu
**Mô tả.** Là người nấu, tôi muốn nhập số chai định nấu cho từng món và được gợi ý theo lịch sử, để nấu vừa đủ, không thừa không thiếu.

**Tiêu chí nghiệm thu**
- C01 liệt kê món đã bật với nút − +, mặc định bằng trung bình bán 7 ngày gần nhất của cơ sở (làm tròn lên), hiện rõ "TB 7 ngày: N".
- Chọn "Nấu cho ngày mai" hoặc "Nấu thêm hôm nay"; tổng chai và số món hiện ở thanh dưới.
- "Lấy theo 7 ngày" đặt lại toàn bộ về gợi ý.
- Kế hoạch được lưu nháp theo (cơ sở, ngày); mở lại thấy số đã nhập.

**Ngoại lệ**
- Cơ sở mới chưa có lịch sử: gợi ý theo mẫu BaBa cho mô hình đó, ghi rõ "gợi ý mẫu".
- Hôm qua bán hết sớm (còn 0 trước 10:00): gợi ý cộng thêm 20% và ghi chú lý do.

### C-2 Xem nguyên liệu cần, tổng và theo từng món
**Mô tả.** Là người nấu, tôi muốn biết tổng nguyên liệu để đi chợ và lượng cân cho từng món để múc vào cối, để không phải tự tính.

**Tiêu chí nghiệm thu**
- C02 "Tổng để đi chợ": mỗi vật tư hiện lượng cần, lượng đang có, nhãn Thiếu/Sát mức; bao bì tính luôn theo số chai.
- C04 "Theo từng món": mỗi món mở ra thấy từng nguyên liệu dạng "định lượng × số chai = tổng", ước số cối xay theo `yield_per_jar`.
- Hai cách xem chuyển qua lại bằng hai chip, giữ nguyên kế hoạch.
- Số liệu tính từ công thức đang hiệu lực; đổi số chai ở C01 thì C02/C04 đổi theo.

**Ngoại lệ**
- Kho thiếu nguyên liệu: C02 hiện hộp cảnh báo đỏ liệt kê món bị ảnh hưởng, nút "Ghi đã nấu" khóa; mở khi giảm số chai hoặc nhập hàng.
- Món không có công thức hiệu lực (lỗi danh mục): hiện "Chưa có công thức", không chặn các món khác, báo admin.

### C-3 Ghi đã nấu
**Mô tả.** Là người nấu, tôi muốn ghi số chai thật ra lò, để kho trừ đúng nguyên liệu và số chai trên quầy đúng.

**Tiêu chí nghiệm thu**
- Từ C02/C04 bấm "Ghi đã nấu": mặc định "Đúng như kế hoạch"; chọn "Sửa từng món" để nhập số thật.
- Lưu tạo một mẻ nấu với dòng theo món; kho trừ nguyên liệu = Σ(số chai × định lượng) và trừ bao bì (chai, nhãn, card) mỗi chai một bộ; số chai cộng vào "Còn trên quầy" của ngày nghiệp vụ đã chọn (hôm nay hoặc ngày mai).
- Sau khi ghi, kế hoạch chuyển trạng thái "đã nấu"; Lịch sử có bản ghi "Đã nấu N chai · M món".
- Cho ghi nấu không cần kế hoạch (nấu thêm giữa buổi).

**Ngoại lệ**
- Ghi nấu khi kho âm một nguyên liệu: cho ghi (hàng đã mua nhưng chưa nhập), kho hiện số âm màu đỏ và gợi ý nhập hàng; không chặn vì chặn làm người dùng bỏ ghi.
- Ghi nhầm: sau khi ghi, C01 hiện thẻ "Đã ghi N chai · Hoàn tác" trong 10 phút; hoàn tác được nếu chưa có đơn nào trong ngày nghiệp vụ đó. Quá 10 phút hoặc đã có đơn: sửa bằng kiểm kê nguyên liệu (D-4) và đếm chai cuối ngày (E-1).

### C-4 Ghi mẻ syrup và cốt cold brew
**Mô tả.** Là người nấu, tôi muốn ghi mỗi mẻ syrup 1 lít hoặc cốt 1,2 lít, để kho trừ đường, cà phê và biết hạn dùng.

**Tiêu chí nghiệm thu**
- C03 hiện hai thẻ, mỗi thẻ: số mẻ với − +, nguyên liệu sẽ trừ, lượng đang có, hạn dùng.
- Ghi mẻ: trừ nguyên liệu, cộng thành phẩm (ml), lưu ngày làm và hạn (14 ngày syrup, 7 ngày cốt).
- Cho ghi 0,5 mẻ.
- Khi thành phẩm sắp hết hạn (còn 2 ngày) hoặc dưới mức tối thiểu: thông báo ở F02 và "Việc hôm nay".

**Ngoại lệ**
- Kho đường/cà phê không đủ: cảnh báo nhưng vẫn cho ghi (lý do như C-3).
- Bản 1 không ghi mức ngọt theo đơn, nên syrup **không tự trừ theo bán**. Lượng syrup đúng dựa vào kiểm kê bình (D-4). App ghi rõ điều này ở C03.

---

## Nhóm D · Kho

### D-1 Xem tồn kho và vật tư cần đặt
**Mô tả.** Là chủ cơ sở, tôi muốn thấy vật tư nào sắp hết và còn dùng được mấy ngày, để đặt hàng kịp trước khi đứt.

**Tiêu chí nghiệm thu**
- D01 có các chip: Tất cả, Cần đặt (kèm số), Nguyên liệu chính, Phụ gia, Tự làm, Bao bì. Chỉ hiện vật tư cơ sở đang bật.
- Mỗi dòng: tên, lượng còn, thanh mức với vạch tối thiểu, số ngày còn dùng (theo tốc độ dùng 14 ngày), nhà cung cấp, "giao N ngày" hoặc "mua ngay được".
- "Cần đặt" = còn dưới mức tối thiểu, hoặc số ngày còn dùng ≤ số ngày giao hàng.
- Đầu danh sách có thẻ gom theo nhà cung cấp: "Nên đặt hôm nay: Hạt Việt (2 món)", bấm mở D02 của món đầu tiên.
- Vật tư có hạn: hiện hạn gần nhất; quá hạn thì nhãn đỏ.

**Ngoại lệ**
- Chưa đủ 14 ngày dữ liệu: tính theo số ngày có, ghi "ước theo N ngày"; dưới 3 ngày thì không hiện số ngày, chỉ so với mức tối thiểu.
- Kho trống (cơ sở mới, S05): hướng dẫn nhập hàng lần đầu hoặc kiểm kê để nhập số đang có, kèm gợi ý mua tuần đầu.
- Số âm (ghi nấu trước nhập): hiện đỏ, nhãn "Cần nhập hàng đã mua".

### D-2 Xem chi tiết và cài đặt nhắc đặt hàng cho một vật tư
**Mô tả.** Là chủ cơ sở, tôi muốn chỉnh mức tối thiểu, số ngày giao và nhà cung cấp cho từng vật tư, để nhắc nhở hợp với cách mua của mình.

**Tiêu chí nghiệm thu**
- D02 hiện: còn, dùng mỗi ngày, đủ dùng mấy ngày; cảnh báo nếu ngày còn dùng < ngày giao; nút Nhập hàng và "Đã đặt, đang về".
- Sửa được mức tối thiểu, số ngày giao (trống = mua ngay), nhà cung cấp (chọn hoặc tạo mới), bật/tắt email nhắc. Lưu là áp dụng cho cơ sở này, không ảnh hưởng cơ sở khác.
- "Đã đặt, đang về": ghi ngày dự kiến về = hôm nay + số ngày giao; tới ngày đó không nhắc nữa và D01 hiện nhãn "Đang về". Nhập hàng xong thì nhãn tự tắt.
- Hiện hướng dẫn bảo quản và danh sách món dùng vật tư này (từ công thức).
- Biến động 30 ngày gần nhất: nhập, nấu, kiểm kê.

**Ngoại lệ**
- Nhân viên: xem được, không sửa được cài đặt (nút mờ, ghi "chỉ chủ cơ sở").
- Mức tối thiểu nhập 0 hoặc âm: không cho lưu.
- Vật tư tự làm (syrup, cốt): không có nhà cung cấp và ngày giao; thay bằng "Nấu mẻ mới" trỏ về C03.

### D-3 Nhập hàng
**Mô tả.** Là người đi chợ, tôi muốn ghi hàng vừa mua theo đơn vị mình mua (kg, thùng), để kho tăng đúng mà không phải đổi đơn vị.

**Tiêu chí nghiệm thu**
- D03 chọn nhà cung cấp (chip) rồi thêm từng vật tư với số lượng; đơn vị mặc định là đơn vị mua (kg, thùng), app đổi sang đơn vị kho và hiện "= 5.000 g".
- Giá mua, hạn dùng, ghi chú, ảnh hóa đơn là tùy chọn.
- Bấm "Thêm vào kho": kho tăng ngay, Lịch sử có bản ghi, nhắc "Cần đặt" của vật tư đó tắt nếu đã đủ.
- Nhập được nhiều vật tư trong một lần.

**Ngoại lệ**
- Số lượng 0 hoặc trống: dòng đó không lưu, báo dưới ô.
- Nhập trùng (cùng vật tư, cùng số, trong 2 phút): hỏi "bạn vừa nhập giống hệt, có chắc không".
- Ảnh hóa đơn quá 10 MB: nén tự động; không tải được thì vẫn lưu phiếu, báo ảnh chưa lên.

### D-4 Kiểm kê kho nguyên liệu
**Mô tả.** Là chủ cơ sở, tôi muốn cân đếm thật và nhập vào, để sổ kho khớp thực tế và biết hao hụt ở đâu.

**Tiêu chí nghiệm thu**
- D05 liệt kê theo nhóm; mỗi vật tư hiện số sổ và ô nhập số thực tế; nhập xong hiện chênh lệch ngay, tô vàng nếu lệch ≤ 10%, đỏ nếu hơn.
- Ô bỏ trống = không kiểm, giữ số sổ.
- Chọn lý do chênh lệch cho cả đợt hoặc từng dòng.
- Lưu tạo bản ghi kiểm kê và bản ghi điều chỉnh cho từng vật tư đã đếm; số sổ cũ không bị sửa.
- Syrup, cốt kiểm bằng ml theo vạch bình.

**Ngoại lệ**
- Nhân viên được kiểm kê nhưng bản ghi gắn tên người kiểm; chủ cơ sở thấy ai kiểm trong Lịch sử.
- Lệch quá 30% ở một vật tư: hỏi xác nhận lại trước khi lưu.
- Kiểm kê khi đang có đơn chờ gửi (ngoại tuyến): cảnh báo "có N đơn chưa đồng bộ, số sổ có thể chưa cập nhật".

### D-5 Xem chai đang có theo món
**Mô tả.** Là người đứng bán, tôi muốn biết mỗi món còn bao nhiêu chai và chai nào là tồn hôm qua, để tư vấn khách và ưu tiên bán chai cũ.

**Tiêu chí nghiệm thu**
- D04 hiện tổng: nấu + tồn qua, đã bán, còn lại; từng món: còn, thanh tỉ lệ, "nấu N + tồn qua M · đã bán K".
- Chai tồn qua đêm liệt kê riêng với ngày nấu và nhãn "Bán trong hôm nay".
- Số "còn" là số sổ (tính từ nấu, đơn, chốt ngày), cập nhật theo từng đơn.
- Ô món ở B01 hiện cùng con số này.

**Ngoại lệ**
- Hôm qua chưa chốt: tồn qua lấy theo số sổ, ghi "chưa đếm".
- Bản 1 không theo dõi tuổi từng chai: mọi chai tồn qua đều mang nhãn "Bán trong hôm nay"; chai không bán được thì ghi hủy ở lần chốt ngày.

---

## Nhóm E · Đối chiếu cuối ngày

### E-1 Đếm chai còn, chai tặng, chai hủy
**Mô tả.** Là người đứng bán, tôi muốn nhập số chai còn thật trên quầy cuối ngày, để tìm ra đơn quên ghi và chuyển tồn sang ngày mai.

**Tiêu chí nghiệm thu**
- E01 liệt kê món có chai hôm nay (nấu hoặc tồn qua), mỗi món hiện "Nấu N · đơn ghi K" và nút − + cho số còn, mặc định = số sổ.
- Mục "Chai không bán": tặng, dùng thử **chưa ghi đơn**; hỏng, đổ, hết hạn; mỗi mục nút − +. Chai tặng đã đánh dấu ở B02 không nhập lại ở đây.
- "Tiếp: đếm tiền" sang E02; dữ liệu E01 giữ khi quay lại.

**Ngoại lệ**
- Nhập số còn lớn hơn nấu + tồn qua: báo "nhiều hơn số có thể có", vẫn cho lưu nhưng đánh dấu để xem lại (có thể quên ghi nấu).
- Hôm nay không có đơn và không nấu: E01 hiện "Không có gì để đối chiếu", cho phép chốt ngày trống để giữ chuỗi ngày.

### E-2 Đếm tiền thu được
**Mô tả.** Là người đứng bán, tôi muốn nhập tiền mặt đếm được và tiền chuyển khoản nhận được, để so với tổng tiền theo đơn.

**Tiêu chí nghiệm thu**
- E02 có hai ô lớn: tiền mặt đếm được, chuyển khoản nhận được; dãy nút cộng nhanh 500k, 200k, 100k, 50k, 20k, 10k cộng dồn vào ô tiền mặt.
- Hiện tổng thu thực tế và tổng theo đơn ngay dưới để so.
- Ô để trống được (ví dụ cơ sở không nhận chuyển khoản); trống = 0 và ghi rõ "không nhập".

**Ngoại lệ**
- Nhập chữ hoặc số âm: không nhận.
- Chênh lệch quá 20% tổng đơn: hỏi "bạn có chắc đã đếm hết" trước khi sang E03.

### E-3 Xem kết quả đối chiếu và chốt ngày
**Mô tả.** Là chủ cơ sở, tôi muốn thấy rõ lệch bao nhiêu chai, bao nhiêu tiền và vì sao, rồi khóa ngày lại, để số liệu tháng đáng tin.

**Tiêu chí nghiệm thu**
- E03 theo chai: ra khỏi quầy = nấu + tồn qua − còn; trừ tặng, trừ hủy, trừ đơn ghi; phần "chưa rõ" tô xanh nếu 0, vàng nếu ≤ 2 chai, đỏ nếu hơn.
- Theo tiền: thực tế − theo đơn, quy ra "≈ N chai"; gợi ý nguyên nhân thường gặp; ô lý do tự do.
- Kho syrup: cho nhập ml đo được để điều chỉnh (tùy chọn).
- "Chốt ngày": lưu bản ghi đối chiếu bất biến, chai còn trở thành tồn qua của ngày mai, chai tặng/hủy được ghi, "Việc hôm nay" bỏ dòng chưa đối chiếu. Chênh lệch **không** tự sửa đơn.
- Nếu "chưa rõ" > 0 chai, app đề nghị tạo "đơn bổ sung cuối ngày" theo giá niêm yết để doanh thu không hụt; người dùng chọn có hoặc không.

**Ngoại lệ**
- Chốt lại ngày đã chốt: cho phép, tạo bản ghi mới thay thế bản cũ (giữ cả hai trong Lịch sử), yêu cầu lý do.
- Chốt ngày khi còn đơn chờ gửi: chặn, yêu cầu có mạng để đồng bộ trước.
- Nhân viên chốt ngày: được, nhưng chủ cơ sở nhận thông báo kết quả.

---

## Nhóm F · Báo cáo

### F-1 Xem doanh thu
**Mô tả.** Là chủ cơ sở, tôi muốn xem doanh thu theo ngày, tháng, món, để biết nấu món gì và bao nhiêu.

**Tiêu chí nghiệm thu**
- F01 chọn Hôm nay, tháng này, tháng trước, hoặc khoảng tùy chọn.
- Hiện: doanh thu, so với kỳ trước (%), số chai, trung bình chai/ngày, số ngày bán; biểu đồ cột chai theo ngày, bấm cột xem ngày đó; bảng theo món (chai, tiền, tỉ lệ); chai tặng, chai hủy và tỉ lệ hủy.
- Doanh thu = tổng đơn active không tặng; đơn đảo không tính; đơn bổ sung cuối ngày tính và ghi chú riêng.
- "Xuất Excel" tải file gồm đơn, dòng đơn, chốt ngày của khoảng đã chọn.

**Ngoại lệ**
- Khoảng chưa có dữ liệu: biểu đồ trống với dòng "Chưa có đơn trong khoảng này".
- Nhân viên: chỉ xem Hôm nay; các kỳ khác mờ, ghi "chỉ chủ cơ sở" (bản 1 giới hạn ở giao diện).
- Xuất file khi dữ liệu lớn (> 20.000 dòng): tạo nền, báo khi xong trong F02.

### F-2 Nhận thông báo và email nhắc
**Mô tả.** Là chủ cơ sở, tôi muốn được nhắc đặt hàng, hàng sắp hết hạn và quên chốt ngày, qua app và email, để không phải nhớ.

**Tiêu chí nghiệm thu**
- 06:00 mỗi ngày: quét kho, tạo thông báo "Nên đặt hôm nay: [nhà cung cấp] (N món)" gom theo nhà cung cấp, và "sắp hết hạn" cho vật tư còn ≤ 2 ngày hạn; gửi một email gom cho người bật email.
- 21:00: cơ sở có đơn hôm nay mà chưa chốt → thông báo.
- F02 liệt kê theo ngày, chưa đọc có chấm xanh, bấm mở đúng màn liên quan; "Đã đọc hết".
- Cài đặt: bật/tắt email đặt hàng, nhắc đối chiếu, thông báo đẩy (khi cài PWA).
- Mỗi vật tư mỗi ngày chỉ một thông báo (khóa chống lặp).

**Ngoại lệ**
- Email gửi lỗi (Resend từ chối): thử lại 3 lần cách 10 phút; vẫn lỗi thì ghi vào F02 "chưa gửi được email".
- Vật tư đã bấm "Đã đặt, đang về": không nhắc trong N ngày giao.
- Chuông trên header hiện số chưa đọc của riêng tôi, không phải của cả cơ sở.

### F-3 Xem lịch sử bản ghi
**Mô tả.** Là chủ cơ sở, tôi muốn xem lại mọi lần ghi theo thời gian và lọc theo loại, để tìm ra số nào sai.

**Tiêu chí nghiệm thu**
- F03 gom theo ngày, lọc: Tất cả, Đơn, Nấu, Nhập kho, Kiểm kê, Đối chiếu. Mỗi dòng: loại, tiêu đề, chi tiết ngắn, số tiền nếu có, giờ, người ghi.
- Đơn đảo và đơn gốc đều hiện, đơn gốc có nhãn "đã đảo".
- Tải thêm khi cuộn, 50 dòng một lần.
- Mở từ Tài khoản (G01); không có nút xóa.

**Ngoại lệ**
- Chưa có bản ghi: "Chưa có gì được ghi ở cơ sở này".
- Nhân viên: thấy bản ghi của mọi người trong cơ sở (để đối chiếu ca), nhưng không hoàn tác bản ghi của người khác.

---

## Nhóm S · Hành vi chung (áp dụng mọi màn)

### S-1 Làm việc ngoại tuyến và đồng bộ
**Mô tả.** Là người bán ngoài đường, tôi muốn app vẫn ghi được khi mạng chập chờn, để không mất đơn.

**Tiêu chí nghiệm thu**
- Ghi đơn, ghi nấu, nhập hàng, kiểm kê đều lưu tại máy trước rồi gửi sau; banner vàng hiện số bản ghi chờ.
- Có mạng lại: gửi theo thứ tự, mỗi bản ghi có mã máy duy nhất nên không trùng; xong thì banner tắt.
- Đọc dữ liệu khi ngoại tuyến: hiện bản cuối đã tải kèm "cập nhật lúc HH:MM".

**Ngoại lệ**
- Bản ghi bị máy chủ từ chối (ví dụ bị gỡ khỏi cơ sở): giữ lại trong mục "Chưa gửi được" ở F03, cho xem và bỏ, không tự xóa.
- Hai máy cùng cơ sở ghi cùng lúc: số đơn trong ngày vẫn liên tục (khóa theo cơ sở và ngày ở máy chủ).

### S-2 Phân quyền
**Tiêu chí nghiệm thu**
- `owner`: toàn quyền trong cơ sở của mình. `staff`: ghi đơn, nấu, nhập, kiểm kê, đối chiếu, xem hôm nay; không sửa cài đặt kho, không xem doanh thu kỳ khác, không mời người.
- Admin BaBa: thấy mọi cơ sở, sửa danh mục chung (bản 1 sửa bằng SQL, chưa có màn).
- Mọi kiểm tra quyền thực hiện ở cơ sở dữ liệu; giao diện chỉ ẩn/mờ.

**Ngoại lệ**
- Gọi API với quyền không đủ: trả lỗi 403, app hiện "Bạn không có quyền làm việc này".

### S-3 Thông báo lỗi và trạng thái trống
**Tiêu chí nghiệm thu**
- Lỗi luôn nói ba thứ: chuyện gì, vì sao (nếu biết), làm gì tiếp. Không hiện mã lỗi kỹ thuật cho người dùng (ghi vào log).
- Trạng thái trống luôn có một hành động dẫn đi tiếp (S02, S05).
- Thao tác lưu thành công: chuyển màn hoặc toast ngắn 2 giây, không bắt bấm OK.

---

## Ngoài phạm vi bản 1 (ghi để không ai hỏi lại)
Mức ngọt và hình thức trả tiền theo đơn · ghi đơn bằng giọng nói · phí 1.000 đ/chai và bảng kê · hồ sơ đối tác, thỏa thuận · màn quản trị danh mục cho admin · chi phí vận hành, lợi nhuận · chấm công, lương · bán sỉ, đặt trước · bản máy tính riêng (mọi màn đều dùng được trên máy tính ở dạng co giãn).
