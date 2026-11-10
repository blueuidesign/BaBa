# Test nhanh luồng chính · 10/11/2026

- **Kịch bản:** `BaBa_Kich_ban_test_nhanh.md` bản 2.1 (Project claude.ai)
- **Bản test:** deploy Vercel từ `main` tại commit `8535701`
- **Người test:** Tùng · điện thoại
- **Cơ sở test:** "Xe Thử 1011" (xe lưu động)

## Kết luận

Luồng chính nấu → bán → đối chiếu → chốt ngày chạy trọn, không có bước nào chặn. Còn **1 lỗi** ở màn Nấu (mất số đang nhập khi tắt màn hình) và **4 cải tiến** về thao tác. Bước 20 (tồn qua hiện trên Trang chủ sáng hôm sau) chờ kiểm sáng 11/11.

Lỗi T1110-03 nên sửa trước tiên. Khi đó người nấu mất số đang nhập mà không hay biết, nếu không để ý sẽ bấm "Ghi đã nấu" với số 6 sai, và kho bị trừ sai nguyên liệu.

## Kết quả từng bước

| # | Màn | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| 1 | A01 | Đạt | Đăng nhập bằng link trong email |
| 2 | A03 | Đạt | |
| 3 | D03 | Đạt | Xem T1110-01, T1110-02 |
| 4 | C01 | Đạt | Xem T1110-03, T1110-04 |
| 5–8 | C02, D01, A04 | Đạt | |
| 9–10 | B01, B02 | Đạt | |
| 11 | A04 | Đạt | Xem T1110-05 |
| 12–18 | B01 → F03 | Đạt | |
| 19 | SQL | Đạt | |
| 20 | A04 sáng mai | Chưa chạy | Kiểm sáng 11/11 |

## Vấn đề

| Mã | Loại | Màn | Tóm tắt | Mức | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| T1110-03 | Lỗi | C01 Nấu | Tắt rồi mở màn hình điện thoại, số đang chỉnh tự về 6 | Cao | Mở |
| T1110-04 | Cải tiến | C01 Nấu | Số mặc định là 6, muốn bắt đầu từ 0 | Trung bình | Cần chốt |
| T1110-05 | Cải tiến | A04 Trang chủ | Số tiền đã bán nhỏ, khó thấy | Trung bình | Mở |
| T1110-02 | Cải tiến | D01 Tồn kho | Nhập hàng xong quay lại bị mất vị trí, phải cuộn lại | Thấp | Mở |
| T1110-01 | Cải tiến | D01 Tồn kho | Cơ sở mới nên hiện luôn danh sách vật tư | Thấp | Cần chốt |

Xếp theo mức ảnh hưởng, không theo thứ tự ghi nhận.

---

### T1110-03 · Lỗi · Màn Nấu tự đưa số về 6 khi mở lại màn hình

**Tái hiện.** C01 → chỉnh số chai vài món → tắt màn hình điện thoại một lúc → mở lại. Mọi món về 6.

**Mong đợi.** Số đang chỉnh giữ nguyên (story C-1: "Kế hoạch được lưu nháp… mở lại thấy số đã nhập").

**Nguyên nhân (đã đọc code).** Có hai chỗ cộng lại:

1. Khi điện thoại mở lại, Supabase tự làm mới phiên đăng nhập (token refresh). `onAuthStateChange` trong `src/lib/app.tsx` gọi `setSession`. Việc này kéo theo `reloadOutlets` tải lại danh sách cơ sở, tạo object `outlet` mới, rồi tải lại `catalog`.
2. `src/pages/CookPlan.tsx` có `useEffect` chạy lại mỗi khi `catalog`/`data` đổi. Effect này ghi đè `qty` bằng gợi ý (cơ sở mới chưa có lịch sử nên gợi ý là 6). Kế hoạch chỉ được lưu lên máy chủ khi bấm "Xem nguyên liệu", nên lúc này chưa có bản nháp nào để khôi phục.

**Hướng sửa.**
- C01 chỉ gán số ban đầu **một lần** cho mỗi bộ (cơ sở, loại kế hoạch, ngày). Các lần tải lại sau không đè lên số người dùng đang sửa.
- Lưu nháp tại máy (localStorage theo khóa cơ sở + ngày + loại) mỗi khi bấm − +. Như vậy app bị đóng hẳn cũng không mất.
- Nên sửa thêm ở `app.tsx`: sự kiện `TOKEN_REFRESHED` với cùng user thì không tải lại cơ sở và danh mục. Lỗi này có thể xảy ra ở màn khác có state đang nhập (E01, E02, D03, D05).

**Kiểm tra sau khi sửa.** Lặp lại bước tái hiện ở C01, rồi làm tương tự ở E01/E02 (đang nhập số đếm thì tắt màn hình) và D03.

### T1110-04 · Cải tiến · Màn Nấu bắt đầu từ 0

**Hiện tại.** Cơ sở chưa có lịch sử bán thì mỗi món mặc định 6 chai ("Gợi ý mẫu"). Có lịch sử thì mặc định là trung bình 7 ngày.

**Đề nghị của Tùng.** "Nấu cho hôm nay" để 0, người nấu tự cộng lên.

**Cần chốt.** Story C-1 đang ghi mặc định = trung bình 7 ngày. Có hai cách:
- (a) Mọi trường hợp bắt đầu từ 0. Gợi ý hiện ở dòng chữ nhỏ "TB 7 ngày: N", nút "Lấy theo 7 ngày" điền hết một chạm.
- (b) Chỉ "Nấu cho hôm nay" (nấu thêm giữa buổi) để 0, còn "Nấu cho ngày mai" giữ gợi ý.

Cách (b) hợp lý hơn. Nấu thêm giữa buổi thường chỉ vài món bán chạy, để 0 thì đỡ phải bấm trừ các món không nấu. Còn nấu chính cho ngày mai thì gợi ý giúp đỡ phải nhập lại. Chốt xong thì sửa story C-1.

### T1110-05 · Cải tiến · Số tiền đã bán ở Trang chủ khó thấy

**Hiện tại.** `src/pages/Home.tsx`: số chai là chữ lớn, số tiền nằm trong dòng chữ nhỏ màu nhạt "105.000 · 3 đơn".

**Đề nghị.** Đưa **số tiền** lên làm số chính (chữ lớn), số chai và số đơn xuống dòng nhỏ: "5 chai · 3 đơn". Lý do: cuối ngày Hà cần so tiền trong túi với số trên app, nên tiền là con số được nhìn nhiều nhất. Story A-4 không cần sửa vì đã ghi đủ ba số.

### T1110-02 · Cải tiến · Tồn kho mất vị trí sau khi nhập hàng

**Tái hiện.** D01 → chip Bao bì → Nhãn dán chai → D02 → Nhập hàng → lưu → quay về D01. Màn hình về đầu danh sách, chip về "Tất cả".

**Nguyên nhân.** Chip đang chọn chỉ nằm trong state của `Stock.tsx` (`useState('all')`). Rời trang là mất, vị trí cuộn cũng không được nhớ.

**Hướng sửa.** Đưa chip lên URL (`/kho?nhom=bao_bi`). Khi quay lại thì cuộn tới vật tư vừa nhập (`/kho?nhom=bao_bi&vt=<id>`), làm nổi dòng đó 1–2 giây để người dùng thấy số đã tăng.

### T1110-01 · Cải tiến · Cơ sở mới hiện luôn danh sách vật tư

**Hiện tại.** Kho trống thì D01 chỉ hiện trạng thái trống "Kho chưa có gì" với nút "Nhập hàng lần đầu" (đúng story D-1, màn S05).

**Đề nghị của Tùng.** Hiện luôn danh sách mọi vật tư (số 0), để thấy cần mua những gì và bấm thẳng vào từng món để nhập.

**Cần chốt.** Đổi này sửa story D-1 phần ngoại lệ "Kho trống". Gợi ý: hiện danh sách đầy đủ với số 0, kèm một thẻ nhỏ ở đầu ("Kho mới, nhập lần mua đầu tiên") có nút Nhập hàng và Kiểm kê. Làm vậy vẫn giữ được hành động đi tiếp như S05, mà không che danh sách.
